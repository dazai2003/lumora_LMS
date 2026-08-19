"""
Unit & Integration Test Suite for Phase A6: Analytics Intelligence UI, Advanced Visualization & Reporting.
Verifies multi-layer comprehensive course report generation, CSV data export,
executive summaries, assessment highlights, difficult question detection,
and strict teacher authorization boundaries.
"""
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
    generate_course_analytics_report,
    generate_course_analytics_csv
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


def test_course_comprehensive_report_empty(db_session):
    """Empty course produces safe deterministic report with zero crash."""
    teacher = _get_or_create_user(db_session, "teacher_a6_empty@lumora.com", UserRole.TEACHER, "Teacher A6 Empty")
    course = Course(title="Empty Physics A6 Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    report = generate_course_analytics_report(course.id, db_session)
    assert report.course_id == course.id
    assert report.enrolled_students == 0
    assert report.assessments_conducted == 0
    assert report.total_submissions == 0
    assert report.course_average_score is None
    assert len(report.assessment_highlights) == 0
    assert len(report.top_difficult_questions) == 0
    assert len(report.recommended_teacher_actions) >= 1


def test_course_comprehensive_report_and_csv(db_session):
    """Active course produces full structured report and valid CSV export."""
    teacher = _get_or_create_user(db_session, "teacher_a6_active@lumora.com", UserRole.TEACHER, "Teacher A6 Active")
    student = _get_or_create_user(db_session, "student_a6_active@lumora.com", UserRole.STUDENT, "Student A6 Active")

    course = Course(title="Comprehensive A6 Reporting Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))
    db_session.commit()

    unit1 = Unit(course_id=course.id, title="Unit 1: Optics & Waves", order=1)
    db_session.add(unit1)
    db_session.commit()
    db_session.refresh(unit1)

    lesson1 = Lesson(course_id=course.id, unit_id=unit1.id, title="Wave Optics", order=1, is_published=True)
    db_session.add(lesson1)
    db_session.commit()
    db_session.refresh(lesson1)

    mat1 = Material(course_id=course.id, lesson_id=lesson1.id, title="Interference PDF", material_type=MaterialType.PDF)
    db_session.add(mat1)
    db_session.commit()
    db_session.refresh(mat1)

    db_session.add(StudentMaterialProgress(student_id=student.id, material_id=mat1.id, is_completed=True))
    db_session.add(MaterialFlag(student_id=student.id, material_id=mat1.id, context="Page 8", comment="Young double slit derivation", is_resolved=False))
    db_session.commit()

    exam = ALExam(course_id=course.id, title="Optics Term Exam", exam_type=ALExamType.PAPER_1_MCQ, is_published=True)
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    q1 = ALQuestion(
        exam_id=exam.id,
        question_number=1,
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        cognitive_level=CognitiveLevel.APPLY,
        stem_text="Fringe width in Young double slit",
        points=1.0,
        correct_option="C",
        options=["0.2mm", "0.4mm", "0.6mm", "0.8mm", "1.0mm"]
    )
    db_session.add(q1)
    db_session.commit()
    db_session.refresh(q1)

    sub = ALStudentSubmission(exam_id=exam.id, student_id=student.id, status="submitted", percentage=70.0, grade="B")
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)

    db_session.add(ALStudentAnswer(submission_id=sub.id, question_id=q1.id, selected_option="C", final_score=1.0, raw_points_earned=1.0))
    db_session.commit()

    # Generate report
    report = generate_course_analytics_report(course.id, db_session)
    assert report.course_id == course.id
    assert report.enrolled_students == 1
    assert report.assessments_conducted == 1
    assert report.total_submissions == 1
    assert report.course_average_score == 70.0
    assert len(report.assessment_highlights) == 1
    assert report.assessment_highlights[0].exam_title == "Optics Term Exam"
    assert len(report.syllabus_breakdown) == 1
    assert report.syllabus_breakdown[0]["unit_title"] == "Unit 1: Optics & Waves"

    # Generate CSV
    csv_text = generate_course_analytics_csv(course.id, db_session)
    assert "Lumora LMS — Course Comprehensive Analytics Dossier" in csv_text or "Lumora LMS" in csv_text
    assert "Comprehensive A6 Reporting Course" in csv_text
    assert "Optics Term Exam" in csv_text
    assert "Unit 1: Optics & Waves" in csv_text


def test_api_report_and_csv_authorization(db_session):
    """Verifies teacher authorization boundaries on the /report and /export/csv endpoints."""
    teacher_owner = _get_or_create_user(db_session, "teacher_a6_owner@lumora.com", UserRole.TEACHER, "Teacher A6 Owner")
    teacher_other = _get_or_create_user(db_session, "teacher_a6_other@lumora.com", UserRole.TEACHER, "Teacher A6 Other")
    student = _get_or_create_user(db_session, "student_a6_auth@lumora.com", UserRole.STUDENT, "Student A6 Auth")

    course = Course(title="Auth Protected Course", teacher_id=teacher_owner.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    token_owner = create_access_token({"sub": str(teacher_owner.id), "email": teacher_owner.email, "role": teacher_owner.role.value})
    token_other = create_access_token({"sub": str(teacher_other.id), "email": teacher_other.email, "role": teacher_other.role.value})
    token_student = create_access_token({"sub": str(student.id), "email": student.email, "role": student.role.value})

    headers_owner = {"Authorization": f"Bearer {token_owner}"}
    headers_other = {"Authorization": f"Bearer {token_other}"}
    headers_student = {"Authorization": f"Bearer {token_student}"}

    # 1. Owner can access report and CSV
    res = client.get(f"/api/analytics/courses/{course.id}/report", headers=headers_owner)
    assert res.status_code == 200
    assert res.json()["data"]["course_id"] == course.id

    res_csv = client.get(f"/api/analytics/courses/{course.id}/export/csv", headers=headers_owner)
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]

    # 2. Other teacher cannot access (403)
    res_other = client.get(f"/api/analytics/courses/{course.id}/report", headers=headers_other)
    assert res_other.status_code == 403

    res_csv_other = client.get(f"/api/analytics/courses/{course.id}/export/csv", headers=headers_other)
    assert res_csv_other.status_code == 403

    # 3. Student cannot access teacher reports (403)
    res_student = client.get(f"/api/analytics/courses/{course.id}/report", headers=headers_student)
    assert res_student.status_code == 403


def test_phase_t8_multi_scope_csv_exports(db_session):
    """Verifies all 6 CSV export scopes: course_summary, student_roster, assessment_items, unit_analytics, material_analytics, and flag_data."""
    teacher = _get_or_create_user(db_session, "teacher_t8_scopes@lumora.com", UserRole.TEACHER, "Teacher T8 Scopes")
    student1 = _get_or_create_user(db_session, "student_t8_1@lumora.com", UserRole.STUDENT, "Student T8 Alpha")
    student2 = _get_or_create_user(db_session, "student_t8_2@lumora.com", UserRole.STUDENT, "Student T8 Beta")

    course = Course(title="Phase T8 Reporting Excellence Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student1.id, is_active=True))
    db_session.add(Enrollment(course_id=course.id, student_id=student2.id, is_active=True))
    db_session.commit()

    unit = Unit(course_id=course.id, title="Unit 1: Thermodynamics", order=1)
    db_session.add(unit)
    db_session.commit()
    db_session.refresh(unit)

    lesson = Lesson(course_id=course.id, unit_id=unit.id, title="Heat Engines", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat = Material(course_id=course.id, lesson_id=lesson.id, title="Carnot Cycle Notes", material_type=MaterialType.PDF)
    db_session.add(mat)
    db_session.commit()
    db_session.refresh(mat)

    db_session.add(StudentMaterialProgress(student_id=student1.id, material_id=mat.id, is_completed=True))
    db_session.add(MaterialFlag(student_id=student1.id, material_id=mat.id, context="Page 4", comment="Second law entropy derivation unclear", is_resolved=False))
    db_session.commit()

    exam = ALExam(course_id=course.id, title="Thermodynamics Mid-Term", exam_type=ALExamType.PAPER_1_MCQ, is_published=True)
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    q1 = ALQuestion(
        exam_id=exam.id,
        question_number=1,
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        cognitive_level=CognitiveLevel.APPLY,
        stem_text="Efficiency of Carnot Engine",
        points=1.0,
        correct_option="B",
        options=["20%", "40%", "60%", "80%", "100%"]
    )
    db_session.add(q1)
    db_session.commit()
    db_session.refresh(q1)

    sub1 = ALStudentSubmission(exam_id=exam.id, student_id=student1.id, status="submitted", percentage=80.0, grade="A")
    db_session.add(sub1)
    db_session.commit()
    db_session.refresh(sub1)

    db_session.add(ALStudentAnswer(submission_id=sub1.id, question_id=q1.id, selected_option="B", final_score=1.0, raw_points_earned=1.0))
    db_session.commit()

    token = create_access_token({"sub": str(teacher.id), "email": teacher.email, "role": teacher.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Course Summary CSV
    csv1 = generate_course_analytics_csv(course.id, db_session, export_type="course_summary")
    assert "Course Analytics Summary" in csv1 or "Lumora LMS" in csv1
    assert "Thermodynamics" in csv1

    # 2. Student Roster CSV
    csv2 = generate_course_analytics_csv(course.id, db_session, export_type="student_roster")
    assert "Student ID,Student Name,Email" in csv2
    assert "Student T8 Alpha" in csv2
    assert "Student T8 Beta" in csv2

    # 3. Assessment Items CSV
    csv3 = generate_course_analytics_csv(course.id, db_session, export_type="assessment_items")
    assert "Exam Title,Question #,Template Type,Cognitive Level" in csv3
    assert "Thermodynamics Mid-Term" in csv3

    # 4. Unit Analytics CSV
    csv4 = generate_course_analytics_csv(course.id, db_session, export_type="unit_analytics")
    assert "Unit Title,Material Completion %" in csv4
    assert "Unit 1: Thermodynamics" in csv4

    # 5. Material Analytics CSV
    csv5 = generate_course_analytics_csv(course.id, db_session, export_type="material_analytics")
    assert "Material Title,Type,Lesson ID,Total Views" in csv5
    assert "Carnot Cycle Notes" in csv5

    # 6. Flag Data CSV
    csv6 = generate_course_analytics_csv(course.id, db_session, export_type="flag_data")
    assert "Flag ID,Material Title,Student Name,Context Location" in csv6
    assert "Second law entropy derivation unclear" in csv6

    # 7. Test API query parameter dispatch
    res_roster = client.get(f"/api/analytics/courses/{course.id}/export/csv?type=student_roster", headers=headers)
    assert res_roster.status_code == 200
    assert "student_roster" in res_roster.headers.get("content-disposition", "")
    assert "Student T8 Alpha" in res_roster.text

    res_flags = client.get(f"/api/analytics/courses/{course.id}/export/csv?type=flag_data", headers=headers)
    assert res_flags.status_code == 200
    assert "flag_data" in res_flags.headers.get("content-disposition", "")
    assert "Second law entropy derivation unclear" in res_flags.text

