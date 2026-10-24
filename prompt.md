# TrustVault — Engineering Specification & System Prompts

> **Author & Architect:** Charan Teja Bathini  
> **Project:** TrustVault — Zero-Knowledge Confidential Document Vault & Verifiable Audit Trail  
> **Live Production System:** [https://trustvault-pvt.web.app](https://trustvault-pvt.web.app)  
> **GitHub Repository:** [https://github.com/charantejabathini-CT15/TrustVault](https://github.com/charantejabathini-CT15/TrustVault)

---

## 1. Master System Prompt & Product Vision

```markdown
You are an expert Security Engineer and Full-Stack Cryptographic Systems Architect.
Your task is to build "TrustVault" — an enterprise-grade, zero-knowledge confidential document sharing platform governed by one unshakeable principle:

"Every document has its own access policy, and every important access decision leaves verifiable evidence."

The system must prove mathematically and cryptographically that:
1. Files are sealed in the browser before being stored. No plaintexts or raw symmetric keys ever touch the cloud unencrypted.
2. Access grants (view vs. download, expirations, revocations) are enforced strictly.
3. Every security event is chained in a tamper-evident SHA-256 audit ledger that detects sequence gaps, reordering, and unauthorized database alterations.
4. Administrators can simulate access rules prior to granting access via an interactive Access Policy Simulator.
5. Real-time operations provide instant synchronization across active sessions.
```

---

## 2. Core Cryptographic Architecture Directives

### A. Client-Side Zero-Knowledge Cryptography (Web Crypto API)
- **Engine:** Use native `window.crypto.subtle`. No third-party unvetted cryptographic binaries.
- **Symmetric File Sealing (AES-256-GCM):**
  - Generate a unique 256-bit random key (`AES-GCM`) per uploaded document.
  - Generate a unique 12-byte cryptographically secure random Initialization Vector (`IV`).
  - Encrypt plaintext in browser memory. Compute SHA-256 hash of ciphertext for transmission integrity.
- **Asymmetric Recipient Key Wrapping (RSA-OAEP 2048-bit):**
  - Each workspace member generates an RSA-OAEP 2048-bit keypair with SHA-256 hash function.
  - When sharing a document, wrap (encrypt) the document's symmetric AES key with the recipient's RSA public key.
  - Store wrapped keys inside individual recipient `KeyEnvelope` records.
- **Master Vault Passphrase Protection (PBKDF2-SHA-256):**
  - Derive a key-encryption-key (KEK) from the user's master vault passphrase using PBKDF2 with SHA-256, a 16-byte random salt, and 600,000 hashing rounds.
  - Wrap the user's RSA private key with AES-GCM using this KEK before persisting to the database.
  - The master passphrase must NEVER be sent to the server or stored anywhere on disk.

### B. In-Memory Decryption & Secure Rendering Pipeline
- Decrypt ciphertext directly in client RAM; immediately revoke object URLs (`URL.revokeObjectURL`) on modal close.
- Support universal file preview with binary magic-byte inspection (`%PDF`, PNG, JPEG, WebP, UTF-8 text).
- **Strict View-Only Security Mode:**
  - When grantee has `view` permission only: disable download buttons, suppress browser PDF toolbars (`#toolbar=0&navpanes=0`), intercept right-click context menus, and render dynamic confidentiality watermarks over the document canvas.

---

## 3. Cryptographic Audit Hash-Chain Specification

Every security event (upload, access, download, share creation, revocation, policy denial) must append to a sequential SHA-256 hash chain:

$$H_n = \text{SHA-256}(H_{n-1} \parallel \text{Canonical}(Event_n))$$

### Canonical Event String Format
```
sequence_number:org_id:actor_id:document_id:action:result:iso_timestamp
```

- **Genesis State:** Sequence #0 starts with $H_0 = \text{"0" \times 64}$.
- **Immutability Invariant:** Audit records can only be created, never edited or deleted (`allow update, delete: if false`).
- **Mathematical Integrity Verifier:**
  - Provide a one-click chain verification engine that re-hashes every historical event from sequence #1 to sequence head.
  - If $H_{n-1}$ does not match the recorded `previous_hash`, flag database tampering.
  - If $Seq_n \ne Seq_{n-1} + 1$, flag record deletion.
  - If recomputed $\text{SHA-256}(H_{n-1} \parallel Canonical) \ne H_n$, flag event payload alteration.

---

## 4. Access Policy Simulator & Rule Engine Directives

### A. Access Policy Simulator
Create an interactive pre-flight sandbox allowing workspace owners and admins to test authorization decisions without performing real file access:
- **Inputs:** Target User ID, Target Document ID, Action (`view` vs. `download`), Simulated Timestamp.
- **Deterministic Pipeline:**
  1. `user_exists`: Verify target user profile.
  2. `document_exists`: Verify document is not deleted.
  3. `org_boundary`: Verify cross-tenant isolation (strict organization match).
  4. `is_owner`: Check if candidate owns the file (automatic full access).
  5. `share_grant`: Check active `DocumentShare` record.
  6. `revocation_check`: Check whether grant has been revoked.
  7. `expiration_check`: Compare simulated timestamp against `expires_at`.
  8. `permission_level`: Validate permission satisfies the requested action (`download` requires download permission; `view` allows view).
- **Output:** Deterministic **ALLOW** or **DENY** verdict with itemized diagnostic check results.

### B. Suspicious-Access Anomaly Detection Engine
Evaluate security events in real-time to alert administrators to potential insider threats or unauthorized probes:
1. **Repeated Denied Requests:** $>3$ access denials for a user within 10 minutes.
2. **Multi-Document Probing:** Access denials across $>2$ distinct documents by the same user.
3. **Expired Grant Exploitation:** Repeated access attempts against revoked or expired shares.
4. **Download Bursts:** Unusually high download volume within a 5-minute window.
5. **Decryption Integrity Failures:** Client-side hash verification mismatches.

---

## 5. Cloud Platform & Real-Time Synchronization Directives

### A. Google Firebase Cloud Architecture
- **Firebase Authentication:** Secure user identity, JWT session management, role claims (`owner`, `admin`, `member`, `auditor`).
- **Cloud Firestore:**
  - Multi-tenant relational schema: `/users`, `/organizations`, `/documents`, `/shares`, `/key_envelopes`, `/audit_events`, `/audit_chains`, `/security_alerts`.
  - Real-time updates via live `onSnapshot` listeners.
  - Zero composite-index bottlenecks: Query using single-field equality filters and sort sequentially in client memory.
- **Firebase Cloud Storage:**
  - Private ciphertext binary storage with GCS CORS configuration.
  - Inline ciphertext acceleration for payloads $\le 700\text{ KB}$ for instantaneous zero-latency retrieval.

### B. Real-Time Security Operations Dashboard
- Live reactive counters for Protected Documents, Active Share Grants, Open Security Alerts, and Audit Chain Sequence Head.
- Visual status indicator (`● Live Real-Time Sync`) with timestamp tracking and manual sync controls.
- Automatic background heartbeat synchronization every 4 seconds.

---

## 6. Security Boundaries & Threat Model Disclosures

1. **Zero-Knowledge Cloud Boundary:** Cloud infrastructure hosts ciphertext only. It is mathematically incapable of reading confidential files.
2. **Post-Decryption Boundary:** Once decrypted inside a legitimate recipient's browser, client software cannot prevent external screen recording, photography, or external distribution.
3. **Revocation Horizon:** Revocation blocks all subsequent access and cryptographic envelope unwrapping; it cannot purge plaintext copies already saved to physical storage by a recipient prior to revocation.
4. **Master Key Recovery:** If a user loses their vault passphrase, their RSA private key cannot be decrypted by any server administrator.

---

*Authored by Charan Teja Bathini — TrustVault Cryptographic Engineering Team*
