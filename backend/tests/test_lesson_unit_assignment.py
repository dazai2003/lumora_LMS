from app.database import SessionLocal
from app.models import Course, Unit, Lesson, User, UserRole

def test_create_lesson_assigned_to_unit():
    """Verify that creating a lesson inside a unit sets unit_id correctly."""
    db = SessionLocal()
    try:
        # Get or create course
        course = db.query(Course).first()
        if not course:
            user = User(full_name="Unit Teacher", email="unitteacher@test.com", password_hash="hash", role=UserRole.TEACHER)
            db.add(user)
            db.commit()
            db.refresh(user)

            course = Course(title="Unit Test Course", instructor_id=user.id)
            db.add(course)
            db.commit()
            db.refresh(course)

        # Create unit
        unit = Unit(title="Test Unit 101", course_id=course.id, order=1)
        db.add(unit)
        db.commit()
        db.refresh(unit)

        # Simulate lesson creation payload with unit_id
        lesson = Lesson(
            title="Cell Respiration Step 1",
            description="Introduction to glycolysis",
            order=1,
            course_id=course.id,
            unit_id=unit.id,
        )
        db.add(lesson)
        db.commit()
        db.refresh(lesson)

        assert lesson.unit_id == unit.id
        print(f"[SUCCESS] Lesson '{lesson.title}' correctly assigned to Unit ID #{unit.id}!")
    finally:
        db.close()

if __name__ == "__main__":
    test_create_lesson_assigned_to_unit()
