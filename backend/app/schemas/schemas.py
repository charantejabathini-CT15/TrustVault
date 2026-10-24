"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum
import re


# --- Auth Schemas ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=255)
    org_name: str = Field(..., min_length=1, max_length=255)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain an uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain a lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain a digit")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    id: str
    email: str
    display_name: str
    org_id: Optional[str] = None
    org_name: Optional[str] = None
    role: Optional[str] = None
    has_keys: bool = False


class UserPublicInfo(BaseModel):
    id: str
    email: str
    display_name: str
    public_key: Optional[str] = None


# --- Organization Schemas ---

class OrgMemberResponse(BaseModel):
    id: str
    user_id: str
    email: str
    display_name: str
    role: str
    joined_at: datetime


class OrgMemberListResponse(BaseModel):
    members: List[OrgMemberResponse]
    total: int


# --- Document Schemas ---

class DocumentResponse(BaseModel):
    id: str
    name: str
    content_type: Optional[str] = None
    size: int
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    org_id: str
    encrypted_file_hash: Optional[str] = None
    created_at: datetime
    share_count: int = 0
    has_access: bool = False
    permission: Optional[str] = None


class DocumentDetailResponse(DocumentResponse):
    shares: List["ShareResponse"] = []
    key_envelope: Optional[str] = None


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


class PrepareDocumentUploadRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    content_type: Optional[str] = None
    size: int = Field(..., gt=0, le=50 * 1024 * 1024)
    encrypted_file_hash: str = Field(..., pattern=r"^[a-fA-F0-9]{64}$")
    encrypted_key: str = Field(..., min_length=1)


class PrepareDocumentUploadResponse(BaseModel):
    document_id: str
    upload_url: str


class CompleteDocumentUploadRequest(PrepareDocumentUploadRequest):
    document_id: str


# --- Share Schemas ---

class CreateShareRequest(BaseModel):
    grantee_email: EmailStr
    permission: str = Field(..., pattern=r"^(view|download)$")
    expires_at: Optional[datetime] = None
    encrypted_key: str = Field(..., min_length=1)


class ShareResponse(BaseModel):
    id: str
    document_id: str
    grantor_id: Optional[str] = None
    grantor_name: Optional[str] = None
    grantee_id: str
    grantee_email: Optional[str] = None
    grantee_name: Optional[str] = None
    permission: str
    expires_at: Optional[datetime] = None
    revoked: bool = False
    revoked_at: Optional[datetime] = None
    created_at: datetime


class UpdateShareRequest(BaseModel):
    permission: Optional[str] = Field(None, pattern=r"^(view|download)$")
    expires_at: Optional[datetime] = None


# --- Audit Schemas ---

class AuditEventResponse(BaseModel):
    id: int
    org_id: str
    actor_id: Optional[str] = None
    actor_email: Optional[str] = None
    actor_name: Optional[str] = None
    document_id: Optional[str] = None
    document_name: Optional[str] = None
    action: str
    result: str
    metadata_json: Optional[Any] = None
    request_id: Optional[str] = None
    previous_hash: str
    event_hash: str
    sequence_number: int
    created_at: datetime


class AuditListResponse(BaseModel):
    events: List[AuditEventResponse]
    total: int


class AuditVerifyResponse(BaseModel):
    valid: bool
    events_checked: int
    first_failure_sequence: Optional[int] = None
    message: str


# --- Policy Simulator ---

class PolicySimulateRequest(BaseModel):
    user_id: str
    document_id: str
    action: str = Field(..., pattern=r"^(view|download)$")
    simulated_time: Optional[datetime] = None


class PolicySimulateResponse(BaseModel):
    allowed: bool
    reason: str
    checks: List[dict]


# --- Alert Schemas ---

class AlertResponse(BaseModel):
    id: str
    org_id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    document_id: Optional[str] = None
    rule_name: str
    severity: str
    description: str
    evidence_json: Optional[Any] = None
    recommendation: Optional[str] = None
    status: str
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime


class AlertUpdateRequest(BaseModel):
    status: str = Field(..., pattern=r"^(acknowledged|resolved|dismissed)$")


class AlertListResponse(BaseModel):
    alerts: List[AlertResponse]
    total: int


# --- Key Management ---

class KeyUploadRequest(BaseModel):
    public_key: str = Field(..., min_length=1)
    encrypted_private_key: str = Field(..., min_length=1)
    private_key_salt: str = Field(..., min_length=1)
    pbkdf2_iterations: int = Field(default=600000, ge=100000)


class ProfileResponse(BaseModel):
    id: str
    email: str
    display_name: str
    has_keys: bool
    public_key: Optional[str] = None
    encrypted_private_key: Optional[str] = None
    private_key_salt: Optional[str] = None
    pbkdf2_iterations: Optional[int] = None
    created_at: datetime


# --- Dashboard ---

class DashboardStats(BaseModel):
    total_documents: int = 0
    shared_documents: int = 0
    active_shares: int = 0
    expiring_soon: int = 0
    recent_alerts: int = 0
    recent_events: List[AuditEventResponse] = []
