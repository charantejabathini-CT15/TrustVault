# MASTER PROJECT PROMPT — TRUSTVAULT

## Build a complete, secure, full-stack document-sharing application

Act as a senior full-stack software engineer, cybersecurity engineer, database architect, UI/UX designer, and QA engineer.

I want you to BUILD a complete, working, professional application named **TrustVault — Secure Document Sharing with a Verifiable Audit Trail**.

This is intended to become a real software project, not just a college-project UI, static HTML page, prototype made of fake buttons, or collection of code snippets.

You have permission to inspect the current workspace, create and modify project files inside it, install necessary dependencies, run development commands, execute tests, troubleshoot errors, and improve the application.

Do not stop after producing a plan. Create the actual files, implement the system, start the application, and verify as much as the local environment permits. Do not claim that a feature works unless you have tested it.

If the workspace already contains code, inspect it and preserve useful work before changing anything. If it is empty, initialize the application from scratch.

---

# 1. PROJECT VISION

TrustVault solves two major business problems:

1. Confidential documents are often shared with people who should not have access to them. Permissions may be too broad, shared links may remain active too long, and access may not be revoked correctly.

2. After a document leak, organizations may have difficulty determining which authenticated account requested the document, when the request occurred, and whether access was granted or denied.

Build a platform that provides:

- Secure user authentication.

- Individual document-level permissions.

- Client-side file encryption.

- Secure document sharing with registered recipients.

- Permission expiration and revocation.

- An integrity-verifiable audit trail.

- Suspicious-access alerts.

- An access policy simulator.

- An administration dashboard.

- A professional and responsive user interface.

The key product principle is:

**Every document has its own access policy, and every important access decision should leave verifiable evidence.**

Do not add unnecessary AI or blockchain simply for marketing. Prioritize security, correctness, usability, and a distinctive implementation.

# 2. TECHNOLOGY STACK

Use the following stack unless a genuine technical incompatibility requires a documented alternative.

Frontend:

- React

- TypeScript with strict mode

- Vite

- Tailwind CSS

- A consistent, accessible component system

- React Router for navigation

- A suitable query/data-fetching library for API integration

- Web Crypto API for browser cryptographic operations

Backend:

- Python 3.12 or a compatible supported Python version

- FastAPI

- Pydantic

- SQLAlchemy 2

- Alembic database migrations

- Argon2id password hashing

- Secure HTTP-only cookie-based authentication

Database:

- MySQL 8

- Foreign keys, uniqueness constraints, indexes, and transactions

- UTC timestamps

File storage:

- Private S3-compatible object storage using MinIO for local development

- Configuration that supports Amazon S3 or another compatible provider in production

- No public document buckets

- No storage of decrypted file contents

Testing:

- Pytest for backend tests

- Appropriate frontend unit tests

- Playwright for browser-based end-to-end tests

Development and deployment:

- Dockerfiles

- Docker Compose

- Environment-variable configuration

- A `.env.example` file containing placeholders only

- GitHub Actions CI for automated tests and build checks

Use compatible, maintained dependency versions. Pin or lock dependencies wherever practical.

# 3. APPLICATION DESIGN

Create a unique TrustVault identity.

Visual direction:

- Professional, premium cybersecurity SaaS application.

- Deep navy surfaces, neutral backgrounds, and restrained teal accents.

- Clear typography, generous spacing, subtle borders, and polished status indicators.

- Responsive layouts for desktop, tablets, and mobile.

- Light and dark themes if practical.

- Accessible forms, keyboard navigation, loading states, confirmation dialogs, empty states, and error messages.

- No copied commercial product branding.

- No random placeholder dashboards or decorative elements that do not support real functionality.

Create these pages:

1. Landing page explaining the product and its security model.

2. Registration and login pages.

3. Initial workspace creation and onboarding.

4. Main dashboard showing document totals, recent activity, active shares, expiring grants, and security alerts.

5. My Documents page.

6. Shared With Me page.

7. Upload Document page or modal.

8. Document detail and preview page.

9. Share Access dialog.

10. Audit Trail page with filters and a verification report.

11. Access Policy Simulator.

12. Security Alerts page.

13. Team and Members page.

14. Account and encryption-key settings.

15. Not-found and general error pages.

All major navigation items must work. All displayed data must come from the real backend, except explicitly seeded demonstration data.

# 4. AUTHENTICATION AND ORGANIZATION ISOLATION

Implement real authentication.

Requirements:

- User registration.

- Login and logout.

- Argon2id password hashing.

- Secure session cookies.

- Session expiry and logout invalidation.

- Server-side identity checks for every protected endpoint.

- Login rate limiting and temporary throttling against brute-force attempts.

- Input validation and safe error responses.

- CSRF protection for cookie-authenticated state-changing requests.

- Secure cookie settings in production.

- No authentication tokens or passwords in browser localStorage.

- No default production passwords.

Support separate workspaces or organizations.

Roles:

- Organization owner.

- Organization administrator.

- Standard member.

- Auditor.

Every document, access grant, audit record, and alert must be scoped to the correct organization where applicable.

Users in one organization must never access another organization's files by changing a URL, document ID, API parameter, or browser request.

Auditors can inspect authorized audit records but do not automatically receive permission to decrypt documents.

Provide an explicit local-demo seed process that creates clearly documented test users and data. Never enable demo accounts automatically in production.

# 5. REAL CLIENT-SIDE ENCRYPTION

This is a core feature, not an optional visual effect.

Implement actual browser-side encryption using Web Crypto API.

Recommended initial design:

- AES-256-GCM for file encryption.

- RSA-OAEP with SHA-256 and an appropriate key size for wrapping document encryption keys.

- Random document encryption keys generated with a cryptographically secure random generator.

- Unique random IVs for encryption operations.

- A separate vault passphrase for unlocking the user's encryption private key.

- PBKDF2-SHA-256 with a documented, configurable, sufficiently strong iteration count to derive the private-key protection key.

- The vault passphrase must never be sent to the server or written to logs.

- Export and encrypt private-key material locally before uploading its protected form.

- Store public keys and encrypted private-key material, never plaintext private keys.

Upload flow:

1. The browser reads the selected file.

2. Generate a random AES document key.

3. Encrypt the file locally.

4. Calculate a cryptographic hash of the encrypted file for integrity checking.

5. Wrap the document key using the document owner's public key.

6. Upload only the encrypted file, required non-sensitive metadata, and encrypted key envelope.

7. Show upload status and handle failures safely.

Recipient-sharing flow:

1. The owner unlocks their private key in the browser.

2. The owner browser unwraps the existing document key.

3. The browser obtains the authorized recipient's public key.

4. The browser wraps the document key for that recipient.

5. The server stores the recipient-specific key envelope and permission grant.

6. The server never receives the plaintext document key.

Document-access flow:

1. The browser requests access to a specific document.

2. The backend checks identity, organization, permissions, expiry, revocation, and applicable restrictions.

3. Unauthorized requests are denied server-side.

4. Authorized recipients receive encrypted content and their own encrypted key envelope.

5. The recipient's browser unwraps the key and decrypts the content locally.

Do not implement encryption by merely renaming files or encoding plaintext with Base64.

Do not upload plaintext document content to the backend for preview generation. If previewing a supported file format, decrypt it locally and render it in the browser where feasible.

Make encryption errors understandable without leaking secrets.

Add an encrypted key-backup or recovery strategy if it can be implemented safely. Clearly explain its threat model and limitations. Never silently create a server-side plaintext master key.

If an encryption feature cannot be implemented correctly, identify the limitation instead of faking it.

# 6. SECURE DOCUMENT SHARING

Build a complete sharing system.

The document owner must be able to:

- Select a registered recipient.

- Grant access to an individual document.

- Choose view and download permissions.

- Configure an expiry date and time.

- View the current access status.

- Revoke an active grant.

- Review previous grants and their audit history.

Requirements:

- Permissions apply individually to each document.

- Folder membership must never grant unintended access to every file in the folder.

- Sharing grants must be enforced by the backend.

- Expired grants must be rejected even if the frontend has not refreshed.

- Revoked grants must be rejected on every new server access request.

- Avoid permanent public links.

- Do not trust recipient IDs or permissions supplied by the client without server validation.

- Return a safe 404 or equivalent response when necessary to avoid revealing another organization's resource existence.

- Enforce upload-size limits and robust filename and content handling.

A critical limitation must be acknowledged: after a recipient has decrypted a file, the application cannot reliably prevent that person from keeping a copy, taking a screenshot, photographing the screen, or remembering its contents.

Do not claim that revocation can erase already downloaded or decrypted copies. Explain that revocation blocks future authorized access and that rotating encryption keys alone cannot retract plaintext or previously retained keys.

# 7. TAMPER-EVIDENT AUDIT TRAIL

Implement a real, verifiable audit system.

Record events including:

- Document upload.

- Share created.

- Share changed.

- Share revoked.

- Authorized content request.

- Content served.

- Download attempt and outcome.

- Unauthorized access attempt.

- Expired grant rejected.

- Encryption or integrity verification failure.

- Relevant security and administrative actions.

Each event should include appropriate fields such as:

- Event ID.

- Organization ID.

- Actor ID, when known.

- Document ID, when applicable.

- Action and result.

- UTC timestamp.

- Request or correlation ID.

- Minimal, non-sensitive metadata.

- Previous event hash.

- Current event hash.

Construct a canonical representation of each event and calculate SHA-256 over the event data together with the previous hash.

Use transactional sequencing or equivalent concurrency control so simultaneous requests do not silently corrupt the audit chain.

Requirements:

- Organization-scoped audit history.

- Search and filter by user, document, action, result, and date.

- Event detail view.

- Hash-chain verification.

- Clear verified/failed status.

- On failure, identify the earliest detectable mismatch.

- Detect altered events, reordered records, and deletions that break the chain.

- Add signed integrity checkpoints or an exportable signed audit receipt where practical.

- Protect audit endpoints with appropriate roles.

- Do not include passwords, vault passphrases, decrypted documents, session tokens, or cryptographic secrets in the audit payload.

- Prevent ordinary application users from editing or deleting audit events.

A hash chain is tamper-evident, not automatically tamper-proof. Document the limitations of a database administrator who can rewrite the entire database and recompute hashes. Separate signing keys and independently retained checkpoints should improve the trust model.

Do not use the vague claim "blockchain-secured" for a normal database hash chain.

Use precise audit terminology: the application records authenticated access requests and system outcomes. It cannot prove that a human actually read or understood a document merely because the content was served.

# 8. UNIQUE FEATURE: ACCESS POLICY SIMULATOR

This is the most important differentiating feature.

Build an interactive simulator for administrators and document owners.

The user selects:

- A simulated member.

- A document.

- A requested action.

- A simulated time, where useful for expiry testing.

The result must explain:

- ALLOW or DENY.

- The applicable rule.

- Whether the user belongs to the correct organization.

- Whether a permission grant exists.

- Whether the grant has expired.

- Whether the grant has been revoked.

- Whether the requested action is permitted.

- Which rule caused the final decision.

Use deterministic policy-evaluation logic shared with, or rigorously consistent with, the real backend authorization policy. Avoid creating a simulator that gives different results from production authorization.

Simulation must be read-only. It must not modify grants, decrypt documents, bypass authentication, or provide access to content.

Clearly label simulated outcomes as simulations.

# 9. UNIQUE FEATURE: SUSPICIOUS-ACCESS ALERTS

Implement explainable, rule-based alerts first. Do not require a paid external AI service.

Detect configurable cases such as:

- Repeated unauthorized requests within a short interval.

- Repeated denied access to multiple document IDs.

- Expired-grant access attempts.

- An unusual burst of document requests.

- Repeated integrity verification failures.

Use a configurable rule engine and sensible thresholds.

Each alert should show:

- Severity.

- Time detected.

- Relevant user or session, when known.

- Related document or request, when applicable.

- Triggering rule.

- Supporting evidence.

- Recommended administrative action.

- Investigation status.

Provide alert acknowledgement and resolution workflows.

Avoid unsupported claims that an event proves malicious intent. Alerts identify patterns for investigation, not certainty of wrongdoing.

# 10. DATABASE AND API DESIGN

Create appropriate models, migrations, constraints, and indexes.

At minimum, implement these entities:

- Organizations.

- Users.

- Organization memberships or roles.

- Documents.

- Document access grants.

- Recipient key envelopes.

- Audit events.

- Audit chain state or sequence records.

- Signed audit checkpoints, if implemented.

- Security alerts.

- Invitations or notifications, where implemented.

Use stable IDs, UTC timestamps, foreign keys, appropriate uniqueness constraints, and transaction boundaries.

Design a REST API with consistent validation, response formats, error handling, pagination, and access control.

Suggested endpoints:

Authentication:

- POST /api/auth/register

- POST /api/auth/login

- POST /api/auth/logout

- GET /api/auth/me

Documents:

- POST /api/documents

- GET /api/documents

- GET /api/documents/{document_id}

- GET /api/documents/{document_id}/content

- DELETE /api/documents/{document_id}, subject to ownership and retention rules

Sharing:

- POST /api/documents/{document_id}/shares

- GET /api/documents/{document_id}/shares

- PATCH /api/shares/{share_id}

- DELETE /api/shares/{share_id}

Audit:

- GET /api/audit

- GET /api/documents/{document_id}/audit

- POST /api/audit/verify

- GET /api/audit/checkpoints

Policy simulator:

- POST /api/policy/simulate

Security:

- GET /api/alerts

- PATCH /api/alerts/{alert_id}

Profile and keys:

- GET /api/profile

- GET /api/profile/public-key

- PUT /api/profile/encrypted-private-key

Adjust these endpoints to suit the final design. Do not implement insecure placeholder handlers for endpoints that are supposed to be functional.

Provide automatic OpenAPI documentation through FastAPI and ensure sensitive responses are not accidentally exposed.

# 11. UI FUNCTIONALITY

The dashboard must show real backend data.

Document table:

- Document name.

- Owner.

- File type and size.

- Creation time.

- Sharing status.

- Expiration status where applicable.

- Available actions.

Upload dialog:

- File picker and drag-and-drop.

- File validation.

- Encryption status.

- Upload progress.

- Success and failure notifications.

Sharing dialog:

- Recipient search.

- Permission selection.

- Expiration configuration.

- Existing recipients.

- Revocation controls.

- Confirmation before important changes.

Audit page:

- Search and filters.

- Chronological event list.

- Event detail panel.

- Verification action.

- Integrity result with useful diagnostic information.

Use skeleton loading where appropriate, useful empty states, accessible confirmation dialogs, and human-readable error messages.

Every button must have a real, clearly defined action. Remove nonfunctional controls and fake analytics.

# 12. REQUIRED TESTS

Write and run automated tests.

Authentication:

- Valid registration and login.

- Invalid credentials.

- Session expiry and logout.

- Passwords never stored as plaintext.

- Session and CSRF protections.

Authorization:

- Owner can access an owned document.

- Authorized recipient can request a shared document.

- Unauthorized recipient is denied.

- Cross-organization requests are denied.

- Guessed IDs do not bypass authorization.

- Expired and revoked grants are denied.

- View-only permissions do not authorize the download endpoint.

- Auditor role does not automatically authorize file decryption.

Encryption:

- Encrypting and decrypting with the intended keys works.

- A different key cannot correctly decrypt the document.

- The object stored by the backend contains ciphertext rather than document plaintext.

- Recipient-specific key envelopes are validated.

- Authentication passwords and vault passphrases never appear in logs.

Audit:

- Valid chains verify successfully.

- Modified events fail verification.

- Deleted intermediate events are detected.

- Reordered events fail verification.

- Concurrent event insertion maintains the intended sequence.

- Signed checkpoints verify correctly if implemented.

Uploads:

- Size restrictions work.

- Invalid requests are rejected.

- Storage keys cannot be manipulated through filenames.

- Storage remains private.

Frontend integration:

- Registration and login.

- Owner uploads a document.

- Owner shares it with Alice.

- Alice accesses and decrypts it in the browser.

- Bob cannot access Alice's document.

- Owner revokes Alice's grant.

- Subsequent requests using Alice's account are denied.

- The audit page displays the relevant events.

- Audit verification succeeds on the intact chain and fails after a controlled test alteration.

Use isolated test fixtures and test databases. Never manipulate production data during tests.

# 13. RUNNING AND DEPLOYMENT

Create a complete, understandable setup.

Required files should include:

- README.md.

- .env.example.

- .gitignore.

- docker-compose.yml.

- Frontend and backend Dockerfiles.

- Backend dependency lock or pinned requirements.

- Frontend package lock.

- Database migrations.

- Seed script for demo data.

- Test configuration.

- CI workflow.

- Deployment instructions.

Docker Compose should start the required local dependencies and application services, with health checks and persistent development volumes where appropriate.

Provide commands to:

1. Configure environment variables.

2. Start all services.

3. Apply database migrations.

4. Create demo accounts.

5. Run backend tests.

6. Run frontend tests.

7. Run end-to-end tests.

8. Build a production frontend.

9. Stop services safely.

Document an actual deployment path using environment-based settings, HTTPS, private object storage, production database credentials, secure cookies, backups, monitoring, and key-management precautions.

Do not put secrets in source control. Do not automatically deploy to an external service, create paid resources, or use real user data without authorization.

Explain which environment variables are necessary and where they are used.

# 14. CODE QUALITY AND SECURITY REQUIREMENTS

Follow these principles throughout the project:

- Keep API endpoints, business logic, authorization, storage, cryptography, and database code appropriately separated.

- Use strict TypeScript types and Python type annotations where practical.

- Validate all untrusted input on the server.

- Use parameterized ORM/database operations.

- Avoid unsafe HTML rendering.

- Apply appropriate content security and security headers.

- Use CORS allowlists instead of unrestricted production access.

- Never expose stack traces, secrets, or database errors to end users.

- Never put uploaded files in a publicly accessible web directory.

- Avoid logging confidential file names or metadata unnecessarily.

- Use dependency lockfiles and check for known dependency vulnerabilities where tools are available.

- Make migrations repeatable and version-controlled.

- Add linting and formatting.

- Avoid giant files containing the entire application.

- Do not put business rules exclusively in the frontend.

- Do not silently swallow exceptions.

- Do not invent successful test results.

- Do not use fake encryption, fake authentication, fake audit verification, or fake authorization.

Treat the result as a security-sensitive application that still requires independent security review before production use.

# 15. IMPLEMENTATION WORKFLOW

Work through these stages in order:

Stage 1 — Inspect and plan:

- Inspect the workspace and available tools.

- Write an architecture document.

- Write a security and threat-model document.

- Define database relationships, API contracts, and acceptance criteria.

- Identify the minimum complete vertical slice.

Stage 2 — Foundation:

- Initialize the repository.

- Create the frontend and backend structure.

- Configure Docker, MySQL, migrations, environment variables, and health endpoints.

- Start the services and confirm their health.

Stage 3 — Authentication and core data:

- Implement registration, login, organizations, members, roles, and protected APIs.

- Add database migrations and seed scripts.

- Test authorization before building more features.

Stage 4 — Encrypted documents:

- Implement client-side cryptography and protected key storage.

- Implement encrypted upload, private object storage, document listing, sharing, recipient decryption, expiration, and revocation.

- Test the full owner-recipient workflow.

Stage 5 — Audit and distinctive features:

- Implement the audit chain and verification.

- Add signed checkpoints where practical.

- Implement policy simulation and security alerts.

- Connect every interface to real APIs.

Stage 6 — Testing and polish:

- Run backend tests.

- Run frontend tests.

- Run browser end-to-end tests.

- Launch the application in a browser and inspect the main pages.

- Fix functional defects, console errors, visual defects, and failed tests.

- Repeat tests after fixes.

Stage 7 — Documentation and handoff:

- Complete the README.

- Include setup commands and environment variables.

- Document encryption, key recovery, revocation limitations, audit verification, and remaining risks.

- Summarize implemented features and actual test results.

Do not ask for approval between these stages unless a genuinely unavailable credential, dangerous action, or essential external dependency requires my input. Use sensible defaults and proceed with the implementation.

If a tool command requires authorization, request it appropriately. If Docker or a particular service is unavailable, implement a documented alternative and continue with all other achievable work.

# 16. DEFINITION OF DONE

The project is not complete merely because the homepage looks good.

The minimum successful result must have:

1. A frontend that builds.

2. A backend that starts.

3. A database that initializes using migrations.

4. Working registration and authentication.

5. Working per-document authorization.

6. Encrypted document upload and recipient-side decryption.

7. Working sharing, expiry, and revocation.

8. A hash-chain audit log with a functional verification report.

9. A functional access policy simulator.

10. A working security-alert workflow.

11. Automated tests covering critical security behavior.

12. A README with exact commands that another developer can follow.

If any requirement remains incomplete, list it honestly and explain the specific blocker. Do not mark unfinished work as complete.

# 17. START NOW

Begin by inspecting the current project directory and the available runtime tools.

Then create the architecture and implementation checklist, and immediately continue building the application in the same task.

Use the terminal to install dependencies and run code. Use the browser to verify the actual interface and end-to-end user journey when browser access is available.

Prioritize a small, fully functional, security-conscious end-to-end system over many incomplete features.

The final result should be a maintainable, demonstrable TrustVault application that I can run locally, understand, present at a hackathon, develop further, and prepare for a proper production security review.

Start implementation now. Do not return only a tutorial or a list of files you intend to create.
