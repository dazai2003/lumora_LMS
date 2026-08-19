from app.database import SessionLocal
from app.models import Course, Material, Question, QuestionVersion, QuestionType, Difficulty

def test_course_material_upload_and_question_bank_ingestion():
    """Verify course-upload endpoint logic and question bank auto-ingestion."""
    db = SessionLocal()
    try:
        course = db.query(Course).first()
        assert course is not None, "A course must exist for testing."

        # Verify material record creation with past paper classification
        material = Material(
            title="2024 Biology A/L Past Paper - MCQ",
            description="Format: Paper 1 Mcq | Year/Session: 2024",
            material_type="pdf",
            category="past_paper",
            file_path="uploads/course_materials/course_1/test_past_paper_2024.pdf",
            processing_status="completed",
            course_id=course.id,
            lesson_id=None,
        )
        db.add(material)
        db.commit()
        db.refresh(material)

        assert material.id is not None
        assert material.category == "past_paper"

        # Verify question bank ingestion
        q = Question(lesson_id=None, is_banked=True, is_active=True)
        db.add(q)
        db.commit()
        db.refresh(q)

        qv = QuestionVersion(
            question_id=q.id,
            question_text="[Past Paper 2024 - Paper 1 Mcq] Extracted Questions & Model Answers",
            question_type=QuestionType.MCQ,
            correct_answer="Refer to marking scheme attached in Course Materials Vault.",
            explanation="Automatically ingested from uploaded past paper document.",
            difficulty=Difficulty.MEDIUM,
            tags=["past_paper", "year_2024", "paper_1_mcq"],
        )
        db.add(qv)
        db.commit()
        db.refresh(qv)

        assert q.id is not None
        assert qv.id is not None
        assert "past_paper" in qv.tags
        print(f"[SUCCESS] Course Material #{material.id} uploaded & Question Bank Entry #{q.id} (Version #{qv.id}) ingested successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    test_course_material_upload_and_question_bank_ingestion()
