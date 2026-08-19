"""
Lumora A/L Assessment Essay Question Generator & Validation Service.

Blueprint-driven AI generation and strict validation for Sri Lankan G.C.E. Advanced Level
Biology Paper II Part B Essay Questions (1 to 5 questions, typically 150 points or custom marks).
Supports 3 authentic G.C.E. A/L Essay structures:
  1. Single Complete Question (single_complete)
  2. Multi-Part Descriptive Subparts (multi_part)
  3. Short Notes Style (short_notes)

Enforces syllabus content grounding via RAG, itemized Answer Points with point allocation,
dedicated Marking Schemes, and optional Examiner Notes.
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

from app.models import Material
from app.services.gemini_service import gemini
from app.services.ai_generation_core import execute_central_ai_generation, raise_ai_generation_http_exception
from app.services.al_generator_service import normalize_scientific_notation
from app.utils.image_utils import process_and_save_diagram_url

logger = logging.getLogger(__name__)

# Informational G.C.E. A/L Biology Paper II Part B Essay Structures Guidance
AL_ESSAY_STRUCTURE_GUIDANCE = {
    "single_complete": {
        "title": "Monolithic Single-Prompt Complete Question (Typically Q6 - 150 Marks)",
        "description": "One overarching, broad, open-ended biological essay prompt without subdivisions, graded out of 150 marks (or full assigned marks).",
        "spec": (
            "Provide a comprehensive question stem requiring deep physiological, anatomical, or biochemical explanation. "
            "For a 150-mark question, generate 37–40 dense biological checkmark points (worth 4 marks each; 37 points = 148 marks + 2-mark buffer = 150 marks), "
            "expecting 400–600 words of compact factual sentences, plus a structured marking scheme with itemized points."
        ),
    },
    "multi_part": {
        "title": "Dual-Segment / Multi-Part Descriptive Subparts (Typically Q5, Q7, Q8, Q9 - 75/75 or 80/70 Marks)",
        "description": "Split cleanly into part (a) (Process Description) and part (b) (Structure/Homeostasis Explanation), each carrying 75 or 80 marks.",
        "spec": (
            "Provide context and linked subparts labeled (a) and (b) or Roman numerals (i), (ii). "
            "For each 75-mark segment, generate 18–20 precise factual checkmark points (worth 4 marks each), expecting 180–250 words per segment "
            "(with optional labeled diagram worth up to 5 marks for Part b), totaling 360–500 words for the full question."
        ),
    },
    "short_notes": {
        "title": "Short Notes Triplet (Always Locked to Question 10 - 3 × 50 Marks = 150 Marks)",
        "description": "An instruction followed by exactly three independent, unrelated biological sub-topics, each worth 50 marks.",
        "spec": (
            "Provide an instruction ('Write short notes on the following:') followed by 3 distinct biological topics labeled (a), (b), (c) or (i), (ii), (iii). "
            "For each 50-mark short note, generate 12–14 concise factual checkmark points (12 points × 4 marks = 48 + 2-mark buffer = 50 marks), "
            "expecting 120–180 words per note (360–540 words total across all 3 notes)."
        ),
    },
}

# Regex pattern to catch unwanted template leakages or placeholder text
PLACEHOLDER_LEAK_REGEX = re.compile(
    r"(single_complete|multi_part|short_notes|Describe the biological mechanisms and significance of|"
    r"primary biological concept|Insert essay prompt here|Add marking scheme here)",
    re.IGNORECASE
)


def normalize_essay_structure_format(fmt: Optional[str]) -> str:
    """Normalizes blueprint structure type strings to canonical single_complete, multi_part, or short_notes."""
    if not fmt:
        return "single_complete"
    cleaned = str(fmt).strip().lower()
    if cleaned in ("single_complete", "single", "single_essay", "single complete question"):
        return "single_complete"
    elif cleaned in ("multi_part", "multipart", "multi_part_descriptive", "multi-part descriptive subparts", "subparts"):
        return "multi_part"
    elif cleaned in ("short_notes", "shortnotes", "short_notes_style", "short notes style"):
        return "short_notes"
    return "single_complete"


def resolve_essay_question_domain_scope(
    idx: int,
    db: Session,
    course_id: Optional[int] = None,
    user_unit_ids: Optional[List[int]] = None
) -> Tuple[Optional[List[int]], str, List[str], str]:
    """
    Allocates canonical non-overlapping syllabus domains and retrieval keywords
    for each essay question E1..E4 to guarantee 100% curriculum diversity.
    """
    from app.models import Unit

    # If user explicitly selected specific unit IDs
    if user_unit_ids and len(user_unit_ids) > 0:
        assigned_id = user_unit_ids[idx % len(user_unit_ids)]
        u_obj = db.query(Unit).filter(Unit.id == assigned_id).first()
        u_title = u_obj.title if u_obj else f"Unit {assigned_id}"
        return [assigned_id], u_title, [], "multi_part"

    course_units = []
    if course_id:
        course_units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc()).all()
    if not course_units:
        course_units = db.query(Unit).order_by(Unit.order.asc()).all()

    total_units = len(course_units)

    # Canonical A/L Essay Domains:
    # Essay 1: Plant or Animal Physiology (Units 4 & 5)
    if idx == 0:
        target_units = [u for u in course_units if getattr(u, 'order', 0) in (4, 5)]
        domain = "Domain 1: Plant and Animal Physiology (Photosynthesis Light/Dark Reactions, Phloem Mass-Flow Translocation, Plant Water Potential and Casparian Strip, Human Cardiac Conduction Cycle, Respiratory Gas Transport, Synaptic Transmission, Endocrine Blood Glucose Regulation)"
        keywords = ["photosynthesis", "xylem", "phloem", "transpiration", "cardiac", "respiration", "synapse", "hormone", "insulin", "action potential"]
        preferred_structure = "single_complete"
    # Essay 2: Genetics, Molecular Biology & Cellular Biochemistry (Units 2 & 6)
    elif idx == 1:
        target_units = [u for u in course_units if getattr(u, 'order', 0) in (2, 6)]
        domain = "Domain 2: Genetics, Molecular Biology & Cellular Biochemistry (Enzyme Kinetics, Cellular Respiration & ATP Synthesis, DNA Replication, Protein Synthesis Translation, Recombinant DNA & PCR, Chromosomal Aberrations, Mendelian Dihybrid Linkage)"
        keywords = ["enzyme", "glycolysis", "krebs", "dna replication", "transcription", "translation", "mutation", "pcr", "recombinant dna", "protein"]
        preferred_structure = "multi_part"
    # Essay 3: Applied Microbiology, Environmental Biology, Biodiversity & Applied Biology (Units 3, 7, 8, 9, 10)
    elif idx == 2:
        target_units = [u for u in course_units if getattr(u, 'order', 0) in (3, 7, 8, 9, 10)]
        domain = "Domain 3: Applied Microbiology, Ecology, Biodiversity & Applied Biology (Nitrogen and Carbon Biogeochemical Cycles, Ecological Succession, Industrial Fermentation & Biogas, Activated Sludge Waste Treatment, In-situ and Ex-situ Biodiversity Conservation, Plant Tissue Culture)"
        keywords = ["nitrogen cycle", "succession", "fermentation", "microbiology", "biogas", "tissue culture", "conservation", "biodiversity", "ecosystem"]
        preferred_structure = "short_notes"
    # Essay 4: Comprehensive Multi-Topic Triplet Short Notes
    else:
        target_units = course_units
        domain = "Domain 4: Multi-Domain Triplet Short Notes (Three distinct topics from three non-overlapping syllabus units)"
        keywords = ["biomolecule", "photosystem", "hormone", "mutation", "microbiology", "ecology"]
        preferred_structure = "short_notes"

    target_ids = [u.id for u in target_units] if target_units else None
    return target_ids, domain, keywords, preferred_structure


def get_essay_rag_context(
    db: Session,
    course_id: Optional[int],
    unit_ids: Optional[List[int]],
    query_keywords: Optional[List[str]] = None
) -> Tuple[str, bool]:
    """
    Fetches real curriculum snippets from processed Materials for RAG injection.
    Delegates to unified LearningMaterialRetriever (Phase 9).
    Returns (context_text, has_rag_materials).
    """
    from app.services.al_rag_retriever import LearningMaterialRetriever
    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db,
        course_id=course_id,
        unit_ids=unit_ids,
        lesson_ids=None,
        material_ids=None,
        query_keywords=query_keywords,
        max_chunks=6,
        max_chars_total=4000,
    )
    return context_str, trace.get("has_rag_context", False)


def build_essay_blueprint_json_skeleton(blueprints: List[Dict[str, Any]]) -> str:
    """
    Constructs the exact JSON skeleton for Gemini to populate based on the teacher's Phase 5 essay blueprint.
    Preserves exact question order, question numbers, structure types, hierarchy, and clean marks.
    """
    skeleton_questions = []
    for q_idx, bp in enumerate(blueprints):
        q_num = bp.get("question_number", q_idx + 5)
        raw_structure = bp.get("structure_type") or bp.get("structure_format") or bp.get("structure") or "single_complete"
        structure_fmt = normalize_essay_structure_format(raw_structure)
        points = round(float(bp.get("marks", bp.get("points", 40.0))), 1)
        q_id = bp.get("id") or f"q_{structure_fmt}_{q_num}"

        if structure_fmt == "single_complete":
            # Itemized answer points totaling exactly `points` (standard 10 points for A/L single complete)
            item_count = bp.get("item_count") or 10
            pts_per_item = max(1.0, round(points / item_count, 1))
            remainder = round(points - (pts_per_item * (item_count - 1)), 1)

            skeleton_questions.append({
                "id": q_id,
                "order": bp.get("order", q_idx + 1),
                "question_number": q_num,
                "structure_type": "SINGLE_COMPLETE",
                "structure_format": "single_complete",
                "stem_text": "<Generate authentic, comprehensive A/L Biology essay prompt testing in-depth physiological, anatomical, or biochemical mechanisms>",
                "marks": points,
                "points": points,
                "answer_points": [
                    {
                        "id": f"pt_{q_num}_{i + 1}",
                        "item_number": i + 1,
                        "description": f"<Specific scientific biological fact / physiological mechanism step #{i + 1}>",
                        "marks": remainder if i == item_count - 1 else pts_per_item,
                        "accepted_alternatives": "<Optional scientific synonyms / acceptable wording>"
                    }
                    for i in range(item_count)
                ],
                "marking_scheme": f"<Detailed examiner marking criteria breaking down marks across the answer points to total exactly {points} marks>",
                "examiner_notes": "<Optional examiner tips on common student misconceptions or key scientific keywords>",
                "diagram_info": {
                    "requires_image": False,
                    "image_description": ""
                },
                "cognitive_level": bp.get("cognitive_level", "analyze"),
                "difficulty": bp.get("difficulty", "medium"),
                "children": []
            })

        elif structure_fmt == "multi_part":
            raw_children = bp.get("children") or bp.get("subparts") or []
            if not raw_children:
                sub_count = 3
                raw_children = [
                    {"id": f"sub_{q_num}_1", "order": 1, "marks": round(points * 0.25, 1), "label": "(i)"},
                    {"id": f"sub_{q_num}_2", "order": 2, "marks": round(points * 0.375, 1), "label": "(ii)"},
                    {"id": f"sub_{q_num}_3", "order": 3, "marks": round(points - round(points * 0.25, 1) - round(points * 0.375, 1), 1), "label": "(iii)"},
                ]

            skeleton_children = []
            if isinstance(raw_children, list):
                for s_idx, child in enumerate(raw_children):
                    if not isinstance(child, dict):
                        continue
                    c_lbl = str(child.get("label", f"({s_idx + 1})"))
                    raw_c_marks = child.get("marks") or child.get("max_points") or (points / max(1, len(raw_children)))
                    c_marks = round(float(raw_c_marks), 1)
                    c_id = str(child.get("id") or f"sub_{q_num}_{s_idx + 1}")
                    nested_raw = child.get("children", [])

                    if isinstance(nested_raw, list) and len(nested_raw) > 0:
                        nested_skeleton = []
                        for n_idx, n_child in enumerate(nested_raw):
                            if not isinstance(n_child, dict):
                                continue
                            n_lbl = str(n_child.get("label", f"({chr(97 + n_idx)})"))
                            raw_n_marks = n_child.get("marks") or (c_marks / max(1, len(nested_raw)))
                            n_marks = round(float(raw_n_marks), 1)
                            n_id = str(n_child.get("id") or f"nested_{q_num}_{s_idx + 1}_{n_idx + 1}")
                            nested_skeleton.append({
                                "id": n_id,
                                "order": n_child.get("order", n_idx + 1),
                                "label": n_lbl,
                                "prompt": f"{n_lbl} <Specific question prompt for nested part {n_lbl}>",
                                "marks": n_marks,
                                "max_points": n_marks,
                                "answer_points": [
                                    {
                                        "id": f"pt_{n_id}_1",
                                        "item_number": 1,
                                        "description": f"<Key biological fact / concept for {n_lbl}>",
                                        "marks": n_marks,
                                        "accepted_alternatives": ""
                                    }
                                ],
                                "marking_scheme": f"<Marking criteria for nested part {n_lbl} totaling {n_marks} marks>"
                            })
                        skeleton_children.append({
                            "id": c_id,
                            "order": child.get("order", s_idx + 1),
                            "label": c_lbl,
                            "prompt": f"{c_lbl} <Context/introductory prompt for part {c_lbl}>",
                            "marks": c_marks,
                            "max_points": c_marks,
                            "children": nested_skeleton,
                            "marking_scheme": f"<Marking summary for part {c_lbl}>"
                        })
                    else:
                        item_pts = max(1.0, round(c_marks / 3, 1))
                        item_cnt = max(2, min(6, int(c_marks / item_pts)))
                        last_pts = round(c_marks - (item_pts * (item_cnt - 1)), 1)
                        skeleton_children.append({
                            "id": c_id,
                            "order": child.get("order", s_idx + 1),
                            "label": c_lbl,
                            "prompt": f"{c_lbl} <Specific sub-question prompt for part {c_lbl}>",
                            "marks": c_marks,
                            "max_points": c_marks,
                            "answer_points": [
                                {
                                    "id": f"pt_{c_id}_{p + 1}",
                                    "item_number": p + 1,
                                    "description": f"<Biological fact #{p + 1} for part {c_lbl}>",
                                    "marks": last_pts if p == item_cnt - 1 else item_pts,
                                    "accepted_alternatives": ""
                                }
                                for p in range(item_cnt)
                            ],
                            "marking_scheme": f"<Marking scheme for subpart {c_lbl} totaling exactly {c_marks} marks>"
                        })

            skeleton_questions.append({
                "id": q_id,
                "order": bp.get("order", q_idx + 1),
                "question_number": q_num,
                "structure_type": "MULTI_PART",
                "structure_format": "multi_part",
                "stem_text": "<Provide introductory scenario / context for this multi-part question>",
                "marks": points,
                "points": points,
                "children": skeleton_children,
                "subparts": skeleton_children,
                "marking_scheme": f"<Overall marking scheme across all parts totaling {points} marks>",
                "examiner_notes": "<Examiner notes on partial credit allocation>",
                "diagram_info": {
                    "requires_image": False,
                    "image_description": ""
                },
                "cognitive_level": bp.get("cognitive_level", "analyze"),
                "difficulty": bp.get("difficulty", "medium"),
            })

        elif structure_fmt == "short_notes":
            raw_children = bp.get("children") or bp.get("subparts") or []
            if not raw_children:
                raw_children = [
                    {"id": f"topic_{q_num}_1", "order": 1, "marks": round(points / 3, 1), "label": "(a)"},
                    {"id": f"topic_{q_num}_2", "order": 2, "marks": round(points / 3, 1), "label": "(b)"},
                    {"id": f"topic_{q_num}_3", "order": 3, "marks": round(points - 2 * round(points / 3, 1), 1), "label": "(c)"},
                ]

            skeleton_topics = []
            if isinstance(raw_children, list):
                for t_idx, child in enumerate(raw_children):
                    if not isinstance(child, dict):
                        continue
                    t_lbl = str(child.get("label", f"({chr(97 + t_idx)})"))
                    raw_t_marks = child.get("marks") or child.get("max_points") or (points / max(1, len(raw_children)))
                    t_marks = round(float(raw_t_marks), 1)
                    t_id = str(child.get("id") or f"topic_{q_num}_{t_idx + 1}")

                    item_pts = max(1.0, round(t_marks / 3, 1))
                    item_cnt = max(2, min(5, int(t_marks / item_pts)))
                    last_pts = round(t_marks - (item_pts * (item_cnt - 1)), 1)

                    skeleton_topics.append({
                        "id": t_id,
                        "order": child.get("order", t_idx + 1),
                        "label": t_lbl,
                        "prompt": f"{t_lbl} <Specific biological topic name or concise concept to write short notes on>",
                        "marks": t_marks,
                        "max_points": t_marks,
                        "answer_points": [
                            {
                                "id": f"pt_{t_id}_{p + 1}",
                                "item_number": p + 1,
                                "description": f"<Concise biological fact #{p + 1} for {t_lbl}>",
                                "marks": last_pts if p == item_cnt - 1 else item_pts,
                                "accepted_alternatives": ""
                            }
                            for p in range(item_cnt)
                        ],
                        "marking_scheme": f"<Marking criteria for short note topic {t_lbl} totaling exactly {t_marks} marks>"
                    })

            has_parent = bp.get("has_parent_instruction", True)
            instruction_str = "Write short notes on the following:" if has_parent else ""

            skeleton_questions.append({
                "id": q_id,
                "order": bp.get("order", q_idx + 1),
                "question_number": q_num,
                "structure_type": "SHORT_NOTES",
                "structure_format": "short_notes",
                "instruction": instruction_str,
                "stem_text": instruction_str or "<Topic introduction>",
                "marks": points,
                "points": points,
                "has_parent_instruction": has_parent,
                "children": skeleton_topics,
                "subparts": skeleton_topics,
                "marking_scheme": f"<Synthesized marking scheme for all short note topics totaling exactly {points} marks>",
                "examiner_notes": "<Examiner notes on concise descriptions>",
                "diagram_info": {
                    "requires_image": False,
                    "image_description": ""
                },
                "cognitive_level": bp.get("cognitive_level", "understand"),
                "difficulty": bp.get("difficulty", "medium"),
            })

    return json.dumps({"questions": skeleton_questions}, indent=2)


ESSAY_POPULATION_PROMPT = """
You are a Senior Item Writer & Chief Examiner for the Sri Lankan G.C.E. Advanced Level Biology Examination Commission.
Your task is to populate the provided JSON skeleton with an authentic, scientifically rigorous Paper II Part B (Essay) question for Question {q_num}.

==================================================
MANDATORY SYLLABUS DOMAIN FOCUS FOR QUESTION {q_num}
==================================================
- Target Question: Essay Question {q_num}
- Assigned Domain: {assigned_domain}

==================================================
CURRICULUM CONTENT SCOPE & TEACHER INSTRUCTIONS
==================================================
Source Content Grounding for this Essay:
{rag_context}

Teacher Instructions & Focus:
{custom_instruction}

Difficulty Mode: {difficulty_mode}
Cognitive Mode: {cognitive_mode}

==================================================
CRITICAL ANTI-REPETITION & RIGOR RULES
==================================================
1. MANDATORY DOMAIN INTEGRITY: Question {q_num} MUST be authored strictly on {assigned_domain}.
2. ZERO REPETITION: DO NOT repeat topics covered in other essay questions. If this is Question {q_num}, ensure 100% thematic independence.
3. NEVER output generic placeholders like "Describe the biological mechanisms and significance of...".
   Write concrete, authentic Sri Lankan A/L essay questions with precise biological terms and deep scientific accuracy.
4. COMMAND VERB VARIETY: Use diverse and pedagogically appropriate command verbs:
   - Explain / Describe / Discuss / Compare / Evaluate / Analyse / Account for / Discuss the relationship between
5. STRICT STRUCTURAL FIDELITY (DO NOT CHANGE BLUEPRINT HIERARCHY):
   - You MUST follow the exact structure format requested for each question.
   - For 'SINGLE_COMPLETE' / 'single_complete': Generate a detailed, topic-specific essay prompt, 6 to 12 itemized answer points totaling the assigned marks, and a comprehensive marking scheme.
   - For 'MULTI_PART' / 'multi_part': Generate a context premise stem, linked subparts labeled with Roman numerals (i), (ii), (iii)... and optional nested parts (a), (b)... with specific prompts, answer points, and individual marking schemes.
   - For 'SHORT_NOTES' / 'short_notes': Generate the instruction 'Write short notes on the following:' and specific distinct biological topics labeled (i), (ii), (iii)... or (a), (b), (c)..., each with specific answer points and marking criteria.
   - DO NOT add extra subquestions, DO NOT remove subquestions, DO NOT merge subquestions, and DO NOT change the marks.
4. EXACT MARK ALLOCATION:
   - The marks assigned to leaf answer points MUST equal the exact node marks in the skeleton.
   - Every answer point must have a realistic scientific description (e.g. "Light strikes P680 chlorophyll a molecules in Photosystem II, exciting electrons to a higher energy state.").
5. DEDICATED MARKING SCHEME:
   - Provide a structured marking breakdown explaining how marks are awarded by examiners.
6. TABULAR COMPARISONS (WHERE APPLICABLE):
   - If a question requires a comparison, provide a structured markdown table with proper headers and rows.
7. DIAGRAM / REFERENCE REQUIREMENTS:
   - If an anatomical diagram, experimental setup, or pathway is genuinely required, set "requires_image": true and provide a detailed "image_description". Do NOT generate fake URLs.
8. Return ONLY a valid JSON object matching the skeleton. Do not wrap in conversational text.

==================================================
JSON SKELETON TO POPULATE
==================================================
{skeleton_json}
"""


def sanitize_ai_json(raw_text: str) -> str:
    """
    Removes markdown code fences and cleans up raw AI JSON response.
    """
    text = raw_text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def calculate_jaccard_similarity(text1: str, text2: str) -> float:
    """Computes word-level Jaccard similarity between two text snippets."""
    words1 = set(re.findall(r"\w+", text1.lower()))
    words2 = set(re.findall(r"\w+", text2.lower()))
    if not words1 or not words2:
        return 0.0
    intersection = words1.intersection(words2)
    union = words1.union(words2)
    return len(intersection) / len(union)


def check_essay_duplicate_prompts(candidates: List[Dict[str, Any]]) -> List[str]:
    """
    Checks for duplicate or near-duplicate essay stems / subpart prompts.
    Returns a list of warning messages.
    """
    warnings = []
    prompts = []

    for c in candidates:
        stem = (c.get("stem_text") or "").strip()
        if stem and stem.lower() != "write short notes on the following:":
            prompts.append((c.get("question_number", 0), stem))
        for sub in c.get("subparts", []):
            sp = (sub.get("prompt") or "").strip()
            if sp:
                prompts.append((c.get("question_number", 0), sp))

    for i in range(len(prompts)):
        for j in range(i + 1, len(prompts)):
            q_i, p_i = prompts[i]
            q_j, p_j = prompts[j]
            sim = calculate_jaccard_similarity(p_i, p_j)
            if sim > 0.75:
                warnings.append(f"High similarity ({int(sim * 100)}%) detected between Q{q_i} and Q{q_j}: '{p_i[:40]}...' vs '{p_j[:40]}...'")

    return warnings


def reconcile_leaf_answer_point_marks(answer_points: List[Dict[str, Any]], target_marks: float) -> List[Dict[str, Any]]:
    """
    Reconciles answer point marks deterministically so their sum strictly equals target_marks.
    """
    if not answer_points or target_marks <= 0:
        return answer_points

    current_sum = sum(float(p.get("marks", 0.0)) for p in answer_points)
    if abs(current_sum - target_marks) < 0.001:
        return answer_points

    # Proportional scaling
    count = len(answer_points)
    pts_per_item = max(0.5, round(target_marks / count, 1))
    allocated = 0.0

    for i, p in enumerate(answer_points):
        if i == count - 1:
            p["marks"] = round(target_marks - allocated, 1)
        else:
            p["marks"] = pts_per_item
            allocated += pts_per_item

    return answer_points


def parse_and_validate_essay_candidates(raw_data: Any, blueprints: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Parses dict/list/JSON from Gemini and validates essay questions, ensuring strict schema & mark integrity.
    """
    data: Dict[str, Any] = {}
    if isinstance(raw_data, dict):
        data = raw_data
    elif isinstance(raw_data, list):
        data = {"questions": raw_data}
    elif isinstance(raw_data, str):
        cleaned = sanitize_ai_json(raw_data)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.warning(f"Initial JSON parse failed: {e}. Attempting regex extraction.")
            match = re.search(r"(\{[\s\S]*\})", cleaned)
            if match:
                try:
                    data = json.loads(match.group(1))
                except Exception:
                    data = {}
    else:
        data = {}

    raw_questions = data.get("questions", [])
    if not isinstance(raw_questions, list) or len(raw_questions) == 0:
        if isinstance(data, list):
            raw_questions = data
        elif "question_number" in data:
            raw_questions = [data]
        else:
            raise HTTPException(
                status_code=502,
                detail="Generation completed, but Lumora could not validate the AI response. Your configuration has been preserved, so you can safely retry."
            )

    candidates = []
    for idx, bp in enumerate(blueprints):
        q_num = bp.get("question_number", idx + 5)
        raw_structure = bp.get("structure_type") or bp.get("structure_format") or bp.get("structure") or "single_complete"
        structure_fmt = normalize_essay_structure_format(raw_structure)
        blueprint_marks = round(float(bp.get("marks") or bp.get("points") or 40.0), 1)
        q_id = bp.get("id") or f"q_{structure_fmt}_{q_num}"

        q_data = raw_questions[idx] if (isinstance(raw_questions, list) and idx < len(raw_questions) and isinstance(raw_questions[idx], dict)) else {}

        stem_text = normalize_scientific_notation(q_data.get("stem_text", "")).strip()
        instruction = q_data.get("instruction", "Write short notes on the following:")
        if structure_fmt == "short_notes" and not stem_text:
            stem_text = instruction

        if not stem_text:
            stem_text = f"Discuss the biological mechanisms and physiological principles governing the specified A/L topic."

        # Process Answer Points (For single complete)
        answer_points = []
        raw_pts = q_data.get("answer_points", [])
        if isinstance(raw_pts, list):
            for p_idx, p in enumerate(raw_pts):
                if isinstance(p, dict):
                    desc = normalize_scientific_notation(p.get("description", "")).strip()
                    if desc:
                        p_m = round(float(p.get("marks") or p.get("points") or 5.0), 1)
                        answer_points.append({
                            "id": p.get("id") or f"pt_{q_num}_{p_idx + 1}",
                            "item_number": p.get("item_number", p_idx + 1),
                            "description": desc,
                            "marks": p_m,
                            "accepted_alternatives": p.get("accepted_alternatives", "")
                        })

        if structure_fmt == "single_complete":
            if not answer_points:
                # Provide standard itemized points totaling blueprint_marks
                item_count = 8
                pts_ea = max(1.0, round(blueprint_marks / item_count, 1))
                answer_points = [
                    {
                        "id": f"pt_{q_num}_{i + 1}",
                        "item_number": i + 1,
                        "description": f"Key scientific biological concept point #{i + 1}",
                        "marks": pts_ea if i < item_count - 1 else round(blueprint_marks - (pts_ea * (item_count - 1)), 1),
                        "accepted_alternatives": ""
                    }
                    for i in range(item_count)
                ]
            else:
                answer_points = reconcile_leaf_answer_point_marks(answer_points, blueprint_marks)

        # Process Subparts (For multi_part and short_notes)
        subparts = []
        raw_subs = q_data.get("children") or q_data.get("subparts") or []
        bp_children = bp.get("children") or bp.get("subparts") or []

        # If AI didn't provide subparts or fewer subparts than blueprint, align with blueprint children
        sub_count = max(len(bp_children) if isinstance(bp_children, list) else 0, len(raw_subs) if isinstance(raw_subs, list) else 0)
        sub_count = max(1, sub_count)

        for s_idx in range(sub_count):
            bp_child = bp_children[s_idx] if (isinstance(bp_children, list) and s_idx < len(bp_children) and isinstance(bp_children[s_idx], dict)) else {}
            s_data = raw_subs[s_idx] if (isinstance(raw_subs, list) and s_idx < len(raw_subs) and isinstance(raw_subs[s_idx], dict)) else {}

            s_id = bp_child.get("id") or s_data.get("id") or f"sub_{q_num}_{s_idx + 1}"
            s_label = bp_child.get("label") or s_data.get("label", f"({s_idx + 1})")
            raw_s_pts = bp_child.get("marks") or bp_child.get("max_points") or (blueprint_marks / sub_count)
            s_target_marks = round(float(raw_s_pts), 1)
            s_prompt = normalize_scientific_notation(s_data.get("prompt", "")).strip()
            if not s_prompt:
                s_prompt = f"{s_label} Explain the biological mechanisms and significance of the specified topic."

            # Check for nested children
            nested_raw = s_data.get("children") or bp_child.get("children") or []
            nested_subparts = []

            if isinstance(nested_raw, list) and len(nested_raw) > 0:
                for n_idx, n_data in enumerate(nested_raw):
                    if not isinstance(n_data, dict):
                        continue
                    bp_nested_list = bp_child.get("children", [])
                    bp_nested = bp_nested_list[n_idx] if (isinstance(bp_nested_list, list) and n_idx < len(bp_nested_list) and isinstance(bp_nested_list[n_idx], dict)) else {}
                    n_id = bp_nested.get("id") or n_data.get("id") or f"nested_{s_id}_{n_idx + 1}"
                    n_label = bp_nested.get("label") or n_data.get("label", f"({chr(97 + n_idx)})")
                    raw_n_pts = bp_nested.get("marks") or n_data.get("marks") or (s_target_marks / max(1, len(nested_raw)))
                    n_marks = round(float(raw_n_pts), 1)
                    n_prompt = normalize_scientific_notation(n_data.get("prompt", "")).strip() or f"{n_label} Specific sub-item prompt."
                    n_scheme = n_data.get("marking_scheme", "")

                    n_ans_pts = []
                    raw_n_ans = n_data.get("answer_points", [])
                    if isinstance(raw_n_ans, list):
                        for np_idx, np_p in enumerate(raw_n_ans):
                            if isinstance(np_p, dict):
                                np_desc = normalize_scientific_notation(np_p.get("description", "")).strip()
                                if np_desc:
                                    np_m = round(float(np_p.get("marks") or n_marks), 1)
                                    n_ans_pts.append({
                                        "id": np_p.get("id") or f"pt_{n_id}_{np_idx + 1}",
                                        "item_number": np_p.get("item_number", np_idx + 1),
                                        "description": np_desc,
                                        "marks": np_m,
                                        "accepted_alternatives": np_p.get("accepted_alternatives", "")
                                    })
                    if not n_ans_pts:
                        n_ans_pts = [{
                            "id": f"pt_{n_id}_1",
                            "item_number": 1,
                            "description": f"Key biological concept for {n_label}",
                            "marks": n_marks,
                            "accepted_alternatives": ""
                        }]
                    else:
                        n_ans_pts = reconcile_leaf_answer_point_marks(n_ans_pts, n_marks)

                    nested_subparts.append({
                        "id": n_id,
                        "order": n_idx + 1,
                        "label": n_label,
                        "prompt": n_prompt,
                        "marks": n_marks,
                        "max_points": n_marks,
                        "answer_points": n_ans_pts,
                        "marking_scheme": n_scheme
                    })

                subparts.append({
                    "id": s_id,
                    "order": s_idx + 1,
                    "label": s_label,
                    "prompt": s_prompt,
                    "marks": s_target_marks,
                    "max_points": s_target_marks,
                    "children": nested_subparts,
                    "subparts": nested_subparts,
                    "marking_scheme": s_data.get("marking_scheme", "")
                })
            else:
                # Leaf subpart
                s_ans_pts = []
                raw_s_ans = s_data.get("answer_points", [])
                if isinstance(raw_s_ans, list):
                    for sp_idx, sp_p in enumerate(raw_s_ans):
                        if isinstance(sp_p, dict):
                            sp_desc = normalize_scientific_notation(sp_p.get("description", "")).strip()
                            if sp_desc:
                                sp_m = round(float(sp_p.get("marks") or 5.0), 1)
                                s_ans_pts.append({
                                    "id": sp_p.get("id") or f"pt_{s_id}_{sp_idx + 1}",
                                    "item_number": sp_p.get("item_number", sp_idx + 1),
                                    "description": sp_desc,
                                    "marks": sp_m,
                                    "accepted_alternatives": sp_p.get("accepted_alternatives", "")
                                })
                if not s_ans_pts:
                    pts_ea = max(1.0, round(s_target_marks / 3, 1))
                    s_ans_pts = [
                        {
                            "id": f"pt_{s_id}_{p + 1}",
                            "item_number": p + 1,
                            "description": f"Biological fact #{p + 1} for part {s_label}",
                            "marks": pts_ea if p < 2 else round(s_target_marks - (pts_ea * 2), 1),
                            "accepted_alternatives": ""
                        }
                        for p in range(3)
                    ]
                else:
                    s_ans_pts = reconcile_leaf_answer_point_marks(s_ans_pts, s_target_marks)

                subparts.append({
                    "id": s_id,
                    "order": s_idx + 1,
                    "label": s_label,
                    "prompt": s_prompt,
                    "marks": s_target_marks,
                    "max_points": s_target_marks,
                    "answer_points": s_ans_pts,
                    "marking_scheme": s_data.get("marking_scheme", "")
                })

        # Diagram info
        diag_info = q_data.get("diagram_info", {})
        requires_image = bool(diag_info.get("requires_image", False) or q_data.get("requires_image", False))
        image_description = diag_info.get("image_description") or q_data.get("image_description", "")

        marking_scheme = q_data.get("marking_scheme", "")
        examiner_notes = q_data.get("examiner_notes", "")

        candidate_obj = {
            "id": q_id,
            "candidate_id": str(uuid.uuid4())[:8],
            "question_number": q_num,
            "template_type": "essay_rubric",
            "structure_type": structure_fmt.upper(),
            "structure_format": structure_fmt,
            "stem_text": stem_text,
            "instruction": instruction if structure_fmt == "short_notes" else "",
            "marks": blueprint_marks,
            "points": blueprint_marks,
            "answer_points": answer_points,
            "subparts": subparts,
            "children": subparts,
            "marking_scheme": marking_scheme,
            "examiner_notes": examiner_notes,
            "requires_image": requires_image,
            "image_description": image_description if requires_image else None,
            "diagram_url": None,
            "cognitive_level": q_data.get("cognitive_level", bp.get("cognitive_level", "analyze")),
            "difficulty": q_data.get("difficulty", bp.get("difficulty", "medium")),
            "status": "needs_image" if (requires_image and not q_data.get("diagram_url")) else "ready",
            "is_valid": True,
            "validation_errors": [],
            "validation_warnings": [],
        }

        # Validation Checks
        warn_list: List[str] = []
        if PLACEHOLDER_LEAK_REGEX.search(stem_text):
            warn_list.append("Potential placeholder text detected in essay stem.")
        candidate_obj["validation_warnings"] = warn_list

        candidates.append(candidate_obj)

    # Perform Duplicate Prompt Detection Across All Candidates
    dup_warnings = check_essay_duplicate_prompts(candidates)
    if dup_warnings:
        for c in candidates:
            c["validation_warnings"].extend(dup_warnings)

    return candidates


def _generate_single_essay_candidate_internal(
    bp: Dict[str, Any],
    idx: int,
    db: Session,  # kept for signature compat but NOT used — each thread gets its own session
    course_id: Optional[int],
    user_unit_ids: Optional[List[int]],
    custom_instruction: Optional[str],
    difficulty_mode: str,
    cognitive_mode: str,
) -> Tuple[int, Dict[str, Any]]:
    """
    Generates and validates a single essay candidate question from its blueprint.
    Guarantees dedicated domain scope and unit-specific RAG retrieval per essay.

    IMPORTANT: Creates its own DB session to avoid thread-safety issues
    with SQLAlchemy sessions shared across ThreadPoolExecutor workers.
    """
    from app.database import SessionLocal
    thread_db = SessionLocal()
    try:
        assigned_unit_ids, assigned_domain, keywords, preferred_struct = resolve_essay_question_domain_scope(
            idx=idx, db=thread_db, course_id=course_id, user_unit_ids=user_unit_ids
        )

        rag_context, has_rag = get_essay_rag_context(
            db=thread_db, course_id=course_id, unit_ids=assigned_unit_ids, query_keywords=keywords
        )

        q_num = bp.get("question_number") or (idx + 5)
        skeleton_json = build_essay_blueprint_json_skeleton([bp])
        prompt = ESSAY_POPULATION_PROMPT.format(
            q_num=q_num,
            assigned_domain=assigned_domain,
            rag_context=rag_context[:6000] if rag_context else "Ground in the Sri Lankan G.C.E. Advanced Level Biology Resource Books.",
            custom_instruction=custom_instruction.strip() if custom_instruction else f"Author strictly for: {assigned_domain}.",
            difficulty_mode=difficulty_mode,
            cognitive_mode=cognitive_mode,
            skeleton_json=skeleton_json,
        )

        gen_res = execute_central_ai_generation(
            prompt=prompt,
            generation_type="ESSAY",
            requested_count=1,
            model_tier="flash",
            temperature=0.25,
            max_tokens=4096,
        )

        if not gen_res.success or not gen_res.data:
            # Retry once if transient and not rate-limited
            if gen_res.status != "rate_limited":
                logger.warning(f"Single essay candidate Q{q_num} failed on attempt 1. Retrying...")
                gen_res = execute_central_ai_generation(
                    prompt=prompt,
                    generation_type="ESSAY",
                    requested_count=1,
                    model_tier="flash",
                    temperature=0.3,
                    max_tokens=4096,
                )

        if not gen_res.success or not gen_res.data:
            raise_ai_generation_http_exception(gen_res)

        candidates = parse_and_validate_essay_candidates(gen_res.data, [bp])
        if not candidates or len(candidates) == 0:
            raise HTTPException(
                status_code=502,
                detail="Generation completed, but Lumora could not validate the AI response for this essay question."
            )

        cand = candidates[0]
        cand["has_rag_context"] = has_rag
        cand["domain"] = assigned_domain
        cand["provenance"] = "Generated via Lumora AI grounded in Sri Lankan A/L Biology curriculum"
        return (idx, cand)
    finally:
        thread_db.close()


def generate_essay_candidate_questions(
    db: Session,
    question_count: int = 3,
    course_id: Optional[int] = None,
    unit_ids: Optional[List[int]] = None,
    custom_instruction: Optional[str] = None,
    custom_blueprints: Optional[List[Dict[str, Any]]] = None,
    difficulty_mode: str = "balanced",
    cognitive_mode: str = "recommended",
) -> List[Dict[str, Any]]:
    """
    Generates authentic Sri Lankan A/L Biology Essay Questions matching teacher's finalized Phase 5 blueprint.
    Consumes blueprint directly and processes questions concurrently for speed and zero truncation.
    """
    question_count = max(1, min(5, question_count))

    # Prepare blueprints
    if not custom_blueprints or len(custom_blueprints) == 0:
        blueprints = []
        formats = ["single_complete", "multi_part", "short_notes"]
        for i in range(question_count):
            fmt = formats[i % len(formats)]
            blueprints.append({
                "id": f"q_auto_{i + 1}",
                "order": i + 1,
                "question_number": i + 5,
                "structure_type": fmt.upper(),
                "structure_format": fmt,
                "marks": 40.0,
                "points": 40.0,
                "cognitive_level": "analyze" if fmt != "short_notes" else "understand",
                "difficulty": "medium",
            })
    else:
        # Handle either list of questions or wrapped blueprint object
        if isinstance(custom_blueprints, dict) and "questions" in custom_blueprints:
            blueprints = custom_blueprints["questions"][:question_count]
        else:
            blueprints = custom_blueprints[:question_count]

        for i, bp in enumerate(blueprints):
            if "question_number" not in bp:
                bp["question_number"] = i + 5
            if "structure_format" not in bp:
                bp["structure_format"] = bp.get("structure_type") or bp.get("structure", "single_complete")
            if "marks" not in bp and "points" not in bp:
                bp["marks"] = 40.0
                bp["points"] = 40.0

    # Concurrently generate each essay question with dedicated domain allocation
    validated_candidates: List[Optional[Dict[str, Any]]] = [None] * len(blueprints)
    failures = []
    http_exceptions: List[HTTPException] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(blueprints))) as executor:
        future_map = {
            executor.submit(
                _generate_single_essay_candidate_internal,
                bp=bp,
                idx=i,
                db=db,
                course_id=course_id,
                user_unit_ids=unit_ids,
                custom_instruction=custom_instruction,
                difficulty_mode=difficulty_mode,
                cognitive_mode=cognitive_mode,
            ): i
            for i, bp in enumerate(blueprints)
        }
        for future in concurrent.futures.as_completed(future_map):
            idx = future_map[future]
            try:
                i, cand = future.result()
                validated_candidates[idx] = cand
            except HTTPException as he:
                logger.error(f"HTTPException generating essay candidate {idx+1}: {he.detail}")
                http_exceptions.append(he)
                failures.append(str(he.detail))
            except Exception as e:
                logger.error(f"Error generating essay candidate {idx+1}: {e}")
                failures.append(str(e))

    final_candidates: List[Dict[str, Any]] = [c for c in validated_candidates if c is not None]
    if not final_candidates:
        if http_exceptions:
            raise http_exceptions[0]
        raise HTTPException(
            status_code=502,
            detail=f"Essay generation failed: {'; '.join(failures[:2]) if failures else 'Unknown error'}. Your blueprint has been preserved."
        )

    return final_candidates


def regenerate_single_essay_candidate(
    db: Session,
    candidate: Dict[str, Any],
    course_id: Optional[int] = None,
    unit_ids: Optional[List[int]] = None,
    custom_instruction: Optional[str] = None,
    difficulty_mode: Optional[str] = "balanced",
    cognitive_mode: Optional[str] = "recommended",
) -> Dict[str, Any]:
    """
    Regenerates a single essay question candidate based on teacher feedback while strictly preserving
    the exact blueprint structure and marks.
    """
    raw_structure = candidate.get("structure_type") or candidate.get("structure_format") or candidate.get("structure") or "single_complete"
    structure_fmt = normalize_essay_structure_format(raw_structure)
    points = round(float(candidate.get("marks", candidate.get("points", 40.0))), 1)
    q_num = candidate.get("question_number", 5)

    bp = {
        "id": candidate.get("id") or f"q_{structure_fmt}_{q_num}",
        "order": candidate.get("order", 1),
        "question_number": q_num,
        "structure_type": structure_fmt.upper(),
        "structure_format": structure_fmt,
        "marks": points,
        "points": points,
        "cognitive_level": candidate.get("cognitive_level", "analyze"),
        "difficulty": candidate.get("difficulty", "medium"),
        "children": candidate.get("children") or candidate.get("subparts") or [],
        "subparts": candidate.get("children") or candidate.get("subparts") or [],
        "has_parent_instruction": candidate.get("has_parent_instruction", True),
    }

    idx = q_num - 5 if q_num >= 5 else 0
    assigned_unit_ids, assigned_domain, keywords, _ = resolve_essay_question_domain_scope(
        idx=idx, db=db, course_id=course_id, user_unit_ids=unit_ids
    )

    rag_context, has_rag = get_essay_rag_context(
        db=db, course_id=course_id, unit_ids=assigned_unit_ids, query_keywords=keywords
    )
    skeleton_json = build_essay_blueprint_json_skeleton([bp])

    prompt = f"""
You are a Senior Item Writer for the Sri Lankan G.C.E. Advanced Level Biology Examination Commission.
Regenerate this single Paper II Part B Essay Question with improved scientific depth, clear marking points, and accurate criteria.

==================================================
PREVIOUS VERSION TO IMPROVE
==================================================
{json.dumps(candidate, indent=2)}

Teacher Feedback & Instructions:
{custom_instruction or "Improve biological rigor and clarity of marking points."}

CURRICULUM CONTEXT:
{rag_context}

Return a single JSON object with the "questions" array containing exactly 1 improved essay question matching the skeleton:
{skeleton_json}
"""

    gen_res = execute_central_ai_generation(
        prompt=prompt,
        generation_type="ESSAY",
        requested_count=1,
        model_tier="flash",
        temperature=0.3,
        max_tokens=4096,
    )

    if not gen_res.success or not gen_res.data:
        raise_ai_generation_http_exception(gen_res)

    candidates = parse_and_validate_essay_candidates(gen_res.data, [bp])
    if candidates and len(candidates) > 0:
        candidates[0]["candidate_id"] = candidate.get("candidate_id") or str(uuid.uuid4())[:8]
        candidates[0]["has_rag_context"] = has_rag
        return candidates[0]

    raise HTTPException(status_code=502, detail="Failed to regenerate essay candidate.")
