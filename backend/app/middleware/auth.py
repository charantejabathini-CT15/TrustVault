"""Authentication and authorization dependencies."""

from typing import Optional
from fastapi import Depends, HTTPException, Request, Response, Cookie
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import verify_session_token, verify_csrf_token
from app.models.models import User, OrgMembership, OrgRole


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Extract and validate the current user from session cookie."""
    session_token = request.cookies.get("session")
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    data = verify_session_token(session_token)
    if not data or "uid" not in data:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = db.query(User).filter(User.id == data["uid"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Attach org_id from session to the request state
    request.state.org_id = data.get("oid")
    request.state.user = user
    return user


def get_current_org_id(
    request: Request,
    user: User = Depends(get_current_user),
) -> str:
    """Get the current organization ID from the session."""
    org_id = getattr(request.state, "org_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization selected")
    return org_id


def require_role(*roles: OrgRole):
    """Dependency factory for role-based access control."""
    def dependency(
        request: Request,
        user: User = Depends(get_current_user),
        org_id: str = Depends(get_current_org_id),
        db: Session = Depends(get_db),
    ):
        membership = db.query(OrgMembership).filter(
            OrgMembership.user_id == user.id,
            OrgMembership.org_id == org_id,
        ).first()
        if not membership or membership.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return membership
    return dependency


def verify_csrf(request: Request) -> None:
    """Verify CSRF token for state-changing requests."""
    # Skip CSRF for safe methods
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    cookie_token = request.cookies.get("csrf_token")
    header_token = request.headers.get("X-CSRF-Token")

    if not verify_csrf_token(cookie_token or "", header_token or ""):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
