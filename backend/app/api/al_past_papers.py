from app.api.past_papers import *  # noqa: F401, F403
from app.api import past_papers as _mod
import sys; sys.modules[__name__] = _mod
