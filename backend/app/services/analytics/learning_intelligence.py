"""
Advanced Cross-Analytics & Learning Intelligence Engine.
Connects Assessment Results, Syllabus Units, Question Types, Cognitive Levels,
Learning Materials, Difficulty Flags, Ask AI Inquiries, and Longitudinal Trends.
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
    ActionableTargetLink, ContentHotspotIntelligence, QuestionTypeTopicCrossItem,
    CognitiveLevelTopicCrossItem, DistractorIntelligenceItem, LongitudinalTopicTrendItem,
    TeacherCourseLearningIntelligenceReport, StudentPersonalLearningIntelligenceReport
)
from app.services.analytics.normalization import (
    safe_div, safe_percentage, normalize_cognitive_level, parse_context_location,
    map_question_to_unit_index
)


def classify_evidence_confidence(sample_size: int) -> str:
    """Centralized sample-size confidence classifier."""
    if sample_size < 3:
        return "insufficient_data"
    elif sample_size < 10:
        return "early_signal"
    elif sample_size < 25:
        return "emerging_pattern"
    else:
        return "strong_pattern"


def compute_teacher_learning_intelligence(
    course_id: int,
    db: Session
) -> TeacherCourseLearningIntelligenceReport:
    """
    Computes cross-domain learning intelligence for a course, connecting
    learning behaviour, confusion flags, Ask AI questions, and assessment performance.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    course_title = course.title if course else f"Course #{course_id}"

    # 1. Enrollments
    enrollments_count = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.is_active == True
    ).count()

    # 2. Units, Lessons & Materials
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc()).all()
    lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
    lesson_ids = [l.id for l in lessons]

    materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
    mat_map = {m.id: m for m in materials}
    mat_ids = list(mat_map.keys())

    # 3. Material Progress & Flags
    progress_records = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.material_id.in_(mat_ids)
    ).all() if mat_ids else []

    flags = db.query(MaterialFlag).filter(
        MaterialFlag.material_id.in_(mat_ids)
    ).all() if mat_ids else []

    # 4. Ask AI Questions
    questions_ai = db.query(StudentQuestion).filter(
        StudentQuestion.course_id == course_id
    ).all()

    # 5. Exams, Submissions & Answers
    exams = db.query(ALExam).filter(ALExam.course_id == course_id).all()
    exam_ids = [e.id for e in exams]
    exam_map = {e.id: e for e in exams}

    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id.in_(exam_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).order_by(ALStudentSubmission.started_at.asc()).all() if exam_ids else []

    sub_ids = [s.id for s in submissions]
    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []

    ans_by_q: Dict[int, List[ALStudentAnswer]] = {}
    for a in answers:
        ans_by_q.setdefault(a.question_id, []).append(a)

    questions_list = db.query(ALQuestion).filter(
        ALQuestion.exam_id.in_(exam_ids)
    ).all() if exam_ids else []

    # ─────────────────────────────────────────────────────────────
    # A. Content Hotspots Intelligence
    # ─────────────────────────────────────────────────────────────
    hotspots_list: List[ContentHotspotIntelligence] = []
    question_type_cross_list: List[QuestionTypeTopicCrossItem] = []
    cognitive_cross_list: List[CognitiveLevelTopicCrossItem] = []
    longitudinal_trends_list: List[LongitudinalTopicTrendItem] = []

    for u_idx_loop, u in enumerate(units):
        u_lessons = [l for l in lessons if l.unit_id == u.id]
        u_lesson_ids = [l.id for l in u_lessons]
        u_materials = [m for m in materials if m.lesson_id in u_lesson_ids]
        u_mat_ids = [m.id for m in u_materials]

        # Material progress
        u_prog = [p for p in progress_records if p.material_id in u_mat_ids]
        u_completed_cnt = sum(1 for p in u_prog if p.is_completed)
        u_possible = len(u_materials) * enrollments_count
        u_mat_pct = safe_percentage(u_completed_cnt, u_possible, default=None) if u_possible > 0 else None

        # Flags & AI queries in unit
        u_flags = [f for f in flags if f.material_id in u_mat_ids]
        u_flags_cnt = len(u_flags)
        u_unres_flags = sum(1 for f in u_flags if not f.is_resolved)

        u_ai = [q for q in questions_ai if (q.course_material_id in u_mat_ids or (q.topic_category and u.title.lower() in q.topic_category.lower()))]
        u_ai_cnt = len(u_ai)

        # Assessment performance in unit
        u_scores: List[float] = []
        u_recall_scores: List[float] = []
        u_applied_scores: List[float] = []
        u_lower_cog_scores: List[float] = []
        u_higher_cog_scores: List[float] = []
        u_subpart_loss_cnt = 0
        u_essay_omission_cnt = 0

        # Group attempts chronologically for longitudinal trend
        u_chronological_scores: List[float] = []

        for s in submissions:
            ex = exam_map.get(s.exam_id)
            if ex and ex.lesson_id and u_lesson_ids and ex.lesson_id not in u_lesson_ids:
                continue
            sub_ans = [a for a in answers if a.submission_id == s.id]
            for a in sub_ans:
                q = next((item for item in questions_list if item.id == a.question_id), None)
                if not q:
                    continue

                # If exam is course-wide (no single lesson attached), map question to syllabus unit
                if not (ex and ex.lesson_id):
                    t_type_str = getattr(q.template_type, "value", str(q.template_type)) if q.template_type else None
                    mapped_idx = map_question_to_unit_index(q.question_number, t_type_str, q.exam_id, len(units))
                    if mapped_idx != u_idx_loop:
                        continue

                q_pts = float(q.points or 1.0)
                sc = float(a.final_score or a.teacher_score or a.raw_points_earned or 0.0)
                pct = safe_percentage(sc, q_pts, default=0.0) if q_pts > 0 else 0.0
                u_scores.append(pct)
                u_chronological_scores.append(pct)

                t_type = getattr(q.template_type, "value", str(q.template_type)).lower() if q.template_type else "generic_mcq"
                if t_type in ["generic_mcq", "five_statement_truth"]:
                    u_recall_scores.append(pct)
                else:
                    u_applied_scores.append(pct)

                c_level = normalize_cognitive_level(q.cognitive_level)
                if c_level in ["remember", "understand"]:
                    u_lower_cog_scores.append(pct)
                else:
                    u_higher_cog_scores.append(pct)

                if "structured" in t_type and pct < 50.0:
                    u_subpart_loss_cnt += 1
                elif "essay" in t_type and pct < 50.0:
                    u_essay_omission_cnt += 1

        avg_assessment = round(statistics.mean(u_scores), 1) if u_scores else None
        total_sample = len(u_scores) + u_flags_cnt + u_ai_cnt
        confidence = classify_evidence_confidence(total_sample)

        # Evidence accumulation
        evidence_points: List[str] = []
        evidence_score = 0

        if avg_assessment is not None and avg_assessment < 55.0:
            evidence_points.append(f"Below-average assessment attainment ({avg_assessment}%)")
            evidence_score += 2

        if u_mat_pct is not None and u_mat_pct >= 65.0 and avg_assessment is not None and avg_assessment < 55.0:
            evidence_points.append(f"High material completion ({u_mat_pct}%) diverges from assessment score ({avg_assessment}%)")
            evidence_score += 2

        if u_flags_cnt >= 3 or u_unres_flags >= 2:
            evidence_points.append(f"Elevated difficulty flags ({u_flags_cnt} total, {u_unres_flags} unresolved)")
            evidence_score += 1

        if u_ai_cnt >= 5:
            evidence_points.append(f"High Ask AI question volume ({u_ai_cnt} student queries)")
            evidence_score += 1

        if u_subpart_loss_cnt >= 2:
            evidence_points.append(f"{u_subpart_loss_cnt} structured subpart low-scoring attempts recorded")
            evidence_score += 1

        if u_essay_omission_cnt >= 2:
            evidence_points.append(f"{u_essay_omission_cnt} essay criteria omissions recorded")
            evidence_score += 1

        # Determine Canonical Evidence State (Phase V5.3)
        has_learning = bool(u_mat_pct is not None and u_mat_pct > 0)
        has_assessment = bool(avg_assessment is not None)

        if not has_learning and not has_assessment and total_sample == 0:
            evidence_st = "NO_DATA"
            priority = "NO_DATA"
            neutral_text = f"No learning activity or assessment evidence has been recorded for {u.title}."
        elif has_learning and not has_assessment:
            evidence_st = "LEARNING_ONLY"
            priority = "MONITORING" if (u_flags_cnt > 0 or u_ai_cnt > 0) else "LEARNING_ONLY"
            neutral_text = f"Material engagement recorded ({u_mat_pct}% completion) for {u.title}. Assessment attainment will populate when students take exams."
        elif not has_learning and has_assessment:
            evidence_st = "ASSESSMENT_ONLY"
            if avg_assessment is not None and avg_assessment < 50.0:
                priority = "HIGH_PRIORITY"
            elif avg_assessment is not None and avg_assessment < 65.0:
                priority = "MONITORING"
            else:
                priority = "ASSESSMENT_ONLY"
            neutral_text = f"Assessment attainment is {avg_assessment}% for {u.title}, but no material-study activity has been recorded."
        elif total_sample < 5:
            evidence_st = "LIMITED_DATA"
            priority = "HIGH_PRIORITY" if (avg_assessment is not None and avg_assessment < 50.0) else "MONITORING"
            neutral_text = f"Early signal for {u.title} based on limited sample ({total_sample} data points)."
        else:
            if len(evidence_points) >= 2 or (u_mat_pct is not None and u_mat_pct >= 50.0 and len(u_scores) >= 10):
                evidence_st = "STRONG_EVIDENCE"
            else:
                evidence_st = "EVIDENCE_AVAILABLE"

            if evidence_score >= 4 or (avg_assessment is not None and avg_assessment < 50.0):
                priority = "HIGH_PRIORITY"
                neutral_text = f"{u.title} exhibits intersecting support activity (AI inquiries & flags) alongside lower assessment attainment ({avg_assessment}%)."
            elif evidence_score >= 1 or (avg_assessment is not None and avg_assessment < 65.0):
                priority = "MONITORING"
                neutral_text = f"{u.title} shows signals that targeted revision could improve class attainment ({avg_assessment}%)."
            else:
                priority = "HEALTHY"
                neutral_text = f"{u.title} reflects steady material engagement ({u_mat_pct}%) and solid assessment attainment ({avg_assessment}%)."

        # Actionable Target Links
        actions = [
            ActionableTargetLink(label="Review Lesson Materials", target_url=f"/dashboard/teacher/materials", action_type="review_material"),
            ActionableTargetLink(label="Inspect Exam Items", target_url=f"/dashboard/teacher/al-exams/analytics?exam_id={exam_ids[0]}" if exam_ids else "/dashboard/teacher/al-exams", action_type="inspect_item"),
        ]

        hotspots_list.append(
            ContentHotspotIntelligence(
                hotspot_id=f"hotspot-u-{u.id}",
                unit_id=u.id,
                unit_title=u.title,
                priority_level=priority,
                evidence_state=evidence_st,
                evidence_confidence=confidence,
                evidence_points=evidence_points,
                material_completion_pct=u_mat_pct,
                assessment_score_pct=avg_assessment,
                flags_count=u_flags_cnt,
                unresolved_flags_count=u_unres_flags,
                ai_inquiries_count=u_ai_cnt,
                subpart_losses_count=u_subpart_loss_cnt,
                essay_omissions_count=u_essay_omission_cnt,
                neutral_insight=neutral_text,
                recommended_actions=actions
            )
        )

        # ─────────────────────────────────────────────────────────────
        # B. Question Type × Topic Matrix
        # ─────────────────────────────────────────────────────────────
        if u_recall_scores or u_applied_scores:
            rec_avg = round(statistics.mean(u_recall_scores), 1) if u_recall_scores else None
            app_avg = round(statistics.mean(u_applied_scores), 1) if u_applied_scores else None
            gap = round(rec_avg - app_avg, 1) if (rec_avg is not None and app_avg is not None) else None

            if gap is not None and gap > 15.0:
                q_insight = f"Students achieve substantially higher scores on direct recall items ({rec_avg}%) than applied multi-variable questions ({app_avg}%)."
            elif gap is not None and gap < -10.0:
                q_insight = f"Applied problem solving ({app_avg}%) is strong relative to direct recall items ({rec_avg}%)."
            else:
                q_insight = "Balanced attainment between factual recall and applied question structures."

            question_type_cross_list.append(
                QuestionTypeTopicCrossItem(
                    unit_title=u.title,
                    direct_recall_accuracy=rec_avg,
                    applied_multi_variable_accuracy=app_avg,
                    gap_percentage=gap,
                    insight=q_insight
                )
            )

        # ─────────────────────────────────────────────────────────────
        # C. Cognitive Level × Topic Matrix
        # ─────────────────────────────────────────────────────────────
        if u_lower_cog_scores or u_higher_cog_scores:
            low_avg = round(statistics.mean(u_lower_cog_scores), 1) if u_lower_cog_scores else None
            high_avg = round(statistics.mean(u_higher_cog_scores), 1) if u_higher_cog_scores else None
            att_gap = round(low_avg - high_avg, 1) if (low_avg is not None and high_avg is not None) else None

            if att_gap is not None and att_gap > 15.0:
                c_insight = f"Cognitive attenuation observed: performance drops by {att_gap}% on higher-order analytical/evaluation questions."
            else:
                c_insight = "Attainment remains steady across lower and higher Bloom cognitive depths."

            cognitive_cross_list.append(
                CognitiveLevelTopicCrossItem(
                    unit_title=u.title,
                    lower_order_accuracy=low_avg,
                    higher_order_accuracy=high_avg,
                    attenuation_gap=att_gap,
                    insight=c_insight
                )
            )

        # ─────────────────────────────────────────────────────────────
        # D. Longitudinal Topic Trends
        # ─────────────────────────────────────────────────────────────
        if len(u_chronological_scores) >= 4:
            first_half = statistics.mean(u_chronological_scores[:len(u_chronological_scores)//2])
            second_half = statistics.mean(u_chronological_scores[len(u_chronological_scores)//2:])
            diff = round(second_half - first_half, 1)

            if diff >= 5.0:
                trend_dir = "improving"
                t_insight = f"Attainment in {u.title} has increased by +{diff}% across recent attempts."
            elif diff <= -5.0:
                trend_dir = "declining"
                t_insight = f"Attainment in {u.title} has decreased by {diff}% across recent attempts."
            elif second_half >= 75.0:
                trend_dir = "stable_strength"
                t_insight = f"Stable high attainment maintained across {u.title}."
            elif second_half < 50.0:
                trend_dir = "persistent_weakness"
                t_insight = f"Persistent lower attainment in {u.title} across multiple assessment cycles."
            else:
                trend_dir = "improving"
                t_insight = "Steady performance trajectory."

            longitudinal_trends_list.append(
                LongitudinalTopicTrendItem(
                    unit_title=u.title,
                    trend_direction=trend_dir,
                    score_progression=[round(x, 1) for x in u_chronological_scores[-5:]],
                    net_change_pct=diff,
                    insight=t_insight
                )
            )

    # ─────────────────────────────────────────────────────────────
    # E. Distractor Intelligence (MCQ items)
    # ─────────────────────────────────────────────────────────────
    distractor_list: List[DistractorIntelligenceItem] = []
    for q in questions_list:
        q_ans = ans_by_q.get(q.id, [])
        if len(q_ans) < 5:
            continue

        ex = exam_map.get(q.exam_id)
        # Count option selections
        opt_counts: Dict[str, int] = {}
        for a in q_ans:
            raw_sel = a.selected_option
            if raw_sel:
                key = str(raw_sel).strip().upper().replace("(", "").replace(")", "")
                opt_counts[key] = opt_counts.get(key, 0) + 1

        corr_opt = str(q.correct_option or "A").strip().upper().replace("(", "").replace(")", "")
        total_ans = len(q_ans)

        for opt_k, count in opt_counts.items():
            if opt_k != corr_opt:
                sel_pct = safe_percentage(count, total_ans, default=0.0)
                if sel_pct >= 25.0: # Strong distractor
                    stem_snip = (q.stem_text[:80] + "...") if q.stem_text and len(q.stem_text) > 80 else (q.stem_text or "Question")
                    distractor_list.append(
                        DistractorIntelligenceItem(
                            question_id=q.id,
                            question_number=q.question_number or 1,
                            exam_title=ex.title if ex else f"Exam #{q.exam_id}",
                            stem_snippet=stem_snip,
                            correct_option=corr_opt,
                            strong_distractor_option=opt_k,
                            distractor_selection_pct=sel_pct,
                            cognitive_level=normalize_cognitive_level(q.cognitive_level).capitalize(),
                            insight=f"Option ({opt_k}) attracted {sel_pct}% of class responses (Correct: {corr_opt})."
                        )
                    )

    # ─────────────────────────────────────────────────────────────
    # F. Deterministic Executive Narrative Synthesis
    # ─────────────────────────────────────────────────────────────
    high_hotspots = [h for h in hotspots_list if h.priority_level == "HIGH_PRIORITY"]
    med_hotspots = [h for h in hotspots_list if h.priority_level == "MEDIUM_PRIORITY"]
    improving_topics = [t for t in longitudinal_trends_list if t.trend_direction == "improving"]

    summary_sentences = []
    if high_hotspots:
        names = ", ".join(h.unit_title for h in high_hotspots[:2])
        summary_sentences.append(f"High-priority learning hotspots identified in {names}, where elevated AI questions and material difficulty flags intersect with lower assessment attainment.")
    elif med_hotspots:
        names = ", ".join(h.unit_title for h in med_hotspots[:2])
        summary_sentences.append(f"Routine review recommended for {names} based on moderate support inquiries.")
    elif len(submissions) == 0 and len(progress_records) == 0:
        summary_sentences.append("No student learning activity or assessment submissions have been recorded yet across the syllabus units.")
    elif len(submissions) == 0:
        summary_sentences.append("Material engagement has been recorded. Assessment performance patterns will populate as students complete examinations.")
    else:
        summary_sentences.append("All analyzed syllabus units currently maintain steady attainment and balanced engagement.")

    if improving_topics:
        names = ", ".join(t.unit_title for t in improving_topics[:2])
        summary_sentences.append(f"Positive learning momentum observed with measurable score gains in {names}.")

    if distractor_list:
        summary_sentences.append(f"{len(distractor_list)} specific MCQ items exhibit strong distractor attraction (>25% class selection) suitable for teacher review.")

    executive_narrative = " ".join(summary_sentences)

    return TeacherCourseLearningIntelligenceReport(
        course_id=course_id,
        course_title=course_title,
        enrolled_students=enrollments_count,
        total_assessments_analyzed=len(submissions),
        hotspots=hotspots_list,
        question_type_cross_matrix=question_type_cross_list,
        cognitive_cross_matrix=cognitive_cross_list,
        distractor_insights=distractor_list[:6],
        longitudinal_trends=longitudinal_trends_list,
        executive_summary_narrative=executive_narrative,
        ai_narrative_status="deterministic_ready"
    )


def compute_student_learning_intelligence(
    student_id: int,
    course_id: Optional[int],
    db: Session
) -> StudentPersonalLearningIntelligenceReport:
    """
    Computes personalized student cross-domain learning intelligence.
    Strictly isolated to the student's own records.
    """
    student = db.query(User).filter(User.id == student_id).first()
    if not student:
        raise ValueError(f"Student #{student_id} not found")

    student_name = student.full_name or f"Student #{student.id}"

    # Enrollments
    enrollments_query = db.query(Enrollment).filter(
        Enrollment.student_id == student_id,
        Enrollment.is_active == True
    )
    if course_id:
        enrollments_query = enrollments_query.filter(Enrollment.course_id == course_id)
    enrollments = enrollments_query.all()
    enrolled_course_ids = [e.course_id for e in enrollments]

    # Units & Materials
    units = db.query(Unit).filter(Unit.course_id.in_(enrolled_course_ids)).order_by(Unit.order.asc()).all() if enrolled_course_ids else []
    lessons = db.query(Lesson).filter(Lesson.course_id.in_(enrolled_course_ids)).all() if enrolled_course_ids else []
    lesson_ids = [l.id for l in lessons]

    materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
    mat_map = {m.id: m for m in materials}
    mat_ids = list(mat_map.keys())

    progress_records = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.student_id == student_id,
        StudentMaterialProgress.material_id.in_(mat_ids)
    ).all() if mat_ids else []

    flags = db.query(MaterialFlag).filter(
        MaterialFlag.student_id == student_id,
        MaterialFlag.material_id.in_(mat_ids)
    ).all() if mat_ids else []

    ai_questions = db.query(StudentQuestion).filter(
        StudentQuestion.student_id == student_id
    ).all()

    # Submissions
    exams = db.query(ALExam).filter(ALExam.course_id.in_(enrolled_course_ids)).all() if enrolled_course_ids else []
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

    questions_list = db.query(ALQuestion).filter(
        ALQuestion.exam_id.in_(exam_ids)
    ).all() if exam_ids else []

    personal_hotspots: List[ContentHotspotIntelligence] = []
    question_format_divergence: List[QuestionTypeTopicCrossItem] = []
    cognitive_attenuation: List[CognitiveLevelTopicCrossItem] = []
    personal_longitudinal: List[LongitudinalTopicTrendItem] = []
    actions_list: List[ActionableTargetLink] = []

    for u_idx_loop, u in enumerate(units):
        u_lessons = [l for l in lessons if l.unit_id == u.id]
        u_lesson_ids = [l.id for l in u_lessons]
        u_materials = [m for m in materials if m.lesson_id in u_lesson_ids]
        u_mat_ids = [m.id for m in u_materials]

        u_prog = [p for p in progress_records if p.material_id in u_mat_ids]
        u_completed_cnt = sum(1 for p in u_prog if p.is_completed)
        u_mat_pct = safe_percentage(u_completed_cnt, len(u_materials), default=0.0) if u_materials else None

        u_flags = [f for f in flags if f.material_id in u_mat_ids]
        u_flags_cnt = len(u_flags)
        u_unres_flags = sum(1 for f in u_flags if not f.is_resolved)

        u_ai = [q for q in ai_questions if (q.course_material_id in u_mat_ids or (q.topic_category and u.title.lower() in q.topic_category.lower()))]
        u_ai_cnt = len(u_ai)

        u_scores: List[float] = []
        u_recall_scores: List[float] = []
        u_applied_scores: List[float] = []
        u_lower_cog: List[float] = []
        u_higher_cog: List[float] = []
        u_chronological: List[float] = []

        for s in submissions:
            ex = exam_map.get(s.exam_id)
            if ex and ex.lesson_id and u_lesson_ids and ex.lesson_id not in u_lesson_ids:
                continue
            sub_ans = [a for a in answers if a.submission_id == s.id]
            for a in sub_ans:
                q = next((item for item in questions_list if item.id == a.question_id), None)
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
                u_scores.append(pct)
                u_chronological.append(pct)

                t_type = getattr(q.template_type, "value", str(q.template_type)).lower() if q.template_type else "generic_mcq"
                if t_type in ["generic_mcq", "five_statement_truth"]:
                    u_recall_scores.append(pct)
                else:
                    u_applied_scores.append(pct)

                c_level = normalize_cognitive_level(q.cognitive_level)
                if c_level in ["remember", "understand"]:
                    u_lower_cog.append(pct)
                else:
                    u_higher_cog.append(pct)

        avg_assessment = round(statistics.mean(u_scores), 1) if u_scores else None
        total_sample = len(u_scores) + u_flags_cnt + u_ai_cnt
        confidence = classify_evidence_confidence(total_sample)

        evidence_points: List[str] = []
        if avg_assessment is not None and avg_assessment < 55.0:
            evidence_points.append(f"Assessment attainment is {avg_assessment}%")
        if u_flags_cnt >= 2:
            evidence_points.append(f"{u_flags_cnt} difficulty flags submitted")
        if u_ai_cnt >= 3:
            evidence_points.append(f"{u_ai_cnt} Ask AI queries on this concept")

        # Determine Student Personal Evidence State
        has_student_learning = bool(u_completed_cnt > 0)
        has_student_assessment = bool(avg_assessment is not None)

        if not has_student_learning and not has_student_assessment and total_sample == 0:
            evidence_st = "NO_DATA"
            priority = "NO_DATA"
            neutral_text = f"No study activity or assessment attempts recorded yet for {u.title}."
        elif has_student_learning and not has_student_assessment:
            evidence_st = "LEARNING_ONLY"
            priority = "MONITORING" if (u_flags_cnt > 0 or u_ai_cnt > 0) else "LEARNING_ONLY"
            neutral_text = f"Materials studied ({u_mat_pct}% completion) in {u.title}. Assessment performance data will appear after exam attempts."
        elif not has_student_learning and has_student_assessment:
            evidence_st = "ASSESSMENT_ONLY"
            if avg_assessment is not None and avg_assessment < 50.0:
                priority = "HIGH_PRIORITY"
            elif avg_assessment is not None and avg_assessment < 65.0:
                priority = "MONITORING"
            else:
                priority = "ASSESSMENT_ONLY"
            neutral_text = f"Assessment attainment is {avg_assessment}% for {u.title}; learning activity evidence is currently unavailable."
        elif total_sample < 5:
            evidence_st = "LIMITED_DATA"
            priority = "HIGH_PRIORITY" if (avg_assessment is not None and avg_assessment < 50.0) else "MONITORING"
            neutral_text = f"Early signal for {u.title} based on limited personal attempts ({total_sample} data points)."
        else:
            if len(evidence_points) >= 2 or (u_completed_cnt >= 2 and len(u_scores) >= 5):
                evidence_st = "STRONG_EVIDENCE"
            else:
                evidence_st = "EVIDENCE_AVAILABLE"

            if len(evidence_points) >= 2 or (avg_assessment is not None and avg_assessment < 50.0):
                priority = "HIGH_PRIORITY"
                neutral_text = f"You have asked multiple AI queries or flagged materials in {u.title} alongside lower assessment scores ({avg_assessment}%)."
                actions_list.append(
                    ActionableTargetLink(
                        label=f"Review {u.title} Material",
                        target_url=f"/dashboard/student/courses",
                        action_type="review_material"
                    )
                )
            elif len(evidence_points) == 1 or (avg_assessment is not None and avg_assessment < 65.0):
                priority = "MONITORING"
                neutral_text = f"{u.title} shows early signals that targeted revision could improve your confidence ({avg_assessment}%)."
            else:
                priority = "HEALTHY"
                neutral_text = f"Solid personal mastery observed in {u.title} ({avg_assessment}% attainment, {u_mat_pct}% material completion)."

        personal_hotspots.append(
            ContentHotspotIntelligence(
                hotspot_id=f"student-hotspot-u-{u.id}",
                unit_id=u.id,
                unit_title=u.title,
                priority_level=priority,
                evidence_state=evidence_st,
                evidence_confidence=confidence,
                evidence_points=evidence_points,
                material_completion_pct=u_mat_pct,
                assessment_score_pct=avg_assessment,
                flags_count=u_flags_cnt,
                unresolved_flags_count=u_unres_flags,
                ai_inquiries_count=u_ai_cnt,
                subpart_losses_count=0,
                essay_omissions_count=0,
                neutral_insight=neutral_text,
                recommended_actions=[
                    ActionableTargetLink(label="Study Materials", target_url="/dashboard/student/courses", action_type="review_material"),
                    ActionableTargetLink(label="Practice Exam", target_url="/dashboard/student/al-exams", action_type="practice_exam"),
                ]
            )
        )

        # Question type divergence (require at least 2 attempts in both categories)
        if len(u_recall_scores) >= 2 and len(u_applied_scores) >= 2:
            rec_avg = round(statistics.mean(u_recall_scores), 1)
            app_avg = round(statistics.mean(u_applied_scores), 1)
            gap = round(rec_avg - app_avg, 1)
            if gap > 15.0:
                question_format_divergence.append(
                    QuestionTypeTopicCrossItem(
                        unit_title=u.title,
                        direct_recall_accuracy=rec_avg,
                        applied_multi_variable_accuracy=app_avg,
                        gap_percentage=gap,
                        insight=f"You score higher on factual questions ({rec_avg}%) than multi-variable combination items ({app_avg}%)."
                    )
                )

        # Cognitive attenuation (require at least 2 attempts in both categories)
        if len(u_lower_cog) >= 2 and len(u_higher_cog) >= 2:
            low_avg = round(statistics.mean(u_lower_cog), 1)
            high_avg = round(statistics.mean(u_higher_cog), 1)
            att_gap = round(low_avg - high_avg, 1)
            if att_gap > 15.0:
                cognitive_attenuation.append(
                    CognitiveLevelTopicCrossItem(
                        unit_title=u.title,
                        lower_order_accuracy=low_avg,
                        higher_order_accuracy=high_avg,
                        attenuation_gap=att_gap,
                        insight=f"Higher-order analysis questions ({high_avg}%) present a greater challenge than recall questions ({low_avg}%)."
                    )
                )

        # Longitudinal trend
        if len(u_chronological) >= 3:
            first_half = statistics.mean(u_chronological[:len(u_chronological)//2])
            second_half = statistics.mean(u_chronological[len(u_chronological)//2:])
            diff = round(second_half - first_half, 1)
            trend_dir = "improving" if diff >= 5.0 else ("declining" if diff <= -5.0 else "stable_strength")
            t_text = f"Your performance in {u.title} has shifted by {diff:+}% over recent attempts."
            personal_longitudinal.append(
                LongitudinalTopicTrendItem(
                    unit_title=u.title,
                    trend_direction=trend_dir,
                    score_progression=[round(x, 1) for x in u_chronological[-4:]],
                    net_change_pct=diff,
                    insight=t_text
                )
            )

    # Narrative
    review_hotspots = [h for h in personal_hotspots if h.priority_level in ["HIGH_PRIORITY", "MEDIUM_PRIORITY"]]
    if len(submissions) == 0 and len(progress_records) == 0:
        narrative = "Your personal learning analytics will appear as you study lesson materials and complete practice assessments."
    elif len(submissions) == 0:
        narrative = "You have started studying course materials. Complete practice assessments to generate evidence-based mastery insights."
    elif review_hotspots:
        names = ", ".join(h.unit_title for h in review_hotspots[:2])
        narrative = f"Your learning patterns suggest focusing revision on {names}, where recent AI inquiries and assessment scores overlap."
    else:
        narrative = "You are making steady progress across all assessed syllabus units with well-rounded attainment."

    return StudentPersonalLearningIntelligenceReport(
        student_id=student_id,
        student_name=student_name,
        course_id=course_id,
        personal_hotspots=personal_hotspots,
        question_format_divergence=question_format_divergence,
        cognitive_attenuation=cognitive_attenuation,
        personal_longitudinal_trends=personal_longitudinal,
        actionable_recommendations=actions_list[:4],
        personal_executive_narrative=narrative,
        ai_narrative_status="deterministic_ready"
    )
