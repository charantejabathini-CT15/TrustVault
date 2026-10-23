import pytest
import uuid
from app.models.models import Organization, User, AuditEvent
from app.services.audit_service import record_event, verify_chain


def test_audit_chain_validity(db):
    org = Organization(id=str(uuid.uuid4()), name="Audit Org")
    db.add(org)
    db.flush()

    user = User(
        id=str(uuid.uuid4()),
        email="auditor@test.com",
        display_name="Auditor",
        password_hash="hash",
    )
    db.add(user)
    db.flush()

    # Record multiple sequential events
    record_event(db, org.id, "document_upload", actor_id=user.id, metadata={"doc": "file1.pdf"})
    record_event(db, org.id, "share_created", actor_id=user.id, metadata={"grantee": "bob"})
    record_event(db, org.id, "document_access", actor_id=user.id, result="success")
    record_event(db, org.id, "document_download", actor_id=user.id, result="success")
    db.commit()

    valid, count, failure_seq, msg = verify_chain(db, org.id)
    assert valid is True
    assert count == 4
    assert failure_seq is None
    assert "All 4 events verified successfully" in msg


def test_audit_tamper_detection(db):
    org = Organization(id=str(uuid.uuid4()), name="Audit Org")
    db.add(org)
    db.flush()

    record_event(db, org.id, "action_1")
    record_event(db, org.id, "action_2")
    record_event(db, org.id, "action_3")
    db.commit()

    # Tamper with action_2
    evt = db.query(AuditEvent).filter(AuditEvent.org_id == org.id, AuditEvent.sequence_number == 2).first()
    evt.action = "tampered_action"
    db.flush()

    valid, count, failure_seq, msg = verify_chain(db, org.id)
    assert valid is False
    assert failure_seq == 2
    assert "Hash mismatch at sequence 2" in msg


def test_audit_deletion_gap_detection(db):
    org = Organization(id=str(uuid.uuid4()), name="Audit Org")
    db.add(org)
    db.flush()

    record_event(db, org.id, "event_1")
    record_event(db, org.id, "event_2")
    record_event(db, org.id, "event_3")
    db.commit()

    # Delete event_2
    evt = db.query(AuditEvent).filter(AuditEvent.org_id == org.id, AuditEvent.sequence_number == 2).first()
    db.delete(evt)
    db.flush()

    valid, count, failure_seq, msg = verify_chain(db, org.id)
    assert valid is False
    assert "gap" in msg.lower() or "break" in msg.lower()
