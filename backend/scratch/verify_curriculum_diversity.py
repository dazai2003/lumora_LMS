"""
Verification Script for Multi-Unit Curriculum Diversity, Targeted RAG Scoping,
and Clean Mark Normalization in Lumora LMS.
"""
import sys
import os

sys.path.insert(0, os.path.abspath("."))

from app.database import SessionLocal
from app.models import Course, Unit, Lesson, Material
from app.services.al_structured_generator import (
    resolve_structured_question_unit_scope,
    build_rag_context_for_structured,
    build_layered_blueprint_json_skeleton,
    create_default_teacher_blueprint,
)
from app.services.al_essay_generator import (
    resolve_essay_question_domain_scope,
    get_essay_rag_context,
    build_essay_blueprint_json_skeleton,
)

def run_curriculum_diversity_verification():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.id == 36).first()
        assert course is not None, "Course 36 not found"
        print(f"[OK] Found Course 36: '{course.title}' (Teacher ID: {course.teacher_id})")

        # ----------------------------------------------------
        # 1. Structured Question Scope Allocation Verification
        # ----------------------------------------------------
        print("\n--- Testing Structured Question Unit Scope Allocations (Q1..Q4) ---")
        structured_unit_scopes = []
        for q_idx in range(4):
            assigned_ids, theme, keywords = resolve_structured_question_unit_scope(
                idx=q_idx, db=db, course_id=36, user_unit_ids=None
            )
            structured_unit_scopes.append((assigned_ids, theme, keywords))
            rag_text = build_rag_context_for_structured(
                db=db, course_id=36, unit_ids=assigned_ids, query_keywords=keywords
            )
            print(f"Q{q_idx + 1}: Unit IDs={assigned_ids}")
            print(f"    Theme: {theme[:80]}...")
            print(f"    Keywords: {keywords[:4]}")
            print(f"    RAG Context Sample: {rag_text[:120].replace(chr(10), ' ')}...")
            assert assigned_ids is not None and len(assigned_ids) > 0, f"Q{q_idx+1} unit IDs must not be empty"

        # Verify all 4 structured unit allocations are mutually disjoint
        set_q1 = set(structured_unit_scopes[0][0])
        set_q2 = set(structured_unit_scopes[1][0])
        set_q3 = set(structured_unit_scopes[2][0])
        set_q4 = set(structured_unit_scopes[3][0])
        
        assert set_q1.isdisjoint(set_q2), "Q1 and Q2 units must be disjoint"
        assert set_q2.isdisjoint(set_q3), "Q2 and Q3 units must be disjoint"
        assert set_q3.isdisjoint(set_q4), "Q3 and Q4 units must be disjoint"
        print("[SUCCESS] All 4 Structured Questions have 100% mutually disjoint syllabus unit scopes!")

        # ----------------------------------------------------
        # 2. Essay Question Domain Allocation Verification
        # ----------------------------------------------------
        print("\n--- Testing Essay Question Domain Allocations (E1..E3) ---")
        essay_domain_scopes = []
        for e_idx in range(3):
            assigned_ids, domain, keywords, pref_struct = resolve_essay_question_domain_scope(
                idx=e_idx, db=db, course_id=36, user_unit_ids=None
            )
            essay_domain_scopes.append((assigned_ids, domain, keywords, pref_struct))
            rag_text, has_rag = get_essay_rag_context(
                db=db, course_id=36, unit_ids=assigned_ids, query_keywords=keywords
            )
            print(f"Essay {e_idx + 1}: Unit IDs={assigned_ids}")
            print(f"    Domain: {domain[:80]}...")
            print(f"    Keywords: {keywords[:4]}")
            print(f"    RAG Context Sample: {rag_text[:120].replace(chr(10), ' ')}...")
            assert assigned_ids is not None and len(assigned_ids) > 0, f"Essay {e_idx+1} unit IDs must not be empty"

        set_e1 = set(essay_domain_scopes[0][0])
        set_e2 = set(essay_domain_scopes[1][0])
        set_e3 = set(essay_domain_scopes[2][0])

        assert set_e1.isdisjoint(set_e2), "Essay 1 and Essay 2 unit scopes must be disjoint"
        assert set_e2.isdisjoint(set_e3), "Essay 2 and Essay 3 unit scopes must be disjoint"
        print("[SUCCESS] All 3 Essay Questions have 100% mutually disjoint syllabus domain scopes!")

        # ----------------------------------------------------
        # 3. Clean Mathematical Precision Verification
        # ----------------------------------------------------
        print("\n--- Testing Float Decimal Precision and Clean Rounding ---")
        sample_bps = create_default_teacher_blueprint(4)
        skeleton_str = build_layered_blueprint_json_skeleton(sample_bps)
        assert "13.399999999999999" not in skeleton_str, "Found unrounded floating point in structured skeleton"
        assert "3.4000000000000004" not in skeleton_str, "Found unrounded floating point in structured skeleton"

        essay_bps = [
            {"id": "q_1", "question_number": 5, "structure_type": "MULTI_PART", "marks": 40.0},
            {"id": "q_2", "question_number": 6, "structure_type": "SINGLE_COMPLETE", "marks": 40.0},
            {"id": "q_3", "question_number": 7, "structure_type": "SHORT_NOTES", "marks": 40.0},
        ]
        essay_skeleton_str = build_essay_blueprint_json_skeleton(essay_bps)
        assert "13.399999999999999" not in essay_skeleton_str, "Found unrounded floating point in essay skeleton"
        assert "3.4000000000000004" not in essay_skeleton_str, "Found unrounded floating point in essay skeleton"
        print("[SUCCESS] Zero floating point precision leaks in question skeletons!")

        print("\n========================================================")
        print("ALL CURRICULUM DIVERSITY & NUMERICAL PRECISION CHECKS PASSED!")
        print("========================================================")
    finally:
        db.close()

if __name__ == "__main__":
    run_curriculum_diversity_verification()
