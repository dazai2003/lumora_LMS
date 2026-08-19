"""
Inspect materials and material_flags
"""
import os, sys
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)
from app.database import SessionLocal
from sqlalchemy import text
db = SessionLocal()

mats = db.execute(text("SELECT id, course_id, title FROM materials WHERE course_id = 36 ORDER BY id;")).fetchall()
print(f"Course 36 materials: {len(mats)}")

flags = db.execute(text("""
    SELECT mf.id, mf.material_id, m.title, mf.reason, mf.student_id 
    FROM material_flags mf 
    JOIN materials m ON mf.material_id = m.id 
    WHERE m.course_id = 36 
    ORDER BY mf.id;
""")).fetchall()
print(f"Course 36 material flags: {len(flags)}")
for f in flags:
    print(f"  Flag #{f[0]} | Material #{f[1]} ('{f[2]}') | Reason: {f[3]} | Student: {f[4]}")

db.close()
