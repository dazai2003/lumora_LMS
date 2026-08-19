import json
import pytest
from unittest.mock import MagicMock, patch

from app.services.al_essay_generator import (
    build_essay_blueprint_json_skeleton,
    parse_and_validate_essay_candidates,
    generate_essay_candidate_questions,
    regenerate_single_essay_candidate,
)


def test_build_essay_blueprint_skeleton_all_3_formats():
    """
    Verifies that the blueprint skeleton builder properly generates JSON schemas
    for single_complete, multi_part, and short_notes essay structures.
    """
    blueprints = [
        {"question_number": 5, "structure_format": "single_complete", "points": 150.0},
        {"question_number": 6, "structure_format": "multi_part", "points": 150.0},
        {"question_number": 7, "structure_format": "short_notes", "points": 150.0},
    ]

    skeleton_str = build_essay_blueprint_json_skeleton(blueprints)
    skeleton_data = json.loads(skeleton_str)

    assert "questions" in skeleton_data
    questions = skeleton_data["questions"]
    assert len(questions) == 3

    # Q5: Single Complete
    assert questions[0]["question_number"] == 5
    assert questions[0]["structure_format"] == "single_complete"
    assert questions[0]["points"] == 150.0
    assert len(questions[0]["answer_points"]) >= 6

    # Q6: Multi-Part
    assert questions[1]["question_number"] == 6
    assert questions[1]["structure_format"] == "multi_part"
    assert len(questions[1]["subparts"]) == 3
    assert questions[1]["subparts"][0]["label"] == "(i)"
    assert questions[1]["subparts"][1]["label"] == "(ii)"
    assert questions[1]["subparts"][2]["label"] == "(iii)"

    # Q7: Short Notes
    assert questions[2]["question_number"] == 7
    assert questions[2]["structure_format"] == "short_notes"
    assert questions[2]["instruction"] == "Write short notes on the following:"
    assert len(questions[2]["subparts"]) == 3
    assert questions[2]["subparts"][0]["label"] == "(a)"


def test_parse_and_validate_essay_candidates_valid():
    """
    Verifies parsing and schema validation of candidate essay questions from raw Gemini output.
    """
    mock_ai_json = json.dumps({
        "questions": [
            {
                "question_number": 5,
                "structure_format": "single_complete",
                "stem_text": "Describe the light reaction of photosynthesis and explain how proton gradient drives ATP synthesis across thylakoid membrane.",
                "points": 150.0,
                "answer_points": [
                    {"item_number": 1, "description": "Photons strike chlorophyll molecules in Photosystem II.", "marks": 15.0},
                    {"item_number": 2, "description": "Photolysis of water generates protons, electrons, and molecular oxygen.", "marks": 15.0},
                    {"item_number": 3, "description": "Electrons pass through plastoquinone and cytochrome b6f complex.", "marks": 15.0},
                ],
                "marking_scheme": "Award 15 marks per correctly stated biological step.",
                "examiner_notes": "Ensure mention of ATP synthase and proton motive force.",
                "diagram_info": {"requires_image": False, "image_description": ""}
            },
            {
                "question_number": 6,
                "structure_format": "multi_part",
                "stem_text": "The mammalian kidney is crucial for osmoregulation and excretion.",
                "points": 150.0,
                "subparts": [
                    {
                        "label": "(i)",
                        "prompt": "(i) Name the functional unit of the human kidney and state its main regions.",
                        "max_points": 50.0,
                        "marking_scheme": "Award marks for glomerulus, Bowman's capsule, PCT, loop of Henle, DCT.",
                        "answer_points": [
                            {"item_number": 1, "description": "Nephron is the structural and functional unit.", "marks": 25.0},
                            {"item_number": 2, "description": "Regions include Bowman capsule, PCT, loop of Henle, DCT, collecting duct.", "marks": 25.0}
                        ]
                    },
                    {
                        "label": "(ii)",
                        "prompt": "(ii) Explain the counter-current multiplier mechanism in the loop of Henle.",
                        "max_points": 100.0,
                        "marking_scheme": "Award marks for ascending vs descending limb permeability.",
                        "answer_points": [
                            {"item_number": 1, "description": "Descending limb is permeable to water and impermeable to NaCl.", "marks": 50.0},
                            {"item_number": 2, "description": "Thick ascending limb actively pumps Na+ and Cl- into medullary interstitium.", "marks": 50.0}
                        ]
                    }
                ],
                "marking_scheme": "Total 150 marks across subparts (i) and (ii).",
                "examiner_notes": "Pay attention to correct permeability characteristics of Henle loop limbs.",
                "diagram_info": {"requires_image": False, "image_description": ""}
            },
            {
                "question_number": 7,
                "structure_format": "short_notes",
                "instruction": "Write short notes on the following:",
                "stem_text": "Write short notes on the following:",
                "points": 150.0,
                "subparts": [
                    {
                        "label": "(a)",
                        "prompt": "(a) Casparian strip in plant roots",
                        "max_points": 75.0,
                        "marking_scheme": "Award marks for suberin deposit and symplastic diversion.",
                        "answer_points": [
                            {"item_number": 1, "description": "Impermeable band of suberin in radial and transverse walls of root endodermal cells.", "marks": 37.5},
                            {"item_number": 2, "description": "Forces water and solutes to cross the selectively permeable plasma membrane via symplast.", "marks": 37.5}
                        ]
                    },
                    {
                        "label": "(b)",
                        "prompt": "(b) Allopatric speciation",
                        "max_points": 75.0,
                        "marking_scheme": "Award marks for geographic isolation and reproductive divergence.",
                        "answer_points": [
                            {"item_number": 1, "description": "Speciation that occurs when biological populations become geographically isolated.", "marks": 37.5},
                            {"item_number": 2, "description": "Accumulation of genetic mutations leads to reproductive isolation over generations.", "marks": 37.5}
                        ]
                    }
                ],
                "marking_scheme": "75 marks per topic (a) and (b).",
                "examiner_notes": "Require precise definition and mechanism.",
                "diagram_info": {"requires_image": False, "image_description": ""}
            }
        ]
    })

    blueprints = [
        {"question_number": 5, "structure_format": "single_complete", "points": 150.0},
        {"question_number": 6, "structure_format": "multi_part", "points": 150.0},
        {"question_number": 7, "structure_format": "short_notes", "points": 150.0},
    ]

    candidates = parse_and_validate_essay_candidates(mock_ai_json, blueprints)

    assert len(candidates) == 3

    # Check Candidate 1 (single_complete)
    c1 = candidates[0]
    assert c1["question_number"] == 5
    assert c1["structure_format"] == "single_complete"
    assert c1["points"] == 150.0  # Blueprint authoritative marks
    assert len(c1["answer_points"]) == 3
    assert "photosynthesis" in c1["stem_text"].lower()

    # Check Candidate 2 (multi_part)
    c2 = candidates[1]
    assert c2["question_number"] == 6
    assert c2["structure_format"] == "multi_part"
    assert len(c2["subparts"]) == 2
    assert c2["subparts"][0]["label"] == "(i)"
    assert c2["subparts"][1]["label"] == "(ii)"
    assert c2["points"] == 150.0

    # Check Candidate 3 (short_notes)
    c3 = candidates[2]
    assert c3["question_number"] == 7
    assert c3["structure_format"] == "short_notes"
    assert len(c3["subparts"]) == 2
    assert c3["subparts"][0]["label"] == "(a)"
    assert c3["subparts"][1]["label"] == "(b)"
    assert c3["points"] == 150.0


@patch("app.services.ai_generation_core.gemini.generate_json")
def test_generate_essay_candidate_questions_mock(mock_gemini):
    """
    Tests end-to-end generate_essay_candidate_questions with mocked Gemini AI.
    """
    mock_gemini.return_value = {
        "questions": [
            {
                "question_number": 5,
                "structure_format": "single_complete",
                "stem_text": "Describe the human cardiac cycle and explain how the electrical conduction system regulates ventricular contraction.",
                "points": 150.0,
                "answer_points": [
                    {"item_number": 1, "description": "SA node initiates electrical impulse in right atrium.", "marks": 50.0},
                    {"item_number": 2, "description": "Impulse travels to AV node and through bundle of His.", "marks": 50.0},
                    {"item_number": 3, "description": "Purkinje fibers distribute impulse through ventricular myocardium causing systole.", "marks": 50.0}
                ],
                "marking_scheme": "Award 50 marks per conduction component.",
                "examiner_notes": "Note the physiological delay at the AV node.",
                "diagram_info": {"requires_image": False, "image_description": ""}
            }
        ]
    }

    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = []

    candidates = generate_essay_candidate_questions(
        db=db_mock,
        question_count=1,
        custom_blueprints=[{"question_number": 5, "structure_format": "single_complete", "points": 150.0}]
    )

    assert len(candidates) == 1
    assert candidates[0]["question_number"] == 5
    assert candidates[0]["structure_format"] == "single_complete"
    assert len(candidates[0]["answer_points"]) == 3
    assert candidates[0]["status"] == "ready"
    assert candidates[0]["is_valid"] is True


@patch("app.services.al_essay_generator.gemini.generate_json")
def test_regenerate_single_essay_candidate_mock(mock_gemini):
    """
    Tests regenerating a single essay question candidate with teacher feedback.
    """
    mock_gemini.return_value = {
        "questions": [
            {
                "question_number": 5,
                "structure_format": "single_complete",
                "stem_text": "Improved question stem on cardiac conduction with enhanced electrophysiological terminology.",
                "points": 150.0,
                "answer_points": [
                    {"item_number": 1, "description": "SA node spontaneously depolarizes acting as cardiac pacemaker.", "marks": 75.0},
                    {"item_number": 2, "description": "AV node delays impulse by 0.1s to allow complete atrial emptying.", "marks": 75.0}
                ],
                "marking_scheme": "75 marks per point.",
                "examiner_notes": "",
                "diagram_info": {"requires_image": False, "image_description": ""}
            }
        ]
    }

    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = []

    candidate_input = {
        "candidate_id": "cand_1234",
        "question_number": 5,
        "structure_format": "single_complete",
        "points": 150.0,
        "difficulty": "medium",
        "cognitive_level": "analyze"
    }

    updated = regenerate_single_essay_candidate(
        db=db_mock,
        candidate=candidate_input,
        custom_instruction="Add specific details about the AV nodal delay."
    )

    assert updated["candidate_id"] == "cand_1234"
    assert "improved question stem" in updated["stem_text"].lower()
    assert len(updated["answer_points"]) == 2
