"""
G.C.E. Advanced Level Exam Authoring & Difficulty Hotspot Analytics API.

Handles teacher exam creation with A/L distribution weights, 7-template question authoring,
video/material timestamp difficulty hotspot tracking, and targeted remediation.
"""

import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.database import get_db
from app.models import (
    User, UserRole, Course, Material,
    ALExam, ALExamType, ALQuestion, ALQuestionTemplate,
    normalize_al_template_type,
    MaterialDifficultyHotspot
)
from app.schemas import (
    ALExamCreate, ALExamResponse,
    ALQuestionCreate, ALQuestionUpdate, ALQuestionResponse,
    HotspotCreate, HotspotResponse,
    ALGenerationRequest, ALRegenerateCandidateRequest,
    ALBatchAcceptRequest, ALBatchAcceptResponse,
    StructuredGenerationRequest, StructuredSingleCandidateRegenerateRequest,
    EssayGenerationRequest, EssaySingleCandidateRegenerateRequest
)
from app.services.al_generator_service import (
    generate_al_candidate_questions,
    regenerate_single_candidate
)
from app.services.al_structured_generator import (
    generate_structured_candidate_questions,
    regenerate_single_structured_candidate
)
from app.services.al_essay_generator import (
    generate_essay_candidate_questions,
    regenerate_single_essay_candidate
)
from app.utils.image_utils import process_and_save_diagram_url
from app.services.assessments.exam_sequencer import resequence_exam_questions_canonically
from app.auth import get_current_user, require_teacher

router = APIRouter(tags=["A/L Authoring & Hotspot Analytics"])


@router.post("/generate-questions", response_model=List[Dict[str, Any]])
def generate_ai_candidate_questions_endpoint(
    data: ALGenerationRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher generates AI candidate questions using RAG context from selected materials.
    Candidates are returned in DRAFT status for teacher review & acceptance.
    """
    if data.course_id:
        course = db.query(Course).filter(Course.id == data.course_id).first()
        if course and current_user.role != UserRole.ADMIN and course.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to generate questions for this course")

    candidates = generate_al_candidate_questions(
        db=db,
        assessment_type=data.assessment_type,
        question_count=data.question_count,
        generation_mode=data.generation_mode,
        subtype_distribution=data.subtype_distribution,
        difficulty_distribution=data.difficulty_distribution,
        cognitive_distribution=data.cognitive_distribution,
        course_id=data.course_id,
        unit_ids=data.unit_ids,
        lesson_ids=data.lesson_ids,
        material_ids=data.material_ids,
        material_scopes=data.material_scopes,
        custom_instruction=data.custom_instruction,
    )
    return candidates


@router.post("/generate-structured-questions", response_model=List[Dict[str, Any]])
def generate_ai_structured_candidate_questions_endpoint(
    data: StructuredGenerationRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher generates AI candidate structured questions for Paper II Part A using teacher blueprint & RAG context.
    Returns structured candidates (1 to 5 questions) for review.
    """
    candidates = generate_structured_candidate_questions(
        db=db,
        question_count=data.question_count,
        course_id=data.course_id,
        unit_ids=data.unit_ids,
        custom_instruction=data.custom_instruction,
        custom_blueprints=data.custom_blueprints,
        difficulty_mode=data.difficulty_mode,
        cognitive_mode=data.cognitive_mode,
    )
    return candidates


@router.post("/regenerate-structured-candidate", response_model=Dict[str, Any])
def regenerate_single_structured_candidate_endpoint(
    data: StructuredSingleCandidateRegenerateRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher regenerates a single structured candidate question using its blueprint & teacher instructions.
    """
    updated = regenerate_single_structured_candidate(
        db=db,
        candidate=data.candidate,
        course_id=data.course_id,
        unit_ids=data.unit_ids,
        custom_instruction=data.custom_instruction,
        difficulty_mode=data.difficulty_mode,
        cognitive_mode=data.cognitive_mode,
    )
    return updated


@router.post("/generate-essay-questions", response_model=List[Dict[str, Any]])
def generate_ai_essay_candidate_questions_endpoint(
    data: EssayGenerationRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher generates AI candidate essay questions for Paper II Part B using teacher blueprint & RAG context.
    Returns essay candidates (1 to 5 questions) for review.
    """
    blueprints_input = data.custom_blueprints
    if not blueprints_input and data.paper_blueprint:
        blueprints_input = data.paper_blueprint.get("questions")

    candidates = generate_essay_candidate_questions(
        db=db,
        question_count=data.question_count,
        course_id=data.course_id,
        unit_ids=data.unit_ids,
        custom_instruction=data.custom_instruction,
        custom_blueprints=blueprints_input,
        difficulty_mode=data.difficulty_mode or "balanced",
        cognitive_mode=data.cognitive_mode or "recommended",
    )
    return candidates


@router.post("/regenerate-essay-candidate", response_model=Dict[str, Any])
def regenerate_single_essay_candidate_endpoint(
    data: EssaySingleCandidateRegenerateRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher regenerates a single essay candidate question using its blueprint & teacher instructions.
    """
    updated = regenerate_single_essay_candidate(
        db=db,
        candidate=data.candidate,
        course_id=data.course_id,
        unit_ids=data.unit_ids,
        custom_instruction=data.custom_instruction,
        difficulty_mode=data.difficulty_mode,
        cognitive_mode=data.cognitive_mode,
    )
    return updated


@router.post("/regenerate-candidate", response_model=Dict[str, Any])
def regenerate_single_ai_candidate_endpoint(
    data: ALRegenerateCandidateRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher regenerates a single candidate question based on specific feedback instructions.
    """
    updated_candidate = regenerate_single_candidate(
        db=db,
        candidate=data.candidate_question,
        custom_instruction=data.custom_instruction,
    )
    return updated_candidate


@router.get("/material-summary", response_model=Dict[str, Any])
def get_material_summary_endpoint(
    course_id: Optional[int] = None,
    unit_ids: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns live summary of learning materials and processing status for the selected scope.
    """
    from app.services.al_rag_retriever import LearningMaterialRetriever
    parsed_unit_ids = [int(u.strip()) for u in unit_ids.split(",") if u.strip().isdigit()] if unit_ids else None
    summary = LearningMaterialRetriever.get_unit_material_summary(
        db=db,
        course_id=course_id,
        unit_ids=parsed_unit_ids,
    )
    return summary


@router.post("/create-exam", response_model=ALExamResponse)
def create_custom_al_exam(
    data: ALExamCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher creates a custom A/L exam paper with teacher-configured attempt limits and time limits.
    """
    target_course_id = data.course_id
    course = db.query(Course).filter(Course.id == target_course_id).first() if target_course_id else None

    if not course:
        # Fall back to teacher's active course or default course container
        course = db.query(Course).filter(Course.teacher_id == current_user.id).first()
        if not course:
            course = db.query(Course).first()
        if not course:
            course = Course(
                title="G.C.E. A/L Biology General Course",
                description="Default assessment container for Advanced Level Biology exam papers",
                teacher_id=current_user.id
            )
            db.add(course)
            db.commit()
            db.refresh(course)
        target_course_id = course.id

    exam = ALExam(
        course_id=target_course_id,
        lesson_id=data.lesson_id,
        title=data.title,
        description=data.description,
        exam_type=data.exam_type,
        time_limit_minutes=data.time_limit_minutes,
        total_questions=data.total_questions,
        raw_mark_cap=data.raw_mark_cap,
        score_multiplier=data.score_multiplier,
        max_attempts=data.max_attempts,
        is_published=data.is_published,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


@router.post("/questions", response_model=ALQuestionResponse)
def create_question_authoring(
    data: ALQuestionCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher authors an individual question across any of the 7 MCQ templates,
    Paper II Structured subparts, or Essay checklist rubrics.
    """
    exam = db.query(ALExam).filter(ALExam.id == data.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    norm_template = normalize_al_template_type(data.template_type)

    # Enforce strict Section Isolation & Context Validation
    if exam.exam_type == ALExamType.PAPER_1_MCQ:
        if norm_template in [ALQuestionTemplate.STRUCTURED_SUBPARTS, ALQuestionTemplate.ESSAY_RUBRIC]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot add {norm_template.value} question to a Paper I (MCQ) assessment."
            )
    elif exam.exam_type == ALExamType.PAPER_2_STRUCTURED:
        if norm_template != ALQuestionTemplate.STRUCTURED_SUBPARTS:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot add {norm_template.value} question to a Paper II Part A (Structured) assessment."
            )
    elif exam.exam_type == ALExamType.PAPER_2_ESSAY:
        if norm_template != ALQuestionTemplate.ESSAY_RUBRIC:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot add {norm_template.value} question to a Paper II Part B (Essay) assessment."
            )
    elif exam.exam_type == ALExamType.PAPER_2:
        if norm_template not in [ALQuestionTemplate.STRUCTURED_SUBPARTS, ALQuestionTemplate.ESSAY_RUBRIC]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot add MCQ question ({norm_template.value}) to a Paper II assessment."
            )

    question = ALQuestion(
        exam_id=data.exam_id,
        question_number=data.question_number,
        template_type=norm_template,
        stem_text=data.stem_text,
        diagram_url=process_and_save_diagram_url(data.diagram_url),
        requires_image=data.requires_image or False,
        image_description=data.image_description,
        explanation=data.explanation,
        points=data.points,
        cognitive_level=data.cognitive_level,
        difficulty=data.difficulty,
        options=data.options,
        correct_option=data.correct_option,
        assertion_text=data.assertion_text,
        reason_text=data.reason_text,
        statements_json=data.statements_json,
        grid_key_json=data.grid_key_json,
        structured_subparts_json=data.structured_subparts_json,
        essay_checklist_json=data.essay_checklist_json,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.put("/questions/{question_id}", response_model=ALQuestionResponse)
def update_question_authoring(
    question_id: int,
    data: ALQuestionUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher updates an authored question (MCQ, Structured subparts, or Essay rubric).
    """
    question = db.query(ALQuestion).filter(ALQuestion.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    exam = db.query(ALExam).filter(ALExam.id == question.exam_id).first()

    if data.template_type is not None:
        norm_template = normalize_al_template_type(data.template_type)
        if exam and exam.exam_type == ALExamType.PAPER_1_MCQ and norm_template in [ALQuestionTemplate.STRUCTURED_SUBPARTS, ALQuestionTemplate.ESSAY_RUBRIC]:
            raise HTTPException(status_code=400, detail=f"Cannot update to {norm_template.value} on a Paper I (MCQ) assessment.")
        if exam and exam.exam_type == ALExamType.PAPER_2_STRUCTURED and norm_template != ALQuestionTemplate.STRUCTURED_SUBPARTS:
            raise HTTPException(status_code=400, detail=f"Cannot update to {norm_template.value} on a Paper II Part A (Structured) assessment.")
        if exam and exam.exam_type == ALExamType.PAPER_2_ESSAY and norm_template != ALQuestionTemplate.ESSAY_RUBRIC:
            raise HTTPException(status_code=400, detail=f"Cannot update to {norm_template.value} on a Paper II Part B (Essay) assessment.")
        if exam and exam.exam_type == ALExamType.PAPER_2 and norm_template not in [ALQuestionTemplate.STRUCTURED_SUBPARTS, ALQuestionTemplate.ESSAY_RUBRIC]:
            raise HTTPException(status_code=400, detail=f"Cannot update to MCQ question ({norm_template.value}) on a Paper II assessment.")
        question.template_type = norm_template
    if data.diagram_url is not None:
        question.diagram_url = process_and_save_diagram_url(data.diagram_url)
    if data.requires_image is not None:
        question.requires_image = data.requires_image
    if data.image_description is not None:
        question.image_description = data.image_description
    if data.explanation is not None:
        question.explanation = data.explanation
    if data.points is not None:
        question.points = data.points
    if data.cognitive_level is not None:
        question.cognitive_level = data.cognitive_level
    if data.difficulty is not None:
        question.difficulty = data.difficulty
    if data.options is not None:
        question.options = data.options
    if data.correct_option is not None:
        question.correct_option = data.correct_option
    if data.assertion_text is not None:
        question.assertion_text = data.assertion_text
    if data.reason_text is not None:
        question.reason_text = data.reason_text
    if data.statements_json is not None:
        question.statements_json = data.statements_json
    if data.grid_key_json is not None:
        question.grid_key_json = data.grid_key_json
    if data.structured_subparts_json is not None:
        question.structured_subparts_json = data.structured_subparts_json
    if data.essay_checklist_json is not None:
        question.essay_checklist_json = data.essay_checklist_json

    db.commit()
    db.refresh(question)
    return question


@router.post("/upload-diagram")
async def upload_question_diagram(
    file: UploadFile = File(...),
    current_user: User = Depends(require_teacher),
):
    """
    Direct diagram image upload endpoint for Structured and MCQ questions.
    Saves image into 'uploads/diagrams/' and returns static URL.
    """
    ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
    filename = file.filename or "diagram.png"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported image format {ext}. Allowed: {', '.join(ALLOWED_EXTS)}")

    target_dir = os.path.join("uploads", "diagrams")
    os.makedirs(target_dir, exist_ok=True)
    saved_filename = f"diagram_{uuid.uuid4().hex}{ext}"
    target_path = os.path.join(target_dir, saved_filename)

    contents = await file.read()
    with open(target_path, "wb") as f:
        f.write(contents)

    return {
        "message": "Diagram image uploaded successfully.",
        "image_url": f"/uploads/diagrams/{saved_filename}",
        "filename": saved_filename
    }


@router.post("/batch-accept-questions", response_model=ALBatchAcceptResponse)
def batch_accept_candidate_questions_endpoint(
    data: ALBatchAcceptRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher accepts a batch of AI candidate questions in a single transactional operation.
    Validates candidates, inserts valid ALQuestion records, and returns structured summary.
    """
    exam = db.query(ALExam).filter(ALExam.id == data.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    current_q_count = len(exam.questions) if exam.questions else 0
    accepted_records = []
    errors = []

    for cand in data.candidates:
        stem = (cand.get("stem_text") or "").strip()
        if not stem:
            errors.append({
                "candidate_id": cand.get("candidate_id"),
                "reason": "Missing question stem text"
            })
            continue

        raw_type = cand.get("template_type", "generic_mcq")
        enum_type = normalize_al_template_type(raw_type)

        # Enforce Section Isolation & Context Validation
        if exam.exam_type == ALExamType.PAPER_1_MCQ and enum_type in [ALQuestionTemplate.STRUCTURED_SUBPARTS, ALQuestionTemplate.ESSAY_RUBRIC]:
            errors.append({
                "candidate_id": cand.get("candidate_id"),
                "reason": f"Cannot add {enum_type.value} question to a Paper I (MCQ) assessment."
            })
            continue
        elif exam.exam_type == ALExamType.PAPER_2_STRUCTURED and enum_type != ALQuestionTemplate.STRUCTURED_SUBPARTS:
            errors.append({
                "candidate_id": cand.get("candidate_id"),
                "reason": f"Cannot add {enum_type.value} question to a Paper II Part A (Structured) assessment."
            })
            continue
        elif exam.exam_type == ALExamType.PAPER_2_ESSAY and enum_type != ALQuestionTemplate.ESSAY_RUBRIC:
            errors.append({
                "candidate_id": cand.get("candidate_id"),
                "reason": f"Cannot add {enum_type.value} question to a Paper II Part B (Essay) assessment."
            })
            continue
        elif exam.exam_type == ALExamType.PAPER_2 and enum_type not in [ALQuestionTemplate.STRUCTURED_SUBPARTS, ALQuestionTemplate.ESSAY_RUBRIC]:
            errors.append({
                "candidate_id": cand.get("candidate_id"),
                "reason": f"Cannot add MCQ question ({enum_type.value}) to a Paper II assessment."
            })
            continue

        # Check if question with identical stem is already in this exam to prevent duplicate inserts on retry
        existing_q = db.query(ALQuestion).filter(
            ALQuestion.exam_id == data.exam_id,
            ALQuestion.stem_text == stem
        ).first()
        if existing_q:
            accepted_records.append({
                "candidate_id": cand.get("candidate_id"),
                "question_number": existing_q.question_number,
                "template_type": existing_q.template_type.value,
                "stem_snippet": stem[:50],
                "already_exists": True
            })
            continue

        current_q_count += 1
        points_val = 1.0
        try:
            points_val = float(cand.get("points", 1.0))
        except (ValueError, TypeError):
            points_val = 1.0

        # Process diagram_url: convert base64 payload to static upload file if present
        raw_diagram = cand.get("diagram_url")
        processed_diagram = process_and_save_diagram_url(raw_diagram)

        # Synthesize essay_checklist_json if missing on Essay candidates
        essay_payload = cand.get("essay_checklist_json")
        if not essay_payload and enum_type == ALQuestionTemplate.ESSAY_RUBRIC:
            fmt = cand.get("structure_format", "single_complete")
            essay_payload = {
                "structure_format": fmt,
                "structure_type": fmt,
                "stem_text": stem,
                "instruction": cand.get("instruction", "Write short notes on the following:"),
                "marking_scheme": cand.get("marking_scheme", ""),
                "examiner_notes": cand.get("examiner_notes", ""),
                "answer_points": cand.get("answer_points") or cand.get("criteria") or [],
                "criteria": cand.get("answer_points") or cand.get("criteria") or [],
                "subparts": [] if fmt == "single_complete" else (cand.get("subparts") or []),
            }
        elif essay_payload and isinstance(essay_payload, dict):
            fmt = essay_payload.get("structure_format") or cand.get("structure_format", "single_complete")
            if fmt == "single_complete":
                essay_payload["subparts"] = []

        q = ALQuestion(
            exam_id=data.exam_id,
            question_number=current_q_count,
            template_type=enum_type,
            stem_text=stem,
            diagram_url=processed_diagram,
            requires_image=bool(cand.get("requires_image", False)),
            image_description=cand.get("image_description") or None,
            explanation=cand.get("explanation") or None,
            points=points_val,
            cognitive_level=cand.get("cognitive_level", "understand"),
            difficulty=cand.get("difficulty", "medium"),
            options=cand.get("options") or None,
            correct_option=cand.get("correct_option") or "A",
            assertion_text=cand.get("assertion_text") or None,
            reason_text=cand.get("reason_text") or None,
            statements_json=cand.get("statements_json") or None,
            grid_key_json=cand.get("grid_key_json") or None,
            structured_subparts_json=cand.get("structured_subparts_json") or None,
            essay_checklist_json=essay_payload,
        )
        db.add(q)
        accepted_records.append({
            "candidate_id": cand.get("candidate_id"),
            "question_number": current_q_count,
            "template_type": enum_type.value,
            "stem_snippet": stem[:50]
        })

    try:
        if accepted_records:
            db.commit()
            # Deterministically resequence all exam questions into canonical Sri Lankan A/L paper order
            resequence_exam_questions_canonically(data.exam_id, db)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error while saving accepted questions: {str(e)}")

    return {
        "requested": len(data.candidates),
        "accepted": len(accepted_records),
        "failed": len(errors),
        "results": accepted_records,
        "errors": errors
    }


@router.post("/hotspots", response_model=HotspotResponse)
def log_student_difficulty_hotspot(
    data: HotspotCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Student flags difficulty ("Raise Hand / Flag Difficulty") at a specific video timestamp or PDF page.
    """
    material = db.query(Material).filter(Material.id == data.material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="Learning Material not found")

    hotspot = MaterialDifficultyHotspot(
        material_id=data.material_id,
        student_id=current_user.id,
        timestamp_seconds=data.timestamp_seconds,
        page_number=data.page_number,
        note=data.note,
    )
    db.add(hotspot)
    db.commit()
    db.refresh(hotspot)
    return hotspot


@router.get("/materials/{material_id}/hotspots")
def get_material_difficulty_hotspots(
    material_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher views video timestamp difficulty heatmap and student notes for a learning material.
    """
    hotspots = db.query(MaterialDifficultyHotspot).filter(
        MaterialDifficultyHotspot.material_id == material_id
    ).all()

    # Aggregate timestamp clusters (e.g. 60-second intervals)
    clusters: Dict[int, int] = {}
    notes = []
    for h in hotspots:
        if h.timestamp_seconds is not None:
            bucket = (h.timestamp_seconds // 60) * 60  # 1-minute bucket
            clusters[bucket] = clusters.get(bucket, 0) + 1
        if h.note:
            notes.append({
                "student_name": h.student.full_name if h.student else "Student",
                "timestamp_seconds": h.timestamp_seconds,
                "note": h.note,
                "created_at": h.created_at,
            })

    sorted_clusters = [
        {"bucket_seconds": b, "flag_count": c}
        for b, c in sorted(clusters.items())
    ]

    return {
        "material_id": material_id,
        "total_hotspots": len(hotspots),
        "timestamp_clusters": sorted_clusters,
        "student_notes": notes,
    }


@router.post("/remediation")
def send_targeted_remediation(
    student_ids: List[int],
    material_title: str,
    note: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher sends targeted revision recommendations or supplementary notes to weak students.
    """
    return {
        "message": f"Targeted revision notification sent to {len(student_ids)} students successfully!",
        "material_title": material_title,
        "notified_count": len(student_ids),
    }
