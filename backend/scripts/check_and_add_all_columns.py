"""
Universal Database Column Auditor & Auto-Migrator for Lumora LMS.
Inspects all SQLAlchemy ORM models against active PostgreSQL database tables,
identifies any missing columns, and safely executes ALTER TABLE ADD COLUMN IF NOT EXISTS.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import inspect, text
from app.database import engine, Base
import app.models  # Ensures all ORM models are registered

def audit_and_migrate_all_columns():
    print("[INFO] Auditing PostgreSQL database schema against SQLAlchemy ORM models...")
    inspector = inspect(engine)
    db_tables = inspector.get_table_names()

    statements_executed = 0

    with engine.connect() as conn:
        for model_cls in Base.__subclasses__():
            if not hasattr(model_cls, "__tablename__"):
                continue
            
            table_name = model_cls.__tablename__
            if table_name not in db_tables:
                print(f"[INFO] Table '{table_name}' does not exist in DB yet. Creating...")
                model_cls.__table__.create(bind=engine)
                print(f"[SUCCESS] Created table '{table_name}'.")
                continue

            existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
            
            for column in model_cls.__table__.columns:
                if column.name not in existing_columns:
                    col_type = column.type.compile(engine.dialect)
                    
                    # Add DEFAULT clause if default value is specified
                    default_sql = ""
                    if column.default is not None and column.default.arg is not None:
                        val = column.default.arg
                        if hasattr(val, "value"):
                            val = val.value
                        if isinstance(val, (int, float, bool)):
                            default_sql = f" DEFAULT {val}"
                        elif isinstance(val, str):
                            default_sql = f" DEFAULT '{val}'"

                    stmt = f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column.name} {col_type}{default_sql};"
                    print(f"[MIGRATING] Table '{table_name}' missing column '{column.name}'. Executing: {stmt}")
                    try:
                        conn.execute(text(stmt))
                        conn.commit()
                        statements_executed += 1
                        print(f"[SUCCESS] Added column '{column.name}' to '{table_name}'.")
                    except Exception as e:
                        print(f"[WARN] Failed to execute {stmt}: {e}")

    print(f"[COMPLETE] Database audit finished. Migrated {statements_executed} missing columns.")

if __name__ == "__main__":
    audit_and_migrate_all_columns()
