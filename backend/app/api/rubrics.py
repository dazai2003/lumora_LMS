"""
Grading Rubrics API Router for Lumora LMS.
Provides endpoints to manage multi-criteria grading rubrics and submit rubric score evaluations.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, UserRole, GradingRubric, RubricScore
from app.schemas import (
    GradingRubricCreate, GradingRubricResponse, RubricScoreSubmit
)
from app.auth import require_admin_or_teacher
from app.services.rubric_grading import evaluate_rubric_score

router = APIRouter()


@router.post("/", response_model=GradingRubricResponse)
def create_grading_rubric(
    rubric_data: GradingRubricCreate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Create a new multi-criteria GradingRubric.
    """
    criteria_list = [c.dict() for c in rubric_data.criteria]
    rubric = GradingRubric(
        title=rubric_data.title,
        question_id=rubric_data.question_id,
        course_id=rubric_data.course_id,
        max_marks=rubric_data.max_marks,
        criteria_json=criteria_list
    )
    db.add(rubric)
    db.commit()
    db.refresh(rubric)
    return rubric


@router.get("/", response_model=List[GradingRubricResponse])
def get_grading_rubrics(
    question_id: Optional[int] = None,
    course_id: Optional[int] = None,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    List Grading Rubrics.
    """
    query = db.query(GradingRubric)
    if question_id:
        query = query.filter(GradingRubric.question_id == question_id)
    if course_id:
        query = query.filter(GradingRubric.course_id == course_id)

    return query.order_by(GradingRubric.created_at.desc()).all()


@router.post("/scores/submit")
def submit_rubric_score(
    answer_id: int,
    score_data: RubricScoreSubmit,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Submit or update a rubric score evaluation for a student answer.
    """
    rubric_score = evaluate_rubric_score(
        db=db,
        answer_id=answer_id,
        rubric_id=score_data.rubric_id,
        criteria_scores=score_data.criteria_scores,
        teacher_final_score=score_data.teacher_final_score,
        actor_id=current_user.id,
        actor_email=current_user.email,
        override_reason=score_data.override_reason
    )
    return {"message": "Rubric score evaluation saved successfully", "rubric_score_id": rubric_score.id, "success": True}
