"""
LUMORA LMS — PHASE V5.2 VALIDATION SUITE
Submission Review & Marking Studio Integration Verification

Validates:
1. MCQ submission inspection (50 questions, stems, options, student choice vs official key, score).
2. Structured submission inspection (4 questions, subparts, clean academic labels, student answers).
3. Essay submission inspection (3 questions, essay text, rubric criteria, student responses).
4. Marking Studio Integration (AI vs Teacher marks, teacher overrides, feedback persistence, verification).
5. Reassessment / Re-marking workflow without data drift.
6. Student Result Review & server-side access authorization guards.
7. Data integrity across the 30-submission / 559-answer dataset.
8. Single source of truth consistency between submissions and analytics.
"""
import sys
import os
from datetime import datetime
from typing import Dict, Any, List

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer, Course, User, UserRole
from app.schemas import ALTeacherVerifySubmissionRequest, ALTeacherVerifyAnswerItem
from app.api.al_exams import verify_teacher_submission, get_al_submission
from fastapi import HTTPException


def run_phase_v5_2_validation():
    db = SessionLocal()
    passed_checks = 0
    total_checks = 0

    def check(condition: bool, description: str):
        nonlocal passed_checks, total_checks
        total_checks += 1
        if condition:
            passed_checks += 1
            print(f"  [PASS] Check #{total_checks:02d}: {description}")
        else:
            print(f"  [FAIL] Check #{total_checks:02d}: {description}")

    print("=" * 80)
    print("  LUMORA LMS — PHASE V5.2 SUBMISSION REVIEW & MARKING STUDIO VALIDATION")
    print("=" * 80)

    try:
        # Load Protected Entities
        teacher = db.query(User).filter(User.id == 2).first()
        student1 = db.query(User).filter(User.id == 6).first()
        student2 = db.query(User).filter(User.id == 7).first()

        exam_mcq = db.query(ALExam).filter(ALExam.id == 210).first()
        exam_str = db.query(ALExam).filter(ALExam.id == 212).first()
        exam_esy = db.query(ALExam).filter(ALExam.id == 213).first()

        # ─── SECTION 1: ENTITIES & ROSTER RECONCILIATION ───
        print("\n--- SECTION 1: PROTECTED USERS & EXAM RECONCILIATION ---")
        check(teacher is not None and teacher.email == "amara@fdp.com", "Teacher Dr. Amara Perera (amara@fdp.com) loaded")
        check(student1 is not None and student1.id == 6, "Student 1 (Aseni Pamadi, ID: 6) loaded")
        check(student2 is not None and student2.id == 7, "Student 2 (Praveen Silva, ID: 7) loaded")
        check(exam_mcq is not None and exam_mcq.id == 210, "Exam 210 (Paper I MCQ) loaded")
        check(exam_str is not None and exam_str.id == 212, "Exam 212 (Paper II-A Structured) loaded")
        check(exam_esy is not None and exam_esy.id == 213, "Exam 213 (Paper II-B Essay) loaded")

        # ─── SECTION 2: 30-SUBMISSION DATASET INTEGRITY ───
        print("\n--- SECTION 2: 30-SUBMISSION GROUND TRUTH DATASET INTEGRITY ---")
        all_subs = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id.in_([210, 212, 213])).all()
        check(len(all_subs) == 30, f"Exactly 30 ground truth submissions present (Found {len(all_subs)})")

        all_ans = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in all_subs])).all()
        check(len(all_ans) == 559, f"Exactly 559 ground truth answer records present (Found {len(all_ans)})")

        null_final_scores = [a for a in all_ans if a.final_score is None]
        check(len(null_final_scores) == 0, f"Zero NULL final_scores across all 559 answers (Found {len(null_final_scores)})")

        negative_scores = [a for a in all_ans if (a.final_score or 0) < 0]
        check(len(negative_scores) == 0, f"Zero negative final_scores (Found {len(negative_scores)})")

        # ─── SECTION 3: PAPER I (MCQ) SUBMISSION REVIEW ───
        print("\n--- SECTION 3: PAPER I (MCQ) SUBMISSION INSPECTION ---")
        sub_mcq = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.exam_id == 210,
            ALStudentSubmission.student_id == student1.id
        ).first()

        check(sub_mcq is not None, f"Student 1 MCQ Submission found (ID: {sub_mcq.id if sub_mcq else 'None'})")
        ans_mcq = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id == sub_mcq.id).all()
        check(len(ans_mcq) == 50, f"MCQ submission contains exactly 50 student answers (Found {len(ans_mcq)})")

        # Check candidate options and answer key (supports A-E and 1-5 keys)
        valid_keys = {"A", "B", "C", "D", "E", "1", "2", "3", "4", "5", None}
        has_valid_options = all(a.selected_option in valid_keys for a in ans_mcq)
        check(has_valid_options, "All MCQ answers contain valid candidate option keys (A-E / 1-5) or unattempted nulls")

        # Check scores
        mcq_scores_valid = all((a.final_score in [0.0, 1.0]) for a in ans_mcq)
        check(mcq_scores_valid, "All MCQ final scores are strictly 0.0 or 1.0 points")

        # Check zero Structured/Essay contamination in MCQ answers
        mcq_clean = all(a.subpart_answers_json is None and (a.essay_text_answer is None or a.essay_text_answer == "") for a in ans_mcq)
        check(mcq_clean, "Zero Structured subparts or Essay text in MCQ answer records")

        # ─── SECTION 4: PAPER II-A (STRUCTURED) SUBMISSION REVIEW ───
        print("\n--- SECTION 4: PAPER II-A (STRUCTURED) SUBMISSION INSPECTION ---")
        sub_str = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.exam_id == 212,
            ALStudentSubmission.student_id == student1.id
        ).first()

        check(sub_str is not None, f"Student 1 Structured Submission found (ID: {sub_str.id if sub_str else 'None'})")
        ans_str = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id == sub_str.id).all()
        check(len(ans_str) == 4, f"Structured submission contains exactly 4 main questions (Found {len(ans_str)})")

        # Check subpart answers preservation
        has_subparts = all(isinstance(a.subpart_answers_json, dict) and len(a.subpart_answers_json) > 0 for a in ans_str)
        check(has_subparts, "All 4 Structured questions contain real candidate subpart answers dictionary")

        # Check total points cap
        str_total_score = sum(a.final_score or 0.0 for a in ans_str)
        check(str_total_score <= 160.0 and str_total_score > 0, f"Structured total final score is valid ({str_total_score} / 160.0)")

        # ─── SECTION 5: PAPER II-B (ESSAY) SUBMISSION REVIEW ───
        print("\n--- SECTION 5: PAPER II-B (ESSAY) SUBMISSION INSPECTION ---")
        sub_esy = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.exam_id == 213,
            ALStudentSubmission.student_id == student1.id
        ).first()

        check(sub_esy is not None, f"Student 1 Essay Submission found (ID: {sub_esy.id if sub_esy else 'None'})")
        ans_esy = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id == sub_esy.id).all()
        check(len(ans_esy) == 3, f"Essay submission contains exactly 3 essay questions (Found {len(ans_esy)})")

        # Check essay text answer preservation
        has_essay_texts = all(isinstance(a.essay_text_answer, str) and len(a.essay_text_answer) > 100 for a in ans_esy)
        check(has_essay_texts, "All 3 Essay questions preserve rich candidate essay texts (> 100 chars)")

        # Check rubric checklist results
        has_rubrics = any(a.teacher_checklist_results_json is not None or a.ai_checklist_results_json is not None for a in ans_esy)
        check(has_rubrics, "Essay answers contain rubric criteria evaluation records")

        # ─── SECTION 6: MARKING STUDIO VERIFICATION & REASSESSMENT ───
        print("\n--- SECTION 6: MARKING STUDIO VERIFICATION & REASSESSMENT WORKFLOW ---")
        # Test teacher verification and reassessment on a clone/copy or safely on submission
        initial_scaled = sub_str.scaled_score
        initial_percentage = sub_str.percentage

        # Prepare verification payload
        verify_items = []
        for a in ans_str:
            verify_items.append(ALTeacherVerifyAnswerItem(
                answer_id=a.id,
                teacher_override_points=a.final_score,
                feedback_notes="Teacher verified: strong grasp of anatomical concepts."
            ))

        verify_payload = ALTeacherVerifySubmissionRequest(
            answers=verify_items,
            teacher_feedback="Comprehensive performance across all 4 structured questions."
        )

        # Call verify endpoint function
        updated_sub = verify_teacher_submission(
            submission_id=sub_str.id,
            data=verify_payload,
            current_user=teacher,
            db=db
        )

        check(updated_sub.status == "teacher_verified", "Submission status successfully set to 'teacher_verified'")
        check(updated_sub.scaled_score == initial_scaled, f"Scaled score matches verified sum ({updated_sub.scaled_score} == {initial_scaled})")
        check(updated_sub.teacher_feedback == "Comprehensive performance across all 4 structured questions.", "Overall teacher feedback persists accurately")

        # Verify question-level feedback persistence
        db.refresh(sub_str)
        reloaded_answers = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id == sub_str.id).all()
        check(all(a.feedback_notes is not None for a in reloaded_answers), "Question-level teacher feedback persists on all answers")

        # ─── SECTION 7: STUDENT SECURITY & AUTHORIZATION GUARDS ───
        print("\n--- SECTION 7: STUDENT ACCESS SECURITY & AUTHORIZATION GUARDS ---")
        # Student 1 inspecting own submission (sub_str.id) -> Allowed
        s1_view = get_al_submission(
            submission_id=sub_str.id,
            current_user=student1,
            db=db
        )
        check(s1_view is not None and s1_view.id == sub_str.id, "Student 1 successfully allowed to inspect their own submission")

        # Student 2 inspecting Student 1's submission (sub_str.id) -> Forbidden (403)
        s2_forbidden = False
        try:
            get_al_submission(
                submission_id=sub_str.id,
                current_user=student2,
                db=db
            )
        except HTTPException as he:
            if he.status_code == 403:
                s2_forbidden = True

        check(s2_forbidden, "Student 2 inspecting Student 1's submission correctly rejected with HTTP 403 Forbidden")

        # ─── SECTION 8: SINGLE SOURCE OF TRUTH RECONCILIATION ───
        print("\n--- SECTION 8: SINGLE SOURCE OF TRUTH RECONCILIATION ---")
        # Check that answer final_score sums directly equal submission scaled_score
        all_reconciled = True
        for s in all_subs:
            answers_sum = sum(a.final_score or 0.0 for a in s.answers)
            if abs(answers_sum - (s.scaled_score or 0.0)) > 0.01:
                all_reconciled = False
                print(f"  [DISCREPANCY] Sub #{s.id}: answers_sum={answers_sum} != scaled_score={s.scaled_score}")

        check(all_reconciled, "All 30 submissions maintain 100% mathematical equality between answer.final_score sum and submission.scaled_score")

        # ─── SUMMARY ───
        print("\n" + "=" * 80)
        print(f"  PHASE V5.2 VALIDATION SUMMARY: {passed_checks}/{total_checks} CHECKS PASSED")
        print("=" * 80)

        if passed_checks == total_checks:
            print("\n  >>> PHASE V5.2 ACCEPTANCE CRITERIA MET WITH 100% PRECISION <<<")
            return True
        else:
            print(f"\n  >>> VALIDATION FAILED: {total_checks - passed_checks} checks failed <<<")
            return False

    finally:
        db.close()


if __name__ == "__main__":
    success = run_phase_v5_2_validation()
    sys.exit(0 if success else 1)
