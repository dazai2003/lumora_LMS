"""
Lumora Services Domain Package.

Organized by domain:
- assessments: Generation (MCQ, Structured, Essay), Assembly & Balancing, Grading & Marking, Question Bank & Past Papers
- materials: Processing, OCR, Audio, Ingestion & Retrieval (RAG)
- ai: Central Generation Core, Gemini Provider, Vector Search
- curriculum: Scope Slicer & Syllabus Blueprint
- analytics: Student Mastery, Teacher Learning Analytics, Assessment Analytics
- jobs: Background Jobs
- audit: Audit Logging
"""

# Re-exports for top-level convenience
from app.services.ai.gemini_service import gemini, GeminiService
from app.services.ai.ai_generation_core import execute_central_ai_generation, raise_ai_generation_http_exception
from app.services.materials.retrieval.learning_material_retriever import LearningMaterialRetriever
from app.services.assessments.generation.mcq_generator import generate_mcq_paper_with_plan
from app.services.assessments.generation.structured_generator import generate_structured_candidate_questions
from app.services.assessments.generation.essay_generator import generate_essay_candidate_questions
from app.services.assessments.assembly.exam_ordering_engine import order_mcq_paper, build_paper_blueprint
from app.services.assessments.grading.exam_grading_service import ALMarkingService

__all__ = [
    "gemini",
    "GeminiService",
    "execute_central_ai_generation",
    "raise_ai_generation_http_exception",
    "LearningMaterialRetriever",
    "generate_mcq_paper_with_plan",
    "generate_structured_candidate_questions",
    "generate_essay_candidate_questions",
    "order_mcq_paper",
    "build_paper_blueprint",
    "ALMarkingService",
]
