# TrustVault — Zero-Knowledge Confidential Document Vault & Verifiable Audit Trail

<div align="center">

[![Live Web Application](https://img.shields.io/badge/Live%20Demo-trustvault--pvt.web.app-00f2fe?style=for-the-badge&logo=google-cloud&logoColor=black)](https://trustvault-pvt.web.app)
[![React 18](https://img.shields.io/badge/Frontend-React%2018%20%7C%20TypeScript-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Firebase](https://img.shields.io/badge/Cloud%20Platform-Firebase%20Blaze-ffca28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Web Crypto API](https://img.shields.io/badge/Cryptography-AES--256--GCM%20%7C%20RSA--OAEP-emerald?style=for-the-badge&logo=security&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

**Created & Developed by Charan Teja Bathini**

*Live Production URL:* **[https://trustvault-pvt.web.app](https://trustvault-pvt.web.app)** *(Alternative: [https://trustvault-pvt.firebaseapp.com](https://trustvault-pvt.firebaseapp.com))*

</div>

---

## Executive Summary & Core Principle

> **Core Philosophy:** *Every confidential document must have its own granular access policy, and every security-relevant access decision must leave cryptographically verifiable, tamper-evident evidence.*

**TrustVault** is an enterprise-grade document security platform engineered for zero-knowledge confidentiality. It guarantees that **plaintext files, symmetric encryption keys, and master vault passphrases NEVER leave the client browser**. All cryptographic sealing, unsealing, and key wrapping execute strictly in client-side memory using the native Web Crypto API (`window.crypto.subtle`).

The cloud platform operates on **Google Firebase Cloud Services** (Authentication, Cloud Firestore, and Cloud Storage), paired with an immutable **SHA-256 sequential hash-chain audit engine**, a real-time **Security Operations Dashboard**, and an interactive **Access Policy Simulator**.

---

## Live System Architecture

```
                                  TRUSTVAULT SYSTEM TOPOLOGY
                                  
   +-----------------------------------------------------------------------------------------+
   |                             CLIENT BROWSER (React 18 + TypeScript)                      |
   |                                                                                         |
   |   [ Web Crypto API Subsystem ]                                                          |
   |   +-- AES-256-GCM File Sealing (Unique 256-bit random key + 12-byte random IV per file) |
   |   +-- RSA-OAEP 2048-bit Asymmetric Envelope Encryption (Wrapped key per recipient)     |
   |   +-- PBKDF2-SHA-256 Master Key Derivation (600,000 hashing rounds for private key)     |
   |   +-- In-Memory Zero-Footprint Decryption (Automatic blob revocation & memory cleanup)  |
   |   +-- Strict View-Only Mode (PDF toolbar suppression, context-menu lock, watermarking)  |
   |                                                                                         |
   |   [ Zero-Knowledge Boundary ]                                                           |
   |   Plaintext, raw document keys, and master passphrases NEVER transmit over the wire     |
   +-------------------------------------------+---------------------------------------------+
                                               |
                   HTTPS / TLS 1.3 / End-to-End Encrypted Transport
                                               |
   +-------------------------------------------v---------------------------------------------+
   |                        PRODUCTION CLOUD PLATFORM (Firebase Services)                    |
   |                                                                                         |
   |   +-- [ Firebase Authentication ]                                                       |
   |   |   Managed JWT identity, session persistence, role assignment (Owner, Admin, Member) |
   |   |                                                                                     |
   |   +-- [ Cloud Firestore ]                                                               |
   |   |   +-- Real-Time Reactive Sync: Live `onSnapshot` listeners for instant state push  |
   |   |   +-- Documents Metadata & Encrypted Key Envelopes (`/documents`, `/key_envelopes`) |
   |   |   +-- Active Share Grants & Granular Permissions (`/shares`)                        |
   |   |   +-- Sequential Tamper-Evident Audit Records (`/audit_events`, `/audit_chains`)     |
   |   |   +-- Rule-Engine Anomaly Security Alerts (`/security_alerts`)                      |
   |   |                                                                                     |
   |   +-- [ Firebase Cloud Storage ]                                                        |
   |       +-- Ciphertext-Only Binary Storage (`documents/{org_id}/{doc_id}`)                |
   |       +-- Fast-Path Inline Buffer for payloads <= 700 KB (Zero-latency sub-10ms fetch)  |
   |       +-- GCS CORS Acceleration & Secure Download Authorization                         |
   +-----------------------------------------------------------------------------------------+
                                               |
                                     (Optional / Microservice)
                                               |
   +-------------------------------------------v---------------------------------------------+
   |                         ON-PREM / ENTERPRISE BACKEND (FastAPI Microservice)             |
   |   +-- Python 3.12+ FastAPI Gateway with Argon2id Password Hashing                       |
   |   +-- SQLAlchemy 2 Async ORM with Alembic Schema Migrations                             |
   |   +-- Dual Database Engine: SQLite (embedded local) / MySQL 8.0 (distributed)           |
   |   +-- Multi-Storage Adapter: MinIO / S3 Object Store / Local Ciphertext Filesystem      |
   +-----------------------------------------------------------------------------------------+
```

---

## Key Cryptographic Innovations

### 1. Zero-Knowledge Client-Side Sealing
- **AES-256-GCM Sealing:** Every uploaded file generates a cryptographically strong 256-bit symmetric key (`crypto.getRandomValues(new Uint8Array(32))`) and a 12-byte initialization vector. The file is sealed locally; only ciphertext is sent to cloud storage.
- **RSA-OAEP Asymmetric Key Wrapping:** Each recipient's public key (RSA-OAEP 2048-bit with SHA-256) encrypts the document's symmetric AES key. Only the intended recipient holding the corresponding private key can unwrap the envelope.
- **PBKDF2-SHA-256 Vault Protection:** Private keys are stored encrypted at rest using an AES key derived from the user's secret vault passphrase using 600,000 iterations of PBKDF2 with a unique 16-byte cryptographic salt.

### 2. Tamper-Evident Hash-Chain Audit Engine
Every security event (upload, access, share creation, revocation, download, policy denial) is recorded into an append-only sequential cryptographic ledger:
$$H_n = \text{SHA-256}(H_{n-1} \parallel \text{Canonical}(Event_n))$$
- **Genesis State:** $H_0 = 0^{64}$ (64 zeroes).
- **Mathematical Integrity Verifier:** The dashboard features a one-click tamper verifier that recomputes every event hash from genesis to the current sequence head. It detects:
  - Sequence gaps (indicates record deletion).
  - Broken hash links (indicates database alteration or row reordering).
  - Signature mismatches (indicates tampered event payloads).

### 3. Real-Time Security Operations Dashboard
- **Instant Reactive Sync:** Employs Firestore `onSnapshot` subscriptions on documents, shares, and audit logs with an automated background heartbeat. Changes made by any member across tabs or sessions reflect live without page refreshes.
- **Live Sync Indicator:** Top-bar status pill (`● Live Real-Time Sync`) providing visual synchronization confirmation and a manual `Sync` trigger.
- **Index-Free Query Design:** All Firestore queries utilize single-field equality filters and execute deterministic sorting in client memory, completely avoiding multi-index bottlenecks.

### 4. Interactive Access Policy Simulator
- Pre-flight authorization engine enabling workspace administrators to simulate and test document access requests before executing share grants.
- Evaluates candidate users, target documents, permission levels (`view` vs. `download`), and simulated future evaluation times (testing 7-day or 30-day policy expirations).
- Outputs a deterministic **ALLOW** or **DENY** verdict with a 7-step inspection audit trace.

### 5. Strict View-Only Enforcement & Universal Preview
- **Browser Decryption:** Decrypts PDFs, PNG/JPG/WebP images, text, Markdown, and source code in RAM without writing temporary plaintext files to disk.
- **PDF Security Controls:** Built-in PDF viewer suppresses browser print/download toolbars (`#toolbar=0&navpanes=0`), intercepts right-click context menus, disables unauthorized downloads, and overlays dynamic confidentiality watermarks.
- **Magic-Byte Inspection:** Automatic MIME-type inspection via binary magic bytes (`%PDF`, PNG, JPG, WebP) allows extensionless documents to render smoothly.

---

## Complete Repository Structure

```
TrustVault/
|-- .firebaserc                          # Firebase project selector (trustvault-pvt)
|-- firebase.json                        # Firebase Hosting and security rules config
|-- firestore.rules                      # Cloud Firestore security rules
|-- storage.rules                        # Cloud Storage access security rules
|-- deploy-firebase.bat                  # 1-Click Windows deployment script
|-- deploy-firebase.ps1                  # 1-Click PowerShell deployment script
|-- start-dev.bat                        # 1-Click local development launcher
|-- start-dev.ps1                        # PowerShell development launcher
|-- docker-compose.yml                   # Container stack (MySQL, MinIO, Backend, Frontend)
|-- package.json                         # Workspace scripts
|-- .env.example                         # Sanitized environment variable template
|
+-- frontend/                            # React 18 + TypeScript Client Application
|   |-- package.json                     # Frontend dependencies & scripts
|   |-- vite.config.ts                   # Vite bundler configuration
|   |-- tsconfig.json                    # TypeScript strict compiler options
|   |-- index.html                       # HTML5 entrypoint with Google Fonts
|   +-- src/
|       |-- App.tsx                      # Root routes and global modal providers
|       |-- main.tsx                     # React DOM bootstrap
|       |-- index.css                    # Tailwind CSS and cyber-security aesthetic styling
|       +-- components/                  # Reusable UI Components
|       |   |-- Navbar.tsx               # Top header with user profile & vault unlock
|       |   |-- Sidebar.tsx              # Main navigation & creator attribution
|       |   |-- VaultModal.tsx           # Passphrase entry & PBKDF2 key unwrap
|       |   |-- UploadModal.tsx          # Client-side AES-256 encryption & upload
|       |   |-- ShareModal.tsx           # RSA-OAEP key wrapping & member sharing
|       |   +-- DocumentPreviewModal.tsx # Zero-footprint decryptor & secure viewer
|       +-- pages/                       # Route Page Views
|       |   |-- LandingPage.tsx          # Public homescreen with creator attribution
|       |   |-- LoginPage.tsx            # Zero-knowledge sign in
|       |   |-- RegisterPage.tsx         # Workspace registration & owner key setup
|       |   |-- DashboardPage.tsx        # Real-time Security Operations Dashboard
|       |   |-- DocumentsPage.tsx        # Protected documents repository & actions
|       |   |-- SharedWithMePage.tsx     # Received shared files repository
|       |   |-- AuditPage.tsx            # Cryptographic audit log & chain verifier
|       |   |-- PolicySimulatorPage.tsx  # Pre-flight authorization simulator
|       |   |-- AlertsPage.tsx           # Security anomaly alert manager
|       |   |-- TeamPage.tsx             # Organization member management
|       |   +-- SettingsPage.tsx         # User cryptographic key management
|       +-- services/                    # Service Layer & Cloud API
|       |   |-- api.ts                   # Unified API Gateway
|       |   |-- crypto.ts                # Web Crypto API engine (AES-GCM, RSA, PBKDF2)
|       |   |-- firebase.ts              # Firebase initialization & client config
|       |   +-- firebaseBackend.ts       # Cloud Firestore, Auth & Storage engine
|       +-- types/
|           +-- index.ts                 # TypeScript interfaces and security data types
|
+-- backend/                             # Optional FastAPI Microservice (Python 3.12+)
|   |-- Dockerfile                       # Production Python containerfile
|   |-- requirements.txt                 # FastAPI, SQLAlchemy, Argon2id dependencies
|   |-- seed.py                          # Local development data seeder
|   +-- app/
|       |-- main.py                      # FastAPI application entrypoint & middleware
|       +-- api/                         # REST API Route Handlers
|       +-- core/                        # Core config, DB connectors, security engine
|       +-- middleware/                  # Rate limiting & CSRF protection
|       +-- models/                      # SQLAlchemy database schemas
|       +-- schemas/                     # Pydantic v2 data validation schemas
|       +-- services/                    # Audit chaining, policy evaluation & anomaly engine
|       +-- tests/                       # Automated Pytest suite (15 security tests)
```

---

## Quickstart & Local Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- *(Optional)* **Python**: 3.12+ (only required if running the local FastAPI microservice)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/charantejabathini-CT15/TrustVault.git
cd TrustVault
```

---

### Step 2: Configure Environment Variables
Copy the sanitized environment template:
```bash
cp .env.example .env
```
*(All variables in `.env.example` include clean placeholders. You can supply custom Firebase project settings or use default local development fallback.)*

---

### Step 3: Run the Frontend (Vite Dev Server)
```bash
# Install dependencies
npm --prefix frontend install

# Start Vite development server
npm --prefix frontend run dev
```
Open **`http://localhost:5173`** in your browser. The live application runs client-side zero-knowledge cryptography out of the box.

---

### Step 4: Building & Deploying to Firebase Hosting
```bash
# 1. Build optimized production bundle
npm --prefix frontend run build

# 2. Deploy to Firebase Hosting (using Firebase CLI)
npx firebase-tools deploy --only hosting
```
On Windows, you can alternatively run the automated deployment script:
```powershell
.\deploy-firebase.ps1
```

---

### Step 5: (Optional) Running Local Python Microservice
If you wish to test the containerized or local Python backend:
```bash
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python seed.py
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

---

## Automated Security Test Suite

The cryptographic and access control engines are backed by automated tests:

```bash
cd backend
pytest -v tests/
```

### Verified Test Results
```
test_audit.py::test_audit_chain_validity               PASSED [ 7%]
test_audit.py::test_audit_tamper_detection             PASSED [13%]
test_audit.py::test_audit_deletion_gap_detection       PASSED [20%]
test_auth.py::test_register_success                    PASSED [27%]
test_auth.py::test_register_duplicate_email            PASSED [33%]
test_auth.py::test_password_strength_validation        PASSED [40%]
test_auth.py::test_login_success_and_logout            PASSED [47%]
test_auth.py::test_login_invalid_password              PASSED [53%]
test_authorization.py::test_owner_full_access          PASSED [60%]
test_authorization.py::test_unauthorized_member_denied PASSED [67%]
test_authorization.py::test_cross_org_isolation        PASSED [73%]
test_authorization.py::test_active_share_view_vs_download PASSED [80%]
test_authorization.py::test_revoked_share_denied       PASSED [87%]
test_authorization.py::test_expired_share_denied       PASSED [93%]
test_authorization.py::test_auditor_cannot_decrypt     PASSED [100%]
```

---

## Honest Security Threat Model & Disclosures

TrustVault provides transparent cryptographic disclosures regarding operational boundaries:

1. **Client-Side Zero Knowledge:** The cloud database and storage servers have zero access to plaintext files, document AES keys, or vault passphrases.
2. **Post-Decryption Copies:** Once a legitimate grantee unwraps and decrypts a document in memory, software cannot prevent external cameras, screen capture utilities, or unauthorized re-sharing.
3. **Revocation Boundaries:** Revoking a grant immediately blocks all future access requests and key envelope unsealing; it cannot purge copies already downloaded or saved by the recipient prior to revocation.
4. **Passphrase Irrecoverability:** Because of zero-knowledge design, losing your master vault passphrase means encrypted private keys cannot be recovered by any administrator.

---

## Author & Credits

- **Creator & Lead Architect:** **Charan Teja Bathini**
- **Live Deployment:** [https://trustvault-pvt.web.app](https://trustvault-pvt.web.app)
- **GitHub Repository:** [https://github.com/charantejabathini-CT15/TrustVault](https://github.com/charantejabathini-CT15/TrustVault)

---

## License

This project is licensed under the [MIT License](LICENSE).
