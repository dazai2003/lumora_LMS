"""
Psychometric Item Discrimination Index (d) Calculation Service.

Implements Kelly's 27% Upper/Lower Quartile Rule per Classical Test Theory (CTT).

Key Design Decisions & Notes:
1. Why Kelly's 27% Rule:
   - Truman Kelly (1939) mathematically proved that selecting the upper 27% and lower 27%
     of a normally distributed cohort maximizes statistical discrimination power while minimizing error.
2. Discrimination Formula:
   - d = (Upper_Group_Correct - Lower_Group_Correct) / (0.27 * Total_Cohort_N)
3. Psychometric Interpretation Benchmarks:
   - d >= 0.40: Excellent item (strongly separates top students from struggling students).
   - 0.30 <= d < 0.40: Good item (effective assessment differentiator).
   - 0.20 <= d < 0.30: Marginal item (acceptable, but distractors could be sharpened).
   - d < 0.20: Poor item (does not effectively distinguish mastery levels).
   - d < 0.00: Negative discrimination (CRITICAL ALERT: high performers chose distractor, possible ambiguity).
4. Sample Size Validation:
   - Strictly enforces minimum N >= 10 candidates before computing d, returning 'insufficient_sample'
     confidence flag otherwise to prevent misleading small-sample conclusions.
"""
from typing import List, Dict, Any, Optional
import math
from app.services.analytics.data_contracts import DiscriminationMetric
from app.services.analytics.normalization import safe_div, normalize_option_choice


def calculate_item_discrimination(
    question_id: int,
    correct_option: Optional[str],
    student_submissions_ranking: List[Dict[str, Any]], # List of {"student_id": int, "submission_id": int, "total_score": float}
    answers_by_submission: Dict[int, Any] # Map submission_id -> ALStudentAnswer
) -> DiscriminationMetric:
    """
    Calculates the Discrimination Index d for an MCQ item:
    d = (Upper_27%_Correct - Lower_27%_Correct) / (0.27 * N)
    """
    total_submissions = len(student_submissions_ranking)
    
    # Check sample size threshold
    if total_submissions < 10:
        return DiscriminationMetric(
            value=None,
            sample_size=total_submissions,
            valid=False,
            confidence="insufficient_sample",
            reason=f"Sample size ({total_submissions}) is below the minimum threshold of 10 for psychometric discrimination."
        )
    
    # Sort students descending by total score
    sorted_students = sorted(
        student_submissions_ranking,
        key=lambda s: s.get("total_score", 0.0),
        reverse=True
    )
    
    # Check if there is score variance
    top_score = sorted_students[0].get("total_score", 0.0)
    bottom_score = sorted_students[-1].get("total_score", 0.0)
    if abs(top_score - bottom_score) < 1e-6:
        return DiscriminationMetric(
            value=None,
            sample_size=total_submissions,
            valid=False,
            confidence="insufficient_sample",
            reason="Zero variance in student total scores. Upper and lower cohorts are identical."
        )
    
    # Determine group size: exactly 27% of total submissions (minimum 2 students)
    group_size = max(2, int(math.ceil(0.27 * total_submissions)))
    
    # Ensure group size does not overlap
    if group_size * 2 > total_submissions:
        group_size = max(1, total_submissions // 2)
        
    upper_group = sorted_students[:group_size]
    lower_group = sorted_students[-group_size:]
    
    norm_correct = normalize_option_choice(correct_option)
    
    # Count correct in upper group
    upper_correct = 0
    for sub in upper_group:
        ans = answers_by_submission.get(sub["submission_id"])
        if ans:
            # Check is_correct flag or normalized selected option
            if getattr(ans, "is_correct", False) is True:
                upper_correct += 1
            elif norm_correct and normalize_option_choice(getattr(ans, "selected_option", None)) == norm_correct:
                upper_correct += 1
                
    # Count correct in lower group
    lower_correct = 0
    for sub in lower_group:
        ans = answers_by_submission.get(sub["submission_id"])
        if ans:
            if getattr(ans, "is_correct", False) is True:
                lower_correct += 1
            elif norm_correct and normalize_option_choice(getattr(ans, "selected_option", None)) == norm_correct:
                lower_correct += 1
                
    d_raw = safe_div(upper_correct - lower_correct, group_size, default=None)
    
    if d_raw is None:
        return DiscriminationMetric(
            value=None,
            sample_size=total_submissions,
            valid=False,
            confidence="insufficient_sample",
            reason="Could not compute discrimination index."
        )
        
    d_val = round(max(-1.0, min(1.0, d_raw)), 3)
    confidence = "sufficient_sample" if total_submissions >= 30 else "low_confidence"
    
    return DiscriminationMetric(
        value=d_val,
        sample_size=total_submissions,
        valid=True,
        confidence=confidence,
        reason=None
    )
