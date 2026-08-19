"""
Course Management API: CRUD for courses, enrollment handling.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from app.database import get_db
from app.models import User, UserRole, Course, Enrollment, Lesson
from app.schemas import (
    CourseCreate, CourseUpdate, CourseResponse, CourseListResponse,
    EnrollmentCreate, EnrollmentResponse, MessageResponse,
)
from app.auth import get_current_user, require_admin_or_teacher, require_admin

router = APIRouter()


def _build_course_response(course: Course, db: Session) -> CourseResponse:
    lesson_count = db.query(func.count(Lesson.id)).filter(Lesson.course_id == course.id).scalar()
    student_count = db.query(func.count(Enrollment.id)).filter(
        Enrollment.course_id == course.id, Enrollment.is_active == True
    ).scalar()
    return CourseResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        subject=course.subject,
        cover_image=course.cover_image,
        is_active=course.is_active,
        teacher_id=course.teacher_id,
        lesson_count=lesson_count,
        student_count=student_count,
    )


# ──────────────────────────────────────────────
# Course CRUD
# ──────────────────────────────────────────────

@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    course_data: CourseCreate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Create a new course. Teachers and admins only."""
    
    # If admin creates a course, they can assign a teacher. Otherwise, it defaults to the current user.
    assigned_teacher_id = current_user.id
    if current_user.role == UserRole.ADMIN and course_data.teacher_id:
        assigned_teacher_id = course_data.teacher_id

    course = Course(
        title=course_data.title,
        description=course_data.description,
        subject=course_data.subject,
        teacher_id=assigned_teacher_id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    return _build_course_response(course, db)


@router.get("", response_model=List[CourseListResponse])
async def list_courses(
    search: Optional[str] = None,
    subject: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List courses.
    - Admin: sees all courses
    - Teacher: sees own courses
    - Student: sees active courses (for browsing/enrollment)
    """
    query = db.query(Course)

    if current_user.role == UserRole.TEACHER:
        query = query.filter(Course.teacher_id == current_user.id)
    elif current_user.role == UserRole.STUDENT:
        query = query.filter(Course.is_active == True)

    if search:
        query = query.filter(Course.title.ilike(f"%{search}%"))
    if subject:
        query = query.filter(Course.subject.ilike(f"%{subject}%"))

    courses = query.order_by(Course.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for c in courses:
        lesson_count = db.query(func.count(Lesson.id)).filter(Lesson.course_id == c.id).scalar()
        student_count = db.query(func.count(Enrollment.id)).filter(
            Enrollment.course_id == c.id, Enrollment.is_active == True
        ).scalar()
        result.append(CourseListResponse(
            id=c.id,
            title=c.title,
            description=c.description,
            subject=c.subject,
            cover_image=c.cover_image,
            is_active=c.is_active,
            teacher_name=c.teacher.full_name if c.teacher else None,
            teacher_last_active_at=c.teacher.last_active_at if c.teacher else None,
            lesson_count=lesson_count,
            student_count=student_count,
        ))
    return result


# ──────────────────────────────────────────────
# Enrolled courses (MUST be before /{course_id} to avoid route conflict)
# ──────────────────────────────────────────────

@router.get("/enrolled/my-courses", response_model=List[CourseListResponse])
async def get_my_enrolled_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get courses the current student is enrolled in."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only students have enrolled courses")

    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.student_id == current_user.id, Enrollment.is_active == True)
        .all()
    )
    result = []
    for e in enrollments:
        c = e.course
        lesson_count = db.query(func.count(Lesson.id)).filter(Lesson.course_id == c.id).scalar()
        student_count = db.query(func.count(Enrollment.id)).filter(
            Enrollment.course_id == c.id, Enrollment.is_active == True
        ).scalar()
        result.append(CourseListResponse(
            id=c.id,
            title=c.title,
            description=c.description,
            subject=c.subject,
            cover_image=c.cover_image,
            is_active=c.is_active,
            teacher_name=c.teacher.full_name if c.teacher else None,
            teacher_last_active_at=c.teacher.last_active_at if c.teacher else None,
            lesson_count=lesson_count,
            student_count=student_count,
        ))
    return result


# ──────────────────────────────────────────────
# Course by ID (parameterized route MUST come after static routes)
# ──────────────────────────────────────────────

@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific course by ID."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return _build_course_response(course, db)


@router.patch("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: int,
    course_data: CourseUpdate,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Update a course. Only the course owner or admin can update."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own courses")

    update_data = course_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(course, key, value)
    db.commit()
    db.refresh(course)
    return _build_course_response(course, db)


@router.delete("/{course_id}", response_model=MessageResponse)
async def delete_course(
    course_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """Delete a course and all its data cleanly."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own courses")

    course_title = course.title

    try:
        # Import models locally to avoid circular dependencies
        from app.models import (
            Assignment, AssignmentSubmission, SubmissionFile, SubmissionHistory,
            AssignmentFile, AssignmentResource, AssignmentGroup, GroupMember,
            AssignmentRubric, RubricCriteria, RubricScoreDetail, PlagiarismReport,
            SubmissionVersion, SubmissionComment, SubmissionSuggestion, SubmissionSectionFeedback,
            DocumentExtraction, Quiz, QuizAttempt, Answer, QuizQuestion, IntegrityEvent,
            Lesson, Material, MaterialFlag, MaterialNote, StudentMaterialProgress,
            Enrollment, Subscription, Payment, TeacherQuestion, DirectMessage,
            QuestionPool, QuestionPoolItem, QuizPoolRule, StudentRecommendation,
            AITutorSession, StudentQuestion, AIResponse, GradingRubric, RubricScore
        )

        # 1. Assignments & Submissions
        assignments = db.query(Assignment).filter(Assignment.course_id == course_id).all()
        for asgn in assignments:
            submissions = db.query(AssignmentSubmission).filter(AssignmentSubmission.assignment_id == asgn.id).all()
            for sub in submissions:
                db.query(SubmissionFile).filter(SubmissionFile.submission_id == sub.id).delete(synchronize_session=False)
                db.query(SubmissionHistory).filter(SubmissionHistory.submission_id == sub.id).delete(synchronize_session=False)
                db.query(PlagiarismReport).filter(PlagiarismReport.submission_id == sub.id).delete(synchronize_session=False)
                db.query(SubmissionVersion).filter(SubmissionVersion.submission_id == sub.id).delete(synchronize_session=False)
                db.query(SubmissionComment).filter(SubmissionComment.submission_id == sub.id).delete(synchronize_session=False)
                db.query(SubmissionSuggestion).filter(SubmissionSuggestion.submission_id == sub.id).delete(synchronize_session=False)
                db.query(SubmissionSectionFeedback).filter(SubmissionSectionFeedback.submission_id == sub.id).delete(synchronize_session=False)
                db.query(DocumentExtraction).filter(DocumentExtraction.submission_id == sub.id).delete(synchronize_session=False)
                db.query(RubricScoreDetail).filter(RubricScoreDetail.submission_id == sub.id).delete(synchronize_session=False)
                db.delete(sub)
            db.flush()

            # Rubrics & Files for assignment
            rubrics = db.query(AssignmentRubric).filter(AssignmentRubric.assignment_id == asgn.id).all()
            for r in rubrics:
                db.query(RubricCriteria).filter(RubricCriteria.rubric_id == r.id).delete(synchronize_session=False)
                db.delete(r)
            db.query(AssignmentFile).filter(AssignmentFile.assignment_id == asgn.id).delete(synchronize_session=False)
            db.query(AssignmentResource).filter(AssignmentResource.assignment_id == asgn.id).delete(synchronize_session=False)
            
            groups = db.query(AssignmentGroup).filter(AssignmentGroup.assignment_id == asgn.id).all()
            for grp in groups:
                db.query(GroupMember).filter(GroupMember.group_id == grp.id).delete(synchronize_session=False)
                db.delete(grp)
            db.delete(asgn)
        db.flush()

        # 2. Quizzes & Attempts
        quizzes = db.query(Quiz).filter(Quiz.course_id == course_id).all()
        for qz in quizzes:
            attempts = db.query(QuizAttempt).filter(QuizAttempt.quiz_id == qz.id).all()
            for att in attempts:
                answers = db.query(Answer).filter(Answer.attempt_id == att.id).all()
                for ans in answers:
                    db.query(RubricScore).filter(RubricScore.answer_id == ans.id).delete(synchronize_session=False)
                    db.delete(ans)
                db.query(IntegrityEvent).filter(IntegrityEvent.attempt_id == att.id).delete(synchronize_session=False)
                db.delete(att)
            db.query(QuizQuestion).filter(QuizQuestion.quiz_id == qz.id).delete(synchronize_session=False)
            db.query(QuizPoolRule).filter(QuizPoolRule.quiz_id == qz.id).delete(synchronize_session=False)
            db.delete(qz)
        db.flush()

        # 3. Question Pools
        pools = db.query(QuestionPool).filter(QuestionPool.course_id == course_id).all()
        for pool in pools:
            db.query(QuestionPoolItem).filter(QuestionPoolItem.pool_id == pool.id).delete(synchronize_session=False)
            db.delete(pool)
        db.flush()

        # 4. Grading Rubrics for course
        g_rubrics = db.query(GradingRubric).filter(GradingRubric.course_id == course_id).all()
        for gr in g_rubrics:
            db.delete(gr)
        db.flush()

        # 5. Lessons & Materials
        lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
        for les in lessons:
            materials = db.query(Material).filter(Material.lesson_id == les.id).all()
            for mat in materials:
                db.query(MaterialFlag).filter(MaterialFlag.material_id == mat.id).delete(synchronize_session=False)
                db.query(MaterialNote).filter(MaterialNote.material_id == mat.id).delete(synchronize_session=False)
                db.query(StudentMaterialProgress).filter(StudentMaterialProgress.material_id == mat.id).delete(synchronize_session=False)
                db.delete(mat)
            db.delete(les)
        db.flush()

        # 6. Enrollments, Subscriptions, Payments
        db.query(Enrollment).filter(Enrollment.course_id == course_id).delete(synchronize_session=False)
        db.query(Subscription).filter(Subscription.course_id == course_id).delete(synchronize_session=False)
        db.query(Payment).filter(Payment.course_id == course_id).delete(synchronize_session=False)

        # 7. Communications & Q&A
        db.query(TeacherQuestion).filter(TeacherQuestion.course_id == course_id).delete(synchronize_session=False)
        db.query(DirectMessage).filter(DirectMessage.course_id == course_id).delete(synchronize_session=False)
        db.query(StudentRecommendation).filter(StudentRecommendation.course_id == course_id).delete(synchronize_session=False)

        sqs = db.query(StudentQuestion).filter(StudentQuestion.course_id == course_id).all()
        for sq in sqs:
            db.query(AIResponse).filter(AIResponse.student_question_id == sq.id).delete(synchronize_session=False)
            db.delete(sq)

        t_sessions = db.query(AITutorSession).filter(AITutorSession.course_id == course_id).all()
        for ts in t_sessions:
            db.delete(ts)
        db.flush()

        # Finally delete course
        db.delete(course)
        db.commit()
        return {"message": f"Course '{course_title}' has been deleted", "success": True}
    except Exception as err:
        db.rollback()
        logger.error(f"Error deleting course {course_id}: {err}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete course: {str(err)}")


# ──────────────────────────────────────────────
# Enrollment
# ──────────────────────────────────────────────

@router.post("/{course_id}/enroll", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def enroll_in_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Enroll the current student in a course."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only students can enroll in courses")

    course = db.query(Course).filter(Course.id == course_id, Course.is_active == True).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found or inactive")

    existing = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id,
        Enrollment.course_id == course_id,
    ).first()
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=400, detail="Already enrolled in this course")
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing

    enrollment = Enrollment(student_id=current_user.id, course_id=course_id)
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return enrollment


@router.delete("/{course_id}/enroll", response_model=MessageResponse)
async def unenroll_from_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unenroll the current student from a course."""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=403, detail="Only students can unenroll from courses")

    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id,
        Enrollment.course_id == course_id,
        Enrollment.is_active == True
    ).first()
    
    if not enrollment:
        raise HTTPException(status_code=404, detail="Active enrollment not found")

    enrollment.is_active = False
    db.commit()
    return {"message": "Successfully unenrolled from the course", "success": True}


@router.get("/{course_id}/students", response_model=List[dict])
async def list_enrolled_students(
    course_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """List students enrolled in a course."""
    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.course_id == course_id, Enrollment.is_active == True)
        .all()
    )
    return [
        {
            "enrollment_id": e.id,
            "student_id": e.student.id,
            "student_name": e.student.full_name,
            "student_email": e.student.email,
            "enrolled_at": e.enrolled_at.isoformat(),
        }
        for e in enrollments
    ]


# ──────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────

def _build_course_response(course: Course, db: Session) -> CourseResponse:
    lesson_count = db.query(func.count(Lesson.id)).filter(Lesson.course_id == course.id).scalar()
    student_count = db.query(func.count(Enrollment.id)).filter(
        Enrollment.course_id == course.id, Enrollment.is_active == True
    ).scalar()
    return CourseResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        subject=course.subject,
        cover_image=course.cover_image,
        is_active=course.is_active,
        teacher_id=course.teacher_id,
        teacher_name=course.teacher.full_name if course.teacher else None,
        teacher_last_active_at=course.teacher.last_active_at if course.teacher else None,
        created_at=course.created_at,
        lesson_count=lesson_count,
        student_count=student_count,
    )
