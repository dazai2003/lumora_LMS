"""
Backwards-compatibility alias shim for deterministic assessment marking.
Re-exports app.services.assessments.grading.exam_grading_service.
"""
from app.services.assessments.grading import exam_grading_service as _mod
import sys; sys.modules[__name__] = _mod
