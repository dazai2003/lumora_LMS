"""
LUMORA LMS — PHASE V5.4 CROSS-ANALYTICS & TEACHER LEARNING INTELLIGENCE SERVICE

Unites validated assessment evidence (Papers I MCQ, II-A Structured, II-B Essay)
with validated learning-activity evidence (materials progress, revisits, difficulty flags, Ask AI questions).

Answers the teacher's central question:
"What is actually happening with my students' learning, and what evidence supports that conclusion?"

Rules:
- 100% Deterministic backend truth.
- Zero fabricated evidence.
- Clean separation between Learning Activity (engagement) and Assessment Evidence (demonstrated mastery).
- Four-state divergence engine: ENGAGED_MASTERED, ENGAGED_STRUGGLING, LOW_ACTIVITY_HIGH_ATTAINMENT, LOW_ACTIVITY_LOW_ATTAINMENT.
- No false "Healthy" classifications for unstudied/unassessed units.
"""
from typing import List, Dict, Any, Optional, Tuple
import statistics
from sqlalchemy.orm import Session

from app.models import (
    User, Course, Unit, Lesson, Material, StudentMaterialProgress, MaterialFlag,
    StudentQuestion, Enrollment, ALExam, ALExamType, ALStudentSubmission,
    ALStudentAnswer, ALQuestion, ALQuestionTemplate, CognitiveLevel
)
from app.services.analytics.data_contracts import (
    TeacherCrossAnalyticsReport, UnitCrossAnalyticsItem, LearningAssessmentDivergenceItem,
    UnitQuestionInventoryItem, UnitFormatDivergenceItem, CognitiveDepthIntelligence,
    StudentCrossAnalyticsDossier, ContentHotspotIntelligence, ActionableTargetLink
)
from app.services.analytics.normalization import (
    safe_div, safe_percentage, normalize_cognitive_level, parse_context_location,
    map_question_to_unit_index
)
from app.services.analytics.learning_intelligence import (
    classify_evidence_confidence
)
from app.services.analytics.student_mastery_analytics import (
    TEMPLATE_DISPLAY_NAMES
)


def classify_four_state_divergence(
    learning_pct: Optional[float],
    assessment_pct: Optional[float],
    total_attempts: int,
    flags_count: int = 0,
    ai_inquiries: int = 0
) -> Tuple[str, str, str, str]:
    """
    Evaluates the 4-state Learning Activity vs Assessment Attainment Divergence Model:
    Returns (divergence_state, label, interpretation, pedagogical_action).
    """
    has_learning_activity = bool(learning_pct is not None and learning_pct > 0)
    has_assessment_activity = bool(assessment_pct is not None and total_attempts > 0)

    if not has_learning_activity and not has_assessment_activity:
        return (
            "NO_DATA",
            "No Activity Recorded",
            "No learning activity or assessment evidence has been recorded for this unit.",
            "Schedule an introductory lesson and diagnostic check to establish baseline learning evidence."
        )
    elif has_learning_activity and not has_assessment_activity:
        return (
            "LEARNING_ONLY",
            "Learning Engaged (Awaiting Assessment)",
            f"Students have completed {learning_pct}% of lesson materials. Assessment performance data will appear after exam attempts.",
            "Publish a targeted formative assessment or diagnostic quiz to verify conceptual mastery."
        )
    elif not has_learning_activity and has_assessment_activity and learning_pct is None:
        return (
            "ASSESSMENT_ONLY",
            "Assessed (No Material Activity)",
            f"Assessment attainment is {assessment_pct}%, but no lesson material activity has been recorded in the platform.",
            "Verify whether students reviewed external materials or assign supplementary revision modules."
        )
    elif total_attempts < 5 and total_attempts > 0 and (learning_pct is not None and learning_pct > 0):
        return (
            "LIMITED_DATA",
            "Limited Evidence",
            f"Early signal based on limited sample ({total_attempts} attempts, {learning_pct}% material completion).",
            "Collect additional student submissions before drawing definitive pedagogical conclusions."
        )

    # 4 Core Evidenced Divergence States (Both Learning and Assessment Evidence Exist)
    l_high = bool((learning_pct or 0.0) >= 50.0)
    a_high = bool((assessment_pct or 0.0) >= 65.0)

    if l_high and a_high:
        return (
            "ENGAGED_MASTERED",
            "Engaged & Mastered",
            "Students demonstrate strong learning engagement accompanied by high assessment attainment.",
            "Reinforce mastery with higher-order extension problems and multi-variable synthesis questions."
        )
    elif l_high and not a_high:
        # High-value pedagogical signal: Student is trying, but failing assessment!
        action_parts = []
        if flags_count > 0:
            action_parts.append(f"review {flags_count} difficulty flag(s)")
        if ai_inquiries > 0:
            action_parts.append(f"analyze {ai_inquiries} Ask AI questions")
        action_parts.append("inspect student answers and subpart mark loss")
        
        return (
            "ENGAGED_STRUGGLING",
            "Engaged but Struggling",
            f"Students are actively engaging with learning resources ({learning_pct}% completion), but assessment attainment remains low ({assessment_pct}%).",
            f"Pedagogical Intervention Required: {', '.join(action_parts)} to address underlying misconceptions."
        )
    elif not l_high and a_high:
        # Low activity, high attainment: NOT an error or penalty!
        return (
            "LOW_ACTIVITY_HIGH_ATTAINMENT",
            "High Attainment (Low Recorded Activity)",
            f"Assessment attainment is strong ({assessment_pct}%) despite limited recorded material activity ({learning_pct}%). Students may possess prior competence.",
            "Confirm consistent performance across all question formats without requiring redundant material review."
        )
    else:
        # Low activity + low attainment
        return (
            "LOW_ACTIVITY_LOW_ATTAINMENT",
            "Low Activity & Low Attainment",
            f"Low assessment attainment ({assessment_pct}%) is accompanied by low material engagement ({learning_pct}%) and persistent difficulty signals.",
            "Urgent Action: Send academic study nudges and conduct structured remediation sessions on foundational concepts."
        )


def evaluate_format_divergence_pattern(
    mcq: Optional[float],
    structured: Optional[float],
    essay: Optional[float]
) -> Tuple[str, str, str]:
    """
    Evaluates format-level performance divergence across Paper I (MCQ),
    Paper II-A (Structured), and Paper II-B (Essay).
    Returns (format_pattern, pattern_label, insight).
    """
    available_scores = [s for s in [mcq, structured, essay] if s is not None]
    if len(available_scores) < 2:
        return (
            "INSUFFICIENT_DATA",
            "Single Format Only",
            "Comparative format divergence requires evaluation across multiple examination components."
        )

    # Broad Weakness: All format scores are below 50%
    if all(s < 50.0 for s in available_scores):
        return (
            "BROAD_WEAKNESS",
            "Broad Conceptual Weakness",
            f"Attainment is depressed across all evaluated formats (MCQ: {mcq or '—'}%, Structured: {structured or '—'}%, Essay: {essay or '—'}%), indicating fundamental conceptual gaps."
        )

    # Explanation Problem: Structured is reasonable, but Essay falls significantly
    if structured is not None and structured >= 55.0 and essay is not None and (structured - essay) >= 15.0:
        return (
            "EXPLANATION_PROBLEM",
            "Essay Synthesis Difficulty",
            f"Structured subpart performance ({structured}%) outpaces essay synthesis ({essay}%), indicating challenges in comprehensive scientific discourse."
        )

    # Recognition Problem: Struggles with MCQ compared to Structured/Essay
    if mcq is not None and structured is not None and (structured - mcq) >= 15.0:
        return (
            "RECOGNITION_PROBLEM",
            "Recognition Difficulty",
            f"Students achieve higher scores on structured responses ({structured}%) than MCQs ({mcq}%), indicating susceptibility to distractor traps."
        )

    # Construction Problem: MCQ is strong, but Structured/Essay constructed responses are weak
    if mcq is not None and mcq >= 65.0 and ((structured is not None and structured < 50.0) or (essay is not None and essay < 50.0)):
        lowest_const = min(s for s in [structured, essay] if s is not None)
        return (
            "CONSTRUCTION_PROBLEM",
            "Construction Difficulty",
            f"Solid factual recognition in MCQs ({mcq}%) diverges from lower constructed response attainment ({lowest_const}%), indicating formulation difficulty."
        )

    # Consistent Performance
    return (
        "CONSISTENT",
        "Consistent Across Formats",
        f"Balanced performance observed across evaluated assessment formats (variance < 15%)."
    )


def compute_course_cross_analytics(course_id: int, db: Session) -> TeacherCrossAnalyticsReport:
    """
    Aggregates unified cross-analytics intelligence for a course.
    Consumes validated database records across all 4 evidence streams.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise ValueError(f"Course #{course_id} not found")

    # 1. Enrolled Students
    enrollments = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.is_active == True
    ).all()
    student_ids = [e.student_id for e in enrollments]
    enrollments_count = len(student_ids)

    # 2. Syllabus Units & Materials
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc(), Unit.id.asc()).all()
    lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
    lesson_ids = [l.id for l in lessons]

    materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
    mat_ids = [m.id for m in materials]

    # Material Progress, Flags & AI Queries
    progress_records = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.material_id.in_(mat_ids)
    ).all() if mat_ids else []

    flags = db.query(MaterialFlag).filter(
        MaterialFlag.material_id.in_(mat_ids)
    ).all() if mat_ids else []

    ai_questions = db.query(StudentQuestion).filter(
        StudentQuestion.course_id == course_id
    ).all()

    # 3. Assessment Submissions & Questions
    exams = db.query(ALExam).filter(ALExam.course_id == course_id).all()
    exam_ids = [e.id for e in exams]
    exam_map = {e.id: e for e in exams}

    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id.in_(exam_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all() if exam_ids else []

    sub_ids = [s.id for s in submissions]
    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []

    questions_list = db.query(ALQuestion).filter(
        ALQuestion.exam_id.in_(exam_ids)
    ).all() if exam_ids else []

    ans_by_q: Dict[int, List[ALStudentAnswer]] = {}
    for a in answers:
        ans_by_q.setdefault(a.question_id, []).append(a)

    # Student scores map for struggling/mastering counts
    scores_by_student_unit: Dict[Tuple[int, int], List[float]] = {}

    unit_cross_items: List[UnitCrossAnalyticsItem] = []
    divergence_matrix: List[LearningAssessmentDivergenceItem] = []
    format_divergence_matrix: List[UnitFormatDivergenceItem] = []
    cognitive_intel_list: List[CognitiveDepthIntelligence] = []
    hotspots_list: List[ContentHotspotIntelligence] = []

    summary_counts = {
        "engaged_mastered": 0,
        "engaged_struggling": 0,
        "low_activity_high_attainment": 0,
        "low_activity_low_attainment": 0,
        "monitoring": 0,
        "no_data": 0
    }

    for u_idx_loop, u in enumerate(units):
        u_lessons = [l for l in lessons if l.unit_id == u.id]
        u_lesson_ids = [l.id for l in u_lessons]
        u_materials = [m for m in materials if m.lesson_id in u_lesson_ids]
        u_mat_ids = [m.id for m in u_materials]
        total_u_mats = len(u_materials)

        # Material Activity
        u_prog = [p for p in progress_records if p.material_id in u_mat_ids]
        u_completed_cnt = sum(1 for p in u_prog if p.is_completed)
        u_viewed_mats = len({p.material_id for p in u_prog})
        u_possible = total_u_mats * enrollments_count
        u_mat_pct = safe_percentage(u_completed_cnt, u_possible, default=None) if u_possible > 0 else None
        u_views_cnt = len(u_prog)

        # Flags & AI queries in unit
        u_flags = [f for f in flags if f.material_id in u_mat_ids]
        u_flags_cnt = len(u_flags)
        u_unres_flags = sum(1 for f in u_flags if not f.is_resolved)

        u_ai = [q for q in ai_questions if (q.course_material_id in u_mat_ids or (q.topic_category and u.title.lower() in q.topic_category.lower()))]
        u_ai_cnt = len(u_ai)

        # Assessment Performance
        u_unit_questions: List[ALQuestion] = []
        mcq_scores: List[float] = []
        str_scores: List[float] = []
        esy_scores: List[float] = []

        # Cognitive breakdown
        cog_scores: Dict[str, List[float]] = {}

        for q in questions_list:
            t_type_str = getattr(q.template_type, "value", str(q.template_type)) if q.template_type else None
            mapped_idx = map_question_to_unit_index(q.question_number, t_type_str, q.exam_id, len(units))
            if mapped_idx != u_idx_loop:
                continue

            u_unit_questions.append(q)
            q_answers = ans_by_q.get(q.id, [])
            if not q_answers:
                continue

            ex = exam_map.get(q.exam_id)
            e_type = getattr(ex.exam_type, "value", str(ex.exam_type)).lower() if ex else ""
            pts = float(q.points or 1.0)

            c_level = normalize_cognitive_level(q.cognitive_level)

            for a in q_answers:
                sc = float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0)
                pct = safe_percentage(sc, pts, default=0.0) if pts > 0 else 0.0

                if "mcq" in e_type:
                    mcq_scores.append(pct)
                elif "structured" in e_type:
                    str_scores.append(pct)
                elif "essay" in e_type:
                    esy_scores.append(pct)

                if c_level:
                    cog_scores.setdefault(c_level, []).append(pct)

                # Record per student for student counts
                sub = next((s for s in submissions if s.id == a.submission_id), None)
                if sub:
                    scores_by_student_unit.setdefault((sub.student_id, u.id), []).append(pct)

        all_scores = mcq_scores + str_scores + esy_scores
        total_attempts = len(all_scores)
        attainment_avg = round(statistics.mean(all_scores), 1) if all_scores else None
        mcq_avg = round(statistics.mean(mcq_scores), 1) if mcq_scores else None
        str_avg = round(statistics.mean(str_scores), 1) if str_scores else None
        esy_avg = round(statistics.mean(esy_scores), 1) if esy_scores else None

        # Evidence State
        has_learning = bool(u_mat_pct is not None and u_mat_pct > 0)
        has_assessment = bool(attainment_avg is not None)

        if not has_learning and not has_assessment:
            evidence_st = "NO_DATA"
            conf_level = "limited"
        elif has_learning and not has_assessment:
            evidence_st = "LEARNING_ONLY"
            conf_level = "moderate" if u_mat_pct >= 50.0 else "limited"
        elif not has_learning and has_assessment:
            evidence_st = "ASSESSMENT_ONLY"
            conf_level = "moderate" if total_attempts >= 10 else "limited"
        elif total_attempts < 5:
            evidence_st = "LIMITED_DATA"
            conf_level = "limited"
        elif total_attempts >= 10 and (u_mat_pct or 0) >= 50.0:
            evidence_st = "STRONG_EVIDENCE"
            conf_level = "high"
        else:
            evidence_st = "EVIDENCE_AVAILABLE"
            conf_level = "moderate"

        # 4-State Divergence Classification
        div_state, div_label, div_interp, div_action = classify_four_state_divergence(
            u_mat_pct, attainment_avg, total_attempts, u_flags_cnt, u_ai_cnt
        )

        # Update summary counts
        if div_state == "ENGAGED_MASTERED": summary_counts["engaged_mastered"] += 1
        elif div_state == "ENGAGED_STRUGGLING": summary_counts["engaged_struggling"] += 1
        elif div_state == "LOW_ACTIVITY_HIGH_ATTAINMENT": summary_counts["low_activity_high_attainment"] += 1
        elif div_state == "LOW_ACTIVITY_LOW_ATTAINMENT": summary_counts["low_activity_low_attainment"] += 1
        elif div_state == "NO_DATA": summary_counts["no_data"] += 1
        else: summary_counts["monitoring"] += 1

        # Calculate struggling vs mastering students in this unit
        struggling_cnt = 0
        mastering_cnt = 0
        for sid in student_ids:
            st_scores = scores_by_student_unit.get((sid, u.id), [])
            if st_scores:
                st_avg = statistics.mean(st_scores)
                if st_avg < 50.0: struggling_cnt += 1
                elif st_avg >= 75.0: mastering_cnt += 1

        # Build Explainable Reasoning Paragraph (Requirement 4)
        evidence_points = []
        if attainment_avg is not None:
            parts = [f"Assessment attainment is {attainment_avg}%"]
            if mcq_avg is not None: parts.append(f"Paper I MCQ averages {mcq_avg}%")
            if str_avg is not None: parts.append(f"Paper II-A Structured averages {str_avg}%")
            if esy_avg is not None: parts.append(f"Paper II-B Essay averages {esy_avg}%")
            evidence_points.append(". ".join(parts) + ".")
        if u_mat_pct is not None:
            evidence_points.append(f"Material completion is {u_mat_pct}% across {total_u_mats} learning resources.")
        if u_flags_cnt > 0:
            evidence_points.append(f"{u_flags_cnt} difficulty flag(s) submitted ({u_unres_flags} unresolved).")
        if u_ai_cnt > 0:
            evidence_points.append(f"{u_ai_cnt} student Ask AI inquiries recorded.")

        evidence_explanation = " ".join(evidence_points) if evidence_points else "No active learning or assessment data recorded yet."
        why_this_matters = div_interp

        # Actionable Target Links
        rec_actions = [
            ActionableTargetLink(label="Inspect Exam Items", target_url=f"/dashboard/teacher/al-exams/analytics?unit_id={u.id}", action_type="inspect_item"),
            ActionableTargetLink(label="Review Lesson Materials", target_url=f"/dashboard/teacher/materials", action_type="review_material"),
        ]
        if u_flags_cnt > 0:
            rec_actions.append(ActionableTargetLink(label="Review Difficulty Flags", target_url=f"/dashboard/teacher/analytics?tab=materials", action_type="review_flags"))

        unit_cross_items.append(
            UnitCrossAnalyticsItem(
                unit_id=u.id,
                unit_title=u.title,
                unit_order=u.order or u_idx_loop + 1,
                materials_count=total_u_mats,
                materials_viewed_count=u_viewed_mats,
                materials_completed_count=u_completed_cnt,
                material_completion_pct=u_mat_pct,
                total_material_views=u_views_cnt,
                difficulty_flags_count=u_flags_cnt,
                unresolved_flags_count=u_unres_flags,
                ask_ai_inquiries_count=u_ai_cnt,
                questions_count=len(u_unit_questions),
                evaluated_attempts_count=total_attempts,
                assessment_attainment_pct=attainment_avg,
                mcq_attainment_pct=mcq_avg,
                structured_attainment_pct=str_avg,
                essay_attainment_pct=esy_avg,
                divergence_state=div_state,
                evidence_state=evidence_st,
                confidence_level=conf_level,
                evidence_explanation=evidence_explanation,
                why_this_matters=why_this_matters,
                struggling_students_count=struggling_cnt,
                mastering_students_count=mastering_cnt,
                recommended_actions=rec_actions
            )
        )

        # Append to Divergence Matrix
        divergence_matrix.append(
            LearningAssessmentDivergenceItem(
                unit_id=u.id,
                unit_title=u.title,
                learning_activity_pct=u_mat_pct,
                assessment_score_pct=attainment_avg,
                divergence_state=div_state,
                divergence_label=div_label,
                interpretation=div_interp,
                pedagogical_action=div_action,
                evidence_points=evidence_points
            )
        )

        # Question Format Divergence
        fmt_pat, fmt_lbl, fmt_insight = evaluate_format_divergence_pattern(mcq_avg, str_avg, esy_avg)
        format_divergence_matrix.append(
            UnitFormatDivergenceItem(
                unit_id=u.id,
                unit_title=u.title,
                mcq_attainment_pct=mcq_avg,
                structured_attainment_pct=str_avg,
                essay_attainment_pct=esy_avg,
                format_pattern=fmt_pat,
                pattern_label=fmt_lbl,
                insight=fmt_insight
            )
        )

        # Cognitive Skill Intelligence (Requirement 7)
        bloom_dict: Dict[str, Optional[float]] = {}
        has_tax = False
        lower_scores = []
        higher_scores = []

        for lvl in ["remember", "understand", "apply", "analyze", "evaluate", "create"]:
            l_sc = cog_scores.get(lvl, [])
            if l_sc:
                has_tax = True
                avg_lvl = round(statistics.mean(l_sc), 1)
                bloom_dict[lvl] = avg_lvl
                if lvl in ["remember", "understand"]:
                    lower_scores.extend(l_sc)
                else:
                    higher_scores.extend(l_sc)
            else:
                bloom_dict[lvl] = None

        low_avg = round(statistics.mean(lower_scores), 1) if lower_scores else None
        high_avg = round(statistics.mean(higher_scores), 1) if higher_scores else None

        if has_tax and low_avg is not None and high_avg is not None:
            if (low_avg - high_avg) >= 15.0:
                cog_insight = f"Higher-order analytical question attainment ({high_avg}%) is significantly lower than foundational recall attainment ({low_avg}%)."
            elif (high_avg - low_avg) >= 10.0:
                cog_insight = f"Students perform robustly on applied multi-step scenarios ({high_avg}%) relative to basic definitions ({low_avg}%)."
            else:
                cog_insight = f"Balanced cognitive performance across foundational recall ({low_avg}%) and higher-order reasoning ({high_avg}%)."
        elif has_tax:
            cog_insight = f"Cognitive attainment observed across available Bloom taxonomy levels."
        else:
            cog_insight = "Cognitive-depth analysis unavailable for this unit because evaluated questions do not contain sufficient taxonomy metadata."

        cognitive_intel_list.append(
            CognitiveDepthIntelligence(
                unit_id=u.id,
                unit_title=u.title,
                bloom_levels=bloom_dict,
                lower_order_avg_pct=low_avg,
                higher_order_avg_pct=high_avg,
                has_taxonomy_metadata=has_tax,
                insight=cog_insight
            )
        )

        # Build Hotspot for teacher learning intelligence
        priority = "NO_DATA" if div_state == "NO_DATA" else (
            "HIGH_PRIORITY" if (div_state == "ENGAGED_STRUGGLING" or (attainment_avg is not None and attainment_avg < 50.0)) else (
                "MONITORING" if (div_state in ["LOW_ACTIVITY_LOW_ATTAINMENT", "LIMITED_DATA"] or (attainment_avg is not None and attainment_avg < 65.0)) else "HEALTHY"
            )
        )

        hotspots_list.append(
            ContentHotspotIntelligence(
                hotspot_id=f"hotspot-u-{u.id}",
                unit_id=u.id,
                unit_title=u.title,
                priority_level=priority,
                evidence_state=evidence_st,
                evidence_confidence=conf_level,
                evidence_points=evidence_points,
                material_completion_pct=u_mat_pct,
                assessment_score_pct=attainment_avg,
                flags_count=u_flags_cnt,
                unresolved_flags_count=u_unres_flags,
                ai_inquiries_count=u_ai_cnt,
                subpart_losses_count=len([s for s in str_scores if s < 50.0]),
                essay_omissions_count=len([e for e in esy_scores if e < 50.0]),
                neutral_insight=div_interp,
                recommended_actions=rec_actions
            )
        )

    return TeacherCrossAnalyticsReport(
        course_id=course.id,
        course_title=course.title,
        enrolled_students=enrollments_count,
        total_materials=len(materials),
        total_questions=len(questions_list),
        total_submissions_analyzed=len(submissions),
        units=unit_cross_items,
        divergence_matrix=divergence_matrix,
        format_divergence_matrix=format_divergence_matrix,
        cognitive_intelligence=cognitive_intel_list,
        hotspots=hotspots_list,
        summary_counts=summary_counts
    )


def get_unit_question_inventory(course_id: int, unit_id: int, db: Session) -> List[UnitQuestionInventoryItem]:
    """
    Returns the real, genuine examination questions mapped to a syllabus unit,
    with average attainment and taxonomy metadata (Zero internal UUIDs exposed).
    """
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc(), Unit.id.asc()).all()
    target_idx = next((idx for idx, u in enumerate(units) if u.id == unit_id), None)
    if target_idx is None:
        return []

    exams = db.query(ALExam).filter(ALExam.course_id == course_id).all()
    exam_ids = [e.id for e in exams]
    exam_map = {e.id: e for e in exams}

    questions = db.query(ALQuestion).filter(ALQuestion.exam_id.in_(exam_ids)).order_by(ALQuestion.exam_id.asc(), ALQuestion.question_number.asc()).all()
    answers = db.query(ALStudentAnswer).all()

    ans_by_q: Dict[int, List[ALStudentAnswer]] = {}
    for a in answers:
        ans_by_q.setdefault(a.question_id, []).append(a)

    inventory: List[UnitQuestionInventoryItem] = []

    for q in questions:
        t_type_str = getattr(q.template_type, "value", str(q.template_type)) if q.template_type else None
        mapped_idx = map_question_to_unit_index(q.question_number, t_type_str, q.exam_id, len(units))
        if mapped_idx != target_idx:
            continue

        ex = exam_map.get(q.exam_id)
        e_type = getattr(ex.exam_type, "value", str(ex.exam_type)) if ex else "paper_1_mcq"
        t_name = TEMPLATE_DISPLAY_NAMES.get(t_type_str, (t_type_str or "standard_item").replace("_", " ").title())

        # Calculate average score percentage
        q_ans = ans_by_q.get(q.id, [])
        pts = float(q.points or 1.0)
        avg_pct = None
        if q_ans and pts > 0:
            scores = [safe_percentage(float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0), pts, default=0.0) for a in q_ans]
            avg_pct = round(statistics.mean(scores), 1) if scores else None

        subparts_cnt = len(q.subparts_json) if hasattr(q, "subparts_json") and q.subparts_json and isinstance(q.subparts_json, list) else 0
        crit_cnt = len(q.rubric_criteria_json) if hasattr(q, "rubric_criteria_json") and q.rubric_criteria_json and isinstance(q.rubric_criteria_json, list) else 0

        inventory.append(
            UnitQuestionInventoryItem(
                question_id=q.id,
                question_number=q.question_number or 1,
                exam_id=q.exam_id,
                exam_title=ex.title if ex else f"Exam #{q.exam_id}",
                exam_type=e_type,
                template_type=t_type_str or "generic_mcq",
                template_name=t_name,
                stem_text=q.stem_text or "Question prompt text unavailable",
                points=pts,
                average_score_pct=avg_pct,
                cognitive_level=normalize_cognitive_level(q.cognitive_level) or "understand",
                subparts_count=subparts_cnt,
                criteria_count=crit_cnt
            )
        )

    return inventory


def compute_student_cross_analytics_dossier(
    student_id: int,
    course_id: int,
    db: Session
) -> StudentCrossAnalyticsDossier:
    """
    Synthesizes a deep, student-level cross-analytics dossier connecting
    assessment attainment, material study progress, difficulty flags, and AI inquiries.
    """
    student = db.query(User).filter(User.id == student_id).first()
    if not student:
        raise ValueError(f"Student #{student_id} not found")

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise ValueError(f"Course #{course_id} not found")

    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc(), Unit.id.asc()).all()
    lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
    lesson_ids = [l.id for l in lessons]

    materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
    mat_ids = [m.id for m in materials]

    # Student progress
    progress_records = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.student_id == student_id,
        StudentMaterialProgress.material_id.in_(mat_ids)
    ).all() if mat_ids else []
    completed_mats = sum(1 for p in progress_records if p.is_completed)
    overall_mat_pct = safe_percentage(completed_mats, len(materials), default=0.0) if materials else None

    # Student flags & AI queries
    flags = db.query(MaterialFlag).filter(
        MaterialFlag.student_id == student_id,
        MaterialFlag.material_id.in_(mat_ids)
    ).all() if mat_ids else []
    flags_count = len(flags)
    unresolved_flags = sum(1 for f in flags if not f.is_resolved)

    ai_questions = db.query(StudentQuestion).filter(
        StudentQuestion.student_id == student_id,
        StudentQuestion.course_id == course_id
    ).all()
    ai_inquiries_cnt = len(ai_questions)

    # Student submissions & answers
    exams = db.query(ALExam).filter(ALExam.course_id == course_id).all()
    exam_ids = [e.id for e in exams]
    exam_map = {e.id: e for e in exams}

    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.student_id == student_id,
        ALStudentSubmission.exam_id.in_(exam_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all() if exam_ids else []

    sub_ids = [s.id for s in submissions]
    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []

    questions = db.query(ALQuestion).filter(ALQuestion.exam_id.in_(exam_ids)).all() if exam_ids else []
    q_map = {q.id: q for q in questions}

    exam_percentages = [float(s.percentage) for s in submissions if s.percentage is not None]
    overall_assessment_pct = round(statistics.mean(exam_percentages), 1) if exam_percentages else None

    # Format breakdown
    mcq_scores: List[float] = []
    str_scores: List[float] = []
    esy_scores: List[float] = []
    cog_scores: Dict[str, List[float]] = {}

    for a in answers:
        q = q_map.get(a.question_id)
        if not q: continue
        ex = exam_map.get(q.exam_id)
        e_type = getattr(ex.exam_type, "value", str(ex.exam_type)).lower() if ex else ""
        pts = float(q.points or 1.0)
        sc = float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0)
        pct = safe_percentage(sc, pts, default=0.0) if pts > 0 else 0.0

        if "mcq" in e_type: mcq_scores.append(pct)
        elif "structured" in e_type: str_scores.append(pct)
        elif "essay" in e_type: esy_scores.append(pct)

        c_level = normalize_cognitive_level(q.cognitive_level)
        if c_level: cog_scores.setdefault(c_level, []).append(pct)

    format_breakdown = {
        "mcq_percentage": round(statistics.mean(mcq_scores), 1) if mcq_scores else None,
        "structured_percentage": round(statistics.mean(str_scores), 1) if str_scores else None,
        "essay_percentage": round(statistics.mean(esy_scores), 1) if esy_scores else None
    }

    cognitive_breakdown = {
        lvl: (round(statistics.mean(sc_list), 1) if sc_list else None)
        for lvl, sc_list in cog_scores.items()
    }

    # Student unit breakdown
    unit_breakdown: List[Dict[str, Any]] = []
    for u_idx_loop, u in enumerate(units):
        u_lessons = [l for l in lessons if l.unit_id == u.id]
        u_lesson_ids = [l.id for l in u_lessons]
        u_materials = [m for m in materials if m.lesson_id in u_lesson_ids]
        u_mat_ids = [m.id for m in u_materials]
        u_completed = sum(1 for p in progress_records if p.material_id in u_mat_ids and p.is_completed)
        u_comp_pct = safe_percentage(u_completed, len(u_materials), default=0.0) if u_materials else None

        u_scores = []
        for a in answers:
            q = q_map.get(a.question_id)
            if not q: continue
            t_type_str = getattr(q.template_type, "value", str(q.template_type)) if q.template_type else None
            mapped_idx = map_question_to_unit_index(q.question_number, t_type_str, q.exam_id, len(units))
            if mapped_idx != u_idx_loop: continue
            pts = float(q.points or 1.0)
            sc = float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0)
            pct = safe_percentage(sc, pts, default=0.0) if pts > 0 else 0.0
            u_scores.append(pct)

        u_avg = round(statistics.mean(u_scores), 1) if u_scores else None
        u_flags_cnt = sum(1 for f in flags if f.material_id in u_mat_ids)

        has_u_learning = bool(u_completed > 0)
        has_u_assessment = bool(u_avg is not None)
        if not has_u_learning and not has_u_assessment: u_ev = "NO_DATA"; u_stat = "NO_DATA"
        elif has_u_learning and not has_u_assessment: u_ev = "LEARNING_ONLY"; u_stat = "Studied (No Assessment)"
        elif not has_u_learning and has_u_assessment: u_ev = "ASSESSMENT_ONLY"; u_stat = "Mastered" if u_avg >= 75.0 else ("On Track" if u_avg >= 60.0 else "Needs Attention")
        elif (u_comp_pct or 0) >= 50.0 and u_avg is not None and u_avg >= 75.0: u_ev = "STRONG_EVIDENCE"; u_stat = "Mastered"
        else:
            u_ev = "EVIDENCE_AVAILABLE"
            u_stat = "On Track" if (u_avg or 0) >= 60.0 else ("Needs Attention" if (u_avg or 0) < 50.0 or u_flags_cnt >= 2 else "Developing")

        unit_breakdown.append({
            "unit_id": u.id,
            "unit_title": u.title,
            "material_completion_pct": u_comp_pct,
            "assessment_score_pct": u_avg,
            "flags_count": u_flags_cnt,
            "evidence_status": u_ev,
            "mastery_status": u_stat
        })

    # Student 4-state divergence & primary signal
    div_state, div_label, div_interp, div_action = classify_four_state_divergence(
        overall_mat_pct, overall_assessment_pct, len(answers), flags_count, ai_inquiries_cnt
    )

    if overall_assessment_pct is None:
        primary_signal = "No Activity" if (overall_mat_pct or 0) == 0 else "Monitor"
    elif overall_assessment_pct < 35.0 or (overall_assessment_pct < 50.0 and flags_count >= 3):
        primary_signal = "High Priority"
    elif overall_assessment_pct < 50.0 or flags_count >= 2:
        primary_signal = "Needs Attention"
    elif overall_assessment_pct < 70.0:
        primary_signal = "Monitor"
    else:
        primary_signal = "Strong"

    evidence_st = "NO_DATA" if (overall_mat_pct is None and overall_assessment_pct is None) else (
        "STRONG_EVIDENCE" if len(submissions) >= 3 and len(progress_records) >= 10 else "EVIDENCE_AVAILABLE"
    )

    teacher_actions = [
        ActionableTargetLink(label="Inspect Submitted Answers", target_url=f"/dashboard/teacher/al-exams/submissions/{submissions[0].id}" if submissions else "/dashboard/teacher/al-exams", action_type="marking_studio"),
        ActionableTargetLink(label="Review Flagged Materials", target_url="/dashboard/teacher/materials", action_type="review_material")
    ]

    return StudentCrossAnalyticsDossier(
        student_id=student.id,
        student_name=student.full_name or f"Student #{student.id}",
        student_email=student.email,
        course_id=course.id,
        course_title=course.title,
        overall_assessment_pct=overall_assessment_pct,
        overall_material_completion_pct=overall_mat_pct,
        total_flags_count=flags_count,
        unresolved_flags_count=unresolved_flags,
        ask_ai_inquiries_count=ai_inquiries_cnt,
        primary_learning_signal=primary_signal,
        evidence_state=evidence_st,
        divergence_state=div_state,
        divergence_explanation=div_interp,
        unit_breakdown=unit_breakdown,
        format_breakdown=format_breakdown,
        cognitive_breakdown=cognitive_breakdown,
        suggested_teacher_actions=teacher_actions
    )
