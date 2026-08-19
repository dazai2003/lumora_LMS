from app.api.exams import *  # noqa: F401, F403
from app.api import exams as _mod
import sys; sys.modules[__name__] = _mod
