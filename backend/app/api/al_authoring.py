from app.api.exam_authoring import *  # noqa: F401, F403
from app.api import exam_authoring as _mod
import sys; sys.modules[__name__] = _mod
