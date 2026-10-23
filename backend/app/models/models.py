"""SQLAlchemy models for TrustVault."""

import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, BigInteger, Integer, Boolean, DateTime, Enum,
    ForeignKey, Index, UniqueConstraint, JSON
)
from sqlalchemy.orm import relationship
from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# --- Enums ---

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


# --- Models ---

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    memberships = relationship("OrgMembership", back_populates="organization", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="organization", cascade="all, delete-orphan")
    audit_events = relationship("AuditEvent", back_populates="organization", cascade="all, delete-orphan")
    security_alerts = relationship("SecurityAlert", back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=False)
    password_hash = Column(String(512), nullable=False)
    public_key = Column(Text, nullable=True)
    encrypted_private_key = Column(Text, nullable=True)
    private_key_salt = Column(String(255), nullable=True)
    pbkdf2_iterations = Column(Integer, default=600000, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    memberships = relationship("OrgMembership", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="owner", foreign_keys="Document.owner_id")
    key_envelopes = relationship("KeyEnvelope", back_populates="user", cascade="all, delete-orphan")


class OrgMembership(Base):
    __tablename__ = "org_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "org_id", name="uq_user_org"),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(Enum(OrgRole), nullable=False, default=OrgRole.MEMBER)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="memberships")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(500), nullable=False)
    content_type = Column(String(255), nullable=True)
    size = Column(BigInteger, nullable=False, default=0)
    storage_key = Column(String(500), nullable=False, unique=True)
    encrypted_file_hash = Column(String(128), nullable=True)
    metadata_json = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    deleted = Column(Boolean, default=False, nullable=False)

    organization = relationship("Organization", back_populates="documents")
    owner = relationship("User", back_populates="documents", foreign_keys=[owner_id])
    shares = relationship("DocumentShare", back_populates="document", cascade="all, delete-orphan")
    key_envelopes = relationship("KeyEnvelope", back_populates="document", cascade="all, delete-orphan")


class DocumentShare(Base):
    __tablename__ = "document_shares"
    __table_args__ = (
        Index("ix_share_doc_grantee", "document_id", "grantee_id"),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    grantor_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    grantee_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission = Column(Enum(SharePermission), nullable=False, default=SharePermission.VIEW)
    expires_at = Column(DateTime, nullable=True)
    revoked = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    document = relationship("Document", back_populates="shares")
    grantor = relationship("User", foreign_keys=[grantor_id])
    grantee = relationship("User", foreign_keys=[grantee_id])


class KeyEnvelope(Base):
    __tablename__ = "key_envelopes"
    __table_args__ = (
        UniqueConstraint("document_id", "user_id", name="uq_doc_user_key"),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    encrypted_key = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    document = relationship("Document", back_populates="key_envelopes")
    user = relationship("User", back_populates="key_envelopes")


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_org_seq", "org_id", "sequence_number"),
        Index("ix_audit_actor", "actor_id"),
        Index("ix_audit_document", "document_id"),
        Index("ix_audit_action", "action"),
        Index("ix_audit_created", "created_at"),
    )

    id = Column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    actor_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    document_id = Column(String(36), nullable=True)
    action = Column(String(100), nullable=False)
    result = Column(String(50), nullable=False, default="success")
    metadata_json = Column(JSON, nullable=True)
    request_id = Column(String(64), nullable=True)
    previous_hash = Column(String(64), nullable=False)
    event_hash = Column(String(64), nullable=False)
    sequence_number = Column(BigInteger, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    organization = relationship("Organization", back_populates="audit_events")
    actor = relationship("User", foreign_keys=[actor_id])


class AuditChainState(Base):
    """Tracks the latest hash and sequence for each org's audit chain."""
    __tablename__ = "audit_chain_state"

    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    last_hash = Column(String(64), nullable=False, default="0" * 64)
    last_sequence = Column(BigInteger, nullable=False, default=0)
    updated_at = Column(DateTime, default=utc_now, nullable=False)


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    document_id = Column(String(36), nullable=True)
    rule_name = Column(String(255), nullable=False)
    severity = Column(Enum(AlertSeverity), nullable=False, default=AlertSeverity.MEDIUM)
    description = Column(Text, nullable=False)
    evidence_json = Column(JSON, nullable=True)
    recommendation = Column(Text, nullable=True)
    status = Column(Enum(AlertStatus), nullable=False, default=AlertStatus.OPEN)
    resolved_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    organization = relationship("Organization", back_populates="security_alerts")
    user = relationship("User", foreign_keys=[user_id])
    resolver = relationship("User", foreign_keys=[resolved_by])
