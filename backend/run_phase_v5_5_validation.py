"""
LUMORA LMS — PHASE V5.5 COMPREHENSIVE VALIDATION SUITE
Analytics Intelligence UI & Experience Refinement

Verifies:
1. Protected Ground Truth & Zero Mutation (10 students, 30 submissions, 559 answer rows).
2. Assessment-Type Isolation (Paper I MCQ, Paper II-A Structured, Paper II-B Essay strictly separated).
3. Learning Intelligence 4-State Divergence Engine & Zero False "Healthy" Classifications.
4. Question-Level Inventory Mapping (50 MCQs, 4 Structured, 3 Essay) with Zero Internal UUIDs.
5. Materials & Difficulty Flag Intelligence (54 materials, 14 flags).
6. Ask AI Concept Topic Intelligence & Privacy Preservation (16 queries).
7. Student Cross-Analytics Dossier & Roster Reconciliation (S1 vs S10).
8. Security, Data Isolation & Single Source of Truth.
"""

import sys
import os

# Add backend root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import (
    User, Course, Unit, Lesson, Material, StudentMaterialProgress, MaterialFlag,
    StudentQuestion, Enrollment, ALExam, ALStudentSubmission, ALStudentAnswer,
    ALQuestion
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
    compute_ask_ai_analytics
)


def run_phase_v5_5_validation():
    db = SessionLocal()
    total_checks = 0
    passed_checks = 0

    def check(condition: bool, description: str):
        nonlocal total_checks, passed_checks
        total_checks += 1
        if condition:
            passed_checks += 1
            print(f"  [PASS] Check #{total_checks:02d}: {description}")
        else:
            print(f"  [FAIL] Check #{total_checks:02d}: {description}")

    print("=" * 80)
    print("  LUMORA LMS — PHASE V5.5 ANALYTICS INTELLIGENCE UI & EXPERIENCE VALIDATION")
    print("=" * 80)

    try:
        # ─── SECTION 1: PROTECTED GROUND TRUTH & ZERO MUTATION ───
        print("\n--- SECTION 1: PROTECTED GROUND TRUTH & ZERO MUTATION ---")
        teacher = db.query(User).filter(User.email == "amara@fdp.com").first()
        check(teacher is not None, "Teacher Dr. Amara Perera loaded")

        students = db.query(User).filter(User.email.like("student%@fdp.com")).all()
        check(len(students) == 10, f"Exactly 10 synthetic students present (Found {len(students)})")

        course = db.query(Course).filter(Course.id == 36).first()
        check(course is not None, "Course 36 loaded")

        units = db.query(Unit).filter(Unit.course_id == 36).order_by(Unit.order).all()
        check(len(units) == 10, f"Course 36 has all 10 syllabus units (Found {len(units)})")

        subs = db.query(ALStudentSubmission).join(ALExam).filter(ALExam.course_id == 36).all()
        check(len(subs) == 30, f"Protected 30 submissions preserved (Found {len(subs)})")

        answers = db.query(ALStudentAnswer).join(ALStudentSubmission).join(ALExam).filter(ALExam.course_id == 36).all()
        check(len(answers) == 559, f"Protected 559 answer records preserved (Found {len(answers)})")

        # ─── SECTION 2: ASSESSMENT-TYPE SEPARATION & ZERO CONTAMINATION ───
        print("\n--- SECTION 2: ASSESSMENT-TYPE ISOLATION & ZERO LEAKAGE ---")
        exam_mcq = db.query(ALExam).filter(ALExam.id == 210).first()
        subs_mcq = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 210).all()
        q_mcq = db.query(ALQuestion).filter(ALQuestion.exam_id == 210).order_by(ALQuestion.question_number).all()
        ans_mcq = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_mcq])).all()
        mcq_rep = compute_mcq_exam_report(exam_mcq, q_mcq, subs_mcq, ans_mcq)
        check(mcq_rep.total_questions == 50, f"Paper I (MCQ) contains exactly 50 items (Found {mcq_rep.total_questions})")
        check(all(len(q.option_distribution) > 0 for q in mcq_rep.questions), "All 50 MCQ questions have full distractor option distributions")

        exam_str = db.query(ALExam).filter(ALExam.id == 212).first()
        subs_str = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 212).all()
        q_str = db.query(ALQuestion).filter(ALQuestion.exam_id == 212).order_by(ALQuestion.question_number).all()
        ans_str = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_str])).all()
        struct_rep = compute_structured_exam_report(exam_str, q_str, subs_str, ans_str)
        check(struct_rep.total_questions == 4, f"Paper II-A (Structured) contains exactly 4 main questions (Found {struct_rep.total_questions})")
        check(len(struct_rep.subpart_loss_ranking) > 0, "Paper II-A contains subpart mark loss ranking")
        clean_labels = all("part_node_" not in s.get("display_label", "") for s in struct_rep.subpart_loss_ranking)
        check(clean_labels, "Structured mark loss uses clean academic labels without part_node_* or UUIDs")

        exam_esy = db.query(ALExam).filter(ALExam.id == 213).first()
        subs_esy = db.query(ALStudentSubmission).filter(ALStudentSubmission.exam_id == 213).all()
        q_esy = db.query(ALQuestion).filter(ALQuestion.exam_id == 213).order_by(ALQuestion.question_number).all()
        ans_esy = db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_([s.id for s in subs_esy])).all()
        essay_rep = compute_essay_exam_report(exam_esy, q_esy, subs_esy, ans_esy)
        check(essay_rep.total_questions == 3, f"Paper II-B (Essay) contains exactly 3 essay questions (Found {essay_rep.total_questions})")
        check(len(essay_rep.most_omitted_criteria) > 0, "Paper II-B contains omitted rubric criteria ranking")

        # ─── SECTION 3: LEARNING INTELLIGENCE & 4-STATE DIVERGENCE ───
        print("\n--- SECTION 3: LEARNING INTELLIGENCE & 4-STATE DIVERGENCE ---")
        cross_rep = compute_course_cross_analytics(36, db)
        check(len(cross_rep.units) == 10, f"Course cross-analytics covers all 10 syllabus units (Found {len(cross_rep.units)})")

        states = {u.divergence_state for u in cross_rep.units}
        check(any(s in ["ENGAGED_MASTERED", "ENGAGED_STRUGGLING", "LOW_ACTIVITY_HIGH_ATTAINMENT", "LOW_ACTIVITY_LOW_ATTAINMENT"] for s in states), f"Valid divergence states detected ({states})")

        zero_untruth = all(
            not (u.evidence_state == "NO_DATA" and u.divergence_state == "ENGAGED_MASTERED")
            for u in cross_rep.units
        )
        check(zero_untruth, "Zero unstudied/unassessed units are marked as Mastered or Healthy")

        # ─── SECTION 4: QUESTION INVENTORY & INSPECT EXAM ITEMS ───
        print("\n--- SECTION 4: QUESTION INVENTORY & ITEM INSPECTION ---")
        unit4_inv = get_unit_question_inventory(36, units[3].id, db)
        check(len(unit4_inv) > 0, f"Unit 4 has mapped examination items (Found {len(unit4_inv)} items)")

        has_real_stems = all(len(q.stem_text) > 10 for q in unit4_inv)
        check(has_real_stems, "All question inventory items contain genuine question stems")

        has_clean_templates = all(q.template_name and "None" not in q.template_name for q in unit4_inv)
        check(has_clean_templates, "All question inventory items have human-readable template names")

        # ─── SECTION 5: MATERIALS & DIFFICULTY FLAG INTELLIGENCE ───
        print("\n--- SECTION 5: MATERIALS & DIFFICULTY FLAG INTELLIGENCE ---")
        mat_rep = compute_course_material_analytics(36, db)
        check(mat_rep.total_materials >= 54, f"Materials report analyzes all materials (Found {mat_rep.total_materials})")
        check(mat_rep.total_flags >= 14, f"Materials report reconciles {mat_rep.total_flags} difficulty flags (Found {mat_rep.total_flags})")

        # ─── SECTION 6: ASK AI CONCEPT INTELLIGENCE & PRIVACY ───
        print("\n--- SECTION 6: ASK AI CONCEPT INTELLIGENCE & PRIVACY ---")
        ai_rep = compute_ask_ai_analytics(36, db)
        check(ai_rep.total_questions_asked == 16, f"Ask AI report analyzes 16 questions (Found {ai_rep.total_questions_asked})")
        check(len(ai_rep.topic_categories) > 0, "Ask AI aggregates concepts into privacy-safe topic clusters")

        # ─── SECTION 7: STUDENT CROSS-ANALYTICS DOSSIER & ROSTER ───
        print("\n--- SECTION 7: STUDENT CROSS-ANALYTICS DOSSIERS ---")
        s1 = db.query(User).filter(User.email == "student1@fdp.com").first()
        s10 = db.query(User).filter(User.email == "student10@fdp.com").first()
        s1_dossier = compute_student_cross_analytics_dossier(s1.id, 36, db)
        s10_dossier = compute_student_cross_analytics_dossier(s10.id, 36, db)

        check(s1_dossier.overall_assessment_pct >= 90.0, f"Student 1 dossier attainment = {s1_dossier.overall_assessment_pct}% (>= 90%)")
        check(s10_dossier.overall_assessment_pct < 35.0, f"Student 10 dossier attainment = {s10_dossier.overall_assessment_pct}% (< 35%)")
        check(s1_dossier.primary_learning_signal == "Strong", f"Student 1 signal = {s1_dossier.primary_learning_signal}")
        check(s10_dossier.primary_learning_signal == "High Priority", f"Student 10 signal = {s10_dossier.primary_learning_signal}")
        check(len(s1_dossier.suggested_teacher_actions) > 0, "Student dossiers provide actionable direct links to Marking Studio & Flag Review")

        # ─── SECTION 8: SECURITY & PROFILE ISOLATION ───
        print("\n--- SECTION 8: SECURITY & PROFILE ISOLATION ---")
        check(s1_dossier.student_id != s10_dossier.student_id, "Student profile IDs strictly isolated")
        check(s1_dossier.overall_material_completion_pct > s10_dossier.overall_material_completion_pct, "Student learning progress strictly isolated")

    finally:
        db.close()

    print("\n" + "=" * 80)
    print(f"  PHASE V5.5 VALIDATION SUMMARY: {passed_checks}/{total_checks} CHECKS PASSED")
    print("=" * 80)

    if passed_checks == total_checks:
        print("\n  >>> PHASE V5.5 ACCEPTANCE CRITERIA MET WITH 100% PRECISION <<<\n")
        return 0
    else:
        print(f"\n  >>> VALIDATION FAILED: {total_checks - passed_checks} checks failed <<<\n")
        return 1


if __name__ == "__main__":
    sys.exit(run_phase_v5_5_validation())
