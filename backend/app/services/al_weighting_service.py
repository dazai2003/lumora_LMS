"""
Backwards-compatibility alias shim for curriculum unit weighting.
Re-exports app.services.assessments.assembly.exam_weighting_service.
"""
from app.services.assessments.assembly import exam_weighting_service as _mod
import sys; sys.modules[__name__] = _mod
