"""
Inspect all foreign key relationships in the database.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print("=" * 80)
print("FOREIGN KEY RELATIONSHIPS IN DATABASE")
print("=" * 80)

fk_refs = db.execute(text("""
    SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name, kcu.column_name;
""")).fetchall()

for fk in fk_refs:
    print(f"  {fk[0]}.{fk[1]} -> {fk[2]}.{fk[3]}")

# Also check generic questions and question_versions
print("\n" + "=" * 80)
print("GENERIC QUESTION BANK TABLES AUDIT")
print("=" * 80)
q_count = db.execute(text("SELECT COUNT(*) FROM questions;")).scalar()
qv_count = db.execute(text("SELECT COUNT(*) FROM question_versions;")).scalar()
print(f"questions: {q_count} rows")
print(f"question_versions: {qv_count} rows")

if q_count > 0:
    courses_with_questions = db.execute(text("""
        SELECT q.course_id, c.title, COUNT(q.id) 
        FROM questions q 
        LEFT JOIN courses c ON q.course_id = c.id 
        GROUP BY q.course_id, c.title;
    """)).fetchall()
    print("Questions by course:")
    for row in courses_with_questions:
        print(f"  Course ID {row[0]} ('{row[1]}'): {row[2]} questions")

# Check questions table columns
q_cols = db.execute(text("""
    SELECT column_name FROM information_schema.columns WHERE table_name = 'questions';
""")).fetchall()
print("questions columns:", [c[0] for c in q_cols])

db.close()
