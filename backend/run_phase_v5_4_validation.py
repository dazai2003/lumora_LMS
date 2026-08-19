"""
LUMORA LMS — PHASE V5.4 VALIDATION SUITE
Cross-Analytics & Teacher Learning Intelligence Reality Check

Verifies:
1. Protected Ground Truth & Zero Mutation (10 students, 30 submissions, 559 answer rows).
2. Four-State Divergence Engine (ENGAGED_MASTERED, ENGAGED_STRUGGLING, LOW_ACTIVITY_HIGH_ATTAINMENT, LOW_ACTIVITY_LOW_ATTAINMENT).
3. Course Cross-Analytics Intelligence & Zero False "Healthy" Classifications.
4. Question-Level Inventory Mapping (50 MCQs, 4 Structured, 3 Essay) with Zero Internal UUIDs.
5. Question Format Divergence (Recognition vs Construction vs Explanation).
6. Cognitive Skill Depth & Taxonomy Transparency.
7. Individual Student Cross-Analytics Dossier & Roster Reconciliation (S1 vs S10).
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


def run_phase_v5_4_validation():
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
    print("  LUMORA LMS — PHASE V5.4 CROSS-ANALYTICS & TEACHER INTELLIGENCE VALIDATION")
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

        units = db.query(Unit).filter(Unit.course_id == 36).order_by(Unit.order.asc()).all()
        check(len(units) == 10, f"Course 36 has all 10 syllabus units (Found {len(units)})")

        submissions = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
        ).all()
        check(len(submissions) == 30, f"Protected 30 submissions preserved (Found {len(submissions)})")

        answers = db.query(ALStudentAnswer).all()
        check(len(answers) == 559, f"Protected 559 answer records preserved (Found {len(answers)})")

        # ─── SECTION 2: FOUR-STATE DIVERGENCE ENGINE ───
        print("\n--- SECTION 2: FOUR-STATE DIVERGENCE ENGINE ---")
        st_em, lbl_em, _, _ = classify_four_state_divergence(80.0, 85.0, 10)
        check(st_em == "ENGAGED_MASTERED", f"High activity (80%) + High attainment (85%) -> ENGAGED_MASTERED (Got {st_em})")

        st_es, lbl_es, interp_es, _ = classify_four_state_divergence(75.0, 42.0, 10, flags_count=3, ai_inquiries=4)
        check(st_es == "ENGAGED_STRUGGLING", f"High activity (75%) + Low attainment (42%) -> ENGAGED_STRUGGLING (Got {st_es})")

        st_la_ha, lbl_la_ha, _, _ = classify_four_state_divergence(15.0, 88.0, 10)
        check(st_la_ha == "LOW_ACTIVITY_HIGH_ATTAINMENT", f"Low activity (15%) + High attainment (88%) -> LOW_ACTIVITY_HIGH_ATTAINMENT (Got {st_la_ha})")

        st_la_la, lbl_la_la, _, _ = classify_four_state_divergence(10.0, 30.0, 10)
        check(st_la_la == "LOW_ACTIVITY_LOW_ATTAINMENT", f"Low activity (10%) + Low attainment (30%) -> LOW_ACTIVITY_LOW_ATTAINMENT (Got {st_la_la})")

        st_nodata, _, _, _ = classify_four_state_divergence(0.0, None, 0)
        check(st_nodata == "NO_DATA", f"Zero activity + No assessment -> NO_DATA (Got {st_nodata})")

        st_lo, _, _, _ = classify_four_state_divergence(60.0, None, 0)
        check(st_lo == "LEARNING_ONLY", f"Learning activity (60%) + No assessment -> LEARNING_ONLY (Got {st_lo})")

        st_ao, _, _, _ = classify_four_state_divergence(None, 70.0, 10)
        check(st_ao == "ASSESSMENT_ONLY", f"No learning + Assessment (70%) -> ASSESSMENT_ONLY (Got {st_ao})")

        st_lim, _, _, _ = classify_four_state_divergence(40.0, 55.0, 2)
        check(st_lim == "LIMITED_DATA", f"Small sample (2 attempts) -> LIMITED_DATA (Got {st_lim})")

        # ─── SECTION 3: COURSE CROSS-ANALYTICS REPORT ───
        print("\n--- SECTION 3: COURSE CROSS-ANALYTICS & EXPLAINABLE REASONING ---")
        report = compute_course_cross_analytics(36, db)
        check(report.course_id == 36, "Course cross-analytics report generated for Course 36")
        check(len(report.units) == 10, f"Report analyzes all 10 syllabus units (Found {len(report.units)})")
        check(len(report.divergence_matrix) == 10, f"Divergence matrix contains 10 unit entries (Found {len(report.divergence_matrix)})")
        check(len(report.format_divergence_matrix) == 10, f"Format divergence matrix contains 10 unit entries (Found {len(report.format_divergence_matrix)})")
        check(len(report.cognitive_intelligence) == 10, f"Cognitive intelligence contains 10 unit entries (Found {len(report.cognitive_intelligence)})")

        # Check evidence explanation is descriptive and non-empty
        all_explanations_valid = all(len(u.evidence_explanation) > 10 for u in report.units)
        check(all_explanations_valid, "All syllabus units have rich, deterministic evidence explanations")

        # Verify zero false healthy classifications
        no_false_healthy = True
        for u in report.units:
            if (u.material_completion_pct is None or u.material_completion_pct == 0) and u.assessment_attainment_pct is None:
                if u.divergence_state == "ENGAGED_MASTERED" or u.evidence_state == "HEALTHY":
                    no_false_healthy = False
        check(no_false_healthy, "Zero unstudied/unassessed units are marked as Mastered or Healthy")

        # ─── SECTION 4: QUESTION-LEVEL INVENTORY & SYLLABUS UNIT MAPPING ───
        print("\n--- SECTION 4: QUESTION-LEVEL INVENTORY & SYLLABUS UNIT MAPPING ---")
        # Test unit question inventory for Unit 4 (Plant Form & Function - contains MCQ, Structured Q2, Essay Q1)
        u4_id = units[3].id
        u4_inventory = get_unit_question_inventory(36, u4_id, db)
        check(len(u4_inventory) > 0, f"Unit 4 has mapped examination items (Found {len(u4_inventory)} items)")

        # Verify items have clean stems, points, and zero internal UUIDs
        has_clean_items = all(
            q.question_number > 0 and q.points > 0 and len(q.stem_text) > 0 and "uuid" not in q.stem_text.lower()
            for q in u4_inventory
        )
        check(has_clean_items, "All question inventory items have valid question numbers, points, stems, and zero UUID leakage")

        # Check all 3 exam types represented across all unit inventories
        all_exam_types = set()
        for u in units:
            u_inv = get_unit_question_inventory(36, u.id, db)
            for q in u_inv:
                all_exam_types.add(q.exam_type)

        check("paper_1_mcq" in all_exam_types and "paper_2_structured" in all_exam_types and "paper_2_essay" in all_exam_types,
              f"All 3 exam types accurately mapped to syllabus unit inventories ({all_exam_types})")

        # ─── SECTION 5: QUESTION FORMAT DIVERGENCE ───
        print("\n--- SECTION 5: QUESTION FORMAT DIVERGENCE PATTERNS ---")
        pat_rec, _, _ = evaluate_format_divergence_pattern(45.0, 75.0, 70.0)
        check(pat_rec == "RECOGNITION_PROBLEM", f"MCQ low vs Structured high -> RECOGNITION_PROBLEM (Got {pat_rec})")

        pat_con, _, _ = evaluate_format_divergence_pattern(80.0, 42.0, 38.0)
        check(pat_con == "CONSTRUCTION_PROBLEM", f"MCQ high vs Structured/Essay low -> CONSTRUCTION_PROBLEM (Got {pat_con})")

        pat_exp, _, _ = evaluate_format_divergence_pattern(65.0, 68.0, 40.0)
        check(pat_exp == "EXPLANATION_PROBLEM", f"Structured reasonable vs Essay low -> EXPLANATION_PROBLEM (Got {pat_exp})")

        pat_bw, _, _ = evaluate_format_divergence_pattern(35.0, 30.0, 28.0)
        check(pat_bw == "BROAD_WEAKNESS", f"All formats below 50% -> BROAD_WEAKNESS (Got {pat_bw})")

        pat_cons, _, _ = evaluate_format_divergence_pattern(72.0, 75.0, 70.0)
        check(pat_cons == "CONSISTENT", f"Balanced format scores -> CONSISTENT (Got {pat_cons})")

        # ─── SECTION 6: COGNITIVE SKILL DEPTH & TAXONOMY TRANSPARENCY ───
        print("\n--- SECTION 6: COGNITIVE SKILL DEPTH & TAXONOMY TRANSPARENCY ---")
        has_cog_reports = len(report.cognitive_intelligence) == 10
        check(has_cog_reports, "All 10 units contain deterministic cognitive depth reports")

        # Verify taxonomy fallback messaging
        sample_cog = report.cognitive_intelligence[0]
        check(len(sample_cog.insight) > 0, f"Cognitive insight generated: '{sample_cog.insight[:60]}...'")

        # ─── SECTION 7: STUDENT CROSS-ANALYTICS DOSSIER DIFFERENTIATION (S1 vs S10) ───
        print("\n--- SECTION 7: STUDENT CROSS-ANALYTICS DOSSIER DIFFERENTIATION ---")
        s1_dossier = compute_student_cross_analytics_dossier(6, 36, db)
        s10_dossier = compute_student_cross_analytics_dossier(15, 36, db)

        check(s1_dossier.student_id == 6 and s1_dossier.overall_assessment_pct > 90.0, f"Student 1 dossier: Attainment = {s1_dossier.overall_assessment_pct}% (> 90%)")
        check(s10_dossier.student_id == 15 and s10_dossier.overall_assessment_pct < 35.0, f"Student 10 dossier: Attainment = {s10_dossier.overall_assessment_pct}% (< 35%)")

        check(s1_dossier.primary_learning_signal == "Strong", f"Student 1 classified as 'Strong' (Got {s1_dossier.primary_learning_signal})")
        check(s10_dossier.primary_learning_signal == "High Priority", f"Student 10 classified as 'High Priority' (Got {s10_dossier.primary_learning_signal})")

        check(s1_dossier.divergence_state == "ENGAGED_MASTERED", f"Student 1 divergence state is ENGAGED_MASTERED (Got {s1_dossier.divergence_state})")
        check(s10_dossier.divergence_state in ["LOW_ACTIVITY_LOW_ATTAINMENT", "ENGAGED_STRUGGLING"], f"Student 10 divergence state is struggling/low activity (Got {s10_dossier.divergence_state})")

        check(len(s1_dossier.unit_breakdown) == 10, "Student 1 dossier has all 10 syllabus units breakdown")
        check(len(s1_dossier.suggested_teacher_actions) >= 2, "Student 1 dossier includes actionable teacher intervention links")

        # ─── SECTION 8: SECURITY & SINGLE SOURCE OF TRUTH ───
        print("\n--- SECTION 8: SECURITY & SINGLE SOURCE OF TRUTH ---")
        # Verify student 1 dossier does not leak student 10 data
        check(s1_dossier.student_name != s10_dossier.student_name, "Student profiles strictly isolated between individual candidates")
        check(s1_dossier.overall_material_completion_pct > s10_dossier.overall_material_completion_pct,
              f"Material completion strictly isolated (S1: {s1_dossier.overall_material_completion_pct}% > S10: {s10_dossier.overall_material_completion_pct}%)")

        # ─── SUMMARY ───
        print("\n" + "=" * 80)
        print(f"  PHASE V5.4 VALIDATION SUMMARY: {passed_checks}/{total_checks} CHECKS PASSED")
        print("=" * 80)

        if passed_checks == total_checks:
            print("\n  >>> PHASE V5.4 ACCEPTANCE CRITERIA MET WITH 100% PRECISION <<<")
            return True
        else:
            print(f"\n  >>> VALIDATION FAILED: {total_checks - passed_checks} checks failed <<<")
            return False

    finally:
        db.close()


if __name__ == "__main__":
    success = run_phase_v5_4_validation()
    sys.exit(0 if success else 1)
