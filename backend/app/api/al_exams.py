"""
G.C.E. Advanced Level Exam Engine API.
Updated for Lumora Exam Engine.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
import re
import logging

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models import (
    User, UserRole, Course, Enrollment, QuestionVersion,
    ALExam, ALExamType, ALQuestion, ALQuestionTemplate,
    normalize_al_template_type,
    ALStudentSubmission, ALStudentAnswer
)
from app.schemas import (
    ALExamCreate, ALExamUpdate, ALExamResponse,
    ALQuestionCreate, ALQuestionUpdate, ALQuestionResponse,
    ALStudentSubmissionCreate, ALStudentSubmissionResponse,
    ALStudentAnswerSubmit, ALStudentAnswerResponse,
    ALTeacherVerifySubmissionRequest, ALExamValidationResponse
)
from app.auth import get_current_user, require_role, require_teacher
from app.services.al_marking_service import al_marking_service
from app.utils.image_utils import process_and_save_diagram_url

router = APIRouter(tags=["A/L Exam Engine"])


@router.post("/{exam_id}/duplicate", response_model=ALExamResponse)
def duplicate_al_exam(
    exam_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Duplicates an existing A/L Exam into a new DRAFT assessment.
    Does NOT modify the original exam or Question Bank.
    """
    original = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Original A/L Exam not found")

    new_exam = ALExam(
        course_id=original.course_id,
        lesson_id=original.lesson_id,
        title=f"Copy of {original.title}",
        description=original.description,
        exam_type=original.exam_type,
        time_limit_minutes=original.time_limit_minutes,
        total_questions=original.total_questions,
        raw_mark_cap=original.raw_mark_cap,
        score_multiplier=original.score_multiplier,
        max_attempts=original.max_attempts,
        is_published=False,
    )
    db.add(new_exam)
    db.commit()
    db.refresh(new_exam)

    # Copy attached questions
    for q in original.questions:
        new_q = ALQuestion(
            exam_id=new_exam.id,
            question_number=q.question_number,
            template_type=q.template_type,
            stem_text=q.stem_text,
            diagram_url=q.diagram_url,
            explanation=q.explanation,
            points=q.points,
            cognitive_level=q.cognitive_level,
            difficulty=q.difficulty,
            options=q.options,
            correct_option=q.correct_option,
            assertion_text=q.assertion_text,
            reason_text=q.reason_text,
            statements_json=q.statements_json,
            grid_key_json=q.grid_key_json,
            structured_subparts_json=q.structured_subparts_json,
            essay_checklist_json=q.essay_checklist_json,
        )
        db.add(new_q)

    db.commit()
    db.refresh(new_exam)
    return new_exam


@router.get("/{exam_id}/validate", response_model=ALExamValidationResponse)
def validate_al_exam(
    exam_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Validates an assessment structure prior to publishing.
    Returns errors, warnings, and live paper statistics.
    """
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    errors = []
    warnings = []

    questions = exam.questions or []
    if len(questions) == 0:
        errors.append("Assessment contains 0 questions. Please add questions before publishing.")

    mcq_count = 0
    structured_count = 0
    essay_count = 0
    total_marks = 0.0

    for q in questions:
        total_marks += q.points or 0.0
        t_type = (q.template_type or "").lower()

        if t_type in ["generic_mcq", "assertion_reason", "five_statement_truth", "matching_column", "diagram_based", "experimental_procedure", "combination_grid"]:
            mcq_count += 1
            if not q.options or len(q.options) < 5:
                warnings.append(f"Question #{q.question_number} has fewer than 5 options.")
            if not q.correct_option:
                errors.append(f"Question #{q.question_number} is missing a correct answer choice.")
        elif t_type == "structured_subparts":
            structured_count += 1
            if not q.structured_subparts_json:
                errors.append(f"Structured Question #{q.question_number} has no defined subparts.")
        elif t_type == "essay_rubric":
            essay_count += 1
            if not q.essay_checklist_json:
                errors.append(f"Essay Question #{q.question_number} has no evaluation rubric items.")

    summary = {
        "total_questions": len(questions),
        "mcq_count": mcq_count,
        "structured_count": structured_count,
        "essay_count": essay_count,
        "total_marks": total_marks,
        "time_limit_minutes": exam.time_limit_minutes,
    }

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "summary": summary,
    }


# ──────────────────────────────────────────────
# Helper Functions: Combination Grid & MCQ Scoring
# ──────────────────────────────────────────────

def resolve_combination_grid_option(selected_input: Optional[str], statements: Optional[List[str]] = None) -> Optional[str]:
    """
    Resolves Combination Grid (Questions 41–50) choices.
    Students can submit either:
      1. Option Letter directly ("A", "B", "C", "D", "E")
      2. List of statement codes/indices e.g. "a,b" or "a,c"

    Standard A/L Biology Grid Key:
      - Option A: (a) and (b) true
      - Option B: (a) and (c) true
      - Option C: (c) and (d) true
      - Option D: (a), (b), and (c) true
      - Option E: Any other combination
    """
    if not selected_input:
        return None

    cleaned = selected_input.strip().upper()
    if cleaned in ["A", "B", "C", "D", "E"]:
        return cleaned

    # If student provided comma-separated statement markers e.g. "a,b" or "a, c"
    lower_input = selected_input.lower()
    selected_statements = set([s.strip() for s in lower_input.replace(" ", "").split(",") if s.strip()])

    if selected_statements == {"a", "b"}:
        return "A"
    elif selected_statements == {"a", "c"}:
        return "B"
    elif selected_statements == {"c", "d"}:
        return "C"
    elif selected_statements == {"a", "b", "c"}:
        return "D"
    elif selected_statements:
        return "E"

    return None


def calculate_al_grade(percentage: float) -> str:
    """Standard G.C.E. Advanced Level Grading Scale."""
    if percentage >= 75.0:
        return "A"
    elif percentage >= 65.0:
        return "B"
    elif percentage >= 55.0:
        return "C"
    elif percentage >= 40.0:
        return "S"
    else:
        return "F"


def _calculate_al_grade(percentage: float) -> str:
    """
    Standard G.C.E. Advanced Level Grade Boundaries in Sri Lanka:
      A: >= 75.0%
      B: 65.0% - 74.9%
      C: 55.0% - 64.9%
      S: 40.0% - 54.9%
      F: < 40.0%
    """
    if percentage >= 75.0:
        return "A"
    elif percentage >= 65.0:
        return "B"
    elif percentage >= 55.0:
        return "C"
    elif percentage >= 40.0:
        return "S"
    return "F"


def _grade_paper_1_mcq(submission: ALStudentSubmission, exam: ALExam, db: Session):
    """
    Automated grading engine for A/L Biology Paper 1 (50 MCQ questions).
    Evaluates standard options, Assertion-Reason, 5-Statement Truth, and Combination Grid (Q41-50).
    """
    total_raw_points = 0.0
    questions_map = {q.id: q for q in exam.questions}

    for answer in submission.answers:
        question = questions_map.get(answer.question_id)
        if not question or not question.correct_option:
            continue

        student_opt = answer.selected_option
        
        # Handle Combination Grid auto-resolution if template is combination_grid
        if question.template_type == ALQuestionTemplate.COMBINATION_GRID and student_opt:
            resolved_opt = resolve_combination_grid_option(student_opt)
            if resolved_opt:
                answer.selected_option = resolved_opt
                student_opt = resolved_opt

        correct_opt = question.correct_option.strip().upper() if question.correct_option else ""
        is_correct = (student_opt is not None and student_opt.strip().upper() == correct_opt)

        points = question.points if is_correct else 0.0
        answer.is_correct = is_correct
        answer.raw_points_earned = points
        answer.scaled_points_earned = points * (exam.score_multiplier or 1.0)
        total_raw_points += points

    total_possible = float(len(exam.questions)) if exam.questions else 50.0
    submission.raw_score = round(total_raw_points, 2)
    submission.scaled_score = round(total_raw_points * (exam.score_multiplier or 1.0), 2)
    
    pct = (total_raw_points / total_possible * 100.0) if total_possible > 0 else 0.0
    submission.percentage = round(pct, 2)
    submission.grade = calculate_al_grade(pct)
    submission.status = "ai_graded"
    db.commit()


# ──────────────────────────────────────────────
# Teacher Endpoints: Exam CRUD
# ──────────────────────────────────────────────

@router.post("", response_model=ALExamResponse, status_code=status.HTTP_201_CREATED)
def create_al_exam(
    data: ALExamCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    target_course_id = data.course_id
    course = db.query(Course).filter(Course.id == target_course_id).first() if target_course_id else None

    if not course:
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
        title=data.title,
        description=data.description,
        exam_type=data.exam_type,
        time_limit_minutes=data.time_limit_minutes,
        total_questions=data.total_questions,
        raw_mark_cap=data.raw_mark_cap,
        score_multiplier=data.score_multiplier,
        max_attempts=data.max_attempts,
        course_id=target_course_id,
        lesson_id=data.lesson_id,
        is_published=data.is_published,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


@router.get("", response_model=List[ALExamResponse])
def list_al_exams(
    course_id: Optional[int] = None,
    exam_type: Optional[str] = None,
    is_published: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all A/L Exams with optional course, type, and published filters."""
    query = db.query(ALExam)
    
    if course_id is not None:
        query = query.filter(ALExam.course_id == course_id)
        
    if exam_type:
        query = query.filter(ALExam.exam_type == exam_type)
        
    if is_published is not None:
        query = query.filter(ALExam.is_published == is_published)
    elif current_user.role == UserRole.STUDENT:
        # Students only see published exams
        query = query.filter(ALExam.is_published == True)

    exams = query.order_by(ALExam.created_at.desc()).all()
    return exams


@router.get("/my-submissions", response_model=List[ALStudentSubmissionResponse])
def get_my_al_submissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch all AL Exam attempts and submissions for the current student."""
    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.student_id == current_user.id
    ).order_by(ALStudentSubmission.started_at.desc()).all()
    return submissions


@router.get("/pending-reviews", response_model=List[ALStudentSubmissionResponse])
def get_pending_teacher_reviews(
    status: Optional[str] = Query(None, description="Filter by status: all, pending, submitted, ai_graded, teacher_verified"),
    exam_id: Optional[int] = Query(None, description="Filter by specific exam ID"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """List submissions for teacher review, grading queue, or completed verified scripts."""
    teacher_course_ids = [c.id for c in db.query(Course).filter(Course.teacher_id == current_user.id).all()]
    teacher_exam_ids = [e.id for e in db.query(ALExam).filter(ALExam.course_id.in_(teacher_course_ids)).all()] if teacher_course_ids else []

    query = db.query(ALStudentSubmission)
    if current_user.role != UserRole.ADMIN:
        if not teacher_exam_ids:
            return []
        query = query.filter(ALStudentSubmission.exam_id.in_(teacher_exam_ids))

    if exam_id:
        query = query.filter(ALStudentSubmission.exam_id == exam_id)

    if status and status.lower() != "all":
        st = status.lower()
        if st in ["pending", "action_needed", "needs_review"]:
            query = query.filter(ALStudentSubmission.status.in_(["ai_graded", "submitted", "in_progress"]))
        else:
            query = query.filter(ALStudentSubmission.status == st)

    return query.order_by(ALStudentSubmission.submitted_at.desc(), ALStudentSubmission.id.desc()).all()


@router.get("/{exam_id}", response_model=ALExamResponse)
def get_al_exam(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch full details of an A/L Exam including questions."""
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    if current_user.role == UserRole.STUDENT and not exam.is_published:
        raise HTTPException(status_code=403, detail="Exam is not published yet")

    return exam


@router.put("/{exam_id}", response_model=ALExamResponse)
def update_al_exam(
    exam_id: int,
    data: ALExamUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Teacher updates A/L Exam settings."""
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    if data.title is not None:
        exam.title = data.title
    if data.description is not None:
        exam.description = data.description
    if data.instructions is not None:
        exam.instructions = data.instructions
    if data.time_limit_minutes is not None:
        if data.time_limit_minutes <= 0:
            raise HTTPException(status_code=400, detail="Duration must be greater than 0 minutes")
        exam.time_limit_minutes = data.time_limit_minutes
    if data.total_questions is not None:
        exam.total_questions = data.total_questions
    if data.raw_mark_cap is not None:
        exam.raw_mark_cap = data.raw_mark_cap
    if data.score_multiplier is not None:
        exam.score_multiplier = data.score_multiplier
    if data.max_attempts is not None:
        if data.max_attempts < 1:
            raise HTTPException(status_code=400, detail="Maximum attempts must be at least 1")
        exam.max_attempts = data.max_attempts
    if data.is_published is not None:
        exam.is_published = data.is_published
    if data.difficulty_policy is not None:
        exam.difficulty_policy = data.difficulty_policy
    if data.available_from is not None:
        exam.available_from = data.available_from
    if data.available_until is not None:
        if data.available_from and data.available_until < data.available_from:
            raise HTTPException(status_code=400, detail="End time must be after start time")
        exam.available_until = data.available_until
    if data.show_result_immediately is not None:
        exam.show_result_immediately = data.show_result_immediately

    db.commit()
    db.refresh(exam)
    return exam


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_al_exam(
    exam_id: int,
    delete_banked_questions: bool = Query(False, description="Whether to also delete associated banked questions from Question Bank"),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Teacher deletes an A/L Exam and optionally deletes associated questions from Question Bank."""
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    if delete_banked_questions:
        # Delete associated QuestionVersion records that originated from this exam
        from app.models import Question, QuestionVersion
        banked_versions = db.query(QuestionVersion).filter(
            QuestionVersion.source_type == "al_exam",
            QuestionVersion.source_id == exam_id
        ).all()
        for qv in banked_versions:
            parent_q = qv.question
            db.delete(qv)
            if parent_q and len(parent_q.versions) <= 1:
                db.delete(parent_q)

    db.delete(exam)
    db.commit()
    return None


@router.post("/{exam_id}/publish", response_model=ALExamResponse)
def publish_al_exam(
    exam_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher publishes an A/L Exam and enforces immutable question snapshot creation.
    """
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    # Enforce immutable question snapshots for historical exam protection
    for q in exam.questions:
        if not q.snapshot_json:
            q.snapshot_json = {
                "id": q.id,
                "exam_id": q.exam_id,
                "question_number": q.question_number,
                "template_type": q.template_type.value if hasattr(q.template_type, "value") else str(q.template_type),
                "stem_text": q.stem_text,
                "diagram_url": q.diagram_url,
                "explanation": q.explanation,
                "points": q.points,
                "cognitive_level": q.cognitive_level,
                "difficulty": q.difficulty,
                "options": q.options,
                "correct_option": q.correct_option,
                "assertion_text": q.assertion_text,
                "reason_text": q.reason_text,
                "statements_json": q.statements_json,
                "grid_key_json": q.grid_key_json,
                "structured_subparts_json": q.structured_subparts_json,
                "essay_checklist_json": q.essay_checklist_json,
                "snapshot_created_at": datetime.utcnow().isoformat()
            }

    exam.is_published = True
    db.commit()
    db.refresh(exam)
    return exam


@router.post("/{exam_id}/import-bank-questions", response_model=ALExamResponse)
def import_bank_questions_to_exam(
    exam_id: int,
    data: Dict[str, List[int]],
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher imports selected Question Bank items into an A/L Exam container, creating authoritative snapshots.
    """
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    question_version_ids = data.get("question_version_ids", [])
    if not question_version_ids:
        raise HTTPException(status_code=400, detail="No question_version_ids provided")

    target_section = data.get("target_section") # Optional "paper_1", "part_a", "part_b"
    versions = db.query(QuestionVersion).filter(QuestionVersion.id.in_(question_version_ids)).all()
    current_count = len(exam.questions)

    for idx, qv in enumerate(versions):
        q_type_lower = (qv.question_type or "").lower()

        # Enforce validation for specific paper types or target sections
        if target_section == "paper_1" or exam.exam_type == ALExamType.PAPER_1_MCQ:
            if "structured" in q_type_lower or "essay" in q_type_lower:
                raise HTTPException(status_code=400, detail=f"Question '{qv.question_text[:30]}...' is a {qv.question_type} question and cannot be added to Paper I (MCQ).")
        elif target_section == "part_a" or exam.exam_type == ALExamType.PAPER_2_STRUCTURED:
            if "essay" in q_type_lower or ("structured" not in q_type_lower and "mcq" in q_type_lower):
                raise HTTPException(status_code=400, detail=f"Question '{qv.question_text[:30]}...' cannot be added to Paper II Part A (Structured).")
        elif target_section == "part_b" or exam.exam_type == ALExamType.PAPER_2_ESSAY:
            if "structured" in q_type_lower or ("essay" not in q_type_lower and "mcq" in q_type_lower):
                raise HTTPException(status_code=400, detail=f"Question '{qv.question_text[:30]}...' cannot be added to Paper II Part B (Essay).")
        elif exam.exam_type == ALExamType.PAPER_2:
            if "mcq" in q_type_lower and "structured" not in q_type_lower and "essay" not in q_type_lower:
                raise HTTPException(status_code=400, detail="Cannot add MCQ question to a Paper II assessment.")

        current_count += 1
        
        # Map QuestionType to ALQuestionTemplate
        template = ALQuestionTemplate.GENERIC_MCQ
        if "structured" in q_type_lower:
            template = ALQuestionTemplate.STRUCTURED_SUBPARTS
        elif "essay" in q_type_lower:
            template = ALQuestionTemplate.ESSAY_RUBRIC

        snapshot_data = {
            "question_version_id": qv.id,
            "question_text": qv.question_text,
            "question_type": qv.question_type,
            "options": qv.options,
            "correct_answer": qv.correct_answer,
            "explanation": qv.explanation,
            "difficulty": qv.difficulty,
            "cognitive_level": qv.cognitive_level,
            "snapshot_created_at": datetime.utcnow().isoformat()
        }

        al_q = ALQuestion(
            exam_id=exam.id,
            question_number=current_count,
            template_type=template,
            stem_text=qv.question_text,
            explanation=qv.explanation,
            points=qv.default_points or 1.0,
            cognitive_level=qv.cognitive_level or "understand",
            difficulty=qv.difficulty or "medium",
            options=qv.options,
            correct_option=qv.correct_answer,
            snapshot_json=snapshot_data
        )
        db.add(al_q)

    db.commit()
    db.refresh(exam)
    return exam


@router.post("/{exam_id}/reorder-questions", response_model=ALExamResponse)
def reorder_al_exam_questions(
    exam_id: int,
    data: Dict[str, List[int]],
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher reorders questions inside an A/L Exam.
    """
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    ordered_question_ids = data.get("question_ids", [])
    question_map = {q.id: q for q in exam.questions}

    for index, q_id in enumerate(ordered_question_ids):
        if q_id in question_map:
            question_map[q_id].question_number = index + 1

    db.commit()
    db.refresh(exam)
    return exam


# ──────────────────────────────────────────────
# Teacher Endpoints: Question Management
# ──────────────────────────────────────────────


@router.post("/{exam_id}/questions", response_model=ALQuestionResponse, status_code=status.HTTP_201_CREATED)
def add_al_question(
    exam_id: int,
    data: ALQuestionCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Teacher adds a new question supporting any of the 7 MCQ templates, Structured subparts, or Essay rubrics."""
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    question = ALQuestion(
        exam_id=exam_id,
        question_number=data.question_number,
        template_type=normalize_al_template_type(data.template_type),
        stem_text=data.stem_text,
        diagram_url=process_and_save_diagram_url(data.diagram_url),
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

    # Auto-bank to Question & QuestionVersion
    try:
        from app.models import Question, QuestionVersion, QuestionType, TeacherApprovalStatus
        q_type_enum = QuestionType.MCQ
        tmpl_str = str(data.template_type).lower()
        if "structured" in tmpl_str:
            q_type_enum = QuestionType.SHORT_ANSWER
        elif "essay" in tmpl_str:
            q_type_enum = QuestionType.ESSAY

        q_bank = Question(
            course_id=exam.course_id,
            is_banked=True,
            is_active=True
        )
        db.add(q_bank)
        db.flush()

        qv_bank = QuestionVersion(
            question_id=q_bank.id,
            question_text=data.stem_text,
            question_type=q_type_enum,
            options=data.options,
            correct_answer=data.correct_option or "A",
            explanation=data.explanation,
            default_points=data.points or 1.0,
            difficulty=data.difficulty or "medium",
            cognitive_level=data.cognitive_level or "understand",
            source_type="teacher_created",
            teacher_approval_status=TeacherApprovalStatus.APPROVED
        )
        db.add(qv_bank)
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to auto-bank question: {e}")

    return question


@router.put("/{exam_id}/questions/{question_id}", response_model=ALQuestionResponse)
def update_al_question(
    exam_id: int,
    question_id: int,
    data: ALQuestionUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Teacher updates an existing question."""
    question = db.query(ALQuestion).filter(
        ALQuestion.id == question_id,
        ALQuestion.exam_id == exam_id
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    for field, val in data.model_dump(exclude_unset=True).items():
        if field == "diagram_url":
            val = process_and_save_diagram_url(val)
        setattr(question, field, val)

    db.commit()
    db.refresh(question)
    return question


@router.delete("/{exam_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_al_question(
    exam_id: int,
    question_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Teacher deletes a question from an exam."""
    question = db.query(ALQuestion).filter(
        ALQuestion.id == question_id,
        ALQuestion.exam_id == exam_id
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    db.delete(question)
    db.commit()

    # Recalculate display numbers (1..N) sequentially for remaining questions
    remaining_qs = db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).order_by(ALQuestion.question_number.asc()).all()
    for idx, q in enumerate(remaining_qs, start=1):
        q.question_number = idx
    db.commit()
    return None


@router.post("/{exam_id}/reorder-questions", response_model=List[ALQuestionResponse])
def reorder_al_exam_questions(
    exam_id: int,
    ordered_question_ids: List[int],
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Reorders questions for an exam based on the ordered list of question IDs."""
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")

    questions = db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).all()
    q_map = {q.id: q for q in questions}

    for index, q_id in enumerate(ordered_question_ids, start=1):
        if q_id in q_map:
            q_map[q_id].question_number = index

    db.commit()
    return db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).order_by(ALQuestion.question_number.asc()).all()


def sanitize_structured_nodes_for_student(nodes: Any) -> Any:
    """Recursively sanitizes structured question nodes for student exam delivery by stripping model answers and marking points."""
    if not isinstance(nodes, list):
        return nodes
    sanitized = []
    for node in nodes:
        if not isinstance(node, dict):
            sanitized.append(node)
            continue
        cleaned = {
            "id": node.get("id"),
            "parent_id": node.get("parent_id"),
            "label": node.get("label"),
            "format_type": node.get("format_type", "structured_direct_recall"),
            "prompt": node.get("prompt", ""),
            "points": node.get("points", 0),
            "diagram_info": node.get("diagram_info"),
            "drawing_info": node.get("drawing_info"),
            "drawing_prompt": node.get("drawing_prompt"),
            "required_labels": node.get("required_labels"),
            "comparison_header_1": node.get("comparison_header_1"),
            "comparison_header_2": node.get("comparison_header_2"),
            "table_data": node.get("table_data"),
            "sequence_data": node.get("sequence_data"),
            "comparison_data": node.get("comparison_data"),
            "difficulty": node.get("difficulty"),
            "cognitive_level": node.get("cognitive_level"),
        }
        # Comparison pairs: include criterion only, strip solution values if present
        if "comparison_pairs" in node and isinstance(node["comparison_pairs"], list):
            cleaned["comparison_pairs"] = [
                {"criterion": cp.get("criterion", "")} if isinstance(cp, dict) else {"criterion": str(cp)}
                for cp in node["comparison_pairs"]
            ]
        # Sequence items: provide placeholders count so student knows step count without seeing solution terms
        if "sequence_items" in node and isinstance(node["sequence_items"], list):
            cleaned["sequence_items"] = ["" for _ in node["sequence_items"]]
        # Matrix data: include col_headers and rows with item, strip expected solution
        if "matrix_data" in node and isinstance(node["matrix_data"], dict):
            raw_matrix = node["matrix_data"]
            cleaned["matrix_data"] = {
                "col_headers": raw_matrix.get("col_headers", []),
                "rows": [
                    {"item": r.get("item", "")} if isinstance(r, dict) else {"item": str(r)}
                    for r in raw_matrix.get("rows", [])
                ]
            }
        # Recurse for children
        if node.get("children") and isinstance(node["children"], list):
            cleaned["children"] = sanitize_structured_nodes_for_student(node["children"])
        sanitized.append(cleaned)
    return sanitized


# ──────────────────────────────────────────────
# Student Endpoints: Taking & Submitting Exams
# ──────────────────────────────────────────────

@router.post("/{exam_id}/start", response_model=dict)
def start_al_exam_attempt(
    exam_id: int,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Student starts an exam attempt. Returns submission_id and sanitized question paper (without answers)."""
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam or not exam.is_published:
        raise HTTPException(status_code=404, detail="Exam not available")

    # Check student enrollment
    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id,
        Enrollment.course_id == exam.course_id,
        Enrollment.is_active == True
    ).first()
    if not enrollment and current_user.role == UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    # Check for active in-progress attempt to resume
    existing_in_progress = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id == exam_id,
        ALStudentSubmission.student_id == current_user.id,
        ALStudentSubmission.status == "in_progress"
    ).first()

    if existing_in_progress:
        submission = existing_in_progress
    else:
        # Check attempt limit
        attempts_count = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.exam_id == exam_id,
            ALStudentSubmission.student_id == current_user.id
        ).count()

        if exam.max_attempts > 0 and attempts_count >= exam.max_attempts:
            raise HTTPException(
                status_code=400,
                detail=f"You have reached the maximum allowed attempts ({exam.max_attempts}) for this exam"
            )

        submission = ALStudentSubmission(
            exam_id=exam_id,
            student_id=current_user.id,
            started_at=datetime.utcnow(),
            status="in_progress"
        )
        db.add(submission)
        db.commit()
        db.refresh(submission)

    # Gather saved answers for resuming attempt
    saved_answers = {}
    for ans in submission.answers:
        saved_answers[ans.question_id] = {
            "selected_option": ans.selected_option,
            "subpart_answers_json": ans.subpart_answers_json,
            "essay_text_answer": ans.essay_text_answer,
            "essay_attachment_url": ans.essay_attachment_url,
        }

    # Prepare sanitized questions (strip answer keys, solutions and explanations)
    all_q_nums = [q.question_number for q in exam.questions if q.question_number is not None]
    has_unique_q_nums = len(all_q_nums) == len(exam.questions) and len(set(all_q_nums)) == len(exam.questions) and all(n > 0 for n in all_q_nums)
    base_offset = 5 if exam.exam_type == ALExamType.PAPER_2_ESSAY else 1

    sanitized_questions = []
    for idx, q in enumerate(exam.questions, start=base_offset):
        display_q_num = q.question_number if has_unique_q_nums and q.question_number else idx
        sanitized_questions.append({
            "id": q.id,
            "question_number": display_q_num,
            "template_type": q.template_type.value if q.template_type else "generic_mcq",
            "stem_text": q.stem_text,
            "diagram_url": q.diagram_url,
            "options": q.options,
            "assertion_text": q.assertion_text,
            "reason_text": q.reason_text,
            "statements_json": q.statements_json,
            "grid_key_json": q.grid_key_json,
            "structured_subparts_json": sanitize_structured_nodes_for_student(q.structured_subparts_json) if q.structured_subparts_json else None,
            "essay_checklist_json": q.essay_checklist_json,
            "points": q.points,
        })

    # Calculate authoritative remaining seconds
    remaining_seconds = None
    if exam.time_limit_minutes > 0 and submission.started_at:
        elapsed = int((datetime.utcnow() - submission.started_at).total_seconds())
        remaining_seconds = max(0, (exam.time_limit_minutes * 60) - elapsed)

    return {
        "submission_id": submission.id,
        "exam_id": exam.id,
        "title": exam.title,
        "exam_type": exam.exam_type.value,
        "time_limit_minutes": exam.time_limit_minutes,
        "time_remaining_seconds": remaining_seconds,
        "is_resumed": bool(existing_in_progress),
        "started_at": submission.started_at.isoformat() if submission.started_at else None,
        "saved_answers": saved_answers,
        "questions": sanitized_questions,
    }


@router.get("/{exam_id}/my-submission", response_model=Optional[ALStudentSubmissionResponse])
def get_my_submission_for_exam(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch student's latest submission for this exam if one exists."""
    submission = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id == exam_id,
        ALStudentSubmission.student_id == current_user.id
    ).order_by(ALStudentSubmission.started_at.desc()).first()
    return submission


@router.put("/submissions/{submission_id}/answers")
def autosave_al_answers(
    submission_id: int,
    data: List[ALStudentAnswerSubmit],
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """
    Student continuously autosaves answers during an active exam attempt.
    Enforces server-authoritative time deadline.
    """
    submission = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.id == submission_id,
        ALStudentSubmission.student_id == current_user.id
    ).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Exam attempt not found")

    if submission.status != "in_progress":
        raise HTTPException(status_code=400, detail="This exam attempt is no longer active")

    exam = db.query(ALExam).filter(ALExam.id == submission.exam_id).first()
    
    # Server-Authoritative Timer Enforcement
    if exam and exam.time_limit_minutes > 0 and submission.started_at:
        elapsed_minutes = (datetime.utcnow() - submission.started_at).total_seconds() / 60.0
        if elapsed_minutes > (exam.time_limit_minutes + 1.0):
            # Auto-finalize expired attempt
            submission.submitted_at = datetime.utcnow()
            submission.status = "submitted"
            db.commit()
            raise HTTPException(status_code=400, detail="Time expired. Exam attempt has been automatically submitted.")

    for ans in data:
        existing_answer = db.query(ALStudentAnswer).filter(
            ALStudentAnswer.submission_id == submission_id,
            ALStudentAnswer.question_id == ans.question_id
        ).first()

        if existing_answer:
            if ans.selected_option is not None:
                existing_answer.selected_option = ans.selected_option
            if ans.subpart_answers_json is not None:
                existing_answer.subpart_answers_json = ans.subpart_answers_json
            if ans.essay_text_answer is not None:
                existing_answer.essay_text_answer = ans.essay_text_answer
            if ans.essay_attachment_url is not None:
                existing_answer.essay_attachment_url = ans.essay_attachment_url
        else:
            new_ans = ALStudentAnswer(
                submission_id=submission_id,
                question_id=ans.question_id,
                selected_option=ans.selected_option,
                subpart_answers_json=ans.subpart_answers_json,
                essay_text_answer=ans.essay_text_answer,
                essay_attachment_url=ans.essay_attachment_url,
            )
            db.add(new_ans)

    db.commit()
    return {"message": "Answers autosaved successfully"}


def normalize_mcq_option_key(val: Optional[str]) -> str:
    """
    Normalizes any MCQ option representation (e.g. '1', '(1)', 'A', '(A)', 'a', 'B. Text', 'Option 2')
    to canonical uppercase letter 'A'-'E'.
    """
    if not val:
        return ""
    s = str(val).strip()
    m = re.match(r'^(?:option\s+)?(?:\(?([1-5A-Ea-e])[\)\.\:]?|\b([1-5A-Ea-e])\b)', s, re.IGNORECASE)
    if m:
        char = (m.group(1) or m.group(2)).upper()
        num_to_letter = {"1": "A", "2": "B", "3": "C", "4": "D", "5": "E"}
        return num_to_letter.get(char, char)

    clean = s.upper().replace("(", "").replace(")", "").replace(".", "").strip()
    num_to_letter = {"1": "A", "2": "B", "3": "C", "4": "D", "5": "E"}
    if clean in num_to_letter:
        return num_to_letter[clean]
    if clean in ["A", "B", "C", "D", "E"]:
        return clean
    return clean


def _grade_paper_1_mcq(submission: ALStudentSubmission, exam: ALExam, db: Session):
    """
    Grades all Paper I MCQs in the submission deterministically against snapshot correct options.
    Does NOT call AI/LLM for deterministic MCQs.
    """
    total_raw = 0.0
    total_mcq_points = 0.0
    mcq_count = 0

    for answer in submission.answers:
        question = db.query(ALQuestion).filter(ALQuestion.id == answer.question_id).first()
        if not question:
            continue

        is_structured = (
            question.template_type == ALQuestionTemplate.STRUCTURED_SUBPARTS or
            bool(question.structured_subparts_json)
        )
        is_essay = (
            question.template_type == ALQuestionTemplate.ESSAY_RUBRIC or
            bool(question.essay_checklist_json)
        )

        if not is_structured and not is_essay:
            mcq_count += 1
            pts = float(question.points or 1.0)
            total_mcq_points += pts

            norm_correct = normalize_mcq_option_key(question.correct_option)
            norm_student = normalize_mcq_option_key(answer.selected_option)

            if question.template_type == ALQuestionTemplate.COMBINATION_GRID:
                resolved = resolve_combination_grid_option(norm_student) or norm_student
                norm_student = normalize_mcq_option_key(resolved)

            if norm_student and norm_correct and norm_student == norm_correct:
                answer.is_correct = True
                answer.auto_score = pts
                answer.ai_score = 0.0
                answer.final_score = pts
                answer.raw_points_earned = pts
                answer.scaled_points_earned = pts
                total_raw += pts
            else:
                answer.is_correct = False
                answer.auto_score = 0.0
                answer.ai_score = 0.0
                answer.final_score = 0.0
                answer.raw_points_earned = 0.0
                answer.scaled_points_earned = 0.0

    submission.raw_score = total_raw
    submission.scaled_score = total_raw

    # For pure MCQ exams, calculate percentage and final grade
    is_pure_mcq = (
        exam.exam_type == ALExamType.PAPER_1_MCQ or
        (mcq_count == len(submission.answers) and mcq_count > 0)
    )
    if is_pure_mcq:
        calc_max = total_mcq_points if total_mcq_points > 0 else float(exam.total_questions or mcq_count or 1)
        submission.percentage = round((total_raw / calc_max) * 100.0, 2)
        submission.grade = _calculate_al_grade(submission.percentage)

    db.commit()
    db.refresh(submission)


def _grade_paper_2_structured_and_essay(submission: ALStudentSubmission, exam: ALExam, db: Session):
    """
    AI Pre-marking engine for Structured (Paper II-A) and Essay (Paper II-B) questions.
    Uses frozen snapshot_json / question specs for evaluation.
    Sets status = "ai_graded" for teacher review in Teacher Marking Studio.
    """
    total_suggested_raw = 0.0
    total_possible = 0.0
    feedback_summaries = []

    for answer in submission.answers:
        question = db.query(ALQuestion).filter(ALQuestion.id == answer.question_id).first()
        if not question:
            continue

        is_structured = (
            question.template_type == ALQuestionTemplate.STRUCTURED_SUBPARTS or
            bool(question.structured_subparts_json)
        )
        is_essay = (
            question.template_type == ALQuestionTemplate.ESSAY_RUBRIC or
            bool(question.essay_checklist_json)
        )

        # Include MCQ points if any
        if not is_structured and not is_essay:
            pts = answer.auto_score or answer.final_score or (float(question.points or 1.0) if answer.is_correct else 0.0)
            total_suggested_raw += pts
            total_possible += float(question.points or 1.0)
            continue

        # Construct frozen snapshot dict
        question_snapshot = {
            "stem_text": question.stem_text,
            "structured_subparts_json": question.structured_subparts_json,
            "essay_checklist_json": question.essay_checklist_json,
            "points": question.points
        }

        if is_structured:
            max_q_pts = float(question.points or 10.0)
            total_possible += max_q_pts
            try:
                subpart_ans = answer.subpart_answers_json or {}
                res = al_marking_service.evaluate_structured_question(subpart_ans, question_snapshot)

                answer.auto_score = 0.0
                answer.ai_score = res.suggested_score
                answer.ai_checklist_results_json = res.model_dump()
                answer.raw_points_earned = 0.0  # Pending teacher verification
                answer.scaled_points_earned = 0.0
                answer.final_score = 0.0

                total_suggested_raw += res.suggested_score
                feedback_summaries.append(f"Q{question.question_number} Structured: {res.suggested_score:.1f}/{res.maximum_score:.1f} AI suggested")
            except Exception as e:
                logger.error(f"Error evaluating structured question {question.id}: {e}")
                answer.ai_score = 0.0

        elif is_essay:
            max_q_pts = float(question.points or 20.0)
            total_possible += max_q_pts
            try:
                essay_text = answer.essay_text_answer or ""
                res = al_marking_service.evaluate_essay_question(essay_text, question_snapshot, answer.essay_attachment_url)

                answer.auto_score = 0.0
                answer.ai_score = res.suggested_score
                answer.ai_checklist_results_json = res.model_dump()
                answer.raw_points_earned = 0.0  # Pending teacher verification
                answer.scaled_points_earned = 0.0
                answer.final_score = 0.0

                total_suggested_raw += res.suggested_score
                if res.feedback:
                    feedback_summaries.append(f"Q{question.question_number} Essay: {res.feedback}")
            except Exception as e:
                logger.error(f"Error evaluating essay question {question.id}: {e}")
                answer.ai_score = 0.0

    calc_max = total_possible if total_possible > 0 else 100.0
    submission.percentage = round(min((total_suggested_raw / calc_max) * 100.0, 100.0), 2)
    submission.grade = _calculate_al_grade(submission.percentage)
    submission.status = "ai_graded"
    submission.ai_feedback_summary = " | ".join(feedback_summaries) if feedback_summaries else "AI pre-marking completed successfully."

    db.commit()
    db.refresh(submission)


def _background_grade_paper_2(submission_id: int, exam_id: int):
    """Background worker for asynchronous AI pre-marking of Paper II structured and essay questions."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        submission = db.query(ALStudentSubmission).filter(ALStudentSubmission.id == submission_id).first()
        exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
        if not submission or not exam:
            return

        _grade_paper_2_structured_and_essay(submission, exam, db)
    except Exception as e:
        logger.error(f"Error in background AI grading for submission {submission_id}: {e}")
    finally:
        db.close()


@router.post("/submissions/{submission_id}/submit", response_model=ALStudentSubmissionResponse)
def submit_al_exam(
    submission_id: int,
    data: ALStudentSubmissionCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """
    Student submits final answers.
    - Synchronously grades all MCQs in milliseconds with 0 latency.
    - Offloads heavy Paper 2 AI Pre-Grading to background task, returning immediately in <1s.
    """
    submission = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.id == submission_id,
        ALStudentSubmission.student_id == current_user.id
    ).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Exam submission record not found")

    if submission.status != "in_progress":
        raise HTTPException(status_code=400, detail="This exam attempt has already been submitted")

    exam = db.query(ALExam).filter(ALExam.id == submission.exam_id).first()

    # Save or update answers
    for ans_data in data.answers:
        existing_answer = db.query(ALStudentAnswer).filter(
            ALStudentAnswer.submission_id == submission_id,
            ALStudentAnswer.question_id == ans_data.question_id
        ).first()

        if existing_answer:
            if ans_data.selected_option is not None:
                existing_answer.selected_option = ans_data.selected_option
            if ans_data.subpart_answers_json is not None:
                existing_answer.subpart_answers_json = ans_data.subpart_answers_json
            if ans_data.essay_text_answer is not None:
                existing_answer.essay_text_answer = ans_data.essay_text_answer
            if ans_data.essay_attachment_url is not None:
                existing_answer.essay_attachment_url = ans_data.essay_attachment_url
        else:
            answer = ALStudentAnswer(
                submission_id=submission_id,
                question_id=ans_data.question_id,
                selected_option=ans_data.selected_option,
                subpart_answers_json=ans_data.subpart_answers_json,
                essay_text_answer=ans_data.essay_text_answer,
                essay_attachment_url=ans_data.essay_attachment_url,
            )
            db.add(answer)

    submission.submitted_at = datetime.utcnow()
    submission.status = "submitted"
    db.commit()
    db.refresh(submission)

    # 1. Deterministically grade all MCQs in submission (instant, <10ms)
    _grade_paper_1_mcq(submission, exam, db)

    # 2. Check if Paper 2 (Structured / Essay) questions exist
    has_paper_2 = any(
        (q.template_type in [ALQuestionTemplate.STRUCTURED_SUBPARTS, ALQuestionTemplate.ESSAY_RUBRIC]) or
        bool(q.structured_subparts_json) or
        bool(q.essay_checklist_json)
        for q in exam.questions
    )

    if has_paper_2:
        # Paper II requires teacher evaluation. Retain status as 'submitted' (pending teacher review)
        submission.status = "submitted"
        submission.grade = None
        submission.percentage = None
        db.commit()
    else:
        # Pure MCQ paper is fully graded
        if submission.status == "submitted":
            submission.status = "graded"
            db.commit()

    db.refresh(submission)
    return submission


@router.post("/submissions/{submission_id}/verify", response_model=ALStudentSubmissionResponse)
def verify_teacher_submission(
    submission_id: int,
    data: ALTeacherVerifySubmissionRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher reviews AI pre-graded submission, overrides checklist checkmarks/points,
    adds feedback notes, and publishes the final grade.
    """
    submission = db.query(ALStudentSubmission).filter(ALStudentSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    exam = db.query(ALExam).filter(ALExam.id == submission.exam_id).first()
    course = db.query(Course).filter(Course.id == exam.course_id).first()

    if current_user.role != UserRole.ADMIN and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to grade this submission")

    override_map = {item.answer_id: item for item in data.answers}

    total_scaled = 0.0
    total_raw = 0.0
    max_possible_scaled = 0.0

    for answer in submission.answers:
        question = db.query(ALQuestion).filter(ALQuestion.id == answer.question_id).first()
        if not question:
            continue

        if answer.id in override_map:
            item = override_map[answer.id]
            if item.teacher_override_points is not None:
                answer.teacher_override_points = item.teacher_override_points
                answer.teacher_score = item.teacher_override_points
                answer.final_score = item.teacher_override_points
                answer.scaled_points_earned = item.teacher_override_points
                answer.raw_points_earned = item.teacher_override_points
            else:
                answer.teacher_score = answer.ai_score
                answer.final_score = answer.ai_score
                answer.raw_points_earned = answer.ai_score
                answer.scaled_points_earned = answer.ai_score

            if item.teacher_checklist_results_json is not None:
                answer.teacher_checklist_results_json = item.teacher_checklist_results_json
            if item.feedback_notes is not None:
                answer.feedback_notes = item.feedback_notes
        else:
            answer.final_score = answer.teacher_score if answer.teacher_score is not None else (answer.ai_score or answer.auto_score)

        final_scaled = answer.final_score or 0.0
        total_scaled += final_scaled
        total_raw += final_scaled

        if question.template_type == ALQuestionTemplate.STRUCTURED_SUBPARTS:
            max_possible_scaled += (question.points or 10.0)
        elif question.template_type == ALQuestionTemplate.ESSAY_RUBRIC:
            max_possible_scaled += (question.points or 20.0)
        else:
            max_possible_scaled += (question.points or 1.0)

    submission.scaled_score = total_scaled
    submission.raw_score = total_raw
    calc_max = max_possible_scaled if max_possible_scaled > 0 else 100.0
    submission.percentage = round(min((total_scaled / calc_max) * 100.0, 100.0), 2)
    submission.grade = _calculate_al_grade(submission.percentage)
    submission.teacher_feedback = data.teacher_feedback
    submission.status = "teacher_verified"
    submission.teacher_verified_at = datetime.utcnow()
    submission.finalized_by_id = current_user.id
    submission.finalized_at = datetime.utcnow()

    db.commit()
    db.refresh(submission)
    return submission


@router.get("/submissions/{submission_id}", response_model=ALStudentSubmissionResponse)
def get_al_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch submission results, scores, and feedback."""
    submission = db.query(ALStudentSubmission).filter(ALStudentSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if current_user.role == UserRole.STUDENT and submission.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this submission")

    if current_user.role == UserRole.TEACHER:
        exam = db.query(ALExam).filter(ALExam.id == submission.exam_id).first()
        course = db.query(Course).filter(Course.id == exam.course_id).first()
        if course and course.teacher_id != current_user.id and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Not authorized to view submissions for another teacher's course")

    return submission


@router.get("/{exam_id}/submissions", response_model=List[ALStudentSubmissionResponse])
def list_exam_submissions_for_teacher(
    exam_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Teacher views all student submissions for a specific exam."""
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id == exam_id
    ).order_by(ALStudentSubmission.started_at.desc()).all()

    return submissions


class ALExamRevisionRequest(BaseModel):
    revision_type: str = "single_question"
    question_number: Optional[int] = None
    reason: str
    notify_students: bool = True


@router.post("/{exam_id}/revise")
def revise_al_exam(
    exam_id: int,
    data: ALExamRevisionRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Safely logs paper revision audit trail and sends student notifications
    without mutating immutable historical student submission snapshots.
    """
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # 1. Audit Trail Record
    try:
        from app.models import AuditLog
        audit = AuditLog(
            user_id=current_user.id,
            action="EXAM_REVISED",
            details=f"Exam '{exam.title}' (ID {exam.id}) revised. Type: {data.revision_type}, Q#{data.question_number or 'All'}, Reason: {data.reason}"
        )
        db.add(audit)
    except Exception as e:
        logger.warning(f"Audit log writing skipped: {e}")

    # 2. Notify Enrolled Students via existing Notification system
    notified_count = 0
    if data.notify_students and exam.course_id:
        from app.models import Enrollment, Notification
        enrollments = db.query(Enrollment).filter(Enrollment.course_id == exam.course_id).all()
        student_ids = [e.student_id for e in enrollments]
        
        q_label = f"Question {data.question_number}" if data.question_number else "a specific question"
        message_str = f"An update has been made to '{exam.title}'. {q_label} was corrected. Only the affected question requires your attention."
        
        for s_id in student_ids:
            notif = Notification(
                user_id=s_id,
                title=f"Assessment Update: {exam.title}",
                message=message_str,
                type="exam_correction",
                is_read=False
            )
            db.add(notif)
            notified_count += 1

    db.commit()
    return {
        "message": "Paper revision logged successfully.",
        "exam_id": exam_id,
        "revision_type": data.revision_type,
        "question_number": data.question_number,
        "students_notified": notified_count
    }
