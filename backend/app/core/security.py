"""Security utilities: password hashing, session management, CSRF."""

import secrets
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Optional
from argon2 import PasswordHasher, Type
from argon2.exceptions import VerifyMismatchError
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from app.core.config import settings


# --- Password Hashing (Argon2id) ---

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    type=Type.ID,  # argon2id
)


def hash_password(password: str) -> str:
    """Hash a password using Argon2id."""
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against an Argon2id hash."""
    try:
        return ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


# --- Session Management ---

serializer = URLSafeTimedSerializer(settings.SECRET_KEY)


def create_session_token(user_id: str, org_id: Optional[str] = None) -> str:
    """Create a signed session token containing user_id and org_id."""
    data = {"uid": user_id}
    if org_id:
        data["oid"] = org_id
    return serializer.dumps(data)


def verify_session_token(token: str) -> Optional[dict]:
    """Verify and decode a session token. Returns None if invalid or expired."""
    max_age = settings.SESSION_EXPIRY_HOURS * 3600
    try:
        data = serializer.loads(token, max_age=max_age)
        return data
    except (BadSignature, SignatureExpired):
        return None


# --- CSRF Token ---

def generate_csrf_token() -> str:
    """Generate a random CSRF token."""
    return secrets.token_hex(32)


def verify_csrf_token(cookie_token: str, header_token: str) -> bool:
    """Verify CSRF token using constant-time comparison."""
    if not cookie_token or not header_token:
        return False
    return hmac.compare_digest(cookie_token, header_token)


# --- Audit Hashing ---

def compute_event_hash(canonical_data: str, previous_hash: str) -> str:
    """Compute SHA-256 hash of canonical event data chained with previous hash."""
    payload = f"{previous_hash}|{canonical_data}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
