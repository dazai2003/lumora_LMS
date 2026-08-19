"""
Inspect questions and question_versions tables in detail.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print("=" * 80)
print("INSPECTING QUESTIONS & QUESTION_VERSIONS")
print("=" * 80)

q_rows = db.execute(text("""
    SELECT q.id, q.lesson_id, q.is_banked, q.is_active, qv.question_type, qv.question_text, l.course_id, c.title
    FROM questions q
    JOIN question_versions qv ON q.id = qv.question_id
    LEFT JOIN lessons l ON q.lesson_id = l.id
    LEFT JOIN courses c ON l.course_id = c.id
    LIMIT 20;
""")).fetchall()

print(f"Sample 20 question versions:")
for r in q_rows:
    q_txt = (r[5] or "")[:50].replace("\n", " ")
    print(f"  Q#{r[0]} | Lesson: {r[1]} | Course: {r[6]} ('{r[7]}') | Type: {r[4]} | '{q_txt}...'")

# Check if any course 36 questions exist here
c36_qs = db.execute(text("""
    SELECT COUNT(*) 
    FROM questions q
    LEFT JOIN lessons l ON q.lesson_id = l.id
    WHERE l.course_id = 36;
""")).scalar()
print(f"\nCourse 36 questions in generic questions table: {c36_qs}")

# Check other courses questions in generic questions table
other_qs = db.execute(text("""
    SELECT l.course_id, c.title, COUNT(q.id)
    FROM questions q
    LEFT JOIN lessons l ON q.lesson_id = l.id
    LEFT JOIN courses c ON l.course_id = c.id
    GROUP BY l.course_id, c.title;
""")).fetchall()
print("Questions by course in generic questions table:")
for r in other_qs:
    print(f"  Course {r[0]} ('{r[1]}'): {r[2]} questions")

db.close()
