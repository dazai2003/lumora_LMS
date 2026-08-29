import pytest
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models import ALExam, ALQuestion, ALExamType, ALQuestionTemplate, Course, User, UserRole
from app.services.assessments.exam_sequencer import resequence_exam_questions_canonically

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_resequence_auto_syncs_total_questions(db_session):
    """Verify that resequencing automatically synchronizes exam.total_questions with actual question count."""
    course = db_session.query(Course).first()
    if not course:
        teacher = User(
            email="test_sync_teacher@lumora.com",
            full_name="Test Sync Teacher",
            role=UserRole.TEACHER,
            hashed_password="hashed_pw",
            is_active=True
        )
        db_session.add(teacher)
        db_session.commit()
        db_session.refresh(teacher)

        course = Course(
            title="Test Sync Course",
            description="Test Course for Sync",
            teacher_id=teacher.id
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

    exam = ALExam(
        course_id=course.id,
        title="Test Sync Verification Exam",
        exam_type=ALExamType.PAPER_1_MCQ,
        time_limit_minutes=60,
        total_questions=100,  # Initially set to incorrect target
        is_published=True
    )
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    # Add 3 questions
    for i in range(1, 4):
        q = ALQuestion(
            exam_id=exam.id,
            question_number=i,
            template_type=ALQuestionTemplate.GENERIC_MCQ,
            stem_text=f"Sample Question Stem {i}",
            points=1.0
        )
        db_session.add(q)
    db_session.commit()

    # Before resequence, total_questions is 100
    assert exam.total_questions == 100

    # Resequence canonically
    resequence_exam_questions_canonically(exam.id, db_session)
    db_session.refresh(exam)

    # After resequence, total_questions must be strictly 3
    assert exam.total_questions == 3

    # Clean up test exam
    db_session.query(ALQuestion).filter(ALQuestion.exam_id == exam.id).delete()
    db_session.delete(exam)
    db_session.commit()
