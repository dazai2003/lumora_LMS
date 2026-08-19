"""
Question Pools & Dynamic Quiz Question Sampling Service for Lumora LMS.
Handles reusable question pools and dynamic random question sampling for quiz attempts.
"""
import random
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models import QuestionPool, QuestionPoolItem, QuizPoolRule, Question, QuestionVersion, QuizQuestion, Quiz


def create_question_pool(
    db: Session,
    title: str,
    course_id: int,
    created_by_id: int,
    description: Optional[str] = None,
    question_ids: Optional[List[int]] = None
) -> QuestionPool:
    """
    Create a new QuestionPool and link initial questions into it.
    """
    pool = QuestionPool(
        title=title,
        description=description,
        course_id=course_id,
        created_by_id=created_by_id
    )
    db.add(pool)
    db.flush()

    if question_ids:
        for q_id in question_ids:
            latest_v = (
                db.query(QuestionVersion)
                .filter(QuestionVersion.question_id == q_id)
                .order_by(QuestionVersion.version_number.desc())
                .first()
            )
            item = QuestionPoolItem(
                pool_id=pool.id,
                question_id=q_id,
                question_version_id=latest_v.id if latest_v else None
            )
            db.add(item)

    db.commit()
    db.refresh(pool)
    return pool


def sample_questions_from_rules(db: Session, quiz_id: int) -> List[QuestionVersion]:
    """
    Sample questions dynamically based on assigned QuizPoolRules for a quiz.
    Returns a list of selected QuestionVersion objects.
    """
    rules = db.query(QuizPoolRule).filter(QuizPoolRule.quiz_id == quiz_id).all()
    if not rules:
        # Fallback to direct QuizQuestion links if no pool rules exist
        links = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz_id).order_by(QuizQuestion.order_index).all()
        return [link.question_version for link in links if link.question_version]

    selected_versions: List[QuestionVersion] = []
    seen_version_ids = set()

    for rule in rules:
        items_query = db.query(QuestionPoolItem).filter(QuestionPoolItem.pool_id == rule.pool_id)
        candidate_items = items_query.all()

        eligible_versions = []
        for item in candidate_items:
            qv = item.question_version
            if not qv or qv.id in seen_version_ids:
                continue

            # Apply filters if specified
            if rule.difficulty_filter and getattr(qv.difficulty, "value", str(qv.difficulty)).lower() != rule.difficulty_filter.lower():
                continue
            if rule.blooms_filter and getattr(qv.cognitive_level, "value", str(qv.cognitive_level)).lower() != rule.blooms_filter.lower():
                continue
            if rule.question_type_filter and getattr(qv.question_type, "value", str(qv.question_type)).lower() != rule.question_type_filter.lower():
                continue

            eligible_versions.append(qv)

        # Random sample 'rule.count' items
        k = min(rule.count, len(eligible_versions))
        if k > 0:
            sampled = random.sample(eligible_versions, k)
            for s in sampled:
                seen_version_ids.add(s.id)
                selected_versions.append(s)

    return selected_versions
