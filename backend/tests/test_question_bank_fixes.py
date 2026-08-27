import asyncio
from app.database import SessionLocal
from app.models import Question, QuestionVersion, QuestionType, Difficulty
from app.api.questions import get_question_analytics

def test_question_bank_error_fixes():
    """Verify get_question_analytics works cleanly."""
    db = SessionLocal()
    try:
        # Create test question and version
        q = Question(lesson_id=None, is_banked=True, is_active=True)
        db.add(q)
        db.commit()
        db.refresh(q)

        qv = QuestionVersion(
            question_id=q.id,
            question_text="[Test Question Bank Error Fixes] Test Q Text",
            question_type=QuestionType.MCQ,
            correct_answer="A",
            difficulty=Difficulty.MEDIUM,
        )
        db.add(qv)
        db.commit()
        db.refresh(qv)

        # Test Question Analytics lookup by parent question ID and version ID
        res1 = get_question_analytics(question_id=q.id, current_user=None, db=db)
        q_id_1 = getattr(res1, "question_id", None) or (res1.get("question_id") if isinstance(res1, dict) else None)
        assert q_id_1 == q.id

        res2 = get_question_analytics(question_id=qv.id, current_user=None, db=db)
        q_id_2 = getattr(res2, "question_id", None) or (res2.get("question_id") if isinstance(res2, dict) else None)
        assert q_id_2 == q.id

        print(f"[SUCCESS] Question Bank Error Fixes verified 100%!")

    finally:
        db.close()

if __name__ == "__main__":
    test_question_bank_error_fixes()
