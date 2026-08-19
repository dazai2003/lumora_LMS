"""
Database configuration and session management.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

# Load .env from the backend directory (parent of app/)
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_backend_dir, ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+pg8000://postgres:postgres@localhost:5432/fdp_db")

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db_schema():
    """Idempotently ensures Phase 5 schema columns exist in database tables."""
    from sqlalchemy import text
    with engine.connect() as conn:
        cols_sub = [
            ("finalized_by_id", "INTEGER"),
            ("finalized_at", "TIMESTAMP"),
        ]
        for col_name, col_type in cols_sub:
            try:
                conn.execute(text(f"ALTER TABLE al_student_submissions ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
            except Exception as e:
                pass

        cols_ans = [
            ("auto_score", "DOUBLE PRECISION DEFAULT 0.0"),
            ("ai_score", "DOUBLE PRECISION DEFAULT 0.0"),
            ("teacher_score", "DOUBLE PRECISION"),
            ("final_score", "DOUBLE PRECISION DEFAULT 0.0"),
        ]
        for col_name, col_type in cols_ans:
            try:
                conn.execute(text(f"ALTER TABLE al_student_answers ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
            except Exception as e:
                pass

        cols_exam = [
            ("instructions", "TEXT"),
            ("difficulty_policy", "VARCHAR(50) DEFAULT 'mixed'"),
            ("available_from", "TIMESTAMP"),
            ("available_until", "TIMESTAMP"),
            ("show_result_immediately", "BOOLEAN DEFAULT TRUE"),
        ]
        for col_name, col_type in cols_exam:
            try:
                conn.execute(text(f"ALTER TABLE al_exams ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
            except Exception as e:
                pass

        enum_vals = [
            "generic_mcq", "multi_response_grid", "five_statement_truth",
            "matching_column", "combination_grid", "sequential_diagnostic",
            "incomplete_stem", "assertion_reason", "diagram_based",
            "experimental_procedure", "structured_subparts", "essay_rubric"
        ]
        for val in enum_vals:
            try:
                conn.execute(text(f"ALTER TYPE alquestiontemplate ADD VALUE IF NOT EXISTS '{val}';"))
            except Exception:
                pass

        cols_q = [
            ("requires_image", "BOOLEAN DEFAULT FALSE"),
            ("image_description", "TEXT"),
        ]
        for col_name, col_type in cols_q:
            try:
                conn.execute(text(f"ALTER TABLE al_questions ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
            except Exception:
                pass

        try:
            conn.execute(text("ALTER TABLE al_questions ALTER COLUMN template_type TYPE VARCHAR(100) USING template_type::text;"))
        except Exception:
            pass

        conn.commit()

init_db_schema()

def get_db():
    """Dependency that provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
