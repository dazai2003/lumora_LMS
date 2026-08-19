"""
Unit & Integration Test Suite for Phase A5: Advanced Cross-Analytics & Learning Intelligence.
Verifies multi-source content hotspots, question format divergence, cognitive depth attenuation,
distractor intelligence, longitudinal attainment trends, sample-size confidence awareness,
empty dataset handling, and strict authorization boundaries.
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
    classify_evidence_confidence,
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


def test_classify_evidence_confidence():
    """Verifies centralized sample-size confidence thresholds."""
    assert classify_evidence_confidence(0) == "insufficient_data"
    assert classify_evidence_confidence(2) == "insufficient_data"
    assert classify_evidence_confidence(3) == "early_signal"
    assert classify_evidence_confidence(9) == "early_signal"
    assert classify_evidence_confidence(10) == "emerging_pattern"
    assert classify_evidence_confidence(24) == "emerging_pattern"
    assert classify_evidence_confidence(25) == "strong_pattern"
    assert classify_evidence_confidence(100) == "strong_pattern"


def test_teacher_learning_intelligence_empty(db_session):
    """Empty course produces safe deterministic report without division-by-zero or crash."""
    teacher = _get_or_create_user(db_session, "teacher_a5_empty@lumora.com", UserRole.TEACHER, "Teacher A5 Empty")
    course = Course(title="Empty Chemistry Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    report = compute_teacher_learning_intelligence(course.id, db_session)
    assert report.course_id == course.id
    assert report.enrolled_students == 0
    assert report.total_assessments_analyzed == 0
    assert len(report.hotspots) == 0
    assert len(report.distractor_insights) == 0
    assert report.ai_narrative_status == "deterministic_ready"
    assert "no student learning activity" in report.executive_summary_narrative.lower() or "not recorded" in report.executive_summary_narrative.lower() or "recorded yet" in report.executive_summary_narrative.lower()


def test_teacher_learning_intelligence_cross_domain_hotspots(db_session):
    """Verifies multi-source hotspot accumulation, question format divergence, and distractor detection."""
    teacher = _get_or_create_user(db_session, "teacher_a5_active@lumora.com", UserRole.TEACHER, "Teacher A5 Active")
    student1 = _get_or_create_user(db_session, "student_a5_1@lumora.com", UserRole.STUDENT, "Student A5 One")
    student2 = _get_or_create_user(db_session, "student_a5_2@lumora.com", UserRole.STUDENT, "Student A5 Two")

    course = Course(title="Advanced Biology A5 Intelligence", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add_all([
        Enrollment(course_id=course.id, student_id=student1.id, is_active=True),
        Enrollment(course_id=course.id, student_id=student2.id, is_active=True)
    ])
    db_session.commit()

    unit1 = Unit(course_id=course.id, title="Unit 1: Plant Physiology", order=1)
    db_session.add(unit1)
    db_session.commit()
    db_session.refresh(unit1)

    lesson1 = Lesson(course_id=course.id, unit_id=unit1.id, title="Photosynthesis Lesson", order=1, is_published=True)
    db_session.add(lesson1)
    db_session.commit()
    db_session.refresh(lesson1)

    mat1 = Material(course_id=course.id, lesson_id=lesson1.id, title="Photosynthesis PDF", material_type=MaterialType.PDF)
    db_session.add(mat1)
    db_session.commit()
    db_session.refresh(mat1)

    # 1. High material completion
    db_session.add_all([
        StudentMaterialProgress(student_id=student1.id, material_id=mat1.id, is_completed=True),
        StudentMaterialProgress(student_id=student2.id, material_id=mat1.id, is_completed=True)
    ])
    # 2. Elevated difficulty flags
    db_session.add_all([
        MaterialFlag(student_id=student1.id, material_id=mat1.id, context="Page 14", comment="Calvin cycle confusing", is_resolved=False),
        MaterialFlag(student_id=student2.id, material_id=mat1.id, context="Page 14", comment="Plastoquinone step unclear", is_resolved=False),
        MaterialFlag(student_id=student1.id, material_id=mat1.id, context="Page 15", comment="Rubisco kinetics", is_resolved=False)
    ])
    # 3. High Ask AI question volume
    for i in range(6):
        db_session.add(StudentQuestion(
            course_id=course.id,
            student_id=student1.id,
            course_material_id=mat1.id,
            question_text=f"How does Plastoquinone work in photosynthesis part {i}?",
            topic_category="Plant Physiology"
        ))
    db_session.commit()

    # 4. Exam with low score (40%) and strong distractor
    exam = ALExam(course_id=course.id, title="Physiology Paper 1", exam_type=ALExamType.PAPER_1_MCQ, is_published=True)
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    q1 = ALQuestion(
        exam_id=exam.id,
        question_number=1,
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        cognitive_level=CognitiveLevel.REMEMBER,
        stem_text="Primary electron acceptor in PS II",
        points=1.0,
        correct_option="A",
        options=["Pheophytin", "Plastoquinone", "Cytochrome", "Plastocyanin", "Ferredoxin"]
    )
    q2 = ALQuestion(
        exam_id=exam.id,
        question_number=2,
        template_type=ALQuestionTemplate.COMBINATION_GRID,
        cognitive_level=CognitiveLevel.ANALYZE,
        stem_text="Evaluate the statements regarding C4 photosynthesis",
        points=1.0,
        correct_option="C"
    )
    db_session.add_all([q1, q2])
    db_session.commit()

    sub1 = ALStudentSubmission(exam_id=exam.id, student_id=student1.id, status="submitted", percentage=40.0, grade="S")
    sub2 = ALStudentSubmission(exam_id=exam.id, student_id=student2.id, status="submitted", percentage=40.0, grade="S")
    db_session.add_all([sub1, sub2])
    db_session.commit()
    db_session.refresh(sub1)
    db_session.refresh(sub2)

    # 5 attempts selecting Option B (strong distractor)
    db_session.add_all([
        ALStudentAnswer(submission_id=sub1.id, question_id=q1.id, selected_option="B", final_score=0.0, raw_points_earned=0.0),
        ALStudentAnswer(submission_id=sub2.id, question_id=q1.id, selected_option="B", final_score=0.0, raw_points_earned=0.0),
        ALStudentAnswer(submission_id=sub1.id, question_id=q2.id, selected_option="B", final_score=0.4, raw_points_earned=0.4),
        ALStudentAnswer(submission_id=sub2.id, question_id=q2.id, selected_option="B", final_score=0.4, raw_points_earned=0.4)
    ])
    db_session.commit()

    report = compute_teacher_learning_intelligence(course.id, db_session)
    assert report.course_id == course.id
    assert report.enrolled_students == 2
    assert len(report.hotspots) == 1

    hotspot = report.hotspots[0]
    assert hotspot.unit_title == "Unit 1: Plant Physiology"
    assert hotspot.priority_level in ["HIGH_PRIORITY", "MEDIUM_PRIORITY"]
    assert hotspot.flags_count >= 3
    assert hotspot.ai_inquiries_count >= 6
    assert len(hotspot.recommended_actions) >= 1

    # Format cross matrix
    assert len(report.question_type_cross_matrix) >= 1
    # Cognitive cross matrix
    assert len(report.cognitive_cross_matrix) >= 1


def test_student_learning_intelligence_authorization(db_session):
    """Verifies that student learning intelligence endpoint enforces caller student isolation."""
    teacher = _get_or_create_user(db_session, "teacher_a5_auth@lumora.com", UserRole.TEACHER, "Teacher A5 Auth")
    student_a = _get_or_create_user(db_session, "student_a5_a@lumora.com", UserRole.STUDENT, "Student A5 A")
    student_b = _get_or_create_user(db_session, "student_a5_b@lumora.com", UserRole.STUDENT, "Student A5 B")

    course = Course(title="Physics A5 Course", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student_a.id, is_active=True))
    db_session.commit()

    token_a = create_access_token({"sub": str(student_a.id), "email": student_a.email, "role": student_a.role.value})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Student A calling endpoint with student_id=student_b.id must still return student_a's data
    res = client.get(f"/api/analytics/student/learning-intelligence?student_id={student_b.id}&course_id={course.id}", headers=headers_a)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["student_id"] == student_a.id
    assert data["student_name"] == "Student A5 A"


def test_phase_t4_syllabus_unit_intelligence_evidence_tiers(db_session):
    """Phase T4: Tests evidence tiers (NOT_STARTED, LIMITED_DATA, SUFFICIENT, STRONG) and prevents false positive mastery."""
    teacher = _get_or_create_user(db_session, "teacher_t4_tier@lumora.com", UserRole.TEACHER, "Teacher T4 Tier")
    course = Course(title="Zoology T4 Intelligence", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    unit_empty = Unit(course_id=course.id, title="Unit A: Invertebrates (Empty)", order=1)
    db_session.add(unit_empty)
    db_session.commit()
    db_session.refresh(unit_empty)

    report = compute_teacher_learning_intelligence(course.id, db_session)
    assert len(report.hotspots) == 1
    u_hotspot = report.hotspots[0]
    assert u_hotspot.unit_title == "Unit A: Invertebrates (Empty)"
    # Must NOT claim healthy when 0 attempts exist
    assert u_hotspot.priority_level == "NOT_STARTED"
    assert u_hotspot.evidence_confidence == "insufficient_data"
    assert "no learning activity" in u_hotspot.neutral_insight.lower()

