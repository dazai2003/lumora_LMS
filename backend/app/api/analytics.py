from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Any
from datetime import datetime

from app.database import get_db
from app.models import (
    User, UserRole, Course, StudentQuestion, AIResponse, Enrollment, QuizAttempt, Quiz,
    Lesson, Material, StudentMaterialProgress, ActivityLog, Assignment, AssignmentSubmission,
    ALExam, ALExamType, ALStudentSubmission, MaterialFlag
)
from app.schemas import StudentCourseProgressResponse
from app.auth import get_current_user, require_role

def _is_mcq_exam(exam) -> bool:
    if not exam: return False
    t = getattr(exam.exam_type, "value", str(exam.exam_type)).lower()
    return "mcq" in t or "paper_1" in t

def _is_structured_exam(exam) -> bool:
    if not exam: return False
    t = getattr(exam.exam_type, "value", str(exam.exam_type)).lower()
    return "structured" in t or "part_a" in t

def _is_essay_exam(exam) -> bool:
    if not exam: return False
    t = getattr(exam.exam_type, "value", str(exam.exam_type)).lower()
    return "essay" in t or "part_b" in t

def _is_paper_2_exam(exam) -> bool:
    if not exam: return False
    t = getattr(exam.exam_type, "value", str(exam.exam_type)).lower()
    return "structured" in t or "essay" in t or "paper_2" in t or "part_a" in t or "part_b" in t

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

        # A/L Exam calculations (MCQ, Structured, Essay, Composite)
        al_exams = db.query(ALExam).filter(ALExam.course_id == c.id).all()
        al_exam_ids = [e.id for e in al_exams]
        
        al_subs = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.exam_id.in_(al_exam_ids),
            ALStudentSubmission.percentage.isnot(None)
        ).all() if al_exam_ids else []

        all_exam_scores = [float(s.percentage) for s in al_subs if s.percentage is not None]
        avg_exam_score = round(sum(all_exam_scores) / len(all_exam_scores), 1) if all_exam_scores else None

        mcq_subs = [float(s.percentage) for s in al_subs if _is_mcq_exam(s.exam) and s.percentage is not None]
        avg_mcq_score = round(sum(mcq_subs) / len(mcq_subs), 1) if mcq_subs else None

        str_subs = [float(s.percentage) for s in al_subs if _is_structured_exam(s.exam) and s.percentage is not None]
        avg_str_score = round(sum(str_subs) / len(str_subs), 1) if str_subs else None

        esy_subs = [float(s.percentage) for s in al_subs if _is_essay_exam(s.exam) and s.percentage is not None]
        avg_esy_score = round(sum(esy_subs) / len(esy_subs), 1) if esy_subs else None

        results.append({
            "course_id": c.id,
            "course_title": c.title,
            "total_students": students_count,
            "average_quiz_score": round(avg_score, 2),
            "average_coursework_score": avg_cw_score,
            "average_exam_score": avg_exam_score,
            "average_mcq_score": avg_mcq_score,
            "average_structured_score": avg_str_score,
            "average_essay_score": avg_esy_score,
            "total_exams_count": len(al_exams),
            "total_submissions_count": len(al_subs),
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

        # Student AL Exam Submissions
        s_al_subs = db.query(ALStudentSubmission).join(ALExam).filter(
            ALStudentSubmission.student_id == student.id,
            ALExam.course_id == course_id,
            ALStudentSubmission.percentage.isnot(None)
        ).all()
        s_al_scores = [float(s.percentage) for s in s_al_subs if s.percentage is not None]
        s_al_avg = round(sum(s_al_scores) / len(s_al_scores), 1) if s_al_scores else None

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

        # Unresolved Flags
        s_unresolved_flags = db.query(func.count(MaterialFlag.id)).join(
            Material, MaterialFlag.material_id == Material.id
        ).join(
            Lesson, Material.lesson_id == Lesson.id
        ).filter(
            Lesson.course_id == course_id,
            MaterialFlag.student_id == student.id,
            MaterialFlag.is_resolved == False
        ).scalar() or 0

        # AI Questions asked
        s_ai_questions = db.query(func.count(StudentQuestion.id)).filter(
            StudentQuestion.student_id == student.id,
            StudentQuestion.course_id == course_id
        ).scalar() or 0

        # Overall Best Available Assessment Score (AL Exams take precedence, then Quiz, then Coursework)
        effective_assessment_avg = s_al_avg if s_al_avg is not None else s_quiz_avg if s_quiz_avg is not None else s_cw_avg

        # Composite Score (40% Assessment + 35% Materials + 15% Flags penalty + 10% AI questions)
        as_comp = (effective_assessment_avg if effective_assessment_avg is not None else 0.0) * 0.40
        mat_comp = s_mat_pct * 0.35
        ai_comp = min(100.0, (s_ai_questions / 3.0) * 100.0) * 0.10
        flag_penalty = max(0.0, 15.0 - (s_unresolved_flags * 5.0))
        composite_score = round(as_comp + mat_comp + ai_comp + flag_penalty, 1)

        # Status Diagnostic (Separating Absence from Failure)
        has_any_activity = bool(s_mat_pct > 0 or len(s_quiz_scores) > 0 or len(s_cw_subs) > 0 or len(s_al_scores) > 0 or s_ai_questions > 0 or s_unresolved_flags > 0)
        
        if not has_any_activity:
            status_code = "NO_ACTIVITY"
            status_label = "No Activity"
            status_reason = "No materials, assessments, or interactions recorded"
            risk_level = "at_risk"
            at_risk_count += 1
        elif effective_assessment_avg is None:
            status_code = "LIMITED_DATA"
            status_label = "Limited Data"
            status_reason = "Coursework in progress but no assessment submissions recorded"
            risk_level = "moderate"
        elif (effective_assessment_avg is not None and effective_assessment_avg < 50.0) or s_unresolved_flags >= 2:
            status_code = "NEEDS_ATTENTION"
            status_label = "Needs Attention"
            status_reason = f"Assessment score {effective_assessment_avg or 0}% or {s_unresolved_flags} open flags"
            risk_level = "at_risk"
            at_risk_count += 1
        elif effective_assessment_avg is not None and effective_assessment_avg >= 65.0 and s_mat_pct >= 40.0:
            status_code = "ON_TRACK"
            status_label = "On Track"
            status_reason = f"Consistent attainment ({effective_assessment_avg}%) and {s_mat_pct}% completion"
            risk_level = "healthy"
        else:
            status_code = "ACTIVE"
            status_label = "Active"
            status_reason = "Active student participation with developing evidence"
            risk_level = "moderate"

        student_roster.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "email": student.email,
            "enrolled_at": enr.enrolled_at.isoformat(),
            "quiz_avg": s_quiz_avg,
            "quizzes_taken": len(s_quiz_scores),
            "coursework_avg": s_cw_avg,
            "courseworks_submitted": len(s_cw_subs),
            "al_exam_avg": s_al_avg,
            "al_exams_taken": len(s_al_scores),
            "effective_assessment_avg": effective_assessment_avg,
            "material_completion_pct": s_mat_pct,
            "unresolved_flags": s_unresolved_flags,
            "ai_questions_asked": s_ai_questions,
            "composite_score": composite_score,
            "risk_level": risk_level,
            "status_code": status_code,
            "status_label": status_label,
            "status_reason": status_reason,
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
    
    # 1. Include legacy Quizzes if any
    for q in quizzes:
        avg_score = db.query(func.avg(QuizAttempt.percentage)).filter(QuizAttempt.quiz_id == q.id).scalar() or 0
        max_score = db.query(func.max(QuizAttempt.percentage)).filter(QuizAttempt.quiz_id == q.id).scalar()
        min_score = db.query(func.min(QuizAttempt.percentage)).filter(QuizAttempt.quiz_id == q.id).scalar()
        attempts_count = db.query(func.count(QuizAttempt.id)).filter(QuizAttempt.quiz_id == q.id).scalar() or 0
        
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
            "exam_type": "legacy_quiz",
            "paper_phase": "Practice Quiz",
            "average_score": round(avg_score, 2) if attempts_count > 0 else None,
            "highest_score": round(max_score, 2) if max_score is not None else None,
            "lowest_score": round(min_score, 2) if min_score is not None else None,
            "completion_rate": 100.0 if attempts_count > 0 else 0.0,
            "total_attempts": attempts_count,
            "score_distribution": distribution
        })

    # 2. Include genuine A/L Exams
    al_exams = db.query(ALExam).filter(ALExam.course_id == course_id).order_by(ALExam.id.asc()).all()
    for ex in al_exams:
        subs = db.query(ALStudentSubmission).filter(
            ALStudentSubmission.exam_id == ex.id,
            ALStudentSubmission.percentage.isnot(None)
        ).all()
        scores = [float(s.percentage) for s in subs if s.percentage is not None]
        attempts_cnt = len(scores)
        
        avg_score = round(sum(scores) / len(scores), 1) if scores else None
        highest_score = round(max(scores), 1) if scores else None
        lowest_score = round(min(scores), 1) if scores else None
        
        distribution = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
        for s in scores:
            if s <= 20: distribution["0-20"] += 1
            elif s <= 40: distribution["21-40"] += 1
            elif s <= 60: distribution["41-60"] += 1
            elif s <= 80: distribution["61-80"] += 1
            else: distribution["81-100"] += 1

        ex_type_str = getattr(ex.exam_type, "value", str(ex.exam_type)).lower()
        if "mcq" in ex_type_str or "paper_1" in ex_type_str:
            phase_label = "Paper I (MCQ)"
        elif "structured" in ex_type_str or "part_a" in ex_type_str:
            phase_label = "Paper II-A (Structured)"
        elif "essay" in ex_type_str or "part_b" in ex_type_str:
            phase_label = "Paper II-B (Essay)"
        else:
            phase_label = "A/L Assessment"

        results.append({
            "quiz_id": ex.id,
            "exam_id": ex.id,
            "quiz_title": ex.title,
            "exam_type": ex_type_str,
            "paper_phase": phase_label,
            "total_questions": len(ex.questions),
            "average_score": avg_score,
            "highest_score": highest_score,
            "lowest_score": lowest_score,
            "completion_rate": 100.0 if attempts_cnt > 0 else 0.0,
            "total_attempts": attempts_cnt,
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
    total_course_exams = db.query(func.count(ALExam.id)).filter(ALExam.course_id == course_id).scalar() or 0
    total_course_lessons = db.query(func.count(Lesson.id)).filter(Lesson.course_id == course_id).scalar() or 0
    total_course_assignments = db.query(func.count(Assignment.id)).filter(Assignment.course_id == course_id).scalar() or 0

    total_course_materials = db.query(func.count(Material.id)).join(
        Lesson, Material.lesson_id == Lesson.id
    ).filter(Lesson.course_id == course_id).scalar() or 0

    for enr in enrollments:
        student = db.query(User).filter(User.id == enr.student_id).first()
        if not student: continue

        # 1. AL Exam Performance
        s_al_subs = db.query(ALStudentSubmission).join(ALExam).filter(
            ALStudentSubmission.student_id == student.id,
            ALExam.course_id == course_id,
            ALStudentSubmission.percentage.isnot(None)
        ).all()
        s_al_scores = [float(s.percentage) for s in s_al_subs if s.percentage is not None]
        s_al_avg = round(sum(s_al_scores) / len(s_al_scores), 1) if s_al_scores else None

        mcq_subs = [float(s.percentage) for s in s_al_subs if _is_mcq_exam(s.exam) and s.percentage is not None]
        s_p1_score = round(sum(mcq_subs) / len(mcq_subs), 1) if mcq_subs else None

        p2_subs = [float(s.percentage) for s in s_al_subs if _is_paper_2_exam(s.exam) and s.percentage is not None]
        s_p2_score = round(sum(p2_subs) / len(p2_subs), 1) if p2_subs else None

        # 2. Legacy Quiz & Coursework Performance
        avg_quiz_score = db.query(func.avg(QuizAttempt.percentage)).join(QuizAttempt.quiz).filter(
            QuizAttempt.student_id == student.id,
            QuizAttempt.quiz.has(course_id=course_id)
        ).scalar()
        q_taken = db.query(func.count(QuizAttempt.id)).join(QuizAttempt.quiz).filter(
            QuizAttempt.student_id == student.id,
            QuizAttempt.quiz.has(course_id=course_id)
        ).scalar() or 0

        submitted_assignments = db.query(func.count(AssignmentSubmission.id)).join(
            Assignment, AssignmentSubmission.assignment_id == Assignment.id
        ).filter(
            Assignment.course_id == course_id,
            AssignmentSubmission.student_id == student.id
        ).scalar() or 0

        # 3. Materials Progress
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

        # 4. Questions & Flags
        q_asked = db.query(func.count(StudentQuestion.id)).filter(
            StudentQuestion.student_id == student.id,
            StudentQuestion.course_id == course_id
        ).scalar() or 0

        unresolved_flags = db.query(func.count(MaterialFlag.id)).join(
            Material, MaterialFlag.material_id == Material.id
        ).join(
            Lesson, Material.lesson_id == Lesson.id
        ).filter(
            Lesson.course_id == course_id,
            MaterialFlag.student_id == student.id,
            MaterialFlag.is_resolved == False
        ).scalar() or 0

        # Effective Assessment Attainment
        effective_assessment = s_al_avg if s_al_avg is not None else avg_quiz_score
        exam_completion_pct = (len(s_al_subs) / total_course_exams * 100.0) if total_course_exams > 0 else 100.0

        # Weighted Engagement Score:
        # 40% Assessment Attainment + 40% Material Progress + 20% AI Questions
        ai_score_pct = min(100.0, (q_asked / 3.0 * 100.0))
        weighted_score = ((effective_assessment or 0.0) * 0.40) + (mat_progress_pct * 0.40) + (ai_score_pct * 0.20)

        # Engagement level classification aligning with deterministic analytics:
        if (effective_assessment is not None and effective_assessment < 50.0) or (mat_progress_pct < 10.0 and (effective_assessment or 0) < 50.0):
            eng_level = "low"
            flag_reason = f"Low Assessment ({effective_assessment or 0}%)"
        elif (effective_assessment is not None and effective_assessment >= 65.0 and mat_progress_pct >= 40.0) or weighted_score >= 65.0:
            eng_level = "high"
            flag_reason = "On Track & Consistent"
        else:
            eng_level = "medium"
            flag_reason = f"Developing Attainment ({round(mat_progress_pct)}% Materials)"

        summary[eng_level] += 1

        results.append({
            "student_id": student.id,
            "student_name": student.full_name,
            "average_score": s_al_avg if s_al_avg is not None else round(avg_quiz_score, 2) if avg_quiz_score is not None else None,
            "paper_1_score": s_p1_score,
            "paper_2_score": s_p2_score,
            "exam_avg": s_al_avg,
            "exams_taken": len(s_al_subs),
            "total_exams": total_course_exams,
            "exam_completion_pct": round(exam_completion_pct, 1),
            "quizzes_taken": q_taken,
            "total_quizzes": total_course_quizzes,
            "quiz_completion_pct": round((q_taken / total_course_quizzes * 100.0) if total_course_quizzes > 0 else 100.0, 1),
            "completed_materials": completed_mats,
            "total_materials": total_course_materials,
            "material_pct": round(mat_progress_pct, 1),
            "coursework_submitted": submitted_assignments,
            "total_coursework": total_course_assignments,
            "coursework_pct": round((submitted_assignments / total_course_assignments * 100.0) if total_course_assignments > 0 else 0.0, 1),
            "material_completion_pct": round(mat_progress_pct, 1),
            "questions_asked": q_asked,
            "unresolved_flags": unresolved_flags,
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
    # Enrolled courses
    enrollments = db.query(Enrollment).filter(Enrollment.student_id == current_user.id).all()
    courses_enrolled = len(enrollments)
    enrolled_course_ids = [e.course_id for e in enrollments]

    # Questions asked
    questions_asked = db.query(func.count(StudentQuestion.id)).filter(StudentQuestion.student_id == current_user.id).scalar() or 0
    
    # Materials completed & total
    total_materials = db.query(func.count(Material.id)).join(Lesson).filter(Lesson.course_id.in_(enrolled_course_ids)).scalar() or 0 if enrolled_course_ids else 0
    completed_materials = db.query(func.count(StudentMaterialProgress.id)).join(
        Material, StudentMaterialProgress.material_id == Material.id
    ).join(
        Lesson, Material.lesson_id == Lesson.id
    ).filter(
        Lesson.course_id.in_(enrolled_course_ids),
        StudentMaterialProgress.student_id == current_user.id,
        StudentMaterialProgress.is_completed == True
    ).scalar() or 0 if enrolled_course_ids else 0

    # AL Exam Submissions
    all_completed_subs = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.student_id == current_user.id,
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).order_by(ALStudentSubmission.submitted_at.desc(), ALStudentSubmission.started_at.desc()).all()

    papers_taken = len(set(s.exam_id for s in all_completed_subs))
    exam_percentages = [s.percentage for s in all_completed_subs if s.percentage is not None]
    
    # Fallback to quiz attempts if no AL exams attempted yet
    quiz_avg = db.query(func.avg(QuizAttempt.percentage)).filter(QuizAttempt.student_id == current_user.id).scalar() or 0.0
    quizzes_taken = db.query(func.count(QuizAttempt.id)).filter(QuizAttempt.student_id == current_user.id).scalar() or 0

    if exam_percentages:
        average_exam_score = round(sum(exam_percentages) / len(exam_percentages), 1)
    elif quiz_avg > 0:
        average_exam_score = round(quiz_avg, 1)
    else:
        average_exam_score = 0.0

    # Predicted Grade calculation
    if average_exam_score >= 75.0:
        predicted_grade = "A"
    elif average_exam_score >= 65.0:
        predicted_grade = "B"
    elif average_exam_score >= 55.0:
        predicted_grade = "C"
    elif average_exam_score >= 35.0:
        predicted_grade = "S"
    elif average_exam_score > 0:
        predicted_grade = "F"
    else:
        predicted_grade = "—"

    # Recent 5 exam scores
    recent_exam_scores = []
    for s in all_completed_subs[:5]:
        score_val = round(s.percentage or 0.0, 1)
        grade_val = s.grade or ("A" if score_val >= 75 else "B" if score_val >= 65 else "C" if score_val >= 55 else "S" if score_val >= 35 else "F")
        recent_exam_scores.append({
            "exam_id": s.exam_id,
            "exam_title": s.exam.title if s.exam else f"Examination #{s.exam_id}",
            "score": score_val,
            "grade": grade_val,
            "date": s.submitted_at.isoformat() if s.submitted_at else (s.started_at.isoformat() if s.started_at else None)
        })

    # If no AL exam submissions, populate recent from quiz attempts
    if not recent_exam_scores:
        recent_quizzes = db.query(QuizAttempt).filter(
            QuizAttempt.student_id == current_user.id,
            QuizAttempt.completed_at.isnot(None),
            QuizAttempt.percentage.isnot(None)
        ).order_by(QuizAttempt.completed_at.desc()).limit(5).all()
        for q in recent_quizzes:
            q_score = round(q.percentage or 0.0, 1)
            recent_exam_scores.append({
                "exam_id": q.quiz_id,
                "exam_title": q.quiz.title if q.quiz else "Practice Quiz",
                "score": q_score,
                "grade": "A" if q_score >= 75 else "B" if q_score >= 65 else "C" if q_score >= 55 else "S" if q_score >= 35 else "F",
                "date": q.completed_at.isoformat() if q.completed_at else None
            })

    # Compute overall curriculum progress across enrolled courses
    course_progress_list = []
    for cid in enrolled_course_ids:
        # Materials (40%)
        c_total_mat = db.query(func.count(Material.id)).join(Lesson).filter(Lesson.course_id == cid).scalar() or 0
        c_comp_mat = db.query(func.count(StudentMaterialProgress.id)).join(
            Material, StudentMaterialProgress.material_id == Material.id
        ).join(
            Lesson, Material.lesson_id == Lesson.id
        ).filter(
            Lesson.course_id == cid,
            StudentMaterialProgress.student_id == current_user.id,
            StudentMaterialProgress.is_completed == True
        ).scalar() or 0
        m_score = (c_comp_mat / c_total_mat * 40.0) if c_total_mat > 0 else 40.0

        # Paper 1 (30%)
        p1_list = [e for e in db.query(ALExam).filter(ALExam.course_id == cid, ALExam.is_published == True).all() if _is_mcq_exam(e)]
        p1_ids = [e.id for e in p1_list]
        comp_p1 = db.query(ALStudentSubmission.exam_id.distinct()).filter(
            ALStudentSubmission.student_id == current_user.id,
            ALStudentSubmission.exam_id.in_(p1_ids),
            ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
        ).count() if p1_ids else 0
        p1_score = (comp_p1 / len(p1_list) * 30.0) if p1_list else 30.0

        # Paper 2 (30%)
        p2_list = [e for e in db.query(ALExam).filter(ALExam.course_id == cid, ALExam.is_published == True).all() if _is_paper_2_exam(e) and not _is_mcq_exam(e)]
        p2_ids = [e.id for e in p2_list]
        comp_p2 = db.query(ALStudentSubmission.exam_id.distinct()).filter(
            ALStudentSubmission.student_id == current_user.id,
            ALStudentSubmission.exam_id.in_(p2_ids),
            ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
        ).count() if p2_ids else 0
        p2_score = (comp_p2 / len(p2_list) * 30.0) if p2_list else 30.0

        course_progress_list.append(round(m_score + p1_score + p2_score, 1))

    overall_progress = round(sum(course_progress_list) / len(course_progress_list), 1) if course_progress_list else 0.0

    # Coursework stats for backward compatibility
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

    return {
        "overall_progress": overall_progress,
        "courses_enrolled": courses_enrolled,
        "papers_taken": papers_taken,
        "average_exam_score": average_exam_score,
        "predicted_grade": predicted_grade,
        "recent_exam_scores": recent_exam_scores,
        "questions_asked": questions_asked,
        "completed_materials": completed_materials,
        "total_materials": total_materials,
        "quizzes_taken": quizzes_taken,
        "average_score": round(quiz_avg, 2),
        "coursework_submitted": coursework_submitted,
        "average_coursework_score": avg_coursework_score,
    }

@router.get("/student/quiz-history")
async def get_student_quiz_history(
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db),
):
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
    from app.models import Quiz, QuizAttempt, StudentQuestion, Material, Lesson, StudentMaterialProgress, Assignment, AssignmentSubmission, Course, ALExam, ALStudentSubmission

    # 1. Study Materials (40% max weight)
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
    materials_score = round(materials_ratio * 40.0, 1)

    # 2. Paper 1 (30% max weight - MCQ Examination Papers)
    all_p1_exams = [e for e in db.query(ALExam).filter(ALExam.course_id == course_id, ALExam.is_published == True).all() if _is_mcq_exam(e)]
    total_paper_1 = len(all_p1_exams)
    p1_ids = [e.id for e in all_p1_exams]
    p1_subs = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.student_id == current_user.id,
        ALStudentSubmission.exam_id.in_(p1_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all() if p1_ids else []
    completed_p1_ids = set(s.exam_id for s in p1_subs)
    completed_paper_1 = len(completed_p1_ids)
    paper_1_ratio = (completed_paper_1 / total_paper_1) if total_paper_1 > 0 else 1.0
    paper_1_completion_pct = round(paper_1_ratio * 100.0, 1)
    paper_1_score = round(paper_1_ratio * 30.0, 1)

    # 3. Paper 2 (30% max weight - Structured & Essay Examination Papers)
    all_p2_exams = [e for e in db.query(ALExam).filter(ALExam.course_id == course_id, ALExam.is_published == True).all() if _is_paper_2_exam(e) and not _is_mcq_exam(e)]
    total_paper_2 = len(all_p2_exams)
    p2_ids = [e.id for e in all_p2_exams]
    p2_subs = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.student_id == current_user.id,
        ALStudentSubmission.exam_id.in_(p2_ids),
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all() if p2_ids else []
    completed_p2_ids = set(s.exam_id for s in p2_subs)
    completed_paper_2 = len(completed_p2_ids)
    paper_2_ratio = (completed_paper_2 / total_paper_2) if total_paper_2 > 0 else 1.0
    paper_2_completion_pct = round(paper_2_ratio * 100.0, 1)
    paper_2_score = round(paper_2_ratio * 30.0, 1)

    # Total Weighted Course Completion Percentage (100% Total)
    completion_percentage = round(materials_score + paper_1_score + paper_2_score, 1)

    # Mastery & Engagement for Course
    papers_done = completed_paper_1 + completed_paper_2
    total_papers = total_paper_1 + total_paper_2

    questions_asked = db.query(func.count(StudentQuestion.id)).filter(
        StudentQuestion.student_id == current_user.id,
        StudentQuestion.course_id == course_id
    ).scalar() or 0

    # Pending Papers
    all_course_exams = all_p1_exams + all_p2_exams
    completed_all_exam_ids = completed_p1_ids.union(completed_p2_ids)
    pending_papers = [
        {
            "id": e.id,
            "title": e.title,
            "exam_type": getattr(e.exam_type, "value", str(e.exam_type))
        }
        for e in all_course_exams if e.id not in completed_all_exam_ids
    ]

    # Low Score Papers (< 50%)
    all_course_subs = p1_subs + p2_subs
    low_score_papers = [
        {
            "id": s.exam_id,
            "title": s.exam.title if s.exam else f"Paper #{s.exam_id}",
            "score": round(s.percentage or 0.0, 1)
        }
        for s in all_course_subs if (s.percentage or 0.0) < 50.0
    ]
    
    # Get course title
    course = db.query(Course).filter(Course.id == course_id).first()
    course_title = course.title if course else "Unknown"

    # Backward compatibility for quizzes & coursework assignments
    total_assignments = db.query(func.count(Assignment.id)).filter(Assignment.course_id == course_id).scalar() or 0
    submitted_assignments = db.query(func.count(AssignmentSubmission.assignment_id.distinct())).join(Assignment).filter(
        AssignmentSubmission.student_id == current_user.id,
        Assignment.course_id == course_id,
        AssignmentSubmission.status.in_(["submitted", "graded", "returned"])
    ).scalar() or 0
    coursework_ratio = (submitted_assignments / total_assignments) if total_assignments > 0 else 1.0
    coursework_score = round(coursework_ratio * 30.0, 1)

    total_quizzes = db.query(func.count(Quiz.id)).filter(Quiz.course_id == course_id).scalar() or 0
    completed_quizzes = db.query(func.count(QuizAttempt.quiz_id.distinct())).join(QuizAttempt.quiz).filter(
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.quiz.has(course_id=course_id),
        QuizAttempt.completed_at.isnot(None),
    ).scalar() or 0
    quiz_ratio = (completed_quizzes / total_quizzes) if total_quizzes > 0 else 1.0
    quiz_score = round(quiz_ratio * 30.0, 1)

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

        status = "completed" if completed else ("in_progress" if in_progress else "not_attempted")
        score = completed.percentage if completed else None
        quiz_results.append({
            "quiz_id": q.id,
            "quiz_title": q.title,
            "status": status,
            "score": score,
        })
    
    # 4. Detailed Unit & Lesson Level Progress Tracking (Phase T7)
    from app.models import Unit
    course_units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order).all()
    course_lessons = db.query(Lesson).filter(Lesson.course_id == course_id, Lesson.is_published == True).order_by(Lesson.order).all()
    
    all_course_materials = db.query(Material).join(Lesson).filter(Lesson.course_id == course_id).all()
    mat_ids = [m.id for m in all_course_materials]
    
    student_mat_progs = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.student_id == current_user.id,
        StudentMaterialProgress.material_id.in_(mat_ids)
    ).all() if mat_ids else []
    mat_prog_map = {p.material_id: p for p in student_mat_progs}
    
    # Lesson progress breakdown
    lesson_progress = []
    lesson_status_map = {}
    for ls in course_lessons:
        ls_mats = [m for m in all_course_materials if m.lesson_id == ls.id]
        total_mats = len(ls_mats)
        comp_mats = sum(1 for m in ls_mats if m.id in mat_prog_map and mat_prog_map[m.id].is_completed)
        has_started = any(m.id in mat_prog_map and (mat_prog_map[m.id].last_position or 0) > 0 for m in ls_mats)
        
        if total_mats == 0:
            status = "not_reviewed"
        elif comp_mats == total_mats:
            status = "reviewed"
        elif comp_mats > 0 or has_started:
            status = "engaging"
        else:
            status = "not_reviewed"
            
        lesson_status_map[ls.id] = status
        lesson_progress.append({
            "lesson_id": ls.id,
            "unit_id": ls.unit_id,
            "status": status,  # "reviewed" | "engaging" | "not_reviewed"
            "completed_materials": comp_mats,
            "total_materials": total_mats,
            "is_completed": comp_mats == total_mats if total_mats > 0 else False
        })
        
    # Unit progress breakdown
    unit_progress = []
    for u in course_units:
        u_lessons = [ls for ls in course_lessons if ls.unit_id == u.id]
        total_u_lessons = len(u_lessons)
        completed_u_lessons = sum(1 for ls in u_lessons if lesson_status_map.get(ls.id) == "reviewed")
        
        u_mats = [m for ls in u_lessons for m in all_course_materials if m.lesson_id == ls.id]
        total_u_mats = len(u_mats)
        completed_u_mats = sum(1 for m in u_mats if m.id in mat_prog_map and mat_prog_map[m.id].is_completed)
        
        unit_progress.append({
            "unit_id": u.id,
            "completed_lessons": completed_u_lessons,
            "total_lessons": total_u_lessons,
            "completed_materials": completed_u_mats,
            "total_materials": total_u_mats,
            "completed_fraction": f"{completed_u_lessons}/{total_u_lessons} Completed" if total_u_lessons > 0 else "0/0 Completed",
            "is_completed": (completed_u_lessons == total_u_lessons and total_u_lessons > 0),
            "completion_percentage": round((completed_u_lessons / total_u_lessons * 100.0), 1) if total_u_lessons > 0 else 0.0
        })

    material_progress = [
        {
            "material_id": p.material_id,
            "last_position": p.last_position,
            "is_completed": p.is_completed,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None
        }
        for p in student_mat_progs
    ]
    
    return {
        "course_id": course_id,
        "course_title": course_title,
        "completion_percentage": completion_percentage,
        # Tri-factor breakdown (40% Materials, 30% Paper 1, 30% Paper 2)
        "materials_score": materials_score,
        "materials_completion_pct": materials_completion_pct,
        "completed_materials": completed_materials,
        "total_materials": total_materials,

        "paper_1_score": paper_1_score,
        "paper_1_completion_pct": paper_1_completion_pct,
        "completed_paper_1": completed_paper_1,
        "total_paper_1": total_paper_1,

        "paper_2_score": paper_2_score,
        "paper_2_completion_pct": paper_2_completion_pct,
        "completed_paper_2": completed_paper_2,
        "total_paper_2": total_paper_2,

        # Mastery & Engagement
        "papers_done": papers_done,
        "total_papers": total_papers,
        "questions_asked": questions_asked,

        # Unit, Lesson & Material Breakdown
        "unit_progress": unit_progress,
        "lesson_progress": lesson_progress,
        "material_progress": material_progress,

        # Pending & alerts
        "pending_papers": pending_papers,
        "low_score_papers": low_score_papers,

        # Legacy aliases for compatibility
        "completed_quizzes": completed_quizzes,
        "total_quizzes": total_quizzes,
        "submitted_assignments": submitted_assignments,
        "total_assignments": total_assignments,
        "coursework_completion_pct": round(coursework_ratio * 100.0, 1),
        "quiz_completion_pct": round(quiz_ratio * 100.0, 1),
        "coursework_score": coursework_score,
        "quiz_score": quiz_score,
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
    from app.models import Lesson, Quiz, Enrollment, User, QuizAttempt, StudentQuestion, Course

    today_dt = datetime.utcnow()
    # 14-day rolling window
    days = 14
    date_keys = [(today_dt.date() - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]

    enrollment_counts = {d: 0 for d in date_keys}
    registration_counts = {d: 0 for d in date_keys}
    quiz_counts = {d: 0 for d in date_keys}
    qa_counts = {d: 0 for d in date_keys}

    # Query Enrollments
    enrollments = db.query(Enrollment).all()
    for e in enrollments:
        if e.enrolled_at:
            d_str = e.enrolled_at.date().isoformat()
            if d_str in enrollment_counts:
                enrollment_counts[d_str] += 1

    # Query Registrations (Users)
    users = db.query(User).all()
    for u in users:
        if u.created_at:
            d_str = u.created_at.date().isoformat()
            if d_str in registration_counts:
                registration_counts[d_str] += 1

    # Query Quiz Attempts
    attempts = db.query(QuizAttempt).all()
    for a in attempts:
        ts = a.started_at or a.completed_at
        if ts:
            d_str = ts.date().isoformat()
            if d_str in quiz_counts:
                quiz_counts[d_str] += 1

    # Query Q&A Questions
    questions = db.query(StudentQuestion).all()
    for q in questions:
        if q.asked_at:
            d_str = q.asked_at.date().isoformat()
            if d_str in qa_counts:
                qa_counts[d_str] += 1

    enrollment_trend = [{"date": d, "count": enrollment_counts[d]} for d in date_keys]
    registration_trend = [{"date": d, "count": registration_counts[d]} for d in date_keys]
    quiz_attempt_trend = [{"date": d, "count": quiz_counts[d]} for d in date_keys]
    qa_trend = [{"date": d, "count": qa_counts[d]} for d in date_keys]

    # Course breakdown
    courses = db.query(Course).limit(10).all()
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

    # Dynamic Activity Feed
    activity_items = []

    # 1. Registered users
    recent_users = db.query(User).order_by(User.created_at.desc()).limit(10).all()
    for u in recent_users:
        if u.created_at:
            role_val = u.role.value if hasattr(u.role, 'value') else str(u.role)
            activity_items.append({
                "type": "user_register",
                "message": f"New {role_val} registered: {u.full_name or u.email}",
                "timestamp": u.created_at.isoformat()
            })

    # 2. Created courses
    recent_courses = db.query(Course).order_by(Course.created_at.desc()).limit(10).all()
    for c in recent_courses:
        if c.created_at:
            activity_items.append({
                "type": "course_create",
                "message": f"Course created: {c.title}",
                "timestamp": c.created_at.isoformat()
            })

    # 3. Quiz submissions
    recent_attempts = db.query(QuizAttempt).order_by(QuizAttempt.started_at.desc()).limit(10).all()
    for qa in recent_attempts:
        ts = qa.completed_at or qa.started_at
        if ts:
            quiz_title = qa.quiz.title if qa.quiz else "Quiz"
            score_str = f" ({qa.score:.0f}%)" if qa.score is not None else ""
            activity_items.append({
                "type": "quiz_submit",
                "message": f"Quiz attempt on '{quiz_title}'{score_str}",
                "timestamp": ts.isoformat()
            })

    # 4. AI questions
    recent_questions = db.query(StudentQuestion).order_by(StudentQuestion.asked_at.desc()).limit(10).all()
    for q in recent_questions:
        if q.asked_at:
            txt = q.question_text[:50] + "..." if len(q.question_text) > 50 else q.question_text
            activity_items.append({
                "type": "ai_question",
                "message": f"Student asked AI tutor: \"{txt}\"",
                "timestamp": q.asked_at.isoformat()
            })

    # Sort combined activities by timestamp descending
    activity_items.sort(key=lambda x: x["timestamp"], reverse=True)
    activity_feed = activity_items[:10] if activity_items else [
        {"type": "user_register", "message": "System operational", "timestamp": datetime.utcnow().isoformat()}
    ]

    return {
        "enrollment_trend": enrollment_trend,
        "registration_trend": registration_trend,
        "quiz_attempt_trend": quiz_attempt_trend,
        "qa_trend": qa_trend,
        "activity_feed": activity_feed,
        "course_breakdown": course_breakdown
    }


@router.get("/admin/ai-performance")
async def get_admin_ai_performance(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    from datetime import timedelta
    from app.models import AILog, StudentQuestion

    ai_logs = db.query(AILog).all()
    total_qa = db.query(func.count(StudentQuestion.id)).scalar() or 0

    if ai_logs:
        total_ops = len(ai_logs)
        completed = len([l for l in ai_logs if l.status == "completed"])
        failed = len([l for l in ai_logs if l.status == "failed"])
        success_rate = round((completed / total_ops * 100), 1) if total_ops > 0 else 100.0
        
        times = [l.processing_time_ms for l in ai_logs if l.processing_time_ms]
        avg_time = round(sum(times) / len(times)) if times else 1200

        action_map: Dict[str, Dict[str, Any]] = {}
        for l in ai_logs:
            act = l.action or "other"
            if act not in action_map:
                action_map[act] = {"count": 0, "total_time": 0}
            action_map[act]["count"] += 1
            if l.processing_time_ms:
                action_map[act]["total_time"] += l.processing_time_ms

        action_breakdown = [
            {
                "action": act,
                "count": data["count"],
                "avg_time_ms": round(data["total_time"] / data["count"]) if data["count"] > 0 else 0
            }
            for act, data in action_map.items()
        ]
    else:
        total_ops = max(total_qa, 1)
        completed = total_ops
        failed = 0
        success_rate = 100.0
        avg_time = 1200
        action_breakdown = [
            {"action": "q_and_a", "count": total_qa, "avg_time_ms": 1200},
            {"action": "quiz_generation", "count": 0, "avg_time_ms": 0},
            {"action": "summarization", "count": 0, "avg_time_ms": 0}
        ]

    today_dt = datetime.utcnow()
    date_keys = [(today_dt.date() - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    trend_counts = {d: 0 for d in date_keys}

    if ai_logs:
        for l in ai_logs:
            if l.created_at:
                d_str = l.created_at.date().isoformat()
                if d_str in trend_counts:
                    trend_counts[d_str] += 1
    else:
        questions = db.query(StudentQuestion).all()
        for q in questions:
            if q.asked_at:
                d_str = q.asked_at.date().isoformat()
                if d_str in trend_counts:
                    trend_counts[d_str] += 1

    usage_trend = [{"date": d, "count": trend_counts[d]} for d in date_keys]

    return {
        "total_operations": total_ops,
        "completed": completed,
        "failed": failed,
        "success_rate": success_rate,
        "avg_response_time_ms": avg_time,
        "action_breakdown": action_breakdown,
        "usage_trend": usage_trend
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


# ─────────────────────────────────────────────────────────────────────────────
# Phase V5.4: Cross-Analytics & Teacher Intelligence Endpoints
# ─────────────────────────────────────────────────────────────────────────────

from app.services.analytics.cross_analytics import (
    compute_course_cross_analytics, get_unit_question_inventory,
    compute_student_cross_analytics_dossier
)
from app.services.analytics.data_contracts import (
    TeacherCrossAnalyticsReport, UnitQuestionInventoryItem, StudentCrossAnalyticsDossier
)


@router.get("/teacher/course/{course_id}/cross-intelligence", response_model=TeacherCrossAnalyticsReport)
async def get_teacher_course_cross_intelligence(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db)
):
    """
    Returns unified course cross-analytics, 4-state divergence matrix,
    format divergence, cognitive depth, and evidence-based hotspots.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role != UserRole.ADMIN and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view analytics for this course")

    return compute_course_cross_analytics(course_id, db)


@router.get("/teacher/course/{course_id}/unit/{unit_id}/inspect-items", response_model=List[UnitQuestionInventoryItem])
async def get_teacher_unit_inspect_items(
    course_id: int,
    unit_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db)
):
    """
    Returns the real, genuine examination questions mapped to a syllabus unit,
    with average attainment, taxonomy level, and subpart/criteria counts (Zero internal UUIDs).
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role != UserRole.ADMIN and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view analytics for this course")

    return get_unit_question_inventory(course_id, unit_id, db)


@router.get("/teacher/course/{course_id}/student/{student_id}/cross-intelligence", response_model=StudentCrossAnalyticsDossier)
async def get_teacher_student_cross_intelligence(
    course_id: int,
    student_id: int,
    current_user: User = Depends(require_role(UserRole.TEACHER)),
    db: Session = Depends(get_db)
):
    """
    Returns a deep individual student cross-analytics dossier synthesizing
    assessment performance, material progress, flags, AI inquiries, and targeted teacher recommendations.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if current_user.role != UserRole.ADMIN and course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view analytics for this course")

    return compute_student_cross_analytics_dossier(student_id, course_id, db)


@router.get("/student/course/{course_id}/cross-intelligence", response_model=StudentCrossAnalyticsDossier)
async def get_student_self_cross_intelligence(
    course_id: int,
    current_user: User = Depends(require_role(UserRole.STUDENT)),
    db: Session = Depends(get_db)
):
    """
    Returns the student's own cross-analytics dossier (strictly isolated).
    """
    return compute_student_cross_analytics_dossier(current_user.id, course_id, db)
