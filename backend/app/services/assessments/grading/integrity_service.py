"""
Academic Integrity Service for Lumora LMS.
Logs granular integrity events and updates legacy aggregate counters for backward compatibility.
"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.models import IntegrityEvent, IntegrityEventType, EventSeverity, QuizAttempt


def log_integrity_event(
    db: Session,
    attempt_id: int,
    event_type: str,
    timestamp: Optional[datetime] = None,
    metadata_json: Optional[Dict[str, Any]] = None,
    severity: Optional[str] = "low"
) -> IntegrityEvent:
    """
    Log a detailed integrity event entry and update aggregate attempt counters.
    """
    # Normalize event type
    normalized_type = event_type.lower().replace(" ", "_")
    try:
        enum_type = IntegrityEventType(normalized_type)
    except ValueError:
        enum_type = IntegrityEventType.TAB_BLUR

    # Normalize severity
    try:
        enum_sev = EventSeverity((severity or "low").lower())
    except ValueError:
        enum_sev = EventSeverity.LOW

    event = IntegrityEvent(
        attempt_id=attempt_id,
        event_type=enum_type,
        timestamp=timestamp or datetime.utcnow(),
        metadata_json=metadata_json,
        severity=enum_sev
    )
    db.add(event)

    # Sync aggregate legacy counters on QuizAttempt for backward compatibility
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == attempt_id).first()
    if attempt:
        if enum_type in [IntegrityEventType.TAB_SWITCH, IntegrityEventType.TAB_BLUR, IntegrityEventType.WINDOW_BLUR]:
            attempt.tab_switch_count = (attempt.tab_switch_count or 0) + 1
        elif enum_type in [IntegrityEventType.COPY, IntegrityEventType.PASTE]:
            attempt.copy_paste_count = (attempt.copy_paste_count or 0) + 1

    db.commit()
    db.refresh(event)
    return event
