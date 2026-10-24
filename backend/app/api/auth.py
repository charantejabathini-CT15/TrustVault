"""Authentication API routes."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Response, Request

from app.core.database import FirestoreStore, get_db
from app.core.security import hash_password, verify_password, create_session_token, generate_csrf_token
from app.core.config import settings
from app.models.models import User, Organization, OrgMembership, OrgRole
from app.schemas.schemas import RegisterRequest, LoginRequest, AuthResponse
from app.middleware.auth import get_current_user, get_current_org_id
from app.middleware.rate_limit import login_limiter
from app.services.audit_service import record_event

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthResponse)
def register(req: RegisterRequest, response: Response, db: FirestoreStore = Depends(get_db)):
    """Register a new user and create an organization."""
    # Check if email is already taken
    existing = db.first(User, {"email": req.email})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    # Hash password
    pw_hash = hash_password(req.password)

    # Create user
    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        display_name=req.display_name,
        password_hash=pw_hash,
    )
    db.add(user)

    # Create organization
    org = Organization(
        id=str(uuid.uuid4()),
        name=req.org_name,
    )
    db.add(org)

    # Create owner membership
    membership = OrgMembership(
        id=str(uuid.uuid4()),
        user_id=user.id,
        org_id=org.id,
        role=OrgRole.OWNER,
    )
    db.add(membership)

    db.commit()

    # Record audit event
    record_event(
        db, org.id, "user_registered",
        actor_id=user.id,
        metadata={"email": user.email},
    )
    db.commit()

    # Set session cookie
    session_token = create_session_token(user.id, org.id)
    csrf_token = generate_csrf_token()

    response.set_cookie(
        key="session",
        value=session_token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.SESSION_EXPIRY_HOURS * 3600,
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,  # Needs to be read by JS for X-CSRF-Token header
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.SESSION_EXPIRY_HOURS * 3600,
    )

    return AuthResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        org_id=org.id,
        org_name=org.name,
        role=OrgRole.OWNER.value,
        has_keys=False,
    )


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, request: Request, response: Response, db: FirestoreStore = Depends(get_db)):
    """Authenticate user and create session."""
    # Rate limiting
    limit_key = f"login:{req.email}"
    allowed, wait_seconds = login_limiter.check(limit_key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many login attempts. Try again in {wait_seconds} seconds.",
        )

    # Find user
    user = db.first(User, {"email": req.email})
    if not user or not verify_password(req.password, user.password_hash):
        login_limiter.record(limit_key)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Get org membership
    membership = db.first(OrgMembership, {"user_id": user.id})

    org_id = membership.org_id if membership else None
    org_name = None
    role = None

    if membership:
        org = db.get(Organization, membership.org_id)
        org_name = org.name if org else None
        role = membership.role.value

        # Record audit event
        record_event(
            db, org_id, "user_login",
            actor_id=user.id,
            metadata={"ip": request.client.host if request.client else "unknown"},
        )
        db.commit()

    # Set session
    session_token = create_session_token(user.id, org_id)
    csrf_token = generate_csrf_token()

    response.set_cookie(
        key="session",
        value=session_token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.SESSION_EXPIRY_HOURS * 3600,
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.SESSION_EXPIRY_HOURS * 3600,
    )

    return AuthResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        org_id=org_id,
        org_name=org_name,
        role=role,
        has_keys=bool(user.public_key),
    )


@router.post("/logout")
def logout(
    response: Response,
    request: Request,
    user: User = Depends(get_current_user),
    db: FirestoreStore = Depends(get_db),
):
    """Log out the current user."""
    org_id = getattr(request.state, "org_id", None)
    if org_id:
        record_event(db, org_id, "user_logout", actor_id=user.id)
        db.commit()

    response.delete_cookie("session")
    response.delete_cookie("csrf_token")
    return {"message": "Logged out"}


@router.get("/me", response_model=AuthResponse)
def get_me(
    request: Request,
    user: User = Depends(get_current_user),
    db: FirestoreStore = Depends(get_db),
):
    """Get the current authenticated user's info."""
    org_id = getattr(request.state, "org_id", None)
    org_name = None
    role = None

    if org_id:
        membership = db.first(OrgMembership, {"user_id": user.id, "org_id": org_id})
        if membership:
            org = db.get(Organization, org_id)
            org_name = org.name if org else None
            role = membership.role.value

    return AuthResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        org_id=org_id,
        org_name=org_name,
        role=role,
        has_keys=bool(user.public_key),
    )
