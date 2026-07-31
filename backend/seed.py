"""
Database seeder: Creates a default admin account and optionally demo data.

Usage:
    python seed.py                # Create admin only
    python seed.py --demo         # Create admin + demo teacher/students/courses
"""
import sys
import os

# Add the backend directory to path
sys.path.insert(0, os.path.dirname(__file__))

from app.database import engine, SessionLocal, Base
from app.models import User, UserRole, Course, Lesson, Enrollment
from app.auth import hash_password


def seed_admin(db):
    """Create the default admin account if it doesn't exist."""
    admin = db.query(User).filter(User.email == "admin@fdp.com").first()
    if not admin:
        admin = User(
            email="admin@fdp.com",
            hashed_password=hash_password("admin123"),
            full_name="System Administrator",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print("[OK] Admin account created: admin@fdp.com / admin123")
    else:
        print("[INFO] Admin account already exists.")
    return admin


def seed_demo_data(db):
    """Create demo teacher, students, courses, and lessons."""
    # Demo Teacher
    teacher = db.query(User).filter(User.email == "teacher@fdp.com").first()
    if not teacher:
        teacher = User(
            email="teacher@fdp.com",
            hashed_password=hash_password("teacher123"),
            full_name="Dr. Kamal Perera",
            role=UserRole.TEACHER,
            is_active=True,
        )
        db.add(teacher)
        db.commit()
        db.refresh(teacher)
        print("[OK] Demo teacher created: teacher@fdp.com / teacher123")

    # Demo Students
    student_data = [
        ("student1@fdp.com", "Nimal Fernando"),
        ("student2@fdp.com", "Sanduni Silva"),
        ("student3@fdp.com", "Ruwan Jayasinghe"),
    ]
    students = []
    for email, name in student_data:
        student = db.query(User).filter(User.email == email).first()
        if not student:
            student = User(
                email=email,
                hashed_password=hash_password("student123"),
                full_name=name,
                role=UserRole.STUDENT,
                is_active=True,
            )
            db.add(student)
            db.commit()
            db.refresh(student)
            print(f"[OK] Demo student created: {email} / student123")
        students.append(student)

    # Demo Course
    course = db.query(Course).filter(Course.title == "Advanced Level Physics").first()
    if not course:
        course = Course(
            title="Advanced Level Physics",
            description="Complete A/L Physics course covering Mechanics, Waves, Electricity, and Modern Physics. Designed for students preparing for the Sri Lankan A/L examination.",
            subject="Physics",
            teacher_id=teacher.id,
        )
        db.add(course)
        db.commit()
        db.refresh(course)
        print(f"[OK] Demo course created: {course.title}")

        # Demo Lessons
        lessons = [
            ("Introduction to Mechanics", "Newton's Laws of Motion and their applications", 1),
            ("Kinematics", "Motion in one and two dimensions", 2),
            ("Work, Energy and Power", "Conservation of energy and work-energy theorem", 3),
            ("Waves and Oscillations", "Simple harmonic motion and wave properties", 4),
        ]
        for title, desc, order in lessons:
            lesson = Lesson(
                title=title,
                description=desc,
                order=order,
                is_published=True,
                course_id=course.id,
            )
            db.add(lesson)
        db.commit()
        print(f"[OK] Demo lessons created for {course.title}")

        # Enroll students
        for student in students:
            enrollment = Enrollment(student_id=student.id, course_id=course.id)
            db.add(enrollment)
        db.commit()
        print(f"[OK] Demo students enrolled in {course.title}")

    print("\n[DONE] Demo data seeding complete!")


def main():
    # Create tables
    Base.metadata.create_all(bind=engine)
    print("[DB] Database tables created/verified.\n")

    db = SessionLocal()
    try:
        seed_admin(db)

        if "--demo" in sys.argv:
            print("\n[SEED] Seeding demo data...\n")
            seed_demo_data(db)
        else:
            print("\nTip: Run 'python seed.py --demo' to also create demo teacher/students/courses.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
