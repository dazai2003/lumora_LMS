"""
Unit tests verifying ALExam total_marks calculation, dynamic scoring, and official G.C.E. A/L grade boundaries.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base, ALExam, ALQuestion, ALExamType, ALQuestionTemplate, ALStudentSubmission, ALStudentAnswer
from app.api.exams import calculate_al_grade, _grade_paper_1_mcq

TEST_DB_URL = "sqlite:///:memory:"

@pytest.fixture
def db_session():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def test_calculate_al_grade_boundaries():
    """Verify official Sri Lankan G.C.E. A/L grade boundaries."""
    assert calculate_al_grade(100.0) == "A"
    assert calculate_al_grade(75.0) == "A"
    assert calculate_al_grade(74.9) == "B"
    assert calculate_al_grade(65.0) == "B"
    assert calculate_al_grade(64.9) == "C"
    assert calculate_al_grade(55.0) == "C"
    assert calculate_al_grade(54.9) == "S"
    assert calculate_al_grade(40.0) == "S"
    assert calculate_al_grade(39.9) == "F"
    assert calculate_al_grade(0.0) == "F"


def test_al_exam_total_marks_property(db_session):
    """Verify ALExam.total_marks computes accurate sum of question points."""
    exam = ALExam(
        title="Test Composite Exam",
        exam_type=ALExamType.PAPER_1_MCQ,
        course_id=1,
        total_questions=3,
        score_multiplier=1.0,
    )
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    assert exam.total_marks == 0.0

    # Add questions with custom points
    q1 = ALQuestion(exam_id=exam.id, question_number=1, stem_text="Q1", points=1.0, correct_option="A")
    q2 = ALQuestion(exam_id=exam.id, question_number=2, stem_text="Q2", points=2.5, correct_option="B")
    q3 = ALQuestion(exam_id=exam.id, question_number=3, stem_text="Q3", points=10.0, correct_option="C")
    db_session.add_all([q1, q2, q3])
    db_session.commit()
    db_session.refresh(exam)

    assert exam.total_marks == 13.5


def test_mcq_grading_with_custom_points(db_session):
    """Verify _grade_paper_1_mcq calculates percentage accurately based on total question points."""
    exam = ALExam(
        title="MCQ Custom Points Paper",
        exam_type=ALExamType.PAPER_1_MCQ,
        course_id=1,
        total_questions=2,
        score_multiplier=1.0,
    )
    db_session.add(exam)
    db_session.commit()

    q1 = ALQuestion(exam_id=exam.id, question_number=1, stem_text="MCQ 1", points=2.0, correct_option="A")
    q2 = ALQuestion(exam_id=exam.id, question_number=2, stem_text="MCQ 2", points=3.0, correct_option="B")
    db_session.add_all([q1, q2])
    db_session.commit()
    db_session.refresh(exam)

    submission = ALStudentSubmission(
        exam_id=exam.id,
        student_id=1,
        status="in_progress",
    )
    db_session.add(submission)
    db_session.commit()

    # Answer Q1 correct (2.0 pts), Q2 incorrect (0.0 pts) -> 2.0 / 5.0 = 40.0% -> Grade S
    a1 = ALStudentAnswer(submission_id=submission.id, question_id=q1.id, selected_option="A")
    a2 = ALStudentAnswer(submission_id=submission.id, question_id=q2.id, selected_option="C")
    db_session.add_all([a1, a2])
    db_session.commit()
    db_session.refresh(submission)

    _grade_paper_1_mcq(submission, exam, db_session)

    assert submission.raw_score == 2.0
    assert submission.percentage == 40.0
    assert submission.grade == "S"
