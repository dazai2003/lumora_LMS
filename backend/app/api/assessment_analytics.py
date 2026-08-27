"""
A/L Assessment Analytics Foundation API Router.
Provides read-only, psychometric, hierarchical, material, and AI analytics endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import time

from app.database import get_db
from app.models import (
    User, UserRole, Course, Enrollment, ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer
)
from app.auth import get_current_user, require_role, require_admin_or_teacher
from app.services.analytics import (
    AnalyticsMeta,
    AnalyticsResponseEnvelope,
    compute_exam_foundation_overview,
    compute_mcq_exam_report,
    compute_structured_exam_report,
    compute_essay_exam_report,
    compute_course_material_analytics,
    compute_ask_ai_analytics,
    audit_exam_data_quality,
    compute_course_learning_overview,
    compute_unit_learning_assessment_crossover,
    compute_student_learning_profile,
    compute_student_mastery_report,
    compute_teacher_learning_intelligence,
    compute_student_learning_intelligence,
    generate_course_analytics_report,
    generate_course_analytics_csv,
)

router = APIRouter(tags=["A/L Assessment Analytics Foundation"])


def _check_exam_teacher_access(exam_id: int, current_user: User, db: Session) -> ALExam:
    """Helper to verify teacher or admin ownership of an exam's course."""
    exam = db.query(ALExam).filter(ALExam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="A/L Exam not found")
        
    if current_user.role != UserRole.ADMIN:
        course = db.query(Course).filter(Course.id == exam.course_id).first()
        if not course or course.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="You do not have access to analytics for this exam")
            
    return exam


def _check_course_teacher_access(course_id: int, current_user: User, db: Session) -> Course:
    """Helper to verify teacher or admin ownership of a course."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
        
    if current_user.role != UserRole.ADMIN:
        if course.teacher_id != current_user.id:
            raise HTTPException(status_code=403, detail="You do not have access to analytics for this course")
            
    return course


@router.get("/exams/{exam_id}/foundation", response_model=AnalyticsResponseEnvelope)
def get_exam_foundation_analytics(
    exam_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns high-level foundation overview metrics for an assessment.
    Includes score distribution buckets, grade distributions, and submission status counts.
    """
    t0 = time.time()
    exam = _check_exam_teacher_access(exam_id, current_user, db)
    
    overview = compute_exam_foundation_overview(exam_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    quality_status = "sufficient" if overview.total_submissions >= 10 else "insufficient_sample"
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=overview,
        meta=AnalyticsMeta(
            sample_size=overview.total_submissions,
            data_quality=quality_status,
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/exams/{exam_id}/mcq", response_model=AnalyticsResponseEnvelope)
def get_mcq_exam_analytics(
    exam_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns psychometric item analysis for Paper I MCQ assessment.
    Includes p-values, discrimination indices, option distributions A-E, and distractor efficiency warnings.
    """
    t0 = time.time()
    exam = _check_exam_teacher_access(exam_id, current_user, db)
    
    questions = db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).all()
    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id == exam_id,
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all()
    sub_ids = [s.id for s in submissions]
    
    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []
    
    report = compute_mcq_exam_report(exam, questions, submissions, answers)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    quality_status = "sufficient" if len(submissions) >= 10 else "insufficient_sample"
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=len(submissions),
            data_quality=quality_status,
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/exams/{exam_id}/structured", response_model=AnalyticsResponseEnvelope)
def get_structured_exam_analytics(
    exam_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns hierarchical subpart analysis for Paper II-A Structured assessment.
    Preserves full Question -> Part -> Roman -> Nested subpart trees and class loss rankings.
    """
    t0 = time.time()
    exam = _check_exam_teacher_access(exam_id, current_user, db)
    
    questions = db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).all()
    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id == exam_id,
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all()
    sub_ids = [s.id for s in submissions]
    
    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []
    
    report = compute_structured_exam_report(exam, questions, submissions, answers)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    quality_status = "sufficient" if len(submissions) >= 5 else "insufficient_sample"
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=len(submissions),
            data_quality=quality_status,
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/exams/{exam_id}/essay", response_model=AnalyticsResponseEnvelope)
def get_essay_exam_analytics(
    exam_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns rubric criteria and checklist omission metrics for Paper II-B Essay assessment.
    Pinpoints specific criteria points most frequently omitted by students.
    """
    t0 = time.time()
    exam = _check_exam_teacher_access(exam_id, current_user, db)
    
    questions = db.query(ALQuestion).filter(ALQuestion.exam_id == exam_id).all()
    submissions = db.query(ALStudentSubmission).filter(
        ALStudentSubmission.exam_id == exam_id,
        ALStudentSubmission.status.in_(["submitted", "ai_graded", "teacher_verified"])
    ).all()
    sub_ids = [s.id for s in submissions]
    
    answers = db.query(ALStudentAnswer).filter(
        ALStudentAnswer.submission_id.in_(sub_ids)
    ).all() if sub_ids else []
    
    report = compute_essay_exam_report(exam, questions, submissions, answers)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    quality_status = "sufficient" if len(submissions) >= 5 else "insufficient_sample"
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=len(submissions),
            data_quality=quality_status,
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/exams/{exam_id}/data-quality", response_model=AnalyticsResponseEnvelope)
def get_exam_data_quality_audit(
    exam_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Runs a non-mutating data quality audit for an assessment.
    Detects orphaned records, out-of-bounds scores, missing fields, and structural JSON anomalies.
    """
    t0 = time.time()
    exam = _check_exam_teacher_access(exam_id, current_user, db)
    
    report = audit_exam_data_quality(exam_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    quality_status = "sufficient" if report.is_clean else ("degraded" if report.errors_count > 0 else "warning")
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=report.total_checks_run,
            data_quality=quality_status,
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/materials/{course_id}", response_model=AnalyticsResponseEnvelope)
def get_course_materials_analytics(
    course_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns material views, completion rates, playback offsets, and contextual difficulty flag locations.
    """
    t0 = time.time()
    course = _check_course_teacher_access(course_id, current_user, db)
    
    report = compute_course_material_analytics(course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=report.total_materials,
            data_quality="sufficient",
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/ai/{course_id}", response_model=AnalyticsResponseEnvelope)
def get_course_ai_analytics(
    course_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns Ask AI concept topic distributions, source grounding rates, and LLM operation summaries.
    """
    t0 = time.time()
    course = _check_course_teacher_access(course_id, current_user, db)
    
    report = compute_ask_ai_analytics(course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=report.total_questions_asked,
            data_quality="sufficient" if report.total_questions_asked >= 5 else "insufficient_sample",
            execution_time_ms=elapsed_ms
        )
    )


# ──────────────────────────────────────────────
# Phase A3: Learning Behaviour & Student Profile Endpoints
# ──────────────────────────────────────────────

@router.get("/courses/{course_id}/learning-overview", response_model=AnalyticsResponseEnvelope)
def get_course_learning_overview_analytics(
    course_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns comprehensive learning behaviour overview, material engagement,
    confusion hotspots, Ask AI activity, and unit-level assessment crossover for a course.
    """
    t0 = time.time()
    course = _check_course_teacher_access(course_id, current_user, db)
    
    report = compute_course_learning_overview(course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=report.enrolled_students,
            data_quality="sufficient" if report.enrolled_students > 0 else "insufficient_sample",
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/courses/{course_id}/unit-crossover", response_model=AnalyticsResponseEnvelope)
def get_unit_learning_crossover_analytics(
    course_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns multi-source crossover matrix across syllabus units comparing
    material completion and support activity against assessment performance.
    """
    t0 = time.time()
    course = _check_course_teacher_access(course_id, current_user, db)
    
    crossover = compute_unit_learning_assessment_crossover(course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=crossover,
        meta=AnalyticsMeta(
            sample_size=len(crossover),
            data_quality="sufficient",
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/students/{student_id}/learning-profile", response_model=AnalyticsResponseEnvelope)
def get_student_learning_profile_analytics(
    student_id: int,
    course_id: Optional[int] = None,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns an evidence-based individual student learning profile,
    frequently revisited materials, submitted difficulty flags, Ask AI questions,
    and cautious support signals without arbitrary intelligence scores.
    """
    t0 = time.time()
    if current_user.role != UserRole.ADMIN:
        if course_id:
            _check_course_teacher_access(course_id, current_user, db)
        else:
            student_courses = db.query(Enrollment.course_id).filter(
                Enrollment.student_id == student_id,
                Enrollment.is_active == True
            ).all()
            s_course_ids = [c[0] for c in student_courses]
            teacher_courses = db.query(Course.id).filter(
                Course.id.in_(s_course_ids),
                Course.teacher_id == current_user.id
            ).all()
            if not teacher_courses:
                raise HTTPException(
                    status_code=403,
                    detail="You do not have access to analytics for this student profile"
                )
    
    report = compute_student_learning_profile(student_id, course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=report.materials_total,
            data_quality="sufficient",
            execution_time_ms=elapsed_ms
        )
    )


# ──────────────────────────────────────────────
# Phase A4: Student Personal Mastery Endpoints
# ──────────────────────────────────────────────

@router.get("/student/mastery", response_model=AnalyticsResponseEnvelope)
def get_student_personal_mastery_analytics(
    course_id: Optional[int] = None,
    student_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns personal assessment mastery, syllabus unit breakdown, question type performance,
    cognitive skill performance, performance trend, and evidence-based revision priorities.
    Strictly isolated to the student's own records (or authorized teacher/admin view).
    """
    t0 = time.time()
    
    # Authorization boundary check
    target_student_id = current_user.id
    if current_user.role == UserRole.STUDENT:
        # A student can NEVER access another student's analytics
        target_student_id = current_user.id
    elif current_user.role in [UserRole.TEACHER, UserRole.ADMIN]:
        if student_id is not None:
            target_student_id = student_id
            if course_id and current_user.role != UserRole.ADMIN:
                _check_course_teacher_access(course_id, current_user, db)
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role")
        
    # Check course enrollment if student
    if course_id and current_user.role == UserRole.STUDENT:
        enrolled = db.query(Enrollment).filter(
            Enrollment.student_id == target_student_id,
            Enrollment.course_id == course_id,
            Enrollment.is_active == True
        ).first()
        if not enrolled:
            raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    report = compute_student_mastery_report(target_student_id, course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=report.assessments_completed,
            data_quality="sufficient" if report.assessments_completed >= 3 else "insufficient_sample",
            execution_time_ms=elapsed_ms
        )
    )


# ──────────────────────────────────────────────
# Phase A5: Advanced Learning Intelligence Endpoints
# ──────────────────────────────────────────────

@router.get("/courses/{course_id}/learning-intelligence", response_model=AnalyticsResponseEnvelope)
def get_course_learning_intelligence_analytics(
    course_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Returns unified course learning intelligence: multi-source content hotspots,
    question format divergence, cognitive depth attenuation, distractor insights,
    and longitudinal attainment trends.
    """
    t0 = time.time()
    course = _check_course_teacher_access(course_id, current_user, db)
    
    report = compute_teacher_learning_intelligence(course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=report.total_assessments_analyzed,
            data_quality="sufficient" if report.total_assessments_analyzed >= 3 else "insufficient_sample",
            execution_time_ms=elapsed_ms
        )
    )


@router.get("/student/learning-intelligence", response_model=AnalyticsResponseEnvelope)
def get_student_learning_intelligence_analytics(
    course_id: Optional[int] = None,
    student_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns personal student learning intelligence, cross-domain difficulty hotspots,
    question format divergence, and actionable revision pathways.
    Strictly isolated to the authenticated student (or authorized teacher/admin).
    """
    t0 = time.time()
    
    target_student_id = current_user.id
    if current_user.role == UserRole.STUDENT:
        target_student_id = current_user.id
    elif current_user.role in [UserRole.TEACHER, UserRole.ADMIN]:
        if student_id is not None:
            target_student_id = student_id
            if course_id and current_user.role != UserRole.ADMIN:
                _check_course_teacher_access(course_id, current_user, db)
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role")

    if course_id and current_user.role == UserRole.STUDENT:
        enrolled = db.query(Enrollment).filter(
            Enrollment.student_id == target_student_id,
            Enrollment.course_id == course_id,
            Enrollment.is_active == True
        ).first()
        if not enrolled:
            raise HTTPException(status_code=403, detail="You are not enrolled in this course")

    report = compute_student_learning_intelligence(target_student_id, course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=len(report.personal_hotspots),
            data_quality="sufficient",
            execution_time_ms=elapsed_ms
        )
    )


# ──────────────────────────────────────────────
# Phase A6: Analytics Reporting & Export Endpoints
# ──────────────────────────────────────────────

@router.get("/courses/{course_id}/report", response_model=AnalyticsResponseEnvelope)
def get_course_comprehensive_report_analytics(
    course_id: int,
    current_user: User = Depends(require_admin_or_teacher),
    db: Session = Depends(get_db),
):
    """
    Generates a full comprehensive course analytical report connecting
    participation KPIs, assessment results, item difficulty, learning hotspots,
    and recommended teacher actions.
    """
    t0 = time.time()
    course = _check_course_teacher_access(course_id, current_user, db)
    
    report = generate_course_analytics_report(course_id, db)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    
    return AnalyticsResponseEnvelope(
        status="success",
        data=report,
        meta=AnalyticsMeta(
            sample_size=report.total_submissions,
            data_quality="sufficient" if report.total_submissions >= 3 else "insufficient_sample",
            execution_time_ms=elapsed_ms
        )
    )


def _get_export_user(
    request: Request,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
) -> User:
    auth_header = request.headers.get("Authorization")
    raw_token = None
    if auth_header and auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1]
    elif token:
        raw_token = token

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    from app.auth import decode_token
    token_data = decode_token(raw_token)
    user = None
    if token_data.user_id is not None:
        user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None and token_data.email:
        user = db.query(User).filter(User.email == token_data.email).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    if user.role not in [UserRole.TEACHER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Required role(s): teacher, admin",
        )
    return user


@router.get("/courses/{course_id}/export/csv")
def export_course_analytics_csv(
    request: Request,
    course_id: int,
    type: str = "course_summary",
    unit_id: Optional[int] = None,
    exam_id: Optional[int] = None,
    student_id: Optional[int] = None,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Exports course analytics data (syllabus mastery, student roster, item analysis,
    materials, difficulty flags) as a downloadable CSV document.
    """
    current_user = _get_export_user(request, token, db)
    course = _check_course_teacher_access(course_id, current_user, db)
    csv_content = generate_course_analytics_csv(
        course_id=course_id,
        db=db,
        export_type=type,
        unit_id=unit_id,
        exam_id=exam_id,
        student_id=student_id
    )
    
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M')
    filename = f"course_{course_id}_{type}_{timestamp}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )





