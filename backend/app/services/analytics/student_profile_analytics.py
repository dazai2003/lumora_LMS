"""
Student Learning Profile and Support Signal Engine.
Generates comprehensive teacher-facing individual student analytics,
connecting material progress, revisits, flags, Ask AI questions, and assessment performance.
"""
from typing import List, Dict, Any, Optional
import statistics
from sqlalchemy.orm import Session

from app.models import (
    User, Course, Unit, Lesson, Material, StudentMaterialProgress, MaterialFlag,
    StudentQuestion, Enrollment, ALExam, ALStudentSubmission, ALExamType,
    ALStudentAnswer, ALQuestion
)
from app.services.analytics.data_contracts import (
    StudentLearningProfileReport, StudentSupportSignalItem
)
from app.services.analytics.normalization import (
    safe_div, safe_percentage, parse_context_location, map_question_to_unit_index
)


def compute_student_learning_profile(
    student_id: int,
    course_id: Optional[int],
    db: Session
) -> StudentLearningProfileReport:
    """
    Computes an evidence-based learning profile and support signals for an individual student.
    """
    student = db.query(User).filter(User.id == student_id).first()
    if not student:
        raise ValueError(f"Student #{student_id} not found")

    student_name = student.full_name or f"Student #{student.id}"
    student_email = student.email or ""

    # 1. Enrolled Courses
    enrollments_query = db.query(Enrollment).filter(
        Enrollment.student_id == student_id,
        Enrollment.is_active == True
    )
    if course_id:
        enrollments_query = enrollments_query.filter(Enrollment.course_id == course_id)
    enrollments = enrollments_query.all()
    enrolled_course_ids = [e.course_id for e in enrollments]

    # Track latest activity timestamp across all interactions
    activity_timestamps: List[str] = []

    # 2. Materials & Progress
    lessons_query = db.query(Lesson).filter(Lesson.course_id.in_(enrolled_course_ids)) if enrolled_course_ids else None
    lessons = lessons_query.all() if lessons_query else []
    lesson_ids = [l.id for l in lessons]
    lesson_unit_map = {l.id: l.unit_id for l in lessons if l.unit_id}

    materials_query = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)) if lesson_ids else None
    materials = materials_query.all() if materials_query else []
    total_materials = len(materials)
    material_map = {m.id: m for m in materials}

    progress_records = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.student_id == student_id,
        StudentMaterialProgress.material_id.in_(list(material_map.keys()))
    ).all() if material_map else []

    completed_count = sum(1 for p in progress_records if p.is_completed)
    completion_pct = safe_percentage(completed_count, total_materials, default=0.0) if total_materials > 0 else None

    # Frequently revisited materials for this student
    frequently_revisited = []
    for p in progress_records:
        mat = material_map.get(p.material_id)
        if p.updated_at:
            activity_timestamps.append(p.updated_at.isoformat())
        if mat and (p.last_position and p.last_position > 0):
            frequently_revisited.append({
                "material_id": mat.id,
                "title": mat.title,
                "material_type": getattr(mat.material_type, "value", str(mat.material_type)),
                "is_completed": p.is_completed,
                "last_position": p.last_position,
                "last_updated": p.updated_at.isoformat() if p.updated_at else ""
            })

    # 3. Flags Submitted by Student
    flags_query = db.query(MaterialFlag).filter(
        MaterialFlag.student_id == student_id
    )
    if material_map:
        flags_query = flags_query.filter(MaterialFlag.material_id.in_(list(material_map.keys())))
    flags = flags_query.order_by(MaterialFlag.created_at.desc()).all()

    total_flags = len(flags)
    unresolved_flags = sum(1 for f in flags if not f.is_resolved)

    recent_flags_list = []
    for f in flags[:5]:
        if f.created_at:
            activity_timestamps.append(f.created_at.isoformat())
        mat = material_map.get(f.material_id)
        c_type, c_val = parse_context_location(f.context)
        recent_flags_list.append({
            "flag_id": f.id,
            "material_title": mat.title if mat else f"Material #{f.material_id}",
            "context_type": c_type,
            "context_value": c_val or f.context,
            "comment": f.comment,
            "is_resolved": f.is_resolved or False,
            "teacher_reply": f.teacher_reply,
            "resolved_at": f.resolved_at.isoformat() if f.resolved_at else None,
            "created_at": f.created_at.isoformat() if f.created_at else ""
        })

    # 4. Ask AI Questions by Student
    questions_query = db.query(StudentQuestion).filter(
        StudentQuestion.student_id == student_id
    )
    if course_id:
        questions_query = questions_query.filter(StudentQuestion.course_id == course_id)
    questions = questions_query.order_by(StudentQuestion.asked_at.desc()).all()

    total_ai_questions = len(questions)

    # Group questions by topic
    topics_count: Dict[str, int] = {}
    for q in questions:
        if q.asked_at:
            activity_timestamps.append(q.asked_at.isoformat())
        top = q.topic_category or "General Course Query"
        topics_count[top] = topics_count.get(top, 0) + 1

    top_topics_list = [{"topic": k, "count": v} for k, v in sorted(topics_count.items(), key=lambda x: x[1], reverse=True)[:4]]

    recent_ai_list = []
    for q in questions[:5]:
        recent_ai_list.append({
            "question_id": q.id,
            "question_text": q.question_text,
            "topic_category": q.topic_category or "General",
            "sentiment_difficulty": q.sentiment_difficulty or "Normal",
            "asked_at": q.asked_at.isoformat() if q.asked_at else ""
        })

    # 5. Assessment Submissions History
    subs_query = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.student_id == student_id
    )
    if course_id:
        exams_in_course = db.query(ALExam.id).filter(ALExam.course_id == course_id).all()
        exam_ids = [e[0] for e in exams_in_course]
        subs_query = subs_query.filter(ALStudentSubmission.exam_id.in_(exam_ids))

    submissions = subs_query.order_by(ALStudentSubmission.started_at.desc()).all()

    exam_map = {}
    answers = []
    q_map = {}
    if submissions:
        sub_exam_ids = [s.exam_id for s in submissions]
        sub_exams = db.query(ALExam).filter(ALExam.id.in_(sub_exam_ids)).all()
        exam_map = {e.id: e for e in sub_exams}
        sub_ids = [s.id for s in submissions]
        answers = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_(sub_ids)).all() if sub_ids else []
        questions_list = db.query(ALQuestion).filter(ALQuestion.exam_id.in_(sub_exam_ids)).all() if sub_exam_ids else []
        q_map = {q.id: q for q in questions_list}

    assessment_history_list = []
    exam_percentages: List[float] = []
    mcq_percentages: List[float] = []
    structured_percentages: List[float] = []
    essay_percentages: List[float] = []

    for s in submissions:
        if s.submitted_at:
            activity_timestamps.append(s.submitted_at.isoformat())
        ex = exam_map.get(s.exam_id)
        pct = float(s.percentage) if s.percentage is not None else None
        if pct is not None:
            exam_percentages.append(pct)
            ex_type_str = getattr(ex.exam_type, "value", str(ex.exam_type)) if ex else "paper_1_mcq"
            if "mcq" in ex_type_str.lower():
                mcq_percentages.append(pct)
            elif "structured" in ex_type_str.lower():
                structured_percentages.append(pct)
            elif "essay" in ex_type_str.lower():
                essay_percentages.append(pct)

        assessment_history_list.append({
            "submission_id": s.id,
            "exam_id": s.exam_id,
            "exam_title": ex.title if ex else f"Exam #{s.exam_id}",
            "exam_type": getattr(ex.exam_type, "value", str(ex.exam_type)) if ex else "paper_1_mcq",
            "raw_score": s.raw_score,
            "scaled_score": s.scaled_score,
            "percentage": pct,
            "grade": s.grade or "—",
            "status": s.status,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else ""
        })

    avg_exam_pct = round(statistics.mean(exam_percentages), 1) if exam_percentages else None
    highest_exam_pct = round(max(exam_percentages), 1) if exam_percentages else None
    recent_exam_pct = round(exam_percentages[0], 1) if exam_percentages else None
    mcq_avg_pct = round(statistics.mean(mcq_percentages), 1) if mcq_percentages else None
    structured_avg_pct = round(statistics.mean(structured_percentages), 1) if structured_percentages else None
    essay_avg_pct = round(statistics.mean(essay_percentages), 1) if essay_percentages else None

    # 6. Syllabus Units Mastery Breakdown
    unit_mastery_breakdown = []
    if course_id:
        units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc(), Unit.id.asc()).all()
        for u_idx_loop, u in enumerate(units):
            u_lessons = [l for l in lessons if l.unit_id == u.id]
            u_lesson_ids = [l.id for l in u_lessons]
            u_materials = [m for m in materials if m.lesson_id in u_lesson_ids]
            u_mat_ids = [m.id for m in u_materials]
            
            u_completed = sum(1 for p in progress_records if p.material_id in u_mat_ids and p.is_completed)
            u_comp_pct = safe_percentage(u_completed, len(u_materials), default=0.0) if u_materials else None
            
            u_flags_count = sum(1 for f in flags if f.material_id in u_mat_ids)
            
            # Unit assessment score (calculated from unit questions or mapped course-wide exam items)
            u_scores = []
            for a in answers:
                q = q_map.get(a.question_id)
                if not q:
                    continue
                t_type_str = getattr(q.template_type, "value", str(q.template_type)) if q.template_type else None
                mapped_idx = map_question_to_unit_index(q.question_number, t_type_str, q.exam_id, len(units))
                if mapped_idx != u_idx_loop:
                    continue
                q_pts = float(q.points or 1.0)
                sc = float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0)
                pct = safe_percentage(sc, q_pts, default=0.0) if q_pts > 0 else 0.0
                u_scores.append(pct)

            # Fallback to exam-level submission scores if question answers are not individually recorded
            if not u_scores:
                for s in submissions:
                    ex = exam_map.get(s.exam_id)
                    if not ex:
                        continue
                    if (ex.lesson_id and ex.lesson_id in u_lesson_ids) or len(units) == 1:
                        if s.percentage is not None:
                            u_scores.append(float(s.percentage))

            u_avg_score = round(statistics.mean(u_scores), 1) if u_scores else None
            
            # Honest Evidence Status & Mastery distinguishing STUDIED vs ASSESSED vs MASTERED (Phase V5.3)
            has_unit_learning = bool(u_completed > 0)
            has_unit_assessment = bool(u_avg_score is not None)

            if not has_unit_learning and not has_unit_assessment:
                u_evidence = "NO_DATA"
                u_status = "NO_DATA"
            elif has_unit_learning and not has_unit_assessment:
                u_evidence = "LEARNING_ONLY"
                u_status = "Studied (No Assessment)"
            elif not has_unit_learning and has_unit_assessment:
                u_evidence = "ASSESSMENT_ONLY"
                u_status = "Mastered" if u_avg_score >= 75.0 else ("On Track" if u_avg_score >= 60.0 else "Needs Attention")
            elif (u_comp_pct or 0) >= 50.0 and u_avg_score is not None and u_avg_score >= 75.0:
                u_evidence = "STRONG_EVIDENCE"
                u_status = "Mastered"
            else:
                u_evidence = "EVIDENCE_AVAILABLE"
                if u_avg_score is not None and u_avg_score >= 60.0:
                    u_status = "On Track"
                elif (u_avg_score is not None and u_avg_score < 50.0) or u_flags_count >= 2:
                    u_status = "Needs Attention"
                else:
                    u_status = "Developing"
                
            unit_mastery_breakdown.append({
                "unit_id": u.id,
                "unit_title": u.title or f"Unit {u.unit_number or u.id}",
                "materials_count": len(u_materials),
                "materials_completed": u_completed,
                "material_completion_pct": u_comp_pct,
                "learning_activity_pct": u_comp_pct,
                "assessment_score_pct": u_avg_score,
                "flags_count": u_flags_count,
                "evidence_status": u_evidence,
                "mastery_status": u_status
            })

    # 7. Status Diagnostic & Engagement Pattern (Separating Absence from Failure)
    has_activity = bool(total_materials > 0 and (completed_count > 0 or len(progress_records) > 0 or len(submissions) > 0 or total_ai_questions > 0 or total_flags > 0))
    
    if not has_activity:
        status_diagnostic = {
            "status": "NO_ACTIVITY",
            "label": "No Activity",
            "badgeClass": "badge-secondary",
            "reason": "Student has not accessed materials, attempted assessments, or asked AI questions."
        }
        pattern = "No Activity Recorded"
    elif not exam_percentages and (completion_pct or 0) < 25.0:
        status_diagnostic = {
            "status": "LIMITED_DATA",
            "label": "Limited Data",
            "badgeClass": "badge-secondary",
            "reason": "Student has sparse activity with no assessment submissions to evaluate mastery."
        }
        pattern = "Early Study In Progress"
    elif avg_exam_pct is not None and avg_exam_pct < 50.0:
        status_diagnostic = {
            "status": "NEEDS_ATTENTION",
            "label": "Needs Attention",
            "badgeClass": "badge-error",
            "reason": f"Assessment attainment average is {avg_exam_pct}% (below 50% threshold)."
        }
        pattern = "Low Assessment Attainment"
    elif unresolved_flags >= 2:
        status_diagnostic = {
            "status": "NEEDS_ATTENTION",
            "label": "Difficulty Signal",
            "badgeClass": "badge-warning",
            "reason": f"Student has {unresolved_flags} open difficulty flags requiring teacher review."
        }
        pattern = "Active Content Difficulty Signal"
    elif avg_exam_pct is not None and avg_exam_pct >= 65.0 and (completion_pct or 0) >= 40.0:
        status_diagnostic = {
            "status": "ON_TRACK",
            "label": "On Track",
            "badgeClass": "badge-success",
            "reason": f"Strong performance with {avg_exam_pct}% assessment average and {completion_pct}% completion."
        }
        pattern = "High Attainment • On Track"
    else:
        status_diagnostic = {
            "status": "ACTIVE",
            "label": "Active",
            "badgeClass": "badge-info",
            "reason": "Student is actively participating with developing coursework evidence."
        }
        pattern = "Active Study Engagement"

    # 8. Evidence-Based Support Signals
    support_signals: List[StudentSupportSignalItem] = []

    if completion_pct is not None and avg_exam_pct is not None:
        if completion_pct >= 60.0 and avg_exam_pct < 50.0:
            support_signals.append(
                StudentSupportSignalItem(
                    signal_type="high_completion_low_performance",
                    severity="attention",
                    topic_or_material="Overall Coursework",
                    evidence_text=f"Student completed {completion_pct}% of materials but attained {avg_exam_pct}% on assessments."
                )
            )

    if unresolved_flags >= 2:
        support_signals.append(
            StudentSupportSignalItem(
                signal_type="unresolved_flags",
                severity="warning",
                topic_or_material="Content Difficulties",
                evidence_text=f"Student has {unresolved_flags} unresolved difficulty flags waiting for teacher clarification."
            )
        )

    for top in top_topics_list:
        if top["count"] >= 3:
            support_signals.append(
                StudentSupportSignalItem(
                    signal_type="elevated_ai_queries",
                    severity="info",
                    topic_or_material=top["topic"],
                    evidence_text=f"Student asked {top['count']} AI queries on '{top['topic']}'."
                )
            )

    if len(frequently_revisited) >= 3:
        support_signals.append(
            StudentSupportSignalItem(
                signal_type="frequent_revisits",
                severity="info",
                topic_or_material="Study Materials",
                evidence_text=f"Student repeatedly accesses {len(frequently_revisited)} distinct study materials."
            )
        )

    # 9. Actionable Teacher Interventions
    recommended_interventions = []
    if unresolved_flags > 0:
        recommended_interventions.append({
            "title": f"Review {unresolved_flags} Unresolved Material Flag{'s' if unresolved_flags > 1 else ''}",
            "reason": f"Student highlighted difficulty in specific lesson materials.",
            "action_type": "review_flags"
        })
    if avg_exam_pct is not None and avg_exam_pct < 50.0:
        recommended_interventions.append({
            "title": "Recommend Targeted Practice Questions",
            "reason": f"Assessment average is {avg_exam_pct}%. Extra practice on missed criteria is recommended.",
            "action_type": "practice"
        })
    if has_activity and (completion_pct or 0) < 25.0:
        recommended_interventions.append({
            "title": "Send Material Progress Reminder",
            "reason": f"Student has completed {completion_pct or 0}% of course notes and video lessons.",
            "action_type": "nudge"
        })
    if not has_activity:
        recommended_interventions.append({
            "title": "Send Onboarding Check-in",
            "reason": "Student has not yet started course materials or assessments.",
            "action_type": "nudge"
        })

    last_act = max(activity_timestamps) if activity_timestamps else None

    return StudentLearningProfileReport(
        student_id=student.id,
        student_name=student_name,
        student_email=student_email,
        enrolled_courses_count=len(enrolled_course_ids),
        materials_completed=completed_count,
        materials_total=total_materials,
        material_completion_percentage=completion_pct,
        frequently_revisited_materials=frequently_revisited,
        flags_submitted_count=total_flags,
        flags_unresolved_count=unresolved_flags,
        ask_ai_questions_count=total_ai_questions,
        top_asked_topics=top_topics_list,
        recent_flags=recent_flags_list,
        recent_ai_questions=recent_ai_list,
        assessment_history=assessment_history_list,
        assessment_average_percentage=avg_exam_pct,
        highest_assessment_percentage=highest_exam_pct,
        recent_assessment_percentage=recent_exam_pct,
        mcq_average_percentage=mcq_avg_pct,
        structured_average_percentage=structured_avg_pct,
        essay_average_percentage=essay_avg_pct,
        unit_mastery_breakdown=unit_mastery_breakdown,
        engagement_pattern=pattern,
        status_diagnostic=status_diagnostic,
        support_signals=support_signals,
        recommended_interventions=recommended_interventions,
        last_activity_at=last_act
    )
