"""
Backwards-compatibility alias shim for question ordering engine.
Re-exports app.services.assessments.assembly.exam_ordering_engine.
"""
from app.services.assessments.assembly import exam_ordering_engine as _mod
import sys; sys.modules[__name__] = _mod
