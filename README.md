# TrustVault — Secure Document Sharing with a Verifiable Audit Trail

> **Key Product Principle:** Every document has its own access policy, and every important access decision leaves verifiable evidence.

TrustVault is a full-stack document-sharing application for confidential files. It combines **client-side zero-knowledge encryption**, **per-document access policies**, **expiration and revocation**, and a **tamper-evident SHA-256 hash-chain audit trail**.

---

## Architecture Overview

```
                                      TRUSTVAULT ARCHITECTURE
                                      
  [ BROWSER CLIENT - React + TypeScript ]
  ├── Web Crypto API:
  │   ├── AES-256-GCM (Random Document Key + 12-byte IV)
  │   ├── RSA-OAEP 2048-bit (Asymmetric Key Envelope Wrapping)
  │   ├── PBKDF2-SHA-256 (600,000 Iterations for Vault Key Protection)
  │   └── SHA-256 Client Integrity Check
  └── Zero-Knowledge Principle: Passphrase & Plaintext NEVER leave browser
            │
            │  HTTPS + HTTP-Only Session Cookies + CSRF Header Tokens
            ▼
  [ BACKEND - FastAPI + Python 3.12+ ]
  ├── Middleware & Guards:
  │   ├── Argon2id Password Verification
  │   ├── Role-Based Access Control (Owner, Admin, Member, Auditor)
  │   ├── Organization Isolation & Tenant Scoping
  │   └── Login Rate Limiting & Throttling
  ├── Policy Evaluation Service (Deterministic Rule Pipeline)
  ├── Tamper-Evident Audit Service (Sequential SHA-256 Hash Chain)
  ├── Suspicious-Access Rule Engine (5 Real-Time Anomaly Rules)
  └── Storage Adapter (MinIO / AWS S3 with Local Ciphertext Fallback)
            │
      ┌─────┴────────────────────────────────┐
      ▼                                      ▼
[ DATABASE - MySQL 8 / SQLite ]     [ ENCRYPTED STORAGE ]
- Users, Orgs, Memberships          - Private S3 / MinIO Bucket
- Document Metadata & Envelopes     - Ciphertext Only
- Chained Audit Events & State      - No Decrypted Content
- Security Alerts & Checkpoints
```

---

## Core Features & Differentiators

### 1. Real Client-Side Web Crypto API
- **AES-256-GCM File Sealing:** Every file is encrypted in the browser with a unique 256-bit AES key and a 12-byte random IV.
- **RSA-OAEP Key Wrapping:** The document AES key is wrapped inside recipient-specific public key envelopes. The server never sees the plaintext document key.
- **PBKDF2-SHA-256 Vault Protection:** The user's RSA private key is protected with an AES-256 key derived from their master vault passphrase using 600,000 PBKDF2 rounds.
- **In-Browser Decryption & Preview:** Text, code, markdown, images, and PDFs are decrypted in browser memory with zero server-side decryption.

### 2. Tamper-Evident Hash-Chain Audit Trail
- Every security action (upload, share, view, download, denial, revocation) creates a sequential audit record.
- **Chained Hashing:** $H_n = \text{SHA-256}(H_{n-1} \parallel \text{Canonical}(Event_n))$.
- **Cryptographic Verification:** The built-in verifier recomputes all historical hashes from genesis ($H_0 = 0^{64}$) to head, instantly identifying any altered data, deleted records (sequence gaps), or reordered entries.

### 3. Unique Feature: Access Policy Simulator
- Interactive pre-flight simulator allowing administrators and owners to test access rules before sharing documents.
- Evaluates simulated members, target documents, permission levels (view vs. download), and future timestamps (testing 7-day or 30-day expiration).
- Deterministic output provides an **ALLOW** or **DENY** verdict with a transparent step-by-step evaluation pipeline.

### 4. Unique Feature: Suspicious-Access Rule Engine
Detects explainable anomalies without requiring paid external AI APIs:
1. **Repeated Unauthorized Requests:** Multiple denied attempts within 10 minutes.
2. **Multi-Document Denied:** Access denied across multiple distinct document IDs.
3. **Expired Grant Probes:** Repeated attempts to access files using expired permissions.
4. **Download Burst:** Unusually high download frequencies within 5 minutes.
5. **Integrity Failures:** Repetitive decryption or hash verification mismatches.
- Includes investigation status workflows: Open $\to$ Acknowledged $\to$ Resolved / Dismissed.

---

## Demo Accounts

Pre-seeded for instant demonstration and testing (all passwords: `DemoPass1`):

| Email | Role | Responsibilities |
|---|---|---|
| `alice@trustvault.demo` | **Owner** | Full workspace authority, document upload & sharing, delete controls |
| `bob@trustvault.demo` | **Member** | Recipient of shared documents, in-browser decryption, upload |
| `carol@trustvault.demo` | **Admin** | Workspace member management & Access Policy Simulator |
| `dave@trustvault.demo` | **Auditor** | Inspects verified audit trails (no automatic document decryption) |

---

## Honest Security Threat Model & Limitations

TrustVault adheres to transparent cryptographic disclosures:
1. **Post-Decryption Copies:** Once a recipient has decrypted a document, software cannot prevent screenshots, photography, or external distribution.
2. **View Permission:** A `view` grant controls which API access action is authorized; it cannot prevent a recipient from saving or copying plaintext after browser decryption.
3. **Revocation Limits:** Revoking a grant blocks future access requests; it cannot recall or erase previously downloaded plaintext copies.
4. **Database Administrator Capabilities:** A database administrator with root access could alter both events and recompute hash chains. Checkpoint signatures and offsite audit exports are the mitigation for this threat.
5. **Passphrase Irrecoverability:** Because TrustVault employs zero-knowledge encryption, losing the master vault passphrase means private keys cannot be recovered by server administrators.

---

## Quickstart & Local Setup

### Prerequisites
- Node.js 20+ and npm 10+
- Python 3.12+ (Python 3.13 supported)
- Docker & Docker Compose (optional; automatic SQLite/local encrypted storage fallback is built in)

### Quick 1-Command Startup (Recommended)

From the project root:
```bash
npm run dev
```
*This boots both the FastAPI backend (`http://127.0.0.1:8000`) and the Vite React frontend (`http://127.0.0.1:5173`) concurrently in a single terminal.*

Or on Windows, simply double-click **`start-dev.bat`** or run:
```powershell
.\start-dev.ps1
```

---

### Option A: Manual Step-by-Step Setup
# Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
python seed.py
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open **`http://127.0.0.1:5173`** in your browser.

---

### Option B: Docker Compose Deployment

The Compose stack serves the built frontend through Nginx on port 8080 by default; the API, MySQL, and MinIO are private to the Compose network. Put a TLS reverse proxy in front of this port before exposing the service publicly. This setup uses MySQL and S3-compatible storage and deliberately refuses to start with development secrets or local storage fallback.

```bash
# 1. Create deployment secrets and configure your public HTTPS origin in .env
cp .env.example .env
# Set CORS_ORIGINS=https://your-app.example.com, a unique SECRET_KEY (at least
# 32 characters), strong database passwords, and non-default MINIO_ROOT_USER,
# MINIO_ROOT_PASSWORD, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY values.

# 2. Build and start MySQL, MinIO, FastAPI, and the production Nginx frontend
docker compose up -d

# 3. Check service logs
docker compose logs -f
```

Do not run `seed.py` on a public deployment: it creates known demo accounts. Configure TLS, backups, monitoring, and a managed secrets store at the hosting layer. The bundled MinIO service is a convenient single-host option, not a substitute for a managed, replicated object store in a high-availability deployment.

### Option C: Vercel Frontend

Vercel hosts the React frontend; the FastAPI backend, MySQL database, and S3-compatible storage must already be reachable over HTTPS from a separate host. Import this repository into Vercel with the repository root as the project root, then set the `API_ORIGIN` environment variable for Production and Preview to the backend's HTTPS origin (for example, `https://api.example.com`, with no trailing slash). The Vercel rewrite proxies `/api/*` to that origin so browser requests and session cookies remain same-origin. Configure the backend with `ENVIRONMENT=production`, durable database/object storage, and the required non-default secrets before publishing. Never expose the backend directly without TLS or use demo seed accounts in production.

### Option D: Firebase Hosting and Cloud Run

Firebase Hosting serves the built React frontend, while a Cloud Run service runs the FastAPI container and Cloud SQL for PostgreSQL stores relational data. Firebase Hosting rewrites `/api/**` to the Cloud Run service so session and CSRF cookies stay same-origin. Cloud Storage for Firebase stores encrypted document objects using the Firebase Admin SDK.

The root `.firebaserc` selects project `trustvault-pvt`; `firebase.json` hosts `frontend/dist` and rewrites API requests to Cloud Run service `trustvault-api` in `asia-south1`. Create a Cloud SQL PostgreSQL instance in `asia-south1` and a database/user. Store the database URL and a generated `SECRET_KEY` in Secret Manager. The database URL should use the Cloud Run Unix socket form `postgresql+psycopg://USER:PASSWORD@/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE`; attach the instance to Cloud Run and grant the runtime service account Cloud SQL Client plus Firebase Storage object access.

Deploy the backend container from `backend/` to Cloud Run on port 8000 with runtime settings `ENVIRONMENT=production`, `STORAGE_TYPE=firebase`, `FIREBASE_PROJECT_ID=trustvault-pvt`, `FIREBASE_STORAGE_BUCKET=trustvault-pvt.firebasestorage.app`, and `CORS_ORIGINS=https://trustvault-pvt.web.app` (also include the `firebaseapp.com` origin if used). Point `DATABASE_URL_OVERRIDE` and `SECRET_KEY` at Secret Manager versions. Build the frontend with `npm --prefix frontend run build`, then deploy Hosting with `firebase deploy --only hosting`. Never commit service-account keys or database credentials.

Firebase Hosting has a no-cost quota, but Cloud Run and Cloud SQL require Blaze billing and Cloud SQL incurs charges; Firebase Storage can also incur charges over quota. This is not a guaranteed $0 deployment. Add budget alerts and review the estimate before creating Cloud SQL resources. The free Firebase Hosting quota is 10 GB stored and 10 GB/month transfer; verify current usage in the Firebase console.

---

## Automated Test Suites

The backend includes automated tests covering authentication, Argon2id hashing, document authorization, organization isolation, role-based controls, and audit chain tamper detection.

```bash
cd backend
.\venv\Scripts\pytest -v tests/
```

### Verified Test Results:
- `test_audit.py::test_audit_chain_validity` **PASSED**
- `test_audit.py::test_audit_tamper_detection` **PASSED**
- `test_audit.py::test_audit_deletion_gap_detection` **PASSED**
- `test_auth.py::test_register_success` **PASSED**
- `test_auth.py::test_register_duplicate_email` **PASSED**
- `test_auth.py::test_password_strength_validation` **PASSED**
- `test_auth.py::test_login_success_and_logout` **PASSED**
- `test_auth.py::test_login_invalid_password` **PASSED**
- `test_authorization.py::test_owner_full_access` **PASSED**
- `test_authorization.py::test_unauthorized_member_denied` **PASSED**
- `test_authorization.py::test_cross_org_isolation` **PASSED**
- `test_authorization.py::test_active_share_view_vs_download` **PASSED**
- `test_authorization.py::test_revoked_share_denied` **PASSED**
- `test_authorization.py::test_expired_share_denied` **PASSED**
- `test_authorization.py::test_auditor_cannot_decrypt` **PASSED**

### Frontend Production Build
```bash
cd frontend
npm run build
```
Builds cleanly with zero TypeScript or Vite errors.

---

## Environment Variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `MYSQL_HOST` | MySQL hostname | `localhost` / `mysql` |
| `MYSQL_PORT` | MySQL port | `3306` |
| `MYSQL_DATABASE` | Database name | `trustvault` |
| `MYSQL_USER` | Database username | `trustvault` |
| `MYSQL_PASSWORD` | Database password | `dev_password_123` |
| `DATABASE_URL_OVERRIDE` | Optional managed database URL; use TLS for TCP or Cloud Run's `/cloudsql/...` socket | empty |
| `FIREBASE_PROJECT_ID` | Firebase project used by the Admin SDK | `trustvault-pvt` |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket name | `trustvault-pvt.firebasestorage.app` |
| `USE_SQLITE` | Enable zero-config SQLite | `false` (auto-falls back if MySQL down) |
| `SECRET_KEY` | HMAC signing key for sessions | Secure random string |
| `SESSION_EXPIRY_HOURS` | Session cookie validity | `24` |
| `MINIO_ENDPOINT` | S3/MinIO endpoint | `localhost:9000` / `minio:9000` |
| `MINIO_BUCKET` | S3 document bucket | `trustvault-documents` |
| `S3_ENDPOINT_URL` | Full HTTPS endpoint for compatible storage such as Supabase Storage | empty |
| `S3_BUCKET` | S3 bucket override | empty |
| `S3_REGION` | S3 request-signing region from the storage provider | `auto` |
| `AWS_ACCESS_KEY_ID` | Storage access key | `minioadmin` |
| `AWS_SECRET_ACCESS_KEY` | Storage secret key | `minioadmin123` |
| `STORAGE_TYPE` | Storage driver (`firebase`, `s3`, `local`, `auto`) | `auto` |
