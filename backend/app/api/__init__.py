"""
API Routers Package for Lumora LMS.
Provides clean semantic domain-level routing endpoints.
"""

from app.api import (
    auth,
    users,
    courses,
    units,
    lessons,
    materials,
    materials_ai,
    analytics,
    assessment_analytics,
    exams,
    past_papers,
    exam_authoring,
    exam_curriculum,
    exam_mcq,
    questions,
    pools,
    rubrics,
    qa,
    recommendations,
    students,
    notifications,
    messages,
    payments,
    jobs,
    audit,
)

# Backwards compatibility aliases
al_exams = exams
al_past_papers = past_papers
al_authoring = exam_authoring
al_curriculum = exam_curriculum
al_mcq = exam_mcq
al_analytics = assessment_analytics

__all__ = [
    "auth",
    "users",
    "courses",
    "units",
    "lessons",
    "materials",
    "materials_ai",
    "analytics",
    "assessment_analytics",
    "exams",
    "past_papers",
    "exam_authoring",
    "exam_curriculum",
    "exam_mcq",
    "questions",
    "pools",
    "rubrics",
    "qa",
    "recommendations",
    "students",
    "notifications",
    "messages",
    "payments",
    "jobs",
    "audit",
    "al_exams",
    "al_past_papers",
    "al_authoring",
    "al_curriculum",
    "al_mcq",
    "al_analytics",
]
