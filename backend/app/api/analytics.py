from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any
from datetime import datetime

from app.database import get_db
from app.models import User, UserRole, Course, StudentQuestion, AIResponse, Enrollment, QuizAttempt, Lesson, Material, StudentMaterialProgress
from app.schemas import StudentCourseProgressResponse
from app.auth import get_current_user, require_role

router = APIRouter()

@router.get("/teacher/courses")
async def get_teacher_courses_analytics(
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    courses = db.query(Course).filter(Course.teacher_id == current_user.id).all()
    results = []
    for c in courses:
        students_count = db.query(func.count(Enrollment.id)).filter(Enrollment.course_id == c.id).scalar()
        
        # Avg quiz score
        avg_score = db.query(func.avg(QuizAttempt.percentage)).join(QuizAttempt.quiz).filter(
            QuizAttempt.quiz.has(course_id=c.id)
        ).scalar() or 0.0

        # Total questions asked
        questions_asked = db.query(func.count(StudentQuestion.id)).filter(
            StudentQuestion.course_id == c.id
        ).scalar() or 0

        results.append({
            "course_id": c.id,
            "course_title": c.title,
            "total_students": students_count,
            "average_quiz_score": round(avg_score, 2),
            "total_questions_asked": questions_asked
        })
    return results

@router.get("/teacher/course/{course_id}/quiz-breakdown")
async def get_course_quiz_breakdown(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    from app.models import Quiz
    quizzes = db.query(Quiz).filter(Quiz.course_id == course_id).all()
    results = []
    for q in quizzes:
        avg_score = db.query(func.avg(QuizAttempt.percentage)).filter(QuizAttempt.quiz_id == q.id).scalar() or 0
        max_score = db.query(func.max(QuizAttempt.percentage)).filter(QuizAttempt.quiz_id == q.id).scalar()
        min_score = db.query(func.min(QuizAttempt.percentage)).filter(QuizAttempt.quiz_id == q.id).scalar()
        attempts_count = db.query(func.count(QuizAttempt.id)).filter(QuizAttempt.quiz_id == q.id).scalar() or 0
        
        # Calculate true score distribution
        distribution = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
        attempts_data = db.query(QuizAttempt.percentage).filter(QuizAttempt.quiz_id == q.id, QuizAttempt.percentage.isnot(None)).all()
        for att in attempts_data:
            score = att[0] or 0
            if score <= 20: distribution["0-20"] += 1
            elif score <= 40: distribution["21-40"] += 1
            elif score <= 60: distribution["41-60"] += 1
            elif score <= 80: distribution["61-80"] += 1
            else: distribution["81-100"] += 1
            
        results.append({
            "quiz_id": q.id,
            "quiz_title": q.title,
            "average_score": round(avg_score, 2) if attempts_count > 0 else None,
            "highest_score": round(max_score, 2) if max_score is not None else None,
            "lowest_score": round(min_score, 2) if min_score is not None else None,
            "completion_rate": 100.0 if attempts_count > 0 else 0.0,
            "total_attempts": attempts_count,
            "score_distribution": distribution
        })
    return {"quizzes": results}

@router.get("/teacher/course/{course_id}/engagement")
async def get_course_engagement(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    enrollments = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
    results = []
    summary = {"high": 0, "medium": 0, "low": 0}
    
    for enr in enrollments:
        student = db.query(User).filter(User.id == enr.student_id).first()
        if not student: continue

        avg_score = db.query(func.avg(QuizAttempt.percentage)).join(QuizAttempt.quiz).filter(
            QuizAttempt.student_id == student.id,
            QuizAttempt.quiz.has(course_id=course_id)
        ).scalar()
        
        q_taken = db.query(func.count(QuizAttempt.id)).join(QuizAttempt.quiz).filter(
            QuizAttempt.student_id == student.id,
            QuizAttempt.quiz.has(course_id=course_id)
        ).scalar() or 0
        
        q_asked = db.query(func.count(StudentQuestion.id)).filter(
            StudentQuestion.student_id == student.id,
            StudentQuestion.course_id == course_id
        ).scalar() or 0

        eng_level = "high" if q_asked > 5 else ("medium" if q_asked > 1 else "low")
        summary[eng_level] += 1

        results.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "average_score": round(avg_score, 2) if avg_score else None,
            "quizzes_taken": q_taken,
            "questions_asked": q_asked,
            "engagement_level": eng_level,
            "enrolled_at": enr.enrolled_at.isoformat()
        })
        
    return {
        "total_students": len(results),
        "engagement_summary": summary,
        "students": results
    }

@router.get("/teacher/student-progress", response_model=List[StudentCourseProgressResponse])
async def get_teacher_student_progress(
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    # Get all courses taught by this teacher
    courses = db.query(Course).filter(Course.teacher_id == current_user.id).all()
    if not courses:
        return []
    
    course_ids = [c.id for c in courses]
    
    # Get all enrollments for these courses
    enrollments = db.query(Enrollment).filter(Enrollment.course_id.in_(course_ids)).all()
    
    results = []
    for enr in enrollments:
        student = enr.student
        course = enr.course
        
        # Count total materials in the course
        total_materials = db.query(func.count(Material.id)).join(Lesson).filter(Lesson.course_id == course.id).scalar() or 0
        
        # Count completed materials by this student in this course
        completed_materials = db.query(func.count(StudentMaterialProgress.id)).join(
            Material, StudentMaterialProgress.material_id == Material.id
        ).join(
            Lesson, Material.lesson_id == Lesson.id
        ).filter(
            Lesson.course_id == course.id,
            StudentMaterialProgress.student_id == student.id,
            StudentMaterialProgress.is_completed == True
        ).scalar() or 0
        
        progress_percentage = (completed_materials / total_materials * 100) if total_materials > 0 else 0.0
        
        results.append(StudentCourseProgressResponse(
            student_id=student.id,
            student_name=student.full_name,
            course_id=course.id,
            course_title=course.title,
            completed_materials=completed_materials,
            total_materials=total_materials,
            progress_percentage=round(progress_percentage, 1)
        ))
        
    return results

@router.post("/teacher/remind-low-progress")
async def send_low_progress_reminders(
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """Identify students with low progress (< 50%) and send them a notification reminder."""
    # We can reuse the logic from get_teacher_student_progress
    progress_stats = await get_teacher_student_progress(current_user, db)
    
    from app.models import Notification, NotificationType
    reminders_sent = 0
    
    for stat in progress_stats:
        if stat.progress_percentage < 50.0:
            # Check if a recent reminder was sent to avoid spam
            from datetime import datetime, timedelta
            one_day_ago = datetime.utcnow() - timedelta(days=1)
            recent = db.query(Notification).filter(
                Notification.user_id == stat.student_id,
                Notification.type == NotificationType.REMINDER,
                Notification.related_entity_id == stat.course_id,
                Notification.created_at >= one_day_ago
            ).first()
            
            if not recent:
                notification = Notification(
                    user_id=stat.student_id,
                    sender_id=current_user.id,
                    title=f"Action Required: Low Progress in {stat.course_title}",
                    message=f"Your progress in {stat.course_title} is currently at {stat.progress_percentage}%. Please review the latest materials to stay on track.",
                    type=NotificationType.REMINDER,
                    related_entity_id=stat.course_id,
                )
                db.add(notification)
                reminders_sent += 1
                
    db.commit()
    
    return {"message": f"Successfully sent {reminders_sent} reminders to students with low progress."}

@router.get("/student/progress")
async def get_student_progress(
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    courses_enrolled = db.query(func.count(Enrollment.id)).filter(Enrollment.student_id == current_user.id).scalar() or 0
    quizzes_taken = db.query(func.count(QuizAttempt.id)).filter(QuizAttempt.student_id == current_user.id).scalar() or 0
    avg_score = db.query(func.avg(QuizAttempt.percentage)).filter(QuizAttempt.student_id == current_user.id).scalar() or 0.0
    questions_asked = db.query(func.count(StudentQuestion.id)).filter(StudentQuestion.student_id == current_user.id).scalar() or 0
    
    return {
        "overall_progress": 0, # Placeholder
        "course_progress": [], # Placeholder
        "courses_enrolled": courses_enrolled,
        "quizzes_taken": quizzes_taken,
        "average_score": round(avg_score, 2),
        "questions_asked": questions_asked
    }

@router.get("/student/quiz-history")
async def get_student_quiz_history(
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    # Only completed attempts have scores; in-progress ones have null percentage
    attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == current_user.id,
            QuizAttempt.completed_at.isnot(None),
            QuizAttempt.percentage.isnot(None),
        )
        .order_by(QuizAttempt.completed_at.desc())
        .all()
    )

    attempts_data = []
    for a in attempts:
        attempts_data.append({
            "attempt_id": a.id,
            "quiz_id": a.quiz_id,
            "quiz_title": a.quiz.title if a.quiz else "Unknown Quiz",
            "course_title": a.quiz.course.title if a.quiz and a.quiz.course else "Unknown Course",
            "percentage": round(a.percentage, 2) if a.percentage is not None else None,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        })

    avg_score = db.query(func.avg(QuizAttempt.percentage)).filter(
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.percentage.isnot(None),
    ).scalar() or 0.0
    best_score = db.query(func.max(QuizAttempt.percentage)).filter(
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.percentage.isnot(None),
    ).scalar() or 0.0

    score_trend = [
        {"date": a.completed_at.isoformat(), "score": round(a.percentage, 2)}
        for a in reversed(attempts)
        if a.completed_at is not None and a.percentage is not None
    ]

    return {
        "recent_quizzes": attempts_data,
        "average_score": round(avg_score, 2),
        "score_trend": score_trend,
        "attempts": attempts_data,
        "total_attempts": len(attempts),
        "best_score": round(best_score, 2)
    }

@router.get("/student/course/{course_id}/performance")
async def get_student_course_performance(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    from app.models import Quiz, QuizAttempt, StudentQuestion
    
    total_quizzes = db.query(func.count(Quiz.id)).filter(Quiz.course_id == course_id).scalar() or 0
    completed_quizzes = db.query(func.count(QuizAttempt.quiz_id.distinct())).join(QuizAttempt.quiz).filter(
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.quiz.has(course_id=course_id),
        QuizAttempt.completed_at.isnot(None),
    ).scalar() or 0
    
    completion_percentage = int((completed_quizzes / total_quizzes) * 100) if total_quizzes > 0 else 0
    
    questions_asked = db.query(func.count(StudentQuestion.id)).filter(
        StudentQuestion.student_id == current_user.id,
        StudentQuestion.course_id == course_id
    ).scalar() or 0
    
    # Get course title
    from app.models import Course
    course = db.query(Course).filter(Course.id == course_id).first()
    course_title = course.title if course else "Unknown"
    
    # Get all quizzes for this course
    all_quizzes = db.query(Quiz).filter(Quiz.course_id == course_id).all()
    quiz_results = []
    
    for q in all_quizzes:
        completed = db.query(QuizAttempt).filter(
            QuizAttempt.student_id == current_user.id,
            QuizAttempt.quiz_id == q.id,
            QuizAttempt.completed_at.isnot(None),
        ).order_by(QuizAttempt.completed_at.desc()).first()

        in_progress = None
        if not completed:
            in_progress = db.query(QuizAttempt).filter(
                QuizAttempt.student_id == current_user.id,
                QuizAttempt.quiz_id == q.id,
                QuizAttempt.completed_at.is_(None),
            ).order_by(QuizAttempt.started_at.desc()).first()

        if completed:
            status = "completed"
            score = completed.percentage
        elif in_progress:
            status = "in_progress"
            score = None
        else:
            status = "not_attempted"
            score = None

        quiz_results.append({
            "quiz_id": q.id,
            "quiz_title": q.title,
            "status": status,
            "score": score,
        })
    
    return {
        "course_id": course_id,
        "course_title": course_title,
        "completion_percentage": completion_percentage,
        "completed_quizzes": completed_quizzes,
        "total_quizzes": total_quizzes,
        "questions_asked": questions_asked,
        "quiz_results": quiz_results
    }

@router.get("/student/recommendations")
async def get_student_recommendations(
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
    return []

@router.get("/admin/stats")
async def get_admin_stats(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    total_students = db.query(func.count(User.id)).filter(User.role == UserRole.STUDENT).scalar() or 0
    total_teachers = db.query(func.count(User.id)).filter(User.role == UserRole.TEACHER).scalar() or 0
    total_courses = db.query(func.count(Course.id)).scalar() or 0
    from app.models import Quiz
    total_quizzes = db.query(func.count(Quiz.id)).scalar() or 0
    total_questions_asked = db.query(func.count(StudentQuestion.id)).scalar() or 0
    active_enrollments = db.query(func.count(Enrollment.id)).scalar() or 0

    return {
        "total_students": total_students,
        "total_teachers": total_teachers,
        "total_courses": total_courses,
        "total_quizzes": total_quizzes,
        "total_questions_asked": total_questions_asked,
        "active_enrollments": active_enrollments
    }

@router.get("/admin/overview")
async def get_admin_overview(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    from datetime import timedelta
    today = datetime.utcnow().date()
    
    # 30-day trends mock (real implementation requires group_by date which varies by SQL dialect)
    # We will generate a basic mock for the last 7 days for now to populate the chart
    enrollment_trend = []
    registration_trend = []
    quiz_attempt_trend = []
    qa_trend = []
    for i in range(7, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        enrollment_trend.append({"date": d, "count": 0})
        registration_trend.append({"date": d, "count": 0})
        quiz_attempt_trend.append({"date": d, "count": 0})
        qa_trend.append({"date": d, "count": 0})
        
    # Replace the last day with actual counts for simple trend
    enrollment_trend[-1]["count"] = db.query(func.count(Enrollment.id)).scalar() or 0
    registration_trend[-1]["count"] = db.query(func.count(User.id)).scalar() or 0

    # Course breakdown
    courses = db.query(Course).limit(5).all()
    from app.models import Lesson, Quiz
    course_breakdown = []
    for c in courses:
        students = db.query(func.count(Enrollment.id)).filter(Enrollment.course_id == c.id).scalar() or 0
        lessons = db.query(func.count(Lesson.id)).filter(Lesson.course_id == c.id).scalar() or 0
        quizzes = db.query(func.count(Quiz.id)).filter(Quiz.course_id == c.id).scalar() or 0
        course_breakdown.append({
            "id": c.id,
            "title": c.title,
            "students": students,
            "lessons": lessons,
            "quizzes": quizzes
        })

    return {
        "enrollment_trend": enrollment_trend,
        "registration_trend": registration_trend,
        "quiz_attempt_trend": quiz_attempt_trend,
        "qa_trend": qa_trend,
        "activity_feed": [
            {"type": "user_register", "message": "System operational", "timestamp": datetime.utcnow().isoformat()}
        ],
        "course_breakdown": course_breakdown
    }

@router.get("/admin/ai-performance")
async def get_admin_ai_performance(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    total_qa = db.query(func.count(StudentQuestion.id)).scalar() or 0
    return {
        "total_operations": total_qa,
        "completed": total_qa,
        "failed": 0,
        "success_rate": 100.0,
        "avg_response_time_ms": 1200,
        "action_breakdown": [
            {"action": "q_and_a", "count": total_qa, "avg_time_ms": 1200},
            {"action": "quiz_generation", "count": 0, "avg_time_ms": 0},
            {"action": "summarization", "count": 0, "avg_time_ms": 0}
        ],
        "usage_trend": []
    }

@router.get("/ai-insights", response_model=Dict[str, Any])
async def get_ai_insights(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    """
    Get AI insights for a specific course:
    - Total AI queries
    - Top confusion areas (topic_category distribution)
    - Recent question feed
    - Low confidence responses
    """
    # Verify course belongs to teacher (or teacher is admin)
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    if current_user.role != UserRole.ADMIN and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view analytics for this course")

    # Aggregate queries by topic_category
    topics = (
        db.query(StudentQuestion.topic_category, func.count(StudentQuestion.id).label("count"))
        .filter(StudentQuestion.course_id == course_id)
        .filter(StudentQuestion.topic_category != None)
        .group_by(StudentQuestion.topic_category)
        .order_by(func.count(StudentQuestion.id).desc())
        .limit(10)
        .all()
    )
    
    top_confusion_areas = [{"topic": t[0], "count": t[1]} for t in topics]

    # Total queries
    total_queries = db.query(func.count(StudentQuestion.id)).filter(StudentQuestion.course_id == course_id).scalar()

    # Recent question feed
    recent_questions = (
        db.query(StudentQuestion, AIResponse)
        .outerjoin(AIResponse, StudentQuestion.id == AIResponse.student_question_id)
        .filter(StudentQuestion.course_id == course_id)
        .order_by(StudentQuestion.asked_at.desc())
        .limit(20)
        .all()
    )
    
    feed = []
    low_confidence_count = 0
    
    for q, a in recent_questions:
        confidence = a.confidence_score if a else 0
        if confidence and confidence < 0.5:
            low_confidence_count += 1
            
        feed.append({
            "id": q.id,
            "question": q.question_text,
            "topic_category": q.topic_category,
            "sentiment_difficulty": q.sentiment_difficulty,
            "asked_at": q.asked_at,
            "confidence_score": confidence,
            "is_flagged": a.is_flagged if a else False
        })

    return {
        "course_id": course_id,
        "total_queries": total_queries,
        "top_confusion_areas": top_confusion_areas,
        "low_confidence_count": low_confidence_count,
        "recent_feed": feed
    }
