"""
Test suite verifying the Analytics Refinement & Data-Truth Corrections pass.
Ensures zero-data or inactive students never receive positive mastery labels,
and verifies explicit evidence-based states across all metrics.
"""
import pytest
from sqlalchemy.orm import Session

from main import app
from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, Unit, Lesson, Material, MaterialType,
    StudentMaterialProgress, MaterialFlag, StudentQuestion, Enrollment,
    ALExam, ALExamType, ALStudentSubmission, ALStudentAnswer, ALQuestion,
    ALQuestionTemplate, CognitiveLevel
)
from app.services.analytics import (
    compute_student_mastery_report,
    compute_student_learning_intelligence,
    compute_teacher_learning_intelligence
)


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


def test_zero_activity_student_receives_honest_no_data_state(db_session: Session):
    """
    CASE 1: Inactive student (0 lessons, 0 materials, 0 exams, 0 flags, 0 AI questions).
    MUST NOT receive 'Strong', 'Healthy', 'Balanced', or 'Solid personal mastery'.
    """
    teacher = _get_or_create_user(db_session, "teacher_refine1@lumora.com", UserRole.TEACHER, "Teacher Refine 1")
    student = _get_or_create_user(db_session, "student_zero_act@lumora.com", UserRole.STUDENT, "Student Zero Activity")

    course = Course(title="Zero Activity Chemistry Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))
    
    unit1 = Unit(course_id=course.id, title="Unit 1: Chemical Calculations", order=1)
    db_session.add(unit1)
    db_session.commit()
    db_session.refresh(unit1)

    lesson1 = Lesson(course_id=course.id, unit_id=unit1.id, title="Stoichiometry", order=1, is_published=True)
    db_session.add(lesson1)
    db_session.commit()
    db_session.refresh(lesson1)

    mat1 = Material(course_id=course.id, lesson_id=lesson1.id, title="Lecture Notes PDF", material_type=MaterialType.PDF)
    db_session.add(mat1)
    db_session.commit()

    # 1. Compute Mastery Report
    report = compute_student_mastery_report(student.id, course.id, db_session)
    assert report.assessments_completed == 0
    assert report.materials_completed == 0
    assert report.average_assessment_percentage is None
    assert report.strongest_unit is None
    assert report.revision_priority_unit is None
    assert len(report.revision_priorities) == 0

    # Syllabus unit must be 'Not Started'
    assert len(report.syllabus_unit_mastery) == 1
    u_mastery = report.syllabus_unit_mastery[0]
    assert u_mastery.mastery_status == "Not Started"
    assert u_mastery.assessment_mastery_percentage is None
    assert "No study or assessment activity" in u_mastery.data_source_note

    # Question formats must be 'Not Attempted'
    for qf in report.question_type_mastery:
        assert qf.mastery_status == "Not Attempted"
        assert qf.accuracy_percentage is None
        assert qf.attempts_count == 0

    # Cognitive skills must be 'Not Attempted'
    for cog in report.cognitive_skills_mastery:
        assert cog.mastery_status == "Not Attempted"
        assert cog.accuracy_percentage is None
        assert cog.attempts_count == 0

    # 2. Compute Learning Intelligence
    intel = compute_student_learning_intelligence(student.id, course.id, db_session)
    assert "appear as you study" in intel.personal_executive_narrative.lower()
    assert len(intel.personal_hotspots) == 1
    hotspot = intel.personal_hotspots[0]
    assert hotspot.priority_level == "NOT_STARTED"
    assert "No study activity or assessment" in hotspot.neutral_insight


def test_material_studied_without_assessments_gives_honest_status(db_session: Session):
    """
    CASE 2: Student studies materials but has not taken any assessments.
    Mastery status must be 'Studied — Awaiting Assessment' with 0 false claims.
    """
    teacher = _get_or_create_user(db_session, "teacher_refine2@lumora.com", UserRole.TEACHER, "Teacher Refine 2")
    student = _get_or_create_user(db_session, "student_studied_no_exam@lumora.com", UserRole.STUDENT, "Student Studied No Exam")

    course = Course(title="Studied Chemistry Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))
    unit1 = Unit(course_id=course.id, title="Unit 1: Thermodynamics", order=1)
    db_session.add(unit1)
    db_session.commit()
    db_session.refresh(unit1)

    lesson1 = Lesson(course_id=course.id, unit_id=unit1.id, title="Enthalpy", order=1, is_published=True)
    db_session.add(lesson1)
    db_session.commit()
    db_session.refresh(lesson1)

    mat1 = Material(course_id=course.id, lesson_id=lesson1.id, title="Thermodynamics Guide", material_type=MaterialType.PDF)
    db_session.add(mat1)
    db_session.commit()
    db_session.refresh(mat1)

    # Student completes material
    db_session.add(StudentMaterialProgress(student_id=student.id, material_id=mat1.id, is_completed=True))
    db_session.commit()

    report = compute_student_mastery_report(student.id, course.id, db_session)
    assert report.materials_completed == 1
    assert report.material_completion_percentage == 100.0
    assert report.assessments_completed == 0
    assert len(report.revision_priorities) == 0

    u_mastery = report.syllabus_unit_mastery[0]
    assert u_mastery.mastery_status == "Studied — Awaiting Assessment"
    assert u_mastery.assessment_mastery_percentage is None

    intel = compute_student_learning_intelligence(student.id, course.id, db_session)
    assert "Complete practice assessments" in intel.personal_executive_narrative


def test_early_assessment_evidence_status(db_session: Session):
    """
    CASE 3: Student completes 1 exam question (low sample size < 3).
    Mastery status must be 'Early Evidence' or 'Early Data', NOT strong conclusions.
    """
    teacher = _get_or_create_user(db_session, "teacher_refine3@lumora.com", UserRole.TEACHER, "Teacher Refine 3")
    student = _get_or_create_user(db_session, "student_early_data@lumora.com", UserRole.STUDENT, "Student Early Data")

    course = Course(title="Early Data Biology Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))
    unit1 = Unit(course_id=course.id, title="Unit 1: Cell Structure", order=1)
    db_session.add(unit1)
    db_session.commit()
    db_session.refresh(unit1)

    lesson1 = Lesson(course_id=course.id, unit_id=unit1.id, title="Organelles", order=1, is_published=True)
    db_session.add(lesson1)
    db_session.commit()
    db_session.refresh(lesson1)

    exam = ALExam(course_id=course.id, title="Cell MCQ Quiz", exam_type=ALExamType.PAPER_1_MCQ, is_published=True)
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    q1 = ALQuestion(
        exam_id=exam.id,
        question_number=1,
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        cognitive_level=CognitiveLevel.REMEMBER,
        stem_text="What organelle synthesizes ATP?",
        points=1.0,
        correct_option="A",
        options=["Mitochondria", "Ribosome", "Golgi", "Lysosome", "Vacuole"]
    )
    db_session.add(q1)
    db_session.commit()
    db_session.refresh(q1)

    sub = ALStudentSubmission(exam_id=exam.id, student_id=student.id, status="submitted", percentage=100.0, grade="A")
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)

    db_session.add(ALStudentAnswer(submission_id=sub.id, question_id=q1.id, selected_option="A", final_score=1.0, raw_points_earned=1.0))
    db_session.commit()

    report = compute_student_mastery_report(student.id, course.id, db_session)
    assert report.assessments_completed == 1
    assert report.average_assessment_percentage == 100.0

    u_mastery = report.syllabus_unit_mastery[0]
    assert u_mastery.mastery_status == "Early Evidence"
    assert u_mastery.attempts_count == 1

    # Generic MCQ format must be 'Early Data'
    mcq_fmt = next(f for f in report.question_type_mastery if f.template_type == "generic_mcq")
    assert mcq_fmt.mastery_status == "Early Data"
    assert mcq_fmt.attempts_count == 1
    assert mcq_fmt.accuracy_percentage == 100.0

    # Other formats must remain 'Not Attempted'
    seq_fmt = next(f for f in report.question_type_mastery if f.template_type == "sequential_diagnostic")
    assert seq_fmt.mastery_status == "Not Attempted"
    assert seq_fmt.accuracy_percentage is None

    # Deep Dive
    assert report.mcq_deep_dive["total_attempted"] == 1
    assert report.mcq_deep_dive["correct_count"] == 1
    assert report.mcq_deep_dive["accuracy_percentage"] == 100.0
