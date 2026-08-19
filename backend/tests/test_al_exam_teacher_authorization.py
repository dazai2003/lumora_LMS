import pytest
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from main import app
from app.database import get_db, SessionLocal
from app.models import User, UserRole, Course, ALExam, ALExamType, ALQuestionTemplate
from app.auth import create_access_token

client = TestClient(app)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_teacher_can_batch_accept_candidates_on_any_exam(db_session):
    # Ensure Teacher 1 exists (Course owner)
    teacher1 = db_session.query(User).filter(User.email == "teacher1_test@lumora.com").first()
    if not teacher1:
        teacher1 = User(
            email="teacher1_test@lumora.com",
            full_name="Teacher One",
            role=UserRole.TEACHER,
            hashed_password="hashed_pw",
            is_active=True
        )
        db_session.add(teacher1)
        db_session.commit()
        db_session.refresh(teacher1)

    # Ensure Teacher 2 exists (Different teacher who did NOT create course)
    teacher2 = db_session.query(User).filter(User.email == "teacher2_test@lumora.com").first()
    if not teacher2:
        teacher2 = User(
            email="teacher2_test@lumora.com",
            full_name="Teacher Two",
            role=UserRole.TEACHER,
            hashed_password="hashed_pw",
            is_active=True
        )
        db_session.add(teacher2)
        db_session.commit()
        db_session.refresh(teacher2)

    # Ensure Course owned by Teacher 1
    course = db_session.query(Course).filter(Course.title == "Test AL Biology Course").first()
    if not course:
        course = Course(
            title="Test AL Biology Course",
            description="Course for testing",
            teacher_id=teacher1.id
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

    # Ensure Exam attached to this Course
    exam = db_session.query(ALExam).filter(ALExam.title == "Test Auth Exam").first()
    if not exam:
        exam = ALExam(
            course_id=course.id,
            title="Test Auth Exam",
            description="Exam for testing teacher authorization",
            exam_type=ALExamType.PAPER_1_MCQ,
            time_limit_minutes=120,
            total_questions=50,
            is_published=False
        )
        db_session.add(exam)
        db_session.commit()
        db_session.refresh(exam)

    # Teacher 2 authenticates
    token_teacher2 = create_access_token({"sub": str(teacher2.id), "email": teacher2.email, "role": "teacher"})
    headers = {"Authorization": f"Bearer {token_teacher2}"}

    # Teacher 2 batch accepts candidate questions into the exam owned by Teacher 1's course
    batch_payload = {
        "exam_id": exam.id,
        "candidates": [
            {
                "candidate_id": "cand_test_1",
                "stem_text": "Which organelle is responsible for ATP synthesis during cellular respiration?",
                "template_type": "generic_mcq",
                "options": ["Mitochondria", "Ribosome", "Golgi apparatus", "Endoplasmic reticulum", "Nucleus"],
                "correct_option": "A",
                "explanation": "Mitochondria produce ATP through oxidative phosphorylation.",
                "points": 1.0,
                "difficulty": "medium",
                "cognitive_level": "understand"
            }
        ]
    }

    response = client.post("/api/al-authoring/batch-accept-questions", json=batch_payload, headers=headers)
    assert response.status_code == 200, f"Expected 200 OK, got {response.status_code}: {response.text}"
    data = response.json()
    assert data["accepted"] == 1
    assert len(data["results"]) == 1
    assert data["results"][0]["stem_snippet"].startswith("Which organelle is responsible for ATP synthesis")

def test_student_cannot_batch_accept_candidates(db_session):
    student = db_session.query(User).filter(User.role == UserRole.STUDENT).first()
    if not student:
        student = User(
            email="student_auth_test@lumora.com",
            full_name="Student Auth Test",
            role=UserRole.STUDENT,
            hashed_password="hashed_pw",
            is_active=True
        )
        db_session.add(student)
        db_session.commit()
        db_session.refresh(student)

    exam = db_session.query(ALExam).first()
    assert exam is not None

    token_student = create_access_token({"sub": str(student.id), "email": student.email, "role": "student"})
    headers = {"Authorization": f"Bearer {token_student}"}

    batch_payload = {
        "exam_id": exam.id,
        "candidates": [
            {
                "candidate_id": "cand_test_student",
                "stem_text": "Sample stem",
                "template_type": "generic_mcq"
            }
        ]
    }

    response = client.post("/api/al-authoring/batch-accept-questions", json=batch_payload, headers=headers)
    assert response.status_code == 403

