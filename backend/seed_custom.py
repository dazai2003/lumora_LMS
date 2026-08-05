import os
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.database import engine, Base, SessionLocal
from app.models import (
    User, UserRole, Course, Enrollment,
    Subscription, Payment, PaymentStatus, SubscriptionStatus, PaymentPlanType
)
from app.auth import hash_password

def seed_database():
    print("[1/5] Performing clean database wipe...")
    Base.metadata.drop_all(bind=engine)
    print("[2/5] Recreating clean database tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print("[3/5] Creating System Admin Account...")
        admin = User(
            email="admin@fdp.com",
            hashed_password=hash_password("admin123"),
            full_name="System Administrator",
            role=UserRole.ADMIN,
            is_active=True
        )
        db.add(admin)

        print("[4/5] Creating 4 Dedicated Sri Lankan Teachers & Clean Stream Courses...")
        teachers_data = [
            {"name": "Dr. Amara Perera", "email": "amara@fdp.com", "course_title": "Advanced Level Biology", "subject": "Biology"},
            {"name": "Prof. Sunil Jayawardena", "email": "sunil@fdp.com", "course_title": "Organic Chemistry & Synthesis", "subject": "Chemistry"},
            {"name": "Dr. Kamal Rathnayake", "email": "kamal@fdp.com", "course_title": "Physics Mechanisms & Waves", "subject": "Physics"},
            {"name": "Mr. Nimal Wickramasinghe", "email": "nimal_maths@fdp.com", "course_title": "Combined Mathematics Theory", "subject": "Combined Mathematics"}
        ]
        
        teacher_users = []
        courses = []

        for t in teachers_data:
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
            teacher_users.append(user)

            # Create clean course (0 mock lessons, 0 mock quizzes, 0 mock materials)
            course = Course(
                title=t["course_title"],
                description=f"Official Sri Lankan Advanced Level syllabus course for {t['subject']}. Taught by {t['name']}.",
                subject=t["subject"],
                teacher_id=user.id,
                monthly_price=2500.0,
                full_price=25000.0
            )
            db.add(course)
            db.commit()
            db.refresh(course)
            courses.append(course)

        # Map courses by subject name
        bio_course = courses[0]   # Biology
        chem_course = courses[1]  # Chemistry
        phy_course = courses[2]   # Physics
        maths_course = courses[3] # Combined Mathematics

        print("[5/5] Creating 10 Sri Lankan Students, Stream Enrollments & Tuition Subscriptions...")
        student_data = [
            # 5 Bio Science Stream Students (Biology + Chemistry + Physics)
            ("student1@fdp.com", "Nimal Fernando", [bio_course, chem_course, phy_course], "monthly"),
            ("student2@fdp.com", "Sanduni Silva", [bio_course, chem_course, phy_course], "quarterly"),
            ("student3@fdp.com", "Ruwan Jayasinghe", [bio_course, chem_course, phy_course], "annual"),
            ("student4@fdp.com", "Kasun Perera", [bio_course, chem_course, phy_course], "monthly"),
            ("student5@fdp.com", "Dinithi Wickramasinghe", [bio_course, chem_course, phy_course], "quarterly"),

            # 5 Physical Science / Maths Stream Students (Combined Mathematics + Physics + Chemistry)
            ("student6@fdp.com", "Pathum Nissanka", [maths_course, phy_course, chem_course], "monthly"),
            ("student7@fdp.com", "Kusal Mendis", [maths_course, phy_course, chem_course], "annual"),
            ("student8@fdp.com", "Dhananjaya de Silva", [maths_course, phy_course, chem_course], "monthly"),
            ("student9@fdp.com", "Wanindu Hasaranga", [maths_course, phy_course, chem_course], "quarterly"),
            ("student10@fdp.com", "Dasun Shanaka", [maths_course, phy_course, chem_course], "monthly"),
        ]

        now = datetime.utcnow()

        for idx, (email, name, enrolled_stream_courses, pass_type) in enumerate(student_data, 1):
            student = User(
                email=email,
                hashed_password=hash_password("student123"),
                full_name=name,
                role=UserRole.STUDENT,
                is_active=True
            )
            db.add(student)
            db.commit()
            db.refresh(student)

            for course in enrolled_stream_courses:
                # 1. Enrollment into Stream Subject
                enroll = Enrollment(student_id=student.id, course_id=course.id)
                db.add(enroll)

                # 2. Tuition Subscription
                sub_status = SubscriptionStatus.OVERDUE if (idx == 4 and course.id == bio_course.id) else SubscriptionStatus.ACTIVE
                period_end = now - timedelta(days=2) if sub_status == SubscriptionStatus.OVERDUE else now + timedelta(days=28)
                
                sub = Subscription(
                    student_id=student.id,
                    course_id=course.id,
                    status=sub_status,
                    current_period_end=period_end
                )
                db.add(sub)

                # 3. Completed Payment Transaction for Official Receipt
                amount = 6000.0 if pass_type == "monthly" else 16200.0 if pass_type == "quarterly" else 54000.0
                pay_status = PaymentStatus.OVERDUE if sub_status == SubscriptionStatus.OVERDUE else PaymentStatus.COMPLETED

                payment = Payment(
                    student_id=student.id,
                    course_id=course.id,
                    amount=amount / 3, # Allocated subject portion
                    payment_plan=PaymentPlanType.MONTHLY if pass_type == "monthly" else PaymentPlanType.ONE_TIME,
                    status=pay_status,
                    created_at=now - timedelta(days=4 * idx)
                )
                db.add(payment)

            db.commit()

        print("\n[SUCCESS] Clean database reset complete!")
        print("Accounts Created:")
        print("  - Admin: admin@fdp.com / admin123")
        print("  - Bio Teacher: amara@fdp.com / teacher123")
        print("  - Chem Teacher: sunil@fdp.com / teacher123")
        print("  - Physics Teacher: kamal@fdp.com / teacher123")
        print("  - Combined Maths Teacher: nimal_maths@fdp.com / teacher123")
        print("  - 10 Students: student1@fdp.com to student10@fdp.com / student123")
        print("  - 4 Clean Courses ready for uploading your real content!\n")

    except Exception as e:
        print(f"[ERROR] Database reset failed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
