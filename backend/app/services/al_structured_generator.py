"""
Backwards-compatibility alias shim for structured question generator.
Re-exports app.services.assessments.generation.structured_generator.
"""
from app.services.assessments.generation import structured_generator as _mod
import sys; sys.modules[__name__] = _mod
