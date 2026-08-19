"""
Non-Mutating Data Quality & Integrity Auditor.
Scans assessment and learning data for orphaned records, out-of-bounds scores, and structural anomalies.
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer
from app.services.analytics.data_contracts import (
    DataQualityAnomaly, DataQualityReport
)


def audit_exam_data_quality(exam_id: int, db: Session) -> DataQualityReport:
    """
    Performs a comprehensive, read-only data quality audit for an exam.
    Does NOT modify or mutate any production records.
    """
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        return DataQualityReport(
            target_type="exam",
            target_id=exam_id,
            total_checks_run=1,
            errors_count=1,
            warnings_count=0,
            is_clean=False,
            anomalies=[
                DataQualityAnomaly(
                    severity="error",
                    category="missing_field",
                    entity_type="exam",
                    entity_id=exam_id,
                    description=f"A/L Exam #{exam_id} not found in database."
                )
            ]
        )
        
    questions = db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).all()
    q_ids = {q.id for q in questions}
    q_map = {q.id: q for q in questions}
    
    submissions = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == exam_id).all()
    sub_ids = {s.id for s in submissions}
    
    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []
    
    anomalies: List[DataQualityAnomaly] = []
    checks_count = 0
    
    # Check 1: Duplicate Question Numbers
    checks_count += 1
    seen_q_nums = set()
    for q in questions:
        if q.question_number in seen_q_nums:
            anomalies.append(
                DataQualityAnomaly(
                    severity="warning",
                    category="missing_field",
                    entity_type="question",
                    entity_id=q.id,
                    description=f"Duplicate question number #{q.question_number} detected in exam."
                )
            )
        seen_q_nums.add(q.question_number)
        
    # Check 2: MCQ Questions missing correct options
    checks_count += 1
    for q in questions:
        tmpl_str = str(getattr(q.template_type, "value", q.template_type) or "").lower()
        if "mcq" in tmpl_str or tmpl_str in ["generic_mcq", "assertion_reason", "five_statement_truth", "matching_column", "diagram_based", "experimental_procedure", "combination_grid"]:
            if not q.correct_option:
                anomalies.append(
                    DataQualityAnomaly(
                        severity="error",
                        category="missing_field",
                        entity_type="question",
                        entity_id=q.id,
                        description=f"MCQ Question #{q.question_number} (ID {q.id}) has no correct_option configured."
                    )
                )
                
    # Check 3: Structured subparts structure validation
    checks_count += 1
    for q in questions:
        tmpl_str = str(getattr(q.template_type, "value", q.template_type) or "").lower()
        if "structured" in tmpl_str:
            if not q.structured_subparts_json or not isinstance(q.structured_subparts_json, list):
                anomalies.append(
                    DataQualityAnomaly(
                        severity="warning",
                        category="malformed_json",
                        entity_type="question",
                        entity_id=q.id,
                        description=f"Structured Question #{q.question_number} (ID {q.id}) has empty or invalid structured_subparts_json."
                    )
                )
                
    # Check 4: Essay rubric structure validation
    checks_count += 1
    for q in questions:
        tmpl_str = str(getattr(q.template_type, "value", q.template_type) or "").lower()
        if "essay" in tmpl_str:
            if not q.essay_checklist_json or not isinstance(q.essay_checklist_json, list):
                anomalies.append(
                    DataQualityAnomaly(
                        severity="warning",
                        category="malformed_json",
                        entity_type="question",
                        entity_id=q.id,
                        description=f"Essay Question #{q.question_number} (ID {q.id}) has empty or invalid essay_checklist_json."
                    )
                )
                
    # Check 5: Orphan answers (question_id does not belong to this exam)
    checks_count += 1
    for a in answers:
        if a.question_id not in q_ids:
            anomalies.append(
                DataQualityAnomaly(
                    severity="error",
                    category="orphan_record",
                    entity_type="answer",
                    entity_id=a.id,
                    description=f"Answer #{a.id} references Question #{a.question_id} which does not belong to Exam #{exam_id}."
                )
            )
            
    # Check 6: Out-of-bounds scores on answers
    checks_count += 1
    for a in answers:
        q = q_map.get(a.question_id)
        if q:
            max_p = float(q.points or 1.0)
            awarded = float(a.final_score or a.teacher_score or a.ai_score or 0.0)
            if awarded > (max_p + 1e-4):
                anomalies.append(
                    DataQualityAnomaly(
                        severity="warning",
                        category="out_of_bounds",
                        entity_type="answer",
                        entity_id=a.id,
                        description=f"Answer #{a.id} awarded score ({awarded:.1f}) exceeds Question #{q.question_number} max points ({max_p:.1f}).",
                        context={"awarded_score": awarded, "max_points": max_p}
                    )
                )
            elif awarded < 0.0:
                anomalies.append(
                    DataQualityAnomaly(
                        severity="error",
                        category="out_of_bounds",
                        entity_type="answer",
                        entity_id=a.id,
                        description=f"Answer #{a.id} has negative awarded score ({awarded:.1f})."
                    )
                )
                
    # Check 7: Submissions without answers
    checks_count += 1
    sub_answer_counts: Dict[int, int] = {}
    for a in answers:
        sub_answer_counts[a.submission_id] = sub_answer_counts.get(a.submission_id, 0) + 1
        
    for s in submissions:
        if s.status in ["submitted", "ai_graded", "teacher_verified"] and sub_answer_counts.get(s.id, 0) == 0:
            anomalies.append(
                DataQualityAnomaly(
                    severity="warning",
                    category="missing_field",
                    entity_type="submission",
                    entity_id=s.id,
                    description=f"Submission #{s.id} (Student #{s.student_id}) marked as '{s.status}' but contains 0 saved answers."
                )
            )
            
    errors_count = sum(1 for a in anomalies if a.severity == "error")
    warnings_count = sum(1 for a in anomalies if a.severity == "warning")
    
    return DataQualityReport(
        target_type="exam",
        target_id=exam_id,
        total_checks_run=checks_count,
        errors_count=errors_count,
        warnings_count=warnings_count,
        is_clean=len(anomalies) == 0,
        anomalies=anomalies
    )
