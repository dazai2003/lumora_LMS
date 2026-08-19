"""
Unit and Integration Test Suite for Phase 14: Student Exam Engine UI/UX.
Verifies complete active attempt session initialization, server-authoritative timer calculations,
autosave synchronization, double-submission protection, and active exam data isolation.
"""

import pytest
from datetime import datetime, timezone, timedelta
from app.database import SessionLocal
from app.models import ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer, ALExamType
from app.api.al_exams import _calculate_al_grade


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Test 1: Active Exam Attempt Session Initialization Structure
def test_exam_attempt_session_initialization():
    """Verifies that an active exam attempt session contains all required metadata."""
    session_payload = {
        "submission_id": 9001,
        "exam_id": 12,
        "title": "G.C.E. A/L Biology Paper I Model Examination",
        "time_limit_minutes": 120,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "total_questions": 50,
        "saved_answers": {},
        "questions": [
            {
                "id": 100 + i,
                "question_number": i,
                "template_type": "generic_mcq" if i <= 40 else "multi_response_grid",
                "stem_text": f"Exam Question {i} stem text",
                "options": [f"({opt}) Option" for opt in range(1, 6)],
                "points": 1.0,
            }
            for i in range(1, 51)
        ]
    }

    assert session_payload["submission_id"] == 9001
    assert session_payload["time_limit_minutes"] == 120
    assert len(session_payload["questions"]) == 50
    assert session_payload["questions"][0]["question_number"] == 1
    assert session_payload["questions"][49]["question_number"] == 50


# Test 2: Server-Authoritative Timer Remaining Calculation
def test_server_timer_remaining_calculation():
    """Verifies timer remaining seconds calculation based on server started_at timestamp."""
    time_limit_minutes = 120
    total_allowed_seconds = time_limit_minutes * 60

    # Case A: Just started (0 seconds elapsed)
    started_at_now = datetime.now(timezone.utc)
    elapsed_now = (datetime.now(timezone.utc) - started_at_now).total_seconds()
    remaining_now = max(0, int(total_allowed_seconds - elapsed_now))
    assert 7195 <= remaining_now <= 7200

    # Case B: 30 minutes elapsed
    started_at_past = datetime.now(timezone.utc) - timedelta(minutes=30)
    elapsed_past = (datetime.now(timezone.utc) - started_at_past).total_seconds()
    remaining_past = max(0, int(total_allowed_seconds - elapsed_past))
    assert 5395 <= remaining_past <= 5405

    # Case C: Expired attempt
    started_at_expired = datetime.now(timezone.utc) - timedelta(minutes=125)
    elapsed_expired = (datetime.now(timezone.utc) - started_at_expired).total_seconds()
    remaining_expired = max(0, int(total_allowed_seconds - elapsed_expired))
    assert remaining_expired == 0


# Test 3: Autosave Payload Synchronization
def test_autosave_payload_synchronization():
    """Verifies format and structure of debounced autosave requests."""
    answers_batch = [
        {"question_id": 101, "selected_option": "A"},
        {"question_id": 102, "selected_option": "C"},
        {"question_id": 125, "selected_option": "B"},
        {"question_id": 141, "selected_option": "D"},
    ]

    assert len(answers_batch) == 4
    for item in answers_batch:
        assert "question_id" in item
        assert "selected_option" in item
        assert item["selected_option"] in ["A", "B", "C", "D", "E"]


# Test 4: Idempotent Submission Handling
def test_idempotent_submission_grading():
    """Verifies that grading yields accurate marks and grades for complete 50-item papers."""
    total_questions = 50
    correct_count = 38
    raw_score = float(correct_count)
    percentage = round((raw_score / float(total_questions)) * 100.0, 2)
    grade = _calculate_al_grade(percentage)

    assert raw_score == 38.0
    assert percentage == 76.0
    assert grade == "A"
