"""
Unit & Integration Tests for Lumora LMS AI Structured Question Generator.
Validates 3-layer prompt architecture, placeholder leak detection, point roll-ups, and candidate regeneration.
"""

import pytest
from app.services.al_structured_generator import (
    build_layered_blueprint_json_skeleton,
    validate_structured_question_hierarchy,
    validate_and_normalize_part_node,
    create_default_teacher_blueprint,
    PLACEHOLDER_LEAK_REGEX,
)


def test_create_default_teacher_blueprint_question_counts():
    """Verify default blueprint generates exact question counts from 1 to 5."""
    for count in range(1, 6):
        bps = create_default_teacher_blueprint(count)
        assert len(bps) == count
        for q_idx, q in enumerate(bps):
            assert q["question_number"] == q_idx + 1
            assert q["points"] == 40.0
            assert len(q["structured_subparts_json"]) == 3  # A, B, C sections
            # Verify sum of section points
            sec_sum = sum(sec["points"] for sec in q["structured_subparts_json"])
            assert sec_sum == 40.0


def test_layered_blueprint_json_skeleton_format():
    """Verify blueprint JSON skeleton outputs valid JSON structure with exact question count."""
    import json
    bps = create_default_teacher_blueprint(2)
    skeleton_str = build_layered_blueprint_json_skeleton(bps)
    
    parsed = json.loads(skeleton_str)
    assert "questions" in parsed
    assert len(parsed["questions"]) == 2
    assert parsed["questions"][0]["question_number"] == 1
    assert parsed["questions"][1]["question_number"] == 2


def test_placeholder_leak_regex_catches_template_strings():
    """Verify regex detector flags all internal placeholder artifacts without false positives on legitimate biology terms."""
    bad_strings = [
        "Describe the biological mechanisms and significance of structured_direct_recall in relation to theme.",
        "<Generate concrete A/L Biology question prompt for Direct Factual Recall & Naming>",
        "<Specific biological fact / criteria>",
        "Section prompt",
        "Question 1 Biological Core Theme",
        "[Insert prompt here]",
        "Placeholder Question",
    ]
    for s in bad_strings:
        assert PLACEHOLDER_LEAK_REGEX.search(s) is not None, f"Failed to detect leak in: {s}"

    good_strings = [
        "Name two cell types in the human body that remain in the G₀ phase.",
        "Explain the mechanism of the counter-current multiplier in the loop of Henle.",
        "State two structural differences between xylem vessels and phloem sieve tube elements.",
        "Draw a labelled diagram of a transverse section of a dicotyledonous root.",
        "State the functional role of the proximal convoluted tubule in selective reabsorption.",
        "Explain the primary biological concept governing countercurrent multiplication.",
        "Clear explanation of physiological or structural mechanism involved in nerve impulse transmission.",
        "Accurate biological term or structure definition of the sinoatrial node.",
    ]
    for s in good_strings:
        assert PLACEHOLDER_LEAK_REGEX.search(s) is None, f"False positive leak in: {s}"


def test_validate_structured_question_hierarchy_with_real_biology():
    """Verify full question hierarchy validation with valid A/L Biology content."""
    valid_question = {
        "question_number": 1,
        "stem_text": "Plant water relations govern the movement of water and solutes through cellular pathways and xylem vessels in terrestrial plants.",
        "structured_subparts_json": [
            {
                "id": "q1_a",
                "label": "A",
                "format_type": "structured_direct_recall",
                "points": 10.0,
                "children": [
                    {
                        "id": "q1_a_1",
                        "label": "1",
                        "format_type": "structured_direct_recall",
                        "prompt": "State the water potential equation for an unplasmolyzed plant cell.",
                        "points": 2.0,
                        "model_answer": "ψw = ψs + ψp",
                        "marking_points": [
                            {"criterion": "Correct equation ψw = ψs + ψp stated", "points": 2.0}
                        ]
                    },
                    {
                        "id": "q1_a_2",
                        "label": "2",
                        "format_type": "structured_direct_recall",
                        "prompt": "Name two principal water transport pathways across the root cortex to the endodermis.",
                        "points": 2.0,
                        "model_answer": "1. Apoplast pathway\n2. Symplast pathway",
                        "marking_points": [
                            {"criterion": "Apoplast pathway", "points": 1.0},
                            {"criterion": "Symplast pathway", "points": 1.0}
                        ]
                    },
                    {
                        "id": "q1_a_3",
                        "label": "3",
                        "format_type": "structured_conceptual",
                        "prompt": "Explain the physiological function of the Casparian strip in the endodermal cells.",
                        "points": 6.0,
                        "model_answer": "The Casparian strip contains suberin deposition which blocks the apoplast pathway, forcing water and dissolved mineral ions through the selectively permeable plasma membrane into the symplast, enabling selective uptake and preventing backflow.",
                        "marking_points": [
                            {"criterion": "Suberin deposition blocks apoplast pathway", "points": 2.0},
                            {"criterion": "Forces water and ions through selectively permeable plasma membrane / symplast", "points": 2.0},
                            {"criterion": "Allows selective mineral regulation and prevents backflow from stele", "points": 2.0}
                        ]
                    }
                ]
            },
            {
                "id": "q1_b",
                "label": "B",
                "format_type": "structured_comparison",
                "points": 14.0,
                "children": [
                    {
                        "id": "q1_b_1",
                        "label": "1",
                        "format_type": "structured_comparison",
                        "prompt": "Compare tracheids and vessel elements in terms of perforation plates and lateral pits.",
                        "points": 6.0,
                        "model_answer": "Tracheids lack perforation plates and have tapered closed ends with bordered pits, whereas vessel elements possess open perforation plates at end walls and wide lumens.",
                        "marking_points": [
                            {"criterion": "Tracheids lack perforation plates vs Vessel elements possess open perforation plates", "points": 3.0},
                            {"criterion": "Tracheids have tapered closed ends vs Vessel elements have wide contiguous lumens", "points": 3.0}
                        ]
                    },
                    {
                        "id": "q1_b_2",
                        "label": "2",
                        "format_type": "structured_conceptual",
                        "prompt": "Explain how transpiration pull creates negative pressure in xylem sap according to the cohesion-tension theory.",
                        "points": 8.0,
                        "model_answer": "Evaporation of water from mesophyll cell walls generates surface tension and negative pressure (tension), which is transmitted down continuous water columns due to high cohesive forces between water molecules and adhesive forces to xylem walls.",
                        "marking_points": [
                            {"criterion": "Evaporation from mesophyll cell walls generates surface tension/negative pressure", "points": 3.0},
                            {"criterion": "Cohesion between water molecules maintains continuous unbroken columns", "points": 3.0},
                            {"criterion": "Adhesion to hydrophilic xylem walls prevents column collapse under tension", "points": 2.0}
                        ]
                    }
                ]
            },
            {
                "id": "q1_c",
                "label": "C",
                "format_type": "structured_conceptual",
                "points": 16.0,
                "children": [
                    {
                        "id": "q1_c_1",
                        "label": "1",
                        "format_type": "structured_sequential",
                        "prompt": "List in correct order the events of stomatal opening according to the potassium ion influx mechanism.",
                        "points": 8.0,
                        "model_answer": "1. Blue light activates proton pumps on guard cell membrane.\n2. H⁺ ions are actively pumped out of guard cells.\n3. Membrane hyperpolarization drives voltage-gated K⁺ influx.\n4. Cl⁻ and malate²⁻ accumulate, lowering guard cell water potential.\n5. Water enters guard cells by osmosis, increasing turgor and opening pore.",
                        "marking_points": [
                            {"criterion": "Proton pump activation and H+ efflux", "points": 2.0},
                            {"criterion": "Electrochemical gradient drives K+ influx", "points": 2.0},
                            {"criterion": "Accumulation of Cl- / malate lowers osmotic potential", "points": 2.0},
                            {"criterion": "Endosmosis increases turgor causing differential expansion of cellulose microfibrils", "points": 2.0}
                        ]
                    },
                    {
                        "id": "q1_c_2",
                        "label": "2",
                        "format_type": "structured_conceptual",
                        "prompt": "Describe how abscisic acid (ABA) triggers rapid stomatal closure under soil water deficit.",
                        "points": 8.0,
                        "model_answer": "ABA binds to guard cell receptors, opening Ca²⁺ channels. Cytosolic Ca²⁺ influx opens anion channels (Cl⁻/malate²⁻ efflux) and K⁺ efflux channels while inhibiting proton pumps. Solute loss causes water efflux by osmosis, reducing turgor pressure and closing the stoma.",
                        "marking_points": [
                            {"criterion": "ABA binding induces Ca2+ influx into guard cell cytosol", "points": 2.0},
                            {"criterion": "Ca2+ opens voltage-gated K+ and anion efflux channels", "points": 3.0},
                            {"criterion": "Loss of osmoprotectants causes exosmosis, loss of turgidity and pore closure", "points": 3.0}
                        ]
                    }
                ]
            }
        ]
    }

    is_valid, pts, errors, warnings = validate_structured_question_hierarchy(valid_question)
    assert is_valid is True, f"Validation failed with errors: {errors}"
    assert pts == 40.0
    assert len(errors) == 0


def test_validate_structured_question_catches_leak_and_overallocation():
    """Verify validation detects leaked placeholder text and over-allocation (>40 pts)."""
    leaked_question = {
        "question_number": 1,
        "stem_text": "Question 1 Biological Core Theme",
        "structured_subparts_json": [
            {
                "id": "q1_a",
                "label": "A",
                "format_type": "structured_direct_recall",
                "points": 45.0,
                "children": [
                    {
                        "id": "q1_a_1",
                        "label": "1",
                        "format_type": "structured_direct_recall",
                        "prompt": "Describe structured_direct_recall mechanisms.",
                        "points": 45.0,
                        "model_answer": "Accurate identification of primary biological concept",
                        "marking_points": [
                            {"criterion": "Accurate identification of primary biological concept", "points": 45.0}
                        ]
                    }
                ]
            }
        ]
    }

    is_valid, pts, errors, warnings = validate_structured_question_hierarchy(leaked_question)
    assert is_valid is False
    assert any("template placeholder" in e or "placeholder" in e for e in errors)
    assert any("exceeds maximum allowed cap of 40 points" in e for e in errors)


def test_validate_candidate_against_blueprint():
    """Verify strict blueprint conformance validation."""
    from app.services.al_structured_generator import validate_candidate_against_blueprint

    bp = {
        "question_number": 1,
        "structured_subparts_json": [
            {
                "id": "sec_a",
                "label": "A",
                "points": 4.0,
                "children": [
                    {"id": "a_1", "label": "1", "points": 2.0, "format_type": "structured_direct_recall"},
                    {"id": "a_2", "label": "2", "points": 2.0, "format_type": "structured_direct_recall"}
                ]
            }
        ]
    }

    # 1. Matching candidate
    valid_cand = {
        "question_number": 1,
        "structured_subparts_json": [
            {
                "id": "sec_a",
                "label": "A",
                "points": 4.0,
                "children": [
                    {"id": "a_1", "label": "1", "points": 2.0, "prompt": "Name the hormone secreted by beta cells.", "model_answer": "Insulin"},
                    {"id": "a_2", "label": "2", "points": 2.0, "prompt": "Name the hormone secreted by alpha cells.", "model_answer": "Glucagon"}
                ]
            }
        ]
    }
    matches, errs = validate_candidate_against_blueprint(bp, valid_cand)
    assert matches is True
    assert len(errs) == 0

    # 2. Missing child subpart
    incomplete_cand = {
        "question_number": 1,
        "structured_subparts_json": [
            {
                "id": "sec_a",
                "label": "A",
                "points": 2.0,
                "children": [
                    {"id": "a_1", "label": "1", "points": 2.0, "prompt": "Name the hormone secreted by beta cells.", "model_answer": "Insulin"}
                ]
            }
        ]
    }
    matches, errs = validate_candidate_against_blueprint(bp, incomplete_cand)
    assert matches is False
    assert any("Missing subpart" in e for e in errs)

    # 3. Empty prompt or model answer
    empty_prompt_cand = {
        "question_number": 1,
        "structured_subparts_json": [
            {
                "id": "sec_a",
                "label": "A",
                "points": 4.0,
                "children": [
                    {"id": "a_1", "label": "1", "points": 2.0, "prompt": "", "model_answer": "Insulin"},
                    {"id": "a_2", "label": "2", "points": 2.0, "prompt": "Name the hormone secreted by alpha cells.", "model_answer": ""}
                ]
            }
        ]
    }
    matches, errs = validate_candidate_against_blueprint(bp, empty_prompt_cand)
    assert matches is False
    assert any("Prompt text was not generated" in e for e in errs)
    assert any("Expected model answer was not generated" in e for e in errs)

