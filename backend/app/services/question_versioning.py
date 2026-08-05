"""
Question Versioning Service for Lumora LMS.
Creates immutable snapshots when questions are created or edited.
"""
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.models import Question, QuestionVersion, QuestionOption


def create_question_version(
    db: Session,
    question: Question,
    metadata_json: Optional[Dict[str, Any]] = None
) -> QuestionVersion:
    """
    Create a new immutable QuestionVersion snapshot for a question.
    """
    # Fetch options
    options = db.query(QuestionOption).filter(QuestionOption.question_id == question.id).all()
    options_data = [
        {"id": opt.id, "option_text": opt.option_text, "is_correct": opt.is_correct}
        for opt in options
    ]

    # Determine next version number
    latest = (
        db.query(QuestionVersion)
        .filter(QuestionVersion.question_id == question.id)
        .order_by(QuestionVersion.version_number.desc())
        .first()
    )
    next_version = (latest.version_number + 1) if latest else 1

    version = QuestionVersion(
        question_id=question.id,
        version_number=next_version,
        question_text=question.question_text,
        options_data=options_data,
        explanation=getattr(question, "explanation", None),
        blooms_level=getattr(question, "blooms_level", "Understanding") or "Understanding",
        points=getattr(question, "points", 1.0) or 1.0,
        metadata_json=metadata_json
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def get_latest_question_version(db: Session, question_id: int) -> Optional[QuestionVersion]:
    """
    Retrieve the latest active QuestionVersion for a given question.
    """
    return (
        db.query(QuestionVersion)
        .filter(QuestionVersion.question_id == question_id)
        .order_by(QuestionVersion.version_number.desc())
        .first()
    )
