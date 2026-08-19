"""
Add missing enum values to alexamtype in PostgreSQL.
"""
import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import engine
from sqlalchemy import text

VALUES_TO_ADD = [
    'FULL_PAPER',
    'PAPER_2',
    'full_paper',
    'paper_2',
    'paper_1_mcq',
    'paper_2_structured',
    'paper_2_essay'
]

with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
    # Get existing labels
    res = conn.execute(text(
        "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'alexamtype';"
    )).fetchall()
    existing = {r[0] for r in res}
    print(f"Existing labels: {existing}")
    
    for val in VALUES_TO_ADD:
        if val not in existing:
            try:
                conn.execute(text(f"ALTER TYPE alexamtype ADD VALUE '{val}';"))
                print(f"  [ADDED] '{val}' to alexamtype")
            except Exception as e:
                print(f"  [SKIPPED/ERROR] '{val}': {e}")
        else:
            print(f"  [EXISTS] '{val}'")

    res = conn.execute(text(
        "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'alexamtype';"
    )).fetchall()
    print(f"Updated alexamtype labels: {[r[0] for r in res]}")
