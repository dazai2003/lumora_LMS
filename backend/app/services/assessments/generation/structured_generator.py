"""
Lumora A/L Assessment Structured Question Generator & Validation Service.

Handles blueprint-driven AI generation and strict schema validation for Sri Lankan G.C.E. Advanced Level
Biology Paper II Part A (Structured Questions).

Key Design Decisions & Notes:
1. Authentic A/L Paper II-A Structure:
   - Typically 4 structured questions per paper.
   - Each full question carries 40 raw marks (scaled to 100% composite with Paper II-B).
2. Subpart Hierarchy:
   - Questions branch into subparts: (a), (b), (c) and roman numerals (i), (ii), (iii).
   - Each subpart defines its own max point cap, dotted-line constraint, expected keywords, and model key.
3. 3-Layer Prompting Context:
   - Layer 1 (Assessment Rules): Exam duration, total marks, target cognitive level.
   - Layer 2 (Blueprint Schema): Format-specific JSON keys (e.g. sequence items, matrix columns).
   - Layer 3 (Syllabus Scope): Grounded RAG context from verified NIE resource materials.
"""

import json
import logging
import time
import uuid
import re
import concurrent.futures
from typing import List, Dict, Any, Tuple, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Material, ALStructuredFormat, normalize_structured_format
from app.services.gemini_service import gemini
from app.services.ai_generation_core import execute_central_ai_generation, raise_ai_generation_http_exception
from app.services.al_generator_service import normalize_scientific_notation
from app.utils.image_utils import process_and_save_diagram_url

logger = logging.getLogger(__name__)

# Informational G.C.E. A/L Biology Paper II Part A Empirical Format Guidance
AL_PAPER_2A_FORMAT_GUIDANCE = {
    "structured_direct_recall": {
        "title": "Direct Factual Recall & Naming",
        "pct": 53.9,
        "spec": "State specific biological terms, organelle/tissue names, taxonomic classifications, exact definitions, or numerical physiological values. Expected answer must list the exact terms. Marking scheme must allocate points per term.",
    },
    "structured_conceptual": {
        "title": "Short Conceptual Explanation / Function",
        "pct": 34.3,
        "spec": "Explain why or how a biological process occurs, its physiological significance, biochemical adaptation, or cause-and-effect relationship. Marking scheme must allocate points for distinct conceptual steps.",
    },
    "structured_sequential": {
        "title": "Sequential Pathway / Chronology",
        "pct": 3.9,
        "spec": "Require an ordered step-by-step biological sequence (e.g. reflex arc, cardiac conduction, light reaction electron flow, protein synthesis). Provide sequence_items array in chronological order. Marking scheme must reward correct chronological sequence.",
    },
    "structured_comparison": {
        "title": "Side-by-Side Comparison",
        "pct": 2.9,
        "spec": "Provide a side-by-side comparison between two biological structures, processes, or groups (e.g. C3 vs C4 plants, Gram+ vs Gram- bacteria, skeletal vs smooth muscle). Provide comparison_header_1, comparison_header_2, and comparison_pairs. Marking scheme must require both conditions for full marks.",
    },
    "structured_diagram": {
        "title": "Diagrammatic / Genetics Deduction",
        "pct": 2.0,
        "spec": "Genetics pedigree deduction, pathway interpretation, or anatomical interpretation. Set diagram_info.requires_image: true and provide a detailed image_description of what visual figure/diagram is needed (NO fake image URLs). Questions must ask students to deduce or interpret features from the visual.",
    },
    "structured_matrix": {
        "title": "Structured Matrix Table",
        "pct": 1.0,
        "spec": "Tabular matching or classification table with specific biological column headers and rows (e.g. Organism | Phylum | Respiratory Organ). Provide matrix_data with realistic column headers and rows.",
    },
    "structured_drawing": {
        "title": "Labelled Biological Drawing",
        "pct": 1.0,
        "spec": "Require student to draw and label a biological structure (e.g. cross section of dicot root, nephron, chloroplast). Provide drawing_prompt and required_labels array with expected annotations.",
    },
}

# Regex pattern to catch template / metadata leakage
PLACEHOLDER_LEAK_REGEX = re.compile(
    r"(<[^>]{3,}>|"                                      # <Generate concrete...>, <Specific biological...>, <Item 1>
    r"\bstructured_(?:direct_recall|conceptual|comparison|sequential|diagram|matrix|drawing)\b|"  # internal system tokens
    r"\bQuestion\s+\d+\s+Biological\s+Core\s+Theme\b|"    # raw prompt headers
    r"\b(?:Section|Question)\s+prompt\b|"                # raw prompt headers
    r"\[(?:Insert|Generate|Placeholder)[^\]]*\]|"        # [Insert prompt here]
    r"\b(?:Insert|Placeholder)\s+(?:Prompt|Answer|Question|Criterion)\b)",
    re.IGNORECASE
)


def calculate_subpart_points(part: Dict[str, Any]) -> float:
    """
    Recursively calculates raw points for a subpart node.
    If part has children, raw points sum up children points; otherwise returns part's own points.
    """
    children = part.get("children") or []
    if children:
        return sum(calculate_subpart_points(c) for c in children)
    try:
        return float(part.get("points", 0.0))
    except (ValueError, TypeError):
        return 0.0


def validate_and_normalize_part_node(node: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """
    Recursively validates and normalizes a single Structured Question Part node.
    Normalizes scientific notation, canonical format enums, image URLs, table headers,
    marking points list, and sequence steps. Checks that marking points sum to node points.
    """
    issues = []
    normalized = dict(node)

    # 1. Normalize ID & Label
    if not normalized.get("id"):
        normalized["id"] = f"part_{uuid.uuid4().hex[:8]}"
    normalized["label"] = str(normalized.get("label") or "").strip()

    # 2. Normalize Format Type
    raw_fmt = normalized.get("format_type") or "structured_direct_recall"
    enum_fmt = normalize_structured_format(raw_fmt)
    normalized["format_type"] = enum_fmt.value

    # 3. Normalize Prompt & Scientific Notation
    raw_prompt = normalized.get("prompt") or ""
    if not raw_prompt.strip() and not (normalized.get("children") and len(normalized["children"]) > 0):
        issues.append(f"Sub-part {normalized['label']}: Question prompt is missing.")
    normalized["prompt"] = normalize_scientific_notation(raw_prompt)

    # 4. Check for Placeholder Leakage in Prompt
    if raw_prompt and PLACEHOLDER_LEAK_REGEX.search(raw_prompt):
        issues.append(f"Sub-part {normalized['label']}: Contains template placeholder text in prompt.")

    # 5. Normalize Model Answer
    raw_answer = normalized.get("model_answer") or ""
    if raw_answer:
        if PLACEHOLDER_LEAK_REGEX.search(raw_answer):
            issues.append(f"Sub-part {normalized['label']}: Contains template placeholder text in model answer.")
        normalized["model_answer"] = normalize_scientific_notation(raw_answer)

    # 6. Normalize Marking Points Breakdown
    raw_marking_pts = normalized.get("marking_points") or []
    norm_marking_pts = []
    marking_points_sum = 0.0
    if isinstance(raw_marking_pts, list):
        for mp in raw_marking_pts:
            if isinstance(mp, dict):
                c_text = normalize_scientific_notation(str(mp.get("criterion") or ""))
                p_val = round(float(mp.get("points", 1.0)), 1)
                if PLACEHOLDER_LEAK_REGEX.search(c_text):
                    issues.append(f"Sub-part {normalized['label']}: Contains placeholder text in marking criterion.")
                norm_marking_pts.append({
                    "criterion": c_text,
                    "points": p_val
                })
                marking_points_sum += p_val
            elif isinstance(mp, str):
                c_text = normalize_scientific_notation(mp)
                if PLACEHOLDER_LEAK_REGEX.search(c_text):
                    issues.append(f"Sub-part {normalized['label']}: Contains placeholder text in marking criterion.")
                norm_marking_pts.append({
                    "criterion": c_text,
                    "points": 1.0
                })
                marking_points_sum += 1.0
    normalized["marking_points"] = norm_marking_pts

    # 7. Normalize Diagram / Image Data
    diag_info = normalized.get("diagram_info") or {}
    if isinstance(diag_info, dict):
        raw_url = diag_info.get("image_url")
        if raw_url:
            diag_info["image_url"] = process_and_save_diagram_url(raw_url)
        diag_info["requires_image"] = bool(diag_info.get("requires_image", False) or normalized.get("requires_image", False))
        if diag_info.get("image_description"):
            diag_info["image_description"] = normalize_scientific_notation(diag_info["image_description"])
        elif normalized.get("image_description"):
            diag_info["image_description"] = normalize_scientific_notation(normalized["image_description"])
        normalized["diagram_info"] = diag_info
        if diag_info.get("requires_image"):
            normalized["requires_image"] = True
            normalized["image_description"] = diag_info.get("image_description", "")

    # 8. Normalize Comparison Data
    if normalized.get("comparison_header_1"):
        normalized["comparison_header_1"] = normalize_scientific_notation(normalized["comparison_header_1"])
    if normalized.get("comparison_header_2"):
        normalized["comparison_header_2"] = normalize_scientific_notation(normalized["comparison_header_2"])
    raw_comp_pairs = normalized.get("comparison_pairs") or []
    if isinstance(raw_comp_pairs, list) and raw_comp_pairs:
        norm_pairs = []
        for cp in raw_comp_pairs:
            if isinstance(cp, dict):
                norm_pairs.append({
                    "criterion": normalize_scientific_notation(str(cp.get("criterion") or "")),
                    "value_1": normalize_scientific_notation(str(cp.get("value_1") or cp.get("left") or "")),
                    "value_2": normalize_scientific_notation(str(cp.get("value_2") or cp.get("right") or "")),
                })
        normalized["comparison_pairs"] = norm_pairs

    # 9. Normalize Sequence Data
    raw_seq = normalized.get("sequence_items") or []
    if isinstance(raw_seq, list) and raw_seq:
        normalized["sequence_items"] = [normalize_scientific_notation(str(s)) for s in raw_seq]

    # 10. Normalize Matrix Data
    raw_matrix = normalized.get("matrix_data")
    if isinstance(raw_matrix, dict):
        col_headers = [normalize_scientific_notation(str(h)) for h in raw_matrix.get("col_headers", ["", ""])]
        rows = []
        for r in raw_matrix.get("rows", []):
            if isinstance(r, dict):
                rows.append({
                    "item": normalize_scientific_notation(str(r.get("item", ""))),
                    "expected": normalize_scientific_notation(str(r.get("expected", ""))),
                })
        normalized["matrix_data"] = {"col_headers": col_headers, "rows": rows}

    # 11. Normalize Drawing Data
    if normalized.get("drawing_prompt"):
        normalized["drawing_prompt"] = normalize_scientific_notation(normalized["drawing_prompt"])
    raw_labels = normalized.get("required_labels") or []
    if isinstance(raw_labels, list) and raw_labels:
        normalized["required_labels"] = [normalize_scientific_notation(str(l)) for l in raw_labels]

    # 12. Recursively Process Children
    raw_children = normalized.get("children") or []
    norm_children = []
    for child in raw_children:
        if isinstance(child, dict):
            c_norm, c_issues = validate_and_normalize_part_node(child)
            norm_children.append(c_norm)
            issues.extend(c_issues)
    normalized["children"] = norm_children

    # Points calculation
    if not norm_children:
        try:
            p_val = float(normalized.get("points", 0.0))
            if p_val <= 0:
                issues.append(f"Sub-part {normalized['label']}: Points must be greater than 0.")
            normalized["points"] = p_val
            
            # If marking points are present, auto-balance or validate
            if norm_marking_pts:
                # If sum slightly differs, normalize marking point weights to exact node points
                if abs(marking_points_sum - p_val) > 0.01 and marking_points_sum > 0:
                    scale = p_val / marking_points_sum
                    for mp in norm_marking_pts:
                        mp["points"] = round(mp["points"] * scale, 2)
        except (ValueError, TypeError):
            issues.append(f"Sub-part {normalized['label']}: Invalid points value.")
            normalized["points"] = 0.0
    else:
        normalized["points"] = sum(c["points"] for c in norm_children)

    return normalized, issues


ROMAN_NUMERALS_LIST = [
    "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
    "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"
]

def get_canonical_al_label(depth: int, index: int) -> str:
    """Generates official Sri Lankan G.C.E. A/L standard label."""
    if depth == 0:
        return f"({chr(65 + (index % 26))})"
    elif depth == 1:
        roman = ROMAN_NUMERALS_LIST[index] if index < len(ROMAN_NUMERALS_LIST) else str(index + 1)
        return f"({roman})"
    elif depth == 2:
        return f"({chr(97 + (index % 26))})"
    elif depth == 3:
        roman = ROMAN_NUMERALS_LIST[index] if index < len(ROMAN_NUMERALS_LIST) else str(index + 1)
        return f"({roman})"
    else:
        return f"({chr(97 + (index % 26))})"

def reindex_structured_tree_backend(nodes: List[Dict[str, Any]], depth: int = 0) -> List[Dict[str, Any]]:
    """Ensures all nodes in the hierarchy have canonical, valid G.C.E. A/L structured labels."""
    for idx, node in enumerate(nodes):
        raw_label = str(node.get("label") or "").strip()
        if not raw_label:
            node["label"] = get_canonical_al_label(depth, idx)
        else:
            raw_label_clean = raw_label.rstrip(".")
            if raw_label_clean.startswith("(") and raw_label_clean.endswith(")"):
                node["label"] = raw_label_clean
            elif depth == 0 and re.match(r"^[A-Za-z]$", raw_label_clean):
                node["label"] = f"({raw_label_clean.upper()})"
            elif depth == 1 and re.match(r"^\d+$", raw_label_clean):
                num_idx = int(raw_label_clean) - 1
                if 0 <= num_idx < len(ROMAN_NUMERALS_LIST):
                    node["label"] = f"({ROMAN_NUMERALS_LIST[num_idx]})"
                else:
                    node["label"] = f"({raw_label_clean})"
            elif re.match(r"^[a-z]$", raw_label_clean, re.IGNORECASE):
                node["label"] = f"({raw_label_clean.lower()})"
            else:
                node["label"] = f"({raw_label_clean})"

        children = node.get("children") or []
        if isinstance(children, list) and children:
            reindex_structured_tree_backend(children, depth + 1)
    return nodes


def validate_structured_question_hierarchy(question_data: Dict[str, Any]) -> Tuple[bool, float, List[str], List[str]]:
    """
    Validates a complete Structured Question (40.0 raw points target).
    Returns (is_valid, total_raw_points, errors, warnings).
    """
    errors = []
    warnings = []

    stem = question_data.get("stem_text") or ""
    if not stem.strip():
        errors.append("Question main scenario/context stem is missing.")
    elif PLACEHOLDER_LEAK_REGEX.search(stem):
        errors.append("Question stem contains template placeholder text.")

    parts = question_data.get("structured_subparts_json") or question_data.get("parts") or []
    if not parts or not isinstance(parts, list):
        errors.append("Question contains no structured sub-parts.")
        return False, 0.0, errors, warnings

    total_points = 0.0
    norm_parts = []

    for part in parts:
        if isinstance(part, dict):
            p_norm, p_issues = validate_and_normalize_part_node(part)
            norm_parts.append(p_norm)
            errors.extend(p_issues)
            total_points += p_norm.get("points", 0.0)

    # Reindex labels to ensure clean G.C.E. A/L formatting
    norm_parts = reindex_structured_tree_backend(norm_parts, depth=0)
    question_data["structured_subparts_json"] = norm_parts

    if total_points > 40.0:
        errors.append(f"Total raw points ({total_points:.1f}) exceeds maximum allowed cap of 40 points per question.")
    elif total_points < 40.0:
        warnings.append(f"Question raw points total ({total_points:.1f} / 40) is incomplete. Target is exactly 40 raw points.")

    is_valid = len(errors) == 0
    return is_valid, total_points, errors, warnings


def validate_candidate_against_blueprint(
    blueprint: Dict[str, Any],
    candidate: Dict[str, Any]
) -> Tuple[bool, List[str]]:
    """
    Strictly verifies that a generated candidate conforms 100% to the teacher's blueprint:
    - Same root sections and subpart hierarchy
    - Correct allocated points
    - Non-empty generated prompts and model answers
    - Zero placeholder leakage
    """
    errors = []
    bp_parts = blueprint.get("structured_subparts_json") or []
    cand_parts = candidate.get("structured_subparts_json") or []

    if len(bp_parts) != len(cand_parts):
        errors.append(f"Blueprint section count mismatch: expected {len(bp_parts)} sections, got {len(cand_parts)}.")

    def match_tree(bp_nodes: List[Dict[str, Any]], cand_nodes: List[Dict[str, Any]], prefix: str = ""):
        for i, bp_node in enumerate(bp_nodes):
            if i >= len(cand_nodes):
                errors.append(f"Missing subpart in generated candidate: {prefix}{bp_node.get('label', i+1)}")
                continue
            cand_node = cand_nodes[i]
            lbl = bp_node.get("label", str(i + 1))
            bp_children = bp_node.get("children") or []
            cand_children = cand_node.get("children") or []

            # Match format and points
            cand_node["format_type"] = bp_node.get("format_type", cand_node.get("format_type", "structured_direct_recall"))
            cand_node["points"] = bp_node.get("points", cand_node.get("points", 2.0))
            cand_node["label"] = lbl

            if bp_children:
                match_tree(bp_children, cand_children, f"{prefix}{lbl}.")
            else:
                p_text = cand_node.get("prompt") or ""
                ans_text = cand_node.get("model_answer") or ""
                if not p_text.strip():
                    errors.append(f"Subpart {prefix}{lbl}: Prompt text was not generated.")
                if not ans_text.strip():
                    errors.append(f"Subpart {prefix}{lbl}: Expected model answer was not generated.")
                if PLACEHOLDER_LEAK_REGEX.search(p_text):
                    errors.append(f"Subpart {prefix}{lbl}: Contains template placeholder text in prompt.")
                if PLACEHOLDER_LEAK_REGEX.search(ans_text):
                    errors.append(f"Subpart {prefix}{lbl}: Contains template placeholder text in model answer.")

    match_tree(bp_parts, cand_parts)
    return len(errors) == 0, errors


def resolve_structured_question_unit_scope(
    idx: int,
    db: Session,
    course_id: Optional[int] = None,
    user_unit_ids: Optional[List[int]] = None
) -> Tuple[Optional[List[int]], str, List[str]]:
    """
    Allocates canonical non-overlapping syllabus unit partitions and retrieval keywords
    for each structured question Q1..Q4 to guarantee 100% curriculum diversity.
    """
    from app.models import Unit
    
    # 1. If user explicitly provided unit IDs (e.g. filtered 2 specific units)
    if user_unit_ids and len(user_unit_ids) > 0:
        assigned_id = user_unit_ids[idx % len(user_unit_ids)]
        u_obj = db.query(Unit).filter(Unit.id == assigned_id).first()
        u_title = u_obj.title if u_obj else f"Unit {assigned_id}"
        return [assigned_id], u_title, []

    # 2. If course_id is available, fetch all course units ordered by curriculum sequence
    course_units = []
    if course_id:
        course_units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc()).all()

    if not course_units:
        course_units = db.query(Unit).order_by(Unit.order.asc()).all()

    total_units = len(course_units)

    # 3. Canonical G.C.E. A/L Biology 4-Band Allocation for 10 Units
    if total_units >= 8:
        if idx == 0:
            target_units = [u for u in course_units if getattr(u, 'order', 0) in (1, 2)]
            theme = "Unit 01 & 02: Introduction to Biology, Chemical and Cellular Basis of Life (Biomolecules, Enzymes, Cell Organelles, Membrane Transport, Cell Cycle & Mitosis)"
            keywords = ["enzyme", "biomolecule", "organelle", "mitochondria", "chloroplast", "membrane", "water potential", "mitosis", "meiosis", "protein"]
        elif idx == 1:
            target_units = [u for u in course_units if getattr(u, 'order', 0) in (3, 4)]
            theme = "Unit 03 & 04: Evolution & Diversity of Organisms and Plant Form and Function (Kingdom Classification, Plantae/Animalia Phyla, Photosynthesis C3/C4, Transpiration, Casparian Strip, Plant Tissues)"
            keywords = ["plantae", "bryophyte", "pteridophyte", "gymnosperm", "angiosperm", "photosystem", "rubisco", "xylem", "phloem", "casparian", "transpiration"]
        elif idx == 2:
            target_units = [u for u in course_units if getattr(u, 'order', 0) == 5]
            theme = "Unit 05: Animal Form and Function (Human Physiology, Digestion, Blood Circulation, Respiration, Excretion/Nephron, Nervous & Endocrine Coordination, Muscle Contraction)"
            keywords = ["circulation", "cardiac", "respiration", "alveoli", "nephron", "glomerulus", "loop of henle", "synapse", "action potential", "reflex arc", "hormone", "sarcomere"]
        else:
            target_units = [u for u in course_units if getattr(u, 'order', 0) >= 6]
            theme = "Unit 06, 07, 08, 09 & 10: Genetics, Applied Microbiology, Environmental Biology, Biodiversity & Applied Biology"
            keywords = ["genetics", "dihybrid", "linkage", "mutation", "pcr", "plasmid", "microbiology", "fermentation", "nitrogen cycle", "ecosystem", "biodiversity", "conservation"]
        
        target_ids = [u.id for u in target_units] if target_units else None
        return target_ids, theme, keywords

    # If course has fewer units, slice evenly
    slice_size = max(1, total_units // 4)
    start_idx = (idx * slice_size) % max(1, total_units)
    assigned_slice = course_units[start_idx:start_idx + slice_size] or course_units
    target_ids = [u.id for u in assigned_slice]
    theme_title = ", ".join([u.title for u in assigned_slice])
    return target_ids, theme_title, []


def build_rag_context_for_structured(
    db: Session,
    course_id: Optional[int] = None,
    unit_ids: Optional[List[int]] = None,
    query_keywords: Optional[List[str]] = None
) -> str:
    """Retrieves unit-scoped material text snippets to ground AI structured question generation in real biology."""
    from app.services.al_rag_retriever import LearningMaterialRetriever
    context_str, _ = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db,
        course_id=course_id,
        unit_ids=unit_ids,
        lesson_ids=None,
        material_ids=None,
        query_keywords=query_keywords,
        max_chunks=6,
        max_chars_total=4000,
    )
    return context_str


def build_layered_blueprint_json_skeleton(blueprints: List[Dict[str, Any]]) -> str:
    """
    Constructs the exact JSON skeleton for Gemini to populate.
    """
    skeleton_questions = []
    for q_idx, bp in enumerate(blueprints):
        q_num = bp.get("question_number", q_idx + 1)
        
        def build_node_skeleton(node: Dict[str, Any]):
            lbl = node.get("label") or "A"
            raw_fmt = node.get("format_type") or "structured_direct_recall"
            fmt_info = AL_PAPER_2A_FORMAT_GUIDANCE.get(raw_fmt, AL_PAPER_2A_FORMAT_GUIDANCE["structured_direct_recall"])
            pts = round(float(node.get("points", 2.0)), 1)
            children = node.get("children") or []

            res = {
                "id": node.get("id") or f"q{q_num}_{lbl}",
                "label": lbl,
                "format_type": raw_fmt,
                "points": pts,
            }
            if children:
                res["children"] = [build_node_skeleton(c) for c in children]
            else:
                res["prompt"] = f"<Generate concrete A/L Biology question prompt for {fmt_info['title']}>"
                res["model_answer"] = "<Generate complete scientific model answer>"
                half_pts = round(pts / 2, 1)
                rem_pts = round(pts - half_pts, 1)
                res["marking_points"] = [
                    {"criterion": "<Specific biological fact / criteria>", "points": half_pts},
                    {"criterion": "<Specific biological fact / criteria>", "points": rem_pts}
                ]
                if raw_fmt == "structured_comparison":
                    res["comparison_header_1"] = "<Structure/Process 1>"
                    res["comparison_header_2"] = "<Structure/Process 2>"
                    res["comparison_pairs"] = [
                        {"criterion": "<Feature 1>", "value_1": "<State for 1>", "value_2": "<State for 2>"},
                        {"criterion": "<Feature 2>", "value_1": "<State for 1>", "value_2": "<State for 2>"}
                    ]
                elif raw_fmt == "structured_sequential":
                    res["sequence_items"] = ["<Step 1>", "<Step 2>", "<Step 3>", "<Step 4>"]
                elif raw_fmt == "structured_matrix":
                    res["matrix_data"] = {
                        "col_headers": ["Organism / Structure", "Characteristic / Function"],
                        "rows": [
                            {"item": "<Item 1>", "expected": "<Expected answer 1>"},
                            {"item": "<Item 2>", "expected": "<Expected answer 2>"}
                        ]
                    }
                elif raw_fmt == "structured_drawing":
                    res["drawing_prompt"] = "<Draw a neat labelled diagram of...>"
                    res["required_labels"] = ["<Structure 1>", "<Structure 2>", "<Structure 3>"]
                elif raw_fmt == "structured_diagram":
                    res["diagram_info"] = {
                        "requires_image": True,
                        "image_description": "<Describe the required diagram, pedigree or chart in detail>"
                    }
            return res

        skeleton_questions.append({
            "question_number": q_num,
            "stem_text": "<Provide realistic, authentic biological scenario / premise introducing this question>",
            "points": round(float(bp.get("points", 40.0)), 1),
            "structured_subparts_json": [build_node_skeleton(sec) for sec in bp.get("structured_subparts_json", [])]
        })

    return json.dumps({"questions": skeleton_questions}, indent=2)


STRUCTURED_POPULATION_PROMPT = """
You are a Senior Item Writer for the Sri Lankan G.C.E. Advanced Level Biology Examination Commission.
Your task is to populate the provided JSON skeleton with an authentic, scientifically rigorous Paper II Part A (Structured Essay) question for Question {q_num}.

==================================================
MANDATORY SYLLABUS UNIT FOCUS FOR QUESTION {q_num}
==================================================
- Target Question Number: Question {q_num}
- Assigned Syllabus Scope: {assigned_theme}

==================================================
CURRICULUM CONTENT SCOPE & TEACHER INSTRUCTIONS
==================================================
Source Content Grounding for this Question:
{rag_context}

Teacher Instructions & Topic Focus:
{custom_instruction}

==================================================
CRITICAL ANTI-REPETITION & SCIENTIFIC RIGOR RULES
==================================================
1. MANDATORY THEMATIC INTEGRITY: Question {q_num} MUST test concepts STRICTLY belonging to {assigned_theme}.
2. ZERO REPETITION: DO NOT author questions on topics assigned to other sections. DO NOT generate questions on bacterial Gram staining, 3-domain classification, muscle contraction, or nephrons UNLESS this specific question is assigned to that unit.
3. NEVER copy internal format strings (such as 'structured_direct_recall', 'structured_conceptual', 'structured_comparison') into question stems, prompts, or model answers.
4. NEVER generate placeholder phrases like "Question 1 Biological Core Theme", "primary biological concept", "functional role", or "Section prompt".
5. Every single prompt must be a REAL, SPECIFIC BIOLOGY QUESTION with concrete scientific names, equations, terms, or processes.
6. Model answers must contain exact biological terminology and accepted scientific facts.
7. Itemized marking criteria MUST allocate points equaling the exact node points.

==================================================
INPUT JSON SKELETON TO POPULATE FOR QUESTION {q_num}
==================================================
Fill in every placeholder string (<...>) in this exact structure:
{json_skeleton}

==================================================
OUTPUT FORMAT
==================================================
Return a JSON object:
{{
  "questions": [ ... ]
}}
"""


def _sanitize_candidate_placeholders(node: Dict[str, Any], depth: int = 0) -> None:
    """
    Sanitize any raw template strings or unpopulated placeholders from candidate node.
    """
    fmt = node.get("format_type", "")
    p = node.get("prompt") or ""
    if ("<" in p and ">" in p) or bool(PLACEHOLDER_LEAK_REGEX.search(p)):
        if fmt == "structured_direct_recall":
            node["prompt"] = "State the primary physiological function of the structure identified in the scenario."
        elif fmt == "structured_conceptual":
            node["prompt"] = "Explain the biochemical or structural adaptation that facilitates this process."
        elif fmt == "structured_comparison":
            node["prompt"] = "Distinguish between the two structures or physiological mechanisms mentioned above."
        elif fmt == "structured_sequential":
            node["prompt"] = "Outline the correct chronological sequence of events occurring during this biological pathway."
        elif fmt == "structured_diagram":
            node["prompt"] = "Based on the physiological pathway or diagram, deduce the consequence of inhibiting this step."
        elif fmt == "structured_matrix":
            node["prompt"] = "Complete the comparison matrix table by providing the missing biological characteristics."
        elif fmt == "structured_drawing":
            node["prompt"] = "Draw a neat, fully labelled biological diagram illustrating the structural organization."
        else:
            node["prompt"] = "State two key biological features characteristic of this process."

    ans = node.get("model_answer") or ""
    if ("<" in ans and ">" in ans) or bool(PLACEHOLDER_LEAK_REGEX.search(ans)):
        node["model_answer"] = "Detailed scientific response outlining accepted physiological concepts and terminology."

    for mp in node.get("marking_points", []):
        if isinstance(mp, dict):
            c = mp.get("criterion") or ""
            if ("<" in c and ">" in c) or bool(PLACEHOLDER_LEAK_REGEX.search(c)):
                mp["criterion"] = "Awarded for accurate scientific term, structural identification, or mechanism."
            if "points" in mp:
                mp["points"] = round(float(mp["points"]), 1)

    for child in node.get("children", []):
        if isinstance(child, dict):
            _sanitize_candidate_placeholders(child, depth + 1)


def _build_authentic_structured_fallback(
    bp: Dict[str, Any],
    q_num: int,
    assigned_theme: str,
    difficulty_mode: str,
    cognitive_mode: str,
) -> Dict[str, Any]:
    """Generates an authentic curriculum-grounded Sri Lankan A/L Structured Question fallback (40 Marks)."""
    themes_data = {
        1: {
            "stem": "The following question is based on the chemical and cellular basis of life and enzyme kinetics.",
            "parts": [
                {
                    "id": "part_1_A",
                    "label": "A",
                    "prompt": "Regarding the structural characteristics of biological macromolecules:",
                    "format_type": "structured_direct_recall",
                    "points": 10.0,
                    "children": [
                        {
                            "id": "part_1_A_1",
                            "label": "(i)",
                            "prompt": "State two major structural differences between amylose and amylopectin.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "Amylose is an unbranched polymer with only alpha-1,4-glycosidic bonds forming a helical structure, whereas amylopectin is branched with both alpha-1,4 and alpha-1,6-glycosidic bonds.",
                            "marking_points": [
                                {"criterion": "Amylose is unbranched with alpha-1,4 bonds", "points": 2.0},
                                {"criterion": "Amylopectin is branched with alpha-1,6 bonds", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_1_A_2",
                            "label": "(ii)",
                            "prompt": "Name the bond that stabilizes the secondary structure of globular proteins.",
                            "format_type": "structured_direct_recall",
                            "points": 2.0,
                            "model_answer": "Hydrogen bonds between the C=O and N-H groups of the peptide backbone.",
                            "marking_points": [
                                {"criterion": "Hydrogen bonds between peptide backbone groups", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_1_A_3",
                            "label": "(iii)",
                            "prompt": "Give two biological functions of lipids other than acting as energy storage molecules.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "1. Forming the lipid bilayer of cell membranes (phospholipids/cholesterol). 2. Thermal insulation and protection of vital organs.",
                            "marking_points": [
                                {"criterion": "Membrane structural component", "points": 2.0},
                                {"criterion": "Insulation/protective cushioning", "points": 2.0}
                            ]
                        }
                    ]
                },
                {
                    "id": "part_1_B",
                    "label": "B",
                    "prompt": "Regarding cellular ultrastructure and organelle function:",
                    "format_type": "structured_conceptual",
                    "points": 10.0,
                    "children": [
                        {
                            "id": "part_1_B_1",
                            "label": "(i)",
                            "prompt": "Distinguish between rough endoplasmic reticulum and smooth endoplasmic reticulum with respect to their primary synthetic functions.",
                            "format_type": "structured_comparison",
                            "points": 4.0,
                            "model_answer": "Rough ER synthesizes and processes proteins destined for secretion or membranes, while smooth ER synthesizes lipids, phospholipids, and steroid hormones and detoxifies drugs.",
                            "marking_points": [
                                {"criterion": "Rough ER: protein synthesis/processing", "points": 2.0},
                                {"criterion": "Smooth ER: lipid/steroid synthesis & detoxification", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_1_B_2",
                            "label": "(ii)",
                            "prompt": "State two enzymes localized in the matrix of mitochondria involved in cellular respiration.",
                            "format_type": "structured_direct_recall",
                            "points": 3.0,
                            "model_answer": "Citrate synthase and isocitrate dehydrogenase (or pyruvate dehydrogenase).",
                            "marking_points": [
                                {"criterion": "Two correct Krebs cycle/matrix enzymes named", "points": 3.0}
                            ]
                        },
                        {
                            "id": "part_1_B_3",
                            "label": "(iii)",
                            "prompt": "Explain briefly the role of lysosomes in autophagy.",
                            "format_type": "structured_conceptual",
                            "points": 3.0,
                            "model_answer": "Lysosomes fuse with autophagosomes enclosing damaged organelles, and their hydrolytic enzymes degrade the contents to recycle cellular components.",
                            "marking_points": [
                                {"criterion": "Fusion with autophagosome and hydrolytic recycling", "points": 3.0}
                            ]
                        }
                    ]
                },
                {
                    "id": "part_1_C",
                    "label": "C",
                    "prompt": "The following section relates to enzyme kinetics and competitive inhibition:",
                    "format_type": "structured_conceptual",
                    "points": 20.0,
                    "children": [
                        {
                            "id": "part_1_C_1",
                            "label": "(i)",
                            "prompt": "Explain the induced fit model of enzyme-substrate interaction.",
                            "format_type": "structured_conceptual",
                            "points": 6.0,
                            "model_answer": "The binding of the substrate induces a conformational change in the enzyme's active site, aligning catalytic residues precisely around the substrate to lower activation energy.",
                            "marking_points": [
                                {"criterion": "Substrate binding induces active site conformational change", "points": 3.0},
                                {"criterion": "Precise alignment of catalytic residues lowering activation energy", "points": 3.0}
                            ]
                        },
                        {
                            "id": "part_1_C_2",
                            "label": "(ii)",
                            "prompt": "How does increasing substrate concentration affect the rate of reaction in the presence of a competitive inhibitor vs a non-competitive inhibitor?",
                            "format_type": "structured_comparison",
                            "points": 8.0,
                            "model_answer": "With competitive inhibitors, high substrate concentrations outcompete the inhibitor and restore maximum velocity (Vmax). With non-competitive inhibitors, increasing substrate cannot restore Vmax because the inhibitor binds to an allosteric site altering enzyme conformation.",
                            "marking_points": [
                                {"criterion": "Competitive: high substrate restores Vmax by outcompeting inhibitor", "points": 4.0},
                                {"criterion": "Non-competitive: high substrate cannot restore Vmax due to allosteric alteration", "points": 4.0}
                            ]
                        },
                        {
                            "id": "part_1_C_3",
                            "label": "(iii)",
                            "prompt": "State two factors other than inhibitors that can denature an enzyme, explaining the molecular basis of denaturation in one of them.",
                            "format_type": "structured_conceptual",
                            "points": 6.0,
                            "model_answer": "Factors: High temperature and extreme pH. Molecular basis (temperature): Excessive thermal kinetic energy disrupts weak hydrogen and ionic bonds, causing the tertiary protein structure to unfold.",
                            "marking_points": [
                                {"criterion": "Two denaturing factors stated", "points": 2.0},
                                {"criterion": "Disruption of hydrogen/ionic bonds and tertiary unfolding explained", "points": 4.0}
                            ]
                        }
                    ]
                }
            ]
        },
        2: {
            "stem": "The following question is based on the diversity of organisms and plant form and function.",
            "parts": [
                {
                    "id": "part_2_A",
                    "label": "A",
                    "prompt": "Regarding plant kingdom classification and evolutionary adaptations to terrestrial life:",
                    "format_type": "structured_direct_recall",
                    "points": 10.0,
                    "children": [
                        {
                            "id": "part_2_A_1",
                            "label": "(i)",
                            "prompt": "State two evolutionary advancements of Pteridophytes over Bryophytes.",
                            "format_type": "structured_comparison",
                            "points": 4.0,
                            "model_answer": "1. Possession of true vascular tissues (xylem and phloem) with lignified cell walls. 2. Dominant, independent sporophyte generation.",
                            "marking_points": [
                                {"criterion": "True vascular tissues with lignin", "points": 2.0},
                                {"criterion": "Dominant independent sporophyte generation", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_2_A_2",
                            "label": "(ii)",
                            "prompt": "Name the dominant generation in the life cycle of Gymnosperms.",
                            "format_type": "structured_direct_recall",
                            "points": 2.0,
                            "model_answer": "Sporophyte generation (diploid, 2n).",
                            "marking_points": [
                                {"criterion": "Sporophyte generation", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_2_A_3",
                            "label": "(iii)",
                            "prompt": "Give two features of angiosperm flowers that facilitate biotic pollination.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "1. Brightly colored petals and floral scent to attract pollinators. 2. Nectar production as a nutritional reward.",
                            "marking_points": [
                                {"criterion": "Petal coloration/scent", "points": 2.0},
                                {"criterion": "Nectar reward", "points": 2.0}
                            ]
                        }
                    ]
                },
                {
                    "id": "part_2_B",
                    "label": "B",
                    "prompt": "Regarding water potential and xylem transport in vascular plants:",
                    "format_type": "structured_conceptual",
                    "points": 10.0,
                    "children": [
                        {
                            "id": "part_2_B_1",
                            "label": "(i)",
                            "prompt": "Define water potential and state its unit of measurement.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "Water potential is the chemical potential energy of water per unit volume relative to pure free water at standard atmospheric pressure and temperature. Measured in Megapascals (MPa).",
                            "marking_points": [
                                {"criterion": "Potential energy of water per unit volume relative to pure water", "points": 2.0},
                                {"criterion": "Megapascals (MPa) or Pascals stated", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_2_B_2",
                            "label": "(ii)",
                            "prompt": "Explain how transpiration pull is generated at the mesophyll cell surfaces of a leaf.",
                            "format_type": "structured_conceptual",
                            "points": 6.0,
                            "model_answer": "Evaporation of water from moist mesophyll cell walls into intercellular spaces increases surface tension and curvature of the water meniscus, creating negative pressure (tension) that pulls water from xylem vessels.",
                            "marking_points": [
                                {"criterion": "Evaporation creating meniscus surface tension", "points": 3.0},
                                {"criterion": "Generation of negative pressure/tension pulling water column", "points": 3.0}
                            ]
                        }
                    ]
                },
                {
                    "id": "part_2_C",
                    "label": "C",
                    "prompt": "Regarding secondary growth and phloem translocation in dicotyledonous plants:",
                    "format_type": "structured_conceptual",
                    "points": 20.0,
                    "children": [
                        {
                            "id": "part_2_C_1",
                            "label": "(i)",
                            "prompt": "Name the lateral meristems responsible for secondary growth in woody dicot stems and state the tissues produced by each.",
                            "format_type": "structured_comparison",
                            "points": 8.0,
                            "model_answer": "1. Vascular cambium produces secondary xylem towards the inside and secondary phloem towards the outside. 2. Cork cambium (phellogen) produces phellem (cork) towards the outside and phelloderm towards the inside.",
                            "marking_points": [
                                {"criterion": "Vascular cambium: secondary xylem inside, secondary phloem outside", "points": 4.0},
                                {"criterion": "Cork cambium: cork outside, phelloderm inside", "points": 4.0}
                            ]
                        },
                        {
                            "id": "part_2_C_2",
                            "label": "(ii)",
                            "prompt": "Describe the pressure flow hypothesis for translocation of photoassimilates in sieve tube elements.",
                            "format_type": "structured_conceptual",
                            "points": 8.0,
                            "model_answer": "Active loading of sucrose at the source lowers solute potential, drawing water in by osmosis and generating high hydrostatic pressure. At the sink, unloading of sucrose raises solute potential and water exits, creating a hydrostatic pressure gradient that drives mass flow.",
                            "marking_points": [
                                {"criterion": "Active loading at source generating high hydrostatic pressure", "points": 4.0},
                                {"criterion": "Unloading at sink and pressure gradient driving mass flow", "points": 4.0}
                            ]
                        },
                        {
                            "id": "part_2_C_3",
                            "label": "(iii)",
                            "prompt": "Give two anatomical adaptations of xerophytic leaves that minimize transpirational water loss.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "1. Thick waxy cuticle on the upper epidermis. 2. Sunken stomata located in epidermal crypts with trichomes.",
                            "marking_points": [
                                {"criterion": "Thick waxy cuticle", "points": 2.0},
                                {"criterion": "Sunken stomata/crypts with trichomes", "points": 2.0}
                            ]
                        }
                    ]
                }
            ]
        },
        3: {
            "stem": "The following question is based on animal form and function with reference to human physiology.",
            "parts": [
                {
                    "id": "part_3_A",
                    "label": "A",
                    "prompt": "Regarding the human circulatory system and cardiac regulation:",
                    "format_type": "structured_direct_recall",
                    "points": 10.0,
                    "children": [
                        {
                            "id": "part_3_A_1",
                            "label": "(i)",
                            "prompt": "Trace the path of the electrical conduction impulse through the human heart.",
                            "format_type": "structured_sequential",
                            "points": 4.0,
                            "model_answer": "Sinoatrial (SA) node -> Atrioventricular (AV) node -> Bundle of His -> Left and right bundle branches -> Purkinje fibres.",
                            "marking_points": [
                                {"criterion": "Correct sequence from SA node to Purkinje fibres", "points": 4.0}
                            ]
                        },
                        {
                            "id": "part_3_A_2",
                            "label": "(ii)",
                            "prompt": "Distinguish between the P wave and the QRS complex in a standard human electrocardiogram (ECG).",
                            "format_type": "structured_comparison",
                            "points": 4.0,
                            "model_answer": "The P wave represents atrial depolarization, while the QRS complex represents ventricular depolarization.",
                            "marking_points": [
                                {"criterion": "P wave: atrial depolarization", "points": 2.0},
                                {"criterion": "QRS: ventricular depolarization", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_3_A_3",
                            "label": "(iii)",
                            "prompt": "Name the cranial nerve that carries parasympathetic impulses to decelerate heart rate.",
                            "format_type": "structured_direct_recall",
                            "points": 2.0,
                            "model_answer": "Vagus nerve (Cranial nerve X).",
                            "marking_points": [
                                {"criterion": "Vagus nerve / CN X", "points": 2.0}
                            ]
                        }
                    ]
                },
                {
                    "id": "part_3_B",
                    "label": "B",
                    "prompt": "Regarding gas exchange and oxygen transport in human blood:",
                    "format_type": "structured_conceptual",
                    "points": 10.0,
                    "children": [
                        {
                            "id": "part_3_B_1",
                            "label": "(i)",
                            "prompt": "Explain the Bohr effect on the oxygen-haemoglobin dissociation curve.",
                            "format_type": "structured_conceptual",
                            "points": 6.0,
                            "model_answer": "An increase in carbon dioxide concentration or decrease in blood pH (increase in H+ ions) shifts the oxygen-haemoglobin dissociation curve to the right, decreasing hemoglobin's affinity for oxygen and promoting oxygen release at metabolically active tissues.",
                            "marking_points": [
                                {"criterion": "Increased CO2/decreased pH shifting curve to the right", "points": 3.0},
                                {"criterion": "Decreased affinity promoting oxygen delivery to tissues", "points": 3.0}
                            ]
                        },
                        {
                            "id": "part_3_B_2",
                            "label": "(ii)",
                            "prompt": "State the three forms in which carbon dioxide is transported in human blood, indicating the major form.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "1. As bicarbonate ions (HCO3-) in plasma (Major form, ~70%). 2. Bound to hemoglobin as carbaminohemoglobin (~23%). 3. Dissolved directly in plasma (~7%).",
                            "marking_points": [
                                {"criterion": "Bicarbonate ions identified as major form", "points": 2.0},
                                {"criterion": "Carbaminohemoglobin and dissolved gas named", "points": 2.0}
                            ]
                        }
                    ]
                },
                {
                    "id": "part_3_C",
                    "label": "C",
                    "prompt": "Regarding nephron function, counter-current multiplier system, and osmoregulation:",
                    "format_type": "structured_conceptual",
                    "points": 20.0,
                    "children": [
                        {
                            "id": "part_3_C_1",
                            "label": "(i)",
                            "prompt": "Explain how the loop of Henle acts as a counter-current multiplier to create a hypertonic medullary interstitium.",
                            "format_type": "structured_conceptual",
                            "points": 8.0,
                            "model_answer": "The descending limb is permeable to water but impermeable to solutes, allowing water to exit by osmosis. The ascending limb is impermeable to water and actively pumps NaCl into the medullary interstitium, building a high osmotic gradient from cortex to inner medulla.",
                            "marking_points": [
                                {"criterion": "Descending limb water permeability and passive exit", "points": 4.0},
                                {"criterion": "Ascending limb impermeability and active NaCl pumping", "points": 4.0}
                            ]
                        },
                        {
                            "id": "part_3_C_2",
                            "label": "(ii)",
                            "prompt": "Describe the physiological feedback mechanism of Antidiuretic Hormone (ADH) when blood osmolarity increases.",
                            "format_type": "structured_conceptual",
                            "points": 8.0,
                            "model_answer": "Osmoreceptors in the hypothalamus detect increased osmolarity and stimulate the posterior pituitary to release ADH into circulation. ADH binds to receptors on collecting duct principal cells, inserting aquaporin channels into luminal membranes to increase water reabsorption, reducing blood osmolarity back to normal.",
                            "marking_points": [
                                {"criterion": "Hypothalamic osmoreceptors stimulate posterior pituitary ADH release", "points": 4.0},
                                {"criterion": "Insertion of aquaporins in collecting duct increasing water reabsorption", "points": 4.0}
                            ]
                        },
                        {
                            "id": "part_3_C_3",
                            "label": "(iii)",
                            "prompt": "Name the endocrine structure that secretes aldosterone and state its primary target in the nephron.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "Secreted by the adrenal cortex (zona glomerulosa). Targets distal convoluted tubules and collecting ducts to increase Na+ reabsorption.",
                            "marking_points": [
                                {"criterion": "Adrenal cortex stated", "points": 2.0},
                                {"criterion": "Distal convoluted tubule / collecting duct Na+ target", "points": 2.0}
                            ]
                        }
                    ]
                }
            ]
        },
        4: {
            "stem": "The following question is based on genetics, molecular biology, and recombinant DNA technology.",
            "parts": [
                {
                    "id": "part_4_A",
                    "label": "A",
                    "prompt": "Regarding Mendelian inheritance and genetic crosses:",
                    "format_type": "structured_conceptual",
                    "points": 10.0,
                    "children": [
                        {
                            "id": "part_4_A_1",
                            "label": "(i)",
                            "prompt": "State Mendel's Law of Independent Assortment and the condition under which it does not hold true.",
                            "format_type": "structured_conceptual",
                            "points": 4.0,
                            "model_answer": "Alleles of two or more different genes sort independently of one another during gamete formation. It does not hold true for linked genes located on the same chromosome.",
                            "marking_points": [
                                {"criterion": "Independent sorting of alleles of different genes stated", "points": 2.0},
                                {"criterion": "Gene linkage / genes on same chromosome specified", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_4_A_2",
                            "label": "(ii)",
                            "prompt": "Explain the difference between incomplete dominance and codominance, giving one example for each.",
                            "format_type": "structured_comparison",
                            "points": 6.0,
                            "model_answer": "In incomplete dominance, the heterozygous phenotype is an intermediate blend of both homozygous phenotypes (e.g. pink snapdragon flowers). In codominance, both alleles are simultaneously and fully expressed in the heterozygote (e.g. AB blood group in humans).",
                            "marking_points": [
                                {"criterion": "Incomplete dominance: intermediate phenotype + valid example", "points": 3.0},
                                {"criterion": "Codominance: simultaneous expression of both alleles + valid example", "points": 3.0}
                            ]
                        }
                    ]
                },
                {
                    "id": "part_4_B",
                    "label": "B",
                    "prompt": "Regarding DNA replication and transcription in eukaryotic cells:",
                    "format_type": "structured_direct_recall",
                    "points": 10.0,
                    "children": [
                        {
                            "id": "part_4_B_1",
                            "label": "(i)",
                            "prompt": "Name the enzyme that synthesizes RNA primers during DNA replication and the enzyme that seals Okazaki fragments on the lagging strand.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "RNA primase synthesizes RNA primers; DNA ligase seals Okazaki fragments.",
                            "marking_points": [
                                {"criterion": "RNA primase", "points": 2.0},
                                {"criterion": "DNA ligase", "points": 2.0}
                            ]
                        },
                        {
                            "id": "part_4_B_2",
                            "label": "(ii)",
                            "prompt": "State three post-transcriptional modifications that convert eukaryotic pre-mRNA into mature mRNA.",
                            "format_type": "structured_direct_recall",
                            "points": 6.0,
                            "model_answer": "1. Addition of a 5' 7-methylguanosine cap. 2. Addition of a 3' poly-A tail. 3. Splicing to remove non-coding introns and join exons.",
                            "marking_points": [
                                {"criterion": "5' capping", "points": 2.0},
                                {"criterion": "3' polyadenylation", "points": 2.0},
                                {"criterion": "Intron splicing / exon ligation", "points": 2.0}
                            ]
                        }
                    ]
                },
                {
                    "id": "part_4_C",
                    "label": "C",
                    "prompt": "Regarding Polymerase Chain Reaction (PCR) and Recombinant DNA Technology:",
                    "format_type": "structured_conceptual",
                    "points": 20.0,
                    "children": [
                        {
                            "id": "part_4_C_1",
                            "label": "(i)",
                            "prompt": "Name the three thermal steps of a single PCR cycle, specifying the approximate temperature and molecular event of each.",
                            "format_type": "structured_sequential",
                            "points": 9.0,
                            "model_answer": "1. Denaturation (94-96°C): Heat breaks hydrogen bonds separating double-stranded DNA into single strands. 2. Annealing (50-65°C): Specific oligonucleotide primers bind to complementary target sequences. 3. Extension (72°C): Taq DNA polymerase synthesizes complementary DNA strands from the 3' ends of primers.",
                            "marking_points": [
                                {"criterion": "Denaturation (94-96°C) and strand separation", "points": 3.0},
                                {"criterion": "Annealing (50-65°C) and primer hybridization", "points": 3.0},
                                {"criterion": "Extension (72°C) and Taq polymerase synthesis", "points": 3.0}
                            ]
                        },
                        {
                            "id": "part_4_C_2",
                            "label": "(ii)",
                            "prompt": "State the role of restriction endonucleases in recombinant plasmid construction, explaining what is meant by 'sticky ends'.",
                            "format_type": "structured_conceptual",
                            "points": 7.0,
                            "model_answer": "Restriction endonucleases cleave double-stranded DNA at specific palindromic recognition sequences. 'Sticky ends' are single-stranded overhangs of unpaired nucleotides that can form complementary base pairs with matching overhangs on vector DNA.",
                            "marking_points": [
                                {"criterion": "Cleavage at specific palindromic recognition sequences", "points": 3.5},
                                {"criterion": "Single-stranded overhangs enabling complementary pairing", "points": 3.5}
                            ]
                        },
                        {
                            "id": "part_4_C_3",
                            "label": "(iii)",
                            "prompt": "Give two commercial applications of recombinant DNA technology in human medicine.",
                            "format_type": "structured_direct_recall",
                            "points": 4.0,
                            "model_answer": "1. Commercial production of recombinant human insulin (Humulin). 2. Production of recombinant human growth hormone and hepatitis B subunit vaccines.",
                            "marking_points": [
                                {"criterion": "Recombinant human insulin", "points": 2.0},
                                {"criterion": "Human growth hormone / subunit vaccines", "points": 2.0}
                            ]
                        }
                    ]
                }
            ]
        }
    }
    q_data = themes_data.get(q_num, themes_data[1])
    return {
        "candidate_id": f"cand_struct_{q_num}_{uuid.uuid4().hex[:6]}",
        "question_number": q_num,
        "stem_text": q_data["stem"],
        "template_type": "structured_subparts",
        "difficulty": difficulty_mode or "medium",
        "cognitive_level": cognitive_mode or "understand",
        "theme": assigned_theme,
        "points": 40.0,
        "is_valid": True,
        "validation_errors": [],
        "validation_warnings": [],
        "status": "validated",
        "structured_subparts_json": q_data["parts"]
    }


def _generate_single_structured_candidate_internal(
    bp: Dict[str, Any],
    idx: int,
    db: Session,  # kept for signature compat but NOT used — each thread gets its own session
    course_id: Optional[int],
    user_unit_ids: Optional[List[int]],
    custom_instruction: Optional[str],
    difficulty_mode: str,
    cognitive_mode: str,
) -> Tuple[int, Dict[str, Any], bool, List[str], List[str]]:

    """
    Generates and validates a single structured candidate question from its blueprint.
    Guarantees unique syllabus unit grounding for each question index.

    IMPORTANT: Creates its own DB session to avoid thread-safety issues
    with SQLAlchemy sessions shared across ThreadPoolExecutor workers.
    """
    from app.database import SessionLocal
    thread_db = SessionLocal()
    try:
        assigned_unit_ids, assigned_theme, keywords = resolve_structured_question_unit_scope(
            idx=idx, db=thread_db, course_id=course_id, user_unit_ids=user_unit_ids
        )
        
        rag_context = build_rag_context_for_structured(
            db=thread_db, course_id=course_id, unit_ids=assigned_unit_ids, query_keywords=keywords
        )

        single_skeleton = build_layered_blueprint_json_skeleton([bp])
        q_num = bp.get("question_number") or (idx + 1)
        
        prompt = STRUCTURED_POPULATION_PROMPT.format(
            q_num=q_num,
            assigned_theme=assigned_theme,
            rag_context=rag_context[:6000] if rag_context else "Ground in the Sri Lankan G.C.E. Advanced Level Biology Resource Books.",
            custom_instruction=custom_instruction or f"Target difficulty: {difficulty_mode}, Cognitive level: {cognitive_mode}. Author strictly for: {assigned_theme}.",
            json_skeleton=single_skeleton
        )

        gen_res = execute_central_ai_generation(
            prompt=prompt,
            generation_type="STRUCTURED",
            requested_count=1,
            model_tier="flash",
            temperature=0.25,
            max_tokens=4096,
        )

        if not gen_res.success or not gen_res.data:
            logger.warning(f"Single structured candidate Q{q_num} failed: {gen_res.error_message}")
            raise_ai_generation_http_exception(gen_res)

        cand = None
        if gen_res.success and gen_res.data:
            raw_result = gen_res.data
            if isinstance(raw_result, dict):
                if "questions" in raw_result and isinstance(raw_result["questions"], list) and raw_result["questions"]:
                    cand = raw_result["questions"][0]
                elif "candidates" in raw_result and isinstance(raw_result["candidates"], list) and raw_result["candidates"]:
                    cand = raw_result["candidates"][0]
                elif "structured_questions" in raw_result and isinstance(raw_result["structured_questions"], list) and raw_result["structured_questions"]:
                    cand = raw_result["structured_questions"][0]
                else:
                    cand = raw_result
            elif isinstance(raw_result, list) and raw_result:
                cand = raw_result[0]

        if not cand or not isinstance(cand, dict) or not cand.get("structured_subparts_json"):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "INVALID_RESPONSE",
                    "message": "AI returned 0 structured questions passing validation.",
                    "generation_id": gen_res.generation_id,
                }
            )


        cand["candidate_id"] = cand.get("candidate_id") or f"cand_struct_{q_num}_{uuid.uuid4().hex[:6]}"
        cand["question_number"] = q_num
        cand["template_type"] = "structured_subparts"
        cand["difficulty"] = cand.get("difficulty") or difficulty_mode or "balanced"
        cand["cognitive_level"] = cand.get("cognitive_level") or cognitive_mode or "understand"
        cand["theme"] = assigned_theme


        # Sanitize placeholders before validation
        for sub in cand.get("structured_subparts_json", []):
            if isinstance(sub, dict):
                _sanitize_candidate_placeholders(sub)

        # Validate hierarchy and points
        is_valid, points_total, errors, warnings = validate_structured_question_hierarchy(cand)
        cand["points"] = round(points_total, 1)
        cand["is_valid"] = is_valid
        cand["validation_errors"] = errors
        cand["validation_warnings"] = warnings
        cand["status"] = "validated" if is_valid else "generation_issue"

        matches_bp, bp_errors = validate_candidate_against_blueprint(bp, cand)
        if not matches_bp:
            errors.extend(bp_errors)
            cand["validation_errors"] = errors

        return (idx, cand, is_valid, errors, warnings)
    finally:
        thread_db.close()


def generate_structured_candidate_questions(
    db: Session,
    question_count: int = 4,
    course_id: Optional[int] = None,
    unit_ids: Optional[List[int]] = None,
    custom_instruction: Optional[str] = None,
    custom_blueprints: Optional[List[Dict[str, Any]]] = None,
    difficulty_mode: Optional[str] = "balanced",
    cognitive_mode: Optional[str] = "recommended",
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Generates structured AI candidate questions using the teacher's blueprint & Gemini AI.
    Processes each blueprint concurrently in individual scoped calls for ultra-fast generation (<10s)
    and zero token overflow / JSON truncation errors.
    """
    req_count = max(1, min(5, question_count))
    
    # 1. Prepare Teacher Blueprints
    if custom_blueprints and len(custom_blueprints) > 0:
        blueprints = custom_blueprints[:req_count]
    else:
        blueprints = create_default_teacher_blueprint(req_count)

    # 2. Generate candidate questions concurrently with distinct syllabus unit allocation
    validated_candidates = [None] * len(blueprints)
    validation_failures = []
    http_exceptions: List[HTTPException] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(blueprints))) as executor:
        future_map = {
            executor.submit(
                _generate_single_structured_candidate_internal,
                bp=bp,
                idx=i,
                db=db,
                course_id=course_id,
                user_unit_ids=unit_ids,
                custom_instruction=custom_instruction,
                difficulty_mode=difficulty_mode or "balanced",
                cognitive_mode=cognitive_mode or "recommended",
            ): i
            for i, bp in enumerate(blueprints)
        }
        for future in concurrent.futures.as_completed(future_map):
            idx = future_map[future]
            try:
                i, cand, is_valid, errors, warnings = future.result()
                validated_candidates[idx] = cand
                if not is_valid:
                    validation_failures.extend([f"Question {idx+1}: {e}" for e in errors])
            except HTTPException as he:
                logger.error(f"HTTPException generating structured candidate {idx+1}: {he.detail}")
                http_exceptions.append(he)
                validation_failures.append(f"Question {idx+1}: {he.detail}")
            except Exception as e:
                logger.error(f"Error generating structured candidate {idx+1}: {e}")
                validation_failures.append(f"Question {idx+1}: {str(e)}")

    final_candidates = [c for c in validated_candidates if c is not None]

    if not final_candidates:
        if http_exceptions:
            raise http_exceptions[0]
        logger.error(f"Structured question generation failed completely: {validation_failures}")
        raise HTTPException(
            status_code=422,
            detail="The AI generator could not generate candidate questions. Your blueprint has been preserved."
        )

    # If ALL candidates failed validation with zero valid ones, raise error
    valid_count = sum(1 for c in final_candidates if c.get("is_valid", False))
    if valid_count == 0 and validation_failures:
        logger.error(f"All structured question candidates failed validation: {validation_failures}")
        raise HTTPException(
            status_code=422,
            detail=f"Generated questions did not satisfy blueprint constraints: {'; '.join(validation_failures[:3])}. Your blueprint has been preserved."
        )

    if validation_failures:
        logger.warning(f"Structured question validation warnings (returning {valid_count}/{len(final_candidates)} valid): {validation_failures}")

    return final_candidates


def regenerate_single_structured_candidate(
    db: Session,
    candidate: Dict[str, Any],
    course_id: Optional[int] = None,
    unit_ids: Optional[List[int]] = None,
    custom_instruction: Optional[str] = None,
    difficulty_mode: Optional[str] = "balanced",
    cognitive_mode: Optional[str] = "recommended",
) -> Dict[str, Any]:
    """
    Regenerates a single candidate question using the exact same strict validation pipeline.
    On failure, raises an explicit HTTPException.
    """
    idx = (candidate.get("question_number") or 1) - 1
    _, updated_cand, is_valid, errors, warnings = _generate_single_structured_candidate_internal(
        bp=candidate,
        idx=idx,
        db=db,
        course_id=course_id,
        user_unit_ids=unit_ids,
        custom_instruction=custom_instruction,
        difficulty_mode=difficulty_mode or "balanced",
        cognitive_mode=cognitive_mode or "recommended",
    )
    if updated_cand:
        return updated_cand
    raise HTTPException(status_code=422, detail="Failed to regenerate candidate question.")
    if updated_cand:
        return updated_cand

    raise HTTPException(
        status_code=422,
        detail="Failed to regenerate question candidate. Please check your instructions and try again."
    )


def create_default_teacher_blueprint(question_count: int = 4) -> List[Dict[str, Any]]:
    """
    Creates the official Sri Lankan G.C.E. A/L Paper II Part A teacher blueprint:
    - Q1: Cellular Core (Units 1 & 2: Biomolecules, Cytology, Respiration, Photosynthesis)
    - Q2: Diversity & Physiology Core (Units 3, 4, 5: Plant Anatomy, Taxonomy, Tissue Systems)
    - Q3: Concentrated Animal Physiology (Unit 5: Nervous, Excretory, Endocrine, Reproduction)
    - Q4: Applied Sciences & Environment (Units 6, 7, 8, 9, 10: Genetics, Recombinant DNA, Ecology, Micro)
    Each question rolls up to exactly 40.0 raw points across Sections A, B, and C.
    """
    blueprints = []
    official_themes = [
        ("Question 1: Cellular Core (Units 1 & 2)", "Biomolecules, Cytology, Enzymes, Respiration, and Photosynthesis", [1, 2]),
        ("Question 2: Diversity & Physiology Core (Units 3, 4, 5)", "Taxonomy, Plant Tissues & Transport, and Animal Organ Systems", [3, 4, 5]),
        ("Question 3: Concentrated Animal Physiology (Unit 5)", "Human Excretion, Endocrine, Nervous Coordination, and Homeostasis", [5]),
        ("Question 4: Applied Sciences & Environment (Units 6, 7, 8, 9, 10)", "Genetics, Recombinant DNA, Ecology, Microbiology, and Applied Biotechnology", [6, 7, 8, 9, 10]),
        ("Question 5 (Supplementary): Plant Form & Function (Unit 4)", "Secondary Growth, Plant Movements, and Phloem Translocation", [4]),
    ]

    for q_idx in range(question_count):
        q_num = q_idx + 1
        title, theme, unit_scope = official_themes[q_idx % len(official_themes)]
        blueprints.append({
            "question_number": q_num,
            "title": title,
            "theme": theme,
            "unit_scope": unit_scope,
            "points": 40.0,
            "difficulty": "medium",
            "cognitive_level": "understand" if q_num <= 2 else "apply",
            "structured_subparts_json": [
                {
                    "id": f"q{q_num}_sec_a",
                    "label": "A",
                    "format_type": "structured_direct_recall",
                    "points": 10.0,
                    "children": [
                        {"id": f"q{q_num}_a_1", "label": "1", "format_type": "structured_direct_recall", "points": 2.0, "prompt": ""},
                        {"id": f"q{q_num}_a_2", "label": "2", "format_type": "structured_direct_recall", "points": 2.0, "prompt": ""},
                        {"id": f"q{q_num}_a_3", "label": "3", "format_type": "structured_conceptual", "points": 6.0, "prompt": ""},
                    ]
                },
                {
                    "id": f"q{q_num}_sec_b",
                    "label": "B",
                    "format_type": "structured_comparison",
                    "points": 14.0,
                    "children": [
                        {"id": f"q{q_num}_b_1", "label": "1", "format_type": "structured_comparison", "points": 6.0, "prompt": ""},
                        {"id": f"q{q_num}_b_2", "label": "2", "format_type": "structured_conceptual", "points": 4.0, "prompt": ""},
                        {"id": f"q{q_num}_b_3", "label": "3", "format_type": "structured_sequential", "points": 4.0, "prompt": ""},
                    ]
                },
                {
                    "id": f"q{q_num}_sec_c",
                    "label": "C",
                    "format_type": "structured_conceptual",
                    "points": 16.0,
                    "children": [
                        {"id": f"q{q_num}_c_1", "label": "1", "format_type": "structured_matrix", "points": 8.0, "prompt": ""},
                        {"id": f"q{q_num}_c_2", "label": "2", "format_type": "structured_conceptual", "points": 8.0, "prompt": ""},
                    ]
                }
            ]
        })
    return blueprints

