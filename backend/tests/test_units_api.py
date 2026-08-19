"""
Unit Tests for Lumora Units API: Ordering & Move Up/Down Reordering.
"""

import pytest
from app.models import Course, Unit, User, UserRole
from app.database import SessionLocal


def test_unit_creation_and_reordering():
    db = SessionLocal()
    try:
        # Create a test teacher
        teacher = db.query(User).filter(User.email == "test_unit_teacher@lumora.test").first()
        if not teacher:
            teacher = User(
                email="test_unit_teacher@lumora.test",
                full_name="Unit Test Teacher",
                hashed_password="fakehashforunittests",
                role=UserRole.TEACHER,
                is_active=True,
            )
            db.add(teacher)
            db.commit()
            db.refresh(teacher)

        # Create a test course
        course = Course(
            title="A/L Biology Unit Sequencing Course",
            description="Testing up/down unit movement",
            teacher_id=teacher.id,
            is_active=True,
        )
        db.add(course)
        db.commit()
        db.refresh(course)

        # Create 3 units: Unit A (order 1), Unit B (order 2), Unit C (order 3)
        unit_a = Unit(title="Unit A - Cell Structure", order=1, course_id=course.id)
        unit_b = Unit(title="Unit B - Plant Physiology", order=2, course_id=course.id)
        unit_c = Unit(title="Unit C - Genetics", order=3, course_id=course.id)
        db.add_all([unit_a, unit_b, unit_c])
        db.commit()
        db.refresh(unit_a)
        db.refresh(unit_b)
        db.refresh(unit_c)

        # Initial order check
        initial_units = db.query(Unit).filter(Unit.course_id == course.id).order_by(Unit.order.asc()).all()
        assert [u.title for u in initial_units] == [
            "Unit A - Cell Structure",
            "Unit B - Plant Physiology",
            "Unit C - Genetics"
        ]

        # Simulate teacher moving Unit B (2nd unit) to 1st place: [unit_b.id, unit_a.id, unit_c.id]
        new_order_ids = [unit_b.id, unit_a.id, unit_c.id]
        course_units = {u.id: u for u in db.query(Unit).filter(Unit.course_id == course.id).all()}
        for order_idx, u_id in enumerate(new_order_ids):
            if u_id in course_units:
                course_units[u_id].order = order_idx + 1
        db.commit()

        # Verify new sequence from database
        reordered_units = db.query(Unit).filter(Unit.course_id == course.id).order_by(Unit.order.asc()).all()
        assert [u.title for u in reordered_units] == [
            "Unit B - Plant Physiology",
            "Unit A - Cell Structure",
            "Unit C - Genetics"
        ]
        assert reordered_units[0].order == 1
        assert reordered_units[0].id == unit_b.id
        assert reordered_units[1].order == 2
        assert reordered_units[1].id == unit_a.id
        assert reordered_units[2].order == 3
        assert reordered_units[2].id == unit_c.id

    finally:
        # Cleanup
        if 'course' in locals() and course.id:
            db.query(Unit).filter(Unit.course_id == course.id).delete()
            db.delete(course)
            db.commit()
        if 'teacher' in locals() and teacher.id:
            db.delete(teacher)
            db.commit()
        db.close()
