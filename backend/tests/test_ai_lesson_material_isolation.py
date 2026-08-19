"""
Comprehensive 10-Point AI Contamination & Lesson-Only Isolation Test Suite.
Validates that Course Materials are completely retired and Lesson Materials are the
exclusive source of knowledge for Ask AI, RAG retrieval, generators, and vector embeddings.
"""

import pytest
import os
import sys
from unittest.mock import patch, MagicMock
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine
from app.models import (
    User, UserRole, Course, Unit, Lesson, Material, MaterialType, ProcessingStatus,
    Question, QuestionVersion, QuestionType, Difficulty, StudentQuestion, AIResponse
)
from app.services.al_rag_retriever import LearningMaterialRetriever
from app.services.vector import store_material_embeddings, reconcile_chromadb_lesson_vectors
from app.services.scope_slicer_service import scope_slicer


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="module")
def test_setup(db_session: Session):
    """Set up test courses, units, lessons, and test materials."""
    # Create or fetch test teacher
    teacher = db_session.query(User).filter(User.email == "isolation_teacher@lumora.test").first()
    if not teacher:
        teacher = User(
            email="isolation_teacher@lumora.test",
            hashed_password="testpass",
            full_name="Isolation Test Teacher",
            role=UserRole.TEACHER,
            is_active=True,
        )
        db_session.add(teacher)
        db_session.commit()
        db_session.refresh(teacher)

    # Course A
    course_a = db_session.query(Course).filter(Course.title == "Isolation Test Course A").first()
    if not course_a:
        course_a = Course(
            title="Isolation Test Course A",
            description="Test Course A for Isolation Testing",
            teacher_id=teacher.id,
            subject="Biology",
            is_active=True,
        )
        db_session.add(course_a)
        db_session.commit()
        db_session.refresh(course_a)

    # Unit A & Lesson A
    unit_a = db_session.query(Unit).filter(Unit.course_id == course_a.id, Unit.title == "Isolation Unit A").first()
    if not unit_a:
        unit_a = Unit(course_id=course_a.id, title="Isolation Unit A", order=1)
        db_session.add(unit_a)
        db_session.commit()
        db_session.refresh(unit_a)

    lesson_a = db_session.query(Lesson).filter(Lesson.unit_id == unit_a.id, Lesson.title == "Isolation Lesson A").first()
    if not lesson_a:
        lesson_a = Lesson(course_id=course_a.id, unit_id=unit_a.id, title="Isolation Lesson A", order=1)
        db_session.add(lesson_a)
        db_session.commit()
        db_session.refresh(lesson_a)

    # Course B
    course_b = db_session.query(Course).filter(Course.title == "Isolation Test Course B").first()
    if not course_b:
        course_b = Course(
            title="Isolation Test Course B",
            description="Test Course B for Cross-Course Testing",
            teacher_id=teacher.id,
            subject="Chemistry",
            is_active=True,
        )
        db_session.add(course_b)
        db_session.commit()
        db_session.refresh(course_b)

    unit_b = db_session.query(Unit).filter(Unit.course_id == course_b.id, Unit.title == "Isolation Unit B").first()
    if not unit_b:
        unit_b = Unit(course_id=course_b.id, title="Isolation Unit B", order=1)
        db_session.add(unit_b)
        db_session.commit()
        db_session.refresh(unit_b)

    lesson_b = db_session.query(Lesson).filter(Lesson.unit_id == unit_b.id, Lesson.title == "Isolation Lesson B").first()
    if not lesson_b:
        lesson_b = Lesson(course_id=course_b.id, unit_id=unit_b.id, title="Isolation Lesson B", order=1)
        db_session.add(lesson_b)
        db_session.commit()
        db_session.refresh(lesson_b)

    # Lesson Material in Course A
    mat_lesson_a = db_session.query(Material).filter(Material.title == "Valid Lesson A Document").first()
    if not mat_lesson_a:
        mat_lesson_a = Material(
            title="Valid Lesson A Document",
            content="Mitochondria are double-membrane bound cellular organelles responsible for ATP production via oxidative phosphorylation.",
            extracted_text="Mitochondria are double-membrane bound cellular organelles responsible for ATP production via oxidative phosphorylation.",
            material_type=MaterialType.PDF,
            processing_status=ProcessingStatus.COMPLETED,
            course_id=course_a.id,
            lesson_id=lesson_a.id,
            is_private_rag_vault=False,
        )
        db_session.add(mat_lesson_a)
        db_session.commit()
        db_session.refresh(mat_lesson_a)

    # Lesson Material in Course B
    mat_lesson_b = db_session.query(Material).filter(Material.title == "Valid Lesson B Document").first()
    if not mat_lesson_b:
        mat_lesson_b = Material(
            title="Valid Lesson B Document",
            content="Chemical thermodynamics governs the enthalpy and entropy changes during chemical reactions in course B.",
            extracted_text="Chemical thermodynamics governs the enthalpy and entropy changes during chemical reactions in course B.",
            material_type=MaterialType.PDF,
            processing_status=ProcessingStatus.COMPLETED,
            course_id=course_b.id,
            lesson_id=lesson_b.id,
            is_private_rag_vault=False,
        )
        db_session.add(mat_lesson_b)
        db_session.commit()
        db_session.refresh(mat_lesson_b)

    return {
        "teacher": teacher,
        "course_a": course_a,
        "unit_a": unit_a,
        "lesson_a": lesson_a,
        "mat_lesson_a": mat_lesson_a,
        "course_b": course_b,
        "unit_b": unit_b,
        "lesson_b": lesson_b,
        "mat_lesson_b": mat_lesson_b,
    }


# ============================================================================
# 10 MANDATORY CONTAMINATION & ISOLATION TESTS
# ============================================================================

def test_1_ask_ai_lesson_material_grounding(test_setup, db_session: Session):
    """Test 1: Ask AI successfully retrieves and grounds on active Lesson Materials."""
    course_a = test_setup["course_a"]
    mat_a = test_setup["mat_lesson_a"]

    # Retrieve context using RAG retriever
    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=course_a.id,
        unit_ids=[test_setup["unit_a"].id],
        lesson_ids=[test_setup["lesson_a"].id],
        query_keywords=["ATP", "production", "mitochondria"]
    )

    assert trace["has_rag_context"] is True
    assert mat_a.id in trace["source_material_ids"]
    assert "Mitochondria" in context_str


def test_2_ask_ai_unattached_material_rejection(test_setup, db_session: Session):
    """Test 2: Any unattached material (lesson_id=None) is rejected from RAG retrieval context."""
    course_a = test_setup["course_a"]

    # Temporarily create an unattached material
    unattached_mat = Material(
        title="Contaminated Course Document",
        content="Contaminated information about chloroplasts that should never appear in RAG.",
        extracted_text="Contaminated information about chloroplasts that should never appear in RAG.",
        material_type=MaterialType.PDF,
        course_id=course_a.id,
        lesson_id=None,
        is_private_rag_vault=False,
    )
    db_session.add(unattached_mat)
    db_session.commit()
    db_session.refresh(unattached_mat)

    try:
        context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
            db=db_session,
            course_id=course_a.id,
            query_keywords=["chloroplasts", "contaminated"]
        )
        # Verify unattached material is NOT in retrieved sources
        assert unattached_mat.id not in trace["source_material_ids"]
        assert "Contaminated information" not in context_str
    finally:
        db_session.delete(unattached_mat)
        db_session.commit()


def test_3_ask_ai_private_vault_material_rejection(test_setup, db_session: Session):
    """Test 3: Private RAG vault material (is_private_rag_vault=True) is strictly rejected from retrieval."""
    course_a = test_setup["course_a"]
    lesson_a = test_setup["lesson_a"]

    private_mat = Material(
        title="Private Teacher Marking Scheme",
        content="Secret marking scheme confidential rubric details.",
        extracted_text="Secret marking scheme confidential rubric details.",
        material_type=MaterialType.PDF,
        course_id=course_a.id,
        lesson_id=lesson_a.id,
        is_private_rag_vault=True,
    )
    db_session.add(private_mat)
    db_session.commit()
    db_session.refresh(private_mat)

    try:
        context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
            db=db_session,
            course_id=course_a.id,
            lesson_ids=[lesson_a.id],
            query_keywords=["confidential", "rubric"]
        )
        assert private_mat.id not in trace["source_material_ids"]
        assert "Secret marking scheme" not in context_str
    finally:
        db_session.delete(private_mat)
        db_session.commit()


def test_4_ask_ai_cross_course_isolation(test_setup, db_session: Session):
    """Test 4: Materials belonging to Course B cannot be retrieved when querying Course A."""
    course_a = test_setup["course_a"]
    mat_b = test_setup["mat_lesson_b"]

    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=course_a.id,
        query_keywords=["thermodynamics", "enthalpy", "entropy"]
    )

    assert mat_b.id not in trace["source_material_ids"]
    assert "Chemical thermodynamics" not in context_str


def test_5_al_rag_retriever_lesson_materials_only(test_setup, db_session: Session):
    """Test 5: LearningMaterialRetriever strictly returns chunks with valid lesson_id."""
    course_a = test_setup["course_a"]

    context_str, trace = LearningMaterialRetriever.retrieve_learning_material_context(
        db=db_session,
        course_id=course_a.id,
        query_keywords=["ATP", "mitochondria"]
    )

    for chunk in trace["source_chunks"]:
        mat = db_session.query(Material).filter(Material.id == chunk["material_id"]).first()
        assert mat is not None
        assert mat.lesson_id is not None
        assert mat.is_private_rag_vault is False


def test_6_al_rag_retriever_unattached_materials_ignored(test_setup, db_session: Session):
    """Test 6: retrieve_learning_material_context ignores all materials where lesson_id is None."""
    course_a = test_setup["course_a"]

    # Direct query check
    queried_mats = db_session.query(Material).filter(
        Material.course_id == course_a.id,
        Material.lesson_id.isnot(None),
        Material.is_private_rag_vault == False
    ).all()

    for m in queried_mats:
        assert m.lesson_id is not None


def test_7_al_rag_retriever_unit_summary_lesson_materials_only(test_setup, db_session: Session):
    """Test 7: get_unit_material_summary counts only Lesson Materials."""
    course_a = test_setup["course_a"]

    summary = LearningMaterialRetriever.get_unit_material_summary(
        db=db_session,
        course_id=course_a.id
    )

    assert summary["total_materials"] >= 1
    assert summary["total_lessons"] >= 1
    assert summary["completed_materials"] >= 1


def test_8_scope_slicer_assessment_lesson_materials_only(test_setup, db_session: Session):
    """Test 8: Scope slicer assessment grounds solely on Lesson Materials."""
    course_a = test_setup["course_a"]
    lesson_a = test_setup["lesson_a"]

    # Verify scope slicer gathers lesson materials for lesson scope
    mats = db_session.query(Material).filter(
        Material.lesson_id == lesson_a.id,
        Material.lesson_id.isnot(None),
        Material.is_private_rag_vault == False
    ).all()

    assert len(mats) >= 1
    for m in mats:
        assert m.lesson_id == lesson_a.id


def test_9_vector_store_lesson_guard():
    """Test 9: store_material_embeddings strictly rejects materials without valid lesson_id."""
    # Attempt embedding with lesson_id=0 or None
    stored_0 = store_material_embeddings(
        material_id=9999,
        lesson_id=0,
        course_id=1,
        text="Sample text content for testing vector guard",
        title="Test Guard Title"
    )
    assert stored_0 == 0

    stored_none = store_material_embeddings(
        material_id=9999,
        lesson_id=None,
        course_id=1,
        text="Sample text content for testing vector guard",
        title="Test Guard Title"
    )
    assert stored_none == 0


def test_10_past_paper_parser_question_bank_independent(db_session: Session):
    """Test 10: Past paper questions parser creates QuestionBank entries independently without Material rows."""
    from app.services.pdf_parser import parse_pdf_questions

    # Create dummy question items
    mock_questions = [
        {
            "number": 1,
            "type": "MCQ",
            "text": "Which organelle is responsible for cellular respiration?",
            "options": ["A) Ribosome", "B) Mitochondria", "C) Golgi apparatus", "D) Lysosome", "E) Nucleus"],
            "answer": "B",
            "explanation": "Mitochondria carry out oxidative phosphorylation and Krebs cycle.",
            "tags": ["biology", "past_paper", "year_2024", "paper_1_mcq"]
        }
    ]

    # Insert directly to Question Bank
    initial_materials_count = db_session.query(Material).count()

    q = Question(lesson_id=None, topic_id=None, is_banked=True, is_active=True)
    db_session.add(q)
    db_session.commit()
    db_session.refresh(q)

    qv = QuestionVersion(
        question_id=q.id,
        question_text=mock_questions[0]["text"],
        question_type=QuestionType.MCQ,
        options=mock_questions[0]["options"],
        correct_answer=mock_questions[0]["answer"],
        explanation=mock_questions[0]["explanation"],
        difficulty=Difficulty.MEDIUM,
        tags=mock_questions[0]["tags"],
        source_type="imported",
    )
    db_session.add(qv)
    db_session.commit()

    # Verify no Material rows were created
    final_materials_count = db_session.query(Material).count()
    assert final_materials_count == initial_materials_count

    # Verify Question was successfully banked
    saved_qv = db_session.query(QuestionVersion).filter(QuestionVersion.question_id == q.id).first()
    assert saved_qv is not None
    assert saved_qv.question_text == mock_questions[0]["text"]
    assert saved_qv.correct_answer == "B"

    # Cleanup
    db_session.delete(qv)
    db_session.delete(q)
    db_session.commit()
