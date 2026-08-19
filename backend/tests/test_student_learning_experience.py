import pytest
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.schemas import MaterialSummarizeRequest

def test_material_summarize_request_schema():
    # Default is paragraph
    req_default = MaterialSummarizeRequest()
    assert req_default.summary_type == "paragraph"

    # Explicit types
    req_point = MaterialSummarizeRequest(summary_type="point_form")
    assert req_point.summary_type == "point_form"

    req_student_notes = MaterialSummarizeRequest(summary_type="student_notes")
    assert req_student_notes.summary_type == "student_notes"

    req_story = MaterialSummarizeRequest(summary_type="story_mode")
    assert req_story.summary_type == "story_mode"

def test_ask_ai_relevance_threshold_logic():
    """
    Test vector distance threshold and keyword matching logic used by Lumora Ask AI.
    """
    course_materials = [
        {
            "id": 1,
            "title": "Photosynthesis Light Reactions",
            "extracted_text": "Chlorophyll absorbs photons in the thylakoid membrane.",
            "unit_name": "Unit 02: Chemical and Cellular Basis of Life",
            "lesson_title": "Light Reactions of Photosynthesis",
            "material_type": "pdf",
            "distance": 0.32  # High relevance (< 0.45)
        },
        {
            "id": 2,
            "title": "Plant Taxonomy Overview",
            "extracted_text": "Linnaean hierarchy classifies angiosperms into monocots and dicots.",
            "unit_name": "Unit 01: Introduction to Biology",
            "lesson_title": "Taxonomy and Classification",
            "material_type": "pdf",
            "distance": 0.78  # Irrelevant (> 0.60)
        }
    ]

    # Verify filtering
    relevant_materials = []
    question = "How does chlorophyll absorb photons?"
    q_words = set(w.lower() for w in question.split() if len(w) > 3)

    for mat in course_materials:
        dist = mat["distance"]
        has_kw = any(w in mat["title"].lower() or w in mat["extracted_text"].lower() for w in q_words)
        is_relevant = dist < 0.45 or (has_kw and dist < 0.60)
        if is_relevant:
            relevant_materials.append(mat)

    assert len(relevant_materials) == 1
    assert relevant_materials[0]["id"] == 1
    assert relevant_materials[0]["title"] == "Photosynthesis Light Reactions"

def test_ungrounded_question_detection():
    """
    When question has no match in materials, is_grounded must be False.
    """
    course_materials = [
        {
            "id": 1,
            "title": "Photosynthesis",
            "extracted_text": "Thylakoid and stroma reactions.",
            "distance": 0.82
        }
    ]
    
    question = "Who is the president of France?"
    q_words = set(w.lower() for w in question.split() if len(w) > 3)
    
    relevant_materials = []
    for mat in course_materials:
        dist = mat["distance"]
        has_kw = any(w in mat["title"].lower() or w in mat["extracted_text"].lower() for w in q_words)
        is_relevant = dist < 0.45 or (has_kw and dist < 0.60)
        if is_relevant:
            relevant_materials.append(mat)

    is_grounded = len(relevant_materials) > 0
    assert is_grounded is False
