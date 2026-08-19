"""
Lumora LMS - Database Enum Repair Script
Normalizes all stored ALQuestion template_type records to canonical lowercase enum values.
"""
from app.database import engine
from sqlalchemy import text

CANONICAL_TEMPLATES = [
    "generic_mcq",
    "multi_response_grid",
    "five_statement_truth",
    "matching_column",
    "combination_grid",
    "sequential_diagnostic",
    "incomplete_stem",
    "assertion_reason",
    "diagram_based",
    "experimental_procedure",
    "structured_subparts",
    "essay_rubric",
]

def repair_database_enums():
    total_repaired = 0
    with engine.connect() as conn:
        for val in CANONICAL_TEMPLATES:
            # Update any uppercase or mixed-case variant to the exact canonical lowercase string
            query = text(
                "UPDATE al_questions "
                "SET template_type = :canonical "
                "WHERE LOWER(template_type) = :canonical AND template_type != :canonical;"
            )
            res = conn.execute(query, {"canonical": val})
            total_repaired += res.rowcount
        conn.commit()

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT template_type, COUNT(*) FROM al_questions GROUP BY template_type")).fetchall()
        print(f"[DATABASE REPAIR COMPLETE] Total invalid records normalized: {total_repaired}")
        print("[CURRENT DISTINCT VALUES IN al_questions]:")
        for val, count in rows:
            print(f"  - '{val}': {count} questions")

if __name__ == "__main__":
    repair_database_enums()
