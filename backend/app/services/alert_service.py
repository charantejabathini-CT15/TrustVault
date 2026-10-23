"""Alert detection service: rule-based suspicious access monitoring."""

from datetime import datetime, timezone, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.models.models import (
    AuditEvent, SecurityAlert, AlertSeverity, AlertStatus
)


# --- Rule Configuration ---

ALERT_RULES = {
    "repeated_unauthorized_access": {
        "description": "Multiple unauthorized access attempts within a short window",
        "threshold": 3,
        "window_minutes": 10,
        "severity": AlertSeverity.HIGH,
        "recommendation": "Review the user's access patterns and consider temporarily suspending their account.",
    },
    "multi_document_denied": {
        "description": "Access denied to multiple different documents",
        "threshold": 3,
        "window_minutes": 15,
        "severity": AlertSeverity.MEDIUM,
        "recommendation": "Verify the user's role and document permissions. They may need updated access.",
    },
    "expired_grant_probe": {
        "description": "Repeated access attempts using expired grants",
        "threshold": 2,
        "window_minutes": 30,
        "severity": AlertSeverity.MEDIUM,
        "recommendation": "Check if the user needs renewed access or is attempting unauthorized access.",
    },
    "download_burst": {
        "description": "Unusually high number of document downloads in a short period",
        "threshold": 10,
        "window_minutes": 5,
        "severity": AlertSeverity.HIGH,
        "recommendation": "Verify this is legitimate bulk access. Consider rate limiting the user.",
    },
    "integrity_failure": {
        "description": "Repeated encryption or integrity verification failures",
        "threshold": 2,
        "window_minutes": 60,
        "severity": AlertSeverity.CRITICAL,
        "recommendation": "Investigate potential data corruption or tampering. Review audit logs.",
    },
}


def evaluate_rules(db: Session, org_id: str) -> List[SecurityAlert]:
    """Evaluate all alert rules and create alerts for detected patterns.
    Returns list of newly created alerts."""
    now = datetime.now(timezone.utc)
    new_alerts = []

    # Rule 1: Repeated unauthorized access
    new_alerts.extend(
        _check_repeated_denied(db, org_id, now)
    )

    # Rule 2: Multi-document denied
    new_alerts.extend(
        _check_multi_doc_denied(db, org_id, now)
    )

    # Rule 3: Expired grant probes
    new_alerts.extend(
        _check_expired_probes(db, org_id, now)
    )

    # Rule 4: Download burst
    new_alerts.extend(
        _check_download_burst(db, org_id, now)
    )

    # Rule 5: Integrity failures
    new_alerts.extend(
        _check_integrity_failures(db, org_id, now)
    )

    return new_alerts


def _check_repeated_denied(db: Session, org_id: str, now: datetime) -> List[SecurityAlert]:
    """Check for repeated unauthorized access attempts."""
    rule = ALERT_RULES["repeated_unauthorized_access"]
    window_start = now - timedelta(minutes=rule["window_minutes"])

    # Find users with many denied access attempts
    results = db.query(
        AuditEvent.actor_id,
        func.count(AuditEvent.id).label("count"),
    ).filter(
        AuditEvent.org_id == org_id,
        AuditEvent.action.in_(["document_access", "document_download"]),
        AuditEvent.result == "denied",
        AuditEvent.created_at >= window_start,
    ).group_by(AuditEvent.actor_id).having(
        func.count(AuditEvent.id) >= rule["threshold"]
    ).all()

    alerts = []
    for actor_id, count in results:
        if actor_id and not _alert_exists_recently(db, org_id, "repeated_unauthorized_access", actor_id, window_start):
            alert = SecurityAlert(
                org_id=org_id,
                user_id=actor_id,
                rule_name="repeated_unauthorized_access",
                severity=rule["severity"],
                description=f"{rule['description']}: {count} attempts in {rule['window_minutes']} minutes",
                evidence_json={"denied_count": count, "window_minutes": rule["window_minutes"]},
                recommendation=rule["recommendation"],
            )
            db.add(alert)
            alerts.append(alert)

    return alerts


def _check_multi_doc_denied(db: Session, org_id: str, now: datetime) -> List[SecurityAlert]:
    """Check for access denied to multiple different documents."""
    rule = ALERT_RULES["multi_document_denied"]
    window_start = now - timedelta(minutes=rule["window_minutes"])

    results = db.query(
        AuditEvent.actor_id,
        func.count(func.distinct(AuditEvent.document_id)).label("doc_count"),
    ).filter(
        AuditEvent.org_id == org_id,
        AuditEvent.result == "denied",
        AuditEvent.document_id.isnot(None),
        AuditEvent.created_at >= window_start,
    ).group_by(AuditEvent.actor_id).having(
        func.count(func.distinct(AuditEvent.document_id)) >= rule["threshold"]
    ).all()

    alerts = []
    for actor_id, doc_count in results:
        if actor_id and not _alert_exists_recently(db, org_id, "multi_document_denied", actor_id, window_start):
            alert = SecurityAlert(
                org_id=org_id,
                user_id=actor_id,
                rule_name="multi_document_denied",
                severity=rule["severity"],
                description=f"{rule['description']}: {doc_count} distinct documents",
                evidence_json={"distinct_documents_denied": doc_count},
                recommendation=rule["recommendation"],
            )
            db.add(alert)
            alerts.append(alert)

    return alerts


def _check_expired_probes(db: Session, org_id: str, now: datetime) -> List[SecurityAlert]:
    """Check for repeated expired grant access attempts."""
    rule = ALERT_RULES["expired_grant_probe"]
    window_start = now - timedelta(minutes=rule["window_minutes"])

    results = db.query(
        AuditEvent.actor_id,
        func.count(AuditEvent.id).label("count"),
    ).filter(
        AuditEvent.org_id == org_id,
        AuditEvent.action == "expired_grant_rejected",
        AuditEvent.created_at >= window_start,
    ).group_by(AuditEvent.actor_id).having(
        func.count(AuditEvent.id) >= rule["threshold"]
    ).all()

    alerts = []
    for actor_id, count in results:
        if actor_id and not _alert_exists_recently(db, org_id, "expired_grant_probe", actor_id, window_start):
            alert = SecurityAlert(
                org_id=org_id,
                user_id=actor_id,
                rule_name="expired_grant_probe",
                severity=rule["severity"],
                description=f"{rule['description']}: {count} attempts",
                evidence_json={"expired_attempts": count},
                recommendation=rule["recommendation"],
            )
            db.add(alert)
            alerts.append(alert)

    return alerts


def _check_download_burst(db: Session, org_id: str, now: datetime) -> List[SecurityAlert]:
    """Check for unusual burst of downloads."""
    rule = ALERT_RULES["download_burst"]
    window_start = now - timedelta(minutes=rule["window_minutes"])

    results = db.query(
        AuditEvent.actor_id,
        func.count(AuditEvent.id).label("count"),
    ).filter(
        AuditEvent.org_id == org_id,
        AuditEvent.action == "document_download",
        AuditEvent.result == "success",
        AuditEvent.created_at >= window_start,
    ).group_by(AuditEvent.actor_id).having(
        func.count(AuditEvent.id) >= rule["threshold"]
    ).all()

    alerts = []
    for actor_id, count in results:
        if actor_id and not _alert_exists_recently(db, org_id, "download_burst", actor_id, window_start):
            alert = SecurityAlert(
                org_id=org_id,
                user_id=actor_id,
                rule_name="download_burst",
                severity=rule["severity"],
                description=f"{rule['description']}: {count} downloads in {rule['window_minutes']} minutes",
                evidence_json={"download_count": count, "window_minutes": rule["window_minutes"]},
                recommendation=rule["recommendation"],
            )
            db.add(alert)
            alerts.append(alert)

    return alerts


def _check_integrity_failures(db: Session, org_id: str, now: datetime) -> List[SecurityAlert]:
    """Check for integrity or encryption failures."""
    rule = ALERT_RULES["integrity_failure"]
    window_start = now - timedelta(minutes=rule["window_minutes"])

    count = db.query(func.count(AuditEvent.id)).filter(
        AuditEvent.org_id == org_id,
        AuditEvent.action.in_(["integrity_failure", "decryption_failure"]),
        AuditEvent.created_at >= window_start,
    ).scalar()

    alerts = []
    if count and count >= rule["threshold"]:
        if not _alert_exists_recently(db, org_id, "integrity_failure", None, window_start):
            alert = SecurityAlert(
                org_id=org_id,
                rule_name="integrity_failure",
                severity=rule["severity"],
                description=f"{rule['description']}: {count} failures in {rule['window_minutes']} minutes",
                evidence_json={"failure_count": count},
                recommendation=rule["recommendation"],
            )
            db.add(alert)
            alerts.append(alert)

    return alerts


def _alert_exists_recently(
    db: Session, org_id: str, rule_name: str,
    user_id: Optional[str], since: datetime,
) -> bool:
    """Check if an alert for this rule/user already exists in the window."""
    query = db.query(SecurityAlert).filter(
        SecurityAlert.org_id == org_id,
        SecurityAlert.rule_name == rule_name,
        SecurityAlert.created_at >= since,
    )
    if user_id:
        query = query.filter(SecurityAlert.user_id == user_id)
    return query.first() is not None
