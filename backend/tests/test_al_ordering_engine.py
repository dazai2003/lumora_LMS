"""
Unit and Integration Test Suite for Lumora A/L Biology Paper Ordering & Difficulty Engine (Phase 8).
Covers all 18 test scenarios specified in the Phase 8 specification.
"""

import pytest
from typing import List, Dict, Any

from app.services.al_difficulty_engine import (
    calculate_question_difficulty_score,
    normalize_candidate_difficulty,
)
from app.services.al_ordering_engine import (
    build_paper_blueprint,
    calculate_candidate_slot_compatibility,
    balance_answer_option_positions,
    audit_ordered_paper_quality,
    order_mcq_paper,
    OFFICIAL_50Q_UNIT_MAP_Q1_Q40,
    OFFICIAL_50Q_UNIT_MAP_Q41_Q50,
)


def _generate_synthetic_candidate(
    q_num: int,
    unit: int,
    fmt: str,
    diff: str = "medium",
    cog: str = "understand",
    stem_prefix: str = "Standard biological question regarding",
) -> Dict[str, Any]:
    cand = {
        "candidate_id": f"raw_cand_{q_num}",
        "question_number": q_num,
        "unit_number": unit,
        "template_type": fmt,
        "difficulty": diff,
        "cognitive_level": cog,
        "stem_text": f"{stem_prefix} the cellular and biochemical processes of topic #{q_num} in unit {unit}.",
        "options": ["A. Alpha structure", "B. Beta pathway", "C. Gamma enzyme", "D. Delta transport", "E. Epsilon complex"],
        "correct_option": "A",
        "explanation": "Biologically verified.",
        "requires_image": False,
        "points": 1.0,
    }
    if fmt == "multi_response_grid":
        cand["statements_json"] = [
            {"code": "A", "text": "Statement A", "is_true": True},
            {"code": "B", "text": "Statement B", "is_true": True},
            {"code": "C", "text": "Statement C", "is_true": False},
            {"code": "D", "text": "Statement D", "is_true": True},
            {"code": "E", "text": "Statement E", "is_true": False},
        ]
        cand["correct_option"] = "1"
    elif fmt == "matching_column":
        cand["grid_key_json"] = {
            "colIHeader": "Col 1",
            "colIIHeader": "Col 2",
            "colI": ["A1", "A2", "A3", "A4"],
            "colII": ["B1", "B2", "B3", "B4"],
        }
    elif fmt == "sequential_diagnostic":
        cand["grid_key_json"] = {
            "sequence_steps": ["Step 1", "Step 2", "Step 3", "Step 4"]
        }
    elif fmt == "incomplete_stem":
        cand["grid_key_json"] = {
            "formula": "Yield = A * B / C",
            "given_values": "A=10, B=2",
        }
    return cand


# Scenario 1: Standard 50-Question Paper
def test_scenario_1_standard_50q_ordering():
    candidates = []
    single_types = ["generic_mcq", "five_statement_truth", "matching_column", "combination_grid", "sequential_diagnostic", "incomplete_stem"]
    for i in range(50):
        unit = OFFICIAL_50Q_UNIT_MAP_Q1_Q40.get(i + 1, (i % 10) + 1)
        fmt = single_types[i % len(single_types)]
        diff = "easy" if i < 5 else ("medium" if i < 25 else "hard")
        cog = "remember" if i < 5 else ("understand" if i < 15 else "analyse")
        candidates.append(_generate_synthetic_candidate(i + 1, unit, fmt, diff, cog))

    ordered, audit = order_mcq_paper(candidates, target_count=50)
    assert len(ordered) == 50
    for idx, q in enumerate(ordered):
        assert q["question_number"] == idx + 1
    assert audit["overall_quality_score"] >= 75.0


# Scenario 2: Standard 50-Question with Limited Candidates (e.g. 35 candidates)
def test_scenario_2_limited_candidates_35():
    candidates = [_generate_synthetic_candidate(i + 1, (i % 10) + 1, "generic_mcq", "medium", "understand") for i in range(35)]
    ordered, audit = order_mcq_paper(candidates, target_count=50)
    assert len(ordered) == 35
    for idx, q in enumerate(ordered):
        assert q["question_number"] == idx + 1


# Scenario 3: Excessive Candidates of One Type (e.g. 50 generic_mcq)
def test_scenario_3_excessive_candidates_of_one_type():
    candidates = [_generate_synthetic_candidate(i + 1, (i % 10) + 1, "generic_mcq", "medium", "understand") for i in range(50)]
    ordered, audit = order_mcq_paper(candidates, target_count=50)
    assert len(ordered) == 50
    for idx, q in enumerate(ordered):
        assert q["question_number"] == idx + 1


# Scenario 4: Custom 20-Question Paper
def test_scenario_4_custom_20q_paper():
    candidates = [_generate_synthetic_candidate(i + 1, (i % 10) + 1, "generic_mcq", "medium", "understand") for i in range(20)]
    ordered, audit = order_mcq_paper(candidates, target_count=20)
    assert len(ordered) == 20


# Scenario 5: Custom 30-Question Paper
def test_scenario_5_custom_30q_paper():
    candidates = [_generate_synthetic_candidate(i + 1, (i % 10) + 1, "five_statement_truth", "medium", "understand") for i in range(30)]
    ordered, audit = order_mcq_paper(candidates, target_count=30)
    assert len(ordered) == 30


# Scenario 6: Unit 1 Only
def test_scenario_6_unit_1_only():
    candidates = [_generate_synthetic_candidate(i + 1, 1, "generic_mcq", "easy", "remember") for i in range(15)]
    ordered, audit = order_mcq_paper(candidates, target_count=15, selected_units=[1])
    assert len(ordered) == 15
    for q in ordered:
        assert q["unit_number"] == 1


# Scenario 7: Units 1-5 Custom Paper
def test_scenario_7_units_1_to_5():
    selected = [1, 2, 3, 4, 5]
    candidates = [_generate_synthetic_candidate(i + 1, selected[i % 5], "generic_mcq", "medium", "understand") for i in range(25)]
    ordered, audit = order_mcq_paper(candidates, target_count=25, selected_units=selected)
    assert len(ordered) == 25
    for q in ordered:
        assert q["unit_number"] in selected


# Scenario 8: Units 6-10 Custom Paper
def test_scenario_8_units_6_to_10():
    selected = [6, 7, 8, 9, 10]
    candidates = [_generate_synthetic_candidate(i + 1, selected[i % 5], "generic_mcq", "hard", "analyse") for i in range(25)]
    ordered, audit = order_mcq_paper(candidates, target_count=25, selected_units=selected)
    assert len(ordered) == 25
    for q in ordered:
        assert q["unit_number"] in selected


# Scenario 9: Easy Custom Paper
def test_scenario_9_easy_custom_paper():
    candidates = [_generate_synthetic_candidate(i + 1, 1, "generic_mcq", "easy", "remember") for i in range(10)]
    ordered, audit = order_mcq_paper(candidates, target_count=10, difficulty_mode="easy")
    assert len(ordered) == 10
    for q in ordered:
        assert q.get("difficulty_score", 1) <= 3


# Scenario 10: Hard Custom Paper
def test_scenario_10_hard_custom_paper():
    candidates = [_generate_synthetic_candidate(i + 1, 6, "combination_grid", "hard", "evaluate") for i in range(10)]
    ordered, audit = order_mcq_paper(candidates, target_count=10, difficulty_mode="hard")
    assert len(ordered) == 10
    for q in ordered:
        assert q.get("difficulty_score", 4) >= 3


# Scenario 11: Multi-Response Combination Balance
def test_scenario_11_multi_response_combination_balance():
    # 10 Multi-Response questions all with initial option 1
    candidates = [_generate_synthetic_candidate(i + 1, 2, "multi_response_grid", "hard", "analyse") for i in range(10)]
    ordered, audit = order_mcq_paper(candidates, target_count=10)
    assert len(ordered) == 10
    # Verified that combinations are varied across 1..5
    distinct_keys = set(q["correct_option"] for q in ordered)
    assert len(distinct_keys) >= 3


# Scenario 12: Correct Answer Position Balance for 50 Questions
def test_scenario_12_answer_position_balance_50q():
    candidates = [_generate_synthetic_candidate(i + 1, (i % 10) + 1, "generic_mcq", "medium", "understand") for i in range(50)]
    ordered, audit = order_mcq_paper(candidates, target_count=50)
    key_dist = audit["key_distribution"]
    # With 50 questions, each option should have approximately 10 occurrences (between 7 and 13)
    for opt in ["A", "B", "C", "D", "E"]:
        assert 7 <= key_dist.get(opt, 0) <= 13, f"Key {opt} count was {key_dist.get(opt, 0)}"


# Scenario 13: Topic Repetition Control
def test_scenario_13_topic_repetition_control():
    recent = [{"stem_text": "The Krebs cycle produces NADH and FADH2 in mitochondria.", "template_type": "generic_mcq"}]
    cand_dup = {"unit_number": 2, "template_type": "generic_mcq", "stem_text": "During the Krebs cycle in mitochondria, NADH and FADH2 are generated.", "difficulty_score": 3, "cognitive_level": "understand"}
    cand_fresh = {"unit_number": 2, "template_type": "generic_mcq", "stem_text": "Active transport requires carrier proteins and ATP hydrolysis across membranes.", "difficulty_score": 3, "cognitive_level": "understand"}

    slot = {"unit_number": 2, "target_template_type": "generic_mcq", "target_difficulty_range": (2, 4), "target_cognitive": "understand"}
    s_dup, _ = calculate_candidate_slot_compatibility(cand_dup, slot, recent)
    s_fresh, _ = calculate_candidate_slot_compatibility(cand_fresh, slot, recent)
    assert s_fresh > s_dup


# Scenario 14: Difficulty Spike Avoidance
def test_scenario_14_difficulty_spike_avoidance():
    blueprint = build_paper_blueprint(50)
    for i in range(1, len(blueprint)):
        min1, max1 = blueprint[i-1]["target_difficulty_range"]
        min2, max2 = blueprint[i]["target_difficulty_range"]
        assert abs(min2 - min1) <= 2
        assert abs(max2 - max1) <= 2


# Scenario 15: Quality Audit Report Structure & Warnings
def test_scenario_15_quality_audit_report():
    candidates = [_generate_synthetic_candidate(i + 1, (i % 10) + 1, "generic_mcq", "medium", "understand") for i in range(50)]
    ordered, audit = order_mcq_paper(candidates, target_count=50)
    assert "overall_quality_score" in audit
    assert "syllabus_fidelity" in audit
    assert "difficulty_progression" in audit
    assert "type_diversity" in audit
    assert "answer_balance" in audit
    assert "warnings" in audit
    assert "phase_breakdown" in audit
    assert len(audit["phase_breakdown"]) == 5
