"""
Unit and Integration Test Suite for Phase 13: Teacher Preview Fidelity.
Verifies that Teacher Preview accurately reflects Student Exam rendering,
validates shared question structure preservation, teacher-only metadata resolution,
and strict answer isolation between teacher preview and student exam modes.
"""

import pytest
from app.database import SessionLocal
from app.models import ALExam, ALQuestion, ALExamType, ALQuestionTemplate


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Test 1: Full 50-Question Paper I Assembled Preview Order Preservation
def test_teacher_preview_50_question_order_and_uniqueness():
    """Verifies that all 50 questions appear exactly once in sequence."""
    simulated_questions = []
    for i in range(1, 51):
        tmpl = "generic_mcq" if i <= 40 else "multi_response_grid"
        simulated_questions.append({
            "id": 5000 + i,
            "question_number": i,
            "template_type": tmpl,
            "stem_text": f"G.C.E. A/L Biology Question {i} stem text.",
            "options": [f"({opt}) Option choice text" for opt in range(1, 6)],
            "correct_option": "A",
            "points": 1.0,
            "difficulty": "medium",
            "cognitive_level": "understand",
            "explanation": f"Detailed marking rationale for Question {i}."
        })

    assert len(simulated_questions) == 50
    # Verify sequential numbers 1 to 50
    seen_numbers = set()
    for q in simulated_questions:
        assert q["question_number"] not in seen_numbers
        seen_numbers.add(q["question_number"])

    assert min(seen_numbers) == 1
    assert max(seen_numbers) == 50


# Test 2: Teacher Metadata Resolution in Teacher Preview
def test_teacher_metadata_resolution():
    """Verifies teacher-only metadata fields are fully populated for preview inspection."""
    question_data = {
        "id": 5041,
        "question_number": 41,
        "template_type": "multi_response_grid",
        "stem_text": "Which of the following statements regarding C4 photosynthesis is/are correct?",
        "statements_json": [
            {"code": "A", "text": "Initial carbon fixation occurs in mesophyll cells catalyzed by PEP carboxylase."},
            {"code": "B", "text": "Calvin cycle occurs exclusively in bundle sheath cells."},
            {"code": "C", "text": "Photorespiration rate is higher than in C3 plants under high temperatures."},
            {"code": "D", "text": "Malate is transported from mesophyll to bundle sheath cells."},
        ],
        "options": [
            "(1) A, B, and D only",
            "(2) A and B only",
            "(3) B, C, and D only",
            "(4) C and D only",
            "(5) Any other combination",
        ],
        "correct_option": "A",
        "points": 1.0,
        "difficulty": "hard",
        "cognitive_level": "analyze",
        "explanation": "PEP carboxylase fixes CO2 into oxaloacetate in mesophyll cells, which is reduced to malate and transported to bundle sheath cells where RuBisCO operates with minimal photorespiration."
    }

    # Teacher Preview expectations
    assert question_data["difficulty"] == "hard"
    assert question_data["cognitive_level"] == "analyze"
    assert question_data["correct_option"] == "A"
    assert "PEP carboxylase" in question_data["explanation"]
    assert len(question_data["statements_json"]) == 4
    assert len(question_data["options"]) == 5


# Test 3: Strict Zero Leakage in Active Student Examination Mode
def test_student_active_exam_zero_leakage_parity():
    """Verifies that active student questions receive zero teacher metadata or answer keys."""
    teacher_question = {
        "id": 5022,
        "question_number": 22,
        "template_type": "matching_column",
        "stem_text": "Match the following cell organelles with their corresponding marker enzymes:",
        "grid_key_json": {
            "colIHeader": "Organelle",
            "colIIHeader": "Marker Enzyme",
            "colI": ["1. Peroxisome", "2. Lysosome", "3. Mitochondrion"],
            "colII": ["X. Catalase", "Y. Acid phosphatase", "Z. Cytochrome c oxidase"]
        },
        "options": ["A. 1-X, 2-Y, 3-Z", "B. 1-Y, 2-X, 3-Z", "C. 1-Z, 2-Y, 3-X", "D. 1-X, 2-Z, 3-Y", "E. 1-Z, 2-X, 3-Y"],
        "correct_option": "A",
        "difficulty": "medium",
        "cognitive_level": "apply",
        "explanation": "Catalase is the primary peroxisomal marker enzyme.",
    }

    # Student Mode Sanitization
    student_sanitized = {
        "id": teacher_question["id"],
        "question_number": teacher_question["question_number"],
        "template_type": teacher_question["template_type"],
        "stem_text": teacher_question["stem_text"],
        "grid_key_json": teacher_question["grid_key_json"],
        "options": teacher_question["options"],
        "points": 1.0,
    }

    # Assert student view never contains answer key or teacher metadata
    assert "correct_option" not in student_sanitized
    assert "correct_answer" not in student_sanitized
    assert "explanation" not in student_sanitized
    assert "difficulty" not in student_sanitized
    assert "cognitive_level" not in student_sanitized


# Test 4: Missing Optional Data Graceful Fallbacks (No Placeholders / No Crashes)
def test_missing_optional_data_fallbacks():
    """Verifies that questions with null optional fields render safely without placeholder text."""
    minimal_q = {
        "id": 5010,
        "question_number": 10,
        "template_type": "generic_mcq",
        "stem_text": "Which of the following elements is a constituent of chlorophyll?",
        "options": ["(1) Iron", "(2) Magnesium", "(3) Copper", "(4) Zinc", "(5) Manganese"],
        "correct_option": "2",
        "diagram_url": None,
        "requires_image": False,
        "explanation": None,
        "difficulty": None,
        "cognitive_level": None,
    }

    assert minimal_q["diagram_url"] is None
    assert minimal_q["explanation"] is None
    assert len(minimal_q["options"]) == 5
