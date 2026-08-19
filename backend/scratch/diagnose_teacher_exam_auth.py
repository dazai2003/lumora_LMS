import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models import User, Course, ALExam, UserRole

db = SessionLocal()

print("--- USERS ---")
users = db.query(User).all()
for u in users:
    print(f"User ID: {u.id}, Name: {getattr(u, 'full_name', '')}, Email: {u.email}, Role: {u.role}")

print("\n--- COURSES ---")
courses = db.query(Course).all()
for c in courses:
    print(f"Course ID: {c.id}, Title: {c.title}, Teacher ID: {c.teacher_id}")

print("\n--- RECENT AL EXAMS ---")
exams = db.query(ALExam).order_by(ALExam.id.desc()).limit(10).all()
for e in exams:
    print(f"Exam ID: {e.id}, Title: {e.title}, Course ID: {e.course_id}, Exam Type: {e.exam_type}")

db.close()
