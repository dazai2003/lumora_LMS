"""
G.C.E. Advanced Level Past Paper & Question Bank Extraction API.

Handles teacher PDF upload, Gemini AI question extraction with model answer generation,
grouping questions by Paper Set / Year or Quiz Name, and publishing paper sets as student exams.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Any
from datetime import datetime
import os
import shutil

from app.database import get_db
from app.models import (
    User, UserRole, Course,
    ALExam, ALExamType, ALQuestion, ALQuestionTemplate, ALPastPaper,
    normalize_al_template_type
)
from app.schemas import (
    ALPastPaperCreate, ALPastPaperResponse, ALQuestionResponse
)
from app.auth import get_current_user, require_teacher
from app.services.gemini_service import gemini

router = APIRouter(tags=["A/L Past Papers & Question Bank"])


@router.get("", response_model=List[ALPastPaperResponse])
def list_past_papers(
    year: Optional[int] = Query(None),
    paper_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List all archived past papers and model papers."""
    query = db.query(ALPastPaper)
    if year:
        query = query.filter(ALPastPaper.year == year)
    if paper_type:
        query = query.filter(ALPastPaper.paper_type == paper_type)
    return query.order_by(ALPastPaper.year.desc()).all()


@router.post("/extract-pdf")
def extract_questions_from_pdf(
    title: str = Form(...),
    year: int = Form(...),
    paper_type: str = Form("paper_1_mcq"),
    course_id: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher uploads a Past Paper or Model Question PDF.
    Gemini AI extracts all questions, generates model answers / explanations,
    and stores them in the Question Bank tagged with paper_set_group.
    """
    temp_path = ""
    if file:
        os.makedirs("uploads/past_papers", exist_ok=True)
        temp_path = os.path.join("uploads/past_papers", f"{year}_{file.filename}")
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

    # Call Gemini PDF Extraction Engine
    extracted_data = gemini.extract_and_generate_model_answers_from_pdf(
        file_path=temp_path,
        title=title,
        year=year,
        paper_type=paper_type,
    )

    paper_group_name = f"{year} {title}"

    # Create Past Paper Archive Record
    past_paper = ALPastPaper(
        year=year,
        title=title,
        paper_type=paper_type,
        pdf_url=f"/{temp_path}" if temp_path else None,
        status="processed"
    )
    db.add(past_paper)
    db.commit()
    db.refresh(past_paper)

    # If course_id is provided, auto-create a draft ALExam container
    exam_id = None
    if course_id:
        exam = ALExam(
            course_id=course_id,
            title=title,
            description=f"Auto-extracted from {title} ({year}) with Gemini Model Answers",
            exam_type=paper_type,
            time_limit_minutes=120 if paper_type == "paper_1_mcq" else 180,
            total_questions=len(extracted_data.get("questions", [])),
            is_published=False,
        )
        db.add(exam)
        db.commit()
        db.refresh(exam)
        exam_id = exam.id
        past_paper.exam_id = exam_id
        db.commit()

    # Batch insert extracted questions into Question Bank
    saved_questions = []
    for q_data in extracted_data.get("questions", []):
        if not exam_id:
            # Create a placeholder exam if needed for FK constraint
            dummy_exam = db.query(ALExam).first()
            if not dummy_exam:
                dummy_exam = ALExam(
                    course_id=1,
                    title="Question Bank Repository",
                    exam_type=paper_type,
                    is_published=False,
                )
                db.add(dummy_exam)
                db.commit()
                db.refresh(dummy_exam)
            exam_id = dummy_exam.id

        template_val = q_data.get("template_type", "generic_mcq")
        question = ALQuestion(
            exam_id=exam_id,
            question_number=q_data.get("question_number", 1),
            template_type=normalize_al_template_type(template_val),
            stem_text=q_data.get("stem_text", "Extracted Stem Text"),
            diagram_url=q_data.get("diagram_url"),
            explanation=q_data.get("explanation", "Gemini Model Answer"),
            points=float(q_data.get("points", 1.0)),
            cognitive_level=q_data.get("cognitive_level", "understand"),
            difficulty=q_data.get("difficulty", "medium"),
            options=q_data.get("options"),
            correct_option=q_data.get("correct_option"),
            structured_subparts_json=q_data.get("structured_subparts_json"),
            essay_checklist_json=q_data.get("essay_checklist_json"),
            paper_set_group=paper_group_name,
        )
        db.add(question)
        saved_questions.append(question)

    db.commit()

    return {
        "message": "Past Paper successfully extracted and imported into Question Bank!",
        "past_paper_id": past_paper.id,
        "paper_set_group": paper_group_name,
        "questions_count": len(saved_questions),
        "exam_id": exam_id,
    }


@router.get("/question-bank/groups")
def get_question_bank_groups(
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns distinct question bank groups (Paper Sets / Years & Quiz Names) with question counts.
    """
    results = db.query(
        ALQuestion.paper_set_group,
        func.count(ALQuestion.id).label("total_questions")
    ).group_by(ALQuestion.paper_set_group).all()

    groups = []
    for group_name, count in results:
        groups.append({
            "group_name": group_name or "General Unassigned",
            "total_questions": count,
        })

    return groups


@router.post("/publish-exam")
def publish_paper_set_as_exam(
    paper_set_group: str = Form(...),
    course_id: int = Form(...),
    title: str = Form(...),
    time_limit_minutes: int = Form(120),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher publishes an entire Paper Set from the Question Bank as an active student exam.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    questions = db.query(ALQuestion).filter(ALQuestion.paper_set_group == paper_set_group).all()
    if not questions:
        raise HTTPException(status_code=404, detail="No questions found for this Paper Set Group")

    exam = ALExam(
        course_id=course_id,
        title=title,
        description=f"Official Examination Paper — {paper_set_group}",
        exam_type=questions[0].exam.exam_type if questions[0].exam else ALExamType.PAPER_1_MCQ,
        time_limit_minutes=time_limit_minutes,
        total_questions=len(questions),
        is_published=True,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)

    # Re-link questions to newly published exam
    for q in questions:
        q.exam_id = exam.id

    db.commit()
    return {
        "message": f"Paper set '{paper_set_group}' successfully published to course!",
        "exam_id": exam.id,
        "title": exam.title,
    }
