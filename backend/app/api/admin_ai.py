"""
System AI Configuration API (Admin Only).
Configures LLM selection, temperature, token limits, confidence thresholds, embedding models, and chunking parameters.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, SystemAIConfig
from app.schemas import SystemAIConfigResponse, SystemAIConfigUpdate
from app.auth import require_role

router = APIRouter()


@router.get("/ai-config", response_model=dict)
def get_system_ai_config(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Retrieve active system AI configuration settings."""
    config = db.query(SystemAIConfig).first()
    if not config:
        config = SystemAIConfig(
            llm_provider="gemini",
            llm_model="gemini-2.0-flash",
            temperature=0.3,
            max_tokens=1500,
            confidence_threshold=0.70,
            embedding_model="all-MiniLM-L6-v2",
            chunk_size=500,
            retrieval_top_k=5,
            enabled_modules={
                "tutor_memory": True,
                "hybrid_rag": True,
                "citations": True,
                "confidence_escalation": True,
                "recommendations": True,
                "student_profiles": True,
                "material_insights": True,
                "smart_revision": True
            }
        )
        db.add(config)
        db.commit()
        db.refresh(config)
        
    return {
        "id": config.id,
        "llm_provider": config.llm_provider,
        "llm_model": config.llm_model,
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "confidence_threshold": config.confidence_threshold,
        "embedding_model": config.embedding_model,
        "chunk_size": config.chunk_size,
        "retrieval_top_k": config.retrieval_top_k,
        "enabled_modules": config.enabled_modules or {},
        "updated_at": config.updated_at.isoformat() if config.updated_at else None
    }


@router.put("/ai-config", response_model=dict)
def update_system_ai_config(
    data: SystemAIConfigUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """Update system AI configuration settings."""
    config = db.query(SystemAIConfig).first()
    if not config:
        config = SystemAIConfig()
        db.add(config)
        
    if data.llm_provider is not None:
        config.llm_provider = data.llm_provider
    if data.llm_model is not None:
        config.llm_model = data.llm_model
    if data.temperature is not None:
        config.temperature = data.temperature
    if data.max_tokens is not None:
        config.max_tokens = data.max_tokens
    if data.confidence_threshold is not None:
        config.confidence_threshold = data.confidence_threshold
    if data.embedding_model is not None:
        config.embedding_model = data.embedding_model
    if data.chunk_size is not None:
        config.chunk_size = data.chunk_size
    if data.retrieval_top_k is not None:
        config.retrieval_top_k = data.retrieval_top_k
    if data.enabled_modules is not None:
        config.enabled_modules = data.enabled_modules
        
    db.commit()
    db.refresh(config)
    return {
        "id": config.id,
        "llm_provider": config.llm_provider,
        "llm_model": config.llm_model,
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "confidence_threshold": config.confidence_threshold,
        "embedding_model": config.embedding_model,
        "chunk_size": config.chunk_size,
        "retrieval_top_k": config.retrieval_top_k,
        "enabled_modules": config.enabled_modules or {},
        "updated_at": config.updated_at.isoformat() if config.updated_at else None
    }


@router.get("/ai-health", response_model=dict)
def ai_health_check():
    """Check Gemini API connectivity and model availability. No auth required for quick diagnostics."""
    try:
        from app.services.gemini_service import gemini
        return gemini.health_check()
    except Exception as e:
        return {
            "provider": "gemini",
            "api_key_configured": False,
            "error": str(e)[:200],
            "flash_status": "error",
            "flash_25_status": "error",
            "pro_status": "error",
        }
