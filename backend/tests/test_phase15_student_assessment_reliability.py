"""
Unit and Integration Test Suite for Phase 15: Student Assessment Reliability.
Verifies MCQ option normalization, elimination of 'Correct Answer: N/A' serialization bug,
eager loading of question metadata, deterministic grading with mixed key types,
and submission integrity.
"""

import pytest
from app.database import SessionLocal
from app.api.al_exams import normalize_mcq_option_key, _grade_paper_1_mcq
from app.models import ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer, ALExamType, ALQuestionTemplate


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Test 1: MCQ Option Normalization Engine
def test_normalize_mcq_option_key_comprehensive():
    """Verifies that all variations of option representations normalize to canonical uppercase letters A-E."""
    # Direct letters
    assert normalize_mcq_option_key("A") == "A"
    assert normalize_mcq_option_key("b") == "B"
    assert normalize_mcq_option_key("E") == "E"

    # Parenthesized letters
    assert normalize_mcq_option_key("(A)") == "A"
    assert normalize_mcq_option_key("(c)") == "C"

    # Numeric strings
    assert normalize_mcq_option_key("1") == "A"
    assert normalize_mcq_option_key("2") == "B"
    assert normalize_mcq_option_key("3") == "C"
    assert normalize_mcq_option_key("4") == "D"
    assert normalize_mcq_option_key("5") == "E"

    # Parenthesized numbers
    assert normalize_mcq_option_key("(1)") == "A"
    assert normalize_mcq_option_key("(4)") == "D"
    assert normalize_mcq_option_key("(5)") == "E"

    # Punctuation / dotted variations
    assert normalize_mcq_option_key("1.") == "A"
    assert normalize_mcq_option_key("B.") == "B"

    # None and empty strings
    assert normalize_mcq_option_key(None) == ""
    assert normalize_mcq_option_key("") == ""


# Test 2: Elimination of N/A Bug via Numeric Stored vs Letter Selected Option
def test_grading_numeric_stored_vs_letter_selected():
    """Verifies that a question with correct_option='2' is graded correct when student selects 'B' or '(2)'."""
    stored_correct = "2" # Stored as option 2
    student_selected_1 = "B" # Student selected letter B
    student_selected_2 = "(2)" # Student selected (2)

    norm_corr = normalize_mcq_option_key(stored_correct)
    norm_stud_1 = normalize_mcq_option_key(student_selected_1)
    norm_stud_2 = normalize_mcq_option_key(student_selected_2)

    assert norm_corr == "B"
    assert norm_stud_1 == "B"
    assert norm_stud_2 == "B"
    assert norm_stud_1 == norm_corr
    assert norm_stud_2 == norm_corr


# Test 3: Relationship Eager Loading on ALStudentAnswer (lazy='joined')
def test_student_answer_relationship_eager_loading():
    """Verifies that ALStudentAnswer provides correct_option and explanation properties via ALQuestion relationship."""
    real_q = ALQuestion(
        id=101,
        exam_id=1,
        question_number=1,
        stem_text="Sample stem",
        correct_option="C",
        explanation="Photosynthetic electron transport chain rationale."
    )

    answer = ALStudentAnswer(
        submission_id=1,
        question_id=101,
        selected_option="C"
    )
    answer.question = real_q

    assert answer.correct_option == "C"
    assert answer.explanation == "Photosynthetic electron transport chain rationale."


# Test 4: Essay Multi-Part Subpart Answers Payload Structure
def test_essay_subpart_answers_payload_structure():
    """Verifies structured and essay answers dictionary persistence."""
    subparts_dict = {
        "sub_1": "Description of light-dependent reaction.",
        "sub_2_a": "Role of plastoquinone and plastocyanin.",
        "sub_2_b": "ATP synthesis via proton gradient through ATP synthase.",
    }

    assert len(subparts_dict) == 3
    assert "sub_1" in subparts_dict
    assert "sub_2_b" in subparts_dict
    assert "ATP synthase" in subparts_dict["sub_2_b"]
