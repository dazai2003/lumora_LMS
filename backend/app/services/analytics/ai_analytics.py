"""
Ask AI Tutor and Concept Confusion Analytics Service.
Tracks student question concept topics, source grounding, confidence distributions, and LLM usage.
"""
from typing import List, Dict, Any, Optional
import statistics
from sqlalchemy.orm import Session
from app.models import Course, Unit, Lesson, Material, StudentQuestion, AIResponse, AILog, User
from app.services.analytics.data_contracts import (
    AIConceptTopicMetric, AIInquiryDetailMetric, AskAIAnalyticsReport
)
from app.services.analytics.normalization import safe_div, safe_percentage


def compute_ask_ai_analytics(course_id: int, db: Session) -> AskAIAnalyticsReport:
    """
    Aggregates Ask AI tutor interactions, topic category distributions, and source grounding.
    """
    course = db.query(Course).filter(Course.id == course_id).first()
    course_title = course.title if course else f"Course #{course_id}"
    
    questions = db.query(StudentQuestion).filter(
        StudentQuestion.course_id == course_id
    ).order_by(StudentQuestion.asked_at.desc()).all()
    
    total_questions = len(questions)
    q_ids = [q.id for q in questions]
    
    # Pre-fetch students
    student_ids = list(set(q.student_id for q in questions if q.student_id))
    students = db.query(User).filter(User.id.in_(student_ids)).all() if student_ids else []
    student_map = {s.id: s.full_name or s.email for s in students}
    
    # Pre-fetch course units and materials for accurate topic alignment
    units = db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order.asc()).all()
    unit_map = {u.id: u.title for u in units}
    
    lessons = db.query(Lesson).filter(Lesson.course_id == course_id).all()
    lesson_to_unit_map = {l.id: unit_map.get(l.unit_id, "Syllabus Unit") for l in lessons if l.unit_id}
    
    lesson_ids = [l.id for l in lessons]
    materials = db.query(Material).filter(Material.lesson_id.in_(lesson_ids)).all() if lesson_ids else []
    material_to_unit_map = {m.id: lesson_to_unit_map.get(m.lesson_id, m.title) for m in materials if m.lesson_id}
    
    # Fetch AI responses
    responses = db.query(AIResponse).filter(
        AIResponse.student_question_id.in_(q_ids)
    ).all() if q_ids else []
    
    response_map = {r.student_question_id: r for r in responses}
    
    confidences: List[float] = []
    source_grounded_count = 0
    low_confidence_count = 0
    flagged_count = 0
    teacher_corrected_count = 0
    
    for r in responses:
        if r.confidence_score is not None:
            score = float(r.confidence_score)
            confidences.append(score)
            if score < 0.70:
                low_confidence_count += 1
        else:
            low_confidence_count += 1
            
        sq = next((q for q in questions if q.id == r.student_question_id), None)
        has_mat = bool(sq and sq.course_material_id)
        has_ctx = bool(r.context_sources and len(r.context_sources) > 0)
        
        if has_ctx or has_mat or (r.confidence_score and r.confidence_score >= 0.75):
            source_grounded_count += 1
            
        if r.is_flagged:
            flagged_count += 1
            
        if r.teacher_correction:
            teacher_corrected_count += 1
            
    avg_confidence = round(statistics.mean(confidences), 3) if confidences else None
    source_grounded_pct = safe_percentage(source_grounded_count, len(responses), default=None) if responses else None
    
    # Topic breakdown
    topics_map: Dict[str, Dict[str, Any]] = {}
    sentiment_distribution: Dict[str, int] = {}
    
    for q in questions:
        # Determine topic category cleanly
        topic = q.topic_category
        if not topic or topic == "General Course Query":
            if q.course_material_id and q.course_material_id in material_to_unit_map:
                topic = material_to_unit_map[q.course_material_id]
            elif units:
                # Map to first or relevant syllabus unit
                topic = units[0].title if units else "Syllabus Core Concepts"
            else:
                topic = "General Course Concepts"
                
        sentiment = q.sentiment_difficulty or "General Query"
        sentiment_distribution[sentiment] = sentiment_distribution.get(sentiment, 0) + 1
        
        if topic not in topics_map:
            topics_map[topic] = {
                "count": 0,
                "sentiments": {},
                "samples": []
            }
            
        topics_map[topic]["count"] += 1
        topics_map[topic]["sentiments"][sentiment] = topics_map[topic]["sentiments"].get(sentiment, 0) + 1
        
        # Collect up to 3 sample questions
        if len(topics_map[topic]["samples"]) < 3 and q.question_text:
            topics_map[topic]["samples"].append(q.question_text[:100] + ("..." if len(q.question_text) > 100 else ""))
            
    topic_metrics: List[AIConceptTopicMetric] = []
    for topic_name, data in sorted(topics_map.items(), key=lambda x: x[1]["count"], reverse=True):
        topic_pct = safe_percentage(data["count"], total_questions, default=0.0) if total_questions > 0 else None
        topic_metrics.append(
            AIConceptTopicMetric(
                topic_category=topic_name,
                question_count=data["count"],
                percentage=topic_pct,
                sentiment_breakdown=data["sentiments"],
                sample_questions=data["samples"]
            )
        )
        
    # Detailed Inquiries List
    detailed_inquiries: List[AIInquiryDetailMetric] = []
    for q in questions[:100]:
        r = response_map.get(q.id)
        has_mat = bool(q.course_material_id)
        has_sources = bool((r and r.context_sources and len(r.context_sources) > 0) or has_mat or (r and r.confidence_score and r.confidence_score >= 0.75))
        
        assigned_topic = q.topic_category
        if not assigned_topic or assigned_topic == "General Course Query":
            if q.course_material_id and q.course_material_id in material_to_unit_map:
                assigned_topic = material_to_unit_map[q.course_material_id]
            elif units:
                assigned_topic = units[0].title
            else:
                assigned_topic = "General Course Concepts"

        detailed_inquiries.append(
            AIInquiryDetailMetric(
                question_id=q.id,
                student_id=q.student_id,
                student_name=student_map.get(q.student_id, f"Student #{q.student_id}"),
                question_text=q.question_text,
                response_id=r.id if r else None,
                response_text=r.response_text if r else None,
                confidence_score=r.confidence_score if r else None,
                is_grounded=has_sources,
                context_sources=r.context_sources if r else None,
                topic_category=assigned_topic,
                sentiment_difficulty=q.sentiment_difficulty or "General Query",
                is_flagged=r.is_flagged if r else False,
                teacher_correction=r.teacher_correction if r else None,
                asked_at=q.asked_at.isoformat() if q.asked_at else ""
            )
        )
        
    # AI Log Summary
    recent_logs = db.query(AILog).order_by(AILog.created_at.desc()).limit(100).all()
    total_tokens = sum(l.tokens_used or 0 for l in recent_logs)
    latencies = [l.processing_time_ms for l in recent_logs if l.processing_time_ms]
    avg_latency = round(statistics.mean(latencies), 0) if latencies else None
    successful_ops = sum(1 for l in recent_logs if getattr(l.status, "value", str(l.status)) == "completed")
    
    ai_logs_summary = {
        "recent_operations_analyzed": len(recent_logs),
        "total_tokens_recorded": total_tokens,
        "average_latency_ms": avg_latency,
        "success_rate_percentage": safe_percentage(successful_ops, len(recent_logs), default=100.0) if recent_logs else 100.0
    }
    
    return AskAIAnalyticsReport(
        course_id=course_id,
        course_title=course_title,
        total_questions_asked=total_questions,
        answered_questions_count=len(responses),
        unique_students_count=len(student_ids),
        low_confidence_count=low_confidence_count,
        flagged_count=flagged_count,
        teacher_corrected_count=teacher_corrected_count,
        average_confidence_score=avg_confidence,
        source_grounded_percentage=source_grounded_pct,
        topic_categories=topic_metrics,
        sentiment_distribution=sentiment_distribution,
        recent_ai_logs_summary=ai_logs_summary,
        detailed_inquiries=detailed_inquiries
    )
