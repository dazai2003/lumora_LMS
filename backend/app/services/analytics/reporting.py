"""
Comprehensive Course Analytics Reporting & Export Service.
Generates multi-layer analytical reports and CSV exports synthesizing
participation, assessment psychometrics, difficulty hotspots, and recommended actions.
"""
from typing import List, Dict, Any, Optional
import io
import csv
import statistics
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models import (
    User, Course, Unit, Lesson, Material, StudentMaterialProgress, MaterialFlag,
    StudentQuestion, Enrollment, ALExam, ALExamType, ALStudentSubmission,
    ALStudentAnswer, ALQuestion, ALQuestionTemplate, CognitiveLevel
)
from app.services.analytics.data_contracts import (
    CourseComprehensiveReport, AssessmentHighlightItem, ContentHotspotIntelligence, ActionableTargetLink
)
from app.services.analytics.normalization import safe_div, safe_percentage, normalize_cognitive_level
from app.services.analytics.learning_intelligence import compute_teacher_learning_intelligence


def generate_course_analytics_report(
    course_id: int,
    db: Session
) -> CourseComprehensiveReport:
    """
    Generates a full comprehensive course analytical report connecting
    participation KPIs, assessment results, item difficulty, learning hotspots,
    and recommended teacher actions.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    course_title = course.title if course else f"Course #{course_id}"

    # Enrolled students
    enrollments_count = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.is_active == True
    ).count()

    # Lessons, Materials, and Progress
    lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
    lesson_ids = [l.id for l in lessons]
    materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
    mat_ids = [m.id for m in materials]

    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    active_learners_count = db.query(StudentMaterialProgress.student_id).filter(
        StudentMaterialProgress.material_id.in_(mat_ids),
        StudentMaterialProgress.updated_at >= thirty_days_ago
    ).distinct().count() if mat_ids else 0
    
    total_prog = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.material_id.in_(mat_ids)
    ).all() if mat_ids else []
    completed_mat_cnt = sum(1 for p in total_prog if p.is_completed)
    total_possible_mat = len(materials) * enrollments_count
    avg_mat_completion = safe_percentage(completed_mat_cnt, total_possible_mat, default=0.0) if total_possible_mat > 0 else 0.0

    # Flags & AI queries
    flags = db.query(MaterialFlag).filter(MaterialFlag.material_id.in_(mat_ids)).all() if mat_ids else []
    total_flags = len(flags)
    unresolved_flags = sum(1 for f in flags if not f.is_resolved)

    ai_questions = db.query(StudentQuestion).filter(StudentQuestion.course_id == course_id).all()
    total_ai_questions = len(ai_questions)

    # Exams & Submissions
    exams = db.query(ALExam).filter(ALExam.course_id == course_id).all()
    exam_ids = [e.id for e in exams]

    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id.in_(exam_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all() if exam_ids else []

    all_scores = [float(s.percentage) for s in submissions if s.percentage is not None]
    course_avg_score = round(statistics.mean(all_scores), 1) if all_scores else None

    # Course-wide Grade Distribution
    grades_count = {"A": 0, "B": 0, "C": 0, "S": 0, "F": 0}
    for s in submissions:
        g = str(s.grade or "").strip().upper()
        if g in grades_count:
            grades_count[g] += 1
        elif s.percentage is not None:
            pct = float(s.percentage)
            if pct >= 75.0:
                grades_count["A"] += 1
            elif pct >= 65.0:
                grades_count["B"] += 1
            elif pct >= 55.0:
                grades_count["C"] += 1
            elif pct >= 35.0:
                grades_count["S"] += 1
            else:
                grades_count["F"] += 1

    # Assessment highlights
    highlights: List[AssessmentHighlightItem] = []
    for ex in exams:
        ex_subs = [s for s in submissions if s.exam_id == ex.id]
        ex_scores = [float(s.percentage) for s in ex_subs if s.percentage is not None]
        avg_sc = round(statistics.mean(ex_scores), 1) if ex_scores else None
        pass_cnt = sum(1 for sc in ex_scores if sc >= 50.0)
        pass_rate = safe_percentage(pass_cnt, len(ex_scores), default=None)

        ex_type_str = getattr(ex.exam_type, "value", str(ex.exam_type)).replace("_", " ").upper()
        highlights.append(
            AssessmentHighlightItem(
                exam_id=ex.id,
                exam_title=ex.title,
                exam_type=ex_type_str,
                submissions_count=len(ex_subs),
                average_score_percentage=avg_sc,
                pass_rate_percentage=pass_rate
            )
        )

    # Top difficult questions
    all_questions = db.query(ALQuestion).filter(ALQuestion.exam_id.in_(exam_ids)).all() if exam_ids else []
    answers = db.query(ALStudentAnswer).join(
        ALStudentSubmission, ALStudentAnswer.submission_id == ALStudentSubmission.id
    ).filter(
        ALStudentSubmission.exam_id.in_(exam_ids)
    ).all() if exam_ids else []

    ans_by_q: Dict[int, List[ALStudentAnswer]] = {}
    for a in answers:
        ans_by_q.setdefault(a.question_id, []).append(a)

    difficult_questions: List[Dict[str, Any]] = []
    for q in all_questions:
        q_ans = ans_by_q.get(q.id, [])
        if len(q_ans) < 3:
            continue
        scores = [float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0) for a in q_ans]
        q_pts = float(q.points or 1.0)
        avg_pct = safe_percentage(statistics.mean(scores), q_pts, default=0.0)
        
        if avg_pct < 50.0:
            ex_obj = next((e for e in exams if e.id == q.exam_id), None)
            difficult_questions.append({
                "question_id": q.id,
                "question_number": q.question_number or 1,
                "exam_title": ex_obj.title if ex_obj else f"Exam #{q.exam_id}",
                "template_type": getattr(q.template_type, "value", str(q.template_type)),
                "cognitive_level": normalize_cognitive_level(q.cognitive_level).capitalize(),
                "average_score_percentage": avg_pct,
                "attempts_count": len(q_ans)
            })

    difficult_questions.sort(key=lambda x: x["average_score_percentage"])

    # Learning Intelligence integration
    intel_report = compute_teacher_learning_intelligence(course_id, db)

    # Syllabus Breakdown
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc()).all()
    syllabus_breakdown: List[Dict[str, Any]] = []
    for u in units:
        matching_hotspot = next((h for h in intel_report.hotspots if h.unit_id == u.id), None)
        syllabus_breakdown.append({
            "unit_id": u.id,
            "unit_title": u.title,
            "material_completion_pct": matching_hotspot.material_completion_pct if matching_hotspot else None,
            "assessment_score_pct": matching_hotspot.assessment_score_pct if matching_hotspot else None,
            "priority_level": matching_hotspot.priority_level if matching_hotspot else "NOT_STARTED",
            "flags_count": matching_hotspot.flags_count if matching_hotspot else 0,
            "ai_inquiries_count": matching_hotspot.ai_inquiries_count if matching_hotspot else 0
        })

    # Recommended Actions
    actions: List[ActionableTargetLink] = [
        ActionableTargetLink(label="Review Materials", target_url="/dashboard/teacher/materials", action_type="review_material"),
        ActionableTargetLink(label="Inspect Exam Items", target_url=f"/dashboard/teacher/al-exams/analytics?exam_id={exam_ids[0]}" if exam_ids else "/dashboard/teacher/al-exams", action_type="inspect_item"),
        ActionableTargetLink(label="Open Ask AI Inquiries", target_url="/dashboard/teacher/analytics?tab=ai_insights", action_type="ask_ai"),
    ]

    return CourseComprehensiveReport(
        course_id=course_id,
        course_title=course_title,
        enrolled_students=enrollments_count,
        active_learners_30d=active_learners_count,
        average_material_completion=avg_mat_completion,
        assessments_conducted=len(exams),
        total_submissions=len(submissions),
        course_average_score=course_avg_score,
        total_material_flags=total_flags,
        unresolved_flags=unresolved_flags,
        total_ai_questions=total_ai_questions,
        executive_summary=intel_report.executive_summary_narrative,
        assessment_highlights=highlights,
        grade_distribution=grades_count,
        top_difficult_questions=difficult_questions[:5],
        syllabus_breakdown=syllabus_breakdown,
        learning_hotspots=intel_report.hotspots,
        recommended_teacher_actions=actions,
        ai_narrative_status="deterministic_ready"
    )


def generate_course_analytics_csv(
    course_id: int,
    db: Session,
    export_type: str = "course_summary",
    unit_id: Optional[int] = None,
    exam_id: Optional[int] = None,
    student_id: Optional[int] = None
) -> str:
    """
    Generates a deterministic tabular CSV export for the course analytics dataset
    tailored to the requested export scope (course_summary, student_roster,
    assessment_items, unit_analytics, material_analytics, flag_data).
    """
    output = io.StringIO()
    writer = csv.writer(output)

    course = db.query(Course).filter(Course.id == course_id).first()
    course_title = course.title if course else f"Course #{course_id}"
    exported_at_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    # ─────────────────────────────────────────────────────────────
    # 1. STUDENT ROSTER CSV EXPORT
    # ─────────────────────────────────────────────────────────────
    if export_type == "student_roster":
        writer.writerow(["Lumora LMS — Student Roster & Academic Monitoring Report"])
        writer.writerow(["Course", course_title])
        writer.writerow(["Exported At", exported_at_str])
        writer.writerow([])
        writer.writerow([
            "Student ID", "Student Name", "Email", "Enrolled Date",
            "Effective Assessment %", "Material Completion %",
            "Unresolved Flags", "AI Inquiries", "Status Diagnostic", "Diagnostic Reason"
        ])

        enrollments = db.query(Enrollment).filter(
            Enrollment.course_id == course_id,
            Enrollment.is_active == True
        ).all()
        student_ids = [e.student_id for e in enrollments]

        students = db.query(User).filter(User.id.in_(student_ids)).all() if student_ids else []
        student_map = {s.id: s for s in students}

        exams = db.query(ALExam).filter(ALExam.course_id == course_id).all()
        exam_ids = [e.id for e in exams]
        submissions = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.exam_id.in_(exam_ids),
            ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
        ).all() if exam_ids else []

        lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
        lesson_ids = [l.id for l in lessons]
        materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
        mat_ids = [m.id for m in materials]
        progress_records = db.query(StudentMaterialProgress).filter(
            StudentMaterialProgress.material_id.in_(mat_ids)
        ).all() if mat_ids else []

        flags = db.query(MaterialFlag).filter(
            MaterialFlag.material_id.in_(mat_ids)
        ).all() if mat_ids else []

        ai_questions = db.query(StudentQuestion).filter(
            StudentQuestion.course_id == course_id
        ).all()

        for enr in enrollments:
            s_obj = student_map.get(enr.student_id)
            if not s_obj:
                continue

            s_subs = [s for s in submissions if s.student_id == s_obj.id and s.percentage is not None]
            s_scores = [float(s.percentage) for s in s_subs if s.percentage is not None]
            s_avg_score = round(statistics.mean(s_scores), 1) if s_scores else None

            s_progs = [p for p in progress_records if p.student_id == s_obj.id and p.is_completed]
            s_mat_pct = safe_percentage(len(s_progs), len(materials), default=0.0) if materials else 0.0

            s_open_flags = sum(1 for f in flags if f.student_id == s_obj.id and not f.is_resolved)
            s_ai_cnt = sum(1 for q in ai_questions if q.student_id == s_obj.id)

            # Diagnostic
            has_activity = bool(s_mat_pct > 0 or s_scores or s_open_flags > 0 or s_ai_cnt > 0)
            if not has_activity:
                status_code = "NO_ACTIVITY"
                reason = "No materials, assessments, or interactions recorded"
            elif s_avg_score is None:
                status_code = "LIMITED_DATA"
                reason = "Coursework in progress but no assessment submissions recorded"
            elif s_avg_score < 50.0 or s_open_flags >= 2:
                status_code = "NEEDS_ATTENTION"
                reason = f"Assessment score {s_avg_score or 0}% or {s_open_flags} open flags"
            elif s_avg_score >= 65.0 and s_mat_pct >= 40.0:
                status_code = "ON_TRACK"
                reason = f"Consistent attainment ({s_avg_score}%) and {s_mat_pct}% completion"
            else:
                status_code = "ACTIVE"
                reason = "Active student participation with developing evidence"

            writer.writerow([
                s_obj.id,
                s_obj.full_name,
                s_obj.email,
                enr.enrolled_at.strftime("%Y-%m-%d") if enr.enrolled_at else "N/A",
                f"{s_avg_score}%" if s_avg_score is not None else "No data",
                f"{s_mat_pct}%",
                s_open_flags,
                s_ai_cnt,
                status_code,
                reason
            ])

        return output.getvalue()

    # ─────────────────────────────────────────────────────────────
    # 2. ASSESSMENT ITEM ANALYSIS CSV EXPORT
    # ─────────────────────────────────────────────────────────────
    if export_type == "assessment_items":
        writer.writerow(["Lumora LMS — Assessment Item Analysis & Psychometrics Report"])
        writer.writerow(["Course", course_title])
        writer.writerow(["Exported At", exported_at_str])
        writer.writerow([])
        writer.writerow([
            "Exam Title", "Question #", "Template Type", "Cognitive Level",
            "Max Points", "Attempts Count", "Average Score %", "Difficulty Classification"
        ])

        exam_query = db.query(ALExam).filter(ALExam.course_id == course_id)
        if exam_id:
            exam_query = exam_query.filter(ALExam.id == exam_id)
        exams = exam_query.all()
        exam_ids = [e.id for e in exams]

        questions = db.query(ALQuestion).filter(ALQuestion.exam_id.in_(exam_ids)).order_by(ALQuestion.question_number.asc()).all() if exam_ids else []
        answers = db.query(ALStudentAnswer).join(
            ALStudentSubmission, ALStudentAnswer.submission_id == ALStudentSubmission.id
        ).filter(
            ALStudentSubmission.exam_id.in_(exam_ids)
        ).all() if exam_ids else []

        ans_by_q: Dict[int, List[ALStudentAnswer]] = {}
        for a in answers:
            ans_by_q.setdefault(a.question_id, []).append(a)

        for q in questions:
            ex_obj = next((e for e in exams if e.id == q.exam_id), None)
            q_ans = ans_by_q.get(q.id, [])
            scores = [float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0) for a in q_ans]
            q_pts = float(q.points or 1.0)
            avg_pct = safe_percentage(statistics.mean(scores), q_pts, default=None) if scores else None

            if avg_pct is None:
                diff_class = "No data"
            elif avg_pct < 40.0:
                diff_class = "Hard (Low Attainment)"
            elif avg_pct <= 70.0:
                diff_class = "Moderate"
            else:
                diff_class = "Easy (High Attainment)"

            writer.writerow([
                ex_obj.title if ex_obj else f"Exam #{q.exam_id}",
                q.question_number or 1,
                getattr(q.template_type, "value", str(q.template_type)),
                normalize_cognitive_level(q.cognitive_level).capitalize(),
                q_pts,
                len(q_ans),
                f"{avg_pct}%" if avg_pct is not None else "N/A",
                diff_class
            ])

        return output.getvalue()

    # ─────────────────────────────────────────────────────────────
    # 3. UNIT ANALYTICS CSV EXPORT
    # ─────────────────────────────────────────────────────────────
    if export_type == "unit_analytics":
        writer.writerow(["Lumora LMS — Syllabus Unit Intelligence Report"])
        writer.writerow(["Course", course_title])
        writer.writerow(["Exported At", exported_at_str])
        writer.writerow([])
        writer.writerow([
            "Unit #", "Unit Title", "Material Completion %",
            "Assessment Attainment %", "Difficulty Flags", "Ask AI Queries", "Evidence Status"
        ])

        intel_report = compute_teacher_learning_intelligence(course_id, db)
        for idx, h in enumerate(intel_report.hotspots, start=1):
            writer.writerow([
                idx,
                h.unit_title,
                f"{h.material_completion_pct}%" if h.material_completion_pct is not None else "0%",
                f"{h.assessment_score_pct}%" if h.assessment_score_pct is not None else "N/A",
                h.flags_count,
                h.ai_inquiries_count,
                h.priority_level
            ])

        return output.getvalue()

    # ─────────────────────────────────────────────────────────────
    # 4. MATERIAL ANALYTICS CSV EXPORT
    # ─────────────────────────────────────────────────────────────
    if export_type == "material_analytics":
        writer.writerow(["Lumora LMS — Learning Resource & Material Intelligence Report"])
        writer.writerow(["Course", course_title])
        writer.writerow(["Exported At", exported_at_str])
        writer.writerow([])
        writer.writerow([
            "Material Title", "Type", "Lesson ID", "Total Views",
            "Completed Count", "Completion Rate %", "Total Flags", "Unresolved Flags"
        ])

        lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
        lesson_ids = [l.id for l in lessons]
        materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
        mat_ids = [m.id for m in materials]

        progress_records = db.query(StudentMaterialProgress).filter(
            StudentMaterialProgress.material_id.in_(mat_ids)
        ).all() if mat_ids else []

        flags = db.query(MaterialFlag).filter(
            MaterialFlag.material_id.in_(mat_ids)
        ).all() if mat_ids else []

        enrollments_count = db.query(Enrollment).filter(
            Enrollment.course_id == course_id,
            Enrollment.is_active == True
        ).count()

        for m in materials:
            m_progs = [p for p in progress_records if p.material_id == m.id]
            m_comp_cnt = sum(1 for p in m_progs if p.is_completed)
            m_comp_pct = safe_percentage(m_comp_cnt, enrollments_count, default=0.0) if enrollments_count > 0 else 0.0
            m_flags = [f for f in flags if f.material_id == m.id]
            m_unres_flags = sum(1 for f in m_flags if not f.is_resolved)

            writer.writerow([
                m.title,
                getattr(m.material_type, "value", str(m.material_type)),
                m.lesson_id or "—",
                len(m_progs),
                m_comp_cnt,
                f"{m_comp_pct}%",
                len(m_flags),
                m_unres_flags
            ])

        return output.getvalue()

    # ─────────────────────────────────────────────────────────────
    # 5. DIFFICULTY FLAGS CSV EXPORT
    # ─────────────────────────────────────────────────────────────
    if export_type == "flag_data":
        writer.writerow(["Lumora LMS — Material Difficulty Flags & Student Feedback Report"])
        writer.writerow(["Course", course_title])
        writer.writerow(["Exported At", exported_at_str])
        writer.writerow([])
        writer.writerow([
            "Flag ID", "Material Title", "Student Name", "Context Location",
            "Student Comment", "Status", "Teacher Reply", "Logged At"
        ])

        lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
        lesson_ids = [l.id for l in lessons]
        materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
        mat_map = {m.id: m for m in materials}
        mat_ids = list(mat_map.keys())

        flags = db.query(MaterialFlag).filter(
            MaterialFlag.material_id.in_(mat_ids)
        ).order_by(MaterialFlag.created_at.desc()).all() if mat_ids else []

        student_ids = list({f.student_id for f in flags})
        students = db.query(User).filter(User.id.in_(student_ids)).all() if student_ids else []
        student_map = {s.id: s for s in students}

        for f in flags:
            mat = mat_map.get(f.material_id)
            stu = student_map.get(f.student_id)
            loc = f.context or f.context_type or "Document Level"

            writer.writerow([
                f.id,
                mat.title if mat else f"Material #{f.material_id}",
                stu.full_name if stu else f"Student #{f.student_id}",
                loc,
                f.comment or "No comment provided",
                "Resolved" if f.is_resolved else "Open",
                f.teacher_reply or "—",
                f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else "N/A"
            ])

        return output.getvalue()

    # ─────────────────────────────────────────────────────────────
    # 6. DEFAULT: COURSE SUMMARY CSV EXPORT
    # ─────────────────────────────────────────────────────────────
    writer.writerow(["Lumora LMS — Course Comprehensive Analytics Dossier"])
    writer.writerow(["Course Title", course_title])
    writer.writerow(["Exported At", exported_at_str])
    writer.writerow([])

    # Syllabus Unit Mastery Table
    writer.writerow(["--- SYLLABUS UNIT PERFORMANCE ---"])
    writer.writerow(["Unit Title", "Material Completion %", "Assessment Attainment %", "Difficulty Flags", "Ask AI Queries", "Priority Level"])

    intel_report = compute_teacher_learning_intelligence(course_id, db)
    for h in intel_report.hotspots:
        writer.writerow([
            h.unit_title,
            f"{h.material_completion_pct}%" if h.material_completion_pct is not None else "0%",
            f"{h.assessment_score_pct}%" if h.assessment_score_pct is not None else "N/A",
            h.flags_count,
            h.ai_inquiries_count,
            h.priority_level
        ])
    writer.writerow([])

    # Assessment Highlights Table
    writer.writerow(["--- ASSESSMENT SUMMARY ---"])
    writer.writerow(["Assessment Title", "Paper Type", "Submissions", "Average Score %", "Pass Rate %"])
    
    exams = db.query(ALExam).filter(ALExam.course_id == course_id).all()
    exam_ids = [e.id for e in exams]
    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id.in_(exam_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all() if exam_ids else []

    for ex in exams:
        ex_subs = [s for s in submissions if s.exam_id == ex.id]
        scores = [float(s.percentage) for s in ex_subs if s.percentage is not None]
        avg_sc = round(statistics.mean(scores), 1) if scores else "N/A"
        pass_cnt = sum(1 for sc in scores if sc >= 50.0)
        pass_rate = f"{round((pass_cnt / len(scores)) * 100, 1)}%" if scores else "N/A"
        ex_type_str = getattr(ex.exam_type, "value", str(ex.exam_type)).replace("_", " ").upper()
        writer.writerow([ex.title, ex_type_str, len(ex_subs), f"{avg_sc}%" if avg_sc != "N/A" else "N/A", pass_rate])

    return output.getvalue()

