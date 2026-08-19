"""
Lesson Management API: CRUD for lessons within courses.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.models import User, UserRole, Course, Lesson, Material
from app.schemas import LessonCreate, LessonUpdate, LessonResponse, MessageResponse
from app.auth import get_current_user, require_admin_or_teacher, check_course_access

router = APIRouter()


@router.post("/", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    lesson_data: LessonCreate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Create a new lesson inside a course."""
    course = db.query(Course).filter(Course.id == lesson_data.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only add lessons to your own courses")

    lesson = Lesson(
        title=lesson_data.title,
        description=lesson_data.description,
        order=lesson_data.order,
        course_id=lesson_data.course_id,
        unit_id=lesson_data.unit_id,
    )
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return _build_lesson_response(lesson, db)


@router.get("/course/{course_id}", response_model=List[LessonResponse])
async def list_lessons(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all lessons in a course, ordered by 'order' field."""
    check_course_access(course_id, current_user, db)
    
    query = db.query(Lesson).filter(Lesson.course_id == course_id)

    # Students only see published lessons
    if current_user.role == UserRole.STUDENT:
        query = query.filter(Lesson.is_published == True)

    lessons = query.order_by(Lesson.order.asc()).all()
    return [_build_lesson_response(l, db) for l in lessons]


@router.get("/{lesson_id}", response_model=LessonResponse)
async def get_lesson(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific lesson by ID."""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
        
    check_course_access(lesson.course_id, current_user, db)
    
    return _build_lesson_response(lesson, db)


@router.patch("/{lesson_id}", response_model=LessonResponse)
async def update_lesson(
    lesson_id: int,
    lesson_data: LessonUpdate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Update a lesson."""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit lessons in your own courses")

    update_data = lesson_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(lesson, key, value)
    db.commit()
    db.refresh(lesson)
    return _build_lesson_response(lesson, db)


@router.delete("/{lesson_id}", response_model=MessageResponse)
async def delete_lesson(
    lesson_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Delete a lesson and all its dependent materials/assessments cleanly."""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete lessons in your own courses")

    lesson_title = lesson.title

    try:
        from app.models import (
            Material, MaterialFlag, MaterialNote, StudentMaterialProgress,
            Quiz, QuizAttempt, Answer, QuizQuestion, IntegrityEvent,
            Assignment, AssignmentSubmission, SubmissionFile, Question
        )

        # 1. Unlink questions referencing this lesson
        db.query(Question).filter(Question.lesson_id == lesson_id).update({"lesson_id": None}, synchronize_session=False)

        # 2. Delete materials & student progress
        materials = db.query(Material).filter(Material.lesson_id == lesson_id).all()
        for mat in materials:
            db.query(MaterialFlag).filter(MaterialFlag.material_id == mat.id).delete(synchronize_session=False)
            db.query(MaterialNote).filter(MaterialNote.material_id == mat.id).delete(synchronize_session=False)
            db.query(StudentMaterialProgress).filter(StudentMaterialProgress.material_id == mat.id).delete(synchronize_session=False)
            db.delete(mat)
        db.flush()

        # 3. Delete quizzes & attempts
        quizzes = db.query(Quiz).filter(Quiz.lesson_id == lesson_id).all()
        for qz in quizzes:
            attempts = db.query(QuizAttempt).filter(QuizAttempt.quiz_id == qz.id).all()
            for att in attempts:
                db.query(Answer).filter(Answer.attempt_id == att.id).delete(synchronize_session=False)
                db.query(IntegrityEvent).filter(IntegrityEvent.attempt_id == att.id).delete(synchronize_session=False)
                db.delete(att)
            db.query(QuizQuestion).filter(QuizQuestion.quiz_id == qz.id).delete(synchronize_session=False)
            db.delete(qz)
        db.flush()

        # 4. Delete assignments & submissions
        assignments = db.query(Assignment).filter(Assignment.lesson_id == lesson_id).all()
        for asgn in assignments:
            submissions = db.query(AssignmentSubmission).filter(AssignmentSubmission.assignment_id == asgn.id).all()
            for sub in submissions:
                db.query(SubmissionFile).filter(SubmissionFile.submission_id == sub.id).delete(synchronize_session=False)
                db.delete(sub)
            db.delete(asgn)
        db.flush()

        # Delete lesson
        db.delete(lesson)
        db.commit()
        return {"message": f"Lesson '{lesson_title}' has been deleted", "success": True}
    except Exception as err:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete lesson: {str(err)}")


def _build_lesson_response(lesson: Lesson, db: Session) -> LessonResponse:
    material_count = db.query(func.count(Material.id)).filter(Material.lesson_id == lesson.id).scalar()
    return LessonResponse(
        id=lesson.id,
        title=lesson.title,
        description=lesson.description,
        order=lesson.order,
        is_published=lesson.is_published,
        course_id=lesson.course_id,
        unit_id=lesson.unit_id,
        created_at=lesson.created_at,
        material_count=material_count,
    )
