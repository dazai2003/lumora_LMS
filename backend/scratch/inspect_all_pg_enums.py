"""
Inspect all PostgreSQL custom enums.
"""
import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    res = conn.execute(text("""
        SELECT t.typname, e.enumlabel 
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        ORDER BY t.typname, e.enumsortorder;
    """)).fetchall()
    
    enums = {}
    for typname, label in res:
        enums.setdefault(typname, []).append(label)
        
    for k, v in enums.items():
        print(f"Type '{k}': {v}")
