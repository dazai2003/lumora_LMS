"""
Backwards-compatibility alias shim for essay rubric grading.
Re-exports app.services.assessments.grading.rubric_service.
"""
from app.services.assessments.grading import rubric_service as _mod
import sys; sys.modules[__name__] = _mod
