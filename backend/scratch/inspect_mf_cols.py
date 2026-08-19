"""
Check columns of material_flags
"""
import os, sys
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)
from app.database import SessionLocal
from sqlalchemy import text
db = SessionLocal()

cols = db.execute(text("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'material_flags';
""")).fetchall()

print("Columns in material_flags:", [c[0] for c in cols])
db.close()
