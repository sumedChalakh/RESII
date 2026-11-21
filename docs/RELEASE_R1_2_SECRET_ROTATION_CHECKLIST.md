# RESII — RELEASE R1.2: SECRET ROTATION & CREDENTIAL MANAGEMENT CHECKLIST

**Project:** RESII AI Career Platform (`E:\SUMED_DATA\Rezifi`)  
**Scope:** Production Deployment & Public Release Security  
**Date:** 2026-11-21  

---

## 1. PURPOSE & PRINCIPLES

This checklist governs the secure configuration and rotation of credentials across the RESII platform prior to deploying to a live public-facing environment.

**Core Safety Principle:**  
Do **NOT** rotate credentials automatically or blindly during local Git preparation. Rotating keys in a live database without planned migration invalidates active user sessions, breaks extension pairing, or disconnects databases. Follow this manual verification checklist when preparing staging and production environments.

---

## 2. INVENTORY OF PLATFORM CREDENTIALS

| Credential Identifier | Config Variable | Current Dev Value / State | Production Requirement | Severity |
| :--- | :--- | :--- | :--- | :---: |
| **Session Signing Key** | `SECRET_KEY` | `resii_super_secret_development_session_key_2026` | Cryptographically random $\ge 32$ chars (rejects dev default) | **HIGH** |
| **Credential Encryption Key**| `CREDENTIAL_ENCRYPTION_KEY` | `None` (unconfigured in dev) | Cryptographically random $\ge 16$ chars | **HIGH** |
| **Database Connection** | `DATABASE_URL` | `sqlite:///./data/resii.db` | Dedicated PostgreSQL connection with strong password | **HIGH** |
| **Object Store Credentials** | `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `minioadmin` / `minioadmin` (in `infra/.env`) | Dedicated IAM credentials with restricted S3 bucket policy | **MEDIUM** |
| **Cloud AI Provider Keys** | `OPENAI_API_KEY` / `GEMINI_API_KEY` | `None` / Empty (falls back to local FreeFlow/Ollama) | Scoped vendor API keys with spending limits | **MEDIUM** |
| **Stripe Billing Keys** | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Empty | Live Stripe API keys & webhook signing secret | **LOW (Dev)** |

---

## 3. STEP-BY-STEP ROTATION PROCEDURES

### 3.1 Session Signing Key (`SECRET_KEY`)
- **Generation:**
  ```bash
  python -c "import secrets; print(secrets.token_hex(32))"
  ```
- **Configuration:** Set in production environment variable or Docker secret:
  `SECRET_KEY=<generated_64_hex_string>`
- **Impact of Rotation:**
  - **All active user sessions are immediately invalidated.**
  - Existing session cookies (`resii_session`) fail HMAC signature validation and will be rejected with HTTP 401.
  - Active users will be required to log in again.
  - Companion double-submit CSRF tokens are rotated automatically with new sessions.
  - User accounts, passwords, and resumes in the database remain completely unaffected.
- **Verification Command:**
  ```bash
  curl -i http://localhost:8100/api/auth/csrf-token
  # Must return 200 OK with fresh CSRF token and set resii_csrf cookie
  ```

### 3.2 Credential Encryption Key (`CREDENTIAL_ENCRYPTION_KEY`)
- **Generation:**
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(32))"
  ```
- **Configuration:** Set in production environment variable:
  `CREDENTIAL_ENCRYPTION_KEY=<generated_string_min_16_chars>`
- **Impact of Rotation:**
  - Used by `api/crypto.py` to encrypt/decrypt sensitive third-party credentials stored in SQLite/Postgres.
  - If rotated without decrypting and re-encrypting existing database rows, existing encrypted credentials cannot be decrypted (fails with `InvalidSignature` or decryption error).
  - Browser extension users will need to re-pair their extension via 128-bit pairing code.
- **Verification Command:**
  Run `pytest api/tests/test_remediation_phase6e2.py::TestSecureKeyPersistence` to verify AES-GCM / ChaCha20 round-trip integrity.

### 3.3 Database Credentials (`DATABASE_URL`)
- **Rotation Procedure:**
  1. Generate a strong database user password on PostgreSQL.
  2. Update PostgreSQL user password:
     ```sql
     ALTER USER resii_app WITH PASSWORD '<strong_password>';
     ```
  3. Update `DATABASE_URL` in production `.env` / Kubernetes secrets:
     `DATABASE_URL=postgresql://resii_app:<strong_password>@db.internal:5432/resii_prod`
  4. Perform rolling restart of API service instances.
- **Impact:**
  - Zero downtime if rolling restart is used.
  - Zero loss of user accounts, resumes, or application history.
- **Verification:**
  ```bash
  curl -i http://localhost:8100/health
  # Must report database connection healthy
  ```

### 3.4 Third-Party AI Provider Keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`)
- **Rotation Procedure:**
  1. Issue a new API key on the OpenAI or Google AI Studio console.
  2. Update production environment variable `OPENAI_API_KEY` or `GEMINI_API_KEY`.
  3. Restart API service.
  4. Revoke previous key on the vendor console.
- **Impact:**
  - Zero impact on users or sessions.
  - If a key is revoked before updating the backend, RESII automatically activates its deterministic fallback (`api/ai/fallback.py`), preventing user-facing 500 errors.
- **Verification:**
  Execute a test tailoring inference request to verify genuine model response.

---

## 4. PRE-PUBLICATION AUDIT SIGN-OFF

- [x] Confirmed default development session secret is strictly prohibited from running in production (`api/config.py:83`).
- [x] Confirmed `.gitignore` excludes `infra/.env` and all `.env*` files.
- [x] Confirmed `.env.example` provides sanitized guidance without copying live credentials.
- [x] Confirmed zero live production API keys exist in git-trackable source code or documentation.
