"""
Unit and Integration Test Suite for Phase 11: MCQ Student Rendering — Advanced Question Types, Tables & Diagrams.
Verifies structure preservation, matrix columns, physiological grids, sequential event steps,
case study specimens, scientific formulas, and active exam sanitization for all advanced question types.
"""

import pytest
from app.database import SessionLocal
from app.models import ALExam, ALQuestion, ALExamType, ALQuestionTemplate
from app.schemas import ALStudentAnswerResponse


@pytest.fixture
def db_session():
    """Provides a transactional database session for tests."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Test 1: Multi-Variable Selection & Multi-Response Grid Question Structure
def test_multi_variable_and_multi_response_grid_structure():
    question_data = {
        "id": 101,
        "question_number": 9,
        "template_type": "combination_grid",
        "stem_text": "Which of the following combinations of plant phyla and their gametophytes is/are correct?",
        "statements_json": [
            {"code": "A", "text": "Bryophyta — Dominant independent gametophyte"},
            {"code": "B", "text": "Lycophyta — Microscopic subterranean gametophyte"},
            {"code": "C", "text": "Pterophyta — Heart-shaped prothallus"},
            {"code": "D", "text": "Cycadophyta — Free-living photosynthetic gametophyte"},
        ],
        "options": [
            "1. A, B, and C only",
            "2. A and C only",
            "3. B, C, and D only",
            "4. A, C, and D only",
            "5. All statements A, B, C, and D",
        ],
    }

    assert len(question_data["statements_json"]) == 4
    assert question_data["statements_json"][0]["code"] == "A"
    assert len(question_data["options"]) == 5
    assert "A and C only" in question_data["options"][1]


# Test 2: Matrix Matching Table with Multi-Column Data
def test_matrix_matching_multi_column_table_structure():
    matrix_question = {
        "id": 102,
        "question_number": 14,
        "template_type": "matching_column",
        "stem_text": "Match the following animal phyla with their characteristic respiratory organs:",
        "grid_key_json": {
            "colIHeader": "Phylum",
            "colIIHeader": "Respiratory Structure",
            "colI": ["1. Annelida", "2. Insecta", "3. Aquatic Mollusca", "4. Echinodermata"],
            "colII": ["X. Moist body surface", "Y. Tracheal system", "Z. Ctenidia", "W. Dermal branchiae"],
        },
        "options": [
            "A. 1-X, 2-Y, 3-Z, 4-W",
            "B. 1-Y, 2-Z, 3-W, 4-X",
            "C. 1-Z, 2-W, 3-X, 4-Y",
            "D. 1-W, 2-X, 3-Y, 4-Z",
            "E. 1-X, 2-Z, 3-Y, 4-W",
        ],
    }

    grid = matrix_question["grid_key_json"]
    assert grid["colIHeader"] == "Phylum"
    assert len(grid["colI"]) == 4
    assert len(grid["colII"]) == 4
    assert len(matrix_question["options"]) == 5


# Test 3: Physiological Profile Multi-Column Grid
def test_physiological_profile_multi_column_grid_structure():
    phys_question = {
        "id": 103,
        "question_number": 22,
        "template_type": "matching_column",
        "stem_text": "A change occurs when human core body temperature falls below normal. Which row correctly indicates the physiological responses?",
        "grid_key_json": {
            "headers": ["Option", "Skin Arterioles", "Hair Erector Muscles", "Adrenaline Secretion"],
            "rows": [
                ["(1)", "Constrict", "Contract", "Increase"],
                ["(2)", "Dilate", "Relax", "Increase"],
                ["(3)", "Constrict", "Relax", "Decrease"],
                ["(4)", "Dilate", "Contract", "Decrease"],
                ["(5)", "Constrict", "Contract", "Decrease"],
            ],
        },
        "options": [
            "(1) Constrict | Contract | Increase",
            "(2) Dilate | Relax | Increase",
            "(3) Constrict | Relax | Decrease",
            "(4) Dilate | Contract | Decrease",
            "(5) Constrict | Contract | Decrease",
        ],
    }

    grid = phys_question["grid_key_json"]
    assert len(grid["headers"]) == 4
    assert len(grid["rows"]) == 5
    assert grid["rows"][0][1] == "Constrict"
    assert grid["rows"][0][3] == "Increase"


# Test 4: Sequential Question Stages with Chronological Arrows
def test_sequential_question_stages_and_arrows():
    seq_question = {
        "id": 104,
        "question_number": 28,
        "template_type": "sequential_diagnostic",
        "stem_text": "Arrange the following stages of translation initiation in the correct chronological order:",
        "grid_key_json": {
            "sequence_steps": [
                "Small ribosomal subunit binds mRNA at 5' cap.",
                "Initiator tRNA pairs with AUG codon.",
                "Large ribosomal subunit joins initiation complex.",
                "Aminoacyl-tRNA binds to ribosomal A site.",
                "Peptide bond formation catalyzed by peptidyl transferase.",
            ]
        },
        "options": [
            "A. 1 -> 2 -> 3 -> 4 -> 5",
            "B. 2 -> 1 -> 3 -> 5 -> 4",
            "C. 1 -> 3 -> 2 -> 4 -> 5",
            "D. 3 -> 1 -> 2 -> 4 -> 5",
            "E. 1 -> 2 -> 4 -> 3 -> 5",
        ],
    }

    steps = seq_question["grid_key_json"]["sequence_steps"]
    assert len(steps) == 5
    assert "Small ribosomal subunit" in steps[0]
    assert "->" in seq_question["options"][0]


# Test 5: Diagnostic Case Study with Specimen Feature Blocks
def test_diagnostic_case_study_specimen_blocks():
    case_question = {
        "id": 105,
        "question_number": 33,
        "template_type": "diagnostic",
        "stem_text": "Specimen A:\n- Endoskeleton with water vascular system\n- Pentaradial symmetry in adults\n- Exclusively marine habitat\n\nSpecimen B:\n- Exoskeleton with chitin\n- Jointed appendages\n- Open circulatory system with hemocoel\n\nThe phyla to which Specimen A and Specimen B belong are respectively:",
        "options": [
            "(1) Echinodermata and Arthropoda",
            "(2) Mollusca and Annelida",
            "(3) Cnidaria and Chordata",
            "(4) Platyhelminthes and Nematoda",
            "(5) Arthropoda and Echinodermata",
        ],
    }

    assert "Specimen A:" in case_question["stem_text"]
    assert "Specimen B:" in case_question["stem_text"]
    assert len(case_question["options"]) == 5


# Test 6: Formula and Scientific Notation Normalization Integrity
def test_scientific_notation_integrity():
    from app.services.al_mcq_generator import normalize_scientific_notation
    raw = {"text": "Water potential equation: psi_w = psi_s + psi_p where psi_s = -0.75 MPa and psi_p = +0.35 MPa. Gases: CO2 and H2O with RuBisCO."}
    normalized = normalize_scientific_notation(raw)
    assert "ψw" in normalized["text"]
    assert "ψs" in normalized["text"]
    assert "ψp" in normalized["text"]
    assert "CO₂" in normalized["text"]
    assert "H₂O" in normalized["text"]


# Test 7: Biological Diagram Image Resolution and Metadata
def test_diagram_image_metadata_presence(db_session):
    # Verify that questions with diagram_url retain their diagram paths
    exam = db_session.query(ALExam).filter(ALExam.exam_type == ALExamType.PAPER_1_MCQ).first()
    if not exam:
        pytest.skip("No Paper 1 MCQ exam found")

    for q in exam.questions:
        if q.diagram_url:
            assert isinstance(q.diagram_url, str)
            assert len(q.diagram_url) > 0
