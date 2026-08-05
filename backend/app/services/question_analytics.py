"""
Question Analytics Service for Lumora LMS.
Calculates item difficulty index (p-value), discrimination index (d), and skip/override metrics.
"""
from typing import Optional
from sqlalchemy.orm import Session
from app.models import QuestionAnalytics, Question


def record_question_answer_attempt(
    db: Session,
    question_id: int,
    is_correct: bool,
    response_time_seconds: float = 0.0,
    is_skipped: bool = False,
    is_teacher_override: bool = False
) -> QuestionAnalytics:
    """
    Update QuestionAnalytics when a student submits an answer or a teacher overrides a score.
    """
    analytics = db.query(QuestionAnalytics).filter(QuestionAnalytics.question_id == question_id).first()
    if not analytics:
        analytics = QuestionAnalytics(question_id=question_id)
        db.add(analytics)
        db.flush()

    analytics.attempts_count += 1
    if is_correct:
        analytics.correct_count += 1
    if is_skipped:
        analytics.skip_count += 1
    if is_teacher_override:
        analytics.teacher_override_count += 1

    # Update rolling average response time
    if analytics.attempts_count > 1:
        analytics.avg_response_time_seconds = (
            (analytics.avg_response_time_seconds * (analytics.attempts_count - 1) + response_time_seconds)
            / analytics.attempts_count
        )
    else:
        analytics.avg_response_time_seconds = response_time_seconds

    # Calculate item difficulty index p = correct / attempts
    if analytics.attempts_count > 0:
        analytics.difficulty_index = round(analytics.correct_count / analytics.attempts_count, 3)

    db.commit()
    db.refresh(analytics)
    return analytics
