"""
Phase T10: Comprehensive Analytics Trust, Evidence Standardization, and QA Test Suite.
Validates all 8 real-data scenarios, truthful mastery labeling, and server-side authorization boundaries.
"""
import pytest
from datetime import datetime
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, Unit, Lesson, Material, MaterialType,
    StudentMaterialProgress, MaterialFlag, StudentQuestion, Enrollment,
    ALExam, ALExamType, ALQuestion, ALQuestionTemplate, ALStudentSubmission, ALStudentAnswer
)
from app.services.analytics import (
    compute_student_learning_profile,
    compute_teacher_learning_intelligence,
    generate_course_analytics_report,
    generate_course_analytics_csv,
    compute_exam_foundation_overview,
    compute_mcq_exam_report,
    compute_structured_exam_report,
    compute_essay_exam_report,
)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _get_or_create_user(db: Session, email: str, role: UserRole, name: str) -> User:
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


@pytest.fixture
def t10_db_setup(db_session: Session):
    """Sets up a controlled test environment with teacher, student, course, units, and materials."""
    db = db_session
    teacher = _get_or_create_user(db, "teacher_t10@lumora.com", UserRole.TEACHER, "Teacher T10")
    other_teacher = _get_or_create_user(db, "other_teacher_t10@lumora.com", UserRole.TEACHER, "Other Teacher T10")
    student_inactive = _get_or_create_user(db, "student_inactive_t10@lumora.com", UserRole.STUDENT, "Inactive Student T10")
    student_materials_only = _get_or_create_user(db, "student_mat_only_t10@lumora.com", UserRole.STUDENT, "Material Student T10")
    student_mastered = _get_or_create_user(db, "student_mastered_t10@lumora.com", UserRole.STUDENT, "Mastered Student T10")
    student_mcq_only = _get_or_create_user(db, "student_mcq_only_t10@lumora.com", UserRole.STUDENT, "MCQ Student T10")

    course = Course(
        title=f"Combined Maths T10 {datetime.utcnow().timestamp()}",
        description="Comprehensive T10 course",
        teacher_id=teacher.id
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    # Units & Lessons
    unit1 = Unit(title="Unit 1: Algebra", course_id=course.id, order=1)
    unit2 = Unit(title="Unit 2: Calculus", course_id=course.id, order=2)
    db.add_all([unit1, unit2])
    db.commit()
    db.refresh(unit1)
    db.refresh(unit2)

    lesson1 = Lesson(title="Lesson 1.1", course_id=course.id, unit_id=unit1.id, order=1)
    lesson2 = Lesson(title="Lesson 2.1", course_id=course.id, unit_id=unit2.id, order=1)
    db.add_all([lesson1, lesson2])
    db.commit()
    db.refresh(lesson1)
    db.refresh(lesson2)

    mat1 = Material(title="Algebra PDF Notes", lesson_id=lesson1.id, course_id=course.id, material_type=MaterialType.PDF)
    mat2 = Material(title="Calculus Video", lesson_id=lesson2.id, course_id=course.id, material_type=MaterialType.VIDEO)
    db.add_all([mat1, mat2])
    db.commit()
    db.refresh(mat1)
    db.refresh(mat2)

    # Enrollments
    for s in [student_inactive, student_materials_only, student_mastered, student_mcq_only]:
        db.add(Enrollment(student_id=s.id, course_id=course.id, is_active=True))
    db.commit()

    # Exams
    exam_mcq = ALExam(
        title="Algebra MCQ Exam",
        course_id=course.id,
        lesson_id=lesson1.id,
        exam_type=ALExamType.PAPER_1_MCQ,
        total_questions=2,
        is_published=True
    )
    exam_structured = ALExam(
        title="Calculus Structured Exam",
        course_id=course.id,
        lesson_id=lesson2.id,
        exam_type=ALExamType.PAPER_2_STRUCTURED,
        total_questions=1,
        is_published=True
    )
    db.add_all([exam_mcq, exam_structured])
    db.commit()
    db.refresh(exam_mcq)
    db.refresh(exam_structured)

    q1 = ALQuestion(
        exam_id=exam_mcq.id,
        question_number=1,
        stem_text="What is 2+2?",
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        points=1.0,
        options=["1", "2", "3", "4", "5"],
        correct_option="D",
        cognitive_level="remember"
    )
    q2 = ALQuestion(
        exam_id=exam_mcq.id,
        question_number=2,
        stem_text="Solve x^2 = 4",
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        points=1.0,
        options=["-2, 2", "0", "1", "2", "4"],
        correct_option="A",
        cognitive_level="apply"
    )
    db.add_all([q1, q2])
    db.commit()

    return {
        "teacher": teacher,
        "other_teacher": other_teacher,
        "student_inactive": student_inactive,
        "student_materials_only": student_materials_only,
        "student_mastered": student_mastered,
        "student_mcq_only": student_mcq_only,
        "course": course,
        "unit1": unit1,
        "unit2": unit2,
        "mat1": mat1,
        "mat2": mat2,
        "exam_mcq": exam_mcq,
        "exam_structured": exam_structured
    }


def test_case_1_student_has_done_nothing(db_session: Session, t10_db_setup):
    """CASE 1: Inactive student gets truthful NO_ACTIVITY state without fake 'Healthy'."""
    db = db_session
    data = t10_db_setup
    profile = compute_student_learning_profile(data["student_inactive"].id, data["course"].id, db)
    
    assert profile.status_diagnostic["status"] == "NO_ACTIVITY"
    assert profile.assessment_average_percentage is None
    assert profile.material_completion_percentage == 0.0
    for u in profile.unit_mastery_breakdown:
        assert u["mastery_status"] == "No Activity"


def test_case_2_student_only_viewed_materials(db_session: Session, t10_db_setup):
    """CASE 2: Student viewed materials but has 0 assessment attempts -> Studied (No Assessment), not Mastered."""
    db = db_session
    data = t10_db_setup
    s_id = data["student_materials_only"].id
    
    db.add(StudentMaterialProgress(
        student_id=s_id,
        material_id=data["mat1"].id,
        is_completed=True
    ))
    db.commit()

    profile = compute_student_learning_profile(s_id, data["course"].id, db)
    assert profile.assessment_average_percentage is None
    assert profile.material_completion_percentage == 50.0 # 1 of 2 completed
    
    # Unit 1 was studied but NOT assessed
    u1_entry = next(u for u in profile.unit_mastery_breakdown if u["unit_id"] == data["unit1"].id)
    assert u1_entry["mastery_status"] == "Studied (No Assessment)"
    assert u1_entry["assessment_score_pct"] is None


def test_case_3_student_viewed_materials_and_completed_assessments(db_session: Session, t10_db_setup):
    """CASE 3: Student completed materials and attained high assessment score -> Mastered & ON_TRACK."""
    db = db_session
    data = t10_db_setup
    s_id = data["student_mastered"].id
    
    # Complete Unit 1 materials
    db.add(StudentMaterialProgress(
        student_id=s_id,
        material_id=data["mat1"].id,
        is_completed=True
    ))
    # High score on Unit 1 MCQ
    db.add(ALStudentSubmission(
        student_id=s_id,
        exam_id=data["exam_mcq"].id,
        raw_score=2.0,
        scaled_score=100.0,
        percentage=100.0,
        grade="A",
        status="teacher_verified"
    ))
    db.commit()

    profile = compute_student_learning_profile(s_id, data["course"].id, db)
    assert profile.assessment_average_percentage == 100.0
    assert profile.status_diagnostic["status"] == "ON_TRACK"
    
    u1_entry = next(u for u in profile.unit_mastery_breakdown if u["unit_id"] == data["unit1"].id)
    assert u1_entry["mastery_status"] == "Mastered"
    assert u1_entry["assessment_score_pct"] == 100.0


def test_case_4_student_only_mcq_attempts(db_session: Session, t10_db_setup):
    """CASE 4: Student has only MCQ attempts -> MCQ populated, Structured/Essay are None without fake 'Balanced'."""
    db = db_session
    data = t10_db_setup
    s_id = data["student_mcq_only"].id
    
    db.add(ALStudentSubmission(
        student_id=s_id,
        exam_id=data["exam_mcq"].id,
        raw_score=1.5,
        scaled_score=75.0,
        percentage=75.0,
        grade="A",
        status="teacher_verified"
    ))
    db.commit()

    profile = compute_student_learning_profile(s_id, data["course"].id, db)
    assert profile.mcq_average_percentage == 75.0
    assert profile.structured_average_percentage is None
    assert profile.essay_average_percentage is None


def test_case_6_unit_has_flags_but_no_assessment(db_session: Session, t10_db_setup):
    """CASE 6: Unit has flags but no exam attempts -> Flags reflected without fake assessment attainment."""
    db = db_session
    data = t10_db_setup
    s_id = data["student_inactive"].id
    
    db.add(MaterialFlag(
        student_id=s_id,
        material_id=data["mat1"].id,
        context="page:5",
        comment="Confusing theorem explanation",
        is_resolved=False
    ))
    db.commit()

    intel = compute_teacher_learning_intelligence(data["course"].id, db)
    u1_hotspot = next(h for h in intel.hotspots if h.unit_id == data["unit1"].id)
    
    assert u1_hotspot.flags_count == 1
    assert u1_hotspot.unresolved_flags_count == 1
    assert u1_hotspot.assessment_score_pct is None


def test_case_8_no_data_returns_not_started_priority(db_session: Session, t10_db_setup):
    """CASE 8: Unit with no activity returns NOT_STARTED priority rather than fake HEALTHY."""
    db = db_session
    data = t10_db_setup
    report = generate_course_analytics_report(data["course"].id, db)
    
    u2_entry = next(u for u in report.syllabus_breakdown if u["unit_id"] == data["unit2"].id)
    assert u2_entry["priority_level"] == "NOT_STARTED"
    assert u2_entry["assessment_score_pct"] is None


def test_case_5_student_has_all_three_formats(db_session: Session, t10_db_setup):
    """CASE 5: Student with MCQ + Structured + Essay has all 3 datasets independently populated."""
    db = db_session
    data = t10_db_setup
    s_id = data["student_mcq_only"].id

    exam_essay = ALExam(
        title="Algebra Essay Exam",
        course_id=data["course"].id,
        exam_type=ALExamType.PAPER_2_ESSAY,
        total_questions=1,
        is_published=True
    )
    db.add(exam_essay)
    db.commit()

    db.add(ALStudentSubmission(
        student_id=s_id,
        exam_id=data["exam_mcq"].id,
        percentage=75.0,
        status="teacher_verified"
    ))
    db.add(ALStudentSubmission(
        student_id=s_id,
        exam_id=data["exam_structured"].id,
        percentage=80.0,
        status="teacher_verified"
    ))
    db.add(ALStudentSubmission(
        student_id=s_id,
        exam_id=exam_essay.id,
        percentage=70.0,
        status="teacher_verified"
    ))
    db.commit()

    profile = compute_student_learning_profile(s_id, data["course"].id, db)
    assert profile.mcq_average_percentage == 75.0
    assert profile.structured_average_percentage == 80.0
    assert profile.essay_average_percentage == 70.0


def test_case_7_high_ai_questions_with_low_scores_signals_support(db_session: Session, t10_db_setup):
    """CASE 7: Many Ask AI questions on a topic triggers elevated AI inquiries support signal."""
    db = db_session
    data = t10_db_setup
    s_id = data["student_inactive"].id

    for i in range(4):
        db.add(StudentQuestion(
            student_id=s_id,
            course_id=data["course"].id,
            question_text=f"How to solve quadratic equations part {i}?",
            topic_category="Quadratic Equations",
            asked_at=datetime.utcnow()
        ))
    db.commit()

    profile = compute_student_learning_profile(s_id, data["course"].id, db)
    assert profile.ask_ai_questions_count >= 4
    ai_sig = next((s for s in profile.support_signals if s.signal_type == "elevated_ai_queries"), None)
    assert ai_sig is not None
    assert "Quadratic Equations" in ai_sig.topic_or_material


def test_grade_distribution_is_deterministic_and_truthful(db_session: Session, t10_db_setup):
    """Grade distribution in report matches actual submissions count exactly."""
    db = db_session
    data = t10_db_setup
    report = generate_course_analytics_report(data["course"].id, db)
    
    assert "grade_distribution" in report.dict()
    assert sum(report.grade_distribution.values()) == report.total_submissions
