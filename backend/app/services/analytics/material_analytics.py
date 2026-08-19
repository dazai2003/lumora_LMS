"""
Material and Content Engagement Analytics Service.
Tracks views, completion rates, playback offsets, and contextual difficulty flags (page/timestamp).
"""
from typing import List, Dict, Any, Optional
import statistics
from sqlalchemy.orm import Session
from app.models import (
    Course, Lesson, Material, StudentMaterialProgress, MaterialFlag, Enrollment, ActivityLog, User
)
from app.services.analytics.data_contracts import (
    ContextualFlagMetric, MaterialEngagementMetric, CourseMaterialAnalyticsReport
)
from app.services.analytics.normalization import safe_percentage, parse_context_location


def compute_course_material_analytics(course_id: int, db: Session) -> CourseMaterialAnalyticsReport:
    """
    Computes material engagement metrics and contextual flag breakdowns for a course.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    course_title = course.title if course else f"Course #{course_id}"
    
    total_enrolled = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.is_active == True
    ).count()
    
    lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
    lesson_map = {l.id: l for l in lessons}
    lesson_ids = [l.id for l in lessons]
    
    materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
    material_ids = [m.id for m in materials]
    
    # Pre-fetch progress records
    progress_records = db.query(StudentMaterialProgress).filter(
        StudentMaterialProgress.material_id.in_(material_ids)
    ).all() if material_ids else []
    
    progress_by_mat: Dict[int, List[StudentMaterialProgress]] = {}
    for p in progress_records:
        progress_by_mat.setdefault(p.material_id, []).append(p)
        
    # Pre-fetch flags
    flag_records = db.query(MaterialFlag).filter(
        MaterialFlag.material_id.in_(material_ids)
    ).order_by(MaterialFlag.created_at.desc()).all() if material_ids else []
    
    flags_by_mat: Dict[int, List[MaterialFlag]] = {}
    student_ids_in_flags = set()
    for f in flag_records:
        flags_by_mat.setdefault(f.material_id, []).append(f)
        if f.student_id:
            student_ids_in_flags.add(f.student_id)

    students_map = {}
    if student_ids_in_flags:
        students = db.query(User).filter(User.id.in_(list(student_ids_in_flags))).all()
        students_map = {s.id: s.full_name or s.email for s in students}
        
    # Pre-fetch activity log views
    view_logs = db.query(ActivityLog).filter(
        ActivityLog.action == "view_material",
        ActivityLog.entity_type == "material",
        ActivityLog.entity_id.in_(material_ids)
    ).all() if material_ids else []
    
    views_by_mat: Dict[int, int] = {}
    for v in view_logs:
        views_by_mat[v.entity_id] = views_by_mat.get(v.entity_id, 0) + 1
        
    material_metrics: List[MaterialEngagementMetric] = []
    total_course_completed = 0
    total_course_flags = 0
    total_course_unresolved_flags = 0
    
    for m in materials:
        m_prog = progress_by_mat.get(m.id, [])
        m_flags = flags_by_mat.get(m.id, [])
        m_views = views_by_mat.get(m.id, len(m_prog))
        
        completed_cnt = sum(1 for p in m_prog if p.is_completed)
        total_course_completed += completed_cnt
        
        completion_pct = safe_percentage(completed_cnt, total_enrolled, default=0.0) if total_enrolled > 0 else None
        
        positions = [float(p.last_position) for p in m_prog if p.last_position and p.last_position > 0]
        avg_pos = round(statistics.mean(positions), 1) if positions else None
        
        unresolved_cnt = sum(1 for f in m_flags if not f.is_resolved)
        resolved_cnt = sum(1 for f in m_flags if f.is_resolved)
        total_course_flags += len(m_flags)
        total_course_unresolved_flags += unresolved_cnt
        
        contextual_flag_items: List[ContextualFlagMetric] = []
        for f in m_flags:
            c_type, c_val = parse_context_location(f.context)
            contextual_flag_items.append(
                ContextualFlagMetric(
                    flag_id=f.id,
                    student_id=f.student_id,
                    student_name=students_map.get(f.student_id, f"Student #{f.student_id}"),
                    context_type=c_type,
                    context_value=c_val or f.context,
                    comment=f.comment,
                    is_resolved=f.is_resolved or False,
                    teacher_reply=getattr(f, "teacher_reply", None),
                    resolved_at=f.resolved_at.isoformat() if getattr(f, "resolved_at", None) else None,
                    created_at=f.created_at.isoformat() if f.created_at else ""
                )
            )
            
        m_type_str = getattr(m.material_type, "value", str(m.material_type)) if m.material_type else "note"
        
        les = lesson_map.get(m.lesson_id)
        unit_id = les.unit_id if les else None
        unit_title = les.unit.title if les and les.unit else None
        lesson_title = les.title if les else None

        material_metrics.append(
            MaterialEngagementMetric(
                material_id=m.id,
                lesson_id=m.lesson_id,
                lesson_title=lesson_title,
                unit_id=unit_id,
                unit_title=unit_title,
                title=m.title,
                material_type=m_type_str,
                total_enrolled=total_enrolled,
                total_views=m_views,
                completed_count=completed_cnt,
                completion_rate_percentage=completion_pct,
                avg_last_position=avg_pos,
                total_flags=len(m_flags),
                unresolved_flags=unresolved_cnt,
                resolved_flags=resolved_cnt,
                contextual_flags=contextual_flag_items
            )
        )
        
    total_possible_completions = len(materials) * total_enrolled
    overall_completion_rate = safe_percentage(total_course_completed, total_possible_completions, default=None) if total_possible_completions > 0 else None
    
    return CourseMaterialAnalyticsReport(
        course_id=course_id,
        course_title=course_title,
        total_materials=len(materials),
        total_enrolled=total_enrolled,
        overall_completion_rate=overall_completion_rate,
        total_flags=total_course_flags,
        total_unresolved_flags=total_course_unresolved_flags,
        materials=material_metrics
    )
