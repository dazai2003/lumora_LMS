"""
Learning Behaviour and Multi-Source Assessment Crossover Analytics Engine.
Connects student material progress, difficulty flags, Ask AI questions, and assessment performance across syllabus units.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import statistics
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import (
    Course, Unit, Lesson, Material, StudentMaterialProgress, MaterialFlag,
    StudentQuestion, AIResponse, Enrollment, User, ActivityLog,
    ALExam, ALExamType, ALStudentSubmission, ALStudentAnswer, ALQuestion
)
from app.services.analytics.data_contracts import (
    CourseLearningOverview, UnitLearningAssessmentCrossover
)
from app.services.analytics.normalization import safe_div, safe_percentage, parse_context_location, map_question_to_unit_index


def compute_course_learning_overview(course_id: int, db: Session) -> CourseLearningOverview:
    """
    Aggregates learning behaviour, material engagement, confusion flags,
    Ask AI interactions, and unit-level crossover for a course.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    course_title = course.title if course else f"Course #{course_id}"

    # 1. Enrollment & 30-Day Active Learners
    enrollments = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.is_active == True
    ).all()
    total_enrolled = len(enrollments)
    enrolled_student_ids = [e.student_id for e in enrollments]

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    active_learners_30d = 0
    if enrolled_student_ids:
        active_learners_30d = db.query(User).filter(
            User.id.in_(enrolled_student_ids),
            User.last_active_at >= thirty_days_ago
        ).count()

    # 2. Units, Lessons & Materials
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc()).all()
    lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
    lesson_ids = [l.id for l in lessons]
    
    materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
    material_ids = [m.id for m in materials]
    total_materials = len(materials)

    # 3. Material Progress & Views
    progress_records = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.material_id.in_(material_ids)
    ).all() if material_ids else []

    view_logs = db.query(ActivityLog).filter(
        ActivityLog.action == "view_material",
        ActivityLog.entity_type == "material",
        ActivityLog.entity_id.in_(material_ids)
    ).all() if material_ids else []

    views_by_mat: Dict[int, int] = {}
    for v in view_logs:
        views_by_mat[v.entity_id] = views_by_mat.get(v.entity_id, 0) + 1

    progress_by_mat: Dict[int, List[StudentMaterialProgress]] = {}
    for p in progress_records:
        progress_by_mat.setdefault(p.material_id, []).append(p)

    materials_viewed_count = len([m_id for m_id in material_ids if len(progress_by_mat.get(m_id, [])) > 0 or views_by_mat.get(m_id, 0) > 0])
    total_completed_instances = sum(1 for p in progress_records if p.is_completed)

    total_possible_completions = total_materials * total_enrolled
    avg_completion_pct = safe_percentage(total_completed_instances, total_possible_completions, default=None) if total_possible_completions > 0 else None

    # Calculate average revisit frequency
    revisit_frequencies: List[float] = []
    top_revisited_list = []
    for m in materials:
        m_views = views_by_mat.get(m.id, len(progress_by_mat.get(m.id, [])))
        unique_students = len(progress_by_mat.get(m.id, []))
        if unique_students > 0:
            freq = round(m_views / unique_students, 1)
            revisit_frequencies.append(freq)
            if freq > 1.0 or m_views >= 5:
                top_revisited_list.append({
                    "material_id": m.id,
                    "title": m.title,
                    "material_type": getattr(m.material_type, "value", str(m.material_type)),
                    "total_views": m_views,
                    "unique_students": unique_students,
                    "revisit_frequency": freq
                })

    avg_revisit_freq = round(statistics.mean(revisit_frequencies), 2) if revisit_frequencies else None
    top_revisited_list = sorted(top_revisited_list, key=lambda x: x["revisit_frequency"], reverse=True)[:5]

    # 4. Material Flags Analysis
    flags = db.query(MaterialFlag).filter(
        MaterialFlag.material_id.in_(material_ids)
    ).order_by(MaterialFlag.created_at.desc()).all() if material_ids else []

    total_flags = len(flags)
    unresolved_flags = sum(1 for f in flags if not f.is_resolved)
    resolved_flags = total_flags - unresolved_flags
    flag_resolution_pct = safe_percentage(resolved_flags, total_flags, default=100.0) if total_flags > 0 else None

    # Group flags by material to find top flagged materials
    flags_by_mat: Dict[int, List[MaterialFlag]] = {}
    for f in flags:
        flags_by_mat.setdefault(f.material_id, []).append(f)

    top_flagged_list = []
    for m in materials:
        m_flags = flags_by_mat.get(m.id, [])
        if m_flags:
            # Group contextual locations (pages / timestamps)
            loc_counts: Dict[str, int] = {}
            for f in m_flags:
                c_type, c_val = parse_context_location(f.context)
                loc_key = f"{c_type.capitalize()} {c_val}" if c_val else "Full Document"
                loc_counts[loc_key] = loc_counts.get(loc_key, 0) + 1

            hotspots = [{"location": k, "count": v} for k, v in sorted(loc_counts.items(), key=lambda x: x[1], reverse=True)[:3]]
            unres = sum(1 for f in m_flags if not f.is_resolved)
            
            top_flagged_list.append({
                "material_id": m.id,
                "title": m.title,
                "material_type": getattr(m.material_type, "value", str(m.material_type)),
                "total_flags": len(m_flags),
                "unresolved_flags": unres,
                "hotspots": hotspots
            })

    top_flagged_list = sorted(top_flagged_list, key=lambda x: x["total_flags"], reverse=True)[:5]

    # 5. Ask AI Questions
    questions = db.query(StudentQuestion).filter(
        StudentQuestion.course_id == course_id
    ).all()
    ask_ai_questions_count = len(questions)
    unique_students_asking_ai = len(set(q.student_id for q in questions if q.student_id))

    # 6. Temporal Activity (Weekly breakdown over past 4 weeks)
    now = datetime.utcnow()
    weekly_buckets = {}
    for i in range(4):
        w_start = now - timedelta(days=(i + 1) * 7)
        w_end = now - timedelta(days=i * 7)
        w_label = f"Week {4 - i}"
        
        w_views = sum(1 for v in view_logs if v.created_at and w_start <= v.created_at < w_end)
        w_flags = sum(1 for f in flags if f.created_at and w_start <= f.created_at < w_end)
        w_ai = sum(1 for q in questions if q.asked_at and w_start <= q.asked_at < w_end)
        
        weekly_buckets[w_label] = {
            "views": w_views,
            "flags": w_flags,
            "ai_questions": w_ai
        }

    # 7. Unit-Level Crossover Profiles
    unit_crossover_profiles = compute_unit_learning_assessment_crossover(course_id, db)

    return CourseLearningOverview(
        course_id=course_id,
        course_title=course_title,
        enrolled_students=total_enrolled,
        active_learners_30d=active_learners_30d,
        total_materials=total_materials,
        materials_viewed_count=materials_viewed_count,
        materials_completed_count=total_completed_instances,
        average_material_completion_percentage=avg_completion_pct,
        average_revisit_frequency=avg_revisit_freq,
        total_flags=total_flags,
        unresolved_flags=unresolved_flags,
        flag_resolution_rate_percentage=flag_resolution_pct,
        ask_ai_questions_count=ask_ai_questions_count,
        unique_students_asking_ai=unique_students_asking_ai,
        top_flagged_materials=top_flagged_list,
        top_revisited_materials=top_revisited_list,
        temporal_activity=weekly_buckets,
        unit_crossover_profiles=unit_crossover_profiles
    )


def compute_unit_learning_assessment_crossover(course_id: int, db: Session) -> List[UnitLearningAssessmentCrossover]:
    """
    Computes multi-source learning behaviour and assessment crossover for each unit in a course.
    """
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc()).all()
    if not units:
        return []

    enrollments_count = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.is_active == True
    ).count()

    # Pre-fetch course exams
    exams = db.query(ALExam).filter(ALExam.course_id == course_id).all()
    exam_ids = [e.id for e in exams]

    # Pre-fetch questions with units
    exam_questions = db.query(ALQuestion).filter(
        ALQuestion.exam_id.in_(exam_ids)
    ).all() if exam_ids else []

    # Map exams & submissions
    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id.in_(exam_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all() if exam_ids else []

    sub_map = {s.id: s for s in submissions}
    sub_ids = list(sub_map.keys())

    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []

    ans_by_q: Dict[int, List[ALStudentAnswer]] = {}
    for a in answers:
        ans_by_q.setdefault(a.question_id, []).append(a)

    exam_type_by_exam_id = {e.id: getattr(e.exam_type, "value", str(e.exam_type)) for e in exams}

    crossover_list: List[UnitLearningAssessmentCrossover] = []

    for u_idx_loop, u in enumerate(units):
        # 1. Unit Lessons & Materials
        u_lessons = db.query(Lesson).filter(Lesson.unit_id == u.id).all()
        u_lesson_ids = [l.id for l in u_lessons]

        u_materials = db.query(Material).filter(Material.lesson_id.in_(u_lesson_ids)).all() if u_lesson_ids else []
        u_mat_ids = [m.id for m in u_materials]
        total_u_mats = len(u_materials)

        # 2. Material Progress in Unit
        u_progress = db.query(StudentMaterialProgress).filter(
            StudentMaterialProgress.material_id.in_(u_mat_ids)
        ).all() if u_mat_ids else []

        completed_cnt = sum(1 for p in u_progress if p.is_completed)
        possible_cnt = total_u_mats * enrollments_count
        u_completion_pct = safe_percentage(completed_cnt, possible_cnt, default=None) if possible_cnt > 0 else None

        # 3. Views & Flags in Unit
        u_views = db.query(ActivityLog).filter(
            ActivityLog.action == "view_material",
            ActivityLog.entity_type == "material",
            ActivityLog.entity_id.in_(u_mat_ids)
        ).count() if u_mat_ids else len(u_progress)

        u_flags = db.query(MaterialFlag).filter(
            MaterialFlag.material_id.in_(u_mat_ids)
        ).all() if u_mat_ids else []

        total_u_flags = len(u_flags)
        unresolved_u_flags = sum(1 for f in u_flags if not f.is_resolved)

        # 4. Ask AI Questions in Unit
        u_questions = db.query(StudentQuestion).filter(
            StudentQuestion.course_material_id.in_(u_mat_ids)
        ).all() if u_mat_ids else []
        ask_ai_cnt = len(u_questions)

        # 5. Assessment Performance (MCQ, Structured, Essay)
        # Questions belonging to this unit or mapped from course-wide exams
        u_unit_questions = []
        mcq_scores: List[float] = []
        str_scores: List[float] = []
        esy_scores: List[float] = []

        for q in exam_questions:
            t_type_str = getattr(q.template_type, "value", str(q.template_type)) if q.template_type else None
            mapped_idx = map_question_to_unit_index(q.question_number, t_type_str, q.exam_id, len(units))
            if mapped_idx != u_idx_loop:
                continue

            u_unit_questions.append(q)
            q_answers = ans_by_q.get(q.id, [])
            if not q_answers:
                continue

            e_type = exam_type_by_exam_id.get(q.exam_id, "")
            pts = float(q.points or 1.0)

            for a in q_answers:
                sc = float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0)
                pct = safe_percentage(sc, pts, default=0.0) if pts > 0 else 0.0

                if "mcq" in e_type:
                    mcq_scores.append(pct)
                elif "structured" in e_type:
                    str_scores.append(pct)
                elif "essay" in e_type:
                    esy_scores.append(pct)

        mcq_avg = round(statistics.mean(mcq_scores), 1) if mcq_scores else None
        str_avg = round(statistics.mean(str_scores), 1) if str_scores else None
        esy_avg = round(statistics.mean(esy_scores), 1) if esy_scores else None

        all_scores = mcq_scores + str_scores + esy_scores
        total_attempts = len(all_scores)
        attainment_avg = round(statistics.mean(all_scores), 1) if all_scores else None

        # Determine Evidence State (Phase V5.3)
        has_learning = bool(u_completion_pct is not None and u_completion_pct > 0)
        has_assessment = bool(attainment_avg is not None)

        if not has_learning and not has_assessment:
            evidence_st = "NO_DATA"
        elif has_learning and not has_assessment:
            evidence_st = "LEARNING_ONLY"
        elif not has_learning and has_assessment:
            evidence_st = "ASSESSMENT_ONLY"
        elif total_attempts < 5:
            evidence_st = "LIMITED_DATA"
        elif total_attempts >= 10 and (u_completion_pct or 0) >= 50.0:
            evidence_st = "STRONG_EVIDENCE"
        else:
            evidence_st = "EVIDENCE_AVAILABLE"

        # 6. Evidence-Based Support Signals
        signals: List[str] = []
        if total_u_flags >= 5 or unresolved_u_flags >= 3:
            signals.append(f"Elevated difficulty flags ({total_u_flags} flags, {unresolved_u_flags} unresolved)")
        if ask_ai_cnt >= 10:
            signals.append(f"High Ask AI inquiry volume ({ask_ai_cnt} questions)")
        if mcq_avg is not None and mcq_avg < 50.0:
            signals.append(f"Below-average MCQ performance ({mcq_avg}%)")
        if str_avg is not None and str_avg < 50.0:
            signals.append(f"Below-average Structured performance ({str_avg}%)")
        if (total_u_flags >= 3 or ask_ai_cnt >= 5) and ((mcq_avg and mcq_avg < 55.0) or (str_avg and str_avg < 55.0)):
            signals.append("Support crossover: elevated questions/flags align with lower assessment attainment")

        crossover_list.append(
            UnitLearningAssessmentCrossover(
                unit_id=u.id,
                unit_title=u.title,
                total_materials=total_u_mats,
                materials_viewed_count=len([mid for mid in u_mat_ids if any(p.material_id == mid for p in u_progress)]),
                materials_completed_count=completed_cnt,
                material_completion_percentage=u_completion_pct,
                total_material_views=u_views,
                total_flags=total_u_flags,
                unresolved_flags=unresolved_u_flags,
                ask_ai_questions_count=ask_ai_cnt,
                questions_count=len(u_unit_questions),
                attempts_count=total_attempts,
                attainment_percentage=attainment_avg,
                mcq_average_percentage=mcq_avg,
                structured_average_percentage=str_avg,
                essay_average_percentage=esy_avg,
                evidence_state=evidence_st,
                support_signals=signals
            )
        )

    return crossover_list
