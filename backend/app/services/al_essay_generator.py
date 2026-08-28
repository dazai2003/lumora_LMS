"""
Backwards-compatibility alias shim for essay question generator.
Re-exports app.services.assessments.generation.essay_generator.
"""
from app.services.assessments.generation import essay_generator as _mod
import sys; sys.modules[__name__] = _mod
