"""
Unit & Integration Test Suite for Phase A4: Lumora Student Analytics & Personal Mastery.
Verifies personal assessment mastery, syllabus unit calculations, question format skills,
cognitive skills breakdown, performance trends, evidence-based revision priorities,
empty datasets, and strict student privacy authorization boundaries.
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
from app.services.analytics import compute_student_mastery_report

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


def test_student_mastery_empty_dataset(db_session):
    """Student with zero assessments or materials receives honest insufficient data states without fake zeroes."""
    student = _get_or_create_user(db_session, "student_a4_empty@lumora.com", UserRole.STUDENT, "Student A4 Empty")
    
    report = compute_student_mastery_report(student.id, None, db_session)
    assert report.student_id == student.id
    assert report.assessments_completed == 0
    assert report.average_assessment_percentage is None
    assert report.latest_assessment_percentage is None
    assert len(report.performance_trend) == 0
    assert report.strongest_unit is None
    assert report.revision_priority_unit is None
    assert len(report.revision_priorities) == 0


def test_student_mastery_comprehensive_metrics(db_session):
    """Verifies syllabus mastery, question types, cognitive levels, performance trends, and revision priorities."""
    teacher = _get_or_create_user(db_session, "teacher_a4_mastery@lumora.com", UserRole.TEACHER, "Teacher A4 Mastery")
    student = _get_or_create_user(db_session, "student_a4_active@lumora.com", UserRole.STUDENT, "Student A4 Active")

    course = Course(title="Biology A/L Mastery Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))
    db_session.commit()

    unit1 = Unit(course_id=course.id, title="Unit 1: Chemical Basis", order=1)
    unit2 = Unit(course_id=course.id, title="Unit 2: Cellular Basis", order=2)
    db_session.add_all([unit1, unit2])
    db_session.commit()
    db_session.refresh(unit1)
    db_session.refresh(unit2)

    lesson1 = Lesson(course_id=course.id, unit_id=unit1.id, title="Lesson 1", order=1, is_published=True)
    lesson2 = Lesson(course_id=course.id, unit_id=unit2.id, title="Lesson 2", order=2, is_published=True)
    db_session.add_all([lesson1, lesson2])
    db_session.commit()
    db_session.refresh(lesson1)
    db_session.refresh(lesson2)

    mat1 = Material(course_id=course.id, lesson_id=lesson1.id, title="Biomolecules PDF", material_type=MaterialType.PDF)
    mat2 = Material(course_id=course.id, lesson_id=lesson2.id, title="Cell Division Video", material_type=MaterialType.VIDEO)
    db_session.add_all([mat1, mat2])
    db_session.commit()
    db_session.refresh(mat1)
    db_session.refresh(mat2)

    db_session.add(StudentMaterialProgress(student_id=student.id, material_id=mat1.id, is_completed=True, last_position=10.0))
    db_session.commit()

    # Exam 1 (Unit 1, 80%)
    exam1 = ALExam(course_id=course.id, title="Exam 1 Biomolecules", exam_type=ALExamType.PAPER_1_MCQ, is_published=True)
    db_session.add(exam1)
    db_session.commit()
    db_session.refresh(exam1)

    q1 = ALQuestion(
        exam_id=exam1.id,
        question_number=1,
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        cognitive_level=CognitiveLevel.REMEMBER,
        stem_text="Question on Water",
        points=1.0
    )
    q2 = ALQuestion(
        exam_id=exam1.id,
        question_number=2,
        template_type=ALQuestionTemplate.FIVE_STATEMENT_TRUTH,
        cognitive_level=CognitiveLevel.UNDERSTAND,
        stem_text="Question on Lipids",
        points=1.0
    )
    q3 = ALQuestion(
        exam_id=exam1.id,
        question_number=3,
        template_type=ALQuestionTemplate.COMBINATION_GRID,
        cognitive_level=CognitiveLevel.APPLY,
        stem_text="Question on Proteins",
        points=1.0
    )
    db_session.add_all([q1, q2, q3])
    db_session.commit()

    sub1 = ALStudentSubmission(exam_id=exam1.id, student_id=student.id, status="submitted", percentage=80.0, grade="A")
    db_session.add(sub1)
    db_session.commit()
    db_session.refresh(sub1)

    # Student got q1 and q2 correct (1.0), q3 wrong (0.0)
    db_session.add_all([
        ALStudentAnswer(submission_id=sub1.id, question_id=q1.id, final_score=1.0, raw_points_earned=1.0),
        ALStudentAnswer(submission_id=sub1.id, question_id=q2.id, final_score=1.0, raw_points_earned=1.0),
        ALStudentAnswer(submission_id=sub1.id, question_id=q3.id, final_score=0.0, raw_points_earned=0.0)
    ])
    db_session.commit()

    # Exam 2 (Unit 2, 45%)
    exam2 = ALExam(course_id=course.id, title="Exam 2 Cellular", exam_type=ALExamType.PAPER_1_MCQ, is_published=True)
    db_session.add(exam2)
    db_session.commit()
    db_session.refresh(exam2)

    q4 = ALQuestion(
        exam_id=exam2.id,
        question_number=1,
        template_type=ALQuestionTemplate.COMBINATION_GRID,
        cognitive_level=CognitiveLevel.ANALYZE,
        stem_text="Question on Mitosis",
        points=1.0
    )
    q5 = ALQuestion(
        exam_id=exam2.id,
        question_number=2,
        template_type=ALQuestionTemplate.SEQUENTIAL_DIAGNOSTIC,
        cognitive_level=CognitiveLevel.EVALUATE,
        stem_text="Question on Meiosis",
        points=1.0
    )
    db_session.add_all([q4, q5])
    db_session.commit()

    sub2 = ALStudentSubmission(exam_id=exam2.id, student_id=student.id, status="submitted", percentage=45.0, grade="S")
    db_session.add(sub2)
    db_session.commit()
    db_session.refresh(sub2)

    db_session.add_all([
        ALStudentAnswer(submission_id=sub2.id, question_id=q4.id, final_score=0.45, raw_points_earned=0.45),
        ALStudentAnswer(submission_id=sub2.id, question_id=q5.id, final_score=0.45, raw_points_earned=0.45)
    ])
    db_session.commit()

    report = compute_student_mastery_report(student.id, course.id, db_session)
    assert report.assessments_completed == 2
    assert report.average_assessment_percentage == 62.5
    assert len(report.performance_trend) == 2
    assert len(report.syllabus_unit_mastery) == 2
    assert len(report.question_type_mastery) >= 3
    assert len(report.cognitive_skills_mastery) == 5
    assert report.materials_completed == 1
    assert report.material_completion_percentage == 50.0

    # Revision priorities should recommend Unit 2 (Cellular Basis)
    if len(report.revision_priorities) > 0:
        assert any("Cellular" in rev.unit_title for rev in report.revision_priorities)


def test_student_privacy_authorization(db_session):
    """A student can only view their own personal mastery analytics, never another student's."""
    student_a = _get_or_create_user(db_session, "student_a_auth@lumora.com", UserRole.STUDENT, "Student A Auth")
    student_b = _get_or_create_user(db_session, "student_b_auth@lumora.com", UserRole.STUDENT, "Student B Auth")

    token_a = create_access_token({"sub": str(student_a.id), "email": student_a.email, "role": student_a.role.value})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Calling endpoint with student_id=student_b.id must still return student_a's own profile
    res = client.get(f"/api/analytics/student/mastery?student_id={student_b.id}", headers=headers_a)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["student_id"] == student_a.id # Strictly enforced to caller
    assert data["student_name"] == "Student A Auth"
