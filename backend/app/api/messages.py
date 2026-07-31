import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, desc
from datetime import datetime

from app.database import get_db
from app.models import (
    User, UserRole, Course, DirectMessage, Notification, NotificationType
)
from app.schemas import (
    DirectMessageCreate, DirectMessageResponse, ConversationSummary
)
from app.auth import get_current_user, require_role

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/conversations", response_model=List[ConversationSummary])
def get_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a list of active conversations for the current user.
    For a student, this shows courses they are enrolled in and have messaged/can message.
    For a teacher, this shows students they have active conversations with across their courses.
    """
    # Find all messages where current user is sender or receiver
    messages = db.query(DirectMessage).filter(
        or_(
            DirectMessage.sender_id == current_user.id,
            DirectMessage.receiver_id == current_user.id
        )
    ).all()
    
    # Group by (course_id, other_user_id)
    conversations_map = {}
    
    for msg in messages:
        other_user_id = msg.receiver_id if msg.sender_id == current_user.id else msg.sender_id
        key = (msg.course_id, other_user_id)
        
        if key not in conversations_map:
            course = db.query(Course).filter(Course.id == msg.course_id).first()
            other_user = db.query(User).filter(User.id == other_user_id).first()
            if not course or not other_user:
                continue
                
            conversations_map[key] = {
                "course_id": course.id,
                "course_title": course.title,
                "other_user_id": other_user.id,
                "other_user_name": other_user.full_name,
                "last_message": msg.content,
                "last_message_at": msg.created_at,
                "unread_count": 0
            }
        
        # Update last message if newer
        if msg.created_at > conversations_map[key]["last_message_at"]:
            conversations_map[key]["last_message"] = msg.content
            conversations_map[key]["last_message_at"] = msg.created_at
            
        # Count unread messages where current user is the RECEIVER
        if msg.receiver_id == current_user.id and not msg.is_read:
            conversations_map[key]["unread_count"] += 1
            
    # Sort by last message date descending
    results = list(conversations_map.values())
    results.sort(key=lambda x: x["last_message_at"], reverse=True)
    
    # FOR STUDENTS: Also add empty conversations for courses they are enrolled in
    if current_user.role == UserRole.STUDENT:
        from app.models import Enrollment
        enrollments = db.query(Enrollment).filter(Enrollment.student_id == current_user.id).all()
        for enr in enrollments:
            course = db.query(Course).filter(Course.id == enr.course_id).first()
            if course and course.teacher_id:
                key = (course.id, course.teacher_id)
                if key not in conversations_map:
                    teacher = db.query(User).filter(User.id == course.teacher_id).first()
                    if teacher:
                        results.append({
                            "course_id": course.id,
                            "course_title": course.title,
                            "other_user_id": teacher.id,
                            "other_user_name": teacher.full_name,
                            "last_message": "No messages yet. Say hi!",
                            "last_message_at": datetime.min,
                            "unread_count": 0
                        })
    
    # Resort
    results.sort(key=lambda x: x["last_message_at"], reverse=True)
    return results

@router.get("/thread", response_model=List[DirectMessageResponse])
def get_message_thread(
    course_id: int,
    other_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the full message thread between the current user and the other user in a specific course.
    Also marks unread messages from the other user as read.
    """
    # Fetch thread
    messages = db.query(DirectMessage).filter(
        DirectMessage.course_id == course_id,
        or_(
            and_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == other_user_id),
            and_(DirectMessage.sender_id == other_user_id, DirectMessage.receiver_id == current_user.id)
        )
    ).order_by(DirectMessage.created_at.asc()).all()
    
    # Mark as read
    unread = [m for m in messages if m.receiver_id == current_user.id and not m.is_read]
    for m in unread:
        m.is_read = True
    if unread:
        db.commit()
        
    # Format response
    other_user = db.query(User).filter(User.id == other_user_id).first()
    course = db.query(Course).filter(Course.id == course_id).first()
    
    results = []
    for m in messages:
        sender_name = current_user.full_name if m.sender_id == current_user.id else other_user.full_name
        receiver_name = current_user.full_name if m.receiver_id == current_user.id else other_user.full_name
        
        results.append({
            **m.__dict__,
            "sender_name": sender_name,
            "receiver_name": receiver_name,
            "course_title": course.title if course else "Unknown"
        })
        
    return results

@router.post("/send", response_model=DirectMessageResponse)
def send_message(
    data: DirectMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send a new direct message.
    """
    receiver = db.query(User).filter(User.id == data.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found")
        
    course = db.query(Course).filter(Course.id == data.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    msg = DirectMessage(
        sender_id=current_user.id,
        receiver_id=data.receiver_id,
        course_id=data.course_id,
        content=data.content,
        tag=data.tag
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    
    # Send notification
    notif = Notification(
        user_id=data.receiver_id,
        sender_id=current_user.id,
        title=f"New message from {current_user.full_name}",
        message=f"{current_user.full_name} sent you a message in {course.title}",
        type=NotificationType.MESSAGE,
        related_entity_id=course.id,  # Link to course_id so we can route to chat
    )
    db.add(notif)
    db.commit()
    
    return {
        **msg.__dict__,
        "sender_name": current_user.full_name,
        "receiver_name": receiver.full_name,
        "course_title": course.title
    }
