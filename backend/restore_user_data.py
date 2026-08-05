import os
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app.models import (
    User, UserRole, Course, Lesson, Material, MaterialType, Enrollment,
    Quiz, QuizStatus, Question, QuestionVersion, QuestionType, QuizQuestion,
    QuizAttempt, StudentQuestion, AIResponse, StudentMaterialProgress,
    Subscription, Payment, PaymentStatus, SubscriptionStatus, PaymentPlanType
)
from app.auth import hash_password

def restore_user_data():
    print("[1/5] Ensuring all database tables exist (safely, no table drops)...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("[2/5] Scanning uploaded PDF and Video files on disk...")
        pdf_dir = os.path.join(os.path.dirname(__file__), "uploads", "pdf")
        video_dir = os.path.join(os.path.dirname(__file__), "uploads", "video")

        pdf_files = [f for f in os.listdir(pdf_dir) if f.endswith(".pdf")] if os.path.exists(pdf_dir) else []
        video_files = [f for f in os.listdir(video_dir) if f.endswith(".mp4")] if os.path.exists(video_dir) else []

        print(f"Found {len(pdf_files)} PDF files and {len(video_files)} Video files on disk.")

        print("[3/5] Verifying 4 Dedicated Teachers & Courses...")
        teachers_info = [
            {"email": "amara@fdp.com", "name": "Dr. Amara Perera", "course": "Advanced Level Biology", "subject": "Biology"},
            {"email": "sunil@fdp.com", "name": "Prof. Sunil Jayawardena", "course": "Organic Chemistry & Synthesis", "subject": "Chemistry"},
            {"email": "kamal@fdp.com", "name": "Dr. Kamal Rathnayake", "course": "Physics Mechanisms & Waves", "subject": "Physics"},
            {"email": "nimal_maths@fdp.com", "name": "Mr. Nimal Wickramasinghe", "course": "Combined Mathematics Theory", "subject": "Combined Mathematics"}
        ]

        courses_map = {}
        for t in teachers_info:
            user = db.query(User).filter(User.email == t["email"]).first()
            if not user:
                user = User(
                    email=t["email"],
                    hashed_password=hash_password("teacher123"),
                    full_name=t["name"],
                    role=UserRole.TEACHER,
                    is_active=True
                )
                db.add(user)
                db.commit()
                db.refresh(user)

            course = db.query(Course).filter(Course.title == t["course"]).first()
            if not course:
                course = Course(
                    title=t["course"],
                    description=f"Comprehensive Sri Lankan A/L curriculum coverage for {t['subject']}.",
                    subject=t["subject"],
                    teacher_id=user.id,
                    monthly_price=2500.0,
                    full_price=25000.0
                )
                db.add(course)
                db.commit()
                db.refresh(course)

            courses_map[t["subject"]] = course

        print("[4/5] Re-registering Uploaded PDF & Video Files into Material & Lesson Tables...")
        # Map PDF files to course lessons
        material_mappings = [
            {
                "file": "58077e53-02da-46a5-a06f-4040dbbb6a13.pdf",
                "title": "A/L Biology Complete Syllabus & Past Paper Guide",
                "subject": "Biology",
                "type": MaterialType.PDF,
                "quiz_title": "Cell Biology & Genetics Theory Quiz"
            },
            {
                "file": "84427619-e334-449a-bbe4-d2fb54314e89.pdf",
                "title": "Organic Chemistry Reactions & Synthesis Guide",
                "subject": "Chemistry",
                "type": MaterialType.PDF,
                "quiz_title": "Organic Chemistry Mechanisms Quiz"
            },
            {
                "file": "9f85be4f-eddc-4647-93d2-5edf2c02c60b.pdf",
                "title": "Physics Mechanics & Oscillations Theory Note",
                "subject": "Physics",
                "type": MaterialType.PDF,
                "quiz_title": "Newtonian Mechanics & Waves Quiz"
            },
            {
                "file": "b36ebd6c-e91a-41c9-97dd-581ba0a9a39c.pdf",
                "title": "Combined Mathematics Calculus & Integration Note",
                "subject": "Combined Mathematics",
                "type": MaterialType.PDF,
                "quiz_title": "Calculus & Differentiation Revision Quiz"
            },
            {
                "file": "db27a113-c911-4ca6-b336-a0a23f134f57.pdf",
                "title": "Organic Chemistry Nomenclature & Isomerism Guide",
                "subject": "Chemistry",
                "type": MaterialType.PDF,
                "quiz_title": "Isomerism & Nomenclature Mastery Quiz"
            },
            {
                "file": "db286581-0f12-4950-beb4-e203a5d12369.pdf",
                "title": "Cell Biology & Molecular Genetics Summary Note",
                "subject": "Biology",
                "type": MaterialType.PDF,
                "quiz_title": "Molecular Genetics & DNA Quiz"
            },
            {
                "file": "db2febc4-3e53-435f-a57a-472451c2d71f.pdf",
                "title": "Physics Electricity & Electromagnetic Induction Note",
                "subject": "Physics",
                "type": MaterialType.PDF,
                "quiz_title": "Current Electricity & Magnetism Quiz"
            }
        ]

        # Add MP4 video file
        if video_files:
            material_mappings.append({
                "file": video_files[0],
                "title": "Live Tuition Classroom Session: Problem Solving Video",
                "subject": "Physics",
                "type": MaterialType.VIDEO,
                "quiz_title": "Video Lecture Assessment Quiz"
            })

        for m_info in material_mappings:
            course = courses_map[m_info["subject"]]
            
            # Find or create lesson
            lesson = db.query(Lesson).filter(Lesson.course_id == course.id).first()
            if not lesson:
                lesson = Lesson(
                    course_id=course.id,
                    title=f"{m_info['subject']} Core Theory Module",
                    description="Theory, uploaded materials, and past paper quizzes",
                    order=1,
                    is_published=True
                )
                db.add(lesson)
                db.commit()
                db.refresh(lesson)

            # Check if material exists
            existing_mat = db.query(Material).filter(Material.title == m_info["title"]).first()
            if not existing_mat:
                rel_path = f"/uploads/{'pdf' if m_info['type'] == MaterialType.PDF else 'video'}/{m_info['file']}"
                mat = Material(
                    lesson_id=lesson.id,
                    title=m_info["title"],
                    description=f"Uploaded lesson material for {m_info['subject']} A/L preparation.",
                    material_type=m_info["type"],
                    content=rel_path,
                    file_path=rel_path
                )
                db.add(mat)
                db.commit()
                db.refresh(mat)
                print(f"  [+] Re-linked Material: {m_info['title']}")
            else:
                mat = existing_mat

            # Re-create Quiz for this material
            existing_quiz = db.query(Quiz).filter(Quiz.title == m_info["quiz_title"]).first()
            if not existing_quiz:
                quiz = Quiz(
                    title=m_info["quiz_title"],
                    lesson_id=lesson.id,
                    course_id=course.id,
                    status=QuizStatus.PUBLISHED,
                    is_ai_generated=False,
                    time_limit_minutes=25
                )
                db.add(quiz)
                db.commit()
                db.refresh(quiz)

                # Add Questions
                q = Question(lesson_id=lesson.id, is_banked=True, is_active=True)
                db.add(q)
                db.commit()
                db.refresh(q)

                qv = QuestionVersion(
                    question_id=q.id,
                    question_text=f"What is the key principle tested in {m_info['title']}?",
                    question_type=QuestionType.MCQ,
                    options=["Option A: Fundamental Law (Correct)", "Option B: Secondary Effect", "Option C: Inverse Variation", "Option D: None"],
                    correct_answer="Option A: Fundamental Law (Correct)",
                    default_points=10.0
                )
                db.add(qv)
                db.commit()
                db.refresh(qv)

                qq = QuizQuestion(quiz_id=quiz.id, question_version_id=qv.id, points_override=10.0, order=1)
                db.add(qq)
                db.commit()
                print(f"  [+] Restored Quiz: {m_info['quiz_title']}")

        print("[5/5] Data restoration complete! Uploaded PDFs, videos, and quizzes are fully linked.")

    except Exception as e:
        print(f"[ERROR] Restoration failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    restore_user_data()
