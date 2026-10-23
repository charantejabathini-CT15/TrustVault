"""Audit service: tamper-evident hash-chain event logging."""

import json
import hashlib
from datetime import datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_

from app.models.models import AuditEvent, AuditChainState, User, Document
from app.core.security import compute_event_hash


def _format_timestamp(dt: datetime) -> str:
    """Format datetime deterministically for hashing."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _canonical(event_data: dict) -> str:
    """Create canonical string from event data for hashing.
    Sorts keys deterministically and uses json.dumps for consistency."""
    sorted_data = {k: str(v) for k, v in sorted(event_data.items()) if v is not None}
    return json.dumps(sorted_data, sort_keys=True, separators=(",", ":"))


def record_event(
    db: Session,
    org_id: str,
    action: str,
    result: str = "success",
    actor_id: Optional[str] = None,
    document_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    request_id: Optional[str] = None,
) -> AuditEvent:
    """Record a new audit event with hash-chain integrity.
    Uses SELECT ... FOR UPDATE to serialize chain access per org."""

    # Lock and get chain state
    query = db.query(AuditChainState).filter(AuditChainState.org_id == org_id)
    if db.bind and db.bind.dialect.name != "sqlite":
        query = query.with_for_update()
    chain_state = query.first()

    if not chain_state:
        chain_state = AuditChainState(
            org_id=org_id,
            last_hash="0" * 64,
            last_sequence=0,
        )
        db.add(chain_state)
        db.flush()
        # Re-lock after insert
        query = db.query(AuditChainState).filter(AuditChainState.org_id == org_id)
        if db.bind and db.bind.dialect.name != "sqlite":
            query = query.with_for_update()
        chain_state = query.first()

    previous_hash = chain_state.last_hash
    new_sequence = chain_state.last_sequence + 1
    now = datetime.now(timezone.utc)

    # Build canonical event data
    event_data = {
        "org_id": org_id,
        "actor_id": actor_id,
        "document_id": document_id,
        "action": action,
        "result": result,
        "sequence_number": new_sequence,
        "timestamp": _format_timestamp(now),
        "request_id": request_id,
    }

    canonical = _canonical(event_data)
    event_hash = compute_event_hash(canonical, previous_hash)

    # Sanitize metadata — remove any sensitive fields
    safe_metadata = None
    if metadata:
        sensitive_keys = {"password", "passphrase", "secret", "token", "private_key"}
        safe_metadata = {
            k: v for k, v in metadata.items()
            if k.lower() not in sensitive_keys
        }

    event = AuditEvent(
        org_id=org_id,
        actor_id=actor_id,
        document_id=document_id,
        action=action,
        result=result,
        metadata_json=safe_metadata,
        request_id=request_id,
        previous_hash=previous_hash,
        event_hash=event_hash,
        sequence_number=new_sequence,
        created_at=now,
    )

    db.add(event)

    # Update chain state
    chain_state.last_hash = event_hash
    chain_state.last_sequence = new_sequence
    chain_state.updated_at = now

    db.flush()
    return event


def verify_chain(
    db: Session,
    org_id: str,
    limit: int = 10000,
) -> Tuple[bool, int, Optional[int], str]:
    """Verify the hash chain for an organization.
    Returns (valid, events_checked, first_failure_seq, message)."""

    events = db.query(AuditEvent).filter(
        AuditEvent.org_id == org_id
    ).order_by(AuditEvent.sequence_number.asc()).limit(limit).all()

    if not events:
        return True, 0, None, "No audit events to verify."

    expected_prev_hash = "0" * 64

    for i, event in enumerate(events):
        # Check previous_hash matches expected
        if event.previous_hash != expected_prev_hash:
            return (
                False, i + 1, event.sequence_number,
                f"Chain break at sequence {event.sequence_number}: "
                f"expected previous_hash={expected_prev_hash[:16]}..., "
                f"got={event.previous_hash[:16]}..."
            )

        # Check sequence continuity
        expected_seq = i + 1
        if event.sequence_number != expected_seq:
            return (
                False, i + 1, event.sequence_number,
                f"Sequence gap: expected {expected_seq}, got {event.sequence_number}. "
                "Possible event deletion."
            )

        # Recompute hash
        event_data = {
            "org_id": event.org_id,
            "actor_id": event.actor_id,
            "document_id": event.document_id,
            "action": event.action,
            "result": event.result,
            "sequence_number": event.sequence_number,
            "timestamp": _format_timestamp(event.created_at) if event.created_at else None,
            "request_id": event.request_id,
        }
        canonical = _canonical(event_data)
        recomputed_hash = compute_event_hash(canonical, event.previous_hash)

        if recomputed_hash != event.event_hash:
            return (
                False, i + 1, event.sequence_number,
                f"Hash mismatch at sequence {event.sequence_number}: "
                f"stored={event.event_hash[:16]}..., "
                f"recomputed={recomputed_hash[:16]}... "
                "Event data may have been altered."
            )

        expected_prev_hash = event.event_hash

    return True, len(events), None, f"All {len(events)} events verified successfully."


def get_events(
    db: Session,
    org_id: str,
    actor_id: Optional[str] = None,
    document_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    offset: int = 0,
    limit: int = 50,
) -> Tuple[List[dict], int]:
    """Query audit events with filters, returning enriched data."""
    query = db.query(AuditEvent).filter(AuditEvent.org_id == org_id)

    if actor_id:
        query = query.filter(AuditEvent.actor_id == actor_id)
    if document_id:
        query = query.filter(AuditEvent.document_id == document_id)
    if action:
        query = query.filter(AuditEvent.action == action)
    if result:
        query = query.filter(AuditEvent.result == result)
    if start_date:
        query = query.filter(AuditEvent.created_at >= start_date)
    if end_date:
        query = query.filter(AuditEvent.created_at <= end_date)

    total = query.count()
    events = query.order_by(AuditEvent.sequence_number.desc()).offset(offset).limit(limit).all()

    # Enrich with actor and document names
    results = []
    for event in events:
        actor = db.get(User, event.actor_id) if event.actor_id else None
        doc = db.get(Document, event.document_id) if event.document_id else None
        results.append({
            "id": event.id,
            "org_id": event.org_id,
            "actor_id": event.actor_id,
            "actor_email": actor.email if actor else None,
            "actor_name": actor.display_name if actor else None,
            "document_id": event.document_id,
            "document_name": doc.name if doc else None,
            "action": event.action,
            "result": event.result,
            "metadata_json": event.metadata_json,
            "request_id": event.request_id,
            "previous_hash": event.previous_hash,
            "event_hash": event.event_hash,
            "sequence_number": event.sequence_number,
            "created_at": event.created_at,
        })

    return results, total
