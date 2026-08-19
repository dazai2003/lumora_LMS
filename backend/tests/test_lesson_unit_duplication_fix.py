from app.database import SessionLocal
from app.models import Course, Unit, Lesson, User, UserRole
from app.api.lessons import _build_lesson_response

def test_lesson_response_unit_id_inclusion():
    """Verify that _build_lesson_response includes unit_id so frontend does not duplicate lessons."""
    db = SessionLocal()
    try:
        # Get or create course & unit
        course = db.query(Course).first()
        unit = db.query(Unit).filter(Unit.course_id == course.id).first()
        if not unit:
            unit = Unit(title="Test Unit Duplication Fix", course_id=course.id, order=1)
            db.add(unit)
            db.commit()
            db.refresh(unit)

        # Create lesson with unit_id
        lesson = Lesson(
            title="Non-Duplicated Lesson Test",
            description="Testing unit_id in response",
            order=1,
            course_id=course.id,
            unit_id=unit.id,
        )
        db.add(lesson)
        db.commit()
        db.refresh(lesson)

        # Call response builder
        response = _build_lesson_response(lesson, db)

        assert response.unit_id == unit.id
        assert response.unit_id is not None
        print(f"[SUCCESS] _build_lesson_response correctly returns unit_id = {response.unit_id}! Lesson will NOT duplicate in Unassigned section.")
    finally:
        db.close()

if __name__ == "__main__":
    test_lesson_response_unit_id_inclusion()
