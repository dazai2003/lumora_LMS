"""
Clean Stream Course Seeding Script:
1. Performs a full clean sweep of all content (lessons, quizzes, materials, assignments, submissions, attempts).
2. Cleans up any non-stream teachers/courses (e.g. teacher@fdp.com).
3. Configures 3 clean course shells (0 lessons, 0 quizzes) with exact assigned teachers:
   - Advanced Level Biology (Dr.Amara Perera / amara@fdp.com)
   - Advanced Level Chemistry (Sunil Jayawardena / sunil@fdp.com)
   - Advanced Level Physics (Dr.Kamal Rathnayake / kamal@fdp.com)
4. Enrolls all 10 Biological Science Stream Students into ALL 3 courses.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import SessionLocal, engine
from app.models import User, UserRole, Course, Enrollment
from app.auth import hash_password

TABLES_TO_CLEAR = [
    "document_extractions",
    "submission_section_feedbacks",
    "submission_suggestions",
    "submission_comments",
    "submission_versions",
    "submission_annotations",
    "assignment_resources",
    "plagiarism_reports",
    "rubric_score_details",
    "rubric_criteria",
    "assignment_rubrics",
    "submission_histories",
    "submission_files",
    "assignment_submissions",
    "group_members",
    "assignment_groups",
    "assignment_files",
    "assignments",
    "rubric_scores",
    "grading_rubrics",
    "question_analytics",
    "quiz_pool_rules",
    "question_pool_items",
    "question_pools",
    "audit_logs",
    "processing_jobs",
    "notifications",
    "ai_logs",
    "payments",
    "subscriptions",
    "activity_logs",
    "direct_messages",
    "teacher_questions",
    "system_ai_configs",
    "material_ai_insights",
    "student_learning_profiles",
    "student_recommendations",
    "ai_responses",
    "student_questions",
    "ai_tutor_sessions",
    "integrity_events",
    "answers",
    "quiz_attempts",
    "quiz_questions",
    "question_versions",
    "questions",
    "quizzes",
    "subtopics",
    "topics",
    "subjects",
    "student_material_progress",
    "material_notes",
    "material_flags",
    "materials",
    "lessons",
    "enrollments",
    "courses",
    "password_reset_requests",
]

def seed_clean_stream():
    db = SessionLocal()
    try:
        print("[CLEAN STREAM] Truncating all content, lesson, quiz, and course tables...")
        with engine.connect() as conn:
            tables_str = ", ".join(f'"{t}"' for t in TABLES_TO_CLEAR)
            try:
                conn.execute(text(f"TRUNCATE TABLE {tables_str} CASCADE;"))
                conn.commit()
                print("  [OK] Successfully truncated all content tables.")
            except Exception as e:
                print(f"  [WARN] Batch truncate fallback: {e}")
                for table in TABLES_TO_CLEAR:
                    try:
                        conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE;'))
                        conn.commit()
                    except Exception:
                        pass

        # Remove any extra demo users not in the requested list
        allowed_emails = {
            "amara@fdp.com",
            "sunil@fdp.com",
            "kamal@fdp.com",
            "student1@fdp.com",
            "student2@fdp.com",
            "student3@fdp.com",
            "student4@fdp.com",
            "student5@fdp.com",
            "student6@fdp.com",
            "student7@fdp.com",
            "student8@fdp.com",
            "student9@fdp.com",
            "student10@fdp.com",
        }
        
        extra_users = db.query(User).filter(User.email.not_in(list(allowed_emails))).all()
        for u in extra_users:
            db.delete(u)
        db.commit()
        print(f"  [OK] Cleaned up {len(extra_users)} extra non-stream users.")

        # 2. Setup 3 Teachers & 3 Clean Courses (0 lessons, 0 quizzes)
        stream_courses_data = [
            {
                "email": "amara@fdp.com",
                "name": "Dr.Amara Perera",
                "course_title": "Advanced Level Biology",
                "subject": "Biology",
                "description": "Sri Lankan G.C.E A-Level Biology curriculum covering Cell Biology, Genetics, Plant Physiology, and Human Anatomy."
            },
            {
                "email": "sunil@fdp.com",
                "name": "Sunil Jayawardena",
                "course_title": "Advanced Level Chemistry",
                "subject": "Chemistry",
                "description": "G.C.E A-Level Chemistry covering General, Physical, Inorganic, and Organic Chemistry with Industrial Applications."
            },
            {
                "email": "kamal@fdp.com",
                "name": "Dr.Kamal Rathnayake",
                "course_title": "Advanced Level Physics",
                "subject": "Physics",
                "description": "Complete G.C.E A-Level Physics covering Mechanics, Oscillations and Waves, Electricity, Thermal Physics, and Modern Physics."
            }
        ]

        created_courses = []

        for cdata in stream_courses_data:
            teacher = db.query(User).filter(User.email == cdata["email"]).first()
            if not teacher:
                teacher = User(
                    email=cdata["email"],
                    hashed_password=hash_password("teacher123"),
                    full_name=cdata["name"],
                    role=UserRole.TEACHER,
                    is_active=True
                )
                db.add(teacher)
                db.commit()
                db.refresh(teacher)
                print(f"  [OK] Created Teacher: {cdata['name']} ({cdata['email']})")
            else:
                teacher.full_name = cdata["name"]
                teacher.hashed_password = hash_password("teacher123")
                db.commit()

            course = Course(
                title=cdata["course_title"],
                description=cdata["description"],
                subject=cdata["subject"],
                teacher_id=teacher.id,
                is_active=True
            )
            db.add(course)
            db.commit()
            db.refresh(course)
            created_courses.append(course)
            print(f"  [OK] Created Clean Course Shell: '{course.title}' (Teacher: {teacher.full_name})")

        # 3. Setup 10 Biological Science Stream Students
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
            else:
                student.full_name = s_name
                student.hashed_password = hash_password("student123")
                db.commit()
            created_students.append(student)

        print(f"  [OK] 10 Biological Science Stream Students verified.")

        # 4. Enroll all 10 students into all 3 courses
        print("\n[ENROLLMENT] Enrolling 10 students into all 3 courses...")
        for course in created_courses:
            for student in created_students:
                enrollment = Enrollment(student_id=student.id, course_id=course.id, is_active=True)
                db.add(enrollment)
            db.commit()
            print(f"  [OK] Enrolled 10 students into '{course.title}'")

        print("\n[DONE] Clean stream course seeding finished successfully!")

    finally:
        db.close()

if __name__ == "__main__":
    seed_clean_stream()
