"""
Diagnostic script to inspect al_questions columns and values.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

cols = db.execute(text("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'al_questions'
    ORDER BY ordinal_position;
""")).fetchall()

print("Columns in al_questions:")
for c in cols:
    print(f"  {c[0]} ({c[1]})")

db.close()
