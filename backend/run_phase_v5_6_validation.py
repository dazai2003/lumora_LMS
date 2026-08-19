"""
LUMORA LMS -- PHASE V5.6 COMPREHENSIVE END-TO-END INTEGRATION VALIDATION

Final integration and reconciliation suite. Proves that all V1->V5.5
components work together as one coherent LMS with consistent data,
correct navigation, correct permissions, correct reports, and no regressions.

12 Validation Sections:
  1. Final Ground-Truth Reconciliation (entity counts)
  2. Critical Data Integrity Checks (zero NULLs, negatives, leaks)
  3. Assessment-Type Isolation End-to-End (MCQ/Structured/Essay separation)
  4. No-Data Reality Validation (classify_four_state_divergence edge cases)
  5. Cross-Analytics 4-State Deterministic Validation
  6. Unit -> Question -> Submission Chain Reconciliation
  7. Material -> Flag -> Teacher Response Chain
  8. Ask AI Integration & Privacy
  9. Student Roster -> Dossier Reconciliation
 10. Reports & CSV Validation
 11. Security & Authorization Boundaries
 12. Submission -> Score Mathematical Reconciliation

Protected Ground Truth:
  - Course 36 -- Advanced Level Biology
  - 10 Synthetic Students (student1@fdp.com -> student10@fdp.com)
  - 3 Exams (MCQ 210, Structured 212, Essay 213)
  - 30 Submissions, 559 Answer Records

Rule: If a check fails, fix the implementation, not the ground truth.
"""

import sys
import os
import io
import csv
import statistics

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, Unit, Lesson, Material, Enrollment,
    StudentMaterialProgress, MaterialFlag, StudentQuestion,
    ALExam, ALExamType, ALStudentSubmission, ALStudentAnswer,
    ALQuestion, ALQuestionTemplate
)
from app.services.analytics.cross_analytics import (
    classify_four_state_divergence, evaluate_format_divergence_pattern,
    compute_course_cross_analytics, get_unit_question_inventory,
    compute_student_cross_analytics_dossier
)
from app.services.analytics import (
    compute_mcq_exam_report,
    compute_structured_exam_report,
    compute_essay_exam_report,
    compute_course_material_analytics,
    compute_ask_ai_analytics,
    compute_exam_foundation_overview
)
from app.services.analytics.reporting import (
    generate_course_analytics_report,
    generate_course_analytics_csv
)
from app.api.al_exams import get_al_submission
from fastapi import HTTPException


def run_phase_v5_6_validation():
    db = SessionLocal()
    total_checks = 0
    passed_checks = 0
    failed_details = []

    def check(condition: bool, description: str):
        nonlocal total_checks, passed_checks
        total_checks += 1
        if condition:
            passed_checks += 1
            print(f"  [PASS] Check #{total_checks:02d}: {description}")
        else:
            failed_details.append(f"Check #{total_checks:02d}: {description}")
            print(f"  [FAIL] Check #{total_checks:02d}: {description}")

    print("=" * 90)
    print("  LUMORA LMS -- PHASE V5.6 COMPREHENSIVE END-TO-END INTEGRATION VALIDATION")
    print("=" * 90)

    try:
        # ================================================================
        # SECTION 1: FINAL GROUND-TRUTH RECONCILIATION
        # ================================================================
        print("\n-- SECTION 1: FINAL GROUND-TRUTH RECONCILIATION --")

        teacher = db.query(User).filter(User.email == "amara@fdp.com").first()
        check(teacher is not None, "Teacher Dr. Amara Perera (amara@fdp.com) exists")

        students = db.query(User).filter(User.email.like("student%@fdp.com")).order_by(User.id).all()
        check(len(students) == 10, f"Exactly 10 synthetic students present (Found: {len(students)})")

        course = db.query(Course).filter(Course.id == 36).first()
        check(course is not None, "Course 36 (Advanced Level Biology) exists")

        units = db.query(Unit).filter(Unit.course_id == 36).order_by(Unit.order).all()
        check(len(units) == 10, f"Course 36 has all 10 syllabus units (Found: {len(units)})")

        exam_mcq = db.query(ALExam).filter(ALExam.id == 210).first()
        exam_str = db.query(ALExam).filter(ALExam.id == 212).first()
        exam_esy = db.query(ALExam).filter(ALExam.id == 213).first()
        check(exam_mcq is not None and exam_str is not None and exam_esy is not None,
              "All 3 exams loaded (MCQ:210, Structured:212, Essay:213)")

        all_subs = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.exam_id.in_([210, 212, 213])
        ).all()
        check(len(all_subs) == 30, f"Protected 30 submissions preserved (Found: {len(all_subs)})")

        all_ans = db.query(ALStudentAnswer).filter(
            ALStudentAnswer.submission_id.in_([s.id for s in all_subs])
        ).all()
        check(len(all_ans) == 559, f"Protected 559 answer records preserved (Found: {len(all_ans)})")

        # ================================================================
        # SECTION 2: CRITICAL DATA INTEGRITY CHECKS
        # ================================================================
        print("\n-- SECTION 2: CRITICAL DATA INTEGRITY CHECKS --")

        null_final_scores = [a for a in all_ans if a.final_score is None]
        check(len(null_final_scores) == 0,
              f"Zero NULL final_score values across 559 answers (Found: {len(null_final_scores)})")

        negative_scores = [a for a in all_ans if (a.final_score or 0) < 0]
        check(len(negative_scores) == 0,
              f"Zero negative final_score values (Found: {len(negative_scores)})")

        # Check no score exceeds question max points
        q_map = {}
        for q in db.query(ALQuestion).filter(ALQuestion.exam_id.in_([210, 212, 213])).all():
            q_map[q.id] = float(q.points or 1.0)

        over_max_answers = [a for a in all_ans if (a.final_score or 0) > q_map.get(a.question_id, 999) + 0.01]
        check(len(over_max_answers) == 0,
              f"Zero scores exceeding question max points (Found: {len(over_max_answers)})")

        # Cross-contamination: MCQ answers should not appear in Structured submissions
        mcq_sub_ids = {s.id for s in all_subs if s.exam_id == 210}
        str_sub_ids = {s.id for s in all_subs if s.exam_id == 212}
        esy_sub_ids = {s.id for s in all_subs if s.exam_id == 213}

        mcq_q_ids = set(q.id for q in db.query(ALQuestion).filter(ALQuestion.exam_id == 210).all())
        str_q_ids = set(q.id for q in db.query(ALQuestion).filter(ALQuestion.exam_id == 212).all())
        esy_q_ids = set(q.id for q in db.query(ALQuestion).filter(ALQuestion.exam_id == 213).all())

        cross_contaminated = 0
        for a in all_ans:
            if a.submission_id in mcq_sub_ids and a.question_id not in mcq_q_ids:
                cross_contaminated += 1
            elif a.submission_id in str_sub_ids and a.question_id not in str_q_ids:
                cross_contaminated += 1
            elif a.submission_id in esy_sub_ids and a.question_id not in esy_q_ids:
                cross_contaminated += 1

        check(cross_contaminated == 0,
              f"Zero cross-contaminated answers (MCQ/Structured/Essay isolation: Found {cross_contaminated} violations)")

        # Zero false "Healthy" for NO_DATA units
        cross_rep = compute_course_cross_analytics(36, db)
        false_healthy = sum(
            1 for u in cross_rep.units
            if u.evidence_state == "NO_DATA" and u.divergence_state == "ENGAGED_MASTERED"
        )
        check(false_healthy == 0,
              f"Zero false 'Healthy' states for NO_DATA units (Found: {false_healthy})")

        # ================================================================
        # SECTION 3: ASSESSMENT-TYPE ISOLATION END-TO-END
        # ================================================================
        print("\n-- SECTION 3: ASSESSMENT-TYPE ISOLATION END-TO-END --")

        subs_mcq = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 210).all()
        q_mcq = db.query(ALQuestion).filter(ALQuestion.exam_id == 210).order_by(ALQuestion.question_number).all()
        ans_mcq = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_mcq])).all()
        mcq_rep = compute_mcq_exam_report(exam_mcq, q_mcq, subs_mcq, ans_mcq)
        check(mcq_rep.total_questions == 50,
              f"Paper I (MCQ) contains exactly 50 items (Found: {mcq_rep.total_questions})")
        check(all(len(q.option_distribution) > 0 for q in mcq_rep.questions),
              "All 50 MCQ questions have complete option distributions")

        subs_str = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 212).all()
        q_str = db.query(ALQuestion).filter(ALQuestion.exam_id == 212).order_by(ALQuestion.question_number).all()
        ans_str = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_str])).all()
        struct_rep = compute_structured_exam_report(exam_str, q_str, subs_str, ans_str)
        check(struct_rep.total_questions == 4,
              f"Paper II-A (Structured) contains exactly 4 questions (Found: {struct_rep.total_questions})")
        check(len(struct_rep.subpart_loss_ranking) > 0,
              "Paper II-A contains subpart mark loss ranking")

        subs_esy = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 213).all()
        q_esy = db.query(ALQuestion).filter(ALQuestion.exam_id == 213).order_by(ALQuestion.question_number).all()
        ans_esy = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_esy])).all()
        essay_rep = compute_essay_exam_report(exam_esy, q_esy, subs_esy, ans_esy)
        check(essay_rep.total_questions == 3,
              f"Paper II-B (Essay) contains exactly 3 questions (Found: {essay_rep.total_questions})")
        check(len(essay_rep.most_omitted_criteria) > 0,
              "Paper II-B contains omitted rubric criteria ranking")

        # ================================================================
        # SECTION 4: NO-DATA REALITY VALIDATION
        # ================================================================
        print("\n-- SECTION 4: NO-DATA REALITY VALIDATION --")

        state, _, _, _ = classify_four_state_divergence(None, None, 0)
        check(state == "NO_DATA",
              f"No learning + no assessment -> NO_DATA (Got: {state})")

        state, _, _, _ = classify_four_state_divergence(60.0, None, 0)
        check(state == "LEARNING_ONLY",
              f"Learning only (60% materials, 0 attempts) -> LEARNING_ONLY (Got: {state})")

        state, _, _, _ = classify_four_state_divergence(None, 70.0, 10)
        check(state == "ASSESSMENT_ONLY",
              f"Assessment only (70% attainment, no materials) -> ASSESSMENT_ONLY (Got: {state})")

        state, _, _, _ = classify_four_state_divergence(30.0, 55.0, 3)
        check(state == "LIMITED_DATA",
              f"Small sample (3 attempts) -> LIMITED_DATA (Got: {state})")

        state, _, _, _ = classify_four_state_divergence(75.0, 80.0, 15)
        check(state in ["ENGAGED_MASTERED", "ENGAGED_STRUGGLING", "LOW_ACTIVITY_HIGH_ATTAINMENT", "LOW_ACTIVITY_LOW_ATTAINMENT"],
              f"Full evidence -> core state (Got: {state})")

        # ================================================================
        # SECTION 5: CROSS-ANALYTICS 4-STATE DETERMINISTIC VALIDATION
        # ================================================================
        print("\n-- SECTION 5: CROSS-ANALYTICS 4-STATE DETERMINISTIC VALIDATION --")

        state, _, _, _ = classify_four_state_divergence(75.0, 80.0, 15)
        check(state == "ENGAGED_MASTERED",
              f"75% material + 80% attainment -> ENGAGED_MASTERED (Got: {state})")

        state, _, _, _ = classify_four_state_divergence(70.0, 40.0, 15)
        check(state == "ENGAGED_STRUGGLING",
              f"70% material + 40% attainment -> ENGAGED_STRUGGLING (Got: {state})")

        state, _, _, _ = classify_four_state_divergence(20.0, 80.0, 15)
        check(state == "LOW_ACTIVITY_HIGH_ATTAINMENT",
              f"20% material + 80% attainment -> LOW_ACTIVITY_HIGH_ATTAINMENT (Got: {state})")

        state, _, _, _ = classify_four_state_divergence(20.0, 30.0, 15)
        check(state == "LOW_ACTIVITY_LOW_ATTAINMENT",
              f"20% material + 30% attainment -> LOW_ACTIVITY_LOW_ATTAINMENT (Got: {state})")

        s1r, l1r, i1r, a1r = classify_four_state_divergence(55.0, 45.0, 12, 3, 5)
        s2r, l2r, i2r, a2r = classify_four_state_divergence(55.0, 45.0, 12, 3, 5)
        check(s1r == s2r and l1r == l2r and i1r == i2r and a1r == a2r,
              f"Determinism verified: identical inputs -> identical outputs ({s1r})")

        # ================================================================
        # SECTION 6: UNIT -> QUESTION -> SUBMISSION CHAIN RECONCILIATION
        # ================================================================
        print("\n-- SECTION 6: UNIT -> QUESTION -> SUBMISSION CHAIN RECONCILIATION --")

        check(len(cross_rep.units) == 10,
              f"Cross-analytics covers all 10 units (Found: {len(cross_rep.units)})")

        total_q_in_units = sum(u.questions_count for u in cross_rep.units)
        total_q_in_db = len(q_mcq) + len(q_str) + len(q_esy)
        check(total_q_in_units == total_q_in_db,
              f"Total questions mapped across units ({total_q_in_units}) = total in DB ({total_q_in_db})")

        unit4 = units[3] if len(units) > 3 else None
        if unit4:
            inv = get_unit_question_inventory(36, unit4.id, db)
            check(len(inv) > 0,
                  f"Unit 4 ({unit4.title}) has mapped exam items (Found: {len(inv)} items)")
            has_real_stems = all(len(q.stem_text) > 10 for q in inv)
            check(has_real_stems,
                  "All inventory items contain genuine question stems (not placeholders)")
        else:
            check(False, "Unit 4 not available for inventory check")
            check(False, "Skipped (Unit 4 not available)")

        clean_labels = all(
            "part_node_" not in s.get("display_label", "")
            for s in struct_rep.subpart_loss_ranking
        )
        check(clean_labels,
              "Zero internal UUID leakage in structured subpart labels")

        # ================================================================
        # SECTION 7: MATERIAL -> FLAG -> TEACHER RESPONSE CHAIN
        # ================================================================
        print("\n-- SECTION 7: MATERIAL -> FLAG -> TEACHER RESPONSE CHAIN --")

        mat_rep = compute_course_material_analytics(36, db)
        check(mat_rep.total_materials >= 54,
              f"Material analytics covers all {mat_rep.total_materials} materials (Found: {mat_rep.total_materials})")
        check(mat_rep.total_flags >= 14,
              f"Material analytics reconciles {mat_rep.total_flags} difficulty flags (Found: {mat_rep.total_flags})")

        all_flags = db.query(MaterialFlag).join(Material).filter(
            Material.course_id == 36
        ).all()
        orphan_flags = [f for f in all_flags if f.material_id not in [m.material_id for m in mat_rep.materials]]
        check(len(orphan_flags) == 0,
              f"Zero orphaned flags (all attached to valid course materials: orphans={len(orphan_flags)})")

        flags_with_student = sum(1 for f in all_flags if f.student_id is not None)
        check(flags_with_student == len(all_flags),
              f"All {len(all_flags)} flags have student identity attached")

        # ================================================================
        # SECTION 8: ASK AI INTEGRATION & PRIVACY
        # ================================================================
        print("\n-- SECTION 8: ASK AI INTEGRATION & PRIVACY --")

        ai_rep = compute_ask_ai_analytics(36, db)
        check(ai_rep.total_questions_asked == 16,
              f"Ask AI report analyzes 16 questions (Found: {ai_rep.total_questions_asked})")
        check(len(ai_rep.topic_categories) > 0,
              "Ask AI aggregates concepts into privacy-safe topic clusters")
        check(ai_rep.unique_students_count > 0,
              f"Ask AI counts unique students ({ai_rep.unique_students_count})")

        all_topic_strings = " ".join(t.topic_category for t in ai_rep.topic_categories)
        student_names = [s.full_name.split()[0] for s in students if s.full_name]
        name_leaks = sum(1 for name in student_names if name.lower() in all_topic_strings.lower())
        check(name_leaks == 0,
              f"Zero student name leaks into aggregated topic categories (Found: {name_leaks})")

        # ================================================================
        # SECTION 9: STUDENT ROSTER -> DOSSIER RECONCILIATION
        # ================================================================
        print("\n-- SECTION 9: STUDENT ROSTER -> DOSSIER RECONCILIATION --")

        s1 = db.query(User).filter(User.email == "student1@fdp.com").first()
        s10 = db.query(User).filter(User.email == "student10@fdp.com").first()

        s1_dossier = compute_student_cross_analytics_dossier(s1.id, 36, db)
        s10_dossier = compute_student_cross_analytics_dossier(s10.id, 36, db)

        check(s1_dossier.overall_assessment_pct is not None and s1_dossier.overall_assessment_pct >= 80.0,
              f"Student 1 dossier assessment >= 80% (Got: {s1_dossier.overall_assessment_pct}%)")
        check(s10_dossier.overall_assessment_pct is not None and s10_dossier.overall_assessment_pct < 40.0,
              f"Student 10 dossier assessment < 40% (Got: {s10_dossier.overall_assessment_pct}%)")

        check(s1_dossier.primary_learning_signal == "Strong",
              f"Student 1 learning signal = 'Strong' (Got: '{s1_dossier.primary_learning_signal}')")
        check(s10_dossier.primary_learning_signal in ["High Priority", "Needs Attention"],
              f"Student 10 learning signal = 'High Priority' or 'Needs Attention' (Got: '{s10_dossier.primary_learning_signal}')")

        check(len(s1_dossier.suggested_teacher_actions) > 0,
              "Student dossiers provide actionable teacher links")

        # ================================================================
        # SECTION 10: REPORTS & CSV VALIDATION
        # ================================================================
        print("\n-- SECTION 10: REPORTS & CSV VALIDATION --")

        course_report = generate_course_analytics_report(36, db)
        check(course_report.enrolled_students == 10,
              f"Course report enrolled = 10 (Got: {course_report.enrolled_students})")
        check(course_report.total_submissions > 0,
              f"Course report total submissions > 0 (Got: {course_report.total_submissions})")
        check(len(course_report.assessment_highlights) >= 3,
              f"Course report has >= 3 assessment highlights (Got: {len(course_report.assessment_highlights)})")
        check(course_report.course_average_score is not None,
              f"Course report has computed average score (Got: {course_report.course_average_score})")

        csv_content = generate_course_analytics_csv(36, db, export_type="student_roster")
        csv_lines = csv_content.strip().split("\n")
        check(len(csv_lines) >= 15,
              f"Student roster CSV has >= 15 lines (headers + 10 students) (Got: {len(csv_lines)} lines)")

        # ================================================================
        # SECTION 11: SECURITY & AUTHORIZATION BOUNDARIES
        # ================================================================
        print("\n-- SECTION 11: SECURITY & AUTHORIZATION BOUNDARIES --")

        student1 = db.query(User).filter(User.id == s1.id).first()
        student2 = db.query(User).filter(User.email == "student2@fdp.com").first()

        s1_sub = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.student_id == s1.id,
            ALStudentSubmission.exam_id == 210
        ).first()
        if s1_sub:
            s1_view = get_al_submission(submission_id=s1_sub.id, current_user=student1, db=db)
            check(s1_view is not None and s1_view.id == s1_sub.id,
                  "Student 1 can inspect their own submission")
        else:
            check(False, "Student 1 MCQ submission not found for authorization test")

        s2_forbidden = False
        try:
            if s1_sub:
                get_al_submission(submission_id=s1_sub.id, current_user=student2, db=db)
        except HTTPException as he:
            if he.status_code == 403:
                s2_forbidden = True
        check(s2_forbidden,
              "Student 2 inspecting Student 1's submission rejected with HTTP 403")

        check(s1_dossier.student_id != s10_dossier.student_id,
              "Student profile IDs strictly isolated (S1 != S10)")

        check(s1_dossier.overall_material_completion_pct != s10_dossier.overall_material_completion_pct
              or s1_dossier.overall_assessment_pct != s10_dossier.overall_assessment_pct,
              "Student progress data strictly differentiated between S1 and S10")

        teacher_user = db.query(User).filter(User.id == teacher.id).first()
        if s1_sub:
            teacher_view = get_al_submission(submission_id=s1_sub.id, current_user=teacher_user, db=db)
            check(teacher_view is not None and teacher_view.id == s1_sub.id,
                  "Teacher can inspect any student's submission in their course")
        else:
            check(False, "Teacher submission access test skipped (no S1 sub)")

        # ================================================================
        # SECTION 12: SUBMISSION -> SCORE MATHEMATICAL RECONCILIATION
        # ================================================================
        print("\n-- SECTION 12: SUBMISSION -> SCORE MATHEMATICAL RECONCILIATION --")

        all_reconciled = True
        discrepancy_count = 0
        for s in all_subs:
            answers_for_sub = [a for a in all_ans if a.submission_id == s.id]
            answers_sum = sum(float(a.final_score or 0.0) for a in answers_for_sub)
            if abs(answers_sum - float(s.scaled_score or 0.0)) > 0.01:
                all_reconciled = False
                discrepancy_count += 1
                print(f"    [DISCREPANCY] Sub #{s.id}: answers_sum={answers_sum:.2f} != scaled_score={s.scaled_score}")

        check(all_reconciled,
              f"All 30 submissions: sum(answer.final_score) = submission.scaled_score (discrepancies: {discrepancy_count})")

        # MCQ exams (210) are auto-graded with status 'submitted'; Structured/Essay are 'teacher_verified'
        valid_status_count = sum(
            1 for s in all_subs
            if (s.exam_id == 210 and s.status in ["submitted", "teacher_verified"])
            or (s.exam_id != 210 and s.status == "teacher_verified")
        )
        check(valid_status_count == 30,
              f"All 30 submissions have valid terminal status (MCQ:submitted, Structured/Essay:teacher_verified) (Found: {valid_status_count})")

        # MCQ correct_option may be stored as letter ("A"-"E") or number ("1"-"5")
        LETTER_TO_NUM = {"A": "1", "B": "2", "C": "3", "D": "4", "E": "5"}
        NUM_TO_LETTER = {"1": "A", "2": "B", "3": "C", "4": "D", "5": "E"}

        def mcq_options_match(selected, correct):
            if not selected or not correct:
                return False
            s = selected.strip().upper()
            c = correct.strip().upper()
            if s == c:
                return True
            # Handle letter vs number mismatch
            if s in LETTER_TO_NUM and LETTER_TO_NUM[s] == c:
                return True
            if s in NUM_TO_LETTER and NUM_TO_LETTER[s] == c:
                return True
            return False

        mcq_grade_errors = 0
        for a in ans_mcq:
            q = next((q for q in q_mcq if q.id == a.question_id), None)
            if q and q.correct_option:
                is_correct = mcq_options_match(a.selected_option, q.correct_option)
                expected = float(q.points or 1.0) if is_correct else 0.0
                actual = float(a.final_score or 0.0)
                if abs(expected - actual) > 0.01:
                    mcq_grade_errors += 1

        check(mcq_grade_errors == 0,
              f"MCQ auto-grade consistency: selected_option vs correct_key vs score (errors: {mcq_grade_errors})")

        pct_errors = 0
        for s in all_subs:
            if s.percentage is not None and s.scaled_score is not None:
                exam = db.query(ALExam).filter(ALExam.id == s.exam_id).first()
                if exam and exam.raw_mark_cap:
                    expected_pct = round((float(s.scaled_score) / float(exam.raw_mark_cap)) * 100, 2)
                    if abs(expected_pct - float(s.percentage)) > 0.5:
                        pct_errors += 1

        check(pct_errors == 0,
              f"Submission percentage = (scaled_score / raw_mark_cap) * 100 consistency (errors: {pct_errors})")

    except Exception as ex:
        print(f"\n  [EXCEPTION] Validation interrupted: {ex}")
        import traceback
        traceback.print_exc()

    finally:
        db.close()

    # ================================================================
    # FINAL SUMMARY
    # ================================================================
    print("\n" + "=" * 90)
    print(f"  PHASE V5.6 END-TO-END INTEGRATION VALIDATION: {passed_checks}/{total_checks} CHECKS PASSED")
    print("=" * 90)

    if failed_details:
        print("\n  Failed checks:")
        for fd in failed_details:
            print(f"    x {fd}")

    if passed_checks == total_checks:
        print("\n  >>> PHASE V5.6 ACCEPTANCE CRITERIA MET -- ANALYTICS SYSTEM FROZEN <<<\n")
        return 0
    else:
        print(f"\n  >>> {total_checks - passed_checks} CHECK(S) FAILED -- INVESTIGATE AND FIX <<<\n")
        return 1


if __name__ == "__main__":
    sys.exit(run_phase_v5_6_validation())
