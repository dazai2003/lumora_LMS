"""
Backwards-compatibility alias shim for curriculum taxonomies.
Re-exports app.api.exam_curriculum for Sri Lankan A/L 10-unit syllabus mapping.
"""
from app.api.exam_curriculum import *  # noqa: F401, F403
from app.api import exam_curriculum as _mod
import sys; sys.modules[__name__] = _mod
