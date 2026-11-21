# RESII Phase 6G: Architecture and Security Risk Review

**Date:** 2026-11-21  
**Product:** RESII AI Career Platform  
**Target:** Full Platform Architecture (`api/`, `web/`, `extension/`, `data/`)  
**Auditor:** Principal Application Security Reviewer  
**Audit Mode:** STRICT READ-ONLY AUDIT  
**Overall Risk Posture:** **Low-to-Moderate (Production-Grade Security on Implemented Subsystems)**

---

## 1. Executive Summary

This architecture and security risk review conducted an evidence-driven analysis across all authentication, authorization, database, extension, and transport subsystems. 

The security posture of the backend and browser extension is unusually high for a local-first platform:
- Signed cookie session management with double-submit CSRF protection.
- Argon2id pairing code hashing with 128-bit entropy and atomic single-use database consumption.
- SQLite WAL mode with 5,000ms busy timeouts and immediate transaction rollbacks.
- Single-use, time-bound, origin-bound authorization tickets protecting both autofill and resume artifact downloads.
- Strict multi-tenant candidate data isolation across all database queries.

Two high-severity product-level risks and several medium-severity architectural limitations were identified.

---

## 2. Risk Findings & Vulnerability Matrix

| ID | Severity | Subsystem | File & Function | Finding Summary | Blocks Next Milestone? |
|---|:---:|---|---|---|:---:|
| **RISK-6G-01** | **High** | Authentication / Frontend | `web/src/pages/LoginPage.tsx` | **Missing Signup UI (Demo Lockout):** Backend supports self-serve registration (`/api/auth/register`), but the frontend offers no signup interface, locking real candidates out unless developer tools are used. | **YES** |
| **RISK-6G-02** | **High** | Document Ingestion / Frontend | `web/src/pages/DashboardPage.tsx` | **Missing File Ingestion & Multi-Resume UI:** Backend supports genuine PDF/DOCX ingestion and listing, but the frontend has no upload dropzone and hardcodes Alex Rivera's "primary" card. | **YES** |
| **RISK-6G-03** | **Medium** | Marketing / Compliance | `marketing/src/app/page.tsx:130` | **Marketing Copy Contradicts Core Safety Invariant:** Advertises "autonomous job application submissions", directly violating RESII's human-supervised automation policy. | **NO** |
| **RISK-6G-04** | **Medium** | Rate Limiting | `api/rate_limiter.py` (`InMemoryRateLimiter`) | **Process-Local Rate Limiter:** Rate limiting state is stored in an in-memory dictionary. In a multi-worker or clustered environment, brute-force protection would require Redis. | **NO** |
| **RISK-6G-05** | **Medium** | AI Inference | `api/ai/providers/ollama.py` | **Zero Installed Ollama Models:** Ollama service is listening on port 11434, but no models are pulled, forcing all AI inference to fall back to deterministic heuristics. | **NO** |
| **RISK-6G-06** | **Low** | Storage Confidentiality | `extension/src/background/service-worker.ts` | **Unencrypted Extension Storage on Host:** `chrome.storage.local` relies on Chromium process isolation and OS-level full-disk encryption; LevelDB files on disk are unencrypted. | **NO** |
| **RISK-6G-07** | **Low** | Transport Architecture | `api/main.py` & `api/config.py` | **Loopback HTTP in Local Dev:** Extension connects over cleartext loopback HTTP (`http://127.0.0.1:8100`); mTLS/HTTPS is a future production deployment target. | **NO** |

---

## 3. Deep-Dive Subsystem Evaluations

### 3.1 Authentication & Session Lifecycle
- **Status:** **Secure & Resilient**
- **Evidence:** Session IDs are signed with HMAC-SHA256 (`api/security.py`). Session records in SQLite (`sessions` table) track `created_at`, `last_active`, and `revoked`. Idle timeouts (24h) and absolute max age (7d) are strictly enforced in `api/auth.py`.
- **Finding:** Revoked sessions immediately reject subsequent requests with HTTP 401. Bearer tokens used by the browser extension are prioritized over ambient cookies.

### 3.2 User Ownership & Tenant Isolation
- **Status:** **Enforced Across All Queries**
- **Evidence:** Every database query in `api/resumes.py`, `api/tailor.py`, `api/jobs.py`, and `api/account.py` scopes rows by `UserModel.id == user.id`. Attempting to access or export another user's resume artifact returns HTTP 404/403.
- **Automated Verification:** Verified in `api/tests/test_security_phase6b.py` and `extension/tests/test_resume_upload_e2e.py` (Step 9).

### 3.3 SQLAlchemy Transactions & SQLite Concurrency
- **Status:** **Production-Grade Local WAL Configuration**
- **Evidence:** `api/db.py` sets SQLite PRAGMAs on every connection:
  - `PRAGMA journal_mode=WAL;`
  - `PRAGMA foreign_keys=ON;`
  - `PRAGMA busy_timeout=5000;`
  - `PRAGMA synchronous=NORMAL;`
- **OCC Invariant:** Resume updates require the current version number; concurrent stale writes fail fast with HTTP 409 Conflict. Atomic rollbacks on exception were verified in `test_persistence_phase6d.py`.

### 3.4 File Storage, Cleanup & Upload Limits
- **Status:** **Secure & Protected**
- **Evidence:** `api/resumes.py` validates MIME types and file magic bytes (PDF `%PDF`, DOCX PK ZIP header). Maximum upload size is strictly capped at 10 MB (`settings.MAX_UPLOAD_SIZE`). Deleting a resume triggers cascading removal of managed files on disk.

### 3.5 Extension Trust Boundaries & Origin Validation
- **Status:** **Fully Remediated in Phase 6F.3.1**
- **Evidence:** `resolveBrowserOrigin` derives sender origin exclusively from browser-supplied `sender.origin` or subframe `sender.url`. Opaque origins (`null`, `opaque`, `data:`) fail closed. Single-use UUID authorization tickets protect both text-field autofill and binary PDF download/attachment.

### 3.6 AI Secret Handling & Key Encryption
- **Status:** **Encrypted at Rest**
- **Evidence:** `api/crypto.py` uses Fernet symmetric encryption derived from `settings.SECRET_KEY` or `CREDENTIAL_ENCRYPTION_KEY`. Cloud provider keys are encrypted before storage in `AIProviderSettingModel.api_key_encrypted` and masked as `***...1234` in responses.

---

## 4. Remediation Recommendations for Next Milestone

1. **Resolve RISK-6G-01 & RISK-6G-02 (Next Milestone Core):** Build the frontend registration screen and resume file upload dropzone connected to existing backend endpoints (`/api/auth/register` and `/api/v3/resumes/upload`).
2. **Correct Marketing Copy (RISK-6G-03):** Update `marketing/src/app/page.tsx:130` from "autonomous job application submissions" to "human-supervised application preparation and tracking" to align marketing messaging with product safety reality.
3. **Model Preparation (RISK-6G-05):** When entering the future live AI milestone, instruct the user to run `ollama pull llama3.2` or provide a valid API key.
