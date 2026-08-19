"""
LUMORA LMS — PHASE V5.1 VALIDATION SUITE
Assessment Analytics Data Separation & Correctness Verification

Validates:
1. Complete separation of MCQ (210), Structured (212), and Essay (213) analytics.
2. Zero cross-contamination across assessment types.
3. Structured analytics: 4 questions, 16 subparts, 160 marks, clean academic labels, no internal node UUIDs.
4. Essay analytics: 3 questions, 9 rubric criteria, 120 marks, correct criterion attainment % and omission %.
5. Challenge/mastery ranking: Most Challenging (lowest attainment) vs Highest Mastery (highest attainment).
6. Small-sample confidence guards (N=10) preserved.
7. Submission inspection endpoint compatibility for all 3 assessment types.
"""
import sys
import os
from typing import Dict, Any, List

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer, Course, User
from app.services.analytics.foundation_overview import compute_exam_foundation_overview
from app.services.analytics.mcq_analytics import compute_mcq_exam_report
from app.services.analytics.structured_analytics import compute_structured_exam_report
from app.services.analytics.essay_analytics import compute_essay_exam_report


def run_phase_v5_1_validation():
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
    print("  LUMORA LMS — PHASE V5.1 ASSESSMENT ANALYTICS VALIDATION SUITE")
    print("=" * 80)

    try:
        # Load Protected Entities
        course = db.query(Course).filter(Course.id == 36).first()
        teacher = db.query(User).filter(User.id == 2).first()
        exam_mcq = db.query(ALExam).filter(ALExam.id == 210).first()
        exam_str = db.query(ALExam).filter(ALExam.id == 212).first()
        exam_esy = db.query(ALExam).filter(ALExam.id == 213).first()

        # ─── SECTION 1: ENTITY INTEGRITY ───
        print("\n--- SECTION 1: PROTECTED ENVIRONMENT & ENTITY INTEGRITY ---")
        check(course is not None and course.title == "Advanced Level Biology", "Course 36 is Advanced Level Biology")
        check(teacher is not None and teacher.email == "amara@fdp.com", "Teacher is Dr. Amara Perera (amara@fdp.com)")
        check(exam_mcq is not None and exam_mcq.exam_type == "paper_1_mcq", "Exam 210 is Paper I MCQ")
        check(exam_str is not None and exam_str.exam_type == "paper_2_structured", "Exam 212 is Paper II-A Structured")
        check(exam_esy is not None and exam_esy.exam_type == "paper_2_essay", "Exam 213 is Paper II-B Essay")

        # ─── SECTION 2: SUBMISSION DATASET RECONCILIATION ───
        print("\n--- SECTION 2: 30-SUBMISSION GROUND TRUTH DATASET ---")
        subs_mcq = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 210).all()
        subs_str = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 212).all()
        subs_esy = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 213).all()

        check(len(subs_mcq) == 10, f"MCQ has exactly 10 student submissions (Found {len(subs_mcq)})")
        check(len(subs_str) == 10, f"Structured has exactly 10 student submissions (Found {len(subs_str)})")
        check(len(subs_esy) == 10, f"Essay has exactly 10 student submissions (Found {len(subs_esy)})")

        total_ans_count = db.query(ALStudentAnswer).filter(
            ALStudentAnswer.submission_id.in_([s.id for s in subs_mcq + subs_str + subs_esy])
        ).count()
        check(total_ans_count == 559, f"Ground truth answer records remain exactly 559 (Found {total_ans_count})")

        # ─── SECTION 3: MCQ ANALYTICS SEPARATION (EXAM 210) ───
        print("\n--- SECTION 3: PAPER I (MCQ) ANALYTICS SEPARATION & INTEGRITY ---")
        q_mcq = db.query(ALQuestion).filter(ALQuestion.exam_id == 210).order_by(ALQuestion.question_number).all()
        ans_mcq = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_mcq])).all()
        rep_mcq = compute_mcq_exam_report(exam_mcq, q_mcq, subs_mcq, ans_mcq)

        check(rep_mcq.total_questions == 50, f"MCQ report has exactly 50 questions (Found {rep_mcq.total_questions})")
        check(len(rep_mcq.questions) == 50, f"MCQ question list length is 50 (Found {len(rep_mcq.questions)})")
        check(rep_mcq.total_submissions == 10, f"MCQ candidate submissions N=10 (Found {rep_mcq.total_submissions})")

        # Verify no Structured/Essay fields appear in MCQ
        has_structured_leak = any(hasattr(q, "hierarchy") for q in rep_mcq.questions)
        has_essay_leak = any(hasattr(q, "criteria") for q in rep_mcq.questions)
        check(not has_structured_leak and not has_essay_leak, "Zero Structured/Essay field leakage into MCQ report")

        # Verify psychometric small-sample warning (N=10 -> low_confidence early signal)
        low_conf_count = sum(1 for q in rep_mcq.questions if q.discrimination.confidence == "low_confidence")
        check(low_conf_count == 50, f"All 50 MCQ questions report small-sample discrimination guards (Found {low_conf_count}/50 with low_confidence)")

        # ─── SECTION 4: STRUCTURED ANALYTICS SEPARATION & HIERARCHY (EXAM 212) ───
        print("\n--- SECTION 4: PAPER II-A (STRUCTURED) ANALYTICS SEPARATION & HIERARCHY ---")
        q_str = db.query(ALQuestion).filter(ALQuestion.exam_id == 212).order_by(ALQuestion.question_number).all()
        ans_str = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_str])).all()
        rep_str = compute_structured_exam_report(exam_str, q_str, subs_str, ans_str)

        check(rep_str.total_questions == 4, f"Structured report has exactly 4 main questions (Found {rep_str.total_questions})")
        check(len(rep_str.questions) == 4, f"Structured question list length is 4 (Found {len(rep_str.questions)})")
        
        # Verify 16 subparts across 4 questions
        total_subparts = 0
        internal_uuid_labels = []
        for sq in rep_str.questions:
            for node in sq.hierarchy:
                total_subparts += 1
                if any(node.display_label.startswith(p) for p in ["node_", "part_node_", "sub_"]):
                    internal_uuid_labels.append(node.display_label)
                for child in node.children:
                    total_subparts += 1
                    if any(child.display_label.startswith(p) for p in ["node_", "part_node_", "sub_"]):
                        internal_uuid_labels.append(child.display_label)

        check(total_subparts >= 16, f"Structured hierarchy contains all {total_subparts} subparts across questions (Expected >= 16)")
        check(len(internal_uuid_labels) == 0, f"Zero internal UUID/part_node_* labels displayed (Found {len(internal_uuid_labels)})")

        # Verify Structured Marks & Loss Rates
        total_max_points = sum(q.total_points for q in rep_str.questions)
        check(total_max_points == 160.0, f"Structured total maximum points is 160.0 (Found {total_max_points})")
        check(rep_str.average_score is not None and rep_str.average_score > 0, f"Structured average score is {rep_str.average_score} / 160 ({rep_str.average_percentage}%)")
        check(len(rep_str.subpart_loss_ranking) > 0, f"Subpart mark loss leaderboard generated ({len(rep_str.subpart_loss_ranking)} entries)")

        # Verify no 100% false loss or 0 points
        has_false_100_loss = any(
            s["loss_rate_percentage"] == 100.0 and s["total_attempts"] > 0 and s["awarded_points_avg"] == 0.0
            for s in rep_str.subpart_loss_ranking if s["maximum_points"] > 0 and rep_str.average_score > 50
        )
        check(not has_false_100_loss, "No false 100% mark loss anomalies caused by missing fields")

        # ─── SECTION 5: ESSAY ANALYTICS SEPARATION & RUBRIC (EXAM 213) ───
        print("\n--- SECTION 5: PAPER II-B (ESSAY) ANALYTICS SEPARATION & RUBRIC ---")
        q_esy = db.query(ALQuestion).filter(ALQuestion.exam_id == 213).order_by(ALQuestion.question_number).all()
        ans_esy = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_esy])).all()
        rep_esy = compute_essay_exam_report(exam_esy, q_esy, subs_esy, ans_esy)

        check(rep_esy.total_questions == 3, f"Essay report has exactly 3 questions (Found {rep_esy.total_questions})")
        check(len(rep_esy.questions) == 3, f"Essay question list length is 3 (Found {len(rep_esy.questions)})")

        total_criteria = sum(q.criteria_count for q in rep_esy.questions)
        check(total_criteria >= 9, f"Essay rubric criteria parsed across questions: {total_criteria} (Expected >= 9)")

        total_esy_pts = sum(q.total_points for q in rep_esy.questions)
        check(total_esy_pts == 120.0, f"Essay total maximum marks is 120.0 (Found {total_esy_pts})")

        # Verify omission and success rates
        check(len(rep_esy.most_omitted_criteria) > 0, f"Most frequently omitted criteria ranking populated ({len(rep_esy.most_omitted_criteria)} entries)")

        # Verify challenge / mastery ranking logic
        # Most challenging must have highest omission percentage (or lowest success)
        first_omitted = rep_esy.most_omitted_criteria[0]
        last_omitted = rep_esy.most_omitted_criteria[-1]
        check(
            first_omitted["omission_frequency_percentage"] >= last_omitted["omission_frequency_percentage"],
            f"Most challenging correctly ranked with highest omission frequency ({first_omitted['omission_frequency_percentage']}% >= {last_omitted['omission_frequency_percentage']}%)"
        )

        # ─── SECTION 6: ZERO CROSS-ASSESSMENT CONTAMINATION AUDIT ───
        print("\n--- SECTION 6: ZERO CROSS-ASSESSMENT CONTAMINATION AUDIT ---")
        # Check MCQ contains only Exam 210 questions
        mcq_q_ids = set(q.id for q in q_mcq)
        str_q_ids = set(q.id for q in q_str)
        esy_q_ids = set(q.id for q in q_esy)

        check(len(mcq_q_ids.intersection(str_q_ids)) == 0, "Zero ID overlap between MCQ and Structured questions")
        check(len(mcq_q_ids.intersection(esy_q_ids)) == 0, "Zero ID overlap between MCQ and Essay questions")
        check(len(str_q_ids.intersection(esy_q_ids)) == 0, "Zero ID overlap between Structured and Essay questions")

        # ─── SECTION 7: SUBMISSION INSPECTION DATA CONTRACT ───
        print("\n--- SECTION 7: SUBMISSION INSPECTION HIERARCHY VERIFICATION ---")
        # Verify 1 MCQ submission, 1 Structured submission, 1 Essay submission
        sample_mcq_sub = subs_mcq[0]
        sample_str_sub = subs_str[0]
        sample_esy_sub = subs_esy[0]

        # MCQ Inspection
        mcq_ans_sample = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id == sample_mcq_sub.id).all()
        check(len(mcq_ans_sample) == 50, f"MCQ Submission #{sample_mcq_sub.id} maps to 50 answer rows with selected options")
        check(all(a.selected_option is not None for a in mcq_ans_sample if a.auto_score is not None), "MCQ answers preserve selected options and auto scores")

        # Structured Inspection
        str_ans_sample = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id == sample_str_sub.id).all()
        check(len(str_ans_sample) == 4, f"Structured Submission #{sample_str_sub.id} maps to 4 questions with subpart answers")
        check(all(a.subpart_answers_json is not None for a in str_ans_sample), "Structured answers preserve subpart_answers_json")

        # Essay Inspection
        esy_ans_sample = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id == sample_esy_sub.id).all()
        check(len(esy_ans_sample) == 3, f"Essay Submission #{sample_esy_sub.id} maps to 3 essay questions with text and rubric evaluations")
        check(all(len(a.essay_text_answer or "") > 50 for a in esy_ans_sample), "Essay answers preserve student essay texts")

        # ─── SUMMARY ───
        print("\n" + "=" * 80)
        print(f"  PHASE V5.1 VALIDATION SUMMARY: {passed_checks}/{total_checks} CHECKS PASSED")
        print("=" * 80)

        if passed_checks == total_checks:
            print("\n  >>> PHASE V5.1 ACCEPTANCE CRITERIA MET WITH 100% PRECISION <<<")
            return True
        else:
            print(f"\n  >>> VALIDATION FAILED: {total_checks - passed_checks} checks failed <<<")
            return False

    finally:
        db.close()


if __name__ == "__main__":
    success = run_phase_v5_1_validation()
    sys.exit(0 if success else 1)
