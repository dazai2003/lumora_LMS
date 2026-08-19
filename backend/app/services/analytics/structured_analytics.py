"""
Structured Question Hierarchy Analysis Engine for Paper II-A.
Recursively traverses Question -> Part -> Roman -> Alphabetical subparts to calculate loss rates and average marks.
"""
from typing import List, Dict, Any, Optional
import statistics
from app.services.analytics.data_contracts import (
    StructuredSubpartMetric, StructuredQuestionMetric, StructuredExamAnalyticsReport
)
from app.services.analytics.normalization import safe_div, safe_percentage


def _get_clean_academic_label(node: Dict[str, Any], depth: int, index: int, parent_prefix: str = "") -> str:
    """
    Generates a clean, academic label for structured subparts instead of internal UUIDs.
    e.g. 'Part A — Nephron Structure', 'Part B (i) — Ultrafiltration Mechanism'.
    """
    explicit_label = str(node.get("display_label") or node.get("label") or node.get("part_label") or "").strip()
    
    # If explicit label exists and is not an internal node identifier, use it
    if explicit_label and not explicit_label.startswith("node_") and not explicit_label.startswith("part_node_") and not explicit_label.startswith("sub_"):
        return explicit_label
        
    prompt_text = str(node.get("prompt") or node.get("prompt_text") or node.get("stem") or "").strip()
    prompt_snippet = (prompt_text[:40] + "...") if len(prompt_text) > 40 else prompt_text
    
    if depth == 0:
        part_letter = chr(65 + (index % 26)) # A, B, C, D...
        if prompt_snippet:
            return f"Part {part_letter} — {prompt_snippet}"
        return f"Part {part_letter}"
    elif depth == 1:
        roman_numerals = ["(i)", "(ii)", "(iii)", "(iv)", "(v)", "(vi)", "(vii)", "(viii)"]
        roman = roman_numerals[index % len(roman_numerals)]
        if prompt_snippet:
            return f"{roman} {prompt_snippet}"
        return f"Subpart {roman}"
    else:
        alpha_sub = ["(a)", "(b)", "(c)", "(d)", "(e)"]
        alpha = alpha_sub[index % len(alpha_sub)]
        if prompt_snippet:
            return f"{alpha} {prompt_snippet}"
        return f"Section {alpha}"


def _traverse_subpart_node(
    node: Dict[str, Any],
    parent_path: str,
    answers_list: List[Any],
    total_q_points: float,
    depth: int = 0,
    index: int = 0
) -> StructuredSubpartMetric:
    """
    Recursively evaluates a structured subpart node and its nested children.
    """
    node_raw_id = str(node.get("id") or node.get("part") or f"sub_{depth}_{index}").strip()
    node_id = f"{parent_path}.{node_raw_id}" if parent_path else node_raw_id
    
    display_label = _get_clean_academic_label(node, depth, index, parent_path)
    prompt_text = str(node.get("prompt_text") or node.get("prompt") or node.get("stem") or "")
    
    # Extract points
    max_pts = float(node.get("max_points") or node.get("points") or node.get("marks") or 0.0)
    expected_kw = node.get("expected_keywords") or node.get("keywords") or []
    
    # Analyze student performance on this node
    total_attempts = len(answers_list)
    awarded_points_list: List[float] = []
    
    for ans in answers_list:
        sub_scores = {}
        # 1. Try to read from teacher_checklist_results_json or ai_checklist_results_json
        chk = getattr(ans, "teacher_checklist_results_json", None) or getattr(ans, "ai_checklist_results_json", None) or {}
        if isinstance(chk, dict):
            raw_scores = chk.get("subpart_scores") or chk.get("scores") or []
            if isinstance(raw_scores, list):
                for item in raw_scores:
                    if isinstance(item, dict):
                        p_label = str(item.get("subpart") or item.get("label") or item.get("part") or item.get("id") or "").lower().strip()
                        if p_label and (p_label == node_raw_id.lower() or p_label in node_id.lower()):
                            sub_scores[node_raw_id] = float(item.get("awarded_score") or item.get("score") or 0.0)
            elif isinstance(raw_scores, dict):
                for k, v in raw_scores.items():
                    if str(k).lower() == node_raw_id.lower() or str(k).lower() in node_id.lower():
                        sub_scores[node_raw_id] = float(v)
                        
        # 2. If subpart score found, use it; otherwise, calculate proportional share from total final_score
        if node_raw_id in sub_scores:
            awarded_points_list.append(sub_scores[node_raw_id])
        else:
            sub_ans_dict = getattr(ans, "subpart_answers_json", None) or {}
            # Check if student attempted this specific subpart or the question overall
            is_attempted = False
            if isinstance(sub_ans_dict, dict):
                if node_raw_id in sub_ans_dict or any(node_raw_id.lower() in str(k).lower() for k in sub_ans_dict.keys()):
                    is_attempted = True
                elif len(sub_ans_dict) > 0:
                    is_attempted = True # Whole question attempted
            
            final_sc = float(getattr(ans, "final_score", 0.0) or getattr(ans, "teacher_score", 0.0) or getattr(ans, "ai_score", 0.0) or 0.0)
            
            if is_attempted and total_q_points > 0 and max_pts > 0:
                proportional_pts = round((final_sc / total_q_points) * max_pts, 2)
                awarded_points_list.append(min(max_pts, max(0.0, proportional_pts)))
            elif total_attempts > 0:
                awarded_points_list.append(0.0)
                
    avg_awarded = round(statistics.mean(awarded_points_list), 2) if awarded_points_list else None
    pct_achieved = safe_percentage(avg_awarded, max_pts, default=None) if (avg_awarded is not None and max_pts > 0) else None
    loss_rate = round(100.0 - pct_achieved, 2) if pct_achieved is not None else None
    successful_cnt = sum(1 for pts in awarded_points_list if pts >= (max_pts * 0.5))
    
    # Process nested children
    children_metrics: List[StructuredSubpartMetric] = []
    raw_children = node.get("children") or node.get("subparts") or []
    if isinstance(raw_children, list):
        for c_idx, child_node in enumerate(raw_children):
            if isinstance(child_node, dict):
                child_metric = _traverse_subpart_node(
                    child_node,
                    node_id,
                    answers_list,
                    total_q_points=total_q_points,
                    depth=depth + 1,
                    index=c_idx
                )
                children_metrics.append(child_metric)
                
    # If this parent node has children but points was 0, sum points from children
    if children_metrics and max_pts == 0.0:
        max_pts = sum(c.maximum_points for c in children_metrics)
        if any(c.awarded_points_avg is not None for c in children_metrics):
            avg_awarded = round(sum(c.awarded_points_avg or 0.0 for c in children_metrics), 2)
            pct_achieved = safe_percentage(avg_awarded, max_pts, default=None)
            loss_rate = round(100.0 - pct_achieved, 2) if pct_achieved is not None else None
            
    return StructuredSubpartMetric(
        node_id=node_id,
        display_label=display_label,
        part_type="subpart" if depth > 0 else "part",
        prompt_text=prompt_text,
        expected_keywords=expected_kw,
        maximum_points=max_pts,
        awarded_points_avg=avg_awarded,
        percentage_achieved=pct_achieved,
        loss_rate_percentage=loss_rate,
        total_attempts=total_attempts,
        successful_attempts=successful_cnt,
        children=children_metrics
    )


def compute_structured_question_metrics(
    question: Any, # ALQuestion
    answers_list: List[Any] # List of ALStudentAnswer
) -> StructuredQuestionMetric:
    """
    Computes hierarchical subpart metrics for a single Paper II-A structured question.
    """
    q_id = question.id
    q_num = question.question_number or 0
    stem_text = question.stem_text or ""
    stem_summary = stem_text[:120] + ("..." if len(stem_text) > 120 else "")
    total_pts = float(question.points or 40.0)
    
    total_attempts = len(answers_list)
    scores = [float(getattr(a, "final_score", 0.0) or getattr(a, "teacher_score", 0.0) or getattr(a, "ai_score", 0.0) or 0.0) for a in answers_list]
    avg_score = round(statistics.mean(scores), 2) if scores else None
    avg_pct = safe_percentage(avg_score, total_pts, default=None)
    
    hierarchy: List[StructuredSubpartMetric] = []
    raw_subparts = question.structured_subparts_json or []
    
    if isinstance(raw_subparts, list):
        for idx, node in enumerate(raw_subparts):
            if isinstance(node, dict):
                node_metric = _traverse_subpart_node(
                    node,
                    f"Q{q_num}",
                    answers_list,
                    total_q_points=total_pts,
                    depth=0,
                    index=idx
                )
                hierarchy.append(node_metric)
                
    return StructuredQuestionMetric(
        question_id=q_id,
        question_number=q_num,
        stem_summary=stem_summary,
        total_points=total_pts,
        total_attempts=total_attempts,
        average_score=avg_score,
        average_percentage=avg_pct,
        hierarchy=hierarchy
    )


def compute_structured_exam_report(
    exam: Any,
    questions: List[Any],
    submissions: List[Any],
    answers: List[Any]
) -> StructuredExamAnalyticsReport:
    """
    Generates a full assessment-level hierarchical report for Paper II-A Structured exams.
    """
    total_submissions = len(submissions)
    valid_scores = [float(s.percentage or 0.0) for s in submissions if s.percentage is not None]
    avg_score = round(statistics.mean([float(s.scaled_score or 0.0) for s in submissions]), 2) if submissions else None
    avg_pct = round(statistics.mean(valid_scores), 2) if valid_scores else None
    
    answers_by_question: Dict[int, List[Any]] = {}
    for a in answers:
        answers_by_question.setdefault(a.question_id, []).append(a)
        
    question_metrics: List[StructuredQuestionMetric] = []
    all_leaf_subparts: List[Dict[str, Any]] = []
    
    for q in sorted(questions, key=lambda x: x.question_number or 0):
        q_ans = answers_by_question.get(q.id, [])
        qm = compute_structured_question_metrics(q, q_ans)
        question_metrics.append(qm)
        
        # Flatten leaf subparts for class loss ranking
        def collect_leaves(nodes: List[StructuredSubpartMetric]):
            for n in nodes:
                if not n.children:
                    if n.loss_rate_percentage is not None and n.total_attempts > 0:
                        all_leaf_subparts.append({
                            "node_id": n.node_id,
                            "display_label": n.display_label,
                            "maximum_points": n.maximum_points,
                            "awarded_points_avg": n.awarded_points_avg,
                            "percentage_achieved": n.percentage_achieved,
                            "loss_rate_percentage": n.loss_rate_percentage,
                            "total_attempts": n.total_attempts,
                        })
                else:
                    collect_leaves(n.children)
                    
        collect_leaves(qm.hierarchy)
        
    # Sort subparts descending by loss rate
    loss_ranking = sorted(all_leaf_subparts, key=lambda x: x["loss_rate_percentage"] or 0.0, reverse=True)
    
    return StructuredExamAnalyticsReport(
        exam_id=exam.id,
        exam_title=exam.title,
        total_questions=len(questions),
        total_submissions=total_submissions,
        average_score=avg_score,
        average_percentage=avg_pct,
        subpart_loss_ranking=loss_ranking[:10],
        questions=question_metrics
    )
