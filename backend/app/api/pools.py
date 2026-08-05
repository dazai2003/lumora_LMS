"""
Question Pools API Router for Lumora LMS.
Provides CRUD operations for Question Pools and Quiz Pool Sampling Rules.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, UserRole, QuestionPool, QuestionPoolItem, QuizPoolRule, QuestionVersion
from app.schemas import (
    QuestionPoolCreate, QuestionPoolResponse, QuizPoolRuleCreate, QuizPoolRuleResponse
)
from app.auth import require_admin_or_teacher
from app.services.question_pools import create_question_pool

router = APIRouter()


@router.post("/", response_model=QuestionPoolResponse)
def create_pool(
    pool_data: QuestionPoolCreate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Create a new reusable Question Pool.
    """
    pool = create_question_pool(
        db=db,
        title=pool_data.title,
        description=pool_data.description,
        course_id=pool_data.course_id,
        created_by_id=current_user.id,
        question_ids=pool_data.question_ids
    )
    return QuestionPoolResponse(
        id=pool.id,
        title=pool.title,
        description=pool.description,
        course_id=pool.course_id,
        created_by_id=pool.created_by_id,
        created_at=pool.created_at,
        item_count=len(pool.items) if pool.items else 0
    )


@router.get("/", response_model=List[QuestionPoolResponse])
def get_pools(
    course_id: Optional[int] = None,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    List Question Pools.
    """
    query = db.query(QuestionPool)
    if course_id:
        query = query.filter(QuestionPool.course_id == course_id)

    pools = query.order_by(QuestionPool.created_at.desc()).all()
    out = []
    for p in pools:
        out.append(QuestionPoolResponse(
            id=p.id,
            title=p.title,
            description=p.description,
            course_id=p.course_id,
            created_by_id=p.created_by_id,
            created_at=p.created_at,
            item_count=len(p.items) if p.items else 0
        ))
    return out


@router.post("/rules", response_model=QuizPoolRuleResponse)
def add_quiz_pool_rule(
    rule_data: QuizPoolRuleCreate,
    quiz_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db)
):
    """
    Assign a sampling rule linking a QuestionPool to a Quiz.
    """
    rule = QuizPoolRule(
        quiz_id=quiz_id,
        pool_id=rule_data.pool_id,
        count=rule_data.count,
        difficulty_filter=rule_data.difficulty_filter,
        blooms_filter=rule_data.blooms_filter,
        question_type_filter=rule_data.question_type_filter
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule
