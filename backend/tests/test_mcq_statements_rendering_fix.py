"""
Unit and integration tests for MCQ statements extraction, Combination Grid generation,
and Multi-Response Grid formatting.
"""

import pytest
from app.database import SessionLocal
from app.models import ALQuestion, ALQuestionTemplate
from app.services.al_mcq_generator import validate_mcq_candidate


def test_combination_grid_extracts_statements_from_stem():
    """Test that combination grid generator extracts real statements from stem rather than inserting dummy 'Premise A'."""
    cand = {
        "stem_text": (
            "Consider the following statements regarding the structural features of the chloroplast stroma:\n"
            "(A) It contains circular DNA molecules.\n"
            "(B) It is the site where the light-dependent reactions generate ATP and NADPH.\n"
            "(C) It contains 70S ribosomes for protein synthesis.\n"
            "(D) It houses the photosynthetic pigment molecules embedded in grana.\n"
            "Which of the above statements are correct?"
        ),
        "options": [
            "1. (A) and (B) only",
            "2. (B) and (C) only",
            "3. (A) and (C) only",
            "4. (C) and (D) only",
            "5. (A), (B), and (D) only"
        ],
        "correct_option": "3",
        "explanation": "Statements (A) and (C) are correct."
    }

    is_valid, errors, validated = validate_mcq_candidate(cand, {"target_format": "combination_grid"})
    stmts = validated.get("statements_json")

    assert stmts is not None
    assert len(stmts) == 4
    assert stmts[0]["code"] == "A"
    assert "circular DNA" in stmts[0]["text"]
    assert "Premise A" not in stmts[0]["text"]
    assert stmts[1]["code"] == "B"
    assert "light-dependent" in stmts[1]["text"]
    assert stmts[2]["code"] == "C"
    assert "70S ribosomes" in stmts[2]["text"]
    assert stmts[3]["code"] == "D"
    assert "pigment molecules" in stmts[3]["text"]


def test_combination_grid_replaces_dummy_premise_a_with_stem():
    """Test that if cand contains dummy 'Premise A', it gets overwritten with actual stem statements."""
    cand = {
        "stem_text": (
            "Regarding mitochondrial morphology:\n"
            "(A) The outer membrane has porin proteins.\n"
            "(B) The inner membrane has cardiolipin.\n"
            "(C) The matrix contains 80S ribosomes.\n"
            "(D) Cristae increase surface area for ATP synthase.\n"
            "Which statements are true?"
        ),
        "statements_json": [
            {"code": "A", "text": "Premise A"},
            {"code": "B", "text": "Premise B"},
            {"code": "C", "text": "Premise C"},
            {"code": "D", "text": "Premise D"},
        ],
        "options": ["1. A only", "2. A and B only", "3. A, B, D only", "4. C only", "5. All of the above"],
        "correct_option": "3",
    }

    is_valid, errors, validated = validate_mcq_candidate(cand, {"target_format": "combination_grid"})
    stmts = validated.get("statements_json")

    assert stmts is not None
    assert len(stmts) == 4
    assert "porin" in stmts[0]["text"]
    assert "cardiolipin" in stmts[1]["text"]
    assert "Premise A" not in stmts[0]["text"]


def test_db_questions_have_no_placeholder_premises():
    """Verify that all questions in the database have no leftover 'Premise A' placeholders."""
    db = SessionLocal()
    try:
        questions = db.query(ALQuestion).all()
        for q in questions:
            if isinstance(q.statements_json, list) and len(q.statements_json) > 0:
                for s in q.statements_json:
                    text = (s.get("text") if isinstance(s, dict) else str(s)).strip()
                    assert text != "Premise A", f"Question {q.id} in Exam {q.exam_id} has placeholder 'Premise A'"
                    assert text != "Premise B", f"Question {q.id} in Exam {q.exam_id} has placeholder 'Premise B'"
    finally:
        db.close()
