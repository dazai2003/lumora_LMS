"""
Backwards-compatibility alias shim for MCQ candidate generator.
Re-exports app.services.assessments.generation.mcq_generator.
"""
from app.services.assessments.generation import mcq_generator as _mod
import sys; sys.modules[__name__] = _mod
