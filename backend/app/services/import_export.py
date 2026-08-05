"""
Question Import and Export Service for Lumora LMS.
Supports CSV & JSON import and export while preserving versioning, tags, difficulty, and Bloom's taxonomy.
"""
import json
import csv
import io
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.models import Question, QuestionVersion, Difficulty, CognitiveLevel, QuestionType, TeacherApprovalStatus


def export_questions_to_json(db: Session, question_ids: List[int]) -> str:
    """
    Export questions with full version history and metadata as JSON.
    """
    versions = (
        db.query(QuestionVersion)
        .filter(QuestionVersion.question_id.in_(question_ids))
        .order_by(QuestionVersion.question_id, QuestionVersion.version_number.desc())
        .all()
    )

    data = []
    for v in versions:
        data.append({
            "question_id": v.question_id,
            "version_number": v.version_number,
            "question_text": v.question_text,
            "question_type": v.question_type.value if hasattr(v.question_type, "value") else str(v.question_type),
            "options": v.options,
            "correct_answer": v.correct_answer,
            "explanation": v.explanation,
            "default_points": v.default_points,
            "difficulty": v.difficulty.value if hasattr(v.difficulty, "value") else str(v.difficulty) if v.difficulty else "medium",
            "cognitive_level": v.cognitive_level.value if hasattr(v.cognitive_level, "value") else str(v.cognitive_level) if v.cognitive_level else "understand",
            "tags": v.tags or [],
            "learning_outcome": v.learning_outcome,
            "estimated_completion_time_seconds": v.estimated_completion_time_seconds or 60,
            "source_type": v.source_type or "manual"
        })

    return json.dumps(data, indent=2)


def export_questions_to_csv(db: Session, question_ids: List[int]) -> str:
    """
    Export questions as CSV string.
    """
    versions = (
        db.query(QuestionVersion)
        .filter(QuestionVersion.question_id.in_(question_ids))
        .order_by(QuestionVersion.question_id, QuestionVersion.version_number.desc())
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "question_id", "version_number", "question_text", "question_type",
        "options", "correct_answer", "explanation", "default_points",
        "difficulty", "cognitive_level", "tags", "learning_outcome"
    ])

    for v in versions:
        opts_str = json.dumps(v.options) if v.options else ""
        tags_str = ",".join(v.tags) if v.tags else ""
        writer.writerow([
            v.question_id,
            v.version_number,
            v.question_text,
            v.question_type.value if hasattr(v.question_type, "value") else str(v.question_type),
            opts_str,
            v.correct_answer,
            v.explanation or "",
            v.default_points,
            v.difficulty.value if hasattr(v.difficulty, "value") else str(v.difficulty) if v.difficulty else "",
            v.cognitive_level.value if hasattr(v.cognitive_level, "value") else str(v.cognitive_level) if v.cognitive_level else "",
            tags_str,
            v.learning_outcome or ""
        ])

    return output.getvalue()


def import_questions_from_json(db: Session, json_content: str) -> int:
    """
    Import questions from JSON formatted string. Returns count imported.
    """
    data = json.loads(json_content)
    if not isinstance(data, list):
        data = [data]

    imported_count = 0
    for item in data:
        q = Question(is_banked=True, is_active=True)
        db.add(q)
        db.flush()

        tags_raw = item.get("tags")
        tags_list = tags_raw if isinstance(tags_raw, list) else ([t.strip() for t in str(tags_raw).split(",")] if tags_raw else [])

        qv = QuestionVersion(
            question_id=q.id,
            version_number=1,
            question_text=item.get("question_text", "Imported Question"),
            question_type=item.get("question_type", "mcq"),
            options=item.get("options"),
            correct_answer=item.get("correct_answer", "Option A"),
            explanation=item.get("explanation"),
            default_points=float(item.get("default_points", 1.0)),
            difficulty=item.get("difficulty", "medium"),
            cognitive_level=item.get("cognitive_level", "understand"),
            tags=tags_list,
            learning_outcome=item.get("learning_outcome"),
            estimated_completion_time_seconds=int(item.get("estimated_completion_time_seconds", 60)),
            teacher_approval_status=TeacherApprovalStatus.APPROVED,
            source_type="imported"
        )
        db.add(qv)
        imported_count += 1

    db.commit()
    return imported_count
