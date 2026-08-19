"""
G.C.E. Advanced Level Paper I MCQ Engine API.

Handles proportional template weight distribution calculations, 7 A/L MCQ template question generation,
and Combination Grid (Questions 41–50) choice evaluation.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

from app.database import get_db
from app.models import User, Course, ALExam, ALExamType, ALQuestion, ALQuestionTemplate
from app.auth import get_current_user, require_teacher
from app.services.al_weighting_service import calculate_al_template_breakdown
from app.services.scope_slicer_service import scope_slicer

router = APIRouter(tags=["A/L Paper I MCQ Engine"])


@router.get("/proportional-breakdown")
def get_proportional_template_breakdown(
    total_questions: int = Query(50, ge=1, le=100),
):
    """
    Returns exact question counts across all 7 A/L MCQ templates based on official G.C.E. A/L Biology ratios.
    """
    breakdown = calculate_al_template_breakdown(total_questions)
    return {
        "total_questions": total_questions,
        "template_counts": breakdown,
        "official_ratios": {
            "generic_mcq": "26%",
            "combination_grid": "20%",
            "five_statement_truth": "16%",
            "matching_column": "14%",
            "diagram_based": "12%",
            "assertion_reason": "12%",
        }
    }


@router.post("/generate-paper1")
def generate_paper1_mcq_exam(
    course_id: int = Query(...),
    total_questions: int = Query(50, ge=1, le=100),
    title: Optional[str] = Query(None),
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Teacher generates a Paper I MCQ exam with proportional template slicing.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    exam_title = title or f"{course.title} - Paper I MCQ Exam ({total_questions} Qs)"
    
    res = scope_slicer.generate_scope_sliced_assessment(
        db=db,
        scope="subject",
        target_id=None,
        course_id=course_id,
        paper_type="paper_1_mcq"
    )

    return res
