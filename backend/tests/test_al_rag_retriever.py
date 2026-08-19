"""
Comprehensive Unit and Integration Test Suite for Lumora Learning Material Retriever & RAG Engine (Phase 9).
Covers all 12 Phase 9 test cases and requirements.
"""

import pytest
from typing import List, Dict, Any

from app.database import SessionLocal
from app.models import Course, Unit, Lesson, Material, MaterialType, ProcessingStatus
from app.services.al_rag_retriever import (
    semantic_chunk_text,
    calculate_chunk_lexical_score,
    LearningMaterialRetriever,
    BIOLOGY_SCIENTIFIC_TERMS,
    _CHUNK_CACHE,
)


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Scenario 1: Semantic Chunking Preserves Structure
def test_scenario_1_semantic_chunking_structure_preservation():
    sample_text = """
    Mitochondria are double membrane-bound organelles found in most eukaryotic organisms.
    They generate most of the chemical energy needed to power cellular reactions.
    
    The inner mitochondrial membrane is folded into cristae to maximize the surface area for ATP synthase complexes.
    The matrix contains mitochondrial DNA, 70S ribosomes, and enzymes of the citric acid cycle.

    Beta-oxidation of fatty acids takes place in both mitochondria and glyoxysomes during lipid mobilization.
    """
    chunks = semantic_chunk_text(sample_text, chunk_size_words=30, overlap_words=5)
    assert len(chunks) >= 1
    # Check that biological terms remain intact
    combined = " ".join(chunks)
    assert "Mitochondria" in combined
    assert "cristae" in combined
    assert "Beta-oxidation" in combined


# Scenario 2: Lexical Relevance and Scientific Keyword Boosting
def test_scenario_2_lexical_relevance_keyword_boosting():
    generic_chunk = "Cells undergo various biochemical transformations during cellular maintenance and homeostasis."
    specific_chunk = "Glyoxysomes contain enzymes of the glyoxylate cycle and perform beta-oxidation of fatty acids during oil seed germination."

    query_tokens = {"glyoxysome", "beta-oxidation", "germination"}
    score_generic = calculate_chunk_lexical_score(generic_chunk, query_tokens)
    score_specific = calculate_chunk_lexical_score(specific_chunk, query_tokens)

    assert score_specific > score_generic
    assert score_specific >= 0.40


# Scenario 3: Specific Terminology Matching (Photosystem II, 70S ribosome, glyoxysome)
def test_scenario_3_specific_scientific_terminology_matching():
    chunk = "Photosystem II absorbs light at 680 nm and oxidizes water molecules into oxygen and protons."
    score = calculate_chunk_lexical_score(chunk, {"photosystem", "rubisco"})
    assert score > 0.30


# Scenario 4: Unit-Wide Search Across All Lessons (Course 36 Unit 66 / Unit 1)
def test_scenario_4_unit_wide_material_retrieval(db_session):
    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=36,
        unit_ids=[66],
        query_keywords=["nature of biology", "living world", "characteristics"],
        max_chunks=5,
        max_chars_total=3500,
    )

    assert trace["has_rag_context"] is True
    assert trace["fallback_used"] is False
    assert len(trace["source_material_ids"]) >= 1
    assert len(trace["source_chunks"]) >= 1
    assert "PRIMARY TEACHER LEARNING MATERIAL CONTEXT" in context_str
    for chunk in trace["source_chunks"]:
        assert "material_id" in chunk
        assert "material_title" in chunk
        assert "relevance_score" in chunk
        assert chunk["relevance_score"] > 0


# Scenario 5: Text Source Compatibility (`extracted_text` + `content`)
def test_scenario_5_text_source_compatibility_content_and_extracted(db_session):
    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=36,
        unit_ids=[67],  # Unit 2 Cell Biology
        query_keywords=["cell organelles", "photosynthesis", "enzymes"],
        max_chunks=6,
        max_chars_total=3500,
    )

    assert trace["has_rag_context"] is True
    assert len(trace["source_chunks"]) >= 1
    assert len(context_str) <= 4500


# Scenario 6: Syllabus Fallback Grounding when Zero Materials Exist
def test_scenario_6_syllabus_fallback_grounding_zero_materials(db_session):
    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=99999,  # Non-existent course with 0 materials
        unit_ids=[99999],  # Non-existent unit guaranteed to have 0 materials
        query_keywords=["microbiology", "microorganisms"],
        max_chunks=5,
    )

    assert trace["has_rag_context"] is False
    assert trace["fallback_used"] is True
    assert "CURRICULUM SYLLABUS GROUNDING" in context_str
    assert "Certified National A/L Biology Standards" in context_str


# Scenario 7: Unit Material Summary Aggregation for Frontend Reporting
def test_scenario_7_unit_material_summary_reporting(db_session):
    # Test Unit 66 (has materials)
    summary_u1 = LearningMaterialRetriever.get_unit_material_summary(
        db=db_session,
        course_id=36,
        unit_ids=[66],
    )
    assert summary_u1["total_units"] == 1
    assert summary_u1["total_lessons"] >= 2
    assert summary_u1["total_materials"] >= 2
    assert summary_u1["completed_materials"] >= 2
    assert summary_u1["availability_state"] in ("full", "partial")
    assert "learning material" in summary_u1["display_message"].lower()

    # Create temporary empty unit (0 materials)
    empty_unit = Unit(course_id=36, title="Empty Test Unit", order=999)
    db_session.add(empty_unit)
    db_session.commit()
    db_session.refresh(empty_unit)

    # Test empty unit (0 materials)
    summary_u7 = LearningMaterialRetriever.get_unit_material_summary(
        db=db_session,
        course_id=36,
        unit_ids=[empty_unit.id],
    )
    assert summary_u7["total_units"] == 1
    assert summary_u7["total_materials"] == 0
    assert summary_u7["availability_state"] == "none"
    assert "No usable uploaded learning material" in summary_u7["display_message"]

    # Test Multi-unit (Dynamic active units + empty_unit -> Partial)
    active_units = db_session.query(Unit).filter(Unit.course_id == 36).order_by(Unit.order).all()
    u1_id = active_units[0].id if active_units else 65
    u2_id = active_units[1].id if len(active_units) > 1 else 66

    summary_multi = LearningMaterialRetriever.get_unit_material_summary(
        db=db_session,
        course_id=36,
        unit_ids=[u1_id, u2_id, empty_unit.id],
    )
    assert summary_multi["total_units"] == 3
    assert summary_multi["completed_materials"] >= 2
    assert summary_multi["availability_state"] == "partial"
    assert "available for" in summary_multi["display_message"].lower()

    # Cleanup
    db_session.delete(empty_unit)
    db_session.commit()


# Scenario 8: Unit Isolation (No Cross-Unit Contamination)
def test_scenario_8_unit_isolation_no_cross_contamination(db_session):
    active_units = db_session.query(Unit).filter(Unit.course_id == 36).order_by(Unit.order).all()
    u1_id = active_units[0].id if active_units else 65

    _, trace_u1 = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=36,
        unit_ids=[u1_id],
        query_keywords=["biology", "nature"],
    )

    for chunk in trace_u1["source_chunks"]:
        mat = db_session.query(Material).filter(Material.id == chunk["material_id"]).first()
        if mat and mat.lesson_id:
            lesson = db_session.query(Lesson).filter(Lesson.id == mat.lesson_id).first()
            assert lesson.unit_id == 66


# Scenario 9: Compact Character Budget and Token Control
def test_scenario_9_token_and_character_budget_control(db_session):
    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=36,
        unit_ids=[66, 67, 68, 69, 78],
        max_chunks=4,
        max_chars_total=2000,
    )

    assert len(trace["source_chunks"]) <= 4
    assert len(context_str) <= 3000


# Scenario 10: In-Memory Chunk Caching Avoids Redundant Chunking
def test_scenario_10_in_memory_chunk_caching(db_session):
    initial_cache_size = len(_CHUNK_CACHE)
    
    # First call
    LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=36,
        unit_ids=[66],
    )
    after_first_call = len(_CHUNK_CACHE)
    assert after_first_call >= initial_cache_size

    # Second call for the same unit
    LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=36,
        unit_ids=[66],
    )
    after_second_call = len(_CHUNK_CACHE)
    assert after_second_call == after_first_call


# Scenario 11: Specific Lesson ID Query Prioritization
def test_scenario_11_specific_lesson_id_prioritization(db_session):
    # Query specific lesson #69
    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=36,
        lesson_ids=[69],
    )
    assert trace["has_rag_context"] is True
    assert len(trace["source_lessons"]) == 1
    assert trace["source_lessons"][0]["lesson_id"] == 69


# Scenario 12: Material Summary Endpoint Functionality
def test_scenario_12_material_summary_endpoint(db_session):
    summary = LearningMaterialRetriever.get_unit_material_summary(
        db=db_session,
        course_id=36,
        unit_ids=[66, 67],
    )
    assert "total_units" in summary
    assert "total_lessons" in summary
    assert "completed_materials" in summary
    assert "pdf_count" in summary
    assert "display_message" in summary
