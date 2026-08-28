"""
Backwards-compatibility alias shim for assessment analytics.
Re-exports app.api.assessment_analytics to ensure legacy API route parity.
"""
from app.api.assessment_analytics import *  # noqa: F401, F403
from app.api import assessment_analytics as _mod
import sys; sys.modules[__name__] = _mod
