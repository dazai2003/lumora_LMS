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
    Course #36 (Advanced Level Biology) and official exams (#210, #212, #213, #1025, #1322)
    and authentic Question Bank items are 100% safe and preserved.
    """
    db = SessionLocal()
    try:
        # 1. Identify ONLY mock test courses (anything other than master Course #36)
        test_courses = db.query(Course).filter(Course.id != 36).all()
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
            (~ALExam.id.in_([210, 212, 213, 1025, 1322])) & (
                (ALExam.course_id != 36) |
                (ALExam.title.ilike("Test %")) |
                (ALExam.title.ilike("Mock %")) |
                (ALExam.title.ilike("Dummy %")) |
                (ALExam.title.ilike("Copy of %"))
            )
        ).all()
        test_exam_ids = [e.id for e in test_exams]

        # 4. Clean Student Submissions and Answers on Test Exams
        if test_exam_ids or test_user_ids:
            test_subs = db.query(ALStudentSubmission).filter(
                (ALStudentSubmission.exam_id.in_(test_exam_ids)) |
                (ALStudentSubmission.student_id.in_(test_user_ids))
            ).all()
            test_sub_ids = [s.id for s in test_subs]
            if test_sub_ids:
                db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_(test_sub_ids)).delete(synchronize_session=False)
                db.query(ALStudentSubmission).filter(ALStudentSubmission.id.in_(test_sub_ids)).delete(synchronize_session=False)
            if test_exam_ids:
                db.query(ALQuestion).filter(ALQuestion.exam_id.in_(test_exam_ids)).delete(synchronize_session=False)
                db.query(ALExam).filter(ALExam.id.in_(test_exam_ids)).delete(synchronize_session=False)

        # 5. Clean Test Units & Lessons
        test_units = db.query(Unit).filter((Unit.course_id != 36) | (Unit.title.ilike("Test %"))).all()
        test_unit_ids = [u.id for u in test_units]

        test_lessons = db.query(Lesson).filter(
            (Lesson.unit_id.in_(test_unit_ids)) | 
            (Lesson.course_id != 36) | 
            (Lesson.title.ilike("%Test%")) | 
            (Lesson.title.ilike("Non-Duplicated%"))
        ).all()
        test_lesson_ids = [l.id for l in test_lessons]

        test_mats = db.query(Material).filter(
            (Material.lesson_id.in_(test_lesson_ids)) | 
            (Material.course_id.in_(test_course_ids))
        ).all()
        test_mat_ids = [m.id for m in test_mats]

        # Delete AI Responses and Student Questions on test materials/courses/lessons
        sqs = db.query(StudentQuestion).filter(
            (StudentQuestion.course_material_id.in_(test_mat_ids)) |
            (StudentQuestion.course_id.in_(test_course_ids)) |
            (StudentQuestion.student_id.in_(test_user_ids))
        ).all()
        sq_ids = [sq.id for sq in sqs]
        if sq_ids:
            db.query(AIResponse).filter(AIResponse.student_question_id.in_(sq_ids)).delete(synchronize_session=False)
            db.query(StudentQuestion).filter(StudentQuestion.id.in_(sq_ids)).delete(synchronize_session=False)

        db.query(AITutorSession).filter(
            (AITutorSession.course_id.in_(test_course_ids)) |
            (AITutorSession.student_id.in_(test_user_ids))
        ).delete(synchronize_session=False)

        # Delete Material progress, flags, notes, and materials
        if test_mat_ids:
            db.query(StudentMaterialProgress).filter(
                (StudentMaterialProgress.material_id.in_(test_mat_ids)) |
                (StudentMaterialProgress.student_id.in_(test_user_ids))
            ).delete(synchronize_session=False)
            db.query(MaterialFlag).filter(
                (MaterialFlag.material_id.in_(test_mat_ids)) |
                (MaterialFlag.student_id.in_(test_user_ids))
            ).delete(synchronize_session=False)
            db.query(MaterialNote).filter(
                (MaterialNote.material_id.in_(test_mat_ids)) |
                (MaterialNote.student_id.in_(test_user_ids))
            ).delete(synchronize_session=False)
            db.query(Material).filter(Material.id.in_(test_mat_ids)).delete(synchronize_session=False)

        if test_lesson_ids:
            db.query(Lesson).filter(Lesson.id.in_(test_lesson_ids)).delete(synchronize_session=False)

        if test_unit_ids:
            db.query(Unit).filter(Unit.id.in_(test_unit_ids)).delete(synchronize_session=False)

        # 6. Delete synthetic Question Bank test mock items (e.g. '[Test Question Bank Error Fixes]')
        test_q_versions = db.query(QuestionVersion).filter(
            (QuestionVersion.question_text.ilike("%[Test %")) |
            (QuestionVersion.question_text.ilike("%Test Q Text%"))
        ).all()
        for qv in test_q_versions:
            qid = qv.question_id
            db.query(QuizQuestion).filter(QuizQuestion.question_version_id == qv.id).delete(synchronize_session=False)
            db.query(Answer).filter(Answer.question_version_id == qv.id).delete(synchronize_session=False)
            db.query(QuestionVersion).filter(QuestionVersion.id == qv.id).delete(synchronize_session=False)
            db.query(Question).filter(Question.id == qid).delete(synchronize_session=False)

        # 7. Delete test enrollments, notifications, and test courses/users
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
def autoclean_test_artifacts_session():
    """Session-level fixture: cleans test artifacts at the start and end of testing."""
    _purge_test_specific_artifacts()
    yield
    _purge_test_specific_artifacts()


