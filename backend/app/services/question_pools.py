"""
Backwards-compatibility alias shim for question bank pools.
Re-exports app.services.assessments.question_bank.question_pool_service.
"""
from app.services.assessments.question_bank import question_pool_service as _mod
import sys; sys.modules[__name__] = _mod
