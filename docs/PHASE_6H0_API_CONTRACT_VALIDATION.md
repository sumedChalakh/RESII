# RESII — PHASE 6H.0: API CONTRACT VALIDATION & SOURCE VERIFICATION REPORT

**Project:** RESII AI Career Platform (`E:\SUMED_DATA\Rezifi`)  
**Phase:** 6H.0 — Implementation Specification Validation & Contract Freeze  
**Mode:** STRICT READ-ONLY SOURCE AUDIT  
**Date:** 2026-11-21  
**Target Milestone:** Phase 6H (Candidate Onboarding & Dynamic Multi-Resume Management)

---

## 1. EXECUTIVE SUMMARY

An exhaustive, read-only inspection of the active codebase was conducted across backend endpoints, database models, session management, middleware, and frontend store slices.

The objective of Phase 6H.0 was to validate the proposed Phase 6H technical contracts against ground truth in code, eliminating assumptions and historical documentation drift before writing implementation code.

### Summary of Key Findings

1. **Registration Route (`POST /api/auth/register`):**
   - **Status in Code:** **DOES NOT EXIST.**
   - In `api/auth.py`, only `/csrf-token`, `/get-session`, `/enabled-providers`, `/login`, `/demo-login`, and `/logout` are registered.
   - `GET /api/auth/enabled-providers` currently returns `{"providers": ["email", "demo"], "registration_open": False}`.
   - A proposed specification for `POST /api/auth/register` has been constructed and frozen herein.

2. **Resume Management Routes (`api/resumes.py`):**
   - **`GET /api/v3/resumes`:** Exists. Returns `id`, `title`, `version`, `is_primary`, `updated_at`, `ats_score`, `page_count`. Currently omits `target_role`, `target_company`, and `created_at`.
   - **`POST /api/v3/resumes/upload`:** Exists. Bounded streaming (max 10MB), magic bytes validation for PDF, DOCX, TXT.
   - **`PUT /api/v3/resumes/{id}/primary`:** **DOES NOT EXIST.** Only existed in specification text.
   - **`DELETE /api/v3/resumes/{id}`:** **DOES NOT EXIST.** The underlying proxy has `__delitem__`, but no HTTP route is registered on the APIRouter.

3. **Public ATS Check Claiming (`api/public.py` & `KeepCheckPage.tsx`):**
   - `POST /public/checks` and `GET /public/checks/{id}` exist and persist to SQLite `public_checks` table.
   - However, `KeepCheckPage.tsx` currently invokes `loginDemo()`, hard-locking all claiming users into `usr_demo_101` and routing to `/edit/primary` without linking the check or creating a new candidate resume.
   - A secure claiming route (`POST /api/v3/resumes/claim-public-check`) is specified to decouple claiming from the demo account.

4. **Security & Cryptography Reconciliation:**
   - **Password Hashing:** Confirmed **Argon2id** (`argon2.PasswordHasher`). Historical references to PBKDF2 were outdated.
   - **PDF Generation:** Confirmed **PyMuPDF (`fitz`)** in `api/pdf_engine.py`. There is no ReportLab or Weasyprint.
   - **CSRF Protection:** Authenticated state-changing routes require `X-CSRF-Token` companion header validating against `resii_session`.

---

## 2. DETAILED ENDPOINT & CONTRACT AUDIT

### 2.1 Authentication Subsystem (`api/auth.py`)

| Endpoint | HTTP Method | Auth Required | CSRF Exempt | Verified Status |
| :--- | :--- | :--- | :--- | :--- |
| `/api/auth/csrf-token` | GET | No | Yes | **Verified Existing** (Issues anonymous or session-bound CSRF token) |
| `/api/auth/get-session` | GET | Optional | N/A (GET) | **Verified Existing** (Returns `UserSession` or `null`) |
| `/api/auth/enabled-providers` | GET | No | N/A (GET) | **Verified Existing** (Returns `registration_open: False`) |
| `/api/auth/login` | POST | No | Yes | **Verified Existing** (Rate-limited, Argon2id verification, session rotation) |
| `/api/auth/demo-login` | POST | Dev only | Yes | **Verified Existing** (Rate-limited, Alex Rivera session) |
| `/api/auth/logout` | POST | Optional | Yes | **Verified Existing** (Invalidates session, clears cookies) |
| `/api/auth/register` | POST | No | Must be exempt | **MISSING (To be implemented in Phase 6H)** |

#### Current Registration Gap
In `api/auth.py`:
- Line 137: `registration_open=False` is hardcoded in `enabled_providers()`.
- No route handles new user registration. New users cannot create accounts, causing the "Demo Lockout" bottleneck identified in Phase 6G.

#### Proposed Registration Contract (`POST /api/auth/register`)
- **Request Body:**
  ```json
  {
    "email": "candidate@example.com",
    "password": "SecurePassword123!",
    "name": "Jane Candidate"
  }
  ```
- **Validation Rules:**
  - `email`: Valid email format via Pydantic `EmailStr`, normalized to lowercase.
  - `password`: Minimum length 8 characters (`len(password) >= 8`). Reject with HTTP 400 if shorter.
  - Duplicate check: Query `UserModel.email == email.lower()`. If existing, raise HTTP 400 `{"detail": "Email already registered"}`.
- **Persistence & Cryptography:**
  - Password hashed using `api.security.hash_password(req.password)` (Argon2id).
  - User record created in `UserModel`:
    - `id = f"usr_{uuid.uuid4().hex[:12]}"`
    - `role = "user"`
    - `entitlements = ["free", "ats_check", "resume_edit", "job_search"]`
    - `created_at = current ISO timestamp`
- **Session Issuance & Cookies:**
  - Upon successful user creation, an active session must be issued immediately (auto-login):
    - `session_id = f"sess_{secrets.token_urlsafe(32)}"`
    - Write session to `active_sessions` (persisted to `sessions` table).
    - Call `_set_auth_cookies(response, session_id)`:
      - `resii_session`: HttpOnly signed cookie (`path="/"`, `samesite="lax"`, `max_age=604800`).
      - `resii_csrf`: Frontend-readable cookie (`path="/"`, `samesite="lax"`, `max_age=604800`).
- **Response Schema:**
  ```json
  {
    "status": "success",
    "user": {
      "id": "usr_...",
      "email": "candidate@example.com",
      "name": "Jane Candidate",
      "role": "user",
      "avatar_url": null,
      "created_at": "2026-11-21T...",
      "entitlements": ["free", "ats_check", "resume_edit", "job_search"]
    },
    "message": "Account created successfully"
  }
  ```
- **CSRF Exemption:** Must be added to `exempt_paths` in `api/main.py:csrf_protect_middleware`.

---

### 2.2 Resume Subsystem (`api/resumes.py`)

| Endpoint | HTTP Method | Existing / Proposed | Contract Status |
| :--- | :--- | :--- | :--- |
| `/api/v3/resumes` | GET | Existing | Verified. Returns user-owned resumes. Needs `target_role`, `target_company`, `created_at` added. |
| `/api/v3/resumes` | POST | Existing | Verified. Creates blank resume tree for user. |
| `/api/v3/resumes/upload` | POST | Existing | Verified. Multipart form, bounded streaming, magic byte checks. |
| `/api/v3/resumes/{id}` | GET | Existing | Verified. Returns document tree, ats_score, and layout budget. |
| `/api/v3/resumes/{id}/document` | PUT | Existing | Verified. Optimistic concurrency control via `X-Resume-Version`. |
| `/api/v3/resumes/{id}/export/pdf` | GET | Existing | Verified. PyMuPDF engine, stream attachment. |
| `/api/v3/resumes/{id}/export/docx` | GET | Existing | Verified. python-docx engine, stream attachment. |
| `/api/v3/resumes/{id}/google-docs`| POST | Existing | Verified. Two-way sync mock. |
| `/api/v3/resumes/{id}/primary` | PUT | **PROPOSED (Missing)**| Sets target resume as primary; atomically resets others. |
| `/api/v3/resumes/{id}` | DELETE | **PROPOSED (Missing)**| Deletes resume and cascades to storage files. |
| `/api/v3/resumes/claim-public-check` | POST | **PROPOSED (Missing)**| Claims anonymous ATS check into user's account. |

#### Contract Audit for Proposed `PUT /api/v3/resumes/{id}/primary`
- **Purpose:** Select one resume as the primary candidate profile for browser extension autofill and default dashboard display.
- **Contract:**
  - Route: `PUT /api/v3/resumes/{resume_id}/primary`
  - Auth: `Depends(get_current_user_required)`
  - CSRF: Required (`X-CSRF-Token`)
  - Logic:
    1. Query resume by `resume_id` and ensure `user_id == user.id`. If not found, return HTTP 404.
    2. Atomically set `is_primary = False` for all resumes where `user_id == user.id`.
    3. Set `is_primary = True` for `resume_id`.
    4. Commit database transaction.
    5. Return `{"status": "success", "primary_resume_id": resume_id}`.

#### Contract Audit for Proposed `DELETE /api/v3/resumes/{id}`
- **Purpose:** Remove obsolete or failed resumes.
- **Contract:**
  - Route: `DELETE /api/v3/resumes/{resume_id}`
  - Auth: `Depends(get_current_user_required)`
  - CSRF: Required (`X-CSRF-Token`)
  - Logic:
    1. Query resume by `resume_id` and ensure `user_id == user.id`. If not found, return HTTP 404.
    2. Prevent deletion of the sole primary resume if other resumes exist without reassigning primary status (or default to setting another as primary).
    3. Delete disk files tracked in `ManagedFileModel` via `storage_manager.delete_file()`.
    4. Delete `ResumeModel` record (cascade deletes related records).
    5. Commit database transaction.
    6. Return `{"status": "success", "deleted_id": resume_id}`.

---

### 2.3 Upload Constraints & Security Verification

| Property | Value in Code | Verification Source |
| :--- | :--- | :--- |
| **Form Field Name** | `file` | `file: UploadFile = File(...)` (`api/resumes.py:205`) |
| **Max File Size** | 10 MB (10,485,760 bytes) | `settings.MAX_UPLOAD_SIZE` (`api/config.py:26`) |
| **Streaming Mechanism** | Chunked (64 KB chunks) | While-loop with total byte counter (`api/resumes.py:214-226`) |
| **Exceeding Size Action** | Immediate HTTP 413 | `status.HTTP_413_REQUEST_ENTITY_TOO_LARGE` |
| **Allowed File Types** | `.pdf`, `.docx`, `.txt` | `validate_file_content()` (`api/security.py:201-230`) |
| **PDF Magic Byte Check** | `%PDF-` in first 1024 bytes | `content.startswith(b"%PDF-") or b"%PDF-" in content[:1024]` |
| **DOCX Package Check** | Valid ZIP with `[Content_Types].xml` and `word/document.xml` | `validate_docx_archive()` (`api/security.py:79-189`) |
| **DOCX Anti-Zip Bomb** | $\le 1000$ members, $\le 50$MB uncompressed, ratio $\le 100:1$ | Enforced in `validate_docx_archive()` |
| **TXT Validation** | Strict UTF-8 / Latin-1 decode, no binary null bytes | Enforced in `validate_file_content()` |
| **File Storage** | Managed local directory (`data/uploads`) | `storage_manager.save_file()` |

---

### 2.4 Public Check Claiming Contract

#### Code Audit of Current State
In `api/public.py`:
- `POST /public/checks`: Accepts optional `{ filename: "..." }`, generates sample ATS check, saves to `PublicCheckModel` table in SQLite with ID `chk_<hex10>`.
- `GET /public/checks/{check_id}`: Fetches check data from `PublicCheckModel` or memory fallback.
- `web/src/pages/KeepCheckPage.tsx`:
  - Lines 14-25:
    ```typescript
    const handleClaimResume = async () => {
      setLoading(true);
      try {
        await (dispatch as any)(loginDemo()).unwrap();
        dispatch(addXp({ amount: 100, reason: 'Saved ATS Check to Account' }));
        navigate('/edit/primary');
      } catch {
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    ```
  - **Defect Confirmed:** It triggers `loginDemo()`, discarding candidate identity and bypassing personal resume creation.

#### Frozen Specification for Decoupled Public Check Claiming
- **Endpoint:** `POST /api/v3/resumes/claim-public-check`
- **Request Body:**
  ```json
  {
    "check_id": "chk_abc1234567"
  }
  ```
- **Authorization:** `Depends(get_current_user_required)` + `X-CSRF-Token` header.
- **Workflow:**
  1. Retrieve check record from `PublicCheckModel` by `check_id`.
  2. Verify check has not already been claimed (`claimed == False`).
  3. Synthesize document tree from public check data:
     - Header extracted or populated with user's name/email.
     - Rewrites and bullet points populated into work experience blocks.
  4. Create new `ResumeModel` for `user.id`:
     - `id = f"rez_{uuid.uuid4().hex[:8]}"`
     - `title = check.data.filename or "ATS Scanned Resume"`
     - `ats_score = check.data.ats_score`
     - `is_primary = True` if candidate has 0 existing resumes, otherwise `False`.
  5. Mark `PublicCheckModel` as claimed (`claimed = True`, `claimed_by = user.id`, `claimed_at = now`).
  6. Return `{"status": "success", "resume_id": new_id, "resume": resume_record}`.

---

### 2.5 Data Model & Response Field Harmonization

#### Existing `ResumeModel` Schema (`api/models.py:63-79`)
```python
class ResumeModel(Base):
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ats_score: Mapped[int] = mapped_column(Integer, default=70, nullable=False)
    active_template: Mapped[str] = mapped_column(String(64), default="classic_spruce", nullable=False)
    template_meta: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    document: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    target_role: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    target_company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(64), nullable=False)
```

#### Field Harmonization Requirements for `GET /api/v3/resumes`
Currently, `list_resumes` returns:
```json
{
  "id": "rez_123",
  "title": "Senior Backend Engineer",
  "version": 1,
  "is_primary": false,
  "updated_at": "2026-11-16T14:30:00Z",
  "ats_score": 85,
  "page_count": 1
}
```
For the multi-resume dashboard to function seamlessly, `list_resumes` must also include:
- `"target_role": r.get("target_role")`
- `"target_company": r.get("target_company")`
- `"created_at": r.get("created_at")`

---

## 3. HISTORICAL DISCREPANCIES RESOLUTION TABLE

| Topic | Inaccurate / Outdated Text | Verified Ground Truth in Code | Authoritative Source File |
| :--- | :--- | :--- | :--- |
| **Password Hashing** | "PBKDF2-HMAC-SHA256" or "bcrypt" | **Argon2id** (`argon2.PasswordHasher`) | `api/security.py:7,20-29` |
| **Session Signing** | "JWT token" or "Bearer signature" | **HMAC-SHA256** cookie (`resii_session`) | `api/security.py:31-61` |
| **PDF Rendering** | "ReportLab" or "Weasyprint" | **PyMuPDF (`fitz`)** | `api/pdf_engine.py:3,75-285` |
| **DOCX Rendering** | "DocxTemplate" or "LibreOffice" | **`python-docx`** | `api/docx_engine.py:1-150` |
| **File Formats** | "PDF and DOCX only" | **`.pdf`, `.docx`, `.txt`** | `api/security.py:201-230` |
| **Primary Resume Route**| "PUT /api/v3/resumes/{id}/primary exists" | **Does NOT exist** (Spec only) | `api/resumes.py:166-424` |
| **Delete Resume Route** | "DELETE /api/v3/resumes/{id} exists" | **Does NOT exist** in router | `api/resumes.py:166-424` |
| **Public Check Route** | "Claim ATS check merges into user" | **Only calls `loginDemo()`** | `web/src/pages/KeepCheckPage.tsx:17` |

---

## 4. VERIFICATION SIGN-OFF

The API contracts, database fields, authentication routines, and security constraints documented above represent 100% verified ground truth from the current source code. No further assumptions remain. Phase 6H implementation may proceed strictly against these validated specifications.
