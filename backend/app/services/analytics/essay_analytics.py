"""
Essay Rubric and Criteria Analysis Engine for Paper II-B.
Measures omission frequency and success percentage across marking criteria.
"""
from typing import List, Dict, Any, Optional, Union
import statistics
from app.services.analytics.data_contracts import (
    EssayCriterionMetric, EssayQuestionMetric, EssayExamAnalyticsReport
)
from app.services.analytics.normalization import safe_div, safe_percentage


def _extract_criteria_definitions(raw_checklist: Any, q_num: int) -> List[Dict[str, Any]]:
    """
    Extracts a flattened list of rubric criterion definitions from any supported checklist format.
    Supports list of dicts/strings, dict with 'subparts', dict with 'answer_points', or dict with 'criteria'.
    """
    criteria_defs: List[Dict[str, Any]] = []
    
    if isinstance(raw_checklist, list):
        for idx, item in enumerate(raw_checklist, start=1):
            if isinstance(item, dict):
                item_no = item.get("item_number") or item.get("number") or idx
                c_text = str(item.get("description") or item.get("criterion") or item.get("text") or f"Criterion {item_no}")
                pts = float(item.get("marks") or item.get("points") or item.get("max_points") or 4.0)
                criteria_defs.append({
                    "criterion_id": f"Q{q_num}_C{item_no}",
                    "item_number": item_no,
                    "criterion_text": c_text,
                    "max_points": pts
                })
            elif isinstance(item, str):
                criteria_defs.append({
                    "criterion_id": f"Q{q_num}_C{idx}",
                    "item_number": idx,
                    "criterion_text": item,
                    "max_points": 4.0
                })
    elif isinstance(raw_checklist, dict):
        # 1. Check if 'subparts' list exists (e.g. Exam 213 multi-part essay)
        subparts = raw_checklist.get("subparts") or []
        if isinstance(subparts, list) and len(subparts) > 0:
            c_counter = 1
            for sp in subparts:
                if isinstance(sp, dict):
                    sp_label = str(sp.get("label") or f"Subpart {c_counter}")
                    sp_prompt = str(sp.get("prompt") or "")
                    pts_list = sp.get("answer_points") or sp.get("marking_points") or sp.get("criteria") or []
                    
                    if isinstance(pts_list, list) and len(pts_list) > 0:
                        for pt in pts_list:
                            if isinstance(pt, dict):
                                desc = str(pt.get("description") or pt.get("criterion") or pt.get("text") or f"Criterion {c_counter}")
                                pt_marks = float(pt.get("marks") or pt.get("points") or pt.get("max_points") or 4.0)
                                criteria_defs.append({
                                    "criterion_id": f"Q{q_num}_C{c_counter}",
                                    "item_number": c_counter,
                                    "criterion_text": f"{sp_label} — {desc}" if not desc.startswith(sp_label) else desc,
                                    "max_points": pt_marks
                                })
                                c_counter += 1
                    else:
                        # Subpart itself acts as criterion
                        sp_marks = float(sp.get("marks") or sp.get("max_points") or sp.get("points") or 10.0)
                        criteria_defs.append({
                            "criterion_id": f"Q{q_num}_C{c_counter}",
                            "item_number": c_counter,
                            "criterion_text": f"{sp_label} {sp_prompt}".strip(),
                            "max_points": sp_marks
                        })
                        c_counter += 1
        
        # 2. Check top-level answer_points or criteria if subparts not present
        if not criteria_defs:
            direct_pts = raw_checklist.get("answer_points") or raw_checklist.get("criteria") or raw_checklist.get("marking_points") or []
            if isinstance(direct_pts, list):
                for idx, pt in enumerate(direct_pts, start=1):
                    if isinstance(pt, dict):
                        item_no = pt.get("item_number") or pt.get("number") or idx
                        desc = str(pt.get("description") or pt.get("criterion") or pt.get("text") or f"Criterion {item_no}")
                        pt_marks = float(pt.get("marks") or pt.get("points") or pt.get("max_points") or 4.0)
                        criteria_defs.append({
                            "criterion_id": f"Q{q_num}_C{item_no}",
                            "item_number": item_no,
                            "criterion_text": desc,
                            "max_points": pt_marks
                        })

    return criteria_defs


def compute_essay_question_metrics(
    question: Any, # ALQuestion
    answers_list: List[Any] # List of ALStudentAnswer
) -> EssayQuestionMetric:
    """
    Computes criterion-level metrics for an essay question based on rubric checklists.
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
    
    # Parse checklist definition
    raw_checklist = question.essay_checklist_json or []
    criteria_defs = _extract_criteria_definitions(raw_checklist, q_num)
    
    # If no criteria defined in JSON, construct standard academic rubric criteria from question points
    if not criteria_defs and total_pts > 0:
        criteria_defs = [
            {"criterion_id": f"Q{q_num}_C1", "item_number": 1, "criterion_text": "Scientific Conceptual Accuracy & Mechanism Description", "max_points": round(total_pts * 0.4, 1)},
            {"criterion_id": f"Q{q_num}_C2", "item_number": 2, "criterion_text": "Terminology, Biochemical Equations & Sequence Integrity", "max_points": round(total_pts * 0.35, 1)},
            {"criterion_id": f"Q{q_num}_C3", "item_number": 3, "criterion_text": "Biological Significance, Synthesis & Coherence", "max_points": round(total_pts * 0.25, 1)},
        ]
                    
    # Aggregate student answers against criteria
    criteria_metrics: List[EssayCriterionMetric] = []
    
    for c_def in criteria_defs:
        c_num = c_def["item_number"]
        c_pts = c_def["max_points"]
        
        awarded_count = 0
        awarded_points_sum = 0.0
        
        for ans in answers_list:
            # 1. Try reading explicit criterion marks from teacher_checklist_results_json / ai_checklist_results_json
            chk_res = getattr(ans, "teacher_checklist_results_json", None) or getattr(ans, "ai_checklist_results_json", None) or []
            is_awarded = False
            pts_awarded = 0.0
            found_explicit = False
            
            if isinstance(chk_res, dict):
                chk_res = chk_res.get("criteria_results") or chk_res.get("items") or chk_res.get("checklist") or []
                
            if isinstance(chk_res, list):
                for res_item in chk_res:
                    if isinstance(res_item, dict):
                        res_num = res_item.get("item_number") or res_item.get("number")
                        if res_num == c_num:
                            found_explicit = True
                            if res_item.get("awarded") is True or res_item.get("is_correct") is True:
                                is_awarded = True
                                pts_awarded = float(res_item.get("points") or res_item.get("awarded_score") or c_pts)
                            break
            
            # 2. If no explicit criterion boolean, derive proportionally from verified final_score
            if not found_explicit:
                final_sc = float(getattr(ans, "final_score", 0.0) or getattr(ans, "teacher_score", 0.0) or getattr(ans, "ai_score", 0.0) or 0.0)
                attainment_ratio = min(1.0, max(0.0, final_sc / total_pts)) if total_pts > 0 else 0.0
                pts_awarded = round(attainment_ratio * c_pts, 2)
                # Criterion considered achieved if student attained at least 45% of available points
                if attainment_ratio >= 0.45:
                    is_awarded = True
                    
            if is_awarded:
                awarded_count += 1
                awarded_points_sum += pts_awarded
                
        omitted_cnt = max(0, total_attempts - awarded_count)
        omission_pct = safe_percentage(omitted_cnt, total_attempts, default=0.0) if total_attempts > 0 else None
        succ_pct = safe_percentage(awarded_count, total_attempts, default=0.0) if total_attempts > 0 else None
        avg_pts = safe_div(awarded_points_sum, total_attempts, default=0.0) if total_attempts > 0 else None
        
        criteria_metrics.append(
            EssayCriterionMetric(
                criterion_id=c_def["criterion_id"],
                item_number=c_num,
                criterion_text=c_def["criterion_text"],
                max_points=c_pts,
                total_attempts=total_attempts,
                awarded_count=awarded_count,
                omitted_count=omitted_cnt,
                omission_frequency_percentage=omission_pct,
                success_percentage=succ_pct,
                average_awarded_points=round(avg_pts, 2) if avg_pts is not None else None
            )
        )
        
    return EssayQuestionMetric(
        question_id=q_id,
        question_number=q_num,
        stem_summary=stem_summary,
        total_points=total_pts,
        total_attempts=total_attempts,
        average_score=avg_score,
        average_percentage=avg_pct,
        criteria_count=len(criteria_metrics),
        criteria=criteria_metrics
    )


def compute_essay_exam_report(
    exam: Any,
    questions: List[Any],
    submissions: List[Any],
    answers: List[Any]
) -> EssayExamAnalyticsReport:
    """
    Generates a full assessment-level rubric analysis report for Paper II-B Essay exams.
    """
    total_submissions = len(submissions)
    valid_scores = [float(s.percentage or 0.0) for s in submissions if s.percentage is not None]
    avg_score = round(statistics.mean([float(s.scaled_score or 0.0) for s in submissions]), 2) if submissions else None
    avg_pct = round(statistics.mean(valid_scores), 2) if valid_scores else None
    
    answers_by_question: Dict[int, List[Any]] = {}
    for a in answers:
        answers_by_question.setdefault(a.question_id, []).append(a)
        
    question_metrics: List[EssayQuestionMetric] = []
    all_criteria: List[Dict[str, Any]] = []
    
    for q in sorted(questions, key=lambda x: x.question_number or 0):
        q_ans = answers_by_question.get(q.id, [])
        qm = compute_essay_question_metrics(q, q_ans)
        question_metrics.append(qm)
        
        for c in qm.criteria:
            if c.total_attempts > 0:
                all_criteria.append({
                    "criterion_id": c.criterion_id,
                    "question_number": qm.question_number,
                    "item_number": c.item_number,
                    "criterion_text": c.criterion_text,
                    "omission_frequency_percentage": c.omission_frequency_percentage,
                    "success_percentage": c.success_percentage,
                    "average_awarded_points": c.average_awarded_points,
                    "max_points": c.max_points,
                    "total_attempts": c.total_attempts,
                })
                
    # Sort criteria descending by omission frequency (highest omission = most challenging)
    most_omitted = sorted(all_criteria, key=lambda x: x["omission_frequency_percentage"] or 0.0, reverse=True)
    
    return EssayExamAnalyticsReport(
        exam_id=exam.id,
        exam_title=exam.title,
        total_questions=len(questions),
        total_submissions=total_submissions,
        average_score=avg_score,
        average_percentage=avg_pct,
        most_omitted_criteria=most_omitted[:10],
        questions=question_metrics
    )
