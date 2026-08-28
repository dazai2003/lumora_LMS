"""
Backwards-compatibility alias shim for Gemini AI service.
Re-exports app.services.ai.gemini_service.
"""
from app.services.ai import gemini_service as _mod
import sys; sys.modules[__name__] = _mod
