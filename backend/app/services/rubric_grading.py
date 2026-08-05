"""
Rubric-Based Short Answer Grading Service for Lumora LMS.
Computes multi-criteria scores, AI confidence ratings, and teacher override history.
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import GradingRubric, RubricScore, Answer, QuestionAnalytics
from app.services.audit import log_audit_event


def evaluate_rubric_score(
    db: Session,
    answer_id: int,
    rubric_id: int,
    criteria_scores: List[Dict[str, Any]],
    teacher_final_score: float,
    actor_id: Optional[int] = None,
    actor_email: Optional[str] = None,
    override_reason: Optional[str] = None
) -> RubricScore:
    """
    Save or update a multi-criteria RubricScore evaluation for a student answer.
    """
    answer = db.query(Answer).filter(Answer.id == answer_id).first()
    if not answer:
        raise ValueError("Answer not found")

    rubric = db.query(GradingRubric).filter(GradingRubric.id == rubric_id).first()
    if not rubric:
        raise ValueError("Grading rubric not found")

    # Update Answer score
    previous_score = answer.points_earned
    answer.points_earned = teacher_final_score
    answer.is_overridden = (override_reason is not None and len(override_reason) > 0)
    if answer.is_overridden:
        answer.teacher_note = override_reason

    rubric_score = (
        db.query(RubricScore)
        .filter(RubricScore.answer_id == answer_id, RubricScore.rubric_id == rubric_id)
        .first()
    )

    if not rubric_score:
        rubric_score = RubricScore(
            answer_id=answer_id,
            rubric_id=rubric_id,
            criteria_scores_json=criteria_scores,
            teacher_final_score=teacher_final_score,
            override_reason=override_reason
        )
        db.add(rubric_score)
    else:
        rubric_score.criteria_scores_json = criteria_scores
        rubric_score.teacher_final_score = teacher_final_score
        rubric_score.override_reason = override_reason

    db.commit()
    db.refresh(rubric_score)

    # Log audit event
    log_audit_event(
        db=db,
        action="RUBRIC_SCORE_SUBMITTED",
        entity_type="rubric_score",
        entity_id=rubric_score.id,
        actor_id=actor_id,
        actor_email=actor_email,
        previous_values={"points_earned": previous_score},
        new_values={"points_earned": teacher_final_score, "override_reason": override_reason}
    )

    return rubric_score
