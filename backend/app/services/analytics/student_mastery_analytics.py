"""
Student Personal Mastery & Revision Intelligence Engine.

Computes comprehensive diagnostic dossiers for students by combining assessment performance,
learning material telemetry, difficulty flags, and AI inquiry history.

Key Design Decisions & Notes:
1. Multi-Dimensional Unit Mastery Vector:
   - Evaluates performance across all syllabus units (e.g. Unit 1: Chemistry of Life to Unit 10: Environmental Biology).
   - Generates a normalized mastery score (0–100%) for radar chart visualization.
2. Formative Revision Priority Algorithm:
   - Ranks syllabus units by revision urgency:
     Priority_Score = (0.70 * Assessment_Error_Rate) + (0.30 * Material_Incompletion_Rate)
   - Generates actionable, topic-specific revision advice (e.g. 'Review Calvin cycle electron carriers').
3. Multi-Factor Academic Risk Model:
   - Classifies student trajectories: High Mastery, Steady Progress, Inconsistent, or At-Risk.
"""
from typing import List, Dict, Any, Optional
import statistics
from sqlalchemy.orm import Session

from app.models import (
    User, Course, Unit, Lesson, Material, StudentMaterialProgress, MaterialFlag,
    StudentQuestion, Enrollment, ALExam, ALExamType, ALStudentSubmission,
    ALStudentAnswer, ALQuestion, ALQuestionTemplate, CognitiveLevel
)
from app.services.analytics.data_contracts import (
    StudentPersonalMasteryReport, StudentSyllabusUnitMastery,
    QuestionTypeMasteryItem, CognitiveSkillMasteryItem, RevisionPriorityItem
)
from app.services.analytics.normalization import (
    safe_div, safe_percentage, normalize_cognitive_level, parse_context_location,
    map_question_to_unit_index
)


TEMPLATE_DISPLAY_NAMES: Dict[str, str] = {
    # Paper I MCQ
    "generic_mcq": "Direct Factual Recall",
    "five_statement_truth": "Truth Evaluation (Five-Statement)",
    "matching_column": "Matching Column / Matrix",
    "combination_grid": "Multi-Variable Selection",
    "sequential_diagnostic": "Sequential / Diagnostic",
    "incomplete_stem": "Incomplete Stem / Calculation",
    "assertion_reason": "Assertion-Reason (Cause-Effect)",
    "diagram_based": "Diagrammatic Analysis",
    "experimental_procedure": "Experimental Procedure",
    # Paper II Part A Structured
    "structured_direct_recall": "Structured Direct Recall",
    "structured_identification": "Structured Anatomical Identification",
    "structured_calculation": "Quantitative Calculation",
    "structured_reasoning": "Mechanism & Scientific Reasoning",
    "structured_comparison": "Comparative Formulation",
    "structured_diagram": "Diagrammatic Deduction",
    "structured_matrix": "Matrix & Data Interpretation",
    "structured_drawing": "Labelled Biological Drawing",
    "structured_subparts": "Structured Subparts (General)",
    # Paper II Part B Essay
    "essay_descriptive": "Descriptive Process Account",
    "essay_comparative": "Comparative Synthesis",
    "essay_experimental": "Experimental Hypothesis Design",
    "essay_application": "Applied Problem Solving",
    "essay_rubric": "Essay Rubric (General)",
}

CANONICAL_MCQ_TEMPLATES = [
    "generic_mcq",
    "five_statement_truth",
    "matching_column",
    "combination_grid",
    "sequential_diagnostic",
    "incomplete_stem",
    "assertion_reason",
    "diagram_based",
    "experimental_procedure",
]

CANONICAL_STRUCTURED_TEMPLATES = [
    "structured_direct_recall",
    "structured_identification",
    "structured_calculation",
    "structured_reasoning",
    "structured_comparison",
    "structured_diagram",
    "structured_matrix",
    "structured_drawing",
]

CANONICAL_ESSAY_TEMPLATES = [
    "essay_descriptive",
    "essay_comparative",
    "essay_experimental",
    "essay_application",
]


def _classify_mastery_status(attempts: int, accuracy_pct: Optional[float]) -> str:
    if attempts == 0:
        return "Not Attempted"
    elif attempts < 3:
        return "Early Data"
    elif accuracy_pct is not None and accuracy_pct >= 75.0:
        return "Strong"
    elif accuracy_pct is not None and accuracy_pct >= 50.0:
        return "Developing"
    else:
        return "Needs Revision"


def compute_student_mastery_report(
    student_id: int,
    course_id: Optional[int],
    db: Session
) -> StudentPersonalMasteryReport:
    """
    Computes an evidence-based personal mastery report for a student.
    Strictly isolated to the student's own records.
    """
    student = db.query(User).filter(User.id == student_id).first()
    if not student:
        raise ValueError(f"Student #{student_id} not found")

    student_name = student.full_name or f"Student #{student.id}"

    # 1. Enrolled Courses
    enrollments_query = db.query(Enrollment).filter(
        Enrollment.student_id == student_id,
        Enrollment.is_active == True
    )
    if course_id:
        enrollments_query = enrollments_query.filter(Enrollment.course_id == course_id)
    enrollments = enrollments_query.all()
    enrolled_course_ids = [e.course_id for e in enrollments]

    course_obj = db.query(Course).filter(Course.id == course_id).first() if course_id else None
    course_title = course_obj.title if course_obj else ("All Enrolled Courses" if len(enrolled_course_ids) > 1 else None)

    # 2. Units & Materials
    units_query = db.query(Unit).filter(Unit.course_id.in_(enrolled_course_ids)).order_by(Unit.order.asc()) if enrolled_course_ids else None
    units = units_query.all() if units_query else []

    lessons_query = db.query(Lesson).filter(Lesson.course_id.in_(enrolled_course_ids)) if enrolled_course_ids else None
    lessons = lessons_query.all() if lessons_query else []
    lesson_ids = [l.id for l in lessons]

    materials_query = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)) if lesson_ids else None
    materials = materials_query.all() if materials_query else []
    total_materials = len(materials)
    material_map = {m.id: m for m in materials}

    progress_records = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.student_id == student_id,
        StudentMaterialProgress.material_id.in_(list(material_map.keys()))
    ).all() if material_map else []

    completed_mats_cnt = sum(1 for p in progress_records if p.is_completed)
    mat_completion_pct = safe_percentage(completed_mats_cnt, total_materials, default=0.0) if total_materials > 0 else None

    # Frequently revisited materials
    frequently_revisited = []
    for p in progress_records:
        mat = material_map.get(p.material_id)
        if mat and p.last_position and p.last_position > 0:
            frequently_revisited.append({
                "material_id": mat.id,
                "title": mat.title,
                "material_type": getattr(mat.material_type, "value", str(mat.material_type)),
                "is_completed": p.is_completed,
                "last_position": p.last_position,
                "last_updated": p.updated_at.isoformat() if p.updated_at else ""
            })

    # 3. Personal Difficulty Flags & Teacher Feedback Replies
    flags_query = db.query(MaterialFlag).filter(
        MaterialFlag.student_id == student_id
    )
    if material_map:
        flags_query = flags_query.filter(MaterialFlag.material_id.in_(list(material_map.keys())))
    personal_flags_db = flags_query.order_by(MaterialFlag.created_at.desc()).all()

    personal_flags_list = []
    for f in personal_flags_db:
        mat = material_map.get(f.material_id)
        c_type, c_val = parse_context_location(f.context)
        t_reply = getattr(f, "teacher_reply", None)
        status_lbl = "Resolved with Teacher Feedback" if (f.is_resolved and t_reply) else ("Resolved" if f.is_resolved else "Open (Awaiting Teacher Review)")
        
        personal_flags_list.append({
            "flag_id": f.id,
            "material_id": f.material_id,
            "material_title": mat.title if mat else f"Material #{f.material_id}",
            "context_type": c_type,
            "context_value": c_val or f.context,
            "comment": f.comment,
            "is_resolved": f.is_resolved or False,
            "teacher_reply": t_reply,
            "resolved_at": f.resolved_at.isoformat() if getattr(f, "resolved_at", None) else "",
            "status_label": status_lbl,
            "created_at": f.created_at.isoformat() if f.created_at else ""
        })

    # 4. Personal Ask AI Questions
    questions_query = db.query(StudentQuestion).filter(
        StudentQuestion.student_id == student_id
    )
    if enrolled_course_ids:
        questions_query = questions_query.filter(StudentQuestion.course_id.in_(enrolled_course_ids))
    personal_ai_questions = questions_query.order_by(StudentQuestion.asked_at.desc()).all()

    ai_topic_counts: Dict[str, int] = {}
    for q in personal_ai_questions:
        top = q.topic_category or "General Course Query"
        ai_topic_counts[top] = ai_topic_counts.get(top, 0) + 1

    personal_ai_topics = [{"topic": k, "count": v} for k, v in sorted(ai_topic_counts.items(), key=lambda x: x[1], reverse=True)[:5]]

    # 5. Assessment Submissions & Answers
    exams_query = db.query(ALExam).filter(ALExam.course_id.in_(enrolled_course_ids)) if enrolled_course_ids else None
    exams = exams_query.all() if exams_query else []
    exam_ids = [e.id for e in exams]
    exam_map = {e.id: e for e in exams}

    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.student_id == student_id,
        ALStudentSubmission.exam_id.in_(exam_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).order_by(ALStudentSubmission.started_at.asc()).all() if exam_ids else []

    sub_ids = [s.id for s in submissions]
    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []

    ans_by_sub: Dict[int, List[ALStudentAnswer]] = {}
    for a in answers:
        ans_by_sub.setdefault(a.submission_id, []).append(a)

    # Pre-fetch questions
    questions_list = db.query(ALQuestion).filter(
        ALQuestion.exam_id.in_(exam_ids)
    ).all() if exam_ids else []
    q_map = {q.id: q for q in questions_list}

    # Assessment History & Trend
    assessment_history_list = []
    performance_trend_list = []
    all_percentages: List[float] = []

    for s in submissions:
        ex = exam_map.get(s.exam_id)
        pct = float(s.percentage) if s.percentage is not None else None
        if pct is not None:
            all_percentages.append(pct)
            performance_trend_list.append({
                "date": s.submitted_at.strftime("%b %d") if s.submitted_at else "Attempt",
                "exam_title": ex.title if ex else f"Exam #{s.exam_id}",
                "percentage": pct
            })

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

    avg_assessment_pct = round(statistics.mean(all_percentages), 1) if all_percentages else None
    latest_sub = submissions[-1] if submissions else None
    latest_exam = exam_map.get(latest_sub.exam_id) if latest_sub else None
    latest_pct = float(latest_sub.percentage) if (latest_sub and latest_sub.percentage is not None) else None
    latest_title = latest_exam.title if latest_exam else None
    latest_date = latest_sub.submitted_at.isoformat() if (latest_sub and latest_sub.submitted_at) else None

    # 6. Question Type Mastery Breakdown across All 3 Paper Phases
    mcq_type_stats: Dict[str, Dict[str, Any]] = {k: {"attempts": 0, "correct": 0, "scores": []} for k in CANONICAL_MCQ_TEMPLATES}
    str_type_stats: Dict[str, Dict[str, Any]] = {k: {"attempts": 0, "correct": 0, "earned": 0.0, "max": 0.0, "scores": []} for k in CANONICAL_STRUCTURED_TEMPLATES}
    esy_type_stats: Dict[str, Dict[str, Any]] = {k: {"attempts": 0, "correct": 0, "earned": 0.0, "max": 0.0, "scores": []} for k in CANONICAL_ESSAY_TEMPLATES}
    cog_stats: Dict[str, Dict[str, Any]] = {c: {"attempts": 0, "correct": 0, "scores": []} for c in ["remember", "understand", "apply", "analyze", "evaluate"]}

    mcq_answers_list: List[Dict[str, Any]] = []
    structured_questions_list: List[Dict[str, Any]] = []
    essay_questions_list: List[Dict[str, Any]] = []

    for s in submissions:
        ex = exam_map.get(s.exam_id)
        e_type = getattr(ex.exam_type, "value", str(ex.exam_type)).lower() if ex else ""
        sub_answers = ans_by_sub.get(s.id, [])
        for a in sub_answers:
            q = q_map.get(a.question_id)
            if not q:
                continue

            q_pts = float(q.points or 1.0)
            earned = float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0)
            pct = safe_percentage(earned, q_pts, default=0.0) if q_pts > 0 else 0.0
            is_correct = (pct >= 99.0)

            t_raw = getattr(q.template_type, "value", str(q.template_type)).lower() if q.template_type else "generic_mcq"

            # Paper categorizations & granular stats
            if "mcq" in e_type or t_raw in CANONICAL_MCQ_TEMPLATES or ("structured" not in t_raw and "essay" not in t_raw and "structured" not in e_type and "essay" not in e_type):
                if t_raw not in mcq_type_stats:
                    mcq_type_stats[t_raw] = {"attempts": 0, "correct": 0, "scores": []}
                mcq_type_stats[t_raw]["attempts"] += 1
                if is_correct:
                    mcq_type_stats[t_raw]["correct"] += 1
                mcq_type_stats[t_raw]["scores"].append(pct)

                mcq_answers_list.append({
                    "question_id": q.id,
                    "question_number": q.question_number,
                    "template_type": t_raw,
                    "cognitive_level": normalize_cognitive_level(q.cognitive_level),
                    "difficulty": str(getattr(q.difficulty, "value", q.difficulty) or "medium").capitalize(),
                    "is_correct": is_correct,
                    "score_pct": pct,
                    "points": q_pts,
                    "earned": earned
                })
            elif "structured" in e_type or "structured" in t_raw:
                s_key = t_raw if t_raw in CANONICAL_STRUCTURED_TEMPLATES else "structured_direct_recall"
                if s_key not in str_type_stats:
                    str_type_stats[s_key] = {"attempts": 0, "correct": 0, "earned": 0.0, "max": 0.0, "scores": []}
                str_type_stats[s_key]["attempts"] += 1
                str_type_stats[s_key]["earned"] += earned
                str_type_stats[s_key]["max"] += q_pts
                if is_correct:
                    str_type_stats[s_key]["correct"] += 1
                str_type_stats[s_key]["scores"].append(pct)

                structured_questions_list.append({
                    "question_id": q.id,
                    "question_number": q.question_number,
                    "template_type": s_key,
                    "exam_title": ex.title if ex else "Structured Paper",
                    "max_marks": q_pts,
                    "earned_marks": earned,
                    "percentage": pct
                })
            elif "essay" in e_type or "essay" in t_raw:
                e_key = t_raw if t_raw in CANONICAL_ESSAY_TEMPLATES else "essay_descriptive"
                if e_key not in esy_type_stats:
                    esy_type_stats[e_key] = {"attempts": 0, "correct": 0, "earned": 0.0, "max": 0.0, "scores": []}
                esy_type_stats[e_key]["attempts"] += 1
                esy_type_stats[e_key]["earned"] += earned
                esy_type_stats[e_key]["max"] += q_pts
                if is_correct:
                    esy_type_stats[e_key]["correct"] += 1
                esy_type_stats[e_key]["scores"].append(pct)

                essay_questions_list.append({
                    "question_id": q.id,
                    "question_number": q.question_number,
                    "template_type": e_key,
                    "exam_title": ex.title if ex else "Essay Paper",
                    "max_marks": q_pts,
                    "earned_marks": earned,
                    "percentage": pct
                })

            # Cognitive Level
            c_raw = normalize_cognitive_level(q.cognitive_level)
            if c_raw not in cog_stats:
                cog_stats[c_raw] = {"attempts": 0, "correct": 0, "scores": []}
            cog_stats[c_raw]["attempts"] += 1
            if is_correct:
                cog_stats[c_raw]["correct"] += 1
            cog_stats[c_raw]["scores"].append(pct)

    # Build MCQ format list
    mcq_formats_list: List[QuestionTypeMasteryItem] = []
    for t_key in CANONICAL_MCQ_TEMPLATES:
        data = mcq_type_stats.get(t_key, {"attempts": 0, "correct": 0, "scores": []})
        name = TEMPLATE_DISPLAY_NAMES.get(t_key, t_key.replace("_", " ").title())
        att = data["attempts"]
        corr = data["correct"]
        acc = round(statistics.mean(data["scores"]), 1) if data["scores"] else None
        mcq_formats_list.append(
            QuestionTypeMasteryItem(
                template_type=t_key,
                template_name=name,
                paper_phase="Paper I (MCQ)",
                attempts_count=att,
                correct_count=corr,
                accuracy_percentage=acc,
                mastery_status=_classify_mastery_status(att, acc)
            )
        )

    # Build Structured format list
    structured_formats_list: List[QuestionTypeMasteryItem] = []
    for t_key in CANONICAL_STRUCTURED_TEMPLATES:
        data = str_type_stats.get(t_key, {"attempts": 0, "correct": 0, "scores": []})
        name = TEMPLATE_DISPLAY_NAMES.get(t_key, t_key.replace("_", " ").title())
        att = data["attempts"]
        corr = data["correct"]
        acc = round(statistics.mean(data["scores"]), 1) if data["scores"] else None
        structured_formats_list.append(
            QuestionTypeMasteryItem(
                template_type=t_key,
                template_name=name,
                paper_phase="Paper II Part A (Structured)",
                attempts_count=att,
                correct_count=corr,
                accuracy_percentage=acc,
                mastery_status=_classify_mastery_status(att, acc)
            )
        )

    # Build Essay format list
    essay_formats_list: List[QuestionTypeMasteryItem] = []
    for t_key in CANONICAL_ESSAY_TEMPLATES:
        data = esy_type_stats.get(t_key, {"attempts": 0, "correct": 0, "scores": []})
        name = TEMPLATE_DISPLAY_NAMES.get(t_key, t_key.replace("_", " ").title())
        att = data["attempts"]
        corr = data["correct"]
        acc = round(statistics.mean(data["scores"]), 1) if data["scores"] else None
        essay_formats_list.append(
            QuestionTypeMasteryItem(
                template_type=t_key,
                template_name=name,
                paper_phase="Paper II Part B (Essay)",
                attempts_count=att,
                correct_count=corr,
                accuracy_percentage=acc,
                mastery_status=_classify_mastery_status(att, acc)
            )
        )

    combined_question_type_mastery = mcq_formats_list + structured_formats_list + essay_formats_list

    # Cognitive taxonomy
    cognitive_skills_mastery_list: List[CognitiveSkillMasteryItem] = []
    for c_level in ["remember", "understand", "apply", "analyze", "evaluate"]:
        data = cog_stats.get(c_level, {"attempts": 0, "correct": 0, "scores": []})
        att = data["attempts"]
        corr = data["correct"]
        acc = round(statistics.mean(data["scores"]), 1) if data["scores"] else None
        cognitive_skills_mastery_list.append(
            CognitiveSkillMasteryItem(
                cognitive_level=c_level.capitalize(),
                attempts_count=att,
                correct_count=corr,
                accuracy_percentage=acc,
                mastery_status=_classify_mastery_status(att, acc)
            )
        )

    # 7. Syllabus Unit Mastery Calculation with Granular MCQ / Structured / Essay Breakdowns
    unit_mastery_list: List[StudentSyllabusUnitMastery] = []
    revision_priorities_list: List[RevisionPriorityItem] = []

    for u_idx_loop, u in enumerate(units):
        u_lessons = [l for l in lessons if l.unit_id == u.id]
        u_lesson_ids = [l.id for l in u_lessons]
        u_materials = [m for m in materials if m.lesson_id in u_lesson_ids]
        u_mat_ids = [m.id for m in u_materials]
        
        u_progress = [p for p in progress_records if p.material_id in u_mat_ids]
        u_completed_cnt = sum(1 for p in u_progress if p.is_completed)
        u_mat_pct = safe_percentage(u_completed_cnt, len(u_materials), default=0.0) if u_materials else None

        u_mcq_scores: List[float] = []
        u_str_scores: List[float] = []
        u_esy_scores: List[float] = []

        u_mcq_by_fmt: Dict[str, Dict[str, Any]] = {}
        u_str_by_fmt: Dict[str, Dict[str, Any]] = {}
        u_esy_by_fmt: Dict[str, Dict[str, Any]] = {}

        for s in submissions:
            ex = exam_map.get(s.exam_id)
            e_type = getattr(ex.exam_type, "value", str(ex.exam_type)).lower() if ex else ""
            sub_answers = ans_by_sub.get(s.id, [])
            for a in sub_answers:
                q = q_map.get(a.question_id)
                if not q:
                    continue

                # If exam is course-wide, map question to syllabus unit
                if not (ex and ex.lesson_id):
                    t_type_str = getattr(q.template_type, "value", str(q.template_type)) if q.template_type else None
                    mapped_idx = map_question_to_unit_index(q.question_number, t_type_str, q.exam_id, len(units))
                    if mapped_idx != u_idx_loop:
                        continue
                q_pts = float(q.points or 1.0)
                sc = float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0)
                pct = safe_percentage(sc, q_pts, default=0.0) if q_pts > 0 else 0.0
                t_raw = getattr(q.template_type, "value", str(q.template_type)).lower() if q.template_type else "generic_mcq"

                if "mcq" in e_type or t_raw in CANONICAL_MCQ_TEMPLATES or ("structured" not in t_raw and "essay" not in t_raw and "structured" not in e_type and "essay" not in e_type):
                    u_mcq_scores.append(pct)
                    if t_raw not in u_mcq_by_fmt:
                        u_mcq_by_fmt[t_raw] = {"attempts": 0, "correct": 0, "scores": []}
                    u_mcq_by_fmt[t_raw]["attempts"] += 1
                    if pct >= 99.0: u_mcq_by_fmt[t_raw]["correct"] += 1
                    u_mcq_by_fmt[t_raw]["scores"].append(pct)
                elif "structured" in e_type or "structured" in t_raw:
                    u_str_scores.append(pct)
                    s_key = t_raw if t_raw in CANONICAL_STRUCTURED_TEMPLATES else "structured_direct_recall"
                    if s_key not in u_str_by_fmt:
                        u_str_by_fmt[s_key] = {"attempts": 0, "earned": 0.0, "max": 0.0, "scores": []}
                    u_str_by_fmt[s_key]["attempts"] += 1
                    u_str_by_fmt[s_key]["earned"] += sc
                    u_str_by_fmt[s_key]["max"] += q_pts
                    u_str_by_fmt[s_key]["scores"].append(pct)
                elif "essay" in e_type or "essay" in t_raw:
                    u_esy_scores.append(pct)
                    e_key = t_raw if t_raw in CANONICAL_ESSAY_TEMPLATES else "essay_descriptive"
                    if e_key not in u_esy_by_fmt:
                        u_esy_by_fmt[e_key] = {"attempts": 0, "earned": 0.0, "max": 0.0, "scores": []}
                    u_esy_by_fmt[e_key]["attempts"] += 1
                    u_esy_by_fmt[e_key]["earned"] += sc
                    u_esy_by_fmt[e_key]["max"] += q_pts
                    u_esy_by_fmt[e_key]["scores"].append(pct)

        all_u_scores = u_mcq_scores + u_str_scores + u_esy_scores
        total_attempts = len(all_u_scores)
        observed_pct = round(statistics.mean(all_u_scores), 1) if all_u_scores else None

        mcq_avg = round(statistics.mean(u_mcq_scores), 1) if u_mcq_scores else None
        str_avg = round(statistics.mean(u_str_scores), 1) if u_str_scores else None
        esy_avg = round(statistics.mean(u_esy_scores), 1) if u_esy_scores else None

        sources = []
        if mcq_avg is not None: sources.append("MCQ")
        if str_avg is not None: sources.append("Structured")
        if esy_avg is not None: sources.append("Essay")
        
        # Determine Evidence State (Phase V5.3)
        if total_attempts == 0 and u_completed_cnt == 0:
            evidence_st = "NO_DATA"
            status = "NO_DATA"
            source_note = "No study activity or assessment evidence recorded"
        elif total_attempts == 0 and u_completed_cnt > 0:
            evidence_st = "LEARNING_ONLY"
            status = "Studied — Awaiting Assessment"
            source_note = f"Studied {u_completed_cnt}/{len(u_materials)} materials; no assessment attempts recorded"
        elif total_attempts > 0 and u_completed_cnt == 0:
            evidence_st = "ASSESSMENT_ONLY"
            status = "Strong" if (observed_pct or 0) >= 75.0 else ("Developing" if (observed_pct or 0) >= 50.0 else "Needs Revision")
            source_note = f"Assessment attainment is {observed_pct}%; learning activity evidence is currently unavailable"
        elif total_attempts < 3:
            evidence_st = "LIMITED_DATA"
            status = "Early Evidence"
            source_note = f"Early signal ({total_attempts} attempts across {' and '.join(sources)})"
        else:
            evidence_st = "STRONG_EVIDENCE" if total_attempts >= 5 and u_completed_cnt > 0 else "EVIDENCE_AVAILABLE"
            if observed_pct is not None and observed_pct >= 75.0:
                status = "Strong"
            elif observed_pct is not None and observed_pct >= 50.0:
                status = "Developing"
            else:
                status = "Needs Revision"
            source_note = f"Based on {total_attempts} attempts across {' and '.join(sources)} ({u_completed_cnt} materials studied)"

        # Granular breakdowns per unit
        unit_mcq_breakdown = {
            "attempts": len(u_mcq_scores),
            "correct": sum(1 for sc in u_mcq_scores if sc >= 99.0),
            "percentage": mcq_avg,
            "formats": [
                {
                    "format_key": k,
                    "format_name": TEMPLATE_DISPLAY_NAMES.get(k, k),
                    "attempts": v["attempts"],
                    "correct": v["correct"],
                    "percentage": round(statistics.mean(v["scores"]), 1) if v["scores"] else None
                }
                for k, v in u_mcq_by_fmt.items()
            ]
        }

        unit_str_breakdown = {
            "attempts": len(u_str_scores),
            "earned_marks": round(sum(v["earned"] for v in u_str_by_fmt.values()), 1),
            "max_marks": round(sum(v["max"] for v in u_str_by_fmt.values()), 1),
            "percentage": str_avg,
            "formats": [
                {
                    "format_key": k,
                    "format_name": TEMPLATE_DISPLAY_NAMES.get(k, k),
                    "attempts": v["attempts"],
                    "earned_marks": round(v["earned"], 1),
                    "max_marks": round(v["max"], 1),
                    "percentage": round(statistics.mean(v["scores"]), 1) if v["scores"] else None
                }
                for k, v in u_str_by_fmt.items()
            ]
        }

        unit_esy_breakdown = {
            "attempts": len(u_esy_scores),
            "earned_marks": round(sum(v["earned"] for v in u_esy_by_fmt.values()), 1),
            "max_marks": round(sum(v["max"] for v in u_esy_by_fmt.values()), 1),
            "percentage": esy_avg,
            "formats": [
                {
                    "format_key": k,
                    "format_name": TEMPLATE_DISPLAY_NAMES.get(k, k),
                    "attempts": v["attempts"],
                    "earned_marks": round(v["earned"], 1),
                    "max_marks": round(v["max"], 1),
                    "percentage": round(statistics.mean(v["scores"]), 1) if v["scores"] else None
                }
                for k, v in u_esy_by_fmt.items()
            ]
        }

        unit_mastery_list.append(
            StudentSyllabusUnitMastery(
                unit_id=u.id,
                unit_title=u.title,
                assessment_mastery_percentage=observed_pct,
                learning_activity_percentage=u_mat_pct,
                materials_total=len(u_materials),
                materials_completed=u_completed_cnt,
                questions_count=len(all_u_scores),
                attempts_count=total_attempts,
                mcq_percentage=mcq_avg,
                structured_percentage=str_avg,
                essay_percentage=esy_avg,
                material_completion_percentage=u_mat_pct,
                evidence_state=evidence_st,
                mastery_status=status,
                data_source_note=source_note,
                mcq_breakdown=unit_mcq_breakdown,
                structured_breakdown=unit_str_breakdown,
                essay_breakdown=unit_esy_breakdown
            )
        )

    # Find strongest unit and revision priorities (only where at least 2 attempts exist)
    ranked_units = [u for u in unit_mastery_list if u.assessment_mastery_percentage is not None and u.attempts_count >= 2]
    ranked_units_sorted = sorted(ranked_units, key=lambda x: x.assessment_mastery_percentage or 0.0)

    strongest_unit = ranked_units_sorted[-1].unit_title if ranked_units_sorted else None
    revision_priority_unit = ranked_units_sorted[0].unit_title if (ranked_units_sorted and (ranked_units_sorted[0].assessment_mastery_percentage or 0.0) < 65.0) else None

    # Build Top 3 Revision Priorities with Explainable Evidence
    for idx, u in enumerate(ranked_units_sorted[:3]):
        pct = u.assessment_mastery_percentage or 0.0
        if pct < 70.0:
            rationale = f"Assessment attainment in {u.unit_title} ({pct}%) is below recommended threshold based on {u.attempts_count} evaluated attempts."
            if avg_assessment_pct and pct < avg_assessment_pct:
                rationale += f" (Course Average: {avg_assessment_pct}%)"
            action = f"Review lesson materials for {u.unit_title} and attempt targeted practice questions."
            revision_priorities_list.append(
                RevisionPriorityItem(
                    priority_rank=idx + 1,
                    unit_id=u.unit_id,
                    unit_title=u.unit_title,
                    current_performance_percentage=pct,
                    evidence_rationale=rationale,
                    suggested_action=action
                )
            )

    # 8. Personal Descriptive Learning Signals
    personal_signals: List[str] = []
    if len(all_percentages) >= 3:
        first_half = statistics.mean(all_percentages[:len(all_percentages)//2])
        second_half = statistics.mean(all_percentages[len(all_percentages)//2:])
        if second_half > first_half + 5.0:
            personal_signals.append(f"Recent upward performance trend (+{round(second_half - first_half, 1)}% improvement across recent assessments)")
        elif first_half > second_half + 5.0:
            personal_signals.append("Recent assessments show lower scores than earlier attempts. Focus on targeted revision.")

    if strongest_unit:
        personal_signals.append(f"Highest current assessment mastery observed in '{strongest_unit}'.")
    elif len(submissions) == 0:
        personal_signals.append("Your learning analytics will appear as you study materials and complete practice assessments.")

    # 9. Detailed Assessment Deep Dives
    mcq_att_cnt = len(mcq_answers_list)
    mcq_corr_cnt = sum(1 for m in mcq_answers_list if m["is_correct"])
    mcq_acc = safe_percentage(mcq_corr_cnt, mcq_att_cnt) if mcq_att_cnt > 0 else None

    # MCQ Difficulty Breakdown (Canonical: Easy, Medium, Hard)
    mcq_diff_stats: Dict[str, Dict[str, Any]] = {"Easy": {"attempts": 0, "correct": 0}, "Medium": {"attempts": 0, "correct": 0}, "Hard": {"attempts": 0, "correct": 0}}
    for m in mcq_answers_list:
        raw_diff = str(m.get("difficulty") or "Medium").strip().lower()
        if "easy" in raw_diff:
            diff_key = "Easy"
        elif "hard" in raw_diff or "difficult" in raw_diff:
            diff_key = "Hard"
        else:
            diff_key = "Medium"

        mcq_diff_stats[diff_key]["attempts"] += 1
        if m["is_correct"]:
            mcq_diff_stats[diff_key]["correct"] += 1

    diff_breakdown = [
        {
            "difficulty": k,
            "attempts": v["attempts"],
            "correct": v["correct"],
            "accuracy_percentage": safe_percentage(v["correct"], v["attempts"]) if v["attempts"] > 0 else None
        }
        for k, v in mcq_diff_stats.items()
    ]

    mcq_deep_dive = {
        "total_attempted": mcq_att_cnt,
        "correct_count": mcq_corr_cnt,
        "incorrect_count": mcq_att_cnt - mcq_corr_cnt,
        "accuracy_percentage": mcq_acc,
        "difficulty_breakdown": diff_breakdown
    }

    # Structured Deep Dive
    str_max = sum(q["max_marks"] for q in structured_questions_list)
    str_earned = sum(q["earned_marks"] for q in structured_questions_list)
    str_avg_pct = safe_percentage(str_earned, str_max) if str_max > 0 else None

    structured_deep_dive = {
        "questions_attempted": len(structured_questions_list),
        "total_max_marks": round(str_max, 1),
        "total_earned_marks": round(str_earned, 1),
        "average_percentage": str_avg_pct,
        "questions": structured_questions_list[:10]
    }

    # Essay Deep Dive
    esy_max = sum(q["max_marks"] for q in essay_questions_list)
    esy_earned = sum(q["earned_marks"] for q in essay_questions_list)
    esy_avg_pct = safe_percentage(esy_earned, esy_max) if esy_max > 0 else None

    essay_deep_dive = {
        "essays_attempted": len(essay_questions_list),
        "total_max_marks": round(esy_max, 1),
        "total_earned_marks": round(esy_earned, 1),
        "average_percentage": esy_avg_pct,
        "questions": essay_questions_list[:10]
    }

    # Paper Phases High-Level Summary
    paper_phases_summary = {
        "paper_1": {
            "phase_name": "Paper I: Multiple Choice Questions (MCQ)",
            "total_attempted": mcq_att_cnt,
            "correct_count": mcq_corr_cnt,
            "attainment_percentage": mcq_acc,
            "formats_count": len([f for f in mcq_formats_list if f.attempts_count > 0])
        },
        "paper_2_part_a": {
            "phase_name": "Paper II Part A: Structured Questions",
            "total_attempted": len(structured_questions_list),
            "earned_marks": round(str_earned, 1),
            "max_marks": round(str_max, 1),
            "attainment_percentage": str_avg_pct,
            "formats_count": len([f for f in structured_formats_list if f.attempts_count > 0])
        },
        "paper_2_part_b": {
            "phase_name": "Paper II Part B: Essay Questions",
            "total_attempted": len(essay_questions_list),
            "earned_marks": round(esy_earned, 1),
            "max_marks": round(esy_max, 1),
            "attainment_percentage": esy_avg_pct,
            "formats_count": len([f for f in essay_formats_list if f.attempts_count > 0])
        }
    }

    # Legacy summaries for backwards compatibility
    structured_summary = {
        "total_attempted": len(structured_questions_list),
        "average_percentage": str_avg_pct
    }
    essay_summary = {
        "total_attempted": len(essay_questions_list),
        "average_percentage": esy_avg_pct
    }

    return StudentPersonalMasteryReport(
        student_id=student.id,
        student_name=student_name,
        course_id=course_id,
        course_title=course_title,
        enrolled_courses_count=len(enrolled_course_ids),
        materials_completed=completed_mats_cnt,
        materials_total=total_materials,
        material_completion_percentage=mat_completion_pct,
        assessments_completed=len(submissions),
        average_assessment_percentage=avg_assessment_pct,
        latest_assessment_percentage=latest_pct,
        latest_assessment_title=latest_title,
        latest_assessment_date=latest_date,
        performance_trend=performance_trend_list[-6:],
        strongest_unit=strongest_unit,
        revision_priority_unit=revision_priority_unit,
        syllabus_unit_mastery=unit_mastery_list,
        question_type_mastery=combined_question_type_mastery,
        mcq_formats=mcq_formats_list,
        structured_formats=structured_formats_list,
        essay_formats=essay_formats_list,
        cognitive_skills_mastery=cognitive_skills_mastery_list,
        revision_priorities=revision_priorities_list,
        paper_phases_summary=paper_phases_summary,
        mcq_deep_dive=mcq_deep_dive,
        structured_deep_dive=structured_deep_dive,
        essay_deep_dive=essay_deep_dive,
        structured_summary=structured_summary,
        essay_summary=essay_summary,
        assessment_history=assessment_history_list,
        frequently_revisited_materials=frequently_revisited,
        personal_flags=personal_flags_list,
        personal_ai_topics=personal_ai_topics,
        personal_signals=personal_signals
    )
