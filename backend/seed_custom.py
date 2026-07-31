import os
from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app.models import User, UserRole, Course, Lesson, Enrollment, Quiz, QuizStatus, Question, QuestionType
from app.auth import hash_password

def seed_database():
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    print("Recreating all tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("Creating Admin...")
        admin = User(
            email="admin@fdp.com",
            hashed_password=hash_password("admin123"),
            full_name="Institution Owner",
            role=UserRole.ADMIN
        )
        db.add(admin)

        print("Creating Teachers...")
        teachers_data = [
            {"name": "Amara Perera", "email": "amara@fdp.com", "course": "Advanced Biology"},
            {"name": "Sunil Jayawardena", "email": "sunil@fdp.com", "course": "Organic Chemistry"},
            {"name": "Kamal Rathnayake", "email": "kamal@fdp.com", "course": "Physics Mechanisms"}
        ]
        
        teacher_users = []
        for t in teachers_data:
            user = User(
                email=t["email"],
                hashed_password=hash_password("teacher123"),
                full_name=t["name"],
                role=UserRole.TEACHER
            )
            db.add(user)
            teacher_users.append(user)
        
        db.commit()

        print("Creating Courses, Lessons, and Quizzes...")
        courses = []
        for i, t in enumerate(teacher_users):
            course = Course(
                title=teachers_data[i]["course"],
                description=f"Comprehensive course for {teachers_data[i]['course']}",
                teacher_id=t.id
            )
            db.add(course)
            db.commit()
            db.refresh(course)
            courses.append(course)

            # Add lessons (ensure they are published!)
            lesson1 = Lesson(course_id=course.id, title="Introduction", description="Welcome to the course", order=1, is_published=True)
            lesson2 = Lesson(course_id=course.id, title="Core Concepts", description="Diving deep into the main topics", order=2, is_published=True)
            db.add_all([lesson1, lesson2])
            db.commit()
            db.refresh(lesson1)

            # Add a quiz to the first lesson
            quiz = Quiz(
                title=f"Assessment: {lesson1.title}", 
                lesson_id=lesson1.id, 
                status=QuizStatus.PUBLISHED, 
                is_ai_generated=False,
                time_limit_minutes=15
            )
            db.add(quiz)
            db.commit()
            db.refresh(quiz)
            
            # Add a question to the quiz
            question = Question(
                quiz_id=quiz.id, 
                question_text="What is the primary focus of this subject?", 
                question_type=QuestionType.MCQ, 
                options=["Science", "Arts", "Maths", "History"], 
                correct_answer="Science", 
                points=10
            )
            db.add(question)
            db.commit()

        print("Creating Students and Enrollments...")
        student_names = [
            "Nimal Silva", "Kasun de Silva", "Chamal Rajapaksha", 
            "Saman Kumara", "Nuwan Pradeep", "Pathum Nissanka",
            "Kusal Mendis", "Dasun Shanaka", "Dhananjaya de Silva", "Wanindu Hasaranga"
        ]
        
        for i, name in enumerate(student_names, 1):
            student = User(
                email=f"student{i}@fdp.com",
                hashed_password=hash_password("student123"),
                full_name=name,
                role=UserRole.STUDENT
            )
            db.add(student)
            db.commit()
            db.refresh(student)

            # Enroll in all courses
            for c in courses:
                enroll = Enrollment(student_id=student.id, course_id=c.id)
                db.add(enroll)
            db.commit()

        print("Database seeding completed successfully!")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
