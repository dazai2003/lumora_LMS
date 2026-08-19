"""
Audit Log Service for Lumora LMS.
Logs critical administrative, teaching, and moderation actions.
"""
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models import AuditLog, User


def log_audit_event(
    db: Session,
    action: str,
    entity_type: str,
    entity_id: Optional[int] = None,
    actor: Optional[User] = None,
    previous_values: Optional[Dict[str, Any]] = None,
    new_values: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> AuditLog:
    """
    Log an enterprise governance audit entry to the database.
    """
    log_entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else "system",
        action=action.upper(),
        entity_type=entity_type.lower(),
        entity_id=entity_id,
        previous_values=previous_values,
        new_values=new_values,
        ip_address=ip_address
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
