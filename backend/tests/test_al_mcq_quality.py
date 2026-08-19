"""
Tests for Lumora Phase 7: MCQ Generation Quality, Completeness, and A/L Authenticity.
"""

import pytest
from app.services.al_mcq_generator import (
    calculate_exact_question_counts,
    plan_mcq_paper_slots,
    evaluate_and_map_multi_response,
    normalize_scientific_notation,
    validate_mcq_candidate,
    calculate_jaccard_similarity,
    check_and_deduplicate_candidates,
    AL_CERTIFIED_MCQ_WEIGHTS,
)


def test_largest_remainder_distribution_50_questions():
    """Verify exact 50-question integer allocation with zero rounding errors."""
    counts = calculate_exact_question_counts(50, AL_CERTIFIED_MCQ_WEIGHTS)
    assert sum(counts.values()) == 50
    assert counts["generic_mcq"] == 15
    assert counts["five_statement_truth"] == 10
    assert counts["matching_column"] == 8
    assert counts["combination_grid"] == 7
    assert counts["sequential_diagnostic"] == 5
    assert counts["incomplete_stem"] == 3
    assert counts["multi_response_grid"] == 2


def test_largest_remainder_distribution_25_questions():
    """Verify exact 25-question allocation."""
    counts = calculate_exact_question_counts(25, AL_CERTIFIED_MCQ_WEIGHTS)
    assert sum(counts.values()) == 25


def test_largest_remainder_distribution_10_questions():
    """Verify exact 10-question allocation."""
    counts = calculate_exact_question_counts(10, AL_CERTIFIED_MCQ_WEIGHTS)
    assert sum(counts.values()) == 10


def test_slot_planning_50_questions_syllabus_and_difficulty():
    """Verify 50-question slot planning enforces syllabus chronology and A/L Paper I layout."""
    slots = plan_mcq_paper_slots(50)
    assert len(slots) == 50

    # Verify Q1-Q5 are easy/warm-up
    for s in slots[:5]:
        assert s["difficulty"] == "easy"
        assert s["question_number"] <= 5

    # Verify Q41-Q50 are designated hard synthesis questions
    for s in slots[40:]:
        assert s["difficulty"] == "hard"
        assert s["question_number"] >= 41

    # Verify no more than 2 consecutive same type throughout the paper
    consecutive = 1
    last_type = slots[0]["template_type"]
    for s in slots[1:]:
        if s["template_type"] == last_type:
            consecutive += 1
            assert consecutive <= 2, f"Found {consecutive} consecutive {last_type} at Q{s['question_number']}"
        else:
            consecutive = 1
            last_type = s["template_type"]


def test_multi_response_programmatic_combination_mapping():
    """Verify all 5 canonical A/L Multi-Response combination rules."""
    # Option 1: A, B, D true
    stmts_1 = [
        {"code": "A", "is_true": True},
        {"code": "B", "is_true": True},
        {"code": "C", "is_true": False},
        {"code": "D", "is_true": True},
        {"code": "E", "is_true": False},
    ]
    key_1, summary_1, grid_1 = evaluate_and_map_multi_response(stmts_1)
    assert key_1 == "1"
    assert "Statements (A), (B), and (D)" in summary_1

    # Option 2: A, C, D true
    stmts_2 = [
        {"code": "A", "is_true": True},
        {"code": "B", "is_true": False},
        {"code": "C", "is_true": True},
        {"code": "D", "is_true": True},
        {"code": "E", "is_true": False},
    ]
    key_2, summary_2, grid_2 = evaluate_and_map_multi_response(stmts_2)
    assert key_2 == "2"

    # Option 3: A, B true
    stmts_3 = [
        {"code": "A", "is_true": True},
        {"code": "B", "is_true": True},
        {"code": "C", "is_true": False},
        {"code": "D", "is_true": False},
        {"code": "E", "is_true": False},
    ]
    key_3, summary_3, grid_3 = evaluate_and_map_multi_response(stmts_3)
    assert key_3 == "3"

    # Option 4: C, D true
    stmts_4 = [
        {"code": "A", "is_true": False},
        {"code": "B", "is_true": False},
        {"code": "C", "is_true": True},
        {"code": "D", "is_true": True},
        {"code": "E", "is_true": False},
    ]
    key_4, summary_4, grid_4 = evaluate_and_map_multi_response(stmts_4)
    assert key_4 == "4"

    # Option 5: Any other combination (e.g. A, C, E)
    stmts_5 = [
        {"code": "A", "is_true": True},
        {"code": "B", "is_true": False},
        {"code": "C", "is_true": True},
        {"code": "D", "is_true": False},
        {"code": "E", "is_true": True},
    ]
    key_5, summary_5, grid_5 = evaluate_and_map_multi_response(stmts_5)
    assert key_5 == "5"


def test_scientific_symbol_normalization():
    """Verify physiological and chemical symbol normalization."""
    raw = {
        "text": "Water potential psi_w = psi_s + psi_p during transpiration of H2O and uptake of CO2 with Ca2+ ions.",
        "greek": "alpha and beta tubulin with Delta G and gamma subunits.",
    }
    normalized = normalize_scientific_notation(raw)
    assert "ψw = ψs + ψp" in normalized["text"]
    assert "H₂O" in normalized["text"]
    assert "CO₂" in normalized["text"]
    assert "Ca²⁺" in normalized["text"]
    assert "α and β" in normalized["greek"]
    assert "Δ G and γ" in normalized["greek"]


def test_matrix_matching_validation():
    """Verify matrix matching structure validation."""
    slot = {
        "question_number": 14,
        "template_type": "matching_column",
        "unit_number": 4,
        "difficulty": "medium",
        "cognitive_level": "apply",
        "points": 1.0,
    }
    candidate = {
        "stem_text": "Match the plant hormones in Column I with their physiological effects in Column II:",
        "grid_key_json": {
            "colIHeader": "Plant Hormone",
            "colIIHeader": "Physiological Function",
            "colI": ["Auxin", "Gibberellin", "Cytokinin", "Abscisic Acid"],
            "colII": ["Apical dominance", "Stem elongation", "Cell division", "Stomatal closure"],
        },
        "options": ["A. 1-A, 2-B", "B. 1-B, 2-A", "C. 1-C, 2-D", "D. 1-D, 2-C", "E. 1-A, 2-C"],
        "correct_option": "A",
        "explanation": "Auxin promotes apical dominance while ABA mediates stomatal closure during drought.",
    }
    is_valid, errors, val_obj = validate_mcq_candidate(candidate, slot)
    assert is_valid
    assert val_obj["template_type"] == "matching_column"
    assert val_obj["grid_key_json"]["colIHeader"] == "Plant Hormone"
    assert len(val_obj["grid_key_json"]["colI"]) == 4


def test_semantic_duplicate_detection():
    """Verify semantic duplicate detection via token Jaccard similarity."""
    stem1 = "Which of the following cellular organelles is responsible for ATP synthesis in aerobic respiration?"
    stem2 = "Which cellular organelle is responsible for ATP synthesis in aerobic respiration?"
    stem3 = "Explain the role of the Casparian strip in regulating endodermal water transport."

    sim1_2 = calculate_jaccard_similarity(stem1, stem2)
    sim1_3 = calculate_jaccard_similarity(stem1, stem3)

    assert sim1_2 >= 0.65
    assert sim1_3 < 0.20

    candidates = [
        {"stem_text": stem1, "template_type": "generic_mcq"},
        {"stem_text": stem2, "template_type": "generic_mcq"},
        {"stem_text": stem3, "template_type": "generic_mcq"},
    ]
    valid_cands, dup_count = check_and_deduplicate_candidates(candidates)
    assert dup_count == 1
    assert len(valid_cands) == 2
    assert valid_cands[0]["stem_text"] == stem1
    assert valid_cands[1]["stem_text"] == stem3
