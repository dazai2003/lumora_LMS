"""AI & LLM Services Domain Package."""
from app.services.ai.gemini_service import gemini, GeminiService
from app.services.ai.ai_generation_core import (
    execute_central_ai_generation,
    raise_ai_generation_http_exception,
    classify_raw_exception,
    AIGenerationResult,
)
from app.services.ai.vector_search_service import (
    chunk_text,
    store_material_embeddings,
    search_similar,
    check_duplicate_question,
    scan_all_duplicates,
)

__all__ = [
    "gemini",
    "GeminiService",
    "execute_central_ai_generation",
    "raise_ai_generation_http_exception",
    "classify_raw_exception",
    "AIGenerationResult",
    "chunk_text",
    "store_material_embeddings",
    "search_similar",
    "check_duplicate_question",
    "scan_all_duplicates",
]
