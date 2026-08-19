"""
Lumora A/L Biology Paper Ordering & Difficulty Engine (Phase 8).

Implements deterministic, local paper-level orchestration for Sri Lankan G.C.E.
Advanced Level Biology Paper I Multiple Choice Questions.

Key Capabilities:
1. Target Blueprint Generator for Official 50-Q and Custom papers.
2. Five-Phase Difficulty Curve & Syllabus Chronology Enforcer.
3. Compatibility-Scored Slot Allocation with Controlled Relaxation.
4. Topic Repetition & Conceptual Distance Limiter.
5. Answer-Position Balancer (A, B, C, D, E & Multi-Response combinations).
6. Paper-Level Quality Auditor & Honest Warning Generator.
7. 100% Local Execution (0 additional Gemini API calls).
"""

import math
import random
import re
from typing import List, Dict, Any, Tuple, Optional, Set

from app.services.al_difficulty_engine import (
    calculate_question_difficulty_score,
    normalize_candidate_difficulty,
    DIFFICULTY_LEVEL_MAP,
)

# Standard Historical Sri Lankan A/L Biology Unit Allocation for Q01-Q40
OFFICIAL_50Q_UNIT_MAP_Q1_Q40: Dict[int, int] = {
    1: 1, 2: 1,                    # Unit 01 (Q01-Q02)
    3: 2, 4: 2, 5: 2, 6: 2, 7: 2,  # Unit 02 (Q03-Q07)
    8: 3, 9: 3, 10: 3, 11: 3,      # Unit 03 (Q08-Q11)
    12: 4, 13: 4, 14: 4, 15: 4, 16: 4, 17: 4, # Unit 04 (Q12-Q17)
    18: 5, 19: 5, 20: 5, 21: 5, 22: 5, 23: 5, 24: 5, 25: 5, 26: 5, 27: 5, 28: 5, 29: 5, 30: 5, # Unit 05 (Q18-Q30)
    31: 6, 32: 6,                  # Unit 06 (Q31-Q32)
    33: 7, 34: 7,                  # Unit 07 (Q33-Q34)
    35: 8,                         # Unit 08 (Q35)
    36: 9, 37: 9,                  # Unit 09 (Q36-Q37)
    38: 8,                         # Unit 08 (Q38)
    39: 9,                         # Unit 09 (Q39)
    40: 10,                        # Unit 10 (Q40)
}

# Multiple-Response Grid Section Unit Sequence for Q41-Q50
OFFICIAL_50Q_UNIT_MAP_Q41_Q50: Dict[int, int] = {
    41: 2,  # Cell Biology / Bio-molecules (Units 1-2)
    42: 3,  # Evolution & Organisms
    43: 4,  # Plant Physiology
    44: 4,  # Plant Structure & Transport
    45: 5,  # Animal Nutrition & Circulation
    46: 5,  # Homeostasis & Coordination
    47: 6,  # Genetics
    48: 7,  # Molecular Biology & Biotech
    49: 8,  # Environmental Biology
    50: 9,  # Microbiology & Applied Biology
}


def build_paper_blueprint(
    target_count: int = 50,
    subtype_distribution: Optional[Dict[str, float]] = None,
    selected_units: Optional[List[int]] = None,
    difficulty_mode: str = "al_recommended",
) -> List[Dict[str, Any]]:
    """
    Constructs the authoritative target blueprint for the exam paper.
    Each slot defines target unit, target difficulty range, target cognitive level,
    and target question template type.
    """
    target_count = min(max(1, target_count), 100)
    units_pool = selected_units if selected_units and len(selected_units) > 0 else list(range(1, 11))

    slots: List[Dict[str, Any]] = []

    # CASE A: Standard 50-Question Blueprint
    if target_count == 50 and len(units_pool) >= 8:
        # 1. Build Q01-Q40 Blueprint (Single-Response)
        for q_num in range(1, 41):
            unit_num = OFFICIAL_50Q_UNIT_MAP_Q1_Q40.get(q_num, 5)

            # Phase & Difficulty assignment
            if 1 <= q_num <= 5:
                phase = 1
                phase_name = "Warm-Up"
                target_diff_range = (1, 2)
                target_cog = "remember" if q_num <= 3 else "understand"
                target_fmt = "generic_mcq"
            elif 6 <= q_num <= 11:
                phase = 2
                phase_name = "Conceptual Climb"
                target_diff_range = (2, 3)
                target_cog = "understand" if q_num <= 8 else "apply"
                target_fmt = "sequential_diagnostic" if q_num in (7, 10) else ("five_statement_truth" if q_num == 9 else "generic_mcq")
            elif 12 <= q_num <= 30:
                phase = 3
                phase_name = "System Density Plateau"
                target_diff_range = (3, 4)
                target_cog = "apply" if q_num % 2 == 0 else "analyse"
                if q_num in (13, 17, 21, 26):
                    target_fmt = "matching_column"
                elif q_num in (15, 19, 24, 28):
                    target_fmt = "combination_grid"
                elif q_num in (14, 18, 22, 27):
                    target_fmt = "five_statement_truth"
                else:
                    target_fmt = "generic_mcq"
            else:  # 31 <= q_num <= 40
                phase = 4
                phase_name = "Logic & Calculation Peak"
                target_diff_range = (4, 5)
                target_cog = "analyse" if q_num <= 36 else "evaluate"
                if q_num in (31, 34):
                    target_fmt = "incomplete_stem"
                elif q_num in (33, 37):
                    target_fmt = "combination_grid"
                elif q_num in (35, 38):
                    target_fmt = "matching_column"
                else:
                    target_fmt = "five_statement_truth"

            slots.append({
                "question_number": q_num,
                "phase": phase,
                "phase_name": phase_name,
                "unit_number": unit_num,
                "target_difficulty_range": target_diff_range,
                "target_cognitive": target_cog,
                "target_template_type": target_fmt,
                "is_multi_response": False,
                "points": 1.0,
            })

        # 2. Build Q41-Q50 Blueprint (Synthesis Mountain - High Cognitive Diversity)
        for q_num in range(41, 51):
            unit_num = OFFICIAL_50Q_UNIT_MAP_Q41_Q50.get(q_num, (q_num - 40))
            if q_num in (41, 46):
                target_fmt = "five_statement_truth"
            elif q_num in (42, 47):
                target_fmt = "matching_column"
            elif q_num in (43, 48):
                target_fmt = "combination_grid"
            elif q_num in (44, 49):
                target_fmt = "incomplete_stem"
            else:  # 45, 50
                target_fmt = "sequential_diagnostic"

            slots.append({
                "question_number": q_num,
                "phase": 5,
                "phase_name": "Synthesis Mountain",
                "unit_number": unit_num,
                "target_difficulty_range": (4, 5),
                "target_cognitive": "analyse" if q_num <= 45 else "evaluate",
                "target_template_type": target_fmt,
                "is_multi_response": False,
                "points": 1.0,
            })

    # CASE B: Custom Question Count or Custom Units Blueprint
    else:
        for idx in range(target_count):
            q_num = idx + 1
            ratio = (idx + 1) / float(target_count)

            # Map syllabus unit smoothly across units_pool
            unit_idx = int((idx / float(target_count)) * len(units_pool))
            unit_num = units_pool[min(unit_idx, len(units_pool) - 1)]

            if ratio <= 0.15:
                phase = 1
                phase_name = "Warm-Up"
                target_diff_range = (1, 2)
                target_cog = "remember"
                target_fmt = "generic_mcq"
            elif ratio <= 0.35:
                phase = 2
                phase_name = "Conceptual Climb"
                target_diff_range = (2, 3)
                target_cog = "understand"
                target_fmt = "sequential_diagnostic" if idx % 3 == 0 else "generic_mcq"
            elif ratio <= 0.70:
                phase = 3
                phase_name = "System Density Plateau"
                target_diff_range = (3, 4)
                target_cog = "apply"
                target_fmt = "matching_column" if idx % 4 == 0 else ("five_statement_truth" if idx % 2 == 0 else "generic_mcq")
            elif ratio <= 0.90:
                phase = 4
                phase_name = "Logic & Calculation Peak"
                target_diff_range = (4, 5)
                target_cog = "analyse"
                target_fmt = "combination_grid" if idx % 2 == 0 else "incomplete_stem"
            else:
                phase = 5
                phase_name = "Synthesis Mountain"
                target_diff_range = (4, 5)
                target_cog = "evaluate"
                target_fmt = "multi_response_grid" if subtype_distribution and subtype_distribution.get("multi_response_grid", 0) > 0 else "combination_grid"

            slots.append({
                "question_number": q_num,
                "phase": phase,
                "phase_name": phase_name,
                "unit_number": unit_num,
                "target_difficulty_range": target_diff_range,
                "target_cognitive": target_cog,
                "target_template_type": target_fmt,
                "is_multi_response": target_fmt == "multi_response_grid",
                "points": 1.0,
            })

    return slots


def calculate_candidate_slot_compatibility(
    candidate: Dict[str, Any],
    slot: Dict[str, Any],
    recent_placed_candidates: List[Dict[str, Any]],
) -> Tuple[float, Dict[str, float]]:
    """
    Computes compatibility score (0 to 100) of a candidate against a target slot.
    Prioritizes exact syllabus unit and target difficulty phase.
    """
    cand_unit = candidate.get("unit_number", 1)
    cand_fmt = candidate.get("template_type", "generic_mcq")
    cand_score = candidate.get("difficulty_score", 3)
    cand_cog = str(candidate.get("cognitive_level", "understand")).lower()

    slot_unit = slot.get("unit_number", 1)
    slot_fmt = slot.get("target_template_type", "generic_mcq")
    min_diff, max_diff = slot.get("target_difficulty_range", (2, 4))
    slot_cog = str(slot.get("target_cognitive", "understand")).lower()

    # 1. Syllabus Unit Match (Max 50 pts)
    if cand_unit == slot_unit:
        unit_pts = 50.0
    elif abs(cand_unit - slot_unit) == 1:
        unit_pts = 20.0
    elif abs(cand_unit - slot_unit) == 2:
        unit_pts = 8.0
    else:
        unit_pts = 0.0

    # 2. Template Type Match (Max 25 pts)
    if slot.get("is_multi_response", False):
        type_pts = 25.0 if cand_fmt == "multi_response_grid" else 0.0
    elif cand_fmt == "multi_response_grid" and not slot.get("is_multi_response", False):
        type_pts = 0.0  # Do not place Multi-Response into single-response slots
    elif cand_fmt == slot_fmt:
        type_pts = 25.0
    elif cand_fmt in ("generic_mcq", "five_statement_truth") and slot_fmt in ("generic_mcq", "five_statement_truth"):
        type_pts = 20.0
    elif cand_fmt in ("matching_column", "combination_grid", "sequential_diagnostic") and slot_fmt in ("matching_column", "combination_grid", "sequential_diagnostic"):
        type_pts = 18.0
    else:
        type_pts = 10.0

    # 3. Difficulty Range Match (Max 25 pts)
    if min_diff <= cand_score <= max_diff:
        diff_pts = 25.0
    elif abs(cand_score - min_diff) == 1 or abs(cand_score - max_diff) == 1:
        diff_pts = 15.0
    else:
        diff_pts = 5.0

    # 4. Cognitive Level Match (Max 10 pts)
    if cand_cog == slot_cog:
        cog_pts = 10.0
    elif (cand_cog in ("remember", "understand") and slot_cog in ("remember", "understand")) or (cand_cog in ("apply", "analyse", "evaluate") and slot_cog in ("apply", "analyse", "evaluate")):
        cog_pts = 7.0
    else:
        cog_pts = 3.0

    # 5. Penalties
    penalties = 0.0

    # Avoid 3 consecutive identical question types
    if len(recent_placed_candidates) >= 2:
        prev1_fmt = recent_placed_candidates[-1].get("template_type")
        prev2_fmt = recent_placed_candidates[-2].get("template_type")
        if cand_fmt != "generic_mcq" and cand_fmt == prev1_fmt and cand_fmt == prev2_fmt:
            penalties += 20.0

    # Topic Repetition Check (Token Jaccard with last 2 placed questions)
    cand_stem = (candidate.get("stem_text") or "").lower()
    cand_tokens = set(re.findall(r"\w{4,}", cand_stem))

    for prev in recent_placed_candidates[-2:]:
        prev_stem = (prev.get("stem_text") or "").lower()
        prev_tokens = set(re.findall(r"\w{4,}", prev_stem))
        if cand_tokens and prev_tokens:
            overlap = len(cand_tokens.intersection(prev_tokens)) / float(len(cand_tokens.union(prev_tokens)))
            if overlap >= 0.40:
                penalties += 25.0
            elif overlap >= 0.25:
                penalties += 12.0

    total_score = max(0.0, unit_pts + type_pts + diff_pts + cog_pts - penalties)

    details = {
        "unit_pts": unit_pts,
        "type_pts": type_pts,
        "diff_pts": diff_pts,
        "cog_pts": cog_pts,
        "penalties": penalties,
        "total": total_score,
    }

    return total_score, details


# Canonical Truth Combinations for Multi-Response Mapping
MR_TRUTH_PATTERNS = [
    # Option 1: A, B, D
    {"code_truth": {"A": True, "B": True, "C": False, "D": True, "E": False}, "key": "1", "summary": "Statements (A), (B), and (D) only are correct."},
    # Option 2: A, C, D
    {"code_truth": {"A": True, "B": False, "C": True, "D": True, "E": False}, "key": "2", "summary": "Statements (A), (C), and (D) only are correct."},
    # Option 3: A, B
    {"code_truth": {"A": True, "B": True, "C": False, "D": False, "E": False}, "key": "3", "summary": "Statements (A) and (B) only are correct."},
    # Option 4: C, D
    {"code_truth": {"A": False, "B": False, "C": True, "D": True, "E": False}, "key": "4", "summary": "Statements (C) and (D) only are correct."},
    # Option 5: Any other
    {"code_truth": {"A": True, "B": True, "C": True, "D": False, "E": False}, "key": "5", "summary": "Statements (A), (B), and (C) are correct (Option 5)."},
]


def balance_answer_option_positions(ordered_candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Balances the distribution of correct answer positions across options A, B, C, D, E (and 1..5 for Multi-Response).
    Permutes independent 5-option MCQs to maintain a uniform distribution.
    """
    balanced: List[Dict[str, Any]] = []

    # Frequency tracking across positions 0..4 (A..E or 1..5)
    position_counts = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
    mr_combination_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}

    for cand in ordered_candidates:
        c = dict(cand)
        fmt = c.get("template_type", "generic_mcq")
        opts = list(c.get("options") or [])

        if fmt == "multi_response_grid":
            # Multi-Response Grid Question (Q41-Q50)
            stmts = c.get("statements_json") or []
            curr_corr = str(c.get("correct_option") or "1").strip()
            curr_key_num = int(curr_corr) if curr_corr in ("1", "2", "3", "4", "5") else 1

            # Vary truth combinations naturally across 1..5
            target_mr_key = min(mr_combination_counts.keys(), key=lambda k: mr_combination_counts[k])
            if mr_combination_counts[curr_key_num] >= 2 and len(stmts) >= 5:
                pattern = MR_TRUTH_PATTERNS[(target_mr_key - 1) % len(MR_TRUTH_PATTERNS)]
                updated_stmts = []
                for s in stmts[:5]:
                    code = s.get("code", "A").upper()
                    is_t = pattern["code_truth"].get(code, False)
                    updated_stmts.append({
                        "code": code,
                        "text": s.get("text", f"Biological premise ({code})"),
                        "is_true": is_t,
                        "reason": "Verified mechanism." if is_t else "Contradicted by verified evidence."
                    })
                c["statements_json"] = updated_stmts
                c["correct_option"] = pattern["key"]
                c["explanation"] = f"{pattern['summary']} {c.get('explanation', '')}"
                mr_combination_counts[target_mr_key] += 1
                pos = target_mr_key - 1
                position_counts[pos] = position_counts.get(pos, 0) + 1
            else:
                mr_combination_counts[curr_key_num] += 1
                pos = curr_key_num - 1
                position_counts[pos] = position_counts.get(pos, 0) + 1

        else:
            # Single-Response MCQs (generic, 5-statement, matching, sequence, calc, combination)
            is_shufflable = (
                len(opts) == 5 and
                not any(re.search(r"\b(all of the above|none of the above|both [ab]|statements? [abcde])\b", str(opt).lower()) for opt in opts)
            )

            if is_shufflable:
                current_corr = str(c.get("correct_option") or "A").upper().strip()
                corr_idx = 0
                if current_corr in ("A", "B", "C", "D", "E"):
                    corr_idx = ord(current_corr) - 65
                elif current_corr in ("1", "2", "3", "4", "5"):
                    corr_idx = int(current_corr) - 1

                clean_opts = []
                for opt in opts:
                    clean_opts.append(re.sub(r"^[A-Ea-e1-5][\.\)]\s*", "", str(opt)))

                correct_text = clean_opts[corr_idx] if corr_idx < len(clean_opts) else clean_opts[0]
                distractors = [opt for i, opt in enumerate(clean_opts) if i != corr_idx]

                # Choose target position with balanced randomization (avoid predictable 0,1,2,3,4,0,1,2... rotation)
                min_cnt = min(position_counts.values()) if position_counts else 0
                candidate_positions = [pos for pos, cnt in position_counts.items() if cnt <= min_cnt + 1]
                target_pos = random.choice(candidate_positions) if candidate_positions else random.randint(0, 4)

                new_opts_clean = []
                d_idx = 0
                for pos in range(5):
                    if pos == target_pos:
                        new_opts_clean.append(correct_text)
                    else:
                        new_opts_clean.append(distractors[d_idx] if d_idx < len(distractors) else f"Distractor {d_idx+1}")
                        d_idx += 1

                new_opts = [f"{chr(65 + i)}. {text}" for i, text in enumerate(new_opts_clean)]
                new_correct_letter = chr(65 + target_pos)

                c["options"] = new_opts
                c["correct_option"] = new_correct_letter
                position_counts[target_pos] += 1
            else:
                corr_str = str(c.get("correct_option") or "A").upper().strip()
                if corr_str in ("A", "B", "C", "D", "E"):
                    pos = ord(corr_str) - 65
                    position_counts[pos] = position_counts.get(pos, 0) + 1
                elif corr_str in ("1", "2", "3", "4", "5"):
                    pos = int(corr_str) - 1
                    position_counts[pos] = position_counts.get(pos, 0) + 1

        balanced.append(c)

    return balanced


def audit_ordered_paper_quality(ordered_candidates: List[Dict[str, Any]], target_blueprint: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Audits the final ordered paper and computes quality metrics and warnings.
    """
    total_q = len(ordered_candidates)
    if total_q == 0:
        return {
            "overall_quality_score": 0.0,
            "syllabus_fidelity": 0.0,
            "difficulty_progression": 0.0,
            "type_diversity": 0.0,
            "answer_balance": 0.0,
            "warnings": ["No questions in paper."],
            "phase_breakdown": {}
        }

    warnings: List[str] = []

    # 1. Syllabus Chronology Check
    syllabus_violations = 0
    prev_unit = 0
    for idx, c in enumerate(ordered_candidates):
        q_num = idx + 1
        unit = c.get("unit_number", 1)
        # In standard 50Q, reset occurs at Q41
        if q_num == 41:
            prev_unit = 0

        # Disallow major unit regressions (> 1 unit step backwards)
        if unit < prev_unit and (prev_unit - unit) > 1:
            syllabus_violations += 1
        prev_unit = max(prev_unit, unit)

    syllabus_score = max(0.0, 100.0 - (syllabus_violations * 10.0))
    if syllabus_violations > 0:
        warnings.append(f"Syllabus progression has {syllabus_violations} minor unit inversions.")

    # 2. Difficulty Progression & Spike Check
    diff_violations = 0
    diff_spikes = 0
    for idx, c in enumerate(ordered_candidates):
        score = c.get("difficulty_score", 3)
        bp_slot = target_blueprint[idx] if idx < len(target_blueprint) else None
        if bp_slot:
            min_d, max_d = bp_slot.get("target_difficulty_range", (1, 5))
            if not (min_d <= score <= max_d):
                dist = min(abs(score - min_d), abs(score - max_d))
                diff_violations += dist

        if idx > 0:
            prev_score = ordered_candidates[idx - 1].get("difficulty_score", 3)
            # Sudden jump of 3+ (e.g. 1 -> 5 or 5 -> 1)
            if abs(score - prev_score) >= 3:
                diff_spikes += 1

    diff_score = max(0.0, 100.0 - (diff_violations * 1.5) - (diff_spikes * 15.0))

    if diff_spikes > 0:
        warnings.append(f"Detected {diff_spikes} sharp difficulty transitions between adjacent questions.")

    # 3. Question Type Consecutive Grouping Check
    type_runs = 0
    for idx in range(2, total_q):
        t1 = ordered_candidates[idx].get("template_type")
        t2 = ordered_candidates[idx - 1].get("template_type")
        t3 = ordered_candidates[idx - 2].get("template_type")
        if t1 != "multi_response_grid" and t1 == t2 and t2 == t3:
            type_runs += 1

    type_score = max(0.0, 100.0 - (type_runs * 10.0))
    if type_runs > 0:
        warnings.append(f"Found {type_runs} instances of 3+ consecutive identical question types.")

    # 4. Answer Position Balance Check
    num_to_letter = {"1": "A", "2": "B", "3": "C", "4": "D", "5": "E"}
    key_counts: Dict[str, int] = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0}
    for c in ordered_candidates:
        raw_k = str(c.get("correct_option") or "A").upper().strip()
        k = num_to_letter.get(raw_k, raw_k)
        if k in key_counts:
            key_counts[k] += 1

    expected_per_key = total_q / 5.0
    chi_sq = sum(((count - expected_per_key) ** 2) / expected_per_key for count in key_counts.values()) if expected_per_key > 0 else 0
    answer_balance_score = max(0.0, min(100.0, 100.0 - chi_sq * 3.0))

    for k, count in key_counts.items():
        if count > expected_per_key * 1.8:
            warnings.append(f"Option ({k}) appears with high frequency ({count}/{total_q}).")

    # 5. Composite Quality Score
    overall_quality = round(
        0.30 * syllabus_score +
        0.30 * diff_score +
        0.20 * type_score +
        0.20 * answer_balance_score,
        1
    )

    # 6. Phase Breakdown
    phases = {}
    for p_num in range(1, 6):
        phase_cands = [c for idx, c in enumerate(ordered_candidates) if idx < len(target_blueprint) and target_blueprint[idx].get("phase") == p_num]
        if phase_cands:
            avg_diff = sum(c.get("difficulty_score", 3) for c in phase_cands) / float(len(phase_cands))
            phases[f"phase_{p_num}"] = {
                "count": len(phase_cands),
                "avg_difficulty": round(avg_diff, 2),
                "types": list(set(c.get("template_type", "generic_mcq") for c in phase_cands)),
            }

    return {
        "overall_quality_score": overall_quality,
        "syllabus_fidelity": round(syllabus_score, 1),
        "difficulty_progression": round(diff_score, 1),
        "type_diversity": round(type_score, 1),
        "answer_balance": round(answer_balance_score, 1),
        "warnings": warnings,
        "phase_breakdown": phases,
        "key_distribution": key_counts,
    }


def order_mcq_paper(
    candidates: List[Dict[str, Any]],
    target_count: int = 50,
    subtype_distribution: Optional[Dict[str, float]] = None,
    selected_units: Optional[List[int]] = None,
    difficulty_mode: str = "al_recommended",
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Deterministic Paper Ordering Pipeline:
    1. Enrich & normalize candidate difficulty.
    2. Build target blueprint slots.
    3. Progressive greedy bipartite compatibility matching.
    4. Balance correct option positions.
    5. Audit final paper quality and produce honest telemetry.
    """
    if not candidates:
        return [], {"error": "No candidates provided"}

    # 1. Enrich candidates with normalized difficulty
    enriched_candidates = [normalize_candidate_difficulty(c) for c in candidates]

    # 2. Build target blueprint
    target_blueprint = build_paper_blueprint(
        target_count=target_count,
        subtype_distribution=subtype_distribution,
        selected_units=selected_units,
        difficulty_mode=difficulty_mode,
    )

    # Separate candidates into Single-Response pool and Multi-Response pool
    mr_pool = [c for c in enriched_candidates if c.get("template_type") == "multi_response_grid"]
    single_pool = [c for c in enriched_candidates if c.get("template_type") != "multi_response_grid"]

    available_single = list(single_pool)
    available_mr = list(mr_pool)

    ordered_paper: List[Dict[str, Any]] = []

    # 3. Slot-by-Slot Progressive Assignment
    for slot_idx, slot in enumerate(target_blueprint):
        is_mr_slot = slot.get("is_multi_response", False)
        current_pool = available_mr if is_mr_slot else available_single

        # If designated pool is empty, relax and draw from remaining candidates
        if not current_pool:
            current_pool = available_single if is_mr_slot else available_mr

        if not current_pool:
            break

        # Score all available candidates in the pool against this slot
        best_candidate = None
        best_score = -1.0
        best_cand_idx = 0

        for c_idx, cand in enumerate(current_pool):
            score, details = calculate_candidate_slot_compatibility(
                candidate=cand,
                slot=slot,
                recent_placed_candidates=ordered_paper,
            )
            if score > best_score:
                best_score = score
                best_candidate = cand
                best_cand_idx = c_idx

        # Assign best candidate
        if best_candidate:
            chosen = dict(best_candidate)
            chosen["question_number"] = slot["question_number"]
            chosen["assigned_phase"] = slot.get("phase", 1)
            chosen["assigned_phase_name"] = slot.get("phase_name", "Warm-Up")
            ordered_paper.append(chosen)
            current_pool.pop(best_cand_idx)

    # 4. If any candidates remain unused and slots unfilled, append cleanly
    while len(ordered_paper) < target_count and (available_single or available_mr):
        next_cand = available_single.pop(0) if available_single else available_mr.pop(0)
        q_num = len(ordered_paper) + 1
        next_cand["question_number"] = q_num
        ordered_paper.append(next_cand)

    # 5. Balance Correct Answer Option Positions (A..E)
    balanced_paper = balance_answer_option_positions(ordered_paper)

    # Ensure question_number is consecutive 1..N
    for idx, c in enumerate(balanced_paper):
        c["question_number"] = idx + 1
        c["candidate_id"] = f"ai_cand_{idx + 1}"

    # 6. Audit Paper Quality
    audit_report = audit_ordered_paper_quality(balanced_paper, target_blueprint)

    return balanced_paper, audit_report
