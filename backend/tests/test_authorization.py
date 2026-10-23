import pytest
import uuid
from datetime import datetime, timezone, timedelta
from app.models.models import (
    User, Organization, OrgMembership, OrgRole,
    Document, DocumentShare, SharePermission, KeyEnvelope,
)
from app.services.policy_service import evaluate_access
from app.core.security import hash_password


def create_user(db, email, org_id, role=OrgRole.MEMBER):
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        display_name=email.split("@")[0],
        password_hash=hash_password("TestPass123!"),
        public_key="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAfakekey...",
    )
    db.add(user)
    db.flush()

    membership = OrgMembership(
        id=str(uuid.uuid4()),
        user_id=user.id,
        org_id=org_id,
        role=role,
    )
    db.add(membership)
    db.flush()
    return user


def create_doc(db, org_id, owner_id):
    doc = Document(
        id=str(uuid.uuid4()),
        org_id=org_id,
        owner_id=owner_id,
        name="Confidential_Strategy.pdf",
        content_type="application/pdf",
        size=1024,
        storage_key=f"{org_id}/{uuid.uuid4().hex}",
        encrypted_file_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
    db.add(doc)
    db.flush()

    env = KeyEnvelope(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        user_id=owner_id,
        encrypted_key="owner_wrapped_key_blob",
    )
    db.add(env)
    db.flush()
    return doc


def test_owner_full_access(db):
    org = Organization(id=str(uuid.uuid4()), name="Org A")
    db.add(org)
    db.flush()

    alice = create_user(db, "alice@orga.com", org.id, OrgRole.OWNER)
    doc = create_doc(db, org.id, alice.id)

    res_view = evaluate_access(db, alice.id, doc.id, "view")
    assert res_view.allowed is True
    assert "Owner has full access" in res_view.reason

    res_dl = evaluate_access(db, alice.id, doc.id, "download")
    assert res_dl.allowed is True


def test_unauthorized_member_denied(db):
    org = Organization(id=str(uuid.uuid4()), name="Org A")
    db.add(org)
    db.flush()

    alice = create_user(db, "alice@orga.com", org.id, OrgRole.OWNER)
    bob = create_user(db, "bob@orga.com", org.id, OrgRole.MEMBER)
    doc = create_doc(db, org.id, alice.id)

    # Bob has no grant
    res = evaluate_access(db, bob.id, doc.id, "view")
    assert res.allowed is False
    assert "No access grant found" in res.reason


def test_cross_org_isolation(db):
    org_a = Organization(id=str(uuid.uuid4()), name="Org A")
    org_b = Organization(id=str(uuid.uuid4()), name="Org B")
    db.add_all([org_a, org_b])
    db.flush()

    alice = create_user(db, "alice@orga.com", org_a.id, OrgRole.OWNER)
    eve = create_user(db, "eve@orgb.com", org_b.id, OrgRole.OWNER)
    doc = create_doc(db, org_a.id, alice.id)

    res = evaluate_access(db, eve.id, doc.id, "view")
    assert res.allowed is False
    assert "not in the document's organization" in res.reason


def test_active_share_view_vs_download(db):
    org = Organization(id=str(uuid.uuid4()), name="Org A")
    db.add(org)
    db.flush()

    alice = create_user(db, "alice@orga.com", org.id, OrgRole.OWNER)
    bob = create_user(db, "bob@orga.com", org.id, OrgRole.MEMBER)
    doc = create_doc(db, org.id, alice.id)

    # Share with VIEW permission only
    share = DocumentShare(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        grantor_id=alice.id,
        grantee_id=bob.id,
        permission=SharePermission.VIEW,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(share)
    db.flush()

    res_view = evaluate_access(db, bob.id, doc.id, "view")
    assert res_view.allowed is True

    # Download must be denied on VIEW-only grant
    res_dl = evaluate_access(db, bob.id, doc.id, "download")
    assert res_dl.allowed is False
    assert "insufficient permission" in res_dl.reason.lower()


def test_revoked_share_denied(db):
    org = Organization(id=str(uuid.uuid4()), name="Org A")
    db.add(org)
    db.flush()

    alice = create_user(db, "alice@orga.com", org.id, OrgRole.OWNER)
    bob = create_user(db, "bob@orga.com", org.id, OrgRole.MEMBER)
    doc = create_doc(db, org.id, alice.id)

    share = DocumentShare(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        grantor_id=alice.id,
        grantee_id=bob.id,
        permission=SharePermission.DOWNLOAD,
        revoked=True,
        revoked_at=datetime.now(timezone.utc),
    )
    db.add(share)
    db.flush()

    res = evaluate_access(db, bob.id, doc.id, "download")
    assert res.allowed is False
    assert "revoked" in res.reason.lower()


def test_expired_share_denied(db):
    org = Organization(id=str(uuid.uuid4()), name="Org A")
    db.add(org)
    db.flush()

    alice = create_user(db, "alice@orga.com", org.id, OrgRole.OWNER)
    bob = create_user(db, "bob@orga.com", org.id, OrgRole.MEMBER)
    doc = create_doc(db, org.id, alice.id)

    # Expired 1 hour ago
    share = DocumentShare(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        grantor_id=alice.id,
        grantee_id=bob.id,
        permission=SharePermission.DOWNLOAD,
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db.add(share)
    db.flush()

    res = evaluate_access(db, bob.id, doc.id, "download")
    assert res.allowed is False
    assert "expired" in res.reason.lower()


def test_auditor_cannot_decrypt(db):
    """Auditors can inspect audit logs but do NOT have automatic document decryption access."""
    org = Organization(id=str(uuid.uuid4()), name="Org A")
    db.add(org)
    db.flush()

    alice = create_user(db, "alice@orga.com", org.id, OrgRole.OWNER)
    dave = create_user(db, "dave@orga.com", org.id, OrgRole.AUDITOR)
    doc = create_doc(db, org.id, alice.id)

    res = evaluate_access(db, dave.id, doc.id, "view")
    assert res.allowed is False
    assert "No access grant found" in res.reason
