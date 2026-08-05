"""
PostgreSQL Schema Column Additions Script for Phase 2.
Safely adds missing columns to question_versions table using ALTER TABLE ADD COLUMN IF NOT EXISTS.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine

def add_phase2_columns():
    print("[INFO] Adding Phase 2 columns to question_versions table...")
    
    statements = [
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS tags JSON;",
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS learning_outcome TEXT;",
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS estimated_completion_time_seconds INTEGER DEFAULT 60;",
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS correct_explanation TEXT;",
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS incorrect_explanation TEXT;",
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS suggested_reading TEXT;",
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS recommended_material_id INTEGER;",
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS related_lesson_id INTEGER;",
        "ALTER TABLE question_versions ADD COLUMN IF NOT EXISTS follow_up_practice_question_ids JSON;"
    ]

    with engine.connect() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as e:
                print(f"[WARN] Error executing {stmt}: {e}")

    print("[SUCCESS] Phase 2 PostgreSQL columns successfully added!")

if __name__ == "__main__":
    add_phase2_columns()
