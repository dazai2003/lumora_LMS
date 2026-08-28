"""
Backwards-compatibility alias shim for assessment cognitive difficulty engine.
Re-exports app.services.assessments.assembly.exam_difficulty_engine.
"""
from app.services.assessments.assembly import exam_difficulty_engine as _mod
import sys; sys.modules[__name__] = _mod
