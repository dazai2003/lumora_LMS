"""
Seed Custom Users, Courses, Lessons, Quizzes, and Enrollments for Biological Science Stream.
"""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, Base, engine
from app.models import (
    User, UserRole, Course, Lesson, Enrollment, Quiz, Question,
    QuestionVersion, QuizQuestion, QuestionType, Difficulty,
    CognitiveLevel, QuizStatus, Assignment, AssignmentRubric, RubricCriteria,
    TeacherApprovalStatus
)
from app.auth import hash_password

def seed_custom():
    db = SessionLocal()
    try:
        print("[SEED] Starting custom seeding process...")

        # 1. System Admin
        admin = db.query(User).filter(User.email == "admin@fdp.com").first()
        if not admin:
            admin = User(
                email="admin@fdp.com",
                hashed_password=hash_password("admin123"),
                full_name="System Administrator",
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(admin)
            db.commit()
            print("  [OK] Created Admin: admin@fdp.com")
        else:
            print("  [INFO] Admin admin@fdp.com already exists.")

        # 2. Teachers & Courses Setup
        teachers_data = [
            {
                "email": "amara@fdp.com",
                "name": "Dr.Amara Perera",
                "password": "teacher123",
                "course_title": "Advanced Level Biology",
                "subject": "Biology",
                "description": "Comprehensive A-Level Biology covering Cell Biology, Genetics, Plant Physiology, and Human Anatomy for Sri Lankan A/L examination.",
                "lessons": [
                    ("Cell Structure & Function", "Microscopic analysis of organelles and cell division", 1),
                    ("Genetics & Molecular Biology", "DNA replication, transcription, and Mendelian genetics", 2),
                    ("Plant Physiology", "Photosynthesis, respiration, and water transport", 3),
                ]
            },
            {
                "email": "sunil@fdp.com",
                "name": "Sunil Jayawardena",
                "password": "teacher123",
                "course_title": "Organic Chemistry & Synthesis",
                "subject": "Chemistry",
                "description": "Complete G.C.E A/L Organic Chemistry including Reaction Mechanisms, Hydrocarbons, Functional Groups, and Chemical Synthesis.",
                "lessons": [
                    ("Alkanes, Alkenes & Alkynes", "Structure, bonding, and reaction mechanisms of hydrocarbons", 1),
                    ("Aromatic Compounds & Reactions", "Benzene ring electrophilic substitution and resonance", 2),
                    ("Organic Synthesis Protocols", "Multi-step organic synthesis strategies for A/L exam", 3),
                ]
            },
            {
                "email": "kamal@fdp.com",
                "name": "Dr.Kamal Rathnayake",
                "password": "teacher123",
                "course_title": "Physics Mechanisms & Waves",
                "subject": "Physics",
                "description": "Master A-Level Physics Mechanics, Wave Motion, Optics, Electricity, and Modern Physics with problem-solving techniques.",
                "lessons": [
                    ("Newtonian Mechanics & Dynamics", "Vectors, forces, circular motion, and momentum", 1),
                    ("Wave Motion & Acoustics", "Sound waves, interference, diffraction, and standing waves", 2),
                    ("Geometrical & Wave Optics", "Reflection, refraction, lenses, and optical instruments", 3),
                ]
            }
        ]

        created_courses = []

        for tdata in teachers_data:
            teacher = db.query(User).filter(User.email == tdata["email"]).first()
            if not teacher:
                teacher = User(
                    email=tdata["email"],
                    hashed_password=hash_password(tdata["password"]),
                    full_name=tdata["name"],
                    role=UserRole.TEACHER,
                    is_active=True
                )
                db.add(teacher)
                db.commit()
                db.refresh(teacher)
                print(f"  [OK] Created Teacher: {tdata['name']} ({tdata['email']})")

            # Create or find course
            course = db.query(Course).filter(Course.title == tdata["course_title"]).first()
            if not course:
                course = Course(
                    title=tdata["course_title"],
                    description=tdata["description"],
                    subject=tdata["subject"],
                    teacher_id=teacher.id,
                    is_active=True
                )
                db.add(course)
                db.commit()
                db.refresh(course)
                print(f"  [OK] Created Course: '{course.title}'")

                # Create lessons
                for l_title, l_desc, l_order in tdata["lessons"]:
                    lesson = Lesson(
                        title=l_title,
                        description=l_desc,
                        order=l_order,
                        is_published=True,
                        course_id=course.id
                    )
                    db.add(lesson)
                db.commit()
                print(f"  [OK] Added 3 lessons for '{course.title}'")

            created_courses.append(course)

        # 3. 10 Biological Science Stream Students
        students_data = [
            ("student1@fdp.com", "Aseni Pamadi"),
            ("student2@fdp.com", "Janani Kavindi"),
            ("student3@fdp.com", "Dulith Malika"),
            ("student4@fdp.com", "Asitha Sandaruwan"),
            ("student5@fdp.com", "Malithi Raveesha"),
            ("student6@fdp.com", "Harshana Madhubashana"),
            ("student7@fdp.com", "Sakuna Rambukwella"),
            ("student8@fdp.com", "Sakuni Ruwinika"),
            ("student9@fdp.com", "Chami Mali"),
            ("student10@fdp.com", "Sakura Niladenuwani"),
        ]

        created_students = []
        for s_email, s_name in students_data:
            student = db.query(User).filter(User.email == s_email).first()
            if not student:
                student = User(
                    email=s_email,
                    hashed_password=hash_password("student123"),
                    full_name=s_name,
                    role=UserRole.STUDENT,
                    is_active=True
                )
                db.add(student)
                db.commit()
                db.refresh(student)
                print(f"  [OK] Created Student: {s_name} ({s_email})")
            created_students.append(student)

        # 4. Enroll all 10 students into all 3 courses
        print("\n[ENROLLMENT] Enrolling 10 students into all 3 courses...")
        for course in created_courses:
            for student in created_students:
                existing_enrollment = db.query(Enrollment).filter(
                    Enrollment.student_id == student.id,
                    Enrollment.course_id == course.id
                ).first()
                if not existing_enrollment:
                    enrollment = Enrollment(student_id=student.id, course_id=course.id, is_active=True)
                    db.add(enrollment)
            db.commit()
            print(f"  [OK] All 10 students enrolled in '{course.title}'")

        # 5. Create Sample Quizzes for each course
        for course in created_courses:
            existing_quiz = db.query(Quiz).filter(Quiz.course_id == course.id).first()
            if not existing_quiz:
                first_lesson = db.query(Lesson).filter(Lesson.course_id == course.id).first()
                if first_lesson:
                    quiz = Quiz(
                        title=f"{course.subject} Module Assessment",
                        description=f"Core assessment testing foundational concepts in {course.title}.",
                        status=QuizStatus.PUBLISHED,
                        time_limit_minutes=30,
                        max_attempts=3,
                        lesson_id=first_lesson.id,
                        course_id=course.id
                    )
                    db.add(quiz)
                    db.commit()
                    db.refresh(quiz)

                    # Add 2 questions to quiz
                    q1 = Question(is_banked=True, lesson_id=first_lesson.id)
                    db.add(q1)
                    db.flush()
                    qv1 = QuestionVersion(
                        question_id=q1.id,
                        question_text=f"Which key principle is fundamental to {course.subject}?",
                        question_type=QuestionType.MCQ,
                        options=["Option A (Correct)", "Option B", "Option C", "Option D"],
                        correct_answer="Option A (Correct)",
                        explanation="This option represents the core established scientific principle.",
                        default_points=5.0,
                        difficulty=Difficulty.MEDIUM,
                        cognitive_level=CognitiveLevel.UNDERSTAND,
                        teacher_approval_status=TeacherApprovalStatus.APPROVED,
                        source_type="manual"
                    )
                    db.add(qv1)
                    db.flush()

                    qq1 = QuizQuestion(quiz_id=quiz.id, question_version_id=qv1.id, order=1)
                    db.add(qq1)
                    db.commit()
                    print(f"  [OK] Created Quiz for '{course.title}'")

        print("\n[DONE] Custom User & Course Seeding Complete!")

    finally:
        db.close()

if __name__ == "__main__":
    seed_custom()
