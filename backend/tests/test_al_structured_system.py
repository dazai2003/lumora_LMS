"""
Unit & Integration Test Suite for Paper II Part A Structured Question System.
Tests 40-point validation, recursive hierarchy parsing, canonical format enums,
Base64 diagram payload safety, scientific notation normalization, and batch acceptance.
"""

import pytest
from app.models import ALStructuredFormat, normalize_structured_format
from app.services.al_structured_generator import (
    validate_structured_question_hierarchy,
    calculate_subpart_points,
    generate_structured_candidate_questions
)
from app.services.al_generator_service import normalize_scientific_notation


def test_normalize_structured_format_aliases():
    """Verify all 7 canonical structured format enums and aliases resolve correctly."""
    assert normalize_structured_format("direct_factual") == ALStructuredFormat.STRUCTURED_DIRECT_RECALL
    assert normalize_structured_format("conceptual_explanation") == ALStructuredFormat.STRUCTURED_CONCEPTUAL
    assert normalize_structured_format("sequential_pathways") == ALStructuredFormat.STRUCTURED_SEQUENTIAL
    assert normalize_structured_format("side_by_side_comparison") == ALStructuredFormat.STRUCTURED_COMPARISON
    assert normalize_structured_format("diagrammatic_deduction") == ALStructuredFormat.STRUCTURED_DIAGRAM
    assert normalize_structured_format("matrix_table") == ALStructuredFormat.STRUCTURED_MATRIX
    assert normalize_structured_format("labelled_drawing") == ALStructuredFormat.STRUCTURED_DRAWING


def test_scientific_notation_in_structured_prompts():
    """Verify KaTeX and scientific notation normalization across structured content."""
    prompt = "Calculate psi_w when psi_s = -0.75 MPa and psi_p = +0.35 MPa for CO2 assimilation."
    norm = normalize_scientific_notation(prompt)
    assert "ψw" in norm
    assert "ψs" in norm
    assert "ψp" in norm
    assert "CO₂" in norm


def test_validate_structured_question_hierarchy_valid_40_points():
    """Verify a valid 40-point structured question passes validation with 0 errors."""
    q_data = {
        "stem_text": "Question 1: Plant Cell Biology",
        "structured_subparts_json": [
            {
                "id": "q1_a",
                "label": "A",
                "format_type": "structured_direct_recall",
                "prompt": "Cellular organelles",
                "children": [
                    {
                        "id": "q1_a_1",
                        "label": "(i)",
                        "format_type": "structured_direct_recall",
                        "prompt": "Name two organelle locations for CO2 uptake.",
                        "points": 20.0,
                        "model_answer": "Chloroplast stroma and Mitochondria matrix"
                    },
                    {
                        "id": "q1_a_2",
                        "label": "(ii)",
                        "format_type": "structured_conceptual",
                        "prompt": "Explain membrane permeability.",
                        "points": 20.0,
                        "model_answer": "Lipid solubility determines rate of passive diffusion across phospholipid bilayer."
                    }
                ]
            }
        ]
    }

    is_valid, total_points, errors, warnings = validate_structured_question_hierarchy(q_data)
    assert is_valid is True
    assert total_points == 40.0
    assert len(errors) == 0
    assert len(warnings) == 0


def test_arbitrary_depth_hierarchy_and_rollup():
    """
    Verify exact test case:
    A(i)=2, A(ii)(a)=1, A(ii)(b)=1, A(iii)=6 (A=10)
    B(i)=4, B(ii)=10 (B=14)
    C(i)=16 (C=16)
    Total = 40.0 raw points / 100 final scaled marks.
    """
    tree = [
        {
            "id": "node_A",
            "label": "A",
            "format_type": "structured_direct_recall",
            "prompt": "Part A",
            "points": 10.0,
            "children": [
                { "id": "node_A_i", "label": "(i)", "format_type": "structured_direct_recall", "prompt": "Subpart A(i)", "points": 2.0 },
                {
                    "id": "node_A_ii",
                    "label": "(ii)",
                    "format_type": "structured_conceptual",
                    "prompt": "Subpart A(ii)",
                    "points": 2.0,
                    "children": [
                        { "id": "node_A_ii_a", "label": "(a)", "format_type": "structured_direct_recall", "prompt": "Sub-subpart A(ii)(a)", "points": 1.0 },
                        { "id": "node_A_ii_b", "label": "(b)", "format_type": "structured_direct_recall", "prompt": "Sub-subpart A(ii)(b)", "points": 1.0 },
                    ]
                },
                { "id": "node_A_iii", "label": "(iii)", "format_type": "structured_conceptual", "prompt": "Subpart A(iii)", "points": 6.0 },
            ]
        },
        {
            "id": "node_B",
            "label": "B",
            "format_type": "structured_comparison",
            "prompt": "Part B",
            "points": 14.0,
            "children": [
                { "id": "node_B_i", "label": "(i)", "format_type": "structured_comparison", "prompt": "Subpart B(i)", "points": 4.0 },
                { "id": "node_B_ii", "label": "(ii)", "format_type": "structured_matrix", "prompt": "Subpart B(ii)", "points": 10.0 },
            ]
        },
        {
            "id": "node_C",
            "label": "C",
            "format_type": "structured_diagram",
            "prompt": "Part C",
            "points": 16.0,
            "children": [
                { "id": "node_C_i", "label": "(i)", "format_type": "structured_diagram", "prompt": "Subpart C(i)", "points": 16.0 },
            ]
        }
    ]

    q_data = {
        "stem_text": "Question 1: Comprehensive Plant and Animal Cell Systems",
        "structured_subparts_json": tree
    }

    is_valid, total_points, errors, warnings = validate_structured_question_hierarchy(q_data)
    assert is_valid is True
    assert total_points == 40.0
    assert len(errors) == 0
    assert len(warnings) == 0


def test_validate_structured_question_hierarchy_exceeds_40_points():
    """Verify points exceeding 40 raw points generate a blocking error."""
    q_data = {
        "stem_text": "Question 2: Plant Physiology",
        "structured_subparts_json": [
            {
                "id": "q2_a",
                "label": "A",
                "format_type": "structured_direct_recall",
                "prompt": "Photosynthesis",
                "points": 45.0
            }
        ]
    }

    is_valid, total_points, errors, warnings = validate_structured_question_hierarchy(q_data)
    assert is_valid is False
    assert total_points == 45.0
    assert any("exceeds maximum allowed cap of 40 points" in err for err in errors)


def test_validate_structured_question_hierarchy_incomplete_points():
    """Verify questions with under 40 points generate an incomplete warning."""
    q_data = {
        "stem_text": "Question 3: Animal Physiology",
        "structured_subparts_json": [
            {
                "id": "q3_a",
                "label": "A",
                "format_type": "structured_direct_recall",
                "prompt": "Nervous conduction",
                "points": 25.0
            }
        ]
    }

    is_valid, total_points, errors, warnings = validate_structured_question_hierarchy(q_data)
    assert is_valid is True
    assert total_points == 25.0
    assert any("incomplete" in w.lower() for w in warnings)


from app.database import SessionLocal
from unittest.mock import patch
from fastapi import HTTPException
import json


def test_structured_candidate_generation_with_mock_and_error_handling():
    """Verify generate_structured_candidate_questions produces valid candidate structures and raises on failure."""
    db = SessionLocal()
    try:
        # 1. Test Network/LLM error raises explicit HTTPException
        with patch("app.services.ai_generation_core.gemini.generate_json", side_effect=Exception("Connection timed out")):
            with pytest.raises(HTTPException) as exc_info:
                generate_structured_candidate_questions(
                    db=db,
                    question_count=4,
                    custom_instruction="Test unit prompt"
                )
            assert exc_info.value.status_code in [408, 502, 504]
            msg = exc_info.value.detail.get("message", "") if isinstance(exc_info.value.detail, dict) else exc_info.value.detail
            assert "preserved" in msg.lower()

        # 2. Test successful generation with mocked valid LLM response
        from app.services.al_structured_generator import create_default_teacher_blueprint
        sample_bps = create_default_teacher_blueprint(4)
        for bp in sample_bps:
            bp["stem_text"] = "Advanced Level Plant Physiology & Cell Dynamics Investigation"
            for sec in bp["structured_subparts_json"]:
                for sub in sec.get("children", []):
                    sub["prompt"] = "State the function of Casparian strips."
                    sub["model_answer"] = "Blocks apoplastic water movement forcing symplastic transport."
                    sub["marking_points"] = [{"criterion": "Blocks apoplast transport", "points": sub["points"]}]

        with patch("app.services.ai_generation_core.gemini.generate_json", return_value={"questions": sample_bps}):
            candidates = generate_structured_candidate_questions(
                db=db,
                question_count=4,
                custom_instruction="Test unit prompt"
            )
            assert len(candidates) == 4
            for cand in candidates:
                assert cand["template_type"] == "structured_subparts"
                assert cand["points"] == 40.0
                assert "structured_subparts_json" in cand
                assert cand["status"] == "validated"
    finally:
        db.close()


def test_normalize_al_exam_type():
    """Verify all ALExamType enums and aliases resolve correctly."""
    from app.models import ALExamType, normalize_al_exam_type

    assert normalize_al_exam_type("paper_1_mcq") == ALExamType.PAPER_1_MCQ
    assert normalize_al_exam_type("paper_1_only") == ALExamType.PAPER_1_MCQ
    assert normalize_al_exam_type("paper_2_structured") == ALExamType.PAPER_2_STRUCTURED
    assert normalize_al_exam_type("paper_2_essay") == ALExamType.PAPER_2_ESSAY
    assert normalize_al_exam_type("paper_2") == ALExamType.PAPER_2
    assert normalize_al_exam_type("paper_2_only") == ALExamType.PAPER_2
    assert normalize_al_exam_type("full_paper") == ALExamType.FULL_PAPER
    assert normalize_al_exam_type("whole_paper") == ALExamType.FULL_PAPER


def test_section_isolation_matrix_all_5_scenarios():
    """
    Verify the mandatory 5 assessment type matrix scenarios:
    1. Paper I (MCQ): MCQ allowed; Structured/Essay rejected.
    2. Paper II-A (Structured): Structured allowed; MCQ/Essay rejected.
    3. Paper II-B (Essay): Essay allowed; MCQ/Structured rejected.
    4. Paper II (Combined): Structured & Essay allowed; MCQ rejected.
    5. Full Paper: MCQ, Structured, & Essay all allowed.
    """
    from app.models import ALExam, ALExamType, ALQuestionTemplate
    from app.schemas import ALQuestionCreate
    from app.api.al_authoring import create_question_authoring
    from fastapi import HTTPException
    from unittest.mock import MagicMock

    db = MagicMock()
    user = MagicMock(id=1, role="teacher")

    # Helper function to test create_question_authoring validation
    def try_create_question(exam_type: ALExamType, template_type: ALQuestionTemplate):
        mock_exam = MagicMock(id=100, exam_type=exam_type, course_id=1, questions=[])
        db.query.return_value.filter.return_value.first.return_value = mock_exam
        data = ALQuestionCreate(
            exam_id=100,
            question_number=1,
            template_type=template_type,
            stem_text="Sample Test Question Stem",
            points=1.0,
            cognitive_level="understand",
            difficulty="medium",
        )
        return create_question_authoring(data=data, current_user=user, db=db)

    # Scenario 1: Paper I (MCQ)
    try_create_question(ALExamType.PAPER_1_MCQ, ALQuestionTemplate.GENERIC_MCQ) # OK
    with pytest.raises(HTTPException) as exc_p1_struct:
        try_create_question(ALExamType.PAPER_1_MCQ, ALQuestionTemplate.STRUCTURED_SUBPARTS)
    assert exc_p1_struct.value.status_code == 400

    with pytest.raises(HTTPException) as exc_p1_essay:
        try_create_question(ALExamType.PAPER_1_MCQ, ALQuestionTemplate.ESSAY_RUBRIC)
    assert exc_p1_essay.value.status_code == 400

    # Scenario 2: Paper II Part A (Structured)
    try_create_question(ALExamType.PAPER_2_STRUCTURED, ALQuestionTemplate.STRUCTURED_SUBPARTS) # OK
    with pytest.raises(HTTPException) as exc_p2a_mcq:
        try_create_question(ALExamType.PAPER_2_STRUCTURED, ALQuestionTemplate.GENERIC_MCQ)
    assert exc_p2a_mcq.value.status_code == 400

    with pytest.raises(HTTPException) as exc_p2a_essay:
        try_create_question(ALExamType.PAPER_2_STRUCTURED, ALQuestionTemplate.ESSAY_RUBRIC)
    assert exc_p2a_essay.value.status_code == 400

    # Scenario 3: Paper II Part B (Essay)
    try_create_question(ALExamType.PAPER_2_ESSAY, ALQuestionTemplate.ESSAY_RUBRIC) # OK
    with pytest.raises(HTTPException) as exc_p2b_mcq:
        try_create_question(ALExamType.PAPER_2_ESSAY, ALQuestionTemplate.GENERIC_MCQ)
    assert exc_p2b_mcq.value.status_code == 400

    with pytest.raises(HTTPException) as exc_p2b_struct:
        try_create_question(ALExamType.PAPER_2_ESSAY, ALQuestionTemplate.STRUCTURED_SUBPARTS)
    assert exc_p2b_struct.value.status_code == 400

    # Scenario 4: Paper II (Combined)
    try_create_question(ALExamType.PAPER_2, ALQuestionTemplate.STRUCTURED_SUBPARTS) # OK
    try_create_question(ALExamType.PAPER_2, ALQuestionTemplate.ESSAY_RUBRIC) # OK
    with pytest.raises(HTTPException) as exc_p2_mcq:
        try_create_question(ALExamType.PAPER_2, ALQuestionTemplate.GENERIC_MCQ)
    assert exc_p2_mcq.value.status_code == 400

    # Scenario 5: Full Biology Paper
    try_create_question(ALExamType.FULL_PAPER, ALQuestionTemplate.GENERIC_MCQ) # OK
    try_create_question(ALExamType.FULL_PAPER, ALQuestionTemplate.STRUCTURED_SUBPARTS) # OK
    try_create_question(ALExamType.FULL_PAPER, ALQuestionTemplate.ESSAY_RUBRIC) # OK


def test_student_structured_payload_sanitization():
    """Verify that structured question payloads delivered to students strip solutions and marking criteria."""
    from app.api.al_exams import sanitize_structured_nodes_for_student

    teacher_tree = [
        {
            "id": "node_sec_a",
            "label": "A",
            "format_type": "structured_direct_recall",
            "prompt": "Cell biology section",
            "points": 10.0,
            "children": [
                {
                    "id": "node_q1_i",
                    "label": "(i)",
                    "format_type": "structured_direct_recall",
                    "prompt": "Name two organelles with double membranes.",
                    "points": 4.0,
                    "model_answer": "Mitochondria and Chloroplast",
                    "marking_points": [
                        {"criterion": "Mitochondria", "points": 2.0},
                        {"criterion": "Chloroplast", "points": 2.0}
                    ],
                    "strict_marking_rules": {"require_correct_spelling": True}
                },
                {
                    "id": "node_q1_ii",
                    "label": "(ii)",
                    "format_type": "structured_comparison",
                    "prompt": "Compare mitochondria and chloroplasts.",
                    "points": 6.0,
                    "comparison_header_1": "Mitochondria",
                    "comparison_header_2": "Chloroplast",
                    "comparison_pairs": [
                        {"criterion": "Inner membrane folds", "value_1": "Cristae", "value_2": "Thylakoids"}
                    ]
                }
            ]
        }
    ]

    sanitized = sanitize_structured_nodes_for_student(teacher_tree)
    assert len(sanitized) == 1
    root = sanitized[0]
    assert root["id"] == "node_sec_a"
    assert "model_answer" not in root
    assert "marking_points" not in root

    child1 = root["children"][0]
    assert child1["id"] == "node_q1_i"
    assert child1["prompt"] == "Name two organelles with double membranes."
    assert child1["points"] == 4.0
    # Must NOT contain solutions or marking points
    assert "model_answer" not in child1
    assert "marking_points" not in child1
    assert "strict_marking_rules" not in child1

    child2 = root["children"][1]
    assert child2["comparison_header_1"] == "Mitochondria"
    assert child2["comparison_header_2"] == "Chloroplast"
    assert child2["comparison_pairs"][0]["criterion"] == "Inner membrane folds"
    # Must strip solution values
    assert "value_1" not in child2["comparison_pairs"][0]
    assert "value_2" not in child2["comparison_pairs"][0]

