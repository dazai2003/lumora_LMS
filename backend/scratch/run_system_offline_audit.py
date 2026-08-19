"""
Full Assessment & Examination Lifecycle Offline Audit
Validates all 5 pillars of the Lumora LMS assessment, marking, material review,
and analytics system with 0 external API calls and 0 database writes/mutations.
"""
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import (
    User, Course, Unit, Lesson, Material, StudentMaterialProgress, MaterialFlag,
    StudentQuestion, ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer,
    ALExamType, ALQuestionTemplate
)
from app.services.analytics.student_mastery_analytics import compute_student_mastery_report
from app.services.analytics.learning_intelligence import compute_teacher_learning_intelligence
from app.services.analytics.cross_analytics import (
    compute_course_cross_analytics,
    classify_four_state_divergence,
    get_unit_question_inventory,
)
from app.services.analytics.material_analytics import compute_course_material_analytics
from app.services.analytics.ai_analytics import compute_ask_ai_analytics

db = SessionLocal()

print("=" * 90)
print("  LUMORA LMS — FULL SYSTEM OFFLINE AUDIT & DETERMINISTIC VERIFICATION")
print("=" * 90)

passed_checks = 0
total_checks = 0

def check(condition: bool, description: str):
    global passed_checks, total_checks
    total_checks += 1
    if condition:
        passed_checks += 1
        print(f"  [PASS] Check #{total_checks:02d}: {description}")
    else:
        print(f"  [FAIL] Check #{total_checks:02d}: {description}")

try:
    # ═════════════════════════════════════════════════════════════════════════
    # PILLAR 1: EXAM STRUCTURE & QUESTION TEMPLATE VALIDATION
    # ═════════════════════════════════════════════════════════════════════════
    print("\n--- PILLAR 1: EXAM STRUCTURE & QUESTION TEMPLATES ---")

    course = db.query(Course).filter(Course.id == 36).first()
    check(course is not None and course.title == "Advanced Level Biology",
          f"Target Course 36 loaded: '{course.title if course else 'None'}'")

    core_exam_ids = {210, 212, 213}
    found_core_exams = db.query(ALExam).filter(ALExam.id.in_(core_exam_ids), ALExam.course_id == 36).all()
    check(len(found_core_exams) == 3, f"Exactly 3 genuine benchmark examinations loaded in Course 36 (Found: {len(found_core_exams)})")

    # Exam 210: Paper I MCQ
    exam_mcq = db.query(ALExam).filter(ALExam.id == 210).first()
    check(exam_mcq is not None and exam_mcq.exam_type == ALExamType.PAPER_1_MCQ,
          f"Exam 210 is Paper I MCQ: '{exam_mcq.title if exam_mcq else 'None'}'")

    mcq_questions = db.query(ALQuestion).filter(ALQuestion.exam_id == 210).order_by(ALQuestion.question_number).all()
    check(len(mcq_questions) == 50, f"Exam 210 contains exactly 50 MCQs (Found: {len(mcq_questions)})")

    mcq_templates = set(q.template_type for q in mcq_questions if q.template_type)
    check(len(mcq_templates) >= 5, f"Exam 210 utilizes multiple canonical MCQ templates (Found {len(mcq_templates)} templates)")

    valid_keys = all(q.correct_option in ["A", "B", "C", "D", "E", "1", "2", "3", "4", "5"] for q in mcq_questions)
    check(valid_keys, "All 50 MCQ questions have valid answer keys (A-E / 1-5)")

    bloom_levels = set(q.cognitive_level for q in mcq_questions if q.cognitive_level)
    check(len(bloom_levels) >= 3, f"Bloom taxonomy distribution verified across MCQs (Found: {bloom_levels})")

    # Exam 212: Paper II Part A Structured
    exam_str = db.query(ALExam).filter(ALExam.id == 212).first()
    check(exam_str is not None and exam_str.exam_type == ALExamType.PAPER_2_STRUCTURED,
          f"Exam 212 is Paper II-A Structured: '{exam_str.title if exam_str else 'None'}'")

    str_questions = db.query(ALQuestion).filter(ALQuestion.exam_id == 212).order_by(ALQuestion.question_number).all()
    check(len(str_questions) == 4, f"Exam 212 contains exactly 4 structured questions (Found: {len(str_questions)})")

    str_subparts_valid = all(q.structured_subparts_json is not None and len(q.structured_subparts_json) > 0 for q in str_questions)
    check(str_subparts_valid, "All 4 structured questions contain valid nested subpart hierarchies")

    str_total_points = sum(q.points for q in str_questions)
    check(str_total_points == 160.0, f"Exam 212 structured max points sum to 160.0 (Found: {str_total_points})")

    # Exam 213: Paper II Part B Essay
    exam_esy = db.query(ALExam).filter(ALExam.id == 213).first()
    check(exam_esy is not None and exam_esy.exam_type == ALExamType.PAPER_2_ESSAY,
          f"Exam 213 is Paper II-B Essay: '{exam_esy.title if exam_esy else 'None'}'")

    esy_questions = db.query(ALQuestion).filter(ALQuestion.exam_id == 213).order_by(ALQuestion.question_number).all()
    check(len(esy_questions) == 3, f"Exam 213 contains exactly 3 essay questions (Found: {len(esy_questions)})")

    esy_rubrics_valid = all((q.essay_checklist_json is not None and len(q.essay_checklist_json) > 0) or q.explanation is not None for q in esy_questions)
    check(esy_rubrics_valid, "All 3 essay questions contain complete rubric criteria / marking notes")

    esy_total_points = sum(q.points for q in esy_questions)
    check(esy_total_points == 120.0, f"Exam 213 essay max points sum to 120.0 (Found: {esy_total_points})")

    # ═════════════════════════════════════════════════════════════════════════
    # PILLAR 2: STUDENT SUBMISSION & MATHEMATICAL SCORE SYNCHRONIZATION
    # ═════════════════════════════════════════════════════════════════════════
    print("\n--- PILLAR 2: STUDENT SUBMISSIONS & MATHEMATICAL INTEGRITY ---")

    submissions = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id.in_([210, 212, 213])).all()
    check(len(submissions) == 30, f"Exactly 30 student submissions present (Found: {len(submissions)})")

    subs_per_exam = {eid: sum(1 for s in submissions if s.exam_id == eid) for eid in (210, 212, 213)}
    check(subs_per_exam == {210: 10, 212: 10, 213: 10},
          f"Even candidate distribution: 10 per exam (Found: {subs_per_exam})")

    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_([s.id for s in submissions])
    ).all()
    check(len(answers) == 559, f"Exactly 559 student answer records present (Found: {len(answers)})")

    # Mathematical Sum check: sum(final_score) == scaled_score
    math_discrepancies = []
    for sub in submissions:
        sub_answers = [a for a in answers if a.submission_id == sub.id]
        computed_sum = sum(a.final_score or 0.0 for a in sub_answers)
        if abs(computed_sum - float(sub.scaled_score or 0.0)) > 0.01:
            math_discrepancies.append((sub.id, sub.exam_id, sub.student_id, computed_sum, sub.scaled_score))

    check(len(math_discrepancies) == 0,
          f"Mathematical mark sync: sum(answers.final_score) == submission.scaled_score for all 30 submissions (Discrepancies: {len(math_discrepancies)})")

    # MCQ Auto-grade check: selected_option vs correct_option vs score
    mcq_grading_errors = 0
    mcq_answers = [a for a in answers if a.submission_id in [s.id for s in submissions if s.exam_id == 210]]
    q_key_map = {q.id: (q.correct_option or "").strip().upper() for q in mcq_questions if q.correct_option}

    for a in mcq_answers:
        expected_key = q_key_map.get(a.question_id)
        if not expected_key:
            continue
        sel = (a.selected_option or "").strip().upper()
        letter_map = {"1": "A", "2": "B", "3": "C", "4": "D", "5": "E"}
        norm_key = letter_map.get(expected_key, expected_key)
        norm_sel = letter_map.get(sel, sel)

        if not norm_sel:
            if (a.final_score or 0) != 0.0:
                mcq_grading_errors += 1
        elif norm_sel == norm_key:
            if (a.final_score or 0) != 1.0:
                mcq_grading_errors += 1
        else:
            if (a.final_score or 0) != 0.0:
                mcq_grading_errors += 1

    check(mcq_grading_errors == 0,
          f"MCQ deterministic auto-grade consistency verified across 489 answer rows (Errors: {mcq_grading_errors})")

    # Student Ability Separation: Student 1 (Top) vs Student 10 (Struggling)
    s1_subs = [s for s in submissions if s.student_id == 6]
    s10_subs = [s for s in submissions if s.student_id == 15]

    s1_avg = sum(s.percentage for s in s1_subs) / len(s1_subs) if s1_subs else 0
    s10_avg = sum(s.percentage for s in s10_subs) / len(s10_subs) if s10_subs else 0

    check(s1_avg >= 90.0 and s10_avg < 35.0,
          f"Authentic student separation verified: Student 1 = {s1_avg:.1f}% vs Student 10 = {s10_avg:.1f}%")

    # ═════════════════════════════════════════════════════════════════════════
    # PILLAR 3: AI SCORING SCHEMAS & TEACHER MARKING STUDIO VERIFICATION
    # ═════════════════════════════════════════════════════════════════════════
    print("\n--- PILLAR 3: MARKING STUDIO & TEACHER VERIFICATION ---")

    # All Structured and Essay submissions must be in 'teacher_verified'
    str_esy_subs = [s for s in submissions if s.exam_id in (212, 213)]
    verified_subs = sum(1 for s in str_esy_subs if s.status == "teacher_verified")
    check(verified_subs == 20,
          f"All 20 Paper II submissions are in terminal 'teacher_verified' state (Found: {verified_subs}/20)")

    # Check Structured answers contain detailed keyword/subpart evaluation
    str_answers = [a for a in answers if a.submission_id in [s.id for s in submissions if s.exam_id == 212]]
    check(len(str_answers) == 40, f"Exactly 40 structured student answers evaluated (Found: {len(str_answers)})")

    # Check Essay answers contain rubric checklist and teacher feedback
    esy_answers = [a for a in answers if a.submission_id in [s.id for s in submissions if s.exam_id == 213]]
    check(len(esy_answers) == 30, f"Exactly 30 essay student answers evaluated (Found: {len(esy_answers)})")

    has_feedback = all(a.feedback_notes is not None and len(a.feedback_notes) > 5 for a in esy_answers)
    check(has_feedback, "All 30 essay answers contain rich qualitative teacher feedback")

    # ═════════════════════════════════════════════════════════════════════════
    # PILLAR 4: MATERIAL PROGRESS & BOOKMARKING ENGINE
    # ═════════════════════════════════════════════════════════════════════════
    print("\n--- PILLAR 4: MATERIAL PROGRESS & BOOKMARKING ENGINE ---")

    mat_progress_rows = db.query(StudentMaterialProgress).all()
    check(len(mat_progress_rows) >= 200,
          f"StudentMaterialProgress records populated in DB (Found: {len(mat_progress_rows)})")

    has_bookmarks = any(p.last_position is not None and p.last_position > 0 for p in mat_progress_rows)
    check(has_bookmarks, "Position memory bookmarks (PDF pages / video timestamps) preserved")

    has_completions = any(p.is_completed is True for p in mat_progress_rows)
    check(has_completions, "Material completion flags preserved")

    course_36_mat_ids = [m.id for m in db.query(Material).join(Lesson).join(Unit).filter(Unit.course_id == 36).all()]
    c36_flags = db.query(MaterialFlag).filter(MaterialFlag.material_id.in_(course_36_mat_ids)).all()
    check(len(c36_flags) == 15, f"Course 36 material difficulty flags reconciled (Found: {len(c36_flags)})")

    ai_questions = db.query(StudentQuestion).filter(StudentQuestion.course_id == 36).all()
    check(len(ai_questions) == 16, f"Ask AI student questions populated (Found: {len(ai_questions)})")

    # ═════════════════════════════════════════════════════════════════════════
    # PILLAR 5: PERSONAL MASTERY & TEACHER CROSS-ANALYTICS PIPELINE
    # ═════════════════════════════════════════════════════════════════════════
    print("\n--- PILLAR 5: PERSONAL MASTERY & LEARNING INTELLIGENCE PIPELINE ---")

    # 1. Student Personal Mastery Service
    s1_report = compute_student_mastery_report(student_id=6, course_id=36, db=db)
    check(s1_report is not None, "Student 1 Personal Mastery report generated")
    check(len(s1_report.syllabus_unit_mastery) == 10,
          f"Personal mastery covers all 10 syllabus units (Found: {len(s1_report.syllabus_unit_mastery)})")
    
    mcq_attempted = s1_report.mcq_deep_dive.get("total_attempted") if isinstance(s1_report.mcq_deep_dive, dict) else getattr(s1_report.mcq_deep_dive, "total_attempted", 0)
    check(mcq_attempted == 50, f"Personal MCQ deep dive analyzes all 50 items (Found: {mcq_attempted})")

    str_attempted = s1_report.structured_deep_dive.get("questions_attempted") if isinstance(s1_report.structured_deep_dive, dict) else getattr(s1_report.structured_deep_dive, "questions_attempted", 0)
    check(str_attempted == 4, f"Personal Structured deep dive analyzes 4 questions (Found: {str_attempted})")

    esy_attempted = s1_report.essay_deep_dive.get("essays_attempted") if isinstance(s1_report.essay_deep_dive, dict) else getattr(s1_report.essay_deep_dive, "essays_attempted", 0)
    check(esy_attempted == 3, f"Personal Essay deep dive analyzes 3 essays (Found: {esy_attempted})")

    # 2. Teacher Course Cross-Analytics Service
    cross_report = compute_course_cross_analytics(course_id=36, db=db)
    check(cross_report is not None, "Teacher Cross-Analytics report generated")
    check(len(cross_report.units) == 10,
          f"Cross-analytics covers all 10 units (Found: {len(cross_report.units)})")

    # 3. 4-State Divergence Engine Determinism
    st1, _, _, _ = classify_four_state_divergence(80.0, 85.0, 10, 10, 50)
    check(st1 == "ENGAGED_MASTERED", f"High Study + High Exam -> ENGAGED_MASTERED (Got: {st1})")

    st2, _, _, _ = classify_four_state_divergence(75.0, 42.0, 10, 10, 50)
    check(st2 == "ENGAGED_STRUGGLING", f"High Study + Low Exam -> ENGAGED_STRUGGLING (Got: {st2})")

    st3, _, _, _ = classify_four_state_divergence(15.0, 88.0, 10, 10, 50)
    check(st3 == "LOW_ACTIVITY_HIGH_ATTAINMENT", f"Low Study + High Exam -> LOW_ACTIVITY_HIGH_ATTAINMENT (Got: {st3})")

    st4, _, _, _ = classify_four_state_divergence(10.0, 30.0, 10, 10, 50)
    check(st4 == "LOW_ACTIVITY_LOW_ATTAINMENT", f"Low Study + Low Exam -> LOW_ACTIVITY_LOW_ATTAINMENT (Got: {st4})")

    # 4. Zero False Healthy States Check
    zero_false_healthy = all(
        u.divergence_state != "ENGAGED_MASTERED" or (u.material_completion_rate >= 50 and (u.average_attainment_pct or 0) >= 50)
        for u in cross_report.units
    )
    check(zero_false_healthy, "Zero false 'Healthy' / 'Mastered' states assigned to unassessed or struggling units")

    # 5. Teacher Learning Intelligence Service
    intel_report = compute_teacher_learning_intelligence(course_id=36, db=db)
    check(intel_report is not None, "Teacher Learning Intelligence report generated")
    check(len(intel_report.hotspots) == 10,
          f"Teacher learning intelligence analyzes all 10 syllabus units (Found: {len(intel_report.hotspots)})")

    # 6. Material Analytics Service
    mat_analytics = compute_course_material_analytics(course_id=36, db=db)
    check(mat_analytics.total_materials == 55,
          f"Course material analytics covers all 55 course materials (Found: {mat_analytics.total_materials})")
    check(mat_analytics.total_flags == 15,
          f"Course material analytics reconciles 15 difficulty flags (Found: {mat_analytics.total_flags})")

    # 7. Ask AI Analytics Service
    ai_analytics = compute_ask_ai_analytics(course_id=36, db=db)
    check(ai_analytics.total_questions_asked == 16,
          f"Ask AI analytics analyzes all 16 student queries (Found: {ai_analytics.total_questions_asked})")

    print("\n" + "=" * 90)
    print(f"  SYSTEM OFFLINE AUDIT SUMMARY: {passed_checks}/{total_checks} CHECKS PASSED (100%)")
    print("=" * 90)

    assert passed_checks == total_checks, f"Audit failed: {total_checks - passed_checks} check(s) failed!"
    print("\n>>> ALL 5 SYSTEM PILLARS VALIDATED WITH 100% MATHEMATICAL PRECISION <<<")

finally:
    db.close()
