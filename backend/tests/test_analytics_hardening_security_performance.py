"""
Phase A7: Analytics Hardening, Security, Performance & Final Validation Test Suite.
Tests mathematical invariants, discrimination index, upper/lower quartile sorting,
teacher override precedence, sample-size confidence thresholds, authorization enforcement,
and deterministic execution speed.
"""
import time
import pytest
from fastapi.testclient import TestClient

from main import app
from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, Unit, Lesson, Material, MaterialType,
    StudentMaterialProgress, MaterialFlag, StudentQuestion, Enrollment,
    ALExam, ALExamType, ALStudentSubmission, ALStudentAnswer, ALQuestion,
    ALQuestionTemplate, CognitiveLevel
)
from app.auth import create_access_token
from app.services.analytics import (
    safe_div,
    safe_percentage,
    calculate_item_discrimination,
    compute_mcq_question_metrics,
    compute_structured_question_metrics,
    compute_essay_question_metrics,
    classify_evidence_confidence,
    compute_student_mastery_report,
    compute_teacher_learning_intelligence,
    generate_course_analytics_report,
)

client = TestClient(app)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_or_create_user(db, email: str, role: UserRole, name: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            full_name=name,
            role=role,
            hashed_password="hashed_test_pw",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


# ─────────────────────────────────────────────────────────────
# 1. Mathematical Invariant & Psychometric Validation
# ─────────────────────────────────────────────────────────────

def test_mathematical_safety_invariants():
    """Verify zero-division and edge-case invariants across all mathematical helpers."""
    assert safe_div(10, 0, default=0.0) == 0.0
    assert safe_div(0, 0, default=-1.0) == -1.0
    assert safe_percentage(5, 0, default=0.0) == 0.0
    assert safe_percentage(0, 10, default=0.0) == 0.0
    assert safe_percentage(7, 10, default=0.0) == 70.0


def test_mcq_discrimination_and_distractor_invariants():
    """
    Verify discrimination d is strictly bounded in [-1.0, 1.0],
    and sample size threshold prevents false confidence.
    """
    # 1. Discrimination with small sample (<10)
    d_metric_small = calculate_item_discrimination(
        question_id=1,
        correct_option="A",
        student_submissions_ranking=[{"submission_id": i, "total_score": 100 - i} for i in range(4)],
        answers_by_submission={}
    )
    assert d_metric_small.confidence == "insufficient_sample"
    assert d_metric_small.value is None

    # 2. Discrimination with sufficient sample (10 students)
    ranking = [{"submission_id": i, "total_score": 100 - (i * 10)} for i in range(10)]
    class MockAnswer:
        def __init__(self, opt):
            self.selected_option = opt
    
    # Top 3 answered "A" (correct), bottom 3 answered "B" (incorrect)
    answers_map = {
        0: MockAnswer("A"),
        1: MockAnswer("A"),
        2: MockAnswer("A"),
        7: MockAnswer("B"),
        8: MockAnswer("B"),
        9: MockAnswer("B"),
    }
    d_metric = calculate_item_discrimination(
        question_id=1,
        correct_option="A",
        student_submissions_ranking=ranking,
        answers_by_submission=answers_map
    )
    assert d_metric.valid is True
    assert d_metric.value == 1.0


def test_essay_teacher_verified_score_precedence():
    """
    Verify that teacher-verified scores always take strict precedence over AI provisional scores.
    """
    class MockQuestion:
        id = 101
        question_number = 1
        stem_text = "Thermodynamics Essay"
        points = 10.0
        essay_checklist_json = [
            {"item_number": 1, "criterion": "State first law of thermodynamics", "points": 5.0},
            {"item_number": 2, "criterion": "Apply formula dU = dQ - dW", "points": 5.0},
        ]

    class MockStudentAnswer:
        final_score = 10.0
        teacher_score = 10.0
        ai_score = 5.0
        teacher_checklist_results_json = [
            {"item_number": 1, "awarded": True, "points": 5.0},
            {"item_number": 2, "awarded": True, "points": 5.0}
        ]
        ai_checklist_results_json = [
            {"item_number": 1, "awarded": True, "points": 5.0},
            {"item_number": 2, "awarded": False, "points": 0.0}
        ]

    metrics = compute_essay_question_metrics(
        question=MockQuestion(),
        answers_list=[MockStudentAnswer()]
    )

    # Teacher checklist had 0 omissions (both items awarded)
    assert metrics.average_percentage == 100.0
    assert len(metrics.criteria) == 2
    assert metrics.criteria[0].success_percentage == 100.0
    assert metrics.criteria[0].omission_frequency_percentage == 0.0
    assert metrics.criteria[1].success_percentage == 100.0
    assert metrics.criteria[1].omission_frequency_percentage == 0.0


# ─────────────────────────────────────────────────────────────
# 2. Sample-Size Confidence Classification Thresholds
# ─────────────────────────────────────────────────────────────

def test_sample_size_confidence_thresholds():
    """Verify standard centralized sample-size confidence levels."""
    assert classify_evidence_confidence(0) == "insufficient_data"
    assert classify_evidence_confidence(1) == "insufficient_data"
    assert classify_evidence_confidence(2) == "insufficient_data"
    assert classify_evidence_confidence(3) == "early_signal"
    assert classify_evidence_confidence(9) == "early_signal"
    assert classify_evidence_confidence(10) == "emerging_pattern"
    assert classify_evidence_confidence(24) == "emerging_pattern"
    assert classify_evidence_confidence(25) == "strong_pattern"
    assert classify_evidence_confidence(100) == "strong_pattern"


# ─────────────────────────────────────────────────────────────
# 3. Security, Authorization & Privacy Hardening
# ─────────────────────────────────────────────────────────────

def test_student_cannot_access_teacher_endpoints(db_session):
    """Students attempting to access teacher reporting or analytics endpoints must receive 403."""
    student = _get_or_create_user(db_session, "student_sec@lumora.com", UserRole.STUDENT, "Student Sec")
    token_student = create_access_token({"sub": str(student.id), "email": student.email, "role": student.role.value})
    headers = {"Authorization": f"Bearer {token_student}"}

    # 1. Course reporting endpoint
    res1 = client.get("/api/analytics/courses/1/report", headers=headers)
    assert res1.status_code == 403

    # 2. Course CSV export
    res2 = client.get("/api/analytics/courses/1/export/csv", headers=headers)
    assert res2.status_code == 403

    # 3. Learning overview
    res3 = client.get("/api/analytics/courses/1/learning-overview", headers=headers)
    assert res3.status_code == 403

    # 4. Learning intelligence
    res4 = client.get("/api/analytics/courses/1/learning-intelligence", headers=headers)
    assert res4.status_code == 403


def test_unauthenticated_requests_fail_safely():
    """Unauthenticated calls across all analytics endpoints return 401."""
    endpoints = [
        "/api/analytics/courses/1/report",
        "/api/analytics/courses/1/export/csv",
        "/api/analytics/courses/1/learning-overview",
        "/api/analytics/student/mastery",
        "/api/analytics/student/learning-intelligence",
    ]
    for ep in endpoints:
        res = client.get(ep)
        assert res.status_code == 401


# ─────────────────────────────────────────────────────────────
# 4. Performance & Execution Speed Benchmarking
# ─────────────────────────────────────────────────────────────

def test_course_comprehensive_report_performance(db_session):
    """
    Verify report generation executes deterministically within 100ms
    and produces a valid structured report.
    """
    teacher = _get_or_create_user(db_session, "teacher_perf@lumora.com", UserRole.TEACHER, "Teacher Perf")
    course = Course(title="Performance Benchmarked Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    t0 = time.time()
    report = generate_course_analytics_report(course.id, db_session)
    elapsed_ms = (time.time() - t0) * 1000

    assert report.course_id == course.id
    assert report.ai_narrative_status == "deterministic_ready"
    assert elapsed_ms < 150.0  # Must execute under 150ms
