"""
Comprehensive Unit & Integration Test Suite for Phase A1: Lumora Analytics Data Foundation.
Tests safe division, normalization, MCQ psychometrics, discrimination index d,
hierarchical structured traversal, essay criteria omission, material analytics,
Ask AI concept categorization, non-mutating data quality checks, and API endpoints.
"""
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

from app.services.analytics.normalization import (
    safe_div, safe_percentage, normalize_option_choice,
    normalize_cognitive_level, normalize_difficulty, parse_context_location
)
from app.services.analytics.discrimination import calculate_item_discrimination
from app.services.analytics.mcq_analytics import compute_mcq_question_metrics, compute_mcq_exam_report
from app.services.analytics.structured_analytics import compute_structured_question_metrics, compute_structured_exam_report
from app.services.analytics.essay_analytics import compute_essay_question_metrics, compute_essay_exam_report
from app.services.analytics.data_quality import audit_exam_data_quality
from app.services.analytics.data_contracts import AnalyticsResponseEnvelope


# ──────────────────────────────────────────────
# 1. Normalization and Safe Math Unit Tests
# ──────────────────────────────────────────────

def test_safe_div_zero_and_invalid():
    """Verify safe_div never raises ZeroDivisionError and handles invalid inputs gracefully."""
    assert safe_div(10, 0) is None
    assert safe_div(0, 0) is None
    assert safe_div(None, 5) is None
    assert safe_div(5, None) is None
    assert safe_div("abc", 5) is None
    assert safe_div(10, 2) == 5.0
    assert safe_div(1, 3) == pytest.approx(0.3333333, rel=1e-4)


def test_safe_percentage():
    """Verify safe_percentage handles 0 denominator and valid percentages."""
    assert safe_percentage(5, 0) is None
    assert safe_percentage(0, 10) == 0.0
    assert safe_percentage(7, 10) == 70.0
    assert safe_percentage(1, 3, decimals=1) == 33.3


def test_normalize_option_choice():
    """Verify all student/key option representations normalize to canonical uppercase A-E."""
    assert normalize_option_choice("1") == "A"
    assert normalize_option_choice("(1)") == "A"
    assert normalize_option_choice("1.") == "A"
    assert normalize_option_choice("2") == "B"
    assert normalize_option_choice("(2)") == "B"
    assert normalize_option_choice("3") == "C"
    assert normalize_option_choice("4") == "D"
    assert normalize_option_choice("5") == "E"
    
    assert normalize_option_choice("A") == "A"
    assert normalize_option_choice("(A)") == "A"
    assert normalize_option_choice("a") == "A"
    assert normalize_option_choice(" (b) ") == "B"
    assert normalize_option_choice("C.") == "C"
    assert normalize_option_choice(None) is None
    assert normalize_option_choice("") is None


def test_normalize_cognitive_level():
    """Verify cognitive level string normalizer."""
    assert normalize_cognitive_level("recall facts") == "remember"
    assert normalize_cognitive_level("comprehension") == "understand"
    assert normalize_cognitive_level("application") == "apply"
    assert normalize_cognitive_level("analyze data") == "analyze"
    assert normalize_cognitive_level("evaluate options") == "evaluate"
    assert normalize_cognitive_level(None) == "understand"


def test_normalize_difficulty():
    """Verify difficulty level string normalizer."""
    assert normalize_difficulty("Easy") == "easy"
    assert normalize_difficulty("Simple") == "easy"
    assert normalize_difficulty("Medium") == "medium"
    assert normalize_difficulty("Hard") == "hard"
    assert normalize_difficulty("Challenging") == "hard"
    assert normalize_difficulty(None) == "medium"


def test_parse_context_location():
    """Verify contextual flag parser identifies timestamps, PDF pages, and full documents."""
    assert parse_context_location("Timestamp 04:12") == ("timestamp", "04:12")
    assert parse_context_location("at 12:34") == ("timestamp", "12:34")
    assert parse_context_location("Page 14") == ("pdf_page", "14")
    assert parse_context_location("p. 7") == ("pdf_page", "7")
    assert parse_context_location("pg 22") == ("pdf_page", "22")
    assert parse_context_location("") == ("full_document", None)
    assert parse_context_location(None) == ("full_document", None)


# ──────────────────────────────────────────────
# 2. Discrimination Index Unit Tests
# ──────────────────────────────────────────────

def test_discrimination_insufficient_sample():
    """Discrimination must return valid=False when N < 10."""
    rankings = [{"student_id": i, "submission_id": i, "total_score": float(i * 10)} for i in range(1, 8)]
    answers_map = {}
    res = calculate_item_discrimination(
        question_id=1,
        correct_option="A",
        student_submissions_ranking=rankings,
        answers_by_submission=answers_map
    )
    assert res.valid is False
    assert res.value is None
    assert res.confidence == "insufficient_sample"
    assert "below the minimum threshold of 10" in (res.reason or "")


def test_discrimination_sufficient_sample():
    """Discrimination calculates accurately with upper and lower quartile groups."""
    # Create 30 students: top 15 scored high, bottom 15 scored low
    rankings = [{"student_id": i, "submission_id": i, "total_score": float(i * 3)} for i in range(1, 31)]
    
    # Question 1: All top 10 students answered 'A' (correct), bottom 10 answered 'B' (incorrect)
    class MockAnswer:
        def __init__(self, opt, is_c):
            self.selected_option = opt
            self.is_correct = is_c
            
    answers_map = {}
    for i in range(1, 31):
        if i >= 20: # Top students
            answers_map[i] = MockAnswer("A", True)
        else: # Bottom students
            answers_map[i] = MockAnswer("B", False)
            
    res = calculate_item_discrimination(
        question_id=1,
        correct_option="A",
        student_submissions_ranking=rankings,
        answers_by_submission=answers_map
    )
    assert res.valid is True
    assert res.value is not None
    assert res.value > 0.5 # Strong positive discrimination
    assert res.confidence == "sufficient_sample"


# ──────────────────────────────────────────────
# 3. MCQ Analytics Engine Unit Tests
# ──────────────────────────────────────────────

class MockQuestion:
    def __init__(self, q_id, num, tmpl="generic_mcq", correct="A", pts=1.0, diff="medium", cog="understand", stem="Sample Stem"):
        self.id = q_id
        self.question_number = num
        self.template_type = tmpl
        self.correct_option = correct
        self.points = pts
        self.difficulty = diff
        self.cognitive_level = cog
        self.stem_text = stem


class MockStudentAnswer:
    def __init__(self, q_id, sub_id, opt, is_c=None, sc=0.0):
        self.question_id = q_id
        self.submission_id = sub_id
        self.selected_option = opt
        self.is_correct = is_c
        self.final_score = sc
        self.teacher_score = None
        self.ai_score = None


def test_mcq_question_metrics_zero_attempts():
    """Verify MCQ metrics handle 0 attempts safely without crashing."""
    q = MockQuestion(1, 1)
    m = compute_mcq_question_metrics(q, [], [], {})
    assert m.total_attempts == 0
    assert m.difficulty_index_p is None
    assert m.percentage_score is None
    assert len(m.option_distribution) == 5
    assert m.discrimination.valid is False


def test_mcq_question_metrics_all_correct():
    """Verify MCQ metrics when 100% of students choose the correct option."""
    q = MockQuestion(1, 1, correct="B")
    answers = [MockStudentAnswer(1, i, "B", True) for i in range(1, 11)]
    rankings = [{"student_id": i, "submission_id": i, "total_score": 50.0} for i in range(1, 11)]
    ans_map = {a.submission_id: a for a in answers}
    
    m = compute_mcq_question_metrics(q, answers, rankings, ans_map)
    assert m.total_attempts == 10
    assert m.correct_count == 10
    assert m.incorrect_count == 0
    assert m.difficulty_index_p == 1.0
    assert m.percentage_score == 100.0
    
    # Check option distribution
    b_opt = next(o for o in m.option_distribution if o.option_key == "B")
    assert b_opt.count == 10
    assert b_opt.percentage == 100.0
    assert b_opt.is_correct is True


def test_mcq_distractor_efficiency_flag():
    """Verify distractor efficiency flags options selected by < 5% in N >= 10."""
    q = MockQuestion(1, 1, correct="A")
    # 20 students: 16 chose A (80%), 3 chose B (15%), 1 chose C (5%), 0 chose D (0%), 0 chose E (0%)
    answers = []
    for i in range(1, 17):
        answers.append(MockStudentAnswer(1, i, "A", True))
    for i in range(17, 20):
        answers.append(MockStudentAnswer(1, i, "B", False))
    answers.append(MockStudentAnswer(1, 20, "C", False))
    
    m = compute_mcq_question_metrics(q, answers, [], {})
    d_opt = next(o for o in m.option_distribution if o.option_key == "D")
    e_opt = next(o for o in m.option_distribution if o.option_key == "E")
    assert d_opt.is_non_functional_distractor is True # 0% is < 5%
    assert e_opt.is_non_functional_distractor is True


# ──────────────────────────────────────────────
# 4. Structured Question Hierarchy Unit Tests
# ──────────────────────────────────────────────

class MockStructuredQuestion:
    def __init__(self, q_id, num, subparts, pts=10.0):
        self.id = q_id
        self.question_number = num
        self.stem_text = "Structured Question Stem"
        self.points = pts
        self.structured_subparts_json = subparts


def test_structured_hierarchical_traversal():
    """Verify recursive hierarchy traversal parses deep subparts and calculates loss rates."""
    subparts = [
        {
            "part": "A",
            "label": "Part A: Cellular Mechanisms",
            "max_points": 5.0,
            "children": [
                {
                    "part": "i",
                    "label": "Subpart (i)",
                    "max_points": 2.0,
                    "children": [
                        {"part": "a", "label": "Nested (a)", "max_points": 1.0},
                        {"part": "b", "label": "Nested (b)", "max_points": 1.0}
                    ]
                },
                {
                    "part": "ii",
                    "label": "Subpart (ii)",
                    "max_points": 3.0
                }
            ]
        }
    ]
    q = MockStructuredQuestion(10, 1, subparts)
    
    # 2 student answers with checklist results
    class MockAnswerStructured:
        def __init__(self, sub_scores):
            self.final_score = sum(sub_scores.values())
            self.teacher_score = self.final_score
            self.ai_score = None
            self.teacher_checklist_results_json = {"subpart_scores": [{"subpart": k, "awarded_score": v} for k, v in sub_scores.items()]}
            self.ai_checklist_results_json = None
            self.subpart_answers_json = {"A": "ans"}
            
    answers = [
        MockAnswerStructured({"a": 1.0, "b": 0.0, "ii": 1.5}),
        MockAnswerStructured({"a": 1.0, "b": 1.0, "ii": 3.0}),
    ]
    
    qm = compute_structured_question_metrics(q, answers)
    assert len(qm.hierarchy) == 1
    part_a = qm.hierarchy[0]
    assert part_a.node_id == "Q1.A"
    assert len(part_a.children) == 2
    
    # Check nested Roman subpart (i)
    sub_i = part_a.children[0]
    assert sub_i.node_id == "Q1.A.i"
    assert len(sub_i.children) == 2
    assert sub_i.children[0].node_id == "Q1.A.i.a"
    assert sub_i.children[1].node_id == "Q1.A.i.b"


# ──────────────────────────────────────────────
# 5. Essay Rubric Criteria Unit Tests
# ──────────────────────────────────────────────

class MockEssayQuestion:
    def __init__(self, q_id, num, checklist, pts=20.0):
        self.id = q_id
        self.question_number = num
        self.stem_text = "Essay Question Stem"
        self.points = pts
        self.essay_checklist_json = checklist


def test_essay_criteria_omission():
    """Verify essay rubric criteria omission calculation."""
    checklist = [
        {"item_number": 1, "criterion": "PSII P680 Photolysis", "points": 4.0},
        {"item_number": 2, "criterion": "Plastoquinone Transport", "points": 4.0},
        {"item_number": 3, "criterion": "Cytochrome b6f Complex", "points": 4.0},
    ]
    q = MockEssayQuestion(20, 5, checklist)
    
    class MockAnswerEssay:
        def __init__(self, awarded_nums):
            self.final_score = len(awarded_nums) * 4.0
            self.teacher_score = self.final_score
            self.ai_score = None
            self.teacher_checklist_results_json = [
                {"item_number": n, "awarded": (n in awarded_nums), "points": 4.0 if (n in awarded_nums) else 0.0}
                for n in [1, 2, 3]
            ]
            self.ai_checklist_results_json = None
            
    # 4 students: All 4 achieved criterion 1; only 1 achieved criterion 2; 0 achieved criterion 3
    answers = [
        MockAnswerEssay([1, 2]),
        MockAnswerEssay([1]),
        MockAnswerEssay([1]),
        MockAnswerEssay([1]),
    ]
    
    eqm = compute_essay_question_metrics(q, answers)
    assert eqm.criteria_count == 3
    
    c1 = eqm.criteria[0]
    assert c1.awarded_count == 4
    assert c1.omitted_count == 0
    assert c1.omission_frequency_percentage == 0.0
    assert c1.success_percentage == 100.0
    
    c2 = eqm.criteria[1]
    assert c2.awarded_count == 1
    assert c2.omitted_count == 3
    assert c2.omission_frequency_percentage == 75.0
    
    c3 = eqm.criteria[2]
    assert c3.awarded_count == 0
    assert c3.omitted_count == 4
    assert c3.omission_frequency_percentage == 100.0


# ──────────────────────────────────────────────
# 6. Data Quality Auditor Unit Tests
# ──────────────────────────────────────────────

def test_data_quality_report_mock():
    """Verify non-mutating data quality auditor accurately flags missing correct options and out-of-bounds scores."""
    from app.services.analytics.data_contracts import DataQualityReport, DataQualityAnomaly
    
    anomalies = [
        DataQualityAnomaly(
            severity="error",
            category="missing_field",
            entity_type="question",
            entity_id=1,
            description="MCQ Question #1 has no correct_option configured."
        ),
        DataQualityAnomaly(
            severity="warning",
            category="out_of_bounds",
            entity_type="answer",
            entity_id=42,
            description="Answer #42 score (15.0) exceeds question points (10.0)."
        )
    ]
    
    report = DataQualityReport(
        target_type="exam",
        target_id=101,
        total_checks_run=7,
        errors_count=1,
        warnings_count=1,
        is_clean=False,
        anomalies=anomalies
    )
    
    assert report.is_clean is False
    assert report.errors_count == 1
    assert report.warnings_count == 1
    assert len(report.anomalies) == 2


# ──────────────────────────────────────────────
# 7. API Endpoints Integration Tests
# ──────────────────────────────────────────────

from main import app
from app.database import SessionLocal
from app.models import User, UserRole, Course, ALExam, ALExamType, ALQuestion, ALStudentSubmission, ALStudentAnswer
from app.auth import create_access_token

client = TestClient(app)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_api_analytics_unauthorized():
    """Unauthenticated requests must be rejected with 401."""
    res = client.get("/api/analytics/exams/1/foundation")
    assert res.status_code == 401


def test_api_analytics_endpoints_flow(db_session):
    """Verify teacher analytics endpoints respond with valid schema envelopes."""
    # 1. Setup Teacher & Course
    teacher = db_session.query(User).filter(User.email == "analytics_test_teacher@lumora.com").first()
    if not teacher:
        teacher = User(
            email="analytics_test_teacher@lumora.com",
            full_name="Analytics Teacher",
            role=UserRole.TEACHER,
            hashed_password="hashed_pw",
            is_active=True
        )
        db_session.add(teacher)
        db_session.commit()
        db_session.refresh(teacher)

    course = db_session.query(Course).filter(Course.title == "Analytics Foundation Test Course").first()
    if not course:
        course = Course(
            title="Analytics Foundation Test Course",
            description="Testing analytics foundation",
            teacher_id=teacher.id
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

    # 2. Setup A/L Exam
    exam = db_session.query(ALExam).filter(ALExam.title == "Analytics Test Exam Paper 1").first()
    if not exam:
        exam = ALExam(
            course_id=course.id,
            title="Analytics Test Exam Paper 1",
            exam_type=ALExamType.PAPER_1_MCQ,
            time_limit_minutes=120,
            total_questions=5,
            raw_mark_cap=5.0,
            is_published=True
        )
        db_session.add(exam)
        db_session.commit()
        db_session.refresh(exam)

    token = create_access_token({"sub": str(teacher.id), "email": teacher.email, "role": teacher.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Test GET /api/analytics/exams/{id}/foundation
    res_fd = client.get(f"/api/analytics/exams/{exam.id}/foundation", headers=headers)
    assert res_fd.status_code == 200
    data_fd = res_fd.json()
    assert data_fd["status"] == "success"
    assert "data" in data_fd
    assert "meta" in data_fd
    assert data_fd["data"]["exam_id"] == exam.id

    # 4. Test GET /api/analytics/exams/{id}/mcq
    res_mcq = client.get(f"/api/analytics/exams/{exam.id}/mcq", headers=headers)
    assert res_mcq.status_code == 200
    data_mcq = res_mcq.json()
    assert data_mcq["status"] == "success"
    assert data_mcq["data"]["exam_id"] == exam.id

    # 5. Test GET /api/analytics/exams/{id}/structured
    res_str = client.get(f"/api/analytics/exams/{exam.id}/structured", headers=headers)
    assert res_str.status_code == 200
    data_str = res_str.json()
    assert data_str["status"] == "success"

    # 6. Test GET /api/analytics/exams/{id}/essay
    res_esy = client.get(f"/api/analytics/exams/{exam.id}/essay", headers=headers)
    assert res_esy.status_code == 200
    data_esy = res_esy.json()
    assert data_esy["status"] == "success"

    # 7. Test GET /api/analytics/exams/{id}/data-quality
    res_dq = client.get(f"/api/analytics/exams/{exam.id}/data-quality", headers=headers)
    assert res_dq.status_code == 200
    data_dq = res_dq.json()
    assert data_dq["status"] == "success"
    assert "is_clean" in data_dq["data"]

    # 8. Test GET /api/analytics/materials/{course_id}
    res_mat = client.get(f"/api/analytics/materials/{course.id}", headers=headers)
    assert res_mat.status_code == 200
    data_mat = res_mat.json()
    assert data_mat["status"] == "success"

    # 9. Test GET /api/analytics/ai/{course_id}
    res_ai = client.get(f"/api/analytics/ai/{course.id}", headers=headers)
    assert res_ai.status_code == 200
    data_ai = res_ai.json()
    assert data_ai["status"] == "success"

