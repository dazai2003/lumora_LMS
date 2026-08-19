import pytest
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.al_essay_generator import parse_and_validate_essay_candidates, build_essay_blueprint_json_skeleton


def test_single_complete_essay_generator_has_no_dummy_subparts():
    """
    Verify that single_complete essay candidates strictly generate:
    - subparts == [] (no dummy subparts or 13.3 pts facts)
    - answer_points with full itemized breakdown (e.g. 8 items @ 5.0 pts = 40.0 pts)
    - criteria mirroring answer_points
    - essay_checklist_json with empty subparts
    """
    blueprints = [
        {
            "id": "q_single_5",
            "question_number": 5,
            "structure_type": "SINGLE_COMPLETE",
            "structure_format": "single_complete",
            "marks": 40.0,
            "points": 40.0,
            "order": 1,
            "cognitive_level": "analyze",
            "difficulty": "medium"
        }
    ]

    mock_gemini_response = {
        "questions": [
            {
                "question_number": 5,
                "structure_type": "SINGLE_COMPLETE",
                "stem_text": "Discuss the nature, scope, and specialized branches of biology, and elaborate on the vast diversity of living organisms along with their fundamental characteristics.",
                "marks": 40.0,
                "answer_points": [
                    {"item_number": 1, "description": "Definition and etymology of biology derived from Greek Bios and Logos", "marks": 5.0, "accepted_alternatives": "Greek bios and logos"},
                    {"item_number": 2, "description": "Classification of primary branches: Zoology, Botany, Microbiology", "marks": 5.0, "accepted_alternatives": "Three main branches"},
                    {"item_number": 3, "description": "Specialized areas of study: Cell Biology, Histology, Anatomy, Physiology, Biochemistry", "marks": 5.0, "accepted_alternatives": "Specialized fields"},
                    {"item_number": 4, "description": "Diversity of living organisms based on size, shape, form, and habitat", "marks": 5.0, "accepted_alternatives": "Variation in size and habitat"},
                    {"item_number": 5, "description": "Fundamental characteristics distinguishing living entities from non-living matter", "marks": 5.0, "accepted_alternatives": "Key life characteristics"},
                    {"item_number": 6, "description": "Importance of plant biology and physiology in supporting animal life and food security", "marks": 5.0, "accepted_alternatives": "Primary producers role"},
                    {"item_number": 7, "description": "Evaluation of major health challenges: communicable and non-communicable diseases including CKDu", "marks": 5.0, "accepted_alternatives": "CKDu in Sri Lanka"},
                    {"item_number": 8, "description": "Solving legal and ethical issues using DNA fingerprinting in forensics and parentage testing", "marks": 5.0, "accepted_alternatives": "DNA profiling applications"}
                ],
                "marking_scheme": "Award 5.0 marks systematically across each of the 8 key thematic answer points.",
                "examiner_notes": "Ensure precise biological terminology is used."
            }
        ]
    }

    candidates = parse_and_validate_essay_candidates(mock_gemini_response, blueprints)

    assert len(candidates) == 1
    cand = candidates[0]

    # Crucial assertion: single_complete MUST NOT have dummy subparts
    assert cand["subparts"] == []
    assert cand["children"] == []
    assert cand["essay_checklist_json"]["subparts"] == []

    # Crucial assertion: 8 itemized answer points totaling exactly 40.0
    assert len(cand["answer_points"]) == 8
    assert len(cand["criteria"]) == 8
    total_pts = sum(p["marks"] for p in cand["answer_points"])
    assert abs(total_pts - 40.0) < 0.001

    assert cand["answer_points"][0]["accepted_alternatives"] == "Greek bios and logos"
    assert cand["answer_points"][7]["accepted_alternatives"] == "DNA profiling applications"


def test_multi_part_essay_generator_preserves_subparts():
    """
    Verify that multi_part essay candidates correctly process subparts.
    """
    blueprints = [
        {
            "id": "q_multi_6",
            "question_number": 6,
            "structure_type": "MULTI_PART",
            "structure_format": "multi_part",
            "marks": 40.0,
            "points": 40.0,
            "order": 2,
            "children": [
                {"id": "sub_6_1", "label": "(i)", "marks": 15.0},
                {"id": "sub_6_2", "label": "(ii)", "marks": 25.0}
            ]
        }
    ]

    mock_gemini_response = {
        "questions": [
            {
                "question_number": 6,
                "structure_type": "MULTI_PART",
                "stem_text": "Photosynthetic light reactions.",
                "marks": 40.0,
                "subparts": [
                    {
                        "label": "(i)",
                        "prompt": "Describe the absorption of light by photosynthetic pigments.",
                        "marks": 15.0,
                        "answer_points": [
                            {"item_number": 1, "description": "Chlorophyll a absorption spectra", "marks": 7.5},
                            {"item_number": 2, "description": "Accessory pigments role", "marks": 7.5}
                        ]
                    },
                    {
                        "label": "(ii)",
                        "prompt": "Explain non-cyclic photophosphorylation pathway.",
                        "marks": 25.0,
                        "answer_points": [
                            {"item_number": 1, "description": "PSII excitation and water photolysis", "marks": 12.5},
                            {"item_number": 2, "description": "Electron transport to PSI and NADPH generation", "marks": 12.5}
                        ]
                    }
                ]
            }
        ]
    }

    candidates = parse_and_validate_essay_candidates(mock_gemini_response, blueprints)

    assert len(candidates) == 1
    cand = candidates[0]

    assert len(cand["subparts"]) == 2
    assert cand["subparts"][0]["label"] == "(i)"
    assert cand["subparts"][1]["label"] == "(ii)"
    assert sum(s["marks"] for s in cand["subparts"]) == 40.0
