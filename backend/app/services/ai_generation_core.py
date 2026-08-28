"""
Backwards-compatibility alias shim for AI generation core.
Re-exports app.services.ai.ai_generation_core for centralized Gemini API invocation.
"""
from app.services.ai import ai_generation_core as _mod
import sys; sys.modules[__name__] = _mod
