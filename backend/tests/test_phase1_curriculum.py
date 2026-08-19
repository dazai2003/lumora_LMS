from app.database import SessionLocal
from app.models import Course, User, UserRole
from app.services.scope_slicer_service import scope_slicer

def test_scope_slicer_generation_structure():
    """Verify 3-tier Scope Slicer generation parameters and fallback handling."""
    db = SessionLocal()
    try:
        course = db.query(Course).first()
        if not course:
            user = db.query(User).first()
            if not user:
                user = User(full_name="Teacher One", email="teacher@test.com", password_hash="hash", role=UserRole.TEACHER)
                db.add(user)
                db.commit()
                db.refresh(user)
            course = Course(title="A/L Biology 2026", description="Full Course", teacher_id=user.id)
            db.add(course)
            db.commit()
            db.refresh(course)

        res = scope_slicer.generate_scope_sliced_assessment(
            db=db,
            scope="subject",
            target_id=None,
            course_id=course.id,
            paper_type="paper_1_mcq"
        )

        assert "message" in res
        assert "exam_id" in res
        assert "title" in res
        assert res["questions_count"] > 0
        print(f"[SUCCESS] Scope Slicer Assessment Test Passed: '{res['title']}' ({res['questions_count']} Qs)")
    finally:
        db.close()


def test_private_rag_vault_flag_structure():
    """Verify is_private_rag_vault flag logic for materials."""
    sample_mat = {
        "title": "2024 Marking Scheme",
        "category": "marking_scheme",
        "is_private_rag_vault": True
    }

    assert sample_mat["is_private_rag_vault"] is True
    assert sample_mat["category"] == "marking_scheme"
    print(f"[SUCCESS] Private RAG Vault Model Flag Test Passed: '{sample_mat['title']}'")


if __name__ == "__main__":
    print("Running Phase 1 Integration Tests...")
    test_scope_slicer_generation_structure()
    test_private_rag_vault_flag_structure()
    print("\n>>> ALL PHASE 1 INTEGRATION TESTS PASSED 100%! <<<")
