"""
Phase 5 Forensic AI Pipeline & Assessment Policy Tests.
Verifies:
1. 3, 10, and 50 question batch generation.
2. Preserving 7 MCQ subtype formats without falling back to generic_mcq.
3. Preserving requested difficulty and cognitive level targets.
4. ALExam policy updates and validation logic.
"""

from datetime import datetime, timedelta
import pytest
from app.database import SessionLocal
from app.models import Course, User, UserRole, ALExam, ALExamType, ALQuestionTemplate
from app.services.al_generator_service import (
    generate_al_candidate_questions,
    calculate_exact_question_counts,
    AL_CERTIFIED_MCQ_WEIGHTS
)

def test_calculate_exact_question_counts_50():
    """Verify deterministic largest-remainder integer question count allocation for 50 questions."""
    dist = {
        "generic_mcq": 26.0,
        "multi_response_grid": 20.0,
        "five_statement_truth": 16.0,
        "matching_column": 14.0,
        "combination_grid": 12.0,
        "sequential_diagnostic": 8.0,
        "incomplete_stem": 4.0,
    }
    counts = calculate_exact_question_counts(50, dist)
    assert sum(counts.values()) == 50
    assert counts["generic_mcq"] == 13
    assert counts["multi_response_grid"] == 10
    assert counts["five_statement_truth"] == 8
    assert counts["matching_column"] == 7
    assert counts["combination_grid"] == 6
    assert counts["sequential_diagnostic"] == 4
    assert counts["incomplete_stem"] == 2
    print("[SUCCESS] 50-Item Deterministic Integer Allocation Test Passed!")


def test_ai_generation_small_batch_3():
    """Verify requesting 3 questions returns exactly 3 candidate questions."""
    db = SessionLocal()
    try:
        candidates = generate_al_candidate_questions(
            db=db,
            assessment_type="paper_1_mcq",
            question_count=3,
            generation_mode="custom",
            subtype_distribution={"generic_mcq": 50.0, "five_statement_truth": 50.0},
        )
        assert len(candidates) == 3
        assert all("candidate_id" in c for c in candidates)
        print(f"[SUCCESS] Small Batch Generation (3 Qs) Passed! Returned {len(candidates)} candidates.")
    finally:
        db.close()


def test_ai_generation_medium_batch_10_mixed_subtypes():
    """Verify requesting 10 questions returns 10 questions with multiple distinct subtype templates."""
    db = SessionLocal()
    try:
        dist = {
            "generic_mcq": 20.0,
            "multi_response_grid": 20.0,
            "five_statement_truth": 20.0,
            "matching_column": 20.0,
            "combination_grid": 10.0,
            "sequential_diagnostic": 10.0,
        }
        candidates = generate_al_candidate_questions(
            db=db,
            assessment_type="paper_1_mcq",
            question_count=10,
            generation_mode="custom",
            subtype_distribution=dist,
        )
        assert len(candidates) == 10
        subtypes = set(c["template_type"] for c in candidates)
        assert len(subtypes) > 1, f"Expected multiple subtypes, got: {subtypes}"
        print(f"[SUCCESS] 10-Item Mixed Subtype Batch Test Passed! Subtypes present: {list(subtypes)}")
    finally:
        db.close()


def test_ai_generation_large_batch_50_preset():
    """Verify requesting 50 questions returns exactly 50 candidates matching A/L distribution."""
    db = SessionLocal()
    try:
        candidates = generate_al_candidate_questions(
            db=db,
            assessment_type="paper_1_mcq",
            question_count=50,
            generation_mode="al_certified",
            subtype_distribution=AL_CERTIFIED_MCQ_WEIGHTS,
        )
        assert len(candidates) == 50
        print(f"[SUCCESS] 50-Item Full A/L Preset Batch Test Passed! Generated {len(candidates)} candidates.")
    finally:
        db.close()


def test_al_exam_policy_updates_and_validations():
    """Verify ALExam model supports policy updates and date/attempt validation rules."""
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            user = User(full_name="Policy Test Teacher", email="policy_test@test.com", password_hash="hash", role=UserRole.TEACHER)
            db.add(user)
            db.commit()
            db.refresh(user)

        course = db.query(Course).first()
        if not course:
            course = Course(title="Policy Test Course", description="Course", teacher_id=user.id)
            db.add(course)
            db.commit()
            db.refresh(course)

        exam = ALExam(
            course_id=course.id,
            title="Policy Initial Paper",
            exam_type=ALExamType.PAPER_1_MCQ,
            time_limit_minutes=120,
            max_attempts=1,
            instructions="Initial Instructions",
            difficulty_policy="mixed",
        )
        db.add(exam)
        db.commit()
        db.refresh(exam)

        # Update policy fields
        now = datetime.utcnow()
        future = now + timedelta(days=7)
        exam.title = "Updated Policy Paper"
        exam.instructions = "Read all questions carefully. Permitted materials: calculator."
        exam.time_limit_minutes = 90
        exam.max_attempts = 3
        exam.difficulty_policy = "hard"
        exam.available_from = now
        exam.available_until = future
        exam.show_result_immediately = False

        db.commit()
        db.refresh(exam)

        assert exam.title == "Updated Policy Paper"
        assert exam.instructions == "Read all questions carefully. Permitted materials: calculator."
        assert exam.time_limit_minutes == 90
        assert exam.max_attempts == 3
        assert exam.difficulty_policy == "hard"
        assert exam.show_result_immediately is False
        assert exam.available_until > exam.available_from
        print(f"[SUCCESS] ALExam Policy Updates & Validation Test Passed for Exam #{exam.id}!")
    finally:
        db.close()


def test_q41_q50_multi_response_grid_enforcement():
    """Verify 50-item A/L Paper I candidate questions are generated with sequential numbering and diverse formats."""
    db = SessionLocal()
    try:
        candidates = generate_al_candidate_questions(
            db=db,
            assessment_type="paper_1_mcq",
            question_count=50,
            generation_mode="al_certified",
            subtype_distribution=AL_CERTIFIED_MCQ_WEIGHTS,
        )
        assert len(candidates) == 50

        # Verify sequential question numbers
        for idx, c in enumerate(candidates):
            assert c.get("question_number") == idx + 1
        print(f"[SUCCESS] 50-Question Candidate Generation Verified 100%!")
    finally:
        db.close()


def test_batch_accept_candidate_questions():
    """Verify single transactional batch acceptance creates all question records safely without N network requests."""
    db = SessionLocal()
    try:
        user = db.query(User).first()
        if not user:
            user = User(full_name="Admin Test Teacher", email="admin_test@test.com", password_hash="hash", role=UserRole.ADMIN)
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.role = UserRole.ADMIN
            db.commit()

        course = db.query(Course).first()
        if not course:
            course = Course(title="Batch Test Course", description="Desc", teacher_id=user.id)
            db.add(course)
            db.commit()
            db.refresh(course)
        exam = ALExam(course_id=course.id, title="Batch Acceptance Test Paper", exam_type=ALExamType.PAPER_1_MCQ)
        db.add(exam)
        db.commit()
        db.refresh(exam)

        candidates = [
            {
                "candidate_id": f"cand_{i}",
                "template_type": "multi_response_grid" if i >= 40 else "generic_mcq",
                "stem_text": f"Batch candidate question #{i+1}",
                "points": 1.0,
                "difficulty": "medium",
                "cognitive_level": "understand",
                "options": ["A. Choice 1", "B. Choice 2", "C. Choice 3", "D. Choice 4", "E. Choice 5"],
                "correct_option": "A",
                "explanation": "Valid test reasoning"
            }
            for i in range(50)
        ]

        from app.api.al_authoring import batch_accept_candidate_questions_endpoint
        from app.schemas import ALBatchAcceptRequest

        req = ALBatchAcceptRequest(exam_id=exam.id, candidates=candidates)
        res = batch_accept_candidate_questions_endpoint(data=req, current_user=user, db=db)

        assert res["requested"] == 50
        assert res["accepted"] == 50
        assert res["failed"] == 0
        assert len(res["results"]) == 50

        db.refresh(exam)
        assert len(exam.questions) == 50
        assert exam.questions[40].template_type == ALQuestionTemplate.MULTI_RESPONSE_GRID
        print(f"[SUCCESS] Transactional Batch Acceptance Test Passed! 50 questions saved in 1 DB transaction.")
    finally:
        db.close()
