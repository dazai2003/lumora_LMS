"""
Tests for A/L Assembly Algorithm, Scientific Notation Normalization, and Diagram Metadata.
"""

import pytest
from app.services.al_generator_service import (
    assemble_final_paper_sequence,
    normalize_scientific_notation,
    _build_fallback_candidates,
)


def test_scientific_notation_normalization():
    """Verify water potential, chemical formulas, and Greek letters normalize cleanly."""
    input_str = "A plant cell with ψ_w = ψ_s + ψ_p has CO2 and H2O with Ca2+ ions and alpha, beta, gamma particles."
    normalized = normalize_scientific_notation(input_str)
    
    assert "ψw" in normalized
    assert "ψs" in normalized
    assert "ψp" in normalized
    assert "CO₂" in normalized
    assert "H₂O" in normalized
    assert "Ca²⁺" in normalized
    assert "α" in normalized
    assert "β" in normalized
    assert "γ" in normalized


def test_interleaved_assembly_and_q41_q50_rule():
    """Verify 50-question paper assembly interleaves all questions with max consecutive same type <= 2."""
    fallback_pool = _build_fallback_candidates("paper_1_mcq", 50)
    assembled = assemble_final_paper_sequence(fallback_pool, 50)

    assert len(assembled) == 50

    # Verify sequential question numbers 1 to 50
    for idx, q in enumerate(assembled):
        assert q["question_number"] == idx + 1

    # Verify max consecutive same type <= 2 across entire paper
    consecutive = 1
    last_type = None
    for q in assembled:
        t = q["template_type"]
        if t == last_type:
            consecutive += 1
            assert consecutive <= 2, f"Found 3 consecutive questions of type {t} at Q{q['question_number']}"
        else:
            last_type = t
            consecutive = 1


def test_historical_diagram_metadata_in_candidates():
    """Verify candidates contain diagram metadata when image is required."""
    fallback_pool = _build_fallback_candidates("paper_1_mcq", 50)
    diagram_qs = [q for q in fallback_pool if q.get("requires_image")]

    assert len(diagram_qs) >= 5, f"Expected at least 5 diagram questions (10%+), got {len(diagram_qs)}"
    for q in diagram_qs:
        assert q.get("image_description") is not None
        assert q.get("image_type") is not None
        assert q.get("image_required_reason") is not None


def test_base64_diagram_conversion():
    """Verify Base64 Data URL is intercepted, saved to disk, and converted to static path."""
    from app.utils.image_utils import process_and_save_diagram_url
    import os

    # Sample 1x1 PNG base64 string
    sample_base64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    clean_url = process_and_save_diagram_url(sample_base64)

    assert clean_url is not None
    assert clean_url.startswith("/uploads/diagrams/diagram_")
    assert clean_url.endswith(".png")

    # Verify physical file exists on disk
    rel_path = clean_url.lstrip("/")
    assert os.path.exists(rel_path), f"Expected file at {rel_path}"

    # Verify normal URL is returned unchanged
    normal_url = "/uploads/diagrams/existing_sample.png"
    assert process_and_save_diagram_url(normal_url) == normal_url

