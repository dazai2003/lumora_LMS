"""
Reset Simulation Script.

Safely removes simulated student attempts, material views, student questions,
and inbox messages created by simulate_student_activity.py without touching
courses, lessons, or quizzes.

Usage:
    python reset_simulation.py
"""
import sys
import os

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from app.database import SessionLocal
from app.models import User, QuizAttempt, Answer, MaterialView, StudentQuestion, DirectMessage, Enrollment

SIMULATED_EMAILS = [
    "student_top1@fdp.com",
    "student_top2@fdp.com",
    "student_med1@fdp.com",
    "student_med2@fdp.com",
    "student_low1@fdp.com",
    "student_low2@fdp.com",
]

def reset_simulation():
    db = SessionLocal()
    print("=" * 60)
    print("🧹 RESETTING SIMULATED STUDENT ACTIVITY DATA...")
    print("=" * 60)

    try:
        sim_students = db.query(User).filter(User.email.in_(SIMULATED_EMAILS)).all()
        student_ids = [s.id for s in sim_students]

        if not student_ids:
            print("[INFO] No simulated student accounts found to clean up.")
            return

        # 1. Delete Answers & Attempts
        attempts = db.query(QuizAttempt).filter(QuizAttempt.student_id.in_(student_ids)).all()
        attempt_ids = [a.id for a in attempts]

        if attempt_ids:
            db.query(Answer).filter(Answer.attempt_id.in_(attempt_ids)).delete(synchronize_session=False)
            db.query(QuizAttempt).filter(QuizAttempt.id.in_(attempt_ids)).delete(synchronize_session=False)
            print(f"[CLEANUP] Deleted {len(attempt_ids)} simulated quiz attempts.")

        # 2. Delete Material Views
        mv_count = db.query(MaterialView).filter(MaterialView.student_id.in_(student_ids)).delete(synchronize_session=False)
        print(f"[CLEANUP] Deleted {mv_count} simulated material view logs.")

        # 3. Delete Student Questions & Inbox Messages
        sq_count = db.query(StudentQuestion).filter(StudentQuestion.student_id.in_(student_ids)).delete(synchronize_session=False)
        dm_count = db.query(DirectMessage).filter(DirectMessage.sender_id.in_(student_ids)).delete(synchronize_session=False)
        print(f"[CLEANUP] Deleted {sq_count} Q&A questions and {dm_count} direct messages.")

        # 4. Delete Enrollments & Student Accounts
        enr_count = db.query(Enrollment).filter(Enrollment.student_id.in_(student_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(student_ids)).delete(synchronize_session=False)
        print(f"[CLEANUP] Deleted {enr_count} enrollments and {len(student_ids)} simulated student accounts.")

        db.commit()
        print("=" * 60)
        print("🎉 SIMULATION DATA CLEANED SUCCESSFULLY!")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Reset failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_simulation()
