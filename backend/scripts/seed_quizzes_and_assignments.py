"""
Seed Quizzes and Assignments for the Advanced Level Physics Course.
"""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import (
    Course, Lesson, Quiz, Question, QuestionVersion, QuizQuestion,
    QuestionType, Difficulty, CognitiveLevel, QuizStatus,
    Assignment, AssignmentRubric, RubricCriteria, TeacherApprovalStatus
)

def seed():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.title == "Advanced Level Physics").first()
        if not course:
            print("[ERROR] Course not found.")
            return

        lesson = db.query(Lesson).filter(Lesson.course_id == course.id).first()
        if not lesson:
            print("[ERROR] Lesson not found.")
            return

        # 1. Create a Quiz
        quiz = Quiz(
            title="Mechanics & Kinematics Fundamentals",
            description="Assessment testing Newton's Laws, velocity, acceleration, and projectile motion.",
            status=QuizStatus.PUBLISHED,
            time_limit_minutes=20,
            max_attempts=3,
            is_strict_mode=False,
            randomize_questions=True,
            randomize_options=True,
            lesson_id=lesson.id,
            course_id=course.id,
        )
        db.add(quiz)
        db.commit()
        db.refresh(quiz)

        # Questions for Quiz
        q1 = Question(is_banked=True, lesson_id=lesson.id)
        db.add(q1)
        db.flush()
        qv1 = QuestionVersion(
            question_id=q1.id,
            question_text="What is Newton's Second Law of Motion represented as?",
            question_type=QuestionType.MCQ,
            options=["F = ma", "E = mc^2", "p = mv", "v = u + at"],
            correct_answer="F = ma",
            explanation="Newton's second law states that Force equals mass times acceleration (F = ma).",
            default_points=2.0,
            difficulty=Difficulty.EASY,
            cognitive_level=CognitiveLevel.REMEMBER,
            teacher_approval_status=TeacherApprovalStatus.APPROVED,
            source_type="manual"
        )
        db.add(qv1)
        db.flush()

        q2 = Question(is_banked=True, lesson_id=lesson.id)
        db.add(q2)
        db.flush()
        qv2 = QuestionVersion(
            question_id=q2.id,
            question_text="True or False: Acceleration is a vector quantity having both magnitude and direction.",
            question_type=QuestionType.TRUE_FALSE,
            options=["True", "False"],
            correct_answer="True",
            explanation="Acceleration specifies both rate of change of velocity and direction.",
            default_points=1.0,
            difficulty=Difficulty.EASY,
            cognitive_level=CognitiveLevel.UNDERSTAND,
            teacher_approval_status=TeacherApprovalStatus.APPROVED,
            source_type="manual"
        )
        db.add(qv2)
        db.flush()

        q3 = Question(is_banked=True, lesson_id=lesson.id)
        db.add(q3)
        db.flush()
        qv3 = QuestionVersion(
            question_id=q3.id,
            question_text="Briefly explain the law of conservation of momentum in a closed system.",
            question_type=QuestionType.SHORT_ANSWER,
            options=[],
            correct_answer="The total momentum before a collision equals total momentum after collision if no external forces act.",
            explanation="In an isolated system with no external forces, total linear momentum is conserved.",
            default_points=5.0,
            difficulty=Difficulty.MEDIUM,
            cognitive_level=CognitiveLevel.APPLY,
            teacher_approval_status=TeacherApprovalStatus.APPROVED,
            source_type="manual"
        )
        db.add(qv3)
        db.flush()

        for i, qv in enumerate([qv1, qv2, qv3]):
            qq = QuizQuestion(quiz_id=quiz.id, question_version_id=qv.id, order=i)
            db.add(qq)

        # 2. Create an Assignment
        due = datetime.utcnow() + timedelta(days=7)
        assignment = Assignment(
            course_id=course.id,
            lesson_id=lesson.id,
            title="Newtonian Dynamics & Kinematic Systems Essay",
            description="Comprehensive analysis of multi-body systems and real-world kinematic applications.",
            instructions="Submit your response as a detailed PDF or Rich Text essay (minimum 300 words). Include free-body diagrams where applicable.",
            max_marks=100.0,
            weightage=15.0,
            is_group=False,
            status="published",
            due_date=due,
            category="essay",
            difficulty="medium",
            blooms_level="apply",
            est_completion_time_minutes=120,
            word_count_limits={"min": 300, "max": 2000},
            allowed_file_types=[".pdf", ".docx"],
            max_upload_size_mb=25,
            ai_policy="assisted",
            anonymous_marking=False,
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

        # Rubric for assignment
        rubric = AssignmentRubric(assignment_id=assignment.id, title="Physics Essay Evaluation Rubric")
        db.add(rubric)
        db.commit()
        db.refresh(rubric)

        crit1 = RubricCriteria(rubric_id=rubric.id, criterion_name="Conceptual Accuracy", description="Demonstration of physical principles and laws.", max_score=40.0, weight=1.0, order=1)
        crit2 = RubricCriteria(rubric_id=rubric.id, criterion_name="Mathematical & Diagrammatic Rigor", description="Correct equations and clear free-body diagrams.", max_score=40.0, weight=1.0, order=2)
        crit3 = RubricCriteria(rubric_id=rubric.id, criterion_name="Clarity & Structure", description="Well-organized technical writing and references.", max_score=20.0, weight=1.0, order=3)
        db.add_all([crit1, crit2, crit3])
        db.commit()

        print(f"[OK] Created Quiz: '{quiz.title}' with 3 questions.")
        print(f"[OK] Created Assignment: '{assignment.title}' with 3 rubric criteria.")

    finally:
        db.close()

if __name__ == "__main__":
    seed()
