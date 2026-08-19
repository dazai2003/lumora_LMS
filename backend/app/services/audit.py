from app.services.audit import audit_service as _mod
import sys; sys.modules[__name__] = _mod
