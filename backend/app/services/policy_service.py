"""Policy evaluation service: deterministic access-decision logic.

This same logic is used by both the real authorization middleware
and the access-policy simulator, ensuring consistency."""

from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session

from app.models.models import (
    Document, DocumentShare, OrgMembership, User, SharePermission
)


class PolicyCheck:
    """One step in the policy evaluation."""
    def __init__(self, check: str, passed: bool, detail: str):
        self.check = check
        self.passed = passed
        self.detail = detail

    def to_dict(self) -> dict:
        return {"check": self.check, "passed": self.passed, "detail": self.detail}


class PolicyResult:
    """Complete result of policy evaluation."""
    def __init__(self, allowed: bool, reason: str, checks: List[PolicyCheck]):
        self.allowed = allowed
        self.reason = reason
        self.checks = checks


def evaluate_access(
    db: Session,
    user_id: str,
    document_id: str,
    action: str,
    eval_time: Optional[datetime] = None,
) -> PolicyResult:
    """Evaluate whether a user can perform an action on a document.

    Args:
        db: Database session
        user_id: The user requesting access
        document_id: The target document
        action: 'view' or 'download'
        eval_time: Override current time for simulation (None = now)

    Returns:
        PolicyResult with allowed/denied, reason, and detailed checks.
    """
    now = eval_time or datetime.now(timezone.utc)
    checks: List[PolicyCheck] = []

    # 1. Check user exists
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        checks.append(PolicyCheck("user_exists", False, "User not found"))
        return PolicyResult(False, "User does not exist", checks)
    checks.append(PolicyCheck("user_exists", True, f"User: {user.email}"))

    # 2. Check document exists and is not deleted
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.deleted == False,
    ).first()
    if not document:
        checks.append(PolicyCheck("document_exists", False, "Document not found or deleted"))
        return PolicyResult(False, "Document not found", checks)
    checks.append(PolicyCheck("document_exists", True, f"Document: {document.name}"))

    # 3. Check organization membership
    membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == user_id,
        OrgMembership.org_id == document.org_id,
    ).first()
    if not membership:
        checks.append(PolicyCheck("org_membership", False, "User is not a member of the document's organization"))
        return PolicyResult(False, "User is not in the document's organization", checks)
    checks.append(PolicyCheck("org_membership", True, f"Role: {membership.role.value}"))

    # 4. Check if user is the document owner
    if document.owner_id == user_id:
        checks.append(PolicyCheck("is_owner", True, "User is the document owner"))
        return PolicyResult(True, "Owner has full access", checks)
    checks.append(PolicyCheck("is_owner", False, "User is not the document owner"))

    # 5. Check for active share grant
    shares = db.query(DocumentShare).filter(
        DocumentShare.document_id == document_id,
        DocumentShare.grantee_id == user_id,
    ).all()

    if not shares:
        checks.append(PolicyCheck("share_exists", False, "No share grant exists for this user"))
        return PolicyResult(False, "No access grant found", checks)
    checks.append(PolicyCheck("share_exists", True, f"Found {len(shares)} share(s)"))

    # 6. Check each share for validity
    for share in shares:
        share_checks = []

        # Check revocation
        if share.revoked:
            share_checks.append(PolicyCheck(
                "share_not_revoked", False,
                f"Grant {share.id[:8]} was revoked at {share.revoked_at}"
            ))
            checks.extend(share_checks)
            continue
        share_checks.append(PolicyCheck("share_not_revoked", True, "Grant is active"))

        # Check expiration
        expires_at = share.expires_at
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at and now >= expires_at:
            share_checks.append(PolicyCheck(
                "share_not_expired", False,
                f"Grant expired at {expires_at.isoformat()}"
            ))
            checks.extend(share_checks)
            continue
        if share.expires_at:
            share_checks.append(PolicyCheck(
                "share_not_expired", True,
                f"Expires at {expires_at.isoformat()}"
            ))
        else:
            share_checks.append(PolicyCheck("share_not_expired", True, "No expiration set"))

        # Check permission level
        if action == "download" and share.permission == SharePermission.VIEW:
            share_checks.append(PolicyCheck(
                "permission_sufficient", False,
                f"Grant allows '{share.permission.value}' but '{action}' was requested"
            ))
            checks.extend(share_checks)
            continue
        share_checks.append(PolicyCheck(
            "permission_sufficient", True,
            f"Grant allows '{share.permission.value}', requested '{action}'"
        ))

        # All checks passed for this share
        checks.extend(share_checks)
        return PolicyResult(True, f"Access allowed via grant {share.id[:8]}", checks)

    # No valid share found
    return PolicyResult(
        False,
        "All grants are revoked, expired, or insufficient permission",
        checks
    )
