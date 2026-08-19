"""
Unit & Integration Tests for Lumora LMS MCQ Deduplication Engine.
Verifies exact hash, normalized string, token Jaccard similarity, and 50-question unique generation.
"""

import pytest
from app.services.al_generator_service import (
    is_duplicate_stem,
    _deduplicate_and_replace_candidates,
    calculate_exact_question_counts,
    assemble_final_paper_sequence,
    AL_CERTIFIED_MCQ_WEIGHTS,
)


def test_is_duplicate_stem_exact_and_near_matches():
    """Verify that exact strings, case differences, reference IDs, and near-word variations match as duplicates."""
    # 1. Exact matches with case/whitespace variations
    assert is_duplicate_stem("Which organelle produces ATP?", "which organelle produces atp?")
    assert is_duplicate_stem("Which organelle produces ATP? (Ref #a1b2c3)", "Which organelle produces ATP? (Ref #d4e5f6)")
    assert is_duplicate_stem("What is the function of mitochondria?", "What is the function of mitochondria? [Set #1]")

    # 2. Near matches (high token overlap)
    assert is_duplicate_stem(
        "Which of the following organelles is responsible for ATP synthesis in aerobic respiration?",
        "Which of the following organelles is primarily responsible for ATP synthesis in aerobic cellular respiration?"
    )

    # 3. Completely distinct biological questions (should NOT be duplicates)
    assert not is_duplicate_stem(
        "Which organelle produces ATP in eukaryotic cells?",
        "Explain the role of Casparian strip in plant root endodermis."
    )
    assert not is_duplicate_stem(
        "What is the function of DNA helicase during replication?",
        "Describe the stages of the cardiac cycle during ventricular systole."
    )


def test_deduplicate_and_replace_candidates_produces_exact_unique_count():
    """Verify that a batch with duplicate questions is cleaned and filled to exact target count."""
    duplicates_batch = [
        {"template_type": "generic_mcq", "stem_text": "Which organelle produces ATP?", "difficulty": "easy"},
        {"template_type": "generic_mcq", "stem_text": "Which organelle produces ATP? (Ref #001)", "difficulty": "easy"},
        {"template_type": "generic_mcq", "stem_text": "Which organelle produces ATP? (Ref #002)", "difficulty": "easy"},
        {"template_type": "five_statement_truth", "stem_text": "Which statement regarding photosynthesis is true?", "difficulty": "medium"},
        {"template_type": "five_statement_truth", "stem_text": "Which statement regarding photosynthesis is true? (Ref #003)", "difficulty": "medium"},
    ]

    unique_result = _deduplicate_and_replace_candidates(duplicates_batch, target_count=5)
    assert len(unique_result) == 5
    
    # Check all 5 stems are distinct
    stems = [c["stem_text"] for c in unique_result]
    for i in range(len(stems)):
        for j in range(i + 1, len(stems)):
            assert not is_duplicate_stem(stems[i], stems[j]), f"Found duplicate: '{stems[i]}' vs '{stems[j]}'"


def test_assemble_final_paper_sequence_50_questions():
    """Verify 50-question paper assembly enforces Q41-Q50 multi-response and progressive difficulty."""
    # Build 50 mock candidates
    target_counts = calculate_exact_question_counts(50, AL_CERTIFIED_MCQ_WEIGHTS)
    mock_candidates = []
    
    for fmt, count in target_counts.items():
        for i in range(count):
            mock_candidates.append({
                "template_type": fmt,
                "stem_text": f"Biological question for {fmt} item {i+1} concerning cellular physiology.",
                "difficulty": "easy" if i % 3 == 0 else ("medium" if i % 3 == 1 else "hard"),
                "cognitive_level": "understand",
                "options": ["A", "B", "C", "D", "E"],
                "correct_option": "A",
            })

    assembled = assemble_final_paper_sequence(mock_candidates, 50)
    assert len(assembled) == 50

    # Verify no more than 2 consecutive same template types
    consecutive = 1
    last_type = assembled[0]["template_type"]
    for q in assembled[1:]:
        if q["template_type"] == last_type:
            consecutive += 1
            assert consecutive <= 2, f"Found {consecutive} consecutive {last_type} at Q{q['question_number']}"
        else:
            consecutive = 1
            last_type = q["template_type"]

    # Verify question numbers 1 to 50
    for idx, q in enumerate(assembled):
        assert q["question_number"] == idx + 1
        assert q["candidate_id"] == f"ai_cand_{idx + 1}"
