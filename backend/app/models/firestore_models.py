"""Firestore document models for TrustVault's domain entities."""

import enum
import uuid
from dataclasses import asdict, dataclass, field, fields
from datetime import datetime, timezone
from typing import ClassVar, Optional


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class OrgRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    AUDITOR = "auditor"


class SharePermission(str, enum.Enum):
    VIEW = "view"
    DOWNLOAD = "download"


class AlertSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class FirestoreModel:
    collection: ClassVar[str]
    enum_fields: ClassVar[dict[str, type[enum.Enum]]] = {}

    def firestore_id(self) -> str:
        return str(self.id)

    def to_firestore(self) -> dict:
        def normalize(value):
            if isinstance(value, enum.Enum):
                return value.value
            if isinstance(value, dict):
                return {key: normalize(item) for key, item in value.items()}
            if isinstance(value, list):
                return [normalize(item) for item in value]
            return value

        return normalize(asdict(self))

    @classmethod
    def from_snapshot(cls, snapshot):
        data = snapshot.to_dict() or {}
        data.setdefault("id", snapshot.id)
        allowed_fields = {field.name for field in fields(cls)}
        data = {key: value for key, value in data.items() if key in allowed_fields}
        for field_name, enum_type in cls.enum_fields.items():
            value = data.get(field_name)
            if value is not None and not isinstance(value, enum_type):
                data[field_name] = enum_type(value)
        return cls(**data)


@dataclass
class Organization(FirestoreModel):
    collection: ClassVar[str] = "organizations"
    id: str = field(default_factory=generate_uuid)
    name: str = ""
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class User(FirestoreModel):
    collection: ClassVar[str] = "users"
    id: str = field(default_factory=generate_uuid)
    email: str = ""
    display_name: str = ""
    password_hash: str = ""
    public_key: Optional[str] = None
    encrypted_private_key: Optional[str] = None
    private_key_salt: Optional[str] = None
    pbkdf2_iterations: int = 600000
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class OrgMembership(FirestoreModel):
    collection: ClassVar[str] = "org_memberships"
    enum_fields: ClassVar[dict[str, type[enum.Enum]]] = {"role": OrgRole}
    id: str = field(default_factory=generate_uuid)
    user_id: str = ""
    org_id: str = ""
    role: OrgRole = OrgRole.MEMBER
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class Document(FirestoreModel):
    collection: ClassVar[str] = "documents"
    id: str = field(default_factory=generate_uuid)
    org_id: str = ""
    owner_id: Optional[str] = None
    name: str = ""
    content_type: Optional[str] = None
    size: int = 0
    storage_key: str = ""
    encrypted_file_hash: Optional[str] = None
    metadata_json: Optional[dict] = None
    created_at: datetime = field(default_factory=utc_now)
    deleted: bool = False


@dataclass
class DocumentShare(FirestoreModel):
    collection: ClassVar[str] = "document_shares"
    enum_fields: ClassVar[dict[str, type[enum.Enum]]] = {"permission": SharePermission}
    id: str = field(default_factory=generate_uuid)
    document_id: str = ""
    grantor_id: Optional[str] = None
    grantee_id: str = ""
    permission: SharePermission = SharePermission.VIEW
    expires_at: Optional[datetime] = None
    revoked: bool = False
    revoked_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class KeyEnvelope(FirestoreModel):
    collection: ClassVar[str] = "key_envelopes"
    id: str = field(default_factory=generate_uuid)
    document_id: str = ""
    user_id: str = ""
    encrypted_key: str = ""
    created_at: datetime = field(default_factory=utc_now)


@dataclass
class AuditEvent(FirestoreModel):
    collection: ClassVar[str] = "audit_events"
    id: int = 0
    org_id: str = ""
    actor_id: Optional[str] = None
    document_id: Optional[str] = None
    action: str = ""
    result: str = "success"
    metadata_json: Optional[dict] = None
    request_id: Optional[str] = None
    previous_hash: str = ""
    event_hash: str = ""
    sequence_number: int = 0
    created_at: datetime = field(default_factory=utc_now)

    def firestore_id(self) -> str:
        return f"{self.org_id}_{self.sequence_number:020d}"

    @classmethod
    def from_snapshot(cls, snapshot):
        data = snapshot.to_dict() or {}
        data["id"] = int(data.get("sequence_number", 0))
        return cls(**{key: value for key, value in data.items() if key in {field.name for field in fields(cls)}})


@dataclass
class AuditChainState(FirestoreModel):
    collection: ClassVar[str] = "audit_chain_state"
    id: str = ""
    org_id: str = ""
    last_hash: str = "0" * 64
    last_sequence: int = 0
    updated_at: datetime = field(default_factory=utc_now)

    def __post_init__(self):
        if not self.id:
            self.id = self.org_id


@dataclass
class SecurityAlert(FirestoreModel):
    collection: ClassVar[str] = "security_alerts"
    enum_fields: ClassVar[dict[str, type[enum.Enum]]] = {
        "severity": AlertSeverity,
        "status": AlertStatus,
    }
    id: str = field(default_factory=generate_uuid)
    org_id: str = ""
    user_id: Optional[str] = None
    document_id: Optional[str] = None
    rule_name: str = ""
    severity: AlertSeverity = AlertSeverity.MEDIUM
    description: str = ""
    evidence_json: Optional[dict] = None
    recommendation: Optional[str] = None
    status: AlertStatus = AlertStatus.OPEN
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=utc_now)