"""Audit, Policy Simulator, Alerts, Profile, Dashboard API routes."""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.models import (
    User, OrgMembership, Document, DocumentShare, AuditEvent,
    SecurityAlert, AlertStatus, OrgRole,
)
from app.schemas.schemas import (
    AuditListResponse, AuditEventResponse, AuditVerifyResponse,
    PolicySimulateRequest, PolicySimulateResponse,
    AlertResponse, AlertListResponse, AlertUpdateRequest,
    ProfileResponse, KeyUploadRequest, DashboardStats,
    OrgMemberResponse, OrgMemberListResponse,
)
from app.middleware.auth import get_current_user, get_current_org_id, require_role
from app.services.audit_service import get_events, verify_chain, record_event
from app.services.policy_service import evaluate_access
from app.services.alert_service import evaluate_rules

# --- Audit Routes ---
audit_router = APIRouter(prefix="/api/audit", tags=["Audit"])


@audit_router.get("", response_model=AuditListResponse)
def list_audit_events(
    request: Request,
    actor_id: Optional[str] = None,
    document_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """List audit events with filters."""
    # Only allow owner, admin, auditor
    membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == user.id,
        OrgMembership.org_id == org_id,
    ).first()
    if not membership or membership.role not in (OrgRole.OWNER, OrgRole.ADMIN, OrgRole.AUDITOR):
        raise HTTPException(status_code=403, detail="Insufficient permissions to view audit log")

    start_dt = datetime.fromisoformat(start_date) if start_date else None
    end_dt = datetime.fromisoformat(end_date) if end_date else None

    events, total = get_events(
        db, org_id,
        actor_id=actor_id,
        document_id=document_id,
        action=action,
        result=result,
        start_date=start_dt,
        end_date=end_dt,
        offset=offset,
        limit=limit,
    )

    return AuditListResponse(
        events=[AuditEventResponse(**e) for e in events],
        total=total,
    )


@audit_router.post("/verify", response_model=AuditVerifyResponse)
def verify_audit_chain(
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Verify the integrity of the audit hash chain."""
    membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == user.id,
        OrgMembership.org_id == org_id,
    ).first()
    if not membership or membership.role not in (OrgRole.OWNER, OrgRole.ADMIN, OrgRole.AUDITOR):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    valid, events_checked, first_failure, message = verify_chain(db, org_id)

    record_event(
        db, org_id, "audit_verification",
        actor_id=user.id,
        result="success" if valid else "failure",
        metadata={"events_checked": events_checked, "valid": valid},
    )
    db.commit()

    return AuditVerifyResponse(
        valid=valid,
        events_checked=events_checked,
        first_failure_sequence=first_failure,
        message=message,
    )


# --- Policy Simulator Routes ---
policy_router = APIRouter(prefix="/api/policy", tags=["Policy Simulator"])


@policy_router.post("/simulate", response_model=PolicySimulateResponse)
def simulate_policy(
    req: PolicySimulateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Simulate an access policy evaluation.
    Read-only: does not modify data, decrypt documents, or bypass auth."""
    # Only owner/admin can simulate
    membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == user.id,
        OrgMembership.org_id == org_id,
    ).first()
    if not membership or membership.role not in (OrgRole.OWNER, OrgRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only admins can use the policy simulator")

    # Verify target user and document are in the same org
    target_membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == req.user_id,
        OrgMembership.org_id == org_id,
    ).first()
    if not target_membership:
        raise HTTPException(status_code=400, detail="Target user is not in this organization")

    target_doc = db.query(Document).filter(
        Document.id == req.document_id,
        Document.org_id == org_id,
    ).first()
    if not target_doc:
        raise HTTPException(status_code=400, detail="Document not found in this organization")

    # Run simulation using the SAME policy engine as production
    result = evaluate_access(
        db, req.user_id, req.document_id, req.action,
        eval_time=req.simulated_time,
    )

    return PolicySimulateResponse(
        allowed=result.allowed,
        reason=result.reason,
        checks=[c.to_dict() for c in result.checks],
    )


# --- Alert Routes ---
alert_router = APIRouter(prefix="/api/alerts", tags=["Security Alerts"])


@alert_router.get("", response_model=AlertListResponse)
def list_alerts(
    request: Request,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """List security alerts."""
    membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == user.id,
        OrgMembership.org_id == org_id,
    ).first()
    if not membership or membership.role not in (OrgRole.OWNER, OrgRole.ADMIN, OrgRole.AUDITOR):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = db.query(SecurityAlert).filter(SecurityAlert.org_id == org_id)

    if status:
        query = query.filter(SecurityAlert.status == status)
    if severity:
        query = query.filter(SecurityAlert.severity == severity)

    total = query.count()
    alerts = query.order_by(SecurityAlert.created_at.desc()).offset(offset).limit(limit).all()

    alerts_list = []
    for a in alerts:
        user_email = None
        if a.user_id:
            u = db.query(User).filter(User.id == a.user_id).first()
            if u:
                user_email = u.email
        alerts_list.append(AlertResponse(
            id=a.id,
            org_id=a.org_id,
            user_id=a.user_id,
            user_email=user_email,
            document_id=a.document_id,
            rule_name=a.rule_name,
            severity=a.severity.value,
            description=a.description,
            evidence_json=a.evidence_json,
            recommendation=a.recommendation,
            status=a.status.value,
            resolved_by=a.resolved_by,
            resolved_at=a.resolved_at,
            created_at=a.created_at,
        ))

    return AlertListResponse(
        alerts=alerts_list,
        total=total,
    )


@alert_router.patch("/{alert_id}", response_model=AlertResponse)
def update_alert(
    alert_id: str,
    req: AlertUpdateRequest,
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Update alert status (acknowledge, resolve, dismiss)."""
    alert = db.query(SecurityAlert).filter(
        SecurityAlert.id == alert_id,
        SecurityAlert.org_id == org_id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = AlertStatus(req.status)
    if req.status in ("resolved", "dismissed"):
        alert.resolved_by = user.id
        alert.resolved_at = datetime.now(timezone.utc)

    record_event(
        db, org_id, "alert_updated",
        actor_id=user.id,
        metadata={"alert_id": alert_id, "new_status": req.status},
    )
    db.commit()

    return AlertResponse(
        id=alert.id,
        org_id=alert.org_id,
        user_id=alert.user_id,
        document_id=alert.document_id,
        rule_name=alert.rule_name,
        severity=alert.severity.value,
        description=alert.description,
        evidence_json=alert.evidence_json,
        recommendation=alert.recommendation,
        status=alert.status.value,
        resolved_by=alert.resolved_by,
        resolved_at=alert.resolved_at,
        created_at=alert.created_at,
    )


# --- Profile/Keys Routes ---
profile_router = APIRouter(prefix="/api/profile", tags=["Profile"])


@profile_router.get("", response_model=ProfileResponse)
def get_profile(
    user: User = Depends(get_current_user),
):
    """Get current user's profile."""
    return ProfileResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        has_keys=bool(user.public_key),
        public_key=user.public_key,
        encrypted_private_key=user.encrypted_private_key,
        private_key_salt=user.private_key_salt,
        pbkdf2_iterations=user.pbkdf2_iterations,
        created_at=user.created_at,
    )


@profile_router.put("/keys")
@profile_router.post("/keys")
@profile_router.put("/encrypted-private-key")
@profile_router.post("/encrypted-private-key")
def upload_keys(
    req: KeyUploadRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload or update encryption keys."""
    user.public_key = req.public_key
    user.encrypted_private_key = req.encrypted_private_key
    user.private_key_salt = req.private_key_salt
    user.pbkdf2_iterations = req.pbkdf2_iterations

    org_id = getattr(request.state, "org_id", None)
    if org_id:
        record_event(
            db, org_id, "keys_updated",
            actor_id=user.id,
        )
    db.commit()
    return {"message": "Keys updated"}



@profile_router.get("/public-key/{user_id}", response_model=dict)
def get_public_key(
    user_id: str,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Get another user's public key (must be in same org)."""
    target_membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == user_id,
        OrgMembership.org_id == org_id,
    ).first()
    if not target_membership:
        raise HTTPException(status_code=404, detail="User not found in organization")

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user or not target_user.public_key:
        raise HTTPException(status_code=404, detail="User has no public key")

    return {"user_id": target_user.id, "public_key": target_user.public_key}


# --- Dashboard Routes ---
dashboard_router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@dashboard_router.get("", response_model=DashboardStats)
@dashboard_router.get("/stats", response_model=DashboardStats)
def get_dashboard(
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Get dashboard statistics."""
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=7)

    total_docs = db.query(Document).filter(
        Document.org_id == org_id,
        Document.deleted == False,
    ).count()

    shared_docs = db.query(func.count(func.distinct(DocumentShare.document_id))).filter(
        DocumentShare.document_id.in_(
            db.query(Document.id).filter(Document.org_id == org_id)
        ),
        DocumentShare.revoked == False,
    ).scalar() or 0

    active_shares = db.query(DocumentShare).filter(
        DocumentShare.document_id.in_(
            db.query(Document.id).filter(Document.org_id == org_id)
        ),
        DocumentShare.revoked == False,
    ).count()

    expiring_soon = db.query(DocumentShare).filter(
        DocumentShare.document_id.in_(
            db.query(Document.id).filter(Document.org_id == org_id)
        ),
        DocumentShare.revoked == False,
        DocumentShare.expires_at.isnot(None),
        DocumentShare.expires_at <= soon,
        DocumentShare.expires_at > now,
    ).count()

    recent_alerts = db.query(SecurityAlert).filter(
        SecurityAlert.org_id == org_id,
        SecurityAlert.status == AlertStatus.OPEN,
    ).count()

    # Recent events
    events, _ = get_events(db, org_id, limit=10)

    return DashboardStats(
        total_documents=total_docs,
        shared_documents=shared_docs,
        active_shares=active_shares,
        expiring_soon=expiring_soon,
        recent_alerts=recent_alerts,
        recent_events=[AuditEventResponse(**e) for e in events],
    )


# --- Team/Members Routes ---
team_router = APIRouter(prefix="/api/team", tags=["Team"])


@team_router.get("/members", response_model=OrgMemberListResponse)
def list_members(
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """List organization members."""
    memberships = db.query(OrgMembership).filter(
        OrgMembership.org_id == org_id,
    ).all()

    results = []
    for m in memberships:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            results.append(OrgMemberResponse(
                id=m.id,
                user_id=u.id,
                email=u.email,
                display_name=u.display_name,
                role=m.role.value,
                joined_at=m.created_at,
            ))

    return OrgMemberListResponse(members=results, total=len(results))


class MemberInviteRequest(BaseModel):
    email: str
    role: str = "member"


@team_router.post("/invite")
@team_router.post("/members")
def invite_member(
    request: Request,
    req: Optional[MemberInviteRequest] = None,
    email: Optional[str] = None,
    role: Optional[str] = None,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Add a member to the organization (user must already be registered)."""
    target_email = (req.email if req else email) or ""
    target_role = (req.role if req else role) or "member"

    membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == user.id,
        OrgMembership.org_id == org_id,
    ).first()
    if not membership or membership.role not in (OrgRole.OWNER, OrgRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only admins can invite members")

    target = db.query(User).filter(User.email == target_email).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found. They must register first.")

    existing = db.query(OrgMembership).filter(
        OrgMembership.user_id == target.id,
        OrgMembership.org_id == org_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="User is already a member")

    valid_roles = {"member": OrgRole.MEMBER, "admin": OrgRole.ADMIN, "auditor": OrgRole.AUDITOR}
    org_role = valid_roles.get(target_role)
    if not org_role:
        raise HTTPException(status_code=400, detail=f"Invalid role. Use: {', '.join(valid_roles.keys())}")

    new_membership = OrgMembership(
        id=str(uuid.uuid4()),
        user_id=target.id,
        org_id=org_id,
        role=org_role,
    )
    db.add(new_membership)

    record_event(
        db, org_id, "member_invited",
        actor_id=user.id,
        metadata={"invited_user": target.id, "role": role},
    )
    db.commit()

    return {"message": f"User {email} added as {role}"}
