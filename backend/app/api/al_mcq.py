from app.api.exam_mcq import *  # noqa: F401, F403
from app.api import exam_mcq as _mod
import sys; sys.modules[__name__] = _mod
