"""
Paper I MCQ Proportional Template Weighting Service.

Calculates exact template question distributions matching official Sri Lankan G.C.E. Advanced Level
Biology examination ratios for any total question count requested by teachers.
"""

from typing import Dict, Any

STANDARD_AL_MCQ_RATIOS = {
    "generic_mcq": 0.26,            # ~13 out of 50
    "combination_grid": 0.20,       # 10 out of 50 (Q41-50)
    "five_statement_truth": 0.16,   # ~8 out of 50
    "matching_column": 0.14,        # ~7 out of 50
    "diagram_based": 0.12,          # ~6 out of 50
    "assertion_reason": 0.12,       # ~6 out of 50
}


def calculate_al_template_breakdown(total_questions: int = 50) -> Dict[str, int]:
    """
    Calculates exact question counts per template type for a given total question count.

    Args:
        total_questions: Number of questions requested (e.g., 50, 25, 10).

    Returns:
        Dict mapping template_type -> int count.
    """
    if total_questions <= 0:
        total_questions = 50

    raw_counts = {
        k: max(1 if total_questions >= 6 else 0, round(total_questions * ratio))
        for k, ratio in STANDARD_AL_MCQ_RATIOS.items()
    }

    # Adjust sum to match total_questions exactly
    current_sum = sum(raw_counts.values())
    diff = total_questions - current_sum

    if diff != 0:
        raw_counts["generic_mcq"] = max(1, raw_counts["generic_mcq"] + diff)

    return raw_counts
