# TrustVault — Architecture Document

## System Overview

TrustVault is a secure document-sharing platform with client-side encryption, per-document access control, tamper-evident audit logging, an access-policy simulator, and rule-based security alerts.

## Architecture Diagram

```mermaid
graph TB
    subgraph "Browser (Client)"
        UI[React + TypeScript Frontend]
        WC[Web Crypto API]
        UI --> WC
    end

    subgraph "Backend Services"
        API[FastAPI Python Backend]
        API --> DB[(MySQL 8)]
        API --> S3[MinIO Object Storage]
    end

    UI -->|HTTPS REST API| API
    WC -->|Encrypt/Decrypt locally| UI
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript (strict), Vite, Tailwind CSS, React Router, React Query |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic |
| Database | MySQL 8 with InnoDB |
| Object Storage | MinIO (S3-compatible) |
| Auth | Argon2id, HTTP-only secure cookies, CSRF tokens |
| Crypto | Web Crypto API (AES-256-GCM, RSA-OAEP, PBKDF2) |
| Testing | Pytest, Vitest, Playwright |
| DevOps | Docker, Docker Compose, GitHub Actions |

## Directory Structure

```
TrustVault/
├── backend/
│   ├── app/
│   │   ├── api/           # Route handlers
│   │   ├── core/          # Config, security, crypto
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   ├── middleware/     # CSRF, rate limiting
│   │   └── main.py        # FastAPI app
│   ├── migrations/        # Alembic migrations
│   ├── tests/             # Pytest tests
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI
│   │   ├── pages/         # Route pages
│   │   ├── services/      # API client
│   │   ├── crypto/        # Web Crypto utilities
│   │   ├── hooks/         # React hooks
│   │   ├── stores/        # State management
│   │   └── types/         # TypeScript types
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Database Schema

```mermaid
erDiagram
    organizations ||--o{ org_memberships : has
    organizations ||--o{ documents : owns
    organizations ||--o{ audit_events : logs
    organizations ||--o{ security_alerts : generates
    users ||--o{ org_memberships : belongs_to
    users ||--o{ documents : uploads
    users ||--o{ audit_events : performs
    documents ||--o{ document_shares : shared_via
    documents ||--o{ key_envelopes : has_keys
    documents ||--o{ audit_events : referenced_in
    users ||--o{ document_shares : receives
    users ||--o{ key_envelopes : for_user

    organizations {
        uuid id PK
        string name
        datetime created_at
    }

    users {
        uuid id PK
        string email UK
        string password_hash
        text public_key
        text encrypted_private_key
        text private_key_salt
        int pbkdf2_iterations
        datetime created_at
    }

    org_memberships {
        uuid id PK
        uuid user_id FK
        uuid org_id FK
        enum role
        datetime created_at
    }

    documents {
        uuid id PK
        uuid org_id FK
        uuid owner_id FK
        string name
        string content_type
        bigint size
        string storage_key
        string encrypted_file_hash
        text metadata_json
        datetime created_at
    }

    document_shares {
        uuid id PK
        uuid document_id FK
        uuid grantor_id FK
        uuid grantee_id FK
        enum permission
        datetime expires_at
        boolean revoked
        datetime revoked_at
        datetime created_at
    }

    key_envelopes {
        uuid id PK
        uuid document_id FK
        uuid user_id FK
        text encrypted_key
        datetime created_at
    }

    audit_events {
        bigint id PK
        uuid org_id FK
        uuid actor_id FK
        uuid document_id FK
        string action
        string result
        text metadata_json
        string request_id
        string previous_hash
        string event_hash
        bigint sequence_number
        datetime created_at
    }

    security_alerts {
        uuid id PK
        uuid org_id FK
        uuid user_id FK
        uuid document_id FK
        string rule_name
        enum severity
        text description
        text evidence_json
        text recommendation
        enum status
        uuid resolved_by FK
        datetime resolved_at
        datetime created_at
    }
```

## Encryption Architecture

### Key Hierarchy
1. **User Vault Passphrase** → PBKDF2 → **Wrapping Key** → encrypts user's RSA private key
2. **RSA Key Pair** (per user) → RSA-OAEP wraps/unwraps document keys
3. **Document Key** (AES-256-GCM, per document) → encrypts file content

### Flows
- **Upload**: Generate AES key → encrypt file → wrap key with owner's RSA public key → upload ciphertext + wrapped key
- **Share**: Owner unwraps doc key → re-wraps with recipient's RSA public key → store new envelope
- **Access**: Fetch ciphertext + user's envelope → unwrap AES key → decrypt file locally

## Security Model

- Zero-knowledge: server never sees plaintext documents or vault passphrases
- Per-document ACL enforced server-side
- Organization isolation on every query
- Hash-chain audit trail with SHA-256
- Rate limiting on auth endpoints
- CSRF protection via double-submit cookie
- Argon2id password hashing
- HTTP-only secure session cookies

## Threat Model Limitations

1. Server admin with DB access can recompute hash chains
2. Revocation cannot retract already-decrypted content
3. Browser-side crypto depends on trusted code delivery
4. No HSM integration in initial version
