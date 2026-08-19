"""
Lumora A/L Biology Difficulty Evaluation Engine (Phase 8).

Implements multi-factor difficulty classification, score normalization,
and consistency checks for Sri Lankan G.C.E. Advanced Level Biology MCQs.

Difficulty Scale:
1 = Very Easy (Direct recall, single fundamental fact)
2 = Easy (Simple conceptual understanding, basic terminology)
3 = Moderate (Process reasoning, system mechanics, standard application)
4 = Difficult (Multi-step analysis, dense physiological systems, calculations)
5 = Very Difficult (Synthesis, cross-topic integration, Multi-Response Grid)
"""

import re
from typing import Dict, Any, Tuple, Optional

COGNITIVE_BASE_SCORES = {
    "remember": 1.2,
    "recall": 1.2,
    "understand": 2.2,
    "comprehend": 2.2,
    "apply": 3.4,
    "application": 3.4,
    "analyse": 4.3,
    "analyze": 4.3,
    "analysis": 4.3,
    "evaluate": 4.9,
    "evaluation": 4.9,
    "create": 5.0,
    "synthesis": 5.0,
}

FORMAT_BASE_SCORES = {
    "generic_mcq": 1.8,
    "five_statement_truth": 2.6,
    "sequential_diagnostic": 3.2,
    "matching_column": 3.4,
    "combination_grid": 3.8,
    "incomplete_stem": 3.9,
    "multi_response_grid": 4.8,
}

DIFFICULTY_LEVEL_MAP = {
    1: "very_easy",
    2: "easy",
    3: "moderate",
    4: "difficult",
    5: "very_difficult",
}

DIFFICULTY_LABEL_MAP = {
    "very_easy": 1,
    "easy": 2,
    "medium": 3,
    "moderate": 3,
    "hard": 4,
    "difficult": 4,
    "very_hard": 5,
    "very_difficult": 5,
    "challenging": 4,
    "advanced": 5,
}


def calculate_question_difficulty_score(question: Dict[str, Any]) -> Tuple[int, str, Dict[str, Any]]:
    """
    Computes a composite multi-factor normalized difficulty score (1 to 5)
    and difficulty level string for an MCQ candidate.

    Returns:
    (score_1_to_5, level_str, factor_breakdown)
    """
    stem = (question.get("stem_text") or "").strip()
    fmt = question.get("template_type") or "generic_mcq"
    declared_cog = str(question.get("cognitive_level") or "understand").lower()
    declared_diff = str(question.get("difficulty") or "medium").lower()

    # 1. Cognitive Factor
    cog_score = COGNITIVE_BASE_SCORES.get(declared_cog, 2.5)

    # 2. Format Complexity Factor
    fmt_score = FORMAT_BASE_SCORES.get(fmt, 2.0)

    # 3. Information & Structural Density Factor
    density_score = 2.0
    word_count = len(stem.split())

    if word_count > 60:
        density_score += 0.8
    elif word_count > 35:
        density_score += 0.4
    elif word_count < 12:
        density_score -= 0.5

    # Multi-statement or matrix data density
    stmts = question.get("statements_json") or []
    if isinstance(stmts, list) and len(stmts) >= 4:
        density_score += 0.6

    grid_key = question.get("grid_key_json") or {}
    if isinstance(grid_key, dict):
        if "colI" in grid_key and "colII" in grid_key:
            density_score += 0.5
        if "sequence_steps" in grid_key:
            density_score += 0.4
        if "formula" in grid_key or "given_values" in grid_key:
            density_score += 0.8

    # 4. Calculation & Technical Reasoning Keywords
    reasoning_bonus = 0.0
    calc_keywords = [
        "calculate", "probability", "ratio", "proportion", "yield", "frequency",
        "genotype", "phenotype", "recombination", "osmotic", "potential", "stoichiometry"
    ]
    stem_lower = stem.lower()
    for kw in calc_keywords:
        if kw in stem_lower:
            reasoning_bonus += 0.25

    reasoning_bonus = min(1.0, reasoning_bonus)

    # 5. Composite Weighted Score
    # Weights: Cognitive (35%), Format (30%), Density (20%), Reasoning/Calc (15%)
    raw_composite = (
        0.35 * cog_score +
        0.30 * fmt_score +
        0.20 * density_score +
        0.15 * (2.0 + reasoning_bonus * 3.0)
    )

    # Lightly anchor with declared difficulty if valid
    declared_num = DIFFICULTY_LABEL_MAP.get(declared_diff)
    if declared_num:
        raw_composite = 0.80 * raw_composite + 0.20 * float(declared_num)

    # Multi-Response Grid is inherently Phase 5 / high cognitive load
    if fmt == "multi_response_grid":
        raw_composite = max(4.0, raw_composite)

    # Bound raw composite between 1.0 and 5.0
    bounded_score = max(1.0, min(5.0, raw_composite))
    final_score = int(round(bounded_score))
    final_score = max(1, min(5, final_score))

    level_str = DIFFICULTY_LEVEL_MAP.get(final_score, "moderate")

    breakdown = {
        "cognitive_factor": round(cog_score, 2),
        "format_factor": round(fmt_score, 2),
        "density_factor": round(density_score, 2),
        "reasoning_bonus": round(reasoning_bonus, 2),
        "raw_composite": round(raw_composite, 2),
        "final_score": final_score,
        "difficulty_level": level_str,
    }

    return final_score, level_str, breakdown


def normalize_candidate_difficulty(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enriches and normalizes candidate question with exact difficulty_score and difficulty_level.
    Preserves existing candidate fields.
    """
    score, level, breakdown = calculate_question_difficulty_score(candidate)
    enriched = dict(candidate)
    enriched["difficulty_score"] = score
    enriched["difficulty_level"] = level
    enriched["difficulty"] = level
    enriched["difficulty_breakdown"] = breakdown
    return enriched
