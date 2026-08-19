"""
Unit Management API: CRUD endpoints for units within courses.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.models import User, UserRole, Course, Unit, Lesson, Material
from app.schemas import (
    UnitCreate, UnitUpdate, UnitReorderRequest, UnitResponse, UnitWithLessonsResponse,
    LessonResponse, MessageResponse
)
from app.auth import get_current_user, require_teacher, check_course_access

router = APIRouter()


@router.post("/", response_model=UnitResponse, status_code=status.HTTP_201_CREATED)
async def create_unit(
    unit_data: UnitCreate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Create a new unit inside a course."""
    course = db.query(Course).filter(Course.id == unit_data.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only add units to your own courses")

    unit = Unit(
        title=unit_data.title,
        description=unit_data.description,
        order=unit_data.order or 0,
        course_id=unit_data.course_id,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return _build_unit_response(unit, db)


@router.get("/course/{course_id}", response_model=List[UnitWithLessonsResponse])
async def list_units_for_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all units in a course with their nested lessons."""
    check_course_access(course_id, current_user, db)

    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc(), Unit.created_at.asc()).all()

    result = []
    for u in units:
        lesson_query = db.query(Lesson).filter(Lesson.unit_id == u.id)
        if current_user.role == UserRole.STUDENT:
            lesson_query = lesson_query.filter(Lesson.is_published == True)
        
        lessons = lesson_query.order_by(Lesson.order.asc()).all()

        lesson_responses = []
        for l in lessons:
            mat_count = db.query(func.count(Material.id)).filter(Material.lesson_id == l.id).scalar()
            lesson_responses.append(LessonResponse(
                id=l.id,
                title=l.title,
                description=l.description,
                order=l.order,
                is_published=l.is_published,
                course_id=l.course_id,
                unit_id=l.unit_id,
                created_at=l.created_at,
                material_count=mat_count,
            ))

        u_res = _build_unit_response(u, db)
        result.append(UnitWithLessonsResponse(
            id=u_res.id,
            title=u_res.title,
            description=u_res.description,
            order=u_res.order,
            course_id=u_res.course_id,
            created_at=u_res.created_at,
            lesson_count=len(lessons),
            lessons=lesson_responses,
        ))

    return result


@router.put("/course/{course_id}/reorder", response_model=List[UnitResponse])
async def reorder_units(
    course_id: int,
    reorder_data: UnitReorderRequest,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """
    Reorder units within a course based on an ordered list of unit IDs.
    Updates the 'order' integer for each unit to reflect its new position (1-indexed).
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only reorder units in your own courses")

    course_units = {u.id: u for u in db.query(Unit).filter(Unit.course_id == course_id).all()}

    for order_idx, unit_id in enumerate(reorder_data.unit_ids):
        if unit_id in course_units:
            course_units[unit_id].order = order_idx + 1

    db.commit()

    updated_units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc(), Unit.created_at.asc()).all()
    return [_build_unit_response(u, db) for u in updated_units]


@router.get("/{unit_id}", response_model=UnitResponse)
async def get_unit(
    unit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific unit by ID."""
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    check_course_access(unit.course_id, current_user, db)
    return _build_unit_response(unit, db)


@router.patch("/{unit_id}", response_model=UnitResponse)
async def update_unit(
    unit_id: int,
    unit_data: UnitUpdate,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Update a unit's title, description, or order."""
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    course = db.query(Course).filter(Course.id == unit.course_id).first()
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit units in your own courses")

    update_data = unit_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(unit, key, value)
    db.commit()
    db.refresh(unit)
    return _build_unit_response(unit, db)


@router.delete("/{unit_id}", response_model=MessageResponse)
async def delete_unit(
    unit_id: int,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    """Delete a unit and all its nested lessons cleanly."""
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")

    course = db.query(Course).filter(Course.id == unit.course_id).first()
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete units in your own courses")

    unit_title = unit.title

    try:
        from app.models import Material, MaterialFlag, MaterialNote, StudentMaterialProgress, Quiz, QuizAttempt, Answer, QuizQuestion, IntegrityEvent, Assignment, AssignmentSubmission, SubmissionFile

        lessons = db.query(Lesson).filter(Lesson.unit_id == unit_id).all()
        for les in lessons:
            materials = db.query(Material).filter(Material.lesson_id == les.id).all()
            for mat in materials:
                db.query(MaterialFlag).filter(MaterialFlag.material_id == mat.id).delete(synchronize_session=False)
                db.query(MaterialNote).filter(MaterialNote.material_id == mat.id).delete(synchronize_session=False)
                db.query(StudentMaterialProgress).filter(StudentMaterialProgress.material_id == mat.id).delete(synchronize_session=False)
                db.delete(mat)
            
            quizzes = db.query(Quiz).filter(Quiz.lesson_id == les.id).all()
            for qz in quizzes:
                attempts = db.query(QuizAttempt).filter(QuizAttempt.quiz_id == qz.id).all()
                for att in attempts:
                    db.query(Answer).filter(Answer.attempt_id == att.id).delete(synchronize_session=False)
                    db.query(IntegrityEvent).filter(IntegrityEvent.attempt_id == att.id).delete(synchronize_session=False)
                    db.delete(att)
                db.query(QuizQuestion).filter(QuizQuestion.quiz_id == qz.id).delete(synchronize_session=False)
                db.delete(qz)

            assignments = db.query(Assignment).filter(Assignment.lesson_id == les.id).all()
            for asgn in assignments:
                submissions = db.query(AssignmentSubmission).filter(AssignmentSubmission.assignment_id == asgn.id).all()
                for sub in submissions:
                    db.query(SubmissionFile).filter(SubmissionFile.submission_id == sub.id).delete(synchronize_session=False)
                    db.delete(sub)
                db.delete(asgn)

            db.delete(les)
        db.flush()

        db.delete(unit)
        db.commit()
        return {"message": f"Unit '{unit_title}' has been deleted", "success": True}
    except Exception as err:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete unit: {str(err)}")


def _build_unit_response(unit: Unit, db: Session) -> UnitResponse:
    lesson_count = db.query(func.count(Lesson.id)).filter(Lesson.unit_id == unit.id).scalar()
    return UnitResponse(
        id=unit.id,
        title=unit.title,
        description=unit.description,
        order=unit.order,
        course_id=unit.course_id,
        created_at=unit.created_at,
        lesson_count=lesson_count,
    )
