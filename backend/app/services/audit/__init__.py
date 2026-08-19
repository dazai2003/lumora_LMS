"""Audit Log Package."""
from app.services.audit.audit_service import log_audit_event

__all__ = ["log_audit_event"]
