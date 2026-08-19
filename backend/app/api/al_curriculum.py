from app.api.exam_curriculum import *  # noqa: F401, F403
from app.api import exam_curriculum as _mod
import sys; sys.modules[__name__] = _mod
