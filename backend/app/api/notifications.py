from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Dict

from app.database import get_db
from app.models import (
    User, UserRole, Notification, Course, StudentQuestion, TeacherQuestion, AIResponse,
    AssignmentSubmission, Assignment, QuizAttempt, QuizAttemptStatus, Quiz, QuestionType,
    MaterialFlag, Material, Lesson, DirectMessage, PasswordResetRequest, PasswordResetStatus
)
from app.schemas import NotificationResponse, MessageResponse
from app.auth import get_current_user

router = APIRouter()

@router.get("/sidebar-badges", response_model=Dict[str, int])
def get_sidebar_badges(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get unread/pending review counts for sidebar navigation badges."""
    badges: Dict[str, int] = {}

    if current_user.role == UserRole.TEACHER:
        teacher_courses = db.query(Course.id).filter(Course.teacher_id == current_user.id).all()
        course_ids = [c.id for c in teacher_courses]

        if course_ids:
            # 1. Q&A Moderation (unreviewed StudentQuestions + unanswered TeacherQuestions)
            sq_unreviewed = db.query(StudentQuestion).outerjoin(AIResponse).filter(
                StudentQuestion.course_id.in_(course_ids),
                or_(
                    AIResponse.id == None,
                    AIResponse.teacher_correction == None,
                    func.length(func.trim(AIResponse.teacher_correction)) == 0
                )
            ).count()

            tq_unanswered = db.query(TeacherQuestion).filter(
                TeacherQuestion.course_id.in_(course_ids),
                TeacherQuestion.is_answered == False
            ).count()

            qa_count = sq_unreviewed + tq_unanswered

            # 2. Grading Queue (submitted quiz attempts needing manual review + ungraded coursework submissions)
            teacher_quiz_ids = [q.id for q in db.query(Quiz.id).filter(Quiz.course_id.in_(course_ids)).all()]
            quiz_grading_count = 0
            if teacher_quiz_ids:
                submitted_attempts = db.query(QuizAttempt).filter(
                    QuizAttempt.quiz_id.in_(teacher_quiz_ids),
                    QuizAttempt.status == QuizAttemptStatus.SUBMITTED
                ).all()
                for attempt in submitted_attempts:
                    needs_review = len(attempt.integrity_events) > 0
                    for ans in attempt.answers:
                        if ans.is_flagged:
                            needs_review = True
                        if ans.question_version and ans.question_version.question_type == QuestionType.SHORT_ANSWER and not ans.teacher_note and not ans.is_overridden:
                            needs_review = True
                    if needs_review:
                        quiz_grading_count += 1

            assignment_grading_count = db.query(func.count(AssignmentSubmission.id)).join(
                Assignment, AssignmentSubmission.assignment_id == Assignment.id
            ).filter(
                Assignment.course_id.in_(course_ids),
                AssignmentSubmission.status == "submitted",
                AssignmentSubmission.grade_marks == None
            ).scalar() or 0

            grading_count = quiz_grading_count + assignment_grading_count

            # 3. Material Stats / Insights (unresolved material flags)
            insights_count = db.query(func.count(MaterialFlag.id)).join(
                Material, MaterialFlag.material_id == Material.id
            ).join(
                Lesson, Material.lesson_id == Lesson.id
            ).filter(
                Lesson.course_id.in_(course_ids),
                MaterialFlag.is_resolved == False
            ).scalar() or 0

            # 4. Coursework (submitted coursework assignments)
            coursework_count = db.query(func.count(AssignmentSubmission.id)).join(
                Assignment, AssignmentSubmission.assignment_id == Assignment.id
            ).filter(
                Assignment.course_id.in_(course_ids),
                AssignmentSubmission.status == "submitted"
            ).scalar() or 0
        else:
            qa_count = 0
            grading_count = 0
            insights_count = 0
            coursework_count = 0

        # 5. Unread Messages in Inbox
        inbox_count = db.query(func.count(DirectMessage.id)).filter(
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.is_read == False
        ).scalar() or 0

        badges = {
            "/dashboard/teacher/qa": qa_count,
            "/dashboard/teacher/grading": grading_count,
            "/dashboard/teacher/insights": insights_count,
            "/dashboard/teacher/assignments": coursework_count,
            "/dashboard/teacher/inbox": inbox_count,
        }

    elif current_user.role == UserRole.STUDENT:
        # Unread messages from teacher or admin
        unread_msg_count = db.query(func.count(DirectMessage.id)).filter(
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.is_read == False
        ).scalar() or 0

        badges = {
            "/dashboard/student/ask-teacher": unread_msg_count,
        }

    elif current_user.role == UserRole.ADMIN:
        # Unread messages
        msg_count = db.query(func.count(DirectMessage.id)).filter(
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.is_read == False
        ).scalar() or 0

        # Pending password resets
        pw_reset_count = db.query(func.count(PasswordResetRequest.id)).filter(
            PasswordResetRequest.status == PasswordResetStatus.PENDING
        ).scalar() or 0

        badges = {
            "/dashboard/admin/messages": msg_count,
            "/dashboard/admin/password-resets": pw_reset_count,
        }

    return badges

@router.get("", response_model=List[NotificationResponse])
def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
):
    """Get all notifications for the current user."""
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return notifications

@router.post("/{notification_id}/read", response_model=MessageResponse)
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a specific notification as read."""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notification.is_read = True
    db.commit()
    
    return {"message": "Notification marked as read"}

@router.post("/mark-all-read", response_model=MessageResponse)
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all notifications as read for the current user."""
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    
    db.commit()
    
    return {"message": "All notifications marked as read"}
