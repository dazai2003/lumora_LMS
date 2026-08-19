"""
MCQ Item Analysis and Psychometric Calculation Engine.
Calculates difficulty index p, option distribution A-E, distractor efficiency, and cognitive skill aggregates.
"""
from typing import List, Dict, Any, Optional
import statistics
from app.services.analytics.data_contracts import (
    MCQItemMetric, OptionDistributionItem, MCQExamAnalyticsReport
)
from app.services.analytics.normalization import (
    safe_div, safe_percentage, normalize_option_choice,
    normalize_cognitive_level, normalize_difficulty
)
from app.services.analytics.discrimination import calculate_item_discrimination


def compute_mcq_question_metrics(
    question: Any, # ALQuestion
    answers_list: List[Any], # List of ALStudentAnswer for this question
    student_rankings: List[Dict[str, Any]],
    answers_by_submission: Dict[int, Any],
    total_candidates: Optional[int] = None
) -> MCQItemMetric:
    """
    Computes psychometric item metrics for a single MCQ question.
    """
    q_id = question.id
    q_num = question.question_number or 0
    tmpl_type = getattr(question.template_type, "value", str(question.template_type)) if question.template_type else "generic_mcq"
    stem_text = question.stem_text or ""
    stem_summary = stem_text[:120] + ("..." if len(stem_text) > 120 else "")
    cog_level = normalize_cognitive_level(question.cognitive_level)
    diff = normalize_difficulty(question.difficulty)
    points = float(question.points or 1.0)
    
    norm_correct = normalize_option_choice(question.correct_option)
    
    candidate_count = total_candidates if total_candidates is not None else (len(student_rankings) if student_rankings else len(answers_list))
    total_attempts = candidate_count
    answered_count = 0
    correct_count = 0
    incorrect_count = 0
    
    option_counts = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0}
    
    for ans in answers_list:
        sel_raw = getattr(ans, "selected_option", None)
        norm_sel = normalize_option_choice(sel_raw)
        
        if norm_sel:
            answered_count += 1
            if norm_sel in option_counts:
                option_counts[norm_sel] += 1
            else:
                # Handle edge cases or additional options
                option_counts[norm_sel] = option_counts.get(norm_sel, 0) + 1
                
            is_corr = getattr(ans, "is_correct", None)
            if is_corr is True:
                correct_count += 1
            elif is_corr is False:
                incorrect_count += 1
            elif norm_correct and norm_sel == norm_correct:
                correct_count += 1
            else:
                incorrect_count += 1

    unanswered_count = max(0, candidate_count - answered_count)
            
    # Calculate Difficulty Index (p-value): success rate
    p_value = safe_div(correct_count, total_attempts, default=None)
    pct_score = safe_percentage(correct_count, total_attempts, default=None)
    
    # Calculate Option Distribution and Distractor Efficiency
    option_distribution: List[OptionDistributionItem] = []
    for opt_key in ["A", "B", "C", "D", "E"]:
        cnt = option_counts.get(opt_key, 0)
        opt_pct = safe_percentage(cnt, total_attempts, default=0.0) if total_attempts > 0 else 0.0
        is_corr_opt = (norm_correct == opt_key)
        # Non-functional distractor: option is NOT correct and chosen by < 5% of students (when attempts >= 10)
        is_non_func = (not is_corr_opt) and (total_attempts >= 10) and (opt_pct is not None and opt_pct < 5.0)
        
        option_distribution.append(
            OptionDistributionItem(
                option_key=opt_key,
                count=cnt,
                percentage=opt_pct,
                is_correct=is_corr_opt,
                is_non_functional_distractor=is_non_func
            )
        )
        
    # Calculate Discrimination Index
    discrimination = calculate_item_discrimination(
        question_id=q_id,
        correct_option=norm_correct,
        student_submissions_ranking=student_rankings,
        answers_by_submission=answers_by_submission
    )
    
    return MCQItemMetric(
        question_id=q_id,
        question_number=q_num,
        template_type=tmpl_type,
        stem_summary=stem_summary,
        cognitive_level=cog_level,
        difficulty=diff,
        points=points,
        correct_option=norm_correct,
        total_attempts=total_attempts,
        answered_count=answered_count,
        unanswered_count=unanswered_count,
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        difficulty_index_p=round(p_value, 3) if p_value is not None else None,
        percentage_score=pct_score,
        discrimination=discrimination,
        option_distribution=option_distribution
    )


def compute_mcq_exam_report(
    exam: Any, # ALExam
    questions: List[Any], # List of ALQuestion
    submissions: List[Any], # List of ALStudentSubmission
    answers: List[Any] # List of ALStudentAnswer
) -> MCQExamAnalyticsReport:
    """
    Generates a full assessment-level psychometric report for Paper I MCQ exams.
    """
    total_submissions = len(submissions)
    valid_scores = [float(s.percentage or 0.0) for s in submissions if s.percentage is not None]
    
    avg_score = round(statistics.mean([float(s.scaled_score or 0.0) for s in submissions]), 2) if submissions else None
    avg_pct = round(statistics.mean(valid_scores), 2) if valid_scores else None
    med_pct = round(statistics.median(valid_scores), 2) if valid_scores else None
    high_pct = max(valid_scores) if valid_scores else None
    low_pct = min(valid_scores) if valid_scores else None
    
    # Prepare ranking for discrimination calculation
    student_rankings = [
        {
            "student_id": s.student_id,
            "submission_id": s.id,
            "total_score": float(s.scaled_score or s.raw_score or 0.0)
        }
        for s in submissions
    ]
    
    # Group answers by question_id and submission_id
    answers_by_question: Dict[int, List[Any]] = {}
    answers_by_sub_and_q: Dict[int, Dict[int, Any]] = {}
    
    for a in answers:
        answers_by_question.setdefault(a.question_id, []).append(a)
        answers_by_sub_and_q.setdefault(a.question_id, {})[a.submission_id] = a
        
    question_metrics: List[MCQItemMetric] = []
    
    for q in sorted(questions, key=lambda x: x.question_number or 0):
        q_ans = answers_by_question.get(q.id, [])
        q_sub_map = answers_by_sub_and_q.get(q.id, {})
        m = compute_mcq_question_metrics(q, q_ans, student_rankings, q_sub_map, total_candidates=total_submissions)
        question_metrics.append(m)
        
    # Aggregate breakdowns
    cognitive_breakdown: Dict[str, Any] = {}
    template_breakdown: Dict[str, Any] = {}
    difficulty_breakdown: Dict[str, Any] = {}
    
    for m in question_metrics:
        # Cognitive
        cog = m.cognitive_level
        if cog not in cognitive_breakdown:
            cognitive_breakdown[cog] = {"question_count": 0, "total_attempts": 0, "total_correct": 0}
        cognitive_breakdown[cog]["question_count"] += 1
        cognitive_breakdown[cog]["total_attempts"] += m.total_attempts
        cognitive_breakdown[cog]["total_correct"] += m.correct_count
        
        # Template
        tmpl = m.template_type
        if tmpl not in template_breakdown:
            template_breakdown[tmpl] = {"question_count": 0, "total_attempts": 0, "total_correct": 0}
        template_breakdown[tmpl]["question_count"] += 1
        template_breakdown[tmpl]["total_attempts"] += m.total_attempts
        template_breakdown[tmpl]["total_correct"] += m.correct_count
        
        # Difficulty
        diff = m.difficulty
        if diff not in difficulty_breakdown:
            difficulty_breakdown[diff] = {"question_count": 0, "total_attempts": 0, "total_correct": 0}
        difficulty_breakdown[diff]["question_count"] += 1
        difficulty_breakdown[diff]["total_attempts"] += m.total_attempts
        difficulty_breakdown[diff]["total_correct"] += m.correct_count
        
    # Calculate percentage for each bucket
    for b_dict in [cognitive_breakdown, template_breakdown, difficulty_breakdown]:
        for k, v in b_dict.items():
            v["success_rate_percentage"] = safe_percentage(v["total_correct"], v["total_attempts"], default=None)
            
    # Hardest & Easiest questions (filter questions with at least 1 attempt)
    attempted_qs = [m for m in question_metrics if m.total_attempts > 0 and m.difficulty_index_p is not None]
    hardest = sorted(attempted_qs, key=lambda x: x.difficulty_index_p or 0.0)[:5]
    easiest = sorted(attempted_qs, key=lambda x: x.difficulty_index_p or 0.0, reverse=True)[:5]
    
    hardest_summary = [
        {
            "question_number": m.question_number,
            "question_id": m.question_id,
            "stem_summary": m.stem_summary,
            "difficulty_index_p": m.difficulty_index_p,
            "percentage_score": m.percentage_score,
            "template_type": m.template_type,
        }
        for m in hardest
    ]
    
    easiest_summary = [
        {
            "question_number": m.question_number,
            "question_id": m.question_id,
            "stem_summary": m.stem_summary,
            "difficulty_index_p": m.difficulty_index_p,
            "percentage_score": m.percentage_score,
            "template_type": m.template_type,
        }
        for m in easiest
    ]
    
    return MCQExamAnalyticsReport(
        exam_id=exam.id,
        exam_title=exam.title,
        total_questions=len(questions),
        total_submissions=total_submissions,
        average_score=avg_score,
        average_percentage=avg_pct,
        median_percentage=med_pct,
        highest_percentage=high_pct,
        lowest_percentage=low_pct,
        cognitive_level_breakdown=cognitive_breakdown,
        template_type_breakdown=template_breakdown,
        difficulty_level_breakdown=difficulty_breakdown,
        hardest_questions=hardest_summary,
        easiest_questions=easiest_summary,
        questions=question_metrics
    )
