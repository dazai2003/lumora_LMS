"""
Clean Sweep Database Script:
Wipes all content (courses, lessons, materials, quizzes, questions, assignments, submissions, messages, activity logs, etc.)
while preserving user accounts (admins, teachers, students) in the `users` table.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import engine

TABLES_TO_CLEAR = [
    "document_extractions",
    "submission_section_feedbacks",
    "submission_suggestions",
    "submission_comments",
    "submission_versions",
    "submission_annotations",
    "assignment_resources",
    "plagiarism_reports",
    "rubric_score_details",
    "rubric_criteria",
    "assignment_rubrics",
    "submission_histories",
    "submission_files",
    "assignment_submissions",
    "group_members",
    "assignment_groups",
    "assignment_files",
    "assignments",
    "rubric_scores",
    "grading_rubrics",
    "question_analytics",
    "quiz_pool_rules",
    "question_pool_items",
    "question_pools",
    "audit_logs",
    "processing_jobs",
    "notifications",
    "ai_logs",
    "payments",
    "subscriptions",
    "activity_logs",
    "direct_messages",
    "teacher_questions",
    "system_ai_configs",
    "material_ai_insights",
    "student_learning_profiles",
    "student_recommendations",
    "ai_responses",
    "student_questions",
    "ai_tutor_sessions",
    "integrity_events",
    "answers",
    "quiz_attempts",
    "quiz_questions",
    "question_versions",
    "questions",
    "quizzes",
    "subtopics",
    "topics",
    "subjects",
    "student_material_progress",
    "material_notes",
    "material_flags",
    "materials",
    "lessons",
    "enrollments",
    "courses",
    "password_reset_requests",
]

def clean_sweep():
    print("[CLEAN SWEEP] Starting database cleanup...")
    with engine.connect() as conn:
        # Construct single TRUNCATE CASCADE query for all specified non-user tables
        tables_str = ", ".join(f'"{t}"' for t in TABLES_TO_CLEAR)
        try:
            conn.execute(text(f"TRUNCATE TABLE {tables_str} CASCADE;"))
            conn.commit()
            print(f"[SUCCESS] Truncated {len(TABLES_TO_CLEAR)} tables successfully.")
        except Exception as e:
            print(f"[WARN] Batch truncate failed, falling back to individual table truncates: {e}")
            for table in TABLES_TO_CLEAR:
                try:
                    conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE;'))
                    conn.commit()
                    print(f"  [OK] Cleared table: {table}")
                except Exception as te:
                    print(f"  [SKIP] Table {table} could not be cleared or does not exist: {te}")
            
    print("\n[DONE] Clean sweep complete! User accounts preserved.")

if __name__ == "__main__":
    clean_sweep()
