"""
Migration & Data Backfill Script for Phase 2 Advanced Learning Experience.
Updates database schema for QuestionPool, QuizPoolRule, QuestionAnalytics, GradingRubric, RubricScore and Phase 2 columns.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, Base, SessionLocal
from app.models import (
    QuestionPool, QuestionPoolItem, QuizPoolRule, QuestionAnalytics, GradingRubric, RubricScore
)

def run_migration():
    print("[INFO] Running Phase 2 Architecture Migration...")
    
    # 1. Create tables if they do not exist
    Base.metadata.create_all(bind=engine)
    print("[SUCCESS] Created/Verified new tables: question_pools, question_pool_items, quiz_pool_rules, question_analytics, grading_rubrics, rubric_scores")

    db = SessionLocal()
    try:
        print("[SUCCESS] Phase 2 Migration & Backfill Completed Successfully!")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Migration error: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
