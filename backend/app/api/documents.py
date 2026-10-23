"""Document API routes: upload, list, retrieve, share, revoke."""

import uuid
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.storage import upload_file, download_file, delete_file
from app.models.models import (
    Document, DocumentShare, KeyEnvelope, User, OrgMembership,
    SharePermission, OrgRole,
)
from app.schemas.schemas import (
    DocumentResponse, DocumentDetailResponse, DocumentListResponse,
    CreateShareRequest, ShareResponse, UpdateShareRequest, UserPublicInfo,
)
from app.middleware.auth import get_current_user, get_current_org_id
from app.services.audit_service import record_event
from app.services.policy_service import evaluate_access
from app.services.alert_service import evaluate_rules

router = APIRouter(prefix="/api/documents", tags=["Documents"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _doc_to_response(doc: Document, db: Session, user_id: str) -> DocumentResponse:
    owner = db.query(User).filter(User.id == doc.owner_id).first() if doc.owner_id else None
    share_count = db.query(DocumentShare).filter(
        DocumentShare.document_id == doc.id,
        DocumentShare.revoked == False,
    ).count()

    # Check if user has access
    has_access = doc.owner_id == user_id
    permission = "owner" if has_access else None
    if not has_access:
        share = db.query(DocumentShare).filter(
            DocumentShare.document_id == doc.id,
            DocumentShare.grantee_id == user_id,
            DocumentShare.revoked == False,
        ).first()
        if share:
            now = datetime.now(timezone.utc)
            if not share.expires_at or now < share.expires_at:
                has_access = True
                permission = share.permission.value

    return DocumentResponse(
        id=doc.id,
        name=doc.name,
        content_type=doc.content_type,
        size=doc.size,
        owner_id=doc.owner_id,
        owner_name=owner.display_name if owner else None,
        org_id=doc.org_id,
        encrypted_file_hash=doc.encrypted_file_hash,
        created_at=doc.created_at,
        share_count=share_count,
        has_access=has_access,
        permission=permission,
    )


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(...),
    encrypted_file_hash: str = Form(...),
    encrypted_key: str = Form(...),
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Upload an encrypted document."""
    # Read file data
    file_data = await file.read()

    if len(file_data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB")

    if len(file_data) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    # Sanitize filename
    safe_name = name.strip()[:500]
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid document name")

    # Generate storage key (UUID-based, no user-controlled path)
    storage_key = f"{org_id}/{uuid.uuid4().hex}"

    # Verify the hash of uploaded ciphertext matches the declared hash
    actual_hash = hashlib.sha256(file_data).hexdigest()
    if actual_hash != encrypted_file_hash:
        raise HTTPException(
            status_code=400,
            detail="Encrypted file hash mismatch. Upload may be corrupted."
        )

    # Store in object storage (MinIO or local fallback)
    try:
        upload_file(storage_key, file_data, "application/octet-stream")
    except Exception as e:
        logger.error(f"Failed to store document {storage_key}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to store document: {str(e)}")

    # Create document record
    doc = Document(
        id=str(uuid.uuid4()),
        org_id=org_id,
        owner_id=user.id,
        name=safe_name,
        content_type=file.content_type or "application/octet-stream",
        size=len(file_data),
        storage_key=storage_key,
        encrypted_file_hash=encrypted_file_hash,
    )
    db.add(doc)
    db.flush()

    # Store owner's key envelope
    envelope = KeyEnvelope(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        user_id=user.id,
        encrypted_key=encrypted_key,
    )
    db.add(envelope)

    # Audit
    record_event(
        db, org_id, "document_upload",
        actor_id=user.id, document_id=doc.id,
        metadata={"file_size": len(file_data), "content_type": doc.content_type},
    )
    db.commit()

    return _doc_to_response(doc, db, user.id)


@router.get("", response_model=DocumentListResponse)
def list_documents(
    request: Request,
    filter: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """List documents in the current organization."""
    query = db.query(Document).filter(
        Document.org_id == org_id,
        Document.deleted == False,
    )

    if filter == "owned":
        query = query.filter(Document.owner_id == user.id)
    elif filter == "shared":
        shared_doc_ids = db.query(DocumentShare.document_id).filter(
            DocumentShare.grantee_id == user.id,
            DocumentShare.revoked == False,
        ).subquery()
        query = query.filter(Document.id.in_(shared_doc_ids.select()))

    total = query.count()
    docs = query.order_by(Document.created_at.desc()).offset(offset).limit(limit).all()

    return DocumentListResponse(
        documents=[_doc_to_response(d, db, user.id) for d in docs],
        total=total,
    )


@router.get("/{document_id}", response_model=DocumentDetailResponse)
def get_document(
    document_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Get document details."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.org_id == org_id,
        Document.deleted == False,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Get shares
    shares = db.query(DocumentShare).filter(
        DocumentShare.document_id == document_id,
    ).all()

    share_responses = []
    for s in shares:
        grantee = db.query(User).filter(User.id == s.grantee_id).first()
        grantor = db.query(User).filter(User.id == s.grantor_id).first() if s.grantor_id else None
        share_responses.append(ShareResponse(
            id=s.id,
            document_id=s.document_id,
            grantor_id=s.grantor_id,
            grantor_name=grantor.display_name if grantor else None,
            grantee_id=s.grantee_id,
            grantee_email=grantee.email if grantee else None,
            grantee_name=grantee.display_name if grantee else None,
            permission=s.permission.value,
            expires_at=s.expires_at,
            revoked=s.revoked,
            revoked_at=s.revoked_at,
            created_at=s.created_at,
        ))

    # Get user's key envelope
    envelope = db.query(KeyEnvelope).filter(
        KeyEnvelope.document_id == document_id,
        KeyEnvelope.user_id == user.id,
    ).first()

    owner = db.query(User).filter(User.id == doc.owner_id).first() if doc.owner_id else None
    share_count = len([s for s in shares if not s.revoked])

    has_access = doc.owner_id == user.id
    permission = "owner" if has_access else None
    if not has_access:
        active_share = next(
            (s for s in shares
             if s.grantee_id == user.id and not s.revoked
             and (not s.expires_at or datetime.now(timezone.utc) < s.expires_at)),
            None
        )
        if active_share:
            has_access = True
            permission = active_share.permission.value

    return DocumentDetailResponse(
        id=doc.id,
        name=doc.name,
        content_type=doc.content_type,
        size=doc.size,
        owner_id=doc.owner_id,
        owner_name=owner.display_name if owner else None,
        org_id=doc.org_id,
        encrypted_file_hash=doc.encrypted_file_hash,
        created_at=doc.created_at,
        share_count=share_count,
        has_access=has_access,
        permission=permission,
        shares=share_responses,
        key_envelope=envelope.encrypted_key if envelope else None,
    )


@router.get("/{document_id}/content")
def get_document_content(
    document_id: str,
    action: str = "view",
    request: Request = None,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Download encrypted document content (requires authorization)."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.org_id == org_id,
        Document.deleted == False,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Use policy engine for authorization
    result = evaluate_access(db, user.id, document_id, action)

    if not result.allowed:
        # Record denied access
        record_event(
            db, org_id, f"document_{action}",
            actor_id=user.id, document_id=document_id,
            result="denied",
            metadata={"reason": result.reason},
        )
        db.commit()

        # Trigger alert evaluation
        evaluate_rules(db, org_id)
        db.commit()

        raise HTTPException(status_code=403, detail=result.reason)

    # Get encrypted content
    try:
        encrypted_data = download_file(doc.storage_key)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve document")

    # Get user's key envelope
    envelope = db.query(KeyEnvelope).filter(
        KeyEnvelope.document_id == document_id,
        KeyEnvelope.user_id == user.id,
    ).first()

    if not envelope:
        raise HTTPException(status_code=403, detail="No encryption key available")

    # Record successful access
    record_event(
        db, org_id, f"document_{action}",
        actor_id=user.id, document_id=document_id,
        result="success",
    )
    db.commit()

    import base64
    from fastapi.responses import JSONResponse
    return JSONResponse({
        "encrypted_content": base64.b64encode(encrypted_data).decode("ascii"),
        "encrypted_key": envelope.encrypted_key,
        "encrypted_file_hash": doc.encrypted_file_hash,
    })


@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Soft-delete a document (owner only)."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.org_id == org_id,
        Document.deleted == False,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.owner_id != user.id:
        # Check if admin/owner
        membership = db.query(OrgMembership).filter(
            OrgMembership.user_id == user.id,
            OrgMembership.org_id == org_id,
        ).first()
        if not membership or membership.role not in (OrgRole.OWNER, OrgRole.ADMIN):
            raise HTTPException(status_code=403, detail="Only the document owner or admin can delete")

    doc.deleted = True

    record_event(
        db, org_id, "document_delete",
        actor_id=user.id, document_id=document_id,
    )
    db.commit()
    return {"message": "Document deleted"}


# --- Sharing endpoints ---

@router.post("/{document_id}/shares", response_model=ShareResponse, status_code=201)
def create_share(
    document_id: str,
    req: CreateShareRequest,
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Share a document with another user."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.org_id == org_id,
        Document.deleted == False,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can share this document")

    # Find grantee
    grantee = db.query(User).filter(User.email == req.grantee_email).first()
    if not grantee:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Verify grantee is in the same org
    grantee_membership = db.query(OrgMembership).filter(
        OrgMembership.user_id == grantee.id,
        OrgMembership.org_id == org_id,
    ).first()
    if not grantee_membership:
        raise HTTPException(status_code=400, detail="Recipient is not a member of this organization")

    if grantee.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")

    # Check if grantee has public key
    if not grantee.public_key:
        raise HTTPException(status_code=400, detail="Recipient has not set up encryption keys")

    # Check for existing active share
    existing = db.query(DocumentShare).filter(
        DocumentShare.document_id == document_id,
        DocumentShare.grantee_id == grantee.id,
        DocumentShare.revoked == False,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="An active share already exists for this recipient")

    # Create share
    perm = SharePermission.DOWNLOAD if req.permission == "download" else SharePermission.VIEW
    share = DocumentShare(
        id=str(uuid.uuid4()),
        document_id=document_id,
        grantor_id=user.id,
        grantee_id=grantee.id,
        permission=perm,
        expires_at=req.expires_at,
    )
    db.add(share)

    # Store recipient's key envelope
    envelope = KeyEnvelope(
        id=str(uuid.uuid4()),
        document_id=document_id,
        user_id=grantee.id,
        encrypted_key=req.encrypted_key,
    )
    db.add(envelope)

    # Audit
    record_event(
        db, org_id, "share_created",
        actor_id=user.id, document_id=document_id,
        metadata={
            "grantee_id": grantee.id,
            "permission": req.permission,
            "expires_at": req.expires_at.isoformat() if req.expires_at else None,
        },
    )
    db.commit()

    return ShareResponse(
        id=share.id,
        document_id=share.document_id,
        grantor_id=share.grantor_id,
        grantor_name=user.display_name,
        grantee_id=share.grantee_id,
        grantee_email=grantee.email,
        grantee_name=grantee.display_name,
        permission=share.permission.value,
        expires_at=share.expires_at,
        revoked=share.revoked,
        revoked_at=share.revoked_at,
        created_at=share.created_at,
    )


@router.get("/{document_id}/shares")
def get_shares(
    document_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """List shares for a document."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.org_id == org_id,
        Document.deleted == False,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    shares = db.query(DocumentShare).filter(
        DocumentShare.document_id == document_id,
    ).order_by(DocumentShare.created_at.desc()).all()

    results = []
    for s in shares:
        grantee = db.query(User).filter(User.id == s.grantee_id).first()
        grantor = db.query(User).filter(User.id == s.grantor_id).first() if s.grantor_id else None
        results.append(ShareResponse(
            id=s.id,
            document_id=s.document_id,
            grantor_id=s.grantor_id,
            grantor_name=grantor.display_name if grantor else None,
            grantee_id=s.grantee_id,
            grantee_email=grantee.email if grantee else None,
            grantee_name=grantee.display_name if grantee else None,
            permission=s.permission.value,
            expires_at=s.expires_at,
            revoked=s.revoked,
            revoked_at=s.revoked_at,
            created_at=s.created_at,
        ))

    return results


@router.delete("/{document_id}/shares/{share_id}")
def revoke_share(
    document_id: str,
    share_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Revoke a document share."""
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.org_id == org_id,
        Document.deleted == False,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.owner_id != user.id:
        membership = db.query(OrgMembership).filter(
            OrgMembership.user_id == user.id,
            OrgMembership.org_id == org_id,
        ).first()
        if not membership or membership.role not in (OrgRole.OWNER, OrgRole.ADMIN):
            raise HTTPException(status_code=403, detail="Only the document owner or admin can revoke shares")

    share = db.query(DocumentShare).filter(
        DocumentShare.id == share_id,
        DocumentShare.document_id == document_id,
    ).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    if share.revoked:
        raise HTTPException(status_code=400, detail="Share already revoked")

    share.revoked = True
    share.revoked_at = datetime.now(timezone.utc)

    # Remove grantee's key envelope
    db.query(KeyEnvelope).filter(
        KeyEnvelope.document_id == document_id,
        KeyEnvelope.user_id == share.grantee_id,
    ).delete()

    record_event(
        db, org_id, "share_revoked",
        actor_id=user.id, document_id=document_id,
        metadata={"grantee_id": share.grantee_id},
    )
    db.commit()
    return {"message": "Share revoked"}


# --- Member lookup ---

@router.get("/members/search")
def search_members(
    q: str,
    request: Request,
    user: User = Depends(get_current_user),
    org_id: str = Depends(get_current_org_id),
    db: Session = Depends(get_db),
):
    """Search organization members by email or name."""
    members = db.query(User).join(OrgMembership).filter(
        OrgMembership.org_id == org_id,
        User.id != user.id,
        (User.email.ilike(f"%{q}%") | User.display_name.ilike(f"%{q}%")),
    ).limit(10).all()

    return [
        UserPublicInfo(
            id=m.id,
            email=m.email,
            display_name=m.display_name,
            public_key=m.public_key,
        )
        for m in members
    ]
