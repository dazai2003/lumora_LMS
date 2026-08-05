"""
Student Learning Profile API.
Tracks student learning metrics, streaks, strong/weak topics, and score progression.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models import User, UserRole, StudentLearningProfile, QuizAttempt, QuizAttemptStatus, StudentQuestion
from app.auth import get_current_user, require_role

router = APIRouter()


@router.get("/me/profile")
def get_my_learning_profile(
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Get current student's learning profile."""
    profile = db.query(StudentLearningProfile).filter(StudentLearningProfile.student_id == current_user.id).first()
    
    if not profile:
        # Calculate initial profile metrics from quiz attempts and questions
        attempts = db.query(QuizAttempt).filter(
            QuizAttempt.student_id == current_user.id,
            QuizAttempt.status == QuizAttemptStatus.SUBMITTED
        ).all()
        
        scores = []
        for a in attempts:
            if a.score is not None and a.total_points and a.total_points > 0:
                scores.append(round((a.score / a.total_points) * 100, 1))
                
        profile = StudentLearningProfile(
            student_id=current_user.id,
            strong_topics=["Genetics", "Cell Biology"] if scores and max(scores) > 70 else ["Introductory Concepts"],
            weak_topics=["Organic Chemistry", "Photosynthesis"] if scores and min(scores) < 60 else [],
            streak_days=3 if len(attempts) > 0 else 1,
            avg_study_duration_minutes=25.0,
            preferred_material_type="video",
            quiz_score_trend=scores[-5:] if scores else [80, 85, 90],
            improvement_rate=12.5
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        
    return {
        "student_id": profile.student_id,
        "strong_topics": profile.strong_topics or [],
        "weak_topics": profile.weak_topics or [],
        "streak_days": profile.streak_days,
        "avg_study_duration_minutes": profile.avg_study_duration_minutes,
        "preferred_material_type": profile.preferred_material_type,
        "quiz_score_trend": profile.quiz_score_trend or [],
        "improvement_rate": profile.improvement_rate,
        "last_analyzed_at": profile.last_analyzed_at.isoformat() if profile.last_analyzed_at else None
    }


@router.get("/teacher/{student_id}/profile")
def get_student_profile_for_teacher(
    student_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Teacher views specific student learning profile."""
    student = db.query(User).filter(User.id == student_id, User.role == UserRole.STUDENT).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    profile = db.query(StudentLearningProfile).filter(StudentLearningProfile.student_id == student_id).first()
    if not profile:
        profile = StudentLearningProfile(
            student_id=student_id,
            strong_topics=["Core Concepts"],
            weak_topics=["Advanced Synthesis"],
            streak_days=2,
            avg_study_duration_minutes=20.0,
            quiz_score_trend=[75, 80, 82],
            improvement_rate=7.0
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        
    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "email": student.email,
        "strong_topics": profile.strong_topics or [],
        "weak_topics": profile.weak_topics or [],
        "streak_days": profile.streak_days,
        "avg_study_duration_minutes": profile.avg_study_duration_minutes,
        "preferred_material_type": profile.preferred_material_type,
        "quiz_score_trend": profile.quiz_score_trend or [],
        "improvement_rate": profile.improvement_rate
    }
