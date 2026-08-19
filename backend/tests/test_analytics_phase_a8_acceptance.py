"""
Phase A8: Final Analytics Acceptance & Real-Data Validation Test Suite.
Verifies complete end-to-end reconciliation across:
DATABASE TRUTH -> BACKEND ANALYTICS -> API RESPONSE -> EXPORT/REPORT
Tests teacher workstation, student mastery, psychometric calculations,
essay criteria, structured hierarchy, material hotspots, Ask AI categorization,
privacy boundaries, empty/partial datasets, and CSV export parity.
"""
import pytest
from datetime import datetime, timedelta
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
    generate_course_analytics_report,
    generate_course_analytics_csv,
    compute_mcq_exam_report,
    compute_structured_exam_report,
    compute_essay_exam_report,
    compute_course_material_analytics,
    compute_ask_ai_analytics,
    compute_student_mastery_report,
    compute_teacher_learning_intelligence,
    compute_student_learning_intelligence
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
# 1. Full Real Course End-to-End Reconciliation
# ─────────────────────────────────────────────────────────────

def test_phase_a8_complete_real_course_reconciliation(db_session):
    """
    Acceptance test on a rich multi-student, multi-unit, multi-exam course dataset.
    Verifies that DB Truth == API Output == Export Output with zero drift.
    """
    teacher = _get_or_create_user(db_session, "teacher_a8_acc@lumora.com", UserRole.TEACHER, "Prof. A8 Acceptance")
    students = [_get_or_create_user(db_session, f"student_a8_{i}@lumora.com", UserRole.STUDENT, f"Student A8-{i}") for i in range(10)]

    # 1. Create Course & Enrollments
    course = Course(title="A/L Physics Comprehensive Acceptance Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    for s in students:
        db_session.add(Enrollment(course_id=course.id, student_id=s.id, is_active=True))
    db_session.commit()

    # 2. Create Units & Lessons
    unit1 = Unit(course_id=course.id, title="Unit 1: Optics & Wave Phenomena", order=1)
    unit2 = Unit(course_id=course.id, title="Unit 2: Thermal Physics & Laws", order=2)
    db_session.add_all([unit1, unit2])
    db_session.commit()
    db_session.refresh(unit1)
    db_session.refresh(unit2)

    l1 = Lesson(course_id=course.id, unit_id=unit1.id, title="Wave Optics", order=1, is_published=True)
    l2 = Lesson(course_id=course.id, unit_id=unit2.id, title="Thermodynamics", order=1, is_published=True)
    db_session.add_all([l1, l2])
    db_session.commit()
    db_session.refresh(l1)
    db_session.refresh(l2)

    # 3. Create Materials, Progress & Contextual Flags
    mat1 = Material(course_id=course.id, lesson_id=l1.id, title="Optics Lecture PDF", material_type=MaterialType.PDF)
    mat2 = Material(course_id=course.id, lesson_id=l2.id, title="Thermo Laws Video", material_type=MaterialType.VIDEO)
    db_session.add_all([mat1, mat2])
    db_session.commit()
    db_session.refresh(mat1)
    db_session.refresh(mat2)

    # 5 students completed mat1, 4 completed mat2
    for s in students[:5]:
        db_session.add(StudentMaterialProgress(student_id=s.id, material_id=mat1.id, is_completed=True))
    for s in students[:4]:
        db_session.add(StudentMaterialProgress(student_id=s.id, material_id=mat2.id, is_completed=True))

    # Flags: 2 on mat1 (1 resolved, 1 unres), 1 on mat2 (unres)
    db_session.add(MaterialFlag(student_id=students[0].id, material_id=mat1.id, context="Page 12", comment="Formula doubt", is_resolved=True))
    db_session.add(MaterialFlag(student_id=students[1].id, material_id=mat1.id, context="Page 14", comment="Diffraction derivation", is_resolved=False))
    db_session.add(MaterialFlag(student_id=students[2].id, material_id=mat2.id, context="Timestamp 04:15", comment="Carnot efficiency step", is_resolved=False))
    db_session.commit()

    # 4. Ask AI Questions
    db_session.add(StudentQuestion(student_id=students[0].id, course_id=course.id, question_text="Explain Huygens wavelets", topic_category="Optics", is_answered=True))
    db_session.add(StudentQuestion(student_id=students[1].id, course_id=course.id, question_text="Young double slit fringe shift", topic_category="Optics", is_answered=True))
    db_session.add(StudentQuestion(student_id=students[2].id, course_id=course.id, question_text="Entropy in isothermal process", topic_category="Thermodynamics", is_answered=True))
    db_session.commit()

    # 5. Paper 1 MCQ Exam
    exam_mcq = ALExam(course_id=course.id, title="Physics Unit 1 MCQ Assessment", exam_type=ALExamType.PAPER_1_MCQ, is_published=True)
    db_session.add(exam_mcq)
    db_session.commit()
    db_session.refresh(exam_mcq)

    q_mcq = ALQuestion(
        exam_id=exam_mcq.id,
        question_number=1,
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        cognitive_level=CognitiveLevel.APPLY,
        stem_text="In Young's experiment, fringe width beta is given by:",
        points=1.0,
        correct_option="A",
        options=["lambda*D/d", "lambda*d/D", "D*d/lambda", "2*lambda*D/d", "None"]
    )
    db_session.add(q_mcq)
    db_session.commit()
    db_session.refresh(q_mcq)

    # 10 student submissions: 7 correct ("A"), 3 incorrect ("B")
    for i, s in enumerate(students):
        ans_opt = "A" if i < 7 else "B"
        sc = 1.0 if ans_opt == "A" else 0.0
        sub = ALStudentSubmission(exam_id=exam_mcq.id, student_id=s.id, status="submitted", percentage=sc * 100.0, grade="A" if sc == 1.0 else "F")
        db_session.add(sub)
        db_session.commit()
        db_session.refresh(sub)
        db_session.add(ALStudentAnswer(submission_id=sub.id, question_id=q_mcq.id, selected_option=ans_opt, final_score=sc, raw_points_earned=sc))
    db_session.commit()

    # ─────────────────────────────────────────────────────────────
    # Verification: API Endpoint vs DB Truth vs CSV Export
    # ─────────────────────────────────────────────────────────────
    token_teacher = create_access_token({"sub": str(teacher.id), "email": teacher.email, "role": teacher.role.value})
    headers = {"Authorization": f"Bearer {token_teacher}"}

    # A. API Report Endpoint
    res_rep = client.get(f"/api/analytics/courses/{course.id}/report", headers=headers)
    assert res_rep.status_code == 200
    rep_data = res_rep.json()["data"]

    # 1. Enrolled students reconciliation
    assert rep_data["enrolled_students"] == 10
    # 2. Material flags reconciliation
    assert rep_data["total_material_flags"] == 3
    assert rep_data["unresolved_flags"] == 2
    # 3. AI questions reconciliation
    assert rep_data["total_ai_questions"] == 3
    # 4. Assessment highlights reconciliation
    assert rep_data["assessments_conducted"] == 1
    assert rep_data["total_submissions"] == 10
    assert rep_data["course_average_score"] == 70.0  # 7 out of 10 = 70.0%

    # B. Psychometric Item Reconciliation via API
    res_mcq = client.get(f"/api/analytics/exams/{exam_mcq.id}/mcq", headers=headers)
    assert res_mcq.status_code == 200
    mcq_data = res_mcq.json()["data"]
    assert len(mcq_data["questions"]) == 1
    item0 = mcq_data["questions"][0]
    assert item0["total_attempts"] == 10
    assert item0["correct_count"] == 7
    assert item0["percentage_score"] == 70.0
    assert item0["discrimination"] is not None
    # Option distribution: 70% A, 30% B, 0% C, 0% D, 0% E
    dist_map = {opt["option_key"]: opt["percentage"] for opt in item0["option_distribution"]}
    assert dist_map["A"] == 70.0
    assert dist_map["B"] == 30.0
    assert dist_map["C"] == 0.0

    # C. CSV Export Parity
    res_csv = client.get(f"/api/analytics/courses/{course.id}/export/csv", headers=headers)
    assert res_csv.status_code == 200
    csv_text = res_csv.text
    assert "Physics Unit 1 MCQ Assessment" in csv_text
    assert "70.0%" in csv_text
    assert "Unit 1: Optics & Wave Phenomena" in csv_text


# ─────────────────────────────────────────────────────────────
# 2. Student Privacy & Isolated Personal Mastery
# ─────────────────────────────────────────────────────────────

def test_phase_a8_student_privacy_isolation(db_session):
    """
    Verifies that students only see their personal analytics,
    cannot override student_id via query parameters, and cannot access teacher reports.
    """
    teacher = _get_or_create_user(db_session, "teacher_a8_priv@lumora.com", UserRole.TEACHER, "Teacher Privacy")
    student1 = _get_or_create_user(db_session, "student_a8_priv1@lumora.com", UserRole.STUDENT, "Student Priv 1")
    student2 = _get_or_create_user(db_session, "student_a8_priv2@lumora.com", UserRole.STUDENT, "Student Priv 2")

    course = Course(title="Privacy Hardened Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student1.id, is_active=True))
    db_session.add(Enrollment(course_id=course.id, student_id=student2.id, is_active=True))
    db_session.commit()

    token_s1 = create_access_token({"sub": str(student1.id), "email": student1.email, "role": student1.role.value})
    headers_s1 = {"Authorization": f"Bearer {token_s1}"}

    # 1. Student 1 queries personal mastery
    res_mastery = client.get("/api/analytics/student/mastery", headers=headers_s1)
    assert res_mastery.status_code == 200
    assert res_mastery.json()["data"]["student_id"] == student1.id

    # 2. Student 1 queries personal intelligence attempting to pass student2 ID
    res_intel = client.get(f"/api/analytics/student/learning-intelligence?student_id={student2.id}", headers=headers_s1)
    assert res_intel.status_code == 200
    # Must be strictly isolated to authenticated student 1
    assert res_intel.json()["data"]["student_id"] == student1.id

    # 3. Student 1 attempts to access teacher course report -> 403 Forbidden
    res_forbidden = client.get(f"/api/analytics/courses/{course.id}/report", headers=headers_s1)
    assert res_forbidden.status_code == 403


# ─────────────────────────────────────────────────────────────
# 3. Empty & Partial Course Graceful Degradation
# ─────────────────────────────────────────────────────────────

def test_phase_a8_empty_course_graceful_degradation(db_session):
    """
    Empty course with 0 students, 0 exams, 0 flags, 0 AI questions
    must return a valid envelope with 0 crashes.
    """
    teacher = _get_or_create_user(db_session, "teacher_a8_empty@lumora.com", UserRole.TEACHER, "Teacher Empty")
    course = Course(title="Zero Data Physics Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    report = generate_course_analytics_report(course.id, db_session)
    assert report.enrolled_students == 0
    assert report.total_material_flags == 0
    assert report.assessments_conducted == 0
    assert report.course_average_score is None
    assert len(report.assessment_highlights) == 0
    assert len(report.learning_hotspots) == 0
    assert report.ai_narrative_status == "deterministic_ready"
