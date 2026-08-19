import pytest
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app
from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, ALExam, ALExamType,
    ALQuestion, ALQuestionTemplate, ALStudentSubmission, ALStudentAnswer
)
from app.auth import create_access_token

client = TestClient(app)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_paper_2_submission_requires_teacher_manual_grading(db_session):
    """
    Verify that when an exam with Paper II (Structured/Essay) is submitted:
    - Status is 'submitted' (pending teacher review)
    - grade is None (not a premature provisional grade)
    - AI auto-scoring does NOT award provisional final marks
    """
    teacher = db_session.query(User).filter(User.email == "teacher_grading_test@lumora.com").first()
    if not teacher:
        teacher = User(
            email="teacher_grading_test@lumora.com",
            full_name="Grading Test Teacher",
            role=UserRole.TEACHER,
            hashed_password="hashed_pw",
            is_active=True
        )
        db_session.add(teacher)
        db_session.commit()
        db_session.refresh(teacher)
    else:
        teacher.role = UserRole.TEACHER
        teacher.is_active = True
        db_session.commit()

    student = db_session.query(User).filter(User.email == "student_grading_test@lumora.com").first()
    if not student:
        student = User(
            email="student_grading_test@lumora.com",
            full_name="Grading Test Student",
            role=UserRole.STUDENT,
            hashed_password="hashed_pw",
            is_active=True
        )
        db_session.add(student)
        db_session.commit()
        db_session.refresh(student)
    else:
        student.role = UserRole.STUDENT
        student.is_active = True
        db_session.commit()

    # 2. Setup Course & Exam with Structured Question
    course = db_session.query(Course).filter(Course.title == "Grading Test Course").first()
    if not course:
        course = Course(
            title="Grading Test Course",
            description="Course for grading tests",
            teacher_id=teacher.id
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)
    else:
        course.teacher_id = teacher.id
        db_session.commit()

    exam = db_session.query(ALExam).filter(ALExam.title == "Test Paper 2 Structured Exam").first()
    if not exam:
        exam = ALExam(
            course_id=course.id,
            title="Test Paper 2 Structured Exam",
            exam_type=ALExamType.PAPER_2_STRUCTURED,
            time_limit_minutes=60,
            total_questions=1,
            max_attempts=1,
            is_published=True
        )
        db_session.add(exam)
        db_session.commit()
        db_session.refresh(exam)
    else:
        exam.course_id = course.id
        db_session.commit()

    # Question with structured subparts
    question = db_session.query(ALQuestion).filter(ALQuestion.exam_id == exam.id).first()
    if not question:
        question = ALQuestion(
            exam_id=exam.id,
            question_number=1,
            template_type=ALQuestionTemplate.STRUCTURED_SUBPARTS,
            stem_text="Describe the photosynthetic electron transport pathway.",
            points=40.0,
            structured_subparts_json=[
                {
                    "id": "node_seq_1",
                    "display_label": "Part A — Sequential Electron Flow",
                    "prompt": "Arrange the carriers in correct sequence.",
                    "response_format": "sequential_pathway",
                    "points": 20.0
                },
                {
                    "id": "node_mat_2",
                    "display_label": "Part B — Thylakoid Complex Classification",
                    "prompt": "Fill in the classification table.",
                    "response_format": "classification_matrix",
                    "points": 20.0
                }
            ]
        )
        db_session.add(question)
        db_session.commit()
        db_session.refresh(question)

    # 3. Create active in_progress submission
    submission = ALStudentSubmission(
        exam_id=exam.id,
        student_id=student.id,
        status="in_progress"
    )
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)

    student_token = create_access_token(data={"sub": str(student.id), "role": student.role.value})

    # 4. Student submits exam with composite subpart answers
    submit_payload = {
        "exam_id": exam.id,
        "answers": [
            {
                "question_id": question.id,
                "subpart_answers_json": {
                    "node_seq_1__seq_0": "Photosystem II (P680)",
                    "node_seq_1__seq_1": "Plastoquinone pool",
                    "node_seq_1__seq_2": "Cytochrome b6f complex",
                    "node_mat_2__cell_0_1": "Light-driven water oxidation"
                }
            }
        ]
    }

    response = client.post(
        f"/api/al-exams/submissions/{submission.id}/submit",
        json=submit_payload,
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert response.status_code == 200
    res_data = response.json()

    # Verify status is 'submitted' and grade is None (not premature provisional)
    assert res_data["status"] == "submitted"
    assert res_data["grade"] is None

    # 5. Teacher verifies and publishes official grade
    teacher_token = create_access_token(data={"sub": str(teacher.id), "role": teacher.role.value})
    answers = db_session.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id == submission.id).all()
    ans_id = answers[0].id

    verify_payload = {
        "answers": [
            {
                "answer_id": ans_id,
                "teacher_override_points": 36.0,
                "feedback_notes": "Excellent sequential ordering of photosystem carriers."
            }
        ],
        "teacher_feedback": "Great overall performance on photosynthesis mechanisms."
    }

    verify_res = client.post(
        f"/api/al-exams/submissions/{submission.id}/verify",
        json=verify_payload,
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert verify_res.status_code == 200, f"Verify failed: {verify_res.status_code} - {verify_res.text}"
    v_data = verify_res.json()

    # Verify official teacher verification
    assert v_data["status"] == "teacher_verified"
    assert v_data["scaled_score"] == 36.0
    assert v_data["percentage"] == 90.0
    assert v_data["grade"] == "A"
    assert v_data["teacher_feedback"] == "Great overall performance on photosynthesis mechanisms."
