"""
Cleanup script:
1. Trims bracketed tier titles (e.g. '(Top Tier)') from student names in the users table.
2. Removes simulated un-answered Q&A moderation questions.

Usage:
    python cleanup_qa_and_names.py
"""
import sys
import os

_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from app.database import SessionLocal
from app.models import User, StudentQuestion, TeacherQuestion

def cleanup():
    db = SessionLocal()
    print("=" * 60)
    print("CLEANING UP STUDENT NAMES AND UN-ANSWERED Q&A ITEMS...")
    print("=" * 60)

    try:
        # 1. Clean student names (strip '(Top Tier)', '(Medium Tier)', '(Struggling Tier)')
        users = db.query(User).filter(User.role == "student").all()
        renamed_count = 0
        for u in users:
            clean_name = u.full_name.split("(")[0].strip()
            if clean_name != u.full_name:
                u.full_name = clean_name
                renamed_count += 1
        db.commit()
        print(f"[CLEANUP] Cleaned {renamed_count} student names (removed bracketed titles).")

        # 2. Delete un-answered Q&A moderation items
        sq_del = db.query(StudentQuestion).filter(StudentQuestion.is_answered == False).delete(synchronize_session=False)
        tq_del = db.query(TeacherQuestion).filter(TeacherQuestion.is_answered == False).delete(synchronize_session=False)
        db.commit()
        print(f"[CLEANUP] Deleted {sq_del} student questions and {tq_del} teacher questions.")

        print("=" * 60)
        print("CLEANUP COMPLETED SUCCESSFULLY!")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Cleanup failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup()
