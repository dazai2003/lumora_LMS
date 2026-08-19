"""
Exam Foundation Overview Analytics Service.
Calculates high-level assessment aggregates, status counts, score distributions, and grade distributions.
"""
from typing import List, Dict, Any, Optional
import statistics
from sqlalchemy.orm import Session
from app.models import ALExam, ALStudentSubmission
from app.services.analytics.data_contracts import ExamFoundationOverview
from app.services.analytics.normalization import safe_percentage


def compute_exam_foundation_overview(exam_id: int, db: Session) -> ExamFoundationOverview:
    """
    Computes summary overview analytics for an A/L Exam.
    """
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise ValueError(f"Exam #{exam_id} not found")
        
    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id == exam_id
    ).all()
    
    total_submissions = len(submissions)
    in_progress = sum(1 for s in submissions if s.status == "in_progress")
    submitted = sum(1 for s in submissions if s.status == "submitted")
    ai_graded = sum(1 for s in submissions if s.status == "ai_graded")
    teacher_verified = sum(1 for s in submissions if s.status == "teacher_verified")
    
    # Consider finalized / completed submissions for score metrics
    scored_subs = [s for s in submissions if s.percentage is not None and s.status in ["submitted", "ai_graded", "teacher_verified"]]
    
    raw_scores = [float(s.raw_score or 0.0) for s in scored_subs]
    scaled_scores = [float(s.scaled_score or 0.0) for s in scored_subs]
    percentages = [float(s.percentage or 0.0) for s in scored_subs]
    
    avg_raw = round(statistics.mean(raw_scores), 2) if raw_scores else None
    avg_scaled = round(statistics.mean(scaled_scores), 2) if scaled_scores else None
    avg_pct = round(statistics.mean(percentages), 2) if percentages else None
    med_pct = round(statistics.median(percentages), 2) if percentages else None
    high_pct = max(percentages) if percentages else None
    low_pct = min(percentages) if percentages else None
    
    # Score distribution buckets (5 standard buckets)
    buckets = {
        "0-20%": 0,
        "21-40%": 0,
        "41-60%": 0,
        "61-80%": 0,
        "81-100%": 0
    }
    
    for pct in percentages:
        if pct <= 20.0:
            buckets["0-20%"] += 1
        elif pct <= 40.0:
            buckets["21-40%"] += 1
        elif pct <= 60.0:
            buckets["41-60%"] += 1
        elif pct <= 80.0:
            buckets["61-80%"] += 1
        else:
            buckets["81-100%"] += 1
            
    # Grade distribution (A/L standard: A: >=75, B: >=65, C: >=55, S: >=35, F: <35)
    grades = {"A": 0, "B": 0, "C": 0, "S": 0, "F": 0}
    for s in scored_subs:
        g = str(s.grade or "").strip().upper()
        if g in grades:
            grades[g] += 1
        else:
            # Derive from percentage if grade string unset
            pct = float(s.percentage or 0.0)
            if pct >= 75.0:
                grades["A"] += 1
            elif pct >= 65.0:
                grades["B"] += 1
            elif pct >= 55.0:
                grades["C"] += 1
            elif pct >= 35.0:
                grades["S"] += 1
            else:
                grades["F"] += 1
                
    exam_type_str = getattr(exam.exam_type, "value", str(exam.exam_type)) if exam.exam_type else "paper_1_mcq"
    
    return ExamFoundationOverview(
        exam_id=exam.id,
        title=exam.title,
        exam_type=exam_type_str,
        time_limit_minutes=exam.time_limit_minutes or 120,
        total_questions=exam.total_questions or 0,
        raw_mark_cap=float(exam.raw_mark_cap) if exam.raw_mark_cap is not None else 100.0,
        is_published=bool(exam.is_published),
        total_submissions=total_submissions,
        in_progress_count=in_progress,
        submitted_count=submitted,
        ai_graded_count=ai_graded,
        teacher_verified_count=teacher_verified,
        average_raw_score=avg_raw,
        average_scaled_score=avg_scaled,
        average_percentage=avg_pct,
        median_percentage=med_pct,
        highest_percentage=high_pct,
        lowest_percentage=low_pct,
        score_distribution_buckets=buckets,
        grade_distribution=grades
    )
