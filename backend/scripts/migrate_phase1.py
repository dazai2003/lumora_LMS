"""
Migration & Data Backfill Script for Phase 1 Architecture Foundation.
Safely updates database schema and backfills question versions and quiz-question junctions.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import engine, Base, SessionLocal
from app.models import (
    QuizQuestion, QuestionVersion, IntegrityEvent, ProcessingJob, AuditLog,
    Question, Quiz
)

def run_migration():
    print("[INFO] Running Phase 1 Architecture Migration...")
    
    # 1. Create tables if they do not exist
    Base.metadata.create_all(bind=engine)
    print("[SUCCESS] Created new tables: quiz_questions, question_versions, integrity_events, processing_jobs, audit_logs")

    db = SessionLocal()
    try:
        # 2. Backfill QuestionVersion for existing questions
        existing_questions = db.query(Question).all()
        versions_created = 0
        for q in existing_questions:
            # Check if version exists
            v = db.query(QuestionVersion).filter(QuestionVersion.question_id == q.id).first()
            if not v:
                v = QuestionVersion(
                    question_id=q.id,
                    version_number=1,
                    question_text=getattr(q, "question_text", "Sample Question"),
                    question_type=getattr(q, "question_type", "mcq"),
                    options=getattr(q, "options", None),
                    correct_answer=getattr(q, "correct_answer", "Option A"),
                    explanation=getattr(q, "explanation", None),
                    default_points=getattr(q, "default_points", 1.0) or 1.0,
                    difficulty=getattr(q, "difficulty", "easy"),
                    cognitive_level=getattr(q, "cognitive_level", "understand"),
                    source_type="migration_backfill"
                )
                db.add(v)
                versions_created += 1

        db.commit()
        print(f"[SUCCESS] Backfilled {versions_created} QuestionVersion entries.")

        # 3. Backfill QuizQuestion links for existing quizzes
        quizzes = db.query(Quiz).all()
        links_created = 0
        for quiz in quizzes:
            # Fetch questions for the quiz lesson
            q_list = db.query(Question).filter(Question.lesson_id == quiz.lesson_id).all()
            for idx, q in enumerate(q_list):
                v = db.query(QuestionVersion).filter(QuestionVersion.question_id == q.id).first()
                if v:
                    link = db.query(QuizQuestion).filter(
                        QuizQuestion.quiz_id == quiz.id,
                        QuizQuestion.question_version_id == v.id
                    ).first()

                    if not link:
                        link = QuizQuestion(
                            quiz_id=quiz.id,
                            question_version_id=v.id,
                            order=idx,
                            points_override=getattr(v, "default_points", 1.0)
                        )
                        db.add(link)
                        links_created += 1

        db.commit()
        print(f"[SUCCESS] Backfilled {links_created} QuizQuestion junction links.")
        print("[SUCCESS] Phase 1 Migration & Backfill Completed Successfully!")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Migration error: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
