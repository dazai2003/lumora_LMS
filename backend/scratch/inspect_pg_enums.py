"""
Inspect and repair alexamtype enum labels in PostgreSQL.
"""
import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    res = conn.execute(text(
        "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'alexamtype';"
    )).fetchall()
    labels = [r[0] for r in res]
    print(f"Current PostgreSQL alexamtype labels in DB: {labels}")
