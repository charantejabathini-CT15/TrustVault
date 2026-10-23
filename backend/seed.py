"""Seed script: creates demo users and data for local development."""

import sys
import os
import uuid
from datetime import datetime, timezone, timedelta

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal, engine, Base
from app.core.security import hash_password
from app.models.models import (
    User, Organization, OrgMembership, OrgRole,
    Document, DocumentShare, SharePermission, KeyEnvelope,
    AuditChainState,
)
from app.services.audit_service import record_event


def seed():
    """Create demo data. Safe to run multiple times - checks for existing data."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # Check if already seeded
        existing = db.query(User).filter(User.email == "alice@trustvault.demo").first()
        if existing:
            print("Demo data already exists. Skipping seed.")
            return

        print("Creating demo data...")

        # Organization
        org = Organization(id=str(uuid.uuid4()), name="TrustVault Demo Corp")
        db.add(org)
        db.flush()

        # Users with Argon2id hashed passwords
        # All demo passwords: "DemoPass1"
        pw_hash = hash_password("DemoPass1")

        alice = User(
            id=str(uuid.uuid4()),
            email="alice@trustvault.demo",
            display_name="Alice Johnson",
            password_hash=pw_hash,
        )
        bob = User(
            id=str(uuid.uuid4()),
            email="bob@trustvault.demo",
            display_name="Bob Smith",
            password_hash=pw_hash,
        )
        carol = User(
            id=str(uuid.uuid4()),
            email="carol@trustvault.demo",
            display_name="Carol Williams",
            password_hash=pw_hash,
        )
        dave = User(
            id=str(uuid.uuid4()),
            email="dave@trustvault.demo",
            display_name="Dave Auditor",
            password_hash=pw_hash,
        )

        for u in [alice, bob, carol, dave]:
            db.add(u)
        db.flush()

        # Memberships
        memberships = [
            OrgMembership(id=str(uuid.uuid4()), user_id=alice.id, org_id=org.id, role=OrgRole.OWNER),
            OrgMembership(id=str(uuid.uuid4()), user_id=bob.id, org_id=org.id, role=OrgRole.MEMBER),
            OrgMembership(id=str(uuid.uuid4()), user_id=carol.id, org_id=org.id, role=OrgRole.ADMIN),
            OrgMembership(id=str(uuid.uuid4()), user_id=dave.id, org_id=org.id, role=OrgRole.AUDITOR),
        ]
        for m in memberships:
            db.add(m)

        # Initialize audit chain
        chain_state = AuditChainState(
            org_id=org.id,
            last_hash="0" * 64,
            last_sequence=0,
        )
        db.add(chain_state)

        db.commit()

        # Record seed events
        record_event(db, org.id, "system_seed", actor_id=alice.id, metadata={"action": "demo_data_created"})
        db.commit()

        print(f"""
Demo data created successfully!
===============================
Organization: {org.name} (ID: {org.id})

Users (all passwords: DemoPass1):
  - alice@trustvault.demo  (Owner)
  - bob@trustvault.demo    (Member)
  - carol@trustvault.demo  (Admin)
  - dave@trustvault.demo   (Auditor)

NOTE: Users need to set up encryption keys after first login.
The frontend will prompt for vault passphrase setup.
""")

    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
