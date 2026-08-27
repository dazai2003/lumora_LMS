"""
Pytest Central Configuration & Automated Test Database Teardown Fixture.

Future-Proof Database Protection:
- ONLY deletes mock data created specifically by automated test fixtures (matching 'Test ', 'Mock ', 'Dummy ').
- NEVER deletes genuine courses, exams, questions, or materials you create in the future through the UI or API.
- Only runs during `pytest` execution — never runs when running the web application.
"""

import sys
import os
import pytest

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models import (
    User, Course, Unit, Lesson, Material, ALExam, ALQuestion, ALStudentSubmission,
    ALStudentAnswer, StudentMaterialProgress, MaterialFlag, MaterialNote,
    Enrollment, Notification, Question, QuestionVersion, QuizQuestion, Answer,
    AITutorSession, StudentQuestion, AIResponse, DirectMessage, ActivityLog
)


def _purge_test_specific_artifacts():
    """
    Surgically purges ONLY test-generated mock records created by pytest test suites.
    Real courses, exams, and users you create in the future are 100% safe and preserved.
    """
    db = SessionLocal()
    try:
        # 1. Identify ONLY mock test courses (created with test naming conventions)
        test_courses = db.query(Course).filter(
            (Course.id != 36) & (
                (Course.title.ilike("Test %")) |
                (Course.title.ilike("%Test Course%")) |
                (Course.title.ilike("Mock %")) |
                (Course.title.ilike("Dummy %")) |
                (Course.title.ilike("Temp %"))
            )
        ).all()
        test_course_ids = [c.id for c in test_courses]

        # 2. Identify ONLY mock test users (created with test email prefixes)
        test_users = db.query(User).filter(
            (~User.id.in_([1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])) & (
                (User.email.ilike("test_%")) |
                (User.email.ilike("mock_%")) |
                (User.email.ilike("temp_%")) |
                (User.email.ilike("%@test.com")) |
                (User.full_name.ilike("Test %"))
            )
        ).all()
        test_user_ids = [u.id for u in test_users]

        # 3. Identify ONLY mock test exams
        test_exams = db.query(ALExam).filter(
            (~ALExam.id.in_([210, 212, 213, 1025])) & (
                (ALExam.course_id.in_(test_course_ids)) |
                (ALExam.title.ilike("Test %")) |
                (ALExam.title.ilike("Mock %")) |
                (ALExam.title.ilike("Dummy %"))
            )
        ).all()
        test_exam_ids = [e.id for e in test_exams]

        # 4. Identify ONLY mock test materials
        test_materials = db.query(Material).filter(
            (Material.course_id.in_(test_course_ids)) |
            (Material.title.ilike("Test %")) |
            (Material.title.ilike("Mock %"))
        ).all()
        test_mat_ids = [m.id for m in test_materials]

        # 5. Delete synthetic Question Bank test mock items (e.g. '[Test Question Bank Error Fixes]')
        test_q_versions = db.query(QuestionVersion).filter(
            (QuestionVersion.question_text.ilike("%[Test %")) |
            (QuestionVersion.question_text.ilike("%Test Q Text%"))
        ).all()
        test_qv_ids = [qv.id for qv in test_q_versions]
        test_q_ids = [qv.question_id for qv in test_q_versions]

        if test_qv_ids:
            db.query(QuizQuestion).filter(QuizQuestion.question_version_id.in_(test_qv_ids)).delete(synchronize_session=False)
            db.query(Answer).filter(Answer.question_version_id.in_(test_qv_ids)).delete(synchronize_session=False)
            db.query(QuestionVersion).filter(QuestionVersion.id.in_(test_qv_ids)).delete(synchronize_session=False)
            db.query(Question).filter(Question.id.in_(test_q_ids)).delete(synchronize_session=False)

        # 6. Delete AI & Q&A mock data for test courses/users
        if test_course_ids or test_user_ids:
            db.query(AIResponse).filter(
                AIResponse.student_question_id.in_(
                    db.query(StudentQuestion.id).filter(
                        (StudentQuestion.course_id.in_(test_course_ids)) |
                        (StudentQuestion.student_id.in_(test_user_ids))
                    )
                )
            ).delete(synchronize_session=False)

            db.query(StudentQuestion).filter(
                (StudentQuestion.course_id.in_(test_course_ids)) |
                (StudentQuestion.student_id.in_(test_user_ids))
            ).delete(synchronize_session=False)

            db.query(AITutorSession).filter(
                (AITutorSession.course_id.in_(test_course_ids)) |
                (AITutorSession.student_id.in_(test_user_ids))
            ).delete(synchronize_session=False)

        # 7. Delete AL Exam answers and submissions for test exams/users
        if test_exam_ids or test_user_ids:
            db.query(ALStudentAnswer).filter(
                ALStudentAnswer.submission_id.in_(
                    db.query(ALStudentSubmission.id).filter(
                        (ALStudentSubmission.exam_id.in_(test_exam_ids)) |
                        (ALStudentSubmission.student_id.in_(test_user_ids))
                    )
                )
            ).delete(synchronize_session=False)

            db.query(ALStudentSubmission).filter(
                (ALStudentSubmission.exam_id.in_(test_exam_ids)) |
                (ALStudentSubmission.student_id.in_(test_user_ids))
            ).delete(synchronize_session=False)

            db.query(ALQuestion).filter(ALQuestion.exam_id.in_(test_exam_ids)).delete(synchronize_session=False)
            db.query(ALExam).filter(ALExam.id.in_(test_exam_ids)).delete(synchronize_session=False)

        # 8. Delete material telemetry for test courses/users
        if test_course_ids or test_user_ids or test_mat_ids:
            db.query(MaterialFlag).filter(
                (MaterialFlag.student_id.in_(test_user_ids)) |
                (MaterialFlag.material_id.in_(test_mat_ids))
            ).delete(synchronize_session=False)

            db.query(MaterialNote).filter(
                (MaterialNote.student_id.in_(test_user_ids)) |
                (MaterialNote.material_id.in_(test_mat_ids))
            ).delete(synchronize_session=False)

            db.query(StudentMaterialProgress).filter(
                (StudentMaterialProgress.student_id.in_(test_user_ids)) |
                (StudentMaterialProgress.material_id.in_(test_mat_ids))
            ).delete(synchronize_session=False)

            db.query(Material).filter(Material.course_id.in_(test_course_ids)).delete(synchronize_session=False)
            db.query(Lesson).filter(Lesson.course_id.in_(test_course_ids)).delete(synchronize_session=False)
            db.query(Unit).filter(Unit.course_id.in_(test_course_ids)).delete(synchronize_session=False)

        # 9. Delete test enrollments, notifications, and test courses/users
        if test_course_ids or test_user_ids:
            db.query(Enrollment).filter(
                (Enrollment.course_id.in_(test_course_ids)) |
                (Enrollment.student_id.in_(test_user_ids))
            ).delete(synchronize_session=False)

            db.query(Notification).filter(Notification.user_id.in_(test_user_ids)).delete(synchronize_session=False)
            db.query(DirectMessage).filter(
                (DirectMessage.sender_id.in_(test_user_ids)) |
                (DirectMessage.receiver_id.in_(test_user_ids))
            ).delete(synchronize_session=False)

            db.query(Course).filter(Course.id.in_(test_course_ids)).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_(test_user_ids)).delete(synchronize_session=False)

        db.commit()
    except Exception as e:
        db.rollback()
    finally:
        db.close()


@pytest.fixture(scope="session", autouse=True)
def autoclean_test_artifacts():
    """
    Session-level fixture that runs tests and automatically cleans up
    ONLY test-specific mock fixtures upon test suite completion.
    """
    _purge_test_specific_artifacts()
    yield
    _purge_test_specific_artifacts()
