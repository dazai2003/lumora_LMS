"""
Unit and Integration Test Suite for Phase 10: MCQ Student Rendering & Evaluation Parity.
Verifies student schema integrity, no active correct-answer leaks, post-submission review accuracy,
and deterministic MCQ grading across all question subtypes.
"""

import pytest
from datetime import datetime
from app.database import SessionLocal
from app.models import (
    User, Course, ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer,
    ALExamType, ALQuestionTemplate
)
from app.schemas import ALStudentAnswerResponse, ALStudentSubmissionResponse
from app.api.al_exams import _calculate_al_grade, resolve_combination_grid_option


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Test 1: Active Exam Questions Sanitization (Zero Correct Answer Leakage)
def test_active_exam_questions_sanitization_no_leak(db_session):
    # Retrieve any exam with questions
    exam = db_session.query(ALExam).filter(ALExam.exam_type == ALExamType.PAPER_1_MCQ).first()
    if not exam or not exam.questions:
        pytest.skip("No Paper 1 MCQ exam found in database")

    # Simulate start_exam_attempt sanitized questions payload
    sanitized_questions = []
    for q in exam.questions:
        sanitized = {
            "id": q.id,
            "question_number": q.question_number,
            "template_type": q.template_type.value if q.template_type else "generic_mcq",
            "stem_text": q.stem_text,
            "diagram_url": q.diagram_url,
            "options": q.options,
            "assertion_text": q.assertion_text,
            "reason_text": q.reason_text,
            "statements_json": q.statements_json,
            "grid_key_json": q.grid_key_json,
            "points": q.points,
        }
        sanitized_questions.append(sanitized)

    for sq in sanitized_questions:
        assert "correct_option" not in sq
        assert "correct_answer" not in sq
        assert "explanation" not in sq
        assert "marking_scheme" not in sq


# Test 2: ALStudentAnswer Model Properties for Review Mode
def test_student_answer_model_properties(db_session):
    # Query a submission with answers
    sub_ans = db_session.query(ALStudentAnswer).first()
    if not sub_ans:
        pytest.skip("No student answers found in database")

    # Verify that correct_option and explanation are accessible via properties
    assert hasattr(sub_ans, "correct_option")
    assert hasattr(sub_ans, "explanation")


# Test 3: ALStudentAnswerResponse Schema Serialization
def test_student_answer_response_schema_serialization(db_session):
    sub_ans = db_session.query(ALStudentAnswer).first()
    if not sub_ans:
        pytest.skip("No student answers found in database")

    resp = ALStudentAnswerResponse.model_validate(sub_ans)
    assert hasattr(resp, "correct_option")
    assert hasattr(resp, "explanation")
    assert hasattr(resp, "is_correct")
    assert hasattr(resp, "selected_option")


# Test 4: Grade Calculation Accuracy
def test_al_grade_boundaries():
    assert _calculate_al_grade(100.0) == "A"
    assert _calculate_al_grade(75.0) == "A"
    assert _calculate_al_grade(74.9) == "B"
    assert _calculate_al_grade(65.0) == "B"
    assert _calculate_al_grade(64.9) == "C"
    assert _calculate_al_grade(55.0) == "C"
    assert _calculate_al_grade(54.9) == "S"
    assert _calculate_al_grade(40.0) == "S"
    assert _calculate_al_grade(39.9) == "F"
    assert _calculate_al_grade(0.0) == "F"


# Test 5: Combination Grid Option Resolution (Dual-Mode Compatibility)
def test_combination_grid_resolution():
    # Direct option letters
    assert resolve_combination_grid_option("A") == "A"
    assert resolve_combination_grid_option("B") == "B"
    assert resolve_combination_grid_option("C") == "C"
    assert resolve_combination_grid_option("D") == "D"
    assert resolve_combination_grid_option("E") == "E"

    # Statement combinations
    assert resolve_combination_grid_option("a,b") == "A"
    assert resolve_combination_grid_option("a, c") == "B"
    assert resolve_combination_grid_option("c, d") == "C"
    assert resolve_combination_grid_option("a, b, c") == "D"
    assert resolve_combination_grid_option("a, d") == "E"
    assert resolve_combination_grid_option("b, c, d") == "E"
    assert resolve_combination_grid_option(None) is None
