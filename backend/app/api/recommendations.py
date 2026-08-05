"""
Personalized Learning Recommendations API.
Generates dynamic study recommendations for students based on quiz performance, weak topics, and study progress.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models import User, UserRole, Course, QuizAttempt, QuizAttemptStatus, Quiz, Lesson, StudentRecommendation, StudentQuestion
from app.schemas import StudentRecommendationResponse
from app.auth import require_role

router = APIRouter()


@router.get("/student", response_model=List[dict])
def get_student_recommendations(
    course_id: Optional[int] = None,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    """Retrieve personalized learning recommendations for student."""
    # Query stored recommendations or generate dynamically
    query = db.query(StudentRecommendation).filter(
        StudentRecommendation.student_id == current_user.id,
        StudentRecommendation.is_completed == False
    )
    if course_id:
        query = query.filter(StudentRecommendation.course_id == course_id)
        
    recs = query.order_by(StudentRecommendation.priority_score.desc()).all()
    
    # If no recs exist, generate initial recommendations
    if not recs:
        # Check lowest scoring quiz attempts
        low_attempts = db.query(QuizAttempt).filter(
            QuizAttempt.student_id == current_user.id,
            QuizAttempt.status == QuizAttemptStatus.SUBMITTED,
            QuizAttempt.score != None
        ).order_by(QuizAttempt.score.asc()).limit(3).all()
        
        for att in low_attempts:
            pct = (att.score / att.total_points * 100) if att.total_points and att.total_points > 0 else 100
            if pct < 75:
                rec = StudentRecommendation(
                    student_id=current_user.id,
                    course_id=att.quiz.course_id,
                    recommendation_type="quiz",
                    target_id=att.quiz_id,
                    title=f"Retake: {att.quiz.title}",
                    reason=f"Scored {round(pct)}% on recent attempt. Practice again to master these concepts.",
                    priority_score=0.9
                )
                db.add(rec)
                
        # Check uncompleted lessons
        lessons = db.query(Lesson).limit(5).all()
        for les in lessons:
            rec = StudentRecommendation(
                student_id=current_user.id,
                course_id=les.course_id,
                recommendation_type="lesson",
                target_id=les.id,
                title=f"Study: {les.title}",
                reason="Recommended next step in your course learning pathway.",
                priority_score=0.7
            )
            db.add(rec)
            
        db.commit()
        recs = query.order_by(StudentRecommendation.priority_score.desc()).all()

    results = []
    for r in recs:
        results.append({
            "id": r.id,
            "course_id": r.course_id,
            "recommendation_type": r.recommendation_type,
            "target_id": r.target_id,
            "title": r.title,
            "reason": r.reason,
            "priority_score": r.priority_score,
            "is_completed": r.is_completed,
            "created_at": r.created_at.isoformat()
        })
    return results
