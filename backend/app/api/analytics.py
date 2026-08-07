from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any
from datetime import datetime

from app.database import get_db
from app.models import User, UserRole, Course, StudentQuestion, AIResponse, Enrollment, QuizAttempt, Quiz, Lesson, Material, StudentMaterialProgress, ActivityLog, Assignment, AssignmentSubmission
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
        students_count = db.query(func.count(Enrollment.id)).filter(Enrollment.course_id == c.id).scalar() or 0
        
        # Avg quiz score
        avg_score = db.query(func.avg(QuizAttempt.percentage)).join(QuizAttempt.quiz).filter(
            QuizAttempt.quiz.has(course_id=c.id)
        ).scalar() or 0.0

        # Avg coursework score
        graded_cw = db.query(AssignmentSubmission).join(Assignment).filter(
            Assignment.course_id == c.id,
            AssignmentSubmission.grade_marks.isnot(None)
        ).all()
        cw_scores = [(s.grade_marks / s.assignment.max_marks * 100.0) for s in graded_cw if s.assignment and s.assignment.max_marks > 0]
        avg_cw_score = round(sum(cw_scores) / len(cw_scores), 2) if cw_scores else 0.0

        # Material completion rate
        total_mats = db.query(func.count(Material.id)).join(Lesson).filter(Lesson.course_id == c.id).scalar() or 0
        possible_mats = total_mats * students_count
        completed_mats = db.query(func.count(StudentMaterialProgress.id)).join(
            Material, StudentMaterialProgress.material_id == Material.id
        ).join(
            Lesson, Material.lesson_id == Lesson.id
        ).filter(
            Lesson.course_id == c.id,
            StudentMaterialProgress.is_completed == True
        ).scalar() or 0
        mat_completion_pct = round((completed_mats / possible_mats * 100.0), 1) if possible_mats > 0 else 0.0

        # Total questions asked
        questions_asked = db.query(func.count(StudentQuestion.id)).filter(
            StudentQuestion.course_id == c.id
        ).scalar() or 0

        results.append({
            "course_id": c.id,
            "course_title": c.title,
            "total_students": students_count,
            "average_quiz_score": round(avg_score, 2),
            "average_coursework_score": avg_cw_score,
            "material_completion_rate": mat_completion_pct,
            "total_questions_asked": questions_asked
        })
    return results


@router.get("/teacher/course/{course_id}/full-analytics")
async def get_full_course_analytics(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role != UserRole.ADMIN and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view analytics for this course")

    enrollments = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
    total_enrolled = len(enrollments)

    # 1. Coursework Analytics
    assignments = db.query(Assignment).filter(Assignment.course_id == course_id).all()
    coursework_list = []
    total_cw_graded_scores = []

    for assign in assignments:
        subs = db.query(AssignmentSubmission).filter(AssignmentSubmission.assignment_id == assign.id).all()
        submitted_subs = [s for s in subs if s.status in ["submitted", "graded", "returned"]]
        late_subs = [s for s in subs if s.is_late]
        graded_subs = [s for s in subs if s.grade_marks is not None]

        scores = [s.grade_marks for s in graded_subs]
        avg_marks = round(sum(scores) / len(scores), 1) if scores else 0.0
        avg_pct = round((avg_marks / assign.max_marks * 100), 1) if assign.max_marks > 0 else 0.0

        for s in graded_subs:
            if assign.max_marks > 0:
                total_cw_graded_scores.append((s.grade_marks / assign.max_marks) * 100.0)

        coursework_list.append({
            "assignment_id": assign.id,
            "title": assign.title,
            "max_marks": assign.max_marks,
            "total_submitted": len(submitted_subs),
            "submission_rate_pct": round((len(submitted_subs) / total_enrolled * 100), 1) if total_enrolled > 0 else 0.0,
            "late_count": len(late_subs),
            "average_marks": avg_marks,
            "average_pct": avg_pct,
        })

    avg_coursework_pct = round(sum(total_cw_graded_scores) / len(total_cw_graded_scores), 1) if total_cw_graded_scores else 0.0

    # 2. Quiz Breakdown
    quizzes = db.query(Quiz).filter(Quiz.course_id == course_id).all()
    quiz_list = []
    total_quiz_scores = []

    for q in quizzes:
        attempts = db.query(QuizAttempt).filter(QuizAttempt.quiz_id == q.id, QuizAttempt.completed_at.isnot(None), QuizAttempt.percentage.isnot(None)).all()
        scores = [a.percentage for a in attempts]
        if scores:
            total_quiz_scores.extend(scores)

        avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
        highest_score = round(max(scores), 1) if scores else None
        lowest_score = round(min(scores), 1) if scores else None

        distribution = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
        for s in scores:
            if s <= 20: distribution["0-20"] += 1
            elif s <= 40: distribution["21-40"] += 1
            elif s <= 60: distribution["41-60"] += 1
            elif s <= 80: distribution["61-80"] += 1
            else: distribution["81-100"] += 1

        quiz_list.append({
            "quiz_id": q.id,
            "title": q.title,
            "total_attempts": len(attempts),
            "completion_rate": round((len(attempts) / total_enrolled * 100), 1) if total_enrolled > 0 else 0.0,
            "average_score": avg_score,
            "highest_score": highest_score,
            "lowest_score": lowest_score,
            "score_distribution": distribution
        })

    avg_quiz_pct = round(sum(total_quiz_scores) / len(total_quiz_scores), 1) if total_quiz_scores else 0.0

    # 3. Material Completion Breakdown
    materials = db.query(Material).join(Lesson).filter(Lesson.course_id == course_id).all()
    total_materials = len(materials)
    material_type_stats = {}

    for m_type in ["pdf", "video", "note", "image"]:
        m_of_type = [m for m in materials if m.material_type == m_type]
        if not m_of_type:
            continue
        m_ids = [m.id for m in m_of_type]
        completed_progress = db.query(func.count(StudentMaterialProgress.id)).filter(
            StudentMaterialProgress.material_id.in_(m_ids),
            StudentMaterialProgress.is_completed == True
        ).scalar() or 0
        possible_total = len(m_of_type) * total_enrolled
        pct = round((completed_progress / possible_total * 100), 1) if possible_total > 0 else 0.0
        material_type_stats[m_type] = {
            "count": len(m_of_type),
            "completed_count": completed_progress,
            "completion_pct": pct
        }

    total_possible_materials = total_materials * total_enrolled
    total_completed_materials = db.query(func.count(StudentMaterialProgress.id)).join(
        Material, StudentMaterialProgress.material_id == Material.id
    ).join(
        Lesson, Material.lesson_id == Lesson.id
    ).filter(
        Lesson.course_id == course_id,
        StudentMaterialProgress.is_completed == True
    ).scalar() or 0

    overall_material_pct = round((total_completed_materials / total_possible_materials * 100), 1) if total_possible_materials > 0 else 0.0

    # 4. Student Roster & Composite Risk Intelligence
    student_roster = []
    at_risk_count = 0

    for enr in enrollments:
        student = enr.student
        if not student:
            continue

        # Student Quiz Avg
        s_quiz_attempts = db.query(QuizAttempt).join(Quiz).filter(
            QuizAttempt.student_id == student.id,
            Quiz.course_id == course_id,
            QuizAttempt.completed_at.isnot(None),
            QuizAttempt.percentage.isnot(None)
        ).all()
        s_quiz_scores = [a.percentage for a in s_quiz_attempts]
        s_quiz_avg = round(sum(s_quiz_scores) / len(s_quiz_scores), 1) if s_quiz_scores else None

        # Student Coursework Avg
        s_cw_subs = db.query(AssignmentSubmission).join(Assignment).filter(
            AssignmentSubmission.student_id == student.id,
            Assignment.course_id == course_id,
            AssignmentSubmission.grade_marks.isnot(None)
        ).all()
        s_cw_scores = [(s.grade_marks / s.assignment.max_marks * 100.0) for s in s_cw_subs if s.assignment and s.assignment.max_marks > 0]
        s_cw_avg = round(sum(s_cw_scores) / len(s_cw_scores), 1) if s_cw_scores else None

        # Student Material Completion
        s_completed_mat = db.query(func.count(StudentMaterialProgress.id)).join(
            Material, StudentMaterialProgress.material_id == Material.id
        ).join(
            Lesson, Material.lesson_id == Lesson.id
        ).filter(
            Lesson.course_id == course_id,
            StudentMaterialProgress.student_id == student.id,
            StudentMaterialProgress.is_completed == True
        ).scalar() or 0

        s_mat_pct = round((s_completed_mat / total_materials * 100), 1) if total_materials > 0 else 0.0

        # AI Questions asked
        s_ai_questions = db.query(func.count(StudentQuestion.id)).filter(
            StudentQuestion.student_id == student.id,
            StudentQuestion.course_id == course_id
        ).scalar() or 0

        # Composite Score (35% Quiz + 35% Coursework + 20% Materials + 10% AI questions)
        q_component = (s_quiz_avg if s_quiz_avg is not None else 0.0) * 0.35
        cw_component = (s_cw_avg if s_cw_avg is not None else 0.0) * 0.35
        mat_component = s_mat_pct * 0.20
        ai_component = min(100.0, (s_ai_questions / 3.0) * 100.0) * 0.10
        composite_score = round(q_component + cw_component + mat_component + ai_component, 1)

        # Risk Classification
        if composite_score < 50.0 or ((s_quiz_avg is not None and s_quiz_avg < 50.0) and (s_cw_avg is not None and s_cw_avg < 50.0)):
            risk_level = "at_risk"
            at_risk_count += 1
        elif composite_score < 70.0:
            risk_level = "moderate"
        else:
            risk_level = "healthy"

        student_roster.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "email": student.email,
            "enrolled_at": enr.enrolled_at.isoformat(),
            "quiz_avg": s_quiz_avg,
            "quizzes_taken": len(s_quiz_scores),
            "coursework_avg": s_cw_avg,
            "courseworks_submitted": len(s_cw_subs),
            "material_completion_pct": s_mat_pct,
            "ai_questions_asked": s_ai_questions,
            "composite_score": composite_score,
            "risk_level": risk_level
        })

    # 5. AI Insights & Confusion Topics
    topics = db.query(StudentQuestion.topic_category, func.count(StudentQuestion.id).label("count")).filter(
        StudentQuestion.course_id == course_id,
        StudentQuestion.topic_category != None
    ).group_by(StudentQuestion.topic_category).order_by(func.count(StudentQuestion.id).desc()).limit(10).all()

    top_confusion_areas = [{"topic": t[0], "count": t[1]} for t in topics]
    total_ai_questions = db.query(func.count(StudentQuestion.id)).filter(StudentQuestion.course_id == course_id).scalar() or 0

    return {
        "course_id": course_id,
        "course_title": course.title,
        "summary": {
            "total_students": total_enrolled,
            "average_quiz_score": avg_quiz_pct,
            "average_coursework_score": avg_coursework_pct,
            "material_completion_rate": overall_material_pct,
            "total_ai_questions": total_ai_questions,
            "at_risk_students_count": at_risk_count,
        },
        "coursework_breakdown": coursework_list,
        "quiz_breakdown": quiz_list,
        "material_breakdown": {
            "total_materials": total_materials,
            "overall_completion_pct": overall_material_pct,
            "by_type": material_type_stats
        },
        "student_roster": student_roster,
        "top_confusion_areas": top_confusion_areas,
    }

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
    
    total_course_quizzes = db.query(func.count(Quiz.id)).filter(Quiz.course_id == course_id).scalar() or 0
    total_course_lessons = db.query(func.count(Lesson.id)).filter(Lesson.course_id == course_id).scalar() or 0
    total_course_assignments = db.query(func.count(Assignment.id)).filter(Assignment.course_id == course_id).scalar() or 0

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

        submitted_assignments = db.query(func.count(AssignmentSubmission.id)).join(
            Assignment, AssignmentSubmission.assignment_id == Assignment.id
        ).filter(
            Assignment.course_id == course_id,
            AssignmentSubmission.student_id == student.id
        ).scalar() or 0

        # Weighted Engagement Score Component Calculation:
        # 1. Quiz Completion (40% Weight)
        quiz_score_pct = min(100.0, (q_taken / total_course_quizzes * 100.0)) if total_course_quizzes > 0 else (100.0 if q_taken > 0 else 0.0)
        
        # 2. Material Engagement & Progress (40% Weight)
        total_course_materials = db.query(func.count(Material.id)).join(
            Lesson, Material.lesson_id == Lesson.id
        ).filter(Lesson.course_id == course_id).scalar() or 0

        completed_mats = db.query(func.count(StudentMaterialProgress.id)).join(
            Material, StudentMaterialProgress.material_id == Material.id
        ).join(
            Lesson, Material.lesson_id == Lesson.id
        ).filter(
            StudentMaterialProgress.student_id == student.id,
            Lesson.course_id == course_id,
            StudentMaterialProgress.is_completed == True
        ).scalar() or 0

        mat_progress_pct = (completed_mats / total_course_materials * 100.0) if total_course_materials > 0 else 0.0
        coursework_pct = (submitted_assignments / total_course_assignments * 100.0) if total_course_assignments > 0 else 0.0

        material_logs = db.query(func.count(ActivityLog.id)).filter(
            ActivityLog.user_id == student.id,
            ActivityLog.action == "view_lesson"
        ).scalar() or 0
        mat_log_pct = min(100.0, (material_logs / total_course_lessons * 100.0)) if total_course_lessons > 0 else (100.0 if material_logs > 0 else 0.0)
        
        material_score_pct = max(mat_progress_pct, mat_log_pct)
        if total_course_lessons == 0 and total_course_materials == 0:
            material_score_pct = 100.0
        
        # 3. AI Questions Asked (20% Weight)
        ai_score_pct = min(100.0, (q_asked / 3.0 * 100.0))
        
        # Composite Weighted Score (0 - 100)
        weighted_score = (quiz_score_pct * 0.40) + (material_score_pct * 0.40) + (ai_score_pct * 0.20)

        eng_level = "high" if weighted_score >= 70.0 else ("medium" if weighted_score >= 40.0 else "low")
        summary[eng_level] += 1

        # Determine explicit flag reason
        missing_quizzes = total_course_quizzes - q_taken
        if missing_quizzes > 0:
            flag_reason = f"Missing {missing_quizzes} Quiz" if missing_quizzes == 1 else f"Missing {missing_quizzes} Quizzes"
        elif total_course_materials > 0 and completed_mats < total_course_materials:
            flag_reason = f"{completed_mats}/{total_course_materials} Materials"
        elif q_taken == 0:
            flag_reason = "No Quizzes Taken"
        elif q_asked == 0:
            flag_reason = "No AI Queries"
        else:
            flag_reason = f"{q_taken}/{total_course_quizzes} Quizzes"

        results.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "average_score": round(avg_score, 2) if avg_score is not None else None,
            "quizzes_taken": q_taken,
            "total_quizzes": total_course_quizzes,
            "quiz_completion_pct": round(quiz_score_pct, 1),
            "completed_materials": completed_mats,
            "total_materials": total_course_materials,
            "material_pct": round(mat_progress_pct, 1),
            "coursework_submitted": submitted_assignments,
            "total_coursework": total_course_assignments,
            "coursework_pct": round(coursework_pct, 1),
            "material_completion_pct": round(material_score_pct, 1),
            "questions_asked": q_asked,
            "weighted_score": round(weighted_score, 1),
            "flag_reason": flag_reason,
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
    
    # Coursework stats for student
    coursework_submitted = db.query(func.count(AssignmentSubmission.id)).filter(
        AssignmentSubmission.student_id == current_user.id,
        AssignmentSubmission.status.in_(["submitted", "graded", "returned"])
    ).scalar() or 0

    graded_subs = db.query(AssignmentSubmission).filter(
        AssignmentSubmission.student_id == current_user.id,
        AssignmentSubmission.grade_marks.isnot(None)
    ).all()
    cw_scores = [(s.grade_marks / s.assignment.max_marks * 100.0) for s in graded_subs if s.assignment and s.assignment.max_marks > 0]
    avg_coursework_score = round(sum(cw_scores) / len(cw_scores), 1) if cw_scores else 0.0

    # Total completed materials
    completed_materials = db.query(func.count(StudentMaterialProgress.id)).filter(
        StudentMaterialProgress.student_id == current_user.id,
        StudentMaterialProgress.is_completed == True
    ).scalar() or 0

    # Composite overall progress percentage
    overall_progress = round(
        (min(100.0, avg_score) * 0.4) +
        (min(100.0, avg_coursework_score) * 0.4) +
        (min(100.0, completed_materials * 5.0) * 0.2),
        1
    ) if (courses_enrolled > 0) else 0.0

    return {
        "overall_progress": overall_progress,
        "courses_enrolled": courses_enrolled,
        "quizzes_taken": quizzes_taken,
        "average_score": round(avg_score, 2),
        "questions_asked": questions_asked,
        "coursework_submitted": coursework_submitted,
        "average_coursework_score": avg_coursework_score,
        "completed_materials": completed_materials,
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
    from app.models import Quiz, QuizAttempt, StudentQuestion, Material, Lesson, StudentMaterialProgress, Assignment, AssignmentSubmission, Course

    # 1. Study Materials (45% max weight)
    total_materials = db.query(func.count(Material.id)).join(Lesson).filter(Lesson.course_id == course_id).scalar() or 0
    completed_materials = db.query(func.count(StudentMaterialProgress.id)).join(
        Material, StudentMaterialProgress.material_id == Material.id
    ).join(
        Lesson, Material.lesson_id == Lesson.id
    ).filter(
        Lesson.course_id == course_id,
        StudentMaterialProgress.student_id == current_user.id,
        StudentMaterialProgress.is_completed == True
    ).scalar() or 0
    materials_ratio = (completed_materials / total_materials) if total_materials > 0 else 1.0
    materials_completion_pct = round(materials_ratio * 100.0, 1)
    materials_score = round(materials_ratio * 45.0, 1)

    # 2. Coursework Assignments (35% max weight)
    total_assignments = db.query(func.count(Assignment.id)).filter(Assignment.course_id == course_id).scalar() or 0
    submitted_assignments = db.query(func.count(AssignmentSubmission.assignment_id.distinct())).join(Assignment).filter(
        AssignmentSubmission.student_id == current_user.id,
        Assignment.course_id == course_id,
        AssignmentSubmission.status.in_(["submitted", "graded", "returned"])
    ).scalar() or 0
    coursework_ratio = (submitted_assignments / total_assignments) if total_assignments > 0 else 1.0
    coursework_completion_pct = round(coursework_ratio * 100.0, 1)
    coursework_score = round(coursework_ratio * 35.0, 1)

    # 3. Quizzes (20% max weight)
    total_quizzes = db.query(func.count(Quiz.id)).filter(Quiz.course_id == course_id).scalar() or 0
    completed_quizzes = db.query(func.count(QuizAttempt.quiz_id.distinct())).join(QuizAttempt.quiz).filter(
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.quiz.has(course_id=course_id),
        QuizAttempt.completed_at.isnot(None),
    ).scalar() or 0
    quiz_ratio = (completed_quizzes / total_quizzes) if total_quizzes > 0 else 1.0
    quiz_completion_pct = round(quiz_ratio * 100.0, 1)
    quiz_score = round(quiz_ratio * 20.0, 1)

    # Weighted Total Course Completion Percentage (100% total)
    completion_percentage = round(materials_score + coursework_score + quiz_score, 1)
    
    questions_asked = db.query(func.count(StudentQuestion.id)).filter(
        StudentQuestion.student_id == current_user.id,
        StudentQuestion.course_id == course_id
    ).scalar() or 0
    
    # Get course title
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
        "completed_materials": completed_materials,
        "total_materials": total_materials,
        "submitted_assignments": submitted_assignments,
        "total_assignments": total_assignments,
        "materials_completion_pct": materials_completion_pct,
        "coursework_completion_pct": coursework_completion_pct,
        "quiz_completion_pct": quiz_completion_pct,
        "materials_score": materials_score,
        "coursework_score": coursework_score,
        "quiz_score": quiz_score,
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
