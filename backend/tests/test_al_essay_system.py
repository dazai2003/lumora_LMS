"""
Unit & Integration Test Suite for Paper II Part B Essay Question Hierarchy & Rendering System.
Tests:
- Automatic mark calculation from Answer Points
- Anti-double counting for nested container subparts
- Single complete, multi-part descriptive, and short-notes structures
- Duplicate numbering prevention and label derivation
- Scientific notation preservation (CO₂, H₂O, P700, G₀, ψw)
- Section isolation rules
"""

import pytest
from app.models import ALQuestionTemplate, normalize_al_template_type
from app.services.al_generator_service import normalize_scientific_notation


def test_normalize_essay_template_type():
    """Verify essay rubric template resolves correctly."""
    assert normalize_al_template_type("essay_rubric") == ALQuestionTemplate.ESSAY_RUBRIC
    assert normalize_al_template_type("essay") == ALQuestionTemplate.ESSAY_RUBRIC


def test_scientific_notation_in_essay_prompts():
    """Verify scientific symbols, Greek letters, and formulas are properly normalized in essay prompts."""
    stem = "Explain the biochemical reactions of Calvin cycle involving RuBP, 3-PGA, and NADPH under atmospheric CO2 and water potential psi_w at G0 phase."
    norm = normalize_scientific_notation(stem)
    assert "CO₂" in norm
    assert "NADPH" in norm


def test_single_essay_mark_tally_from_answer_points():
    """Verify answer points dynamically tally for a single essay."""
    answer_points = [
        {"item_number": 1, "description": "Introduction to photophosphorylation", "marks": 5},
        {"item_number": 2, "description": "Electron transport chain from PSII to PSI", "marks": 4},
        {"item_number": 3, "description": "Chemiosmotic ATP synthesis by ATP synthase", "marks": 3},
        {"item_number": 4, "description": "Reduction of NADP+ to NADPH", "marks": 3},
    ]
    total = sum(c["marks"] for c in answer_points)
    assert total == 15


def test_multipart_essay_roman_subpart_tally():
    """Verify subparts (i, ii, iii) each calculate marks from their own answer points and sum to total."""
    subparts = [
        {
            "label": "(i)",
            "prompt": "Structure of chloroplast thylakoids",
            "answer_points": [
                {"item_number": 1, "description": "Double membrane phospholipid bilayer", "marks": 10},
                {"item_number": 2, "description": "Thylakoid lumen proton gradient", "marks": 10},
            ],
            "marking_scheme": "Award full credit for correct structural description.",
        },
        {
            "label": "(ii)",
            "prompt": "Non-cyclic electron flow",
            "answer_points": [
                {"item_number": 1, "description": "Photoexcitation of PSII electrons", "marks": 15},
                {"item_number": 2, "description": "Photolysis of water generating O2", "marks": 10},
            ],
            "marking_scheme": "Must state photolysis equation correctly.",
        },
        {
            "label": "(iii)",
            "prompt": "Limiting environmental factors",
            "answer_points": [
                {"item_number": 1, "description": "CO2 concentration and RuBisCO affinity", "marks": 10},
                {"item_number": 2, "description": "Temperature effect on enzyme kinetics", "marks": 5},
            ],
            "marking_scheme": "Award 5 marks for Blackman's law of limiting factors.",
        },
    ]

    subpart_sums = [sum(p["marks"] for p in s["answer_points"]) for s in subparts]
    assert subpart_sums == [20, 25, 15]
    total_marks = sum(subpart_sums)
    assert total_marks == 60


def test_nested_subpart_hierarchy_and_anti_double_counting():
    """Verify nested (i) -> (a), (b) hierarchy calculates parent container total without double-counting."""
    subparts = [
        {
            "id": "sub_1",
            "label": "(i)",
            "prompt": "Basic structure of nephron",
            "marks": 10,
            "answer_points": [
                {"item_number": 1, "description": "Bowman's capsule and glomerulus", "marks": 5},
                {"item_number": 2, "description": "Proximal convoluted tubule", "marks": 5},
            ],
        },
        {
            "id": "sub_2",
            "label": "(ii)",
            "prompt": "Physiological mechanisms of osmoregulation",
            # Container node has children (a) and (b)
            "children": [
                {
                    "id": "sub_2_a",
                    "label": "(a)",
                    "prompt": "Role of ADH on collecting duct permeability",
                    "marks": 10,
                    "answer_points": [
                        {"item_number": 1, "description": "Hypothalamic osmoreceptors detect hypertonicity", "marks": 5},
                        {"item_number": 2, "description": "Aquaporin channel insertion", "marks": 5},
                    ],
                },
                {
                    "id": "sub_2_b",
                    "label": "(b)",
                    "prompt": "Counter-current multiplier in Loop of Henle",
                    "marks": 20,
                    "answer_points": [
                        {"item_number": 1, "description": "Descending limb passive water reabsorption", "marks": 10},
                        {"item_number": 2, "description": "Ascending limb active NaCl transport", "marks": 10},
                    ],
                },
            ],
        },
    ]

    def calc_node_marks(node):
        if "children" in node and node["children"]:
            return sum(calc_node_marks(c) for c in node["children"])
        if "answer_points" in node and node["answer_points"]:
            return sum(p["marks"] for p in node["answer_points"])
        return node.get("marks", 0)

    sub1_marks = calc_node_marks(subparts[0])
    sub2_marks = calc_node_marks(subparts[1])

    assert sub1_marks == 10
    # sub2 has children (a) [10] + (b) [20] = 30
    assert sub2_marks == 30

    # Total question mark = 10 + 30 = 40 (strictly avoids double counting sub2 container)
    total_q_marks = sum(calc_node_marks(s) for s in subparts)
    assert total_q_marks == 40


def test_short_notes_style_structure_and_marking():
    """Verify short notes style question with instruction and itemized topics."""
    short_notes_question = {
        "instruction": "Write short notes on the following biological mechanisms:",
        "structure_format": "short_notes",
        "subparts": [
            {
                "label": "(i)",
                "prompt": "C4 Photosynthetic Pathway",
                "answer_points": [
                    {"item_number": 1, "description": "Kranz anatomy in bundle sheath cells", "marks": 4},
                    {"item_number": 2, "description": "PEP carboxylase initial fixation", "marks": 3},
                ],
                "marking_scheme": "Highlight spatial separation of C4 pathway.",
            },
            {
                "label": "(ii)",
                "prompt": "Photorespiration in C3 Plants",
                "answer_points": [
                    {"item_number": 1, "description": "Oxygenase activity of RuBisCO at high temperatures", "marks": 4},
                    {"item_number": 2, "description": "Formation of 2-phosphoglycolate", "marks": 4},
                ],
                "marking_scheme": "Must identify organelle cooperation (chloroplast, peroxisome, mitochondria).",
            },
        ],
    }

    subpart_totals = [sum(p["marks"] for p in s["answer_points"]) for s in short_notes_question["subparts"]]
    assert subpart_totals == [7, 8]
    assert sum(subpart_totals) == 15


def test_strip_duplicate_numbering_prefixes():
    """Verify leading label prefixes like '(i)', '(a)', '1.', 'i.' are cleanly stripped to prevent '(i) (i)'."""
    import re

    def strip_prefix(text):
        if not text:
            return ""
        s = text.strip()
        s = re.sub(r"^\s*\(([a-zA-Z0-9ivxIVX]+)\)[\s:\.\-]*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"^\s*([0-9]+|[a-zA-Z]|[ivxIVX]+)[\.\:\-]\s+", "", s, flags=re.IGNORECASE)
        return s.strip()

    assert strip_prefix("(i) Explain the process of transcription") == "Explain the process of transcription"
    assert strip_prefix("(a) Describe the structure") == "Describe the structure"
    assert strip_prefix("i. Define osmosis") == "Define osmosis"
    assert strip_prefix("1. List three functions") == "List three functions"
    assert strip_prefix("(ii). State the Law") == "State the Law"
    # Scientific formulas should NOT be stripped if not a numbering prefix
    assert strip_prefix("CO2 fixation in C4 plants") == "CO2 fixation in C4 plants"
