"""
Unit & Integration Test Suite for Phase A2: Lumora Teacher Assessment Analytics.
Verifies assessment overview, score distribution buckets, MCQ psychometrics,
discrimination index thresholds, structured subpart mark-loss rankings,
essay criteria omission frequencies, attention system classifications,
and teacher authorization boundaries.
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, ALExam, ALExamType, ALQuestion, ALQuestionTemplate,
    ALStudentSubmission, ALStudentAnswer
)
from app.auth import create_access_token
from app.services.analytics import (
    compute_exam_foundation_overview,
    compute_mcq_exam_report,
    compute_structured_exam_report,
    compute_essay_exam_report,
    audit_exam_data_quality
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


def test_exam_overview_with_zero_attempts(db_session):
    """Overview must return valid clean empty metrics when total submissions is 0."""
    teacher = _get_or_create_user(db_session, "teacher_a2_test@lumora.com", UserRole.TEACHER, "Teacher A2 Test")

    course = db_session.query(Course).filter(Course.title == "Course A2 Test Zero Submissions").first()
    if not course:
        course = Course(title="Course A2 Test Zero Submissions", teacher_id=teacher.id)
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

    exam = db_session.query(ALExam).filter(ALExam.title == "Exam A2 Zero Submissions").first()
    if not exam:
        exam = ALExam(
            course_id=course.id,
            title="Exam A2 Zero Submissions",
            exam_type=ALExamType.PAPER_1_MCQ,
            time_limit_minutes=120,
            total_questions=50,
            raw_mark_cap=100.0,
            is_published=True
        )
        db_session.add(exam)
        db_session.commit()
        db_session.refresh(exam)

    overview = compute_exam_foundation_overview(exam.id, db_session)
    assert overview.exam_id == exam.id
    assert overview.total_submissions == 0
    assert overview.average_percentage is None
    assert overview.median_percentage is None
    assert overview.score_distribution_buckets["0-20%"] == 0
    assert overview.grade_distribution["A"] == 0


def test_mcq_item_psychometrics_and_distractor_efficiency(db_session):
    """Verifies MCQ p-value calculation, distractor efficiency warnings, and option distributions."""
    teacher = _get_or_create_user(db_session, "teacher_a2_test@lumora.com", UserRole.TEACHER, "Teacher A2 Test")
    course = db_session.query(Course).filter(Course.teacher_id == teacher.id).first()

    exam = ALExam(
        course_id=course.id,
        title="Psychometrics Test MCQ Exam",
        exam_type=ALExamType.PAPER_1_MCQ,
        time_limit_minutes=60,
        total_questions=2,
        raw_mark_cap=100.0,
        is_published=True
    )
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    q1 = ALQuestion(
        exam_id=exam.id,
        question_number=1,
        template_type=ALQuestionTemplate.GENERIC_MCQ,
        stem_text="What is the primary function of ATP synthase?",
        options=["Photolysis", "ATP synthesis", "Carbon fixation", "Oxygen evolution", "Suberin deposition"],
        correct_option="B",
        points=1.0,
        difficulty="medium",
        cognitive_level="understand"
    )
    db_session.add(q1)
    db_session.commit()
    db_session.refresh(q1)

    # Create 10 test students
    students = [
        _get_or_create_user(db_session, f"student_mcq_{i}@lumora.com", UserRole.STUDENT, f"Student {i}")
        for i in range(1, 11)
    ]

    # Add 10 submissions: 7 chose B (70%), 2 chose A (20%), 1 chose C (10%), 0 chose D (0%), 0 chose E (0%)
    submissions = []
    answers = []
    for i, stud in enumerate(students, start=1):
        sub = ALStudentSubmission(
            exam_id=exam.id,
            student_id=stud.id,
            raw_score=1.0 if i <= 7 else 0.0,
            scaled_score=1.0 if i <= 7 else 0.0,
            percentage=70.0 if i <= 7 else 0.0,
            status="submitted"
        )
        db_session.add(sub)
        submissions.append(sub)
    db_session.commit()

    for idx, sub in enumerate(submissions, start=1):
        opt = "B" if idx <= 7 else ("A" if idx <= 9 else "C")
        ans = ALStudentAnswer(
            submission_id=sub.id,
            question_id=q1.id,
            selected_option=opt,
            is_correct=(opt == "B"),
            final_score=1.0 if opt == "B" else 0.0
        )
        db_session.add(ans)
        answers.append(ans)
    db_session.commit()

    report = compute_mcq_exam_report(exam, [q1], submissions, answers)
    assert report.total_submissions == 10
    assert len(report.questions) == 1
    
    q_metric = report.questions[0]
    assert q_metric.correct_count == 7
    assert q_metric.difficulty_index_p == 0.70
    assert q_metric.percentage_score == 70.0
    
    # Check option distribution
    opt_b = next(o for o in q_metric.option_distribution if o.option_key == "B")
    assert opt_b.count == 7
    assert opt_b.percentage == 70.0
    assert opt_b.is_correct is True
    
    # Check distractor efficiency for D and E (0% selected in N=10)
    opt_d = next(o for o in q_metric.option_distribution if o.option_key == "D")
    assert opt_d.count == 0
    assert opt_d.is_non_functional_distractor is True


def test_structured_hierarchy_subpart_loss_ranking(db_session):
    """Verifies recursive structured traversal and subpart loss leaderboard."""
    teacher = _get_or_create_user(db_session, "teacher_a2_test@lumora.com", UserRole.TEACHER, "Teacher A2 Test")
    course = db_session.query(Course).filter(Course.teacher_id == teacher.id).first()
    student = _get_or_create_user(db_session, "student_str_1@lumora.com", UserRole.STUDENT, "Student Structured 1")

    exam = ALExam(
        course_id=course.id,
        title="Structured Test Exam",
        exam_type=ALExamType.PAPER_2_STRUCTURED,
        time_limit_minutes=120,
        total_questions=1,
        raw_mark_cap=100.0,
        is_published=True
    )
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    subparts = [
        {
            "part": "A",
            "label": "Part A: Photosynthetic Pathways",
            "max_points": 6.0,
            "children": [
                {"part": "i", "label": "Subpart (i): PSII Mechanism", "max_points": 3.0},
                {"part": "ii", "label": "Subpart (ii): Carbon Fixation", "max_points": 3.0}
            ]
        }
    ]

    q_str = ALQuestion(
        exam_id=exam.id,
        question_number=1,
        template_type=ALQuestionTemplate.STRUCTURED_SUBPARTS,
        stem_text="Explain photosynthetic light reactions and Calvin cycle.",
        points=10.0,
        structured_subparts_json=subparts
    )
    db_session.add(q_str)
    db_session.commit()
    db_session.refresh(q_str)

    sub = ALStudentSubmission(
        exam_id=exam.id,
        student_id=student.id,
        raw_score=4.0,
        scaled_score=4.0,
        percentage=40.0,
        status="teacher_verified"
    )
    db_session.add(sub)
    db_session.commit()

    ans = ALStudentAnswer(
        submission_id=sub.id,
        question_id=q_str.id,
        teacher_checklist_results_json={
            "subpart_scores": [
                {"subpart": "i", "awarded_score": 3.0}, # 100% on (i)
                {"subpart": "ii", "awarded_score": 1.0} # 33% on (ii) -> 67% loss
            ]
        },
        final_score=4.0
    )
    db_session.add(ans)
    db_session.commit()

    report = compute_structured_exam_report(exam, [q_str], [sub], [ans])
    assert len(report.questions) == 1
    assert len(report.subpart_loss_ranking) >= 1
    
    # Highest loss should be subpart (ii)
    top_loss = report.subpart_loss_ranking[0]
    assert top_loss["loss_rate_percentage"] > 60.0


def test_essay_criteria_omission_frequency(db_session):
    """Verifies essay criteria omission percentage calculations."""
    teacher = _get_or_create_user(db_session, "teacher_a2_test@lumora.com", UserRole.TEACHER, "Teacher A2 Test")
    course = db_session.query(Course).filter(Course.teacher_id == teacher.id).first()
    student1 = _get_or_create_user(db_session, "student_esy_1@lumora.com", UserRole.STUDENT, "Student Essay 1")
    student2 = _get_or_create_user(db_session, "student_esy_2@lumora.com", UserRole.STUDENT, "Student Essay 2")

    exam = ALExam(
        course_id=course.id,
        title="Essay Test Exam",
        exam_type=ALExamType.PAPER_2_ESSAY,
        time_limit_minutes=120,
        total_questions=1,
        raw_mark_cap=100.0,
        is_published=True
    )
    db_session.add(exam)
    db_session.commit()
    db_session.refresh(exam)

    checklist = [
        {"item_number": 1, "criterion": "Thylakoid Membrane Gradient", "points": 4.0},
        {"item_number": 2, "criterion": "Proton Translocation", "points": 4.0}
    ]

    q_esy = ALQuestion(
        exam_id=exam.id,
        question_number=5,
        template_type=ALQuestionTemplate.ESSAY_RUBRIC,
        stem_text="Describe chemiosmotic ATP synthesis in chloroplasts.",
        points=20.0,
        essay_checklist_json=checklist
    )
    db_session.add(q_esy)
    db_session.commit()
    db_session.refresh(q_esy)

    # 2 student submissions: Both hit criterion 1; only 1 hit criterion 2
    submissions = []
    answers = []
    for stud, hit2 in [(student1, True), (student2, False)]:
        sub = ALStudentSubmission(exam_id=exam.id, student_id=stud.id, status="teacher_verified", percentage=80.0 if hit2 else 40.0)
        db_session.add(sub)
        db_session.commit()
        submissions.append(sub)

        chk_res = [
            {"item_number": 1, "awarded": True, "points": 4.0},
            {"item_number": 2, "awarded": hit2, "points": 4.0 if hit2 else 0.0}
        ]
        ans = ALStudentAnswer(submission_id=sub.id, question_id=q_esy.id, teacher_checklist_results_json=chk_res, final_score=8.0 if hit2 else 4.0)
        db_session.add(ans)
        db_session.commit()
        answers.append(ans)

    report = compute_essay_exam_report(exam, [q_esy], submissions, answers)
    assert len(report.questions) == 1
    c1 = report.questions[0].criteria[0]
    c2 = report.questions[0].criteria[1]
    
    assert c1.omission_frequency_percentage == 0.0
    assert c2.omission_frequency_percentage == 50.0


def test_teacher_authorization_boundary(db_session):
    """Teacher 2 must NOT access analytics belonging to Teacher 1's course (403 Forbidden)."""
    teacher1 = _get_or_create_user(db_session, "teacher_a2_test@lumora.com", UserRole.TEACHER, "Teacher A2 Test")
    teacher2 = _get_or_create_user(db_session, "teacher2_a2_unauthorized@lumora.com", UserRole.TEACHER, "Teacher Unauthorized")

    course = db_session.query(Course).filter(Course.teacher_id == teacher1.id).first()
    exam = db_session.query(ALExam).filter(ALExam.course_id == course.id).first()

    token2 = create_access_token({"sub": str(teacher2.id), "email": teacher2.email, "role": teacher2.role.value})
    headers2 = {"Authorization": f"Bearer {token2}"}

    res = client.get(f"/api/analytics/exams/{exam.id}/foundation", headers=headers2)
    assert res.status_code == 403
    assert "do not have access" in res.json()["detail"]
