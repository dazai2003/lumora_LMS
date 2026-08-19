"""
Unit & Integration Test Suite for Phase A3: Lumora Teacher Learning & Student Behaviour Analytics.
Verifies course learning overview, material engagement, PDF/video contextual flags,
Ask AI topic grouping, syllabus unit crossover, evidence-based student learning profiles,
and teacher authorization boundaries.
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, Unit, Lesson, Material, MaterialType,
    StudentMaterialProgress, MaterialFlag, StudentQuestion, AIResponse, Enrollment,
    ALExam, ALExamType, ALStudentSubmission, ALStudentAnswer, ALQuestion, ALQuestionTemplate
)
from app.auth import create_access_token
from app.services.analytics import (
    compute_course_learning_overview,
    compute_unit_learning_assessment_crossover,
    compute_student_learning_profile
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


def test_course_learning_overview_and_flags(db_session):
    """Verifies course learning overview metrics, revisit calculations, and flag resolution rates."""
    teacher = _get_or_create_user(db_session, "teacher_a3_test@lumora.com", UserRole.TEACHER, "Teacher A3 Test")
    
    course = Course(title="Course A3 Learning Overview Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    student1 = _get_or_create_user(db_session, "student_a3_1@lumora.com", UserRole.STUDENT, "Student A3 1")
    student2 = _get_or_create_user(db_session, "student_a3_2@lumora.com", UserRole.STUDENT, "Student A3 2")

    db_session.add_all([
        Enrollment(course_id=course.id, student_id=student1.id, is_active=True),
        Enrollment(course_id=course.id, student_id=student2.id, is_active=True)
    ])
    db_session.commit()

    unit = Unit(course_id=course.id, title="Unit 1: Plant Biology", order=1)
    db_session.add(unit)
    db_session.commit()
    db_session.refresh(unit)

    lesson = Lesson(course_id=course.id, unit_id=unit.id, title="Lesson 1: Photosynthesis", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat_pdf = Material(course_id=course.id, lesson_id=lesson.id, title="Photosynthesis Notes", material_type=MaterialType.PDF)
    mat_vid = Material(course_id=course.id, lesson_id=lesson.id, title="Calvin Cycle Lecture", material_type=MaterialType.VIDEO)
    db_session.add_all([mat_pdf, mat_vid])
    db_session.commit()
    db_session.refresh(mat_pdf)
    db_session.refresh(mat_vid)

    # Student 1 completed both; Student 2 completed pdf
    db_session.add_all([
        StudentMaterialProgress(student_id=student1.id, material_id=mat_pdf.id, is_completed=True, last_position=12.0),
        StudentMaterialProgress(student_id=student1.id, material_id=mat_vid.id, is_completed=True, last_position=240.0),
        StudentMaterialProgress(student_id=student2.id, material_id=mat_pdf.id, is_completed=False, last_position=5.0)
    ])
    db_session.commit()

    # Contextual flags: 1 PDF page flag (resolved), 1 video timestamp flag (unresolved)
    f1 = MaterialFlag(student_id=student1.id, material_id=mat_pdf.id, context="Page 12", comment="Clarification needed on Z-scheme", is_resolved=True)
    f2 = MaterialFlag(student_id=student2.id, material_id=mat_vid.id, context="Timestamp 04:12", comment="Audio distortion in Calvin cycle", is_resolved=False)
    db_session.add_all([f1, f2])
    db_session.commit()

    # Ask AI question
    sq = StudentQuestion(student_id=student1.id, course_id=course.id, course_material_id=mat_pdf.id, question_text="How does photolysis work?", topic_category="Photosynthesis")
    db_session.add(sq)
    db_session.commit()

    overview = compute_course_learning_overview(course.id, db_session)
    assert overview.course_id == course.id
    assert overview.enrolled_students == 2
    assert overview.total_materials == 2
    assert overview.total_flags == 2
    assert overview.unresolved_flags == 1
    assert overview.flag_resolution_rate_percentage == 50.0
    assert overview.ask_ai_questions_count == 1
    assert len(overview.top_flagged_materials) >= 1


def test_unit_learning_assessment_crossover(db_session):
    """Verifies unit-by-unit crossover combining materials, flags, and assessment scores."""
    teacher = _get_or_create_user(db_session, "teacher_a3_test@lumora.com", UserRole.TEACHER, "Teacher A3 Test")
    student = _get_or_create_user(db_session, "student_a3_1@lumora.com", UserRole.STUDENT, "Student A3 1")

    course = Course(title="Course A3 Unit Crossover Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))
    db_session.commit()

    unit = Unit(course_id=course.id, title="Unit 3: Genetics", order=3)
    db_session.add(unit)
    db_session.commit()
    db_session.refresh(unit)

    lesson = Lesson(course_id=course.id, unit_id=unit.id, title="Lesson: Mendelian Inheritance", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat = Material(course_id=course.id, lesson_id=lesson.id, title="Genetics Resource Book", material_type=MaterialType.PDF)
    db_session.add(mat)
    db_session.commit()
    db_session.refresh(mat)

    # 4 flags on genetics
    for i in range(4):
        db_session.add(MaterialFlag(student_id=student.id, material_id=mat.id, context=f"Page {i+1}", comment="Dihybrid cross confusion", is_resolved=False))
    db_session.commit()

    # Exam with 40% attainment
    exam = ALExam(course_id=course.id, title="Genetics Paper I", exam_type=ALExamType.PAPER_1_MCQ, is_published=True)
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    q = ALQuestion(exam_id=exam.id, question_number=1, template_type=ALQuestionTemplate.GENERIC_MCQ, stem_text="Genetics ratio", points=1.0)
    db_session.add(q)
    db_session.commit()
    db_session.refresh(q)

    sub = ALStudentSubmission(exam_id=exam.id, student_id=student.id, status="submitted", percentage=40.0)
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)

    ans = ALStudentAnswer(submission_id=sub.id, question_id=q.id, final_score=0.4, raw_points_earned=0.4)
    db_session.add(ans)
    db_session.commit()

    crossover = compute_unit_learning_assessment_crossover(course.id, db_session)
    assert len(crossover) == 1
    u_prof = crossover[0]
    assert u_prof.unit_title == "Unit 3: Genetics"
    assert u_prof.total_flags == 4
    assert u_prof.unresolved_flags == 4
    assert u_prof.mcq_average_percentage == 40.0
    assert len(u_prof.support_signals) >= 1
    assert any("difficulty flags" in s or "Below-average" in s or "Support crossover" in s for s in u_prof.support_signals)


def test_student_learning_profile_and_support_signals(db_session):
    """Verifies individual student profile, revisit list, flags list, and non-judgmental support signals."""
    teacher = _get_or_create_user(db_session, "teacher_a3_test@lumora.com", UserRole.TEACHER, "Teacher A3 Test")
    student = _get_or_create_user(db_session, "student_a3_profile_test@lumora.com", UserRole.STUDENT, "Student Profile Test")

    course = Course(title="Course A3 Profile Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))
    db_session.commit()

    lesson = Lesson(course_id=course.id, title="Lesson Bio", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat = Material(course_id=course.id, lesson_id=lesson.id, title="Cell Biology Guide", material_type=MaterialType.PDF)
    db_session.add(mat)
    db_session.commit()
    db_session.refresh(mat)

    # Progress & flag
    db_session.add(StudentMaterialProgress(student_id=student.id, material_id=mat.id, is_completed=True, last_position=20.0))
    db_session.add(MaterialFlag(student_id=student.id, material_id=mat.id, context="Page 15", comment="Organelle function question", is_resolved=False))
    
    # 3 AI questions on topic "Cellular Respiration"
    for i in range(3):
        db_session.add(StudentQuestion(student_id=student.id, course_id=course.id, question_text=f"Question {i} on ATP", topic_category="Cellular Respiration"))
    db_session.commit()

    profile = compute_student_learning_profile(student.id, course.id, db_session)
    assert profile.student_id == student.id
    assert profile.student_name == "Student Profile Test"
    assert profile.materials_completed == 1
    assert profile.flags_submitted_count == 1
    assert profile.ask_ai_questions_count == 3
    assert len(profile.top_asked_topics) >= 1
    assert profile.top_asked_topics[0]["topic"] == "Cellular Respiration"
    assert len(profile.support_signals) >= 1


def test_learning_analytics_teacher_authorization(db_session):
    """Unauthorized teacher cannot access learning overview of another teacher's course."""
    teacher1 = _get_or_create_user(db_session, "teacher_a3_test@lumora.com", UserRole.TEACHER, "Teacher A3 Test")
    teacher2 = _get_or_create_user(db_session, "teacher2_unauthorized@lumora.com", UserRole.TEACHER, "Teacher Unauthorized")

    course = Course(title="Private Course Auth Test", teacher_id=teacher1.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    token2 = create_access_token({"sub": str(teacher2.id), "email": teacher2.email, "role": teacher2.role.value})
    headers2 = {"Authorization": f"Bearer {token2}"}

    res = client.get(f"/api/analytics/courses/{course.id}/learning-overview", headers=headers2)
    assert res.status_code == 403
    assert "do not have access" in res.json()["detail"]


def test_phase_t5_contextual_and_document_level_flags_aggregation(db_session):
    """Phase T5: Verifies distinction between contextual flags and document flags, student_name population, and teacher reply persistence."""
    from app.services.analytics import compute_course_material_analytics
    from app.models import Notification

    teacher = _get_or_create_user(db_session, "teacher_t5_flags@lumora.com", UserRole.TEACHER, "Teacher T5 Flags")
    student = _get_or_create_user(db_session, "student_t5_flags@lumora.com", UserRole.STUDENT, "Student T5 Flagged")

    course = Course(title="Course T5 Flags Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))

    lesson = Lesson(course_id=course.id, title="Lesson T5", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat_pdf = Material(course_id=course.id, lesson_id=lesson.id, title="Genetics PDF Guide", material_type=MaterialType.PDF)
    mat_vid = Material(course_id=course.id, lesson_id=lesson.id, title="Meiosis Video", material_type=MaterialType.VIDEO)
    db_session.add_all([mat_pdf, mat_vid])
    db_session.commit()
    db_session.refresh(mat_pdf)
    db_session.refresh(mat_vid)

    # Contextual flag on PDF (Page 8)
    f_pdf = MaterialFlag(student_id=student.id, material_id=mat_pdf.id, context="Page 8", comment="Punnett square unclear", is_resolved=False)
    # Contextual flag on Video (Timestamp 02:45) with teacher reply
    f_vid = MaterialFlag(student_id=student.id, material_id=mat_vid.id, context="Timestamp 02:45", comment="Audio echo", is_resolved=True, teacher_reply="Re-uploaded audio track.")
    # Document-level flag on PDF
    f_doc = MaterialFlag(student_id=student.id, material_id=mat_pdf.id, context="Full Document", comment="Missing glossary", is_resolved=False)
    db_session.add_all([f_pdf, f_vid, f_doc])
    db_session.commit()

    report = compute_course_material_analytics(course.id, db_session)
    assert report.total_materials == 2
    assert report.total_flags == 3
    assert report.total_unresolved_flags == 2

    pdf_metric = next(m for m in report.materials if m.material_id == mat_pdf.id)
    assert pdf_metric.total_flags == 2
    assert pdf_metric.unresolved_flags == 2
    assert len(pdf_metric.contextual_flags) == 2
    assert any(cf.context_type == "pdf_page" and cf.context_value == "8" for cf in pdf_metric.contextual_flags)
    assert any(cf.student_name == "Student T5 Flagged" for cf in pdf_metric.contextual_flags)

    vid_metric = next(m for m in report.materials if m.material_id == mat_vid.id)
    assert vid_metric.total_flags == 1
    assert vid_metric.unresolved_flags == 0
    assert vid_metric.resolved_flags == 1
    flag_vid_item = vid_metric.contextual_flags[0]
    assert flag_vid_item.context_type == "timestamp"
    assert flag_vid_item.context_value == "02:45"
    assert flag_vid_item.teacher_reply == "Re-uploaded audio track."
    assert flag_vid_item.is_resolved is True


def test_phase_t5_teacher_resolve_flag_and_notification(db_session):
    """Phase T5: Resolving flag via endpoint marks flag resolved, stores teacher reply, and creates Notification."""
    from app.models import Notification

    teacher = _get_or_create_user(db_session, "teacher_t5_notif@lumora.com", UserRole.TEACHER, "Teacher T5 Notif")
    student = _get_or_create_user(db_session, "student_t5_notif@lumora.com", UserRole.STUDENT, "Student T5 Notif")

    course = Course(title="Course T5 Notif Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    lesson = Lesson(course_id=course.id, title="Lesson T5 Notif", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat = Material(course_id=course.id, lesson_id=lesson.id, title="Biochemistry Handout", material_type=MaterialType.PDF)
    db_session.add(mat)
    db_session.commit()
    db_session.refresh(mat)

    flag = MaterialFlag(student_id=student.id, material_id=mat.id, context="Page 4", comment="Enzyme kinetics equation typo", is_resolved=False)
    db_session.add(flag)
    db_session.commit()
    db_session.refresh(flag)

    token = create_access_token({"sub": str(teacher.id), "email": teacher.email, "role": teacher.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post(
        f"/api/materials/teacher/insights/flags/{flag.id}/resolve",
        json={"teacher_reply": "Typo corrected on page 4 in v2 PDF."},
        headers=headers
    )
    assert res.status_code == 200
    assert res.json()["success"] is True

    db_session.refresh(flag)
    assert flag.is_resolved is True
    assert flag.teacher_reply == "Typo corrected on page 4 in v2 PDF."
    assert flag.resolved_at is not None

    notif = db_session.query(Notification).filter(Notification.user_id == student.id).order_by(Notification.id.desc()).first()
    assert notif is not None
    assert "Difficulty Flag Resolved" in notif.title
    assert "Typo corrected on page 4 in v2 PDF." in notif.message


def test_phase_t6_ask_ai_analytics_and_inquiry_details(db_session):
    """Phase T6: Verifies Ask AI analytics report metrics, unique learners, low confidence, flagged counts, and detailed inquiries."""
    from app.services.analytics import compute_ask_ai_analytics

    teacher = _get_or_create_user(db_session, "teacher_t6_ai@lumora.com", UserRole.TEACHER, "Teacher T6 AI")
    student1 = _get_or_create_user(db_session, "student_t6_1@lumora.com", UserRole.STUDENT, "Student T6 One")
    student2 = _get_or_create_user(db_session, "student_t6_2@lumora.com", UserRole.STUDENT, "Student T6 Two")

    course = Course(title="Course T6 AI Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add_all([
        Enrollment(course_id=course.id, student_id=student1.id, is_active=True),
        Enrollment(course_id=course.id, student_id=student2.id, is_active=True)
    ])

    lesson = Lesson(course_id=course.id, title="Lesson T6 Genetics", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat = Material(course_id=course.id, lesson_id=lesson.id, title="Genetics Notes", material_type=MaterialType.PDF)
    db_session.add(mat)
    db_session.commit()
    db_session.refresh(mat)

    # Question 1 by student 1: High confidence, grounded
    q1 = StudentQuestion(
        student_id=student1.id,
        course_id=course.id,
        question_text="How does Mendel's law of segregation work?",
        topic_category="Genetics",
        sentiment_difficulty="Concept Clarification",
        is_answered=True
    )
    # Question 2 by student 2: Low confidence, flagged, with teacher correction
    q2 = StudentQuestion(
        student_id=student2.id,
        course_id=course.id,
        question_text="Why do linked genes not assort independently?",
        topic_category="Genetics",
        sentiment_difficulty="Confusion/Difficulty",
        is_answered=True
    )
    db_session.add_all([q1, q2])
    db_session.commit()
    db_session.refresh(q1)
    db_session.refresh(q2)

    r1 = AIResponse(
        student_question_id=q1.id,
        response_text="Mendel's law states that allele pairs separate during gamete formation.",
        confidence_score=0.92,
        context_sources=[{"material_id": mat.id, "title": "Genetics Notes", "relevance": 0.95}],
        is_flagged=False
    )
    r2 = AIResponse(
        student_question_id=q2.id,
        response_text="Linked genes are on different chromosomes so they stay together.",
        confidence_score=0.45,
        context_sources=[],
        is_flagged=True,
        teacher_correction="Correction: Linked genes are on the SAME chromosome and transmitted together unless crossing over occurs."
    )
    db_session.add_all([r1, r2])
    db_session.commit()

    report = compute_ask_ai_analytics(course.id, db_session)
    assert report.total_questions_asked == 2
    assert report.answered_questions_count == 2
    assert report.unique_students_count == 2
    assert report.low_confidence_count == 1
    assert report.flagged_count == 1
    assert report.teacher_corrected_count == 1
    assert report.source_grounded_percentage == 50.0
    assert len(report.detailed_inquiries) == 2

    inq_flagged = next(i for i in report.detailed_inquiries if i.question_id == q2.id)
    assert inq_flagged.is_flagged is True
    assert inq_flagged.confidence_score == 0.45
    assert inq_flagged.teacher_correction is not None
    assert inq_flagged.student_name == "Student T6 Two"
    assert inq_flagged.is_grounded is False


def test_phase_t6_teacher_moderate_ai_response_and_notification(db_session):
    """Phase T6: Teacher moderation endpoint updates flag, saves correction, and sends student notification."""
    from app.models import Notification

    teacher = _get_or_create_user(db_session, "teacher_t6_mod@lumora.com", UserRole.TEACHER, "Teacher T6 Mod")
    student = _get_or_create_user(db_session, "student_t6_mod@lumora.com", UserRole.STUDENT, "Student T6 Mod")

    course = Course(title="Course T6 Moderation Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    q = StudentQuestion(
        student_id=student.id,
        course_id=course.id,
        question_text="What are the products of the light-dependent reaction in photosynthesis?",
        topic_category="Photosynthesis",
        is_answered=True
    )
    db_session.add(q)
    db_session.commit()
    db_session.refresh(q)

    ai_resp = AIResponse(
        student_question_id=q.id,
        response_text="The products are glucose and carbon dioxide.",
        confidence_score=0.40,
        is_flagged=False
    )
    db_session.add(ai_resp)
    db_session.commit()
    db_session.refresh(ai_resp)

    token = create_access_token({"sub": str(teacher.id), "email": teacher.email, "role": teacher.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post(
        f"/api/qa/teacher/moderate/{ai_resp.id}",
        json={
            "is_flagged": True,
            "correction_text": "Correction: The products of the light-dependent reactions are ATP, NADPH, and O2 (oxygen). Glucose is synthesized in the Calvin cycle (light-independent)."
        },
        headers=headers
    )
    assert res.status_code == 200
    assert res.json()["success"] is True

    db_session.refresh(ai_resp)
    assert ai_resp.is_flagged is True
    assert "ATP, NADPH, and O2" in ai_resp.teacher_correction

    notif = db_session.query(Notification).filter(Notification.user_id == student.id).order_by(Notification.id.desc()).first()
    assert notif is not None
    assert "Teacher Correction" in notif.title
    assert "authoritative correction" in notif.message


def test_phase_t6_empty_ai_analytics_honest_state(db_session):
    """Phase T6: Empty Ask AI analytics returns neutral 0 values without claiming healthy status."""
    from app.services.analytics import compute_ask_ai_analytics

    teacher = _get_or_create_user(db_session, "teacher_t6_empty@lumora.com", UserRole.TEACHER, "Teacher T6 Empty")
    course = Course(title="Course T6 Empty Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    report = compute_ask_ai_analytics(course.id, db_session)
    assert report.total_questions_asked == 0
    assert report.answered_questions_count == 0
    assert report.unique_students_count == 0
    assert report.low_confidence_count == 0
    assert report.flagged_count == 0
    assert report.average_confidence_score is None
    assert report.source_grounded_percentage is None
    assert report.detailed_inquiries == []
    assert report.topic_categories == []


def test_phase_t7_roster_empty_state_and_honest_diagnostics(db_session):
    """Phase T7: Separates absence of data (NO_ACTIVITY / LIMITED_DATA) from poor performance (NEEDS_ATTENTION)."""
    teacher = _get_or_create_user(db_session, "teacher_t7_roster@lumora.com", UserRole.TEACHER, "Teacher T7 Roster")
    student_empty = _get_or_create_user(db_session, "student_t7_empty@lumora.com", UserRole.STUDENT, "Student T7 Empty")
    student_limited = _get_or_create_user(db_session, "student_t7_limited@lumora.com", UserRole.STUDENT, "Student T7 Limited")
    student_failing = _get_or_create_user(db_session, "student_t7_failing@lumora.com", UserRole.STUDENT, "Student T7 Failing")

    course = Course(title="Course T7 Diagnostics Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    db_session.add_all([
        Enrollment(course_id=course.id, student_id=student_empty.id, is_active=True),
        Enrollment(course_id=course.id, student_id=student_limited.id, is_active=True),
        Enrollment(course_id=course.id, student_id=student_failing.id, is_active=True)
    ])
    db_session.commit()

    lesson = Lesson(course_id=course.id, title="Lesson T7", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat = Material(course_id=course.id, lesson_id=lesson.id, title="Material T7", material_type=MaterialType.PDF)
    db_session.add(mat)
    db_session.commit()
    db_session.refresh(mat)

    # Student Limited: studied 1 material
    db_session.add(StudentMaterialProgress(student_id=student_limited.id, material_id=mat.id, is_completed=True))

    # Student Failing: low exam score + 2 flags
    exam = ALExam(course_id=course.id, title="AL Mock Exam T7", exam_type=ALExamType.PAPER_1_MCQ)
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    sub = ALStudentSubmission(
        exam_id=exam.id,
        student_id=student_failing.id,
        percentage=38.0,
        status="submitted",
        grade="F"
    )
    flag1 = MaterialFlag(student_id=student_failing.id, material_id=mat.id, context="Page 1", comment="Unclear definition", is_resolved=False)
    flag2 = MaterialFlag(student_id=student_failing.id, material_id=mat.id, context="Page 2", comment="Missing formula", is_resolved=False)
    db_session.add_all([sub, flag1, flag2])
    db_session.commit()

    token = create_access_token({"sub": str(teacher.id), "email": teacher.email, "role": teacher.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get(f"/api/analytics/teacher/course/{course.id}/full-analytics", headers=headers)
    assert res.status_code == 200
    roster = res.json()["student_roster"]
    assert len(roster) == 3

    r_empty = next(r for r in roster if r["student_id"] == student_empty.id)
    assert r_empty["status_code"] == "NO_ACTIVITY"
    assert r_empty["effective_assessment_avg"] is None
    assert r_empty["material_completion_pct"] == 0.0

    r_limited = next(r for r in roster if r["student_id"] == student_limited.id)
    assert r_limited["status_code"] == "LIMITED_DATA"
    assert r_limited["effective_assessment_avg"] is None
    assert r_limited["material_completion_pct"] == 100.0

    r_failing = next(r for r in roster if r["student_id"] == student_failing.id)
    assert r_failing["status_code"] == "NEEDS_ATTENTION"
    assert r_failing["effective_assessment_avg"] == 38.0
    assert r_failing["unresolved_flags"] == 2


def test_phase_t7_student_learning_profile_breakdowns_and_interventions(db_session):
    """Phase T7: Verifies comprehensive student profile with paper breakdowns, unit mastery, and intervention intelligence."""
    teacher = _get_or_create_user(db_session, "teacher_t7_prof@lumora.com", UserRole.TEACHER, "Teacher T7 Profile")
    student = _get_or_create_user(db_session, "student_t7_prof@lumora.com", UserRole.STUDENT, "Student T7 Profile")

    course = Course(title="Course T7 Profile Test", teacher_id=teacher.id)
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)

    unit = Unit(course_id=course.id, title="Unit 1 Genetics", order=1)
    db_session.add(unit)
    db_session.commit()
    db_session.refresh(unit)

    lesson = Lesson(course_id=course.id, unit_id=unit.id, title="Lesson Genetics", order=1, is_published=True)
    db_session.add(lesson)
    db_session.commit()
    db_session.refresh(lesson)

    mat = Material(course_id=course.id, lesson_id=lesson.id, title="Genetics PDF", material_type=MaterialType.PDF)
    db_session.add(mat)
    db_session.commit()
    db_session.refresh(mat)

    db_session.add(Enrollment(course_id=course.id, student_id=student.id, is_active=True))
    db_session.add(StudentMaterialProgress(student_id=student.id, material_id=mat.id, is_completed=True))

    exam_mcq = ALExam(course_id=course.id, lesson_id=lesson.id, title="Genetics MCQ", exam_type=ALExamType.PAPER_1_MCQ)
    exam_struct = ALExam(course_id=course.id, lesson_id=lesson.id, title="Genetics Structured", exam_type=ALExamType.PAPER_2_STRUCTURED)
    db_session.add_all([exam_mcq, exam_struct])
    db_session.commit()
    db_session.refresh(exam_mcq)
    db_session.refresh(exam_struct)

    sub_mcq = ALStudentSubmission(exam_id=exam_mcq.id, student_id=student.id, percentage=80.0, status="submitted", grade="A")
    sub_struct = ALStudentSubmission(exam_id=exam_struct.id, student_id=student.id, percentage=60.0, status="submitted", grade="B")
    db_session.add_all([sub_mcq, sub_struct])
    db_session.commit()

    token = create_access_token({"sub": str(teacher.id), "email": teacher.email, "role": teacher.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get(f"/api/analytics/students/{student.id}/learning-profile?course_id={course.id}", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    assert data["student_id"] == student.id
    assert data["assessment_average_percentage"] == 70.0
    assert data["mcq_average_percentage"] == 80.0
    assert data["structured_average_percentage"] == 60.0
    assert data["materials_completed"] == 1
    assert data["material_completion_percentage"] == 100.0
    assert len(data["assessment_history"]) == 2
    assert len(data["unit_mastery_breakdown"]) == 1
    assert data["unit_mastery_breakdown"][0]["mastery_status"] == "On Track"
    assert data["status_diagnostic"]["status"] == "ON_TRACK"


def test_phase_t7_student_profile_security_and_course_isolation(db_session):
    """Phase T7: Verifies teacher course isolation (Teacher B cannot access Teacher A's student profile)."""
    teacher_a = _get_or_create_user(db_session, "teacher_t7_a@lumora.com", UserRole.TEACHER, "Teacher T7 A")
    teacher_b = _get_or_create_user(db_session, "teacher_t7_b@lumora.com", UserRole.TEACHER, "Teacher T7 B")
    student = _get_or_create_user(db_session, "student_t7_iso@lumora.com", UserRole.STUDENT, "Student T7 Iso")

    course_a = Course(title="Course A Isolation", teacher_id=teacher_a.id)
    course_b = Course(title="Course B Isolation", teacher_id=teacher_b.id)
    db_session.add_all([course_a, course_b])
    db_session.commit()
    db_session.refresh(course_a)
    db_session.refresh(course_b)

    db_session.add(Enrollment(course_id=course_a.id, student_id=student.id, is_active=True))
    db_session.commit()

    # Teacher B tries to access Student's profile for Course A
    token_b = create_access_token({"sub": str(teacher_b.id), "email": teacher_b.email, "role": teacher_b.role.value})
    headers_b = {"Authorization": f"Bearer {token_b}"}

    res_b = client.get(f"/api/analytics/students/{student.id}/learning-profile?course_id={course_a.id}", headers=headers_b)
    assert res_b.status_code == 403




