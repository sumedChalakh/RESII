# RESII — Phase 6B.1: Security Verification Audit Report

**Project:** `E:\SUMED_DATA\Rezifi`  
**Audit Phase:** Phase 6B.1 — Independent Security Implementation Verification  
**Mode:** Read-Only Audit with Empirical Verification Tests  
**Target:** Phase 6B Implementation  
**Status:** Audit Completed — High-Priority Findings Identified for Rectification  

---

## 1. Executive Summary

An independent, rigorous code and runtime audit was conducted on the Phase 6B implementation of the RESII API and frontend web application. The objective was to verify that security controls implemented in Phase 6B actually hold under adversarial conditions, rather than merely passing standard unit test assertions.

### Summary of Control Classifications

| Control Area | Security Status | Primary Finding / Observation |
|---|---|---|
| **1. Forwarded IP Trust** | ⚠️ **Vulnerable** | Unconditional trust of `X-Forwarded-For` allows arbitrary client IP spoofing to bypass sliding-window rate limiting. |
| **2. CSRF Coverage** | ⚠️ **Partially Verified** | Authenticated routes are protected via double-submit HMAC tokens; however, endpoints using optional auth (`api/templates.py`, `api/billing.py`, `api/season.py`) bypass CSRF protection when called unauthenticated. |
| **3. Cookie Security** | ⚠️ **Partially Verified** | `HttpOnly`, `SameSite=Lax`, and `Path=/` are strictly enforced, but `COOKIE_SECURE` defaults to `False` in production unless explicitly set in `.env`. |
| **4. Ownership Coverage (IDOR)** | ⚠️ **Vulnerable** | Resumes, Applications, Tailor, Account, and Auto-Apply are strictly scoped; however, `POST /api/v3/templates/switch` and template preview endpoints lack user ownership checks, permitting unauthenticated IDOR mutations. |
| **5. Session Lifecycle** | 🛡️ **Verified Secure** | Cryptographic HMAC-SHA256 signatures, constant-time verification, session rotation on login, idle timeouts (24h), and max lifetime (7d) verified. In-memory session persistence behavior upon server restart documented. |
| **6. Upload Validation** | ⚠️ **Partially Verified** | 10 MB bounded chunked memory streaming and magic-byte checks work; however, DOCX ZIP archives lack uncompressed decompression limit checks (Zip Bomb risk) and traversal checks in entry paths. |
| **7. Production Configuration** | 🛡️ **Verified Secure** | Insecure/default secrets trigger immediate startup failure; demo login is hard-disabled in production; zero secrets or password hashes are logged or leaked. |

---

## 2. Detailed Technical Audit Findings

### Area 1: Forwarded IP Trust & Rate Limiting Bypass

- **Status:** ⚠️ **Vulnerable**
- **Affected File:** `api/rate_limiter.py`
- **Affected Function:** `check_rate_limit(request: Request, key_prefix: str, limit: int, window_seconds: int)`
- **Affected Endpoints:** `POST /api/auth/login`, `POST /api/auth/demo-login`, `POST /public/checks`

#### Analysis
In `api/rate_limiter.py`:
```python
client_ip = "127.0.0.1"
if request.client and request.client.host:
    client_ip = request.client.host
# Respect reverse proxy X-Forwarded-For if available
forwarded = request.headers.get("x-forwarded-for")
if forwarded:
    client_ip = forwarded.split(",")[0].strip()
```
The implementation extracts the first entry of the `X-Forwarded-For` header without checking whether the connecting socket client (`request.client.host`) is actually an authorized, trusted reverse proxy (such as Caddy on `127.0.0.1`, `::1`, or the Docker gateway).

#### Empirical Test Evidence
An automated test sent 10 rapid failed login requests from a single client socket, each specifying a distinct spoofed IP in `X-Forwarded-For`:
```python
[client.post("/api/auth/login", json={"email": "demo@resii.com", "password": "bad"}, 
             headers={"X-Forwarded-For": f"198.51.100.{i}"}) for i in range(10)]
```
- **Result:** All 10 requests returned `HTTP 401 Unauthorized` and were tracked as 10 distinct IPs. The 5 req/min rate limit was completely bypassed with 0 rate-limiting events (`HTTP 429`).

#### Proposed Narrowly Scoped Correction
Introduce a configurable `TRUSTED_PROXIES` set (defaulting to `{"127.0.0.1", "::1", "localhost", "testclient"}`). Only inspect and extract `X-Forwarded-For` if `request.client.host` is within `TRUSTED_PROXIES`. For untrusted direct connections, strictly use `request.client.host`.

---

### Area 2: CSRF Coverage & State-Changing Route Enrolment

- **Status:** ⚠️ **Partially Verified**
- **Affected Files:** `api/main.py` (`csrf_protect_middleware`), `api/templates.py`, `api/billing.py`, `api/season.py`
- **Affected Endpoints:** `POST /api/v3/templates/switch`, `POST /api/season/goal`, `POST /api/billing/checkout`, `POST /api/billing/cancel`

#### Analysis
The CSRF middleware in `api/main.py` guards state-changing methods (`POST`, `PUT`, `PATCH`, `DELETE`) with double-submit signed tokens. However, the condition:
```python
session_cookie = request.cookies.get(settings.COOKIE_NAME)
if session_cookie:
    ...
```
only executes verification if a session cookie is provided. If an endpoint does not require authentication (`get_current_user_optional`), an attacker can trigger state-changing mutations via forged cross-origin requests without cookies, bypassing CSRF protection completely.

#### Route Inventory & Coverage

| Endpoint | Method | Auth Dependency | CSRF Protected? | Status |
|---|---|---|---|---|
| `/api/auth/login` | POST | None | Exempt (Public Auth) | Verified Secure |
| `/api/auth/demo-login` | POST | None | Exempt (Dev Auth) | Verified Secure |
| `/api/auth/logout` | POST | None | Exempt | Partially Verified (Logout CSRF possible) |
| `/api/v3/resumes` | POST | `get_current_user_required` | Enforced | Verified Secure |
| `/api/v3/resumes/upload` | POST | `get_current_user_required` | Enforced | Verified Secure |
| `/api/v3/resumes/{id}/document` | PUT | `get_current_user_required` | Enforced | Verified Secure |
| `/api/jobs/applications` | POST, PATCH, DELETE | `get_current_user_required` | Enforced | Verified Secure |
| `/api/v3/tailor/plan`, `/apply` | POST | `get_current_user_required` | Enforced | Verified Secure |
| `/api/account/*` | PUT, POST | `get_current_user_required` | Enforced | Verified Secure |
| `/api/auto-apply/*` | PUT, POST | `get_current_user_required` | Enforced | Verified Secure |
| `/api/v3/templates/switch` | POST | `get_current_user_optional` | **Bypassed if unauthenticated** | **Vulnerable** |
| `/api/season/goal` | POST | `get_current_user_optional` | **Bypassed if unauthenticated** | **Vulnerable** |
| `/api/billing/checkout`, `/cancel` | POST | `get_current_user_optional` | **Bypassed if unauthenticated** | **Vulnerable** |

#### Cross-Session Rejection & Frontend Injection
- **Session-bound validation:** Verified that `expected_token = generate_csrf_token(session_id, settings.SECRET_KEY)` mathematically binds the CSRF token to the session identifier. Tampered tokens or tokens from another user session are rejected with HTTP 403.
- **Frontend injection:** Verified that `web/src/utils/csrf.ts` installs a global `window.fetch` interceptor reading `resii_csrf` cookie and adding `X-CSRF-Token` to mutations.

---

### Area 3: Cookie Security Configuration

- **Status:** ⚠️ **Partially Verified**
- **Affected File:** `api/config.py` (`Settings.COOKIE_SECURE`), `api/auth.py` (`_set_auth_cookies`)

#### Analysis
Cookies are configured in `_set_auth_cookies`:
- `httponly=True` for session cookie (`resii_session`). Verified.
- `httponly=False` for CSRF companion cookie (`resii_csrf`). Verified.
- `samesite="lax"`. Verified.
- `max_age=settings.SESSION_MAX_AGE_SECONDS` (604800s / 7 days). Verified.
- `path="/"`. Verified.
- `secure=settings.COOKIE_SECURE`.

#### Vulnerability / Gap
In `api/config.py`:
```python
COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"
```
If an operator configures `ENVIRONMENT=production` in `.env` but forgets to set `COOKIE_SECURE=true`, `COOKIE_SECURE` remains `False`. Furthermore, `validate_production_config()` does not assert that `COOKIE_SECURE is True`.

#### Proposed Narrowly Scoped Correction
In `api/config.py`, update `COOKIE_SECURE`:
```python
COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "true" if os.getenv("ENVIRONMENT") == "production" else "false").lower() == "true"
```
And add an assertion in `validate_production_config(s)` ensuring `s.COOKIE_SECURE is True` in production.

---

### Area 4: Ownership Coverage & IDOR Vulnerabilities

- **Status:** ⚠️ **Vulnerable (in templates & secondary domains)**
- **Affected File:** `api/templates.py`, `api/billing.py`, `api/season.py`
- **Affected Endpoints:** `POST /api/v3/templates/switch`, `GET /api/v3/templates/pdf/read/{resume_id}`, `GET /api/v3/templates/word/read/{resume_id}`

#### Analysis
Phase 6B successfully hardened `api/resumes.py`, `api/jobs.py`, `api/tailor.py`, `api/account.py`, and `api/auto_apply.py` with `get_current_user_required` and strict user ownership filtering.

However, `api/templates.py` was left using `get_current_user_optional`:
```python
@router.post("/switch")
def switch_template(req: TemplateSwitchRequest, user: Optional[dict] = Depends(get_current_user_optional)):
    resume = RESUMES_DB.get(req.resume_id) or RESUMES_DB.get("primary")
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")
    tpl = next((t for t in TEMPLATES_CATALOG if t["id"] == req.template_id), None)
    ...
    resume["active_template"] = tpl["id"]
```

#### Empirical Test Evidence
An unauthenticated request with no cookies was executed against `POST /api/v3/templates/switch`:
```python
client.post("/api/v3/templates/switch", json={"resume_id": "primary", "template_id": "executive_serif"})
```
- **Result:** Returned `HTTP 200 OK` and mutated `resumes_db["primary"]["active_template"]` from `None` to `"executive_serif"`.
- **Impact:** An unauthorized caller or competing user can mutate the visual formatting and layout settings of any resume in the system without authentication.

Furthermore, `GET /api/v3/templates/pdf/read/{resume_id}` and `GET /api/v3/templates/word/read/{resume_id}` accept arbitrary `resume_id` path parameters without verifying that the requesting user owns the underlying resume record.

---

### Area 5: Session Lifecycle & Memory Volatility

- **Status:** 🛡️ **Verified Secure**
- **Affected Files:** `api/auth.py`, `api/security.py`, `api/database.py`

#### Verification Checklist
- **Signature Validation:** Verified with HMAC-SHA256 and `hmac.compare_digest`. Tampered tokens return null session immediately.
- **Expiration:** Verified that sessions exceeding `SESSION_MAX_AGE_SECONDS` (7 days) or `SESSION_IDLE_TIMEOUT_SECONDS` (24 hours) are automatically deleted and rejected.
- **Session Rotation:** Verified that calling `/login` or `/demo-login` destroys any previous session identifier and generates a fresh `secrets.token_urlsafe(32)` token.
- **Session Fixation Resistance:** Verified. Attacker-controlled tokens cannot be preserved across login boundaries.
- **Logout Invalidation:** Verified. Deletes server record and clears cookies with expired Set-Cookie headers.

#### In-Process Memory Storage Architecture
Sessions are stored in process memory:
```python
active_sessions: Dict[str, Dict[str, Any]] = {}
```
- **Behavior after API restart:** When Uvicorn or the host container restarts, all active sessions in `active_sessions` are wiped.
- **Client impact:** Clients presenting previously signed session cookies will pass HMAC signature verification, but the session ID will not be found in `active_sessions`. The API returns `null` for `GET /api/auth/get-session`, gracefully redirecting the user to login.
- **Architectural note:** This in-memory state is an intentional intermediate state for Phase 6B; persistent session storage in PostgreSQL/Redis is scheduled for Phase 6C.

---

### Area 6: Upload Validation & Archive Handling

- **Status:** ⚠️ **Partially Verified**
- **Affected File:** `api/security.py` (`validate_file_content`), `api/resumes.py` (`upload_resume`)

#### Verified Controls
1. **Bounded Memory Usage:** Upload streaming reads in 64 KB chunks, tracking cumulative bytes and raising HTTP 413 immediately if > 10 MB.
2. **Magic-Byte Integrity:** PDF files must start with `%PDF-` or contain `%PDF-` in the header; DOCX files must start with `PK\x03\x04` and contain WordprocessingML definitions; TXT files must be valid UTF-8/Latin-1 without null bytes.
3. **No Temporary File Leakage:** Files are processed entirely in memory via `io.BytesIO`. No files are written to disk, preventing orphaned temp file accumulation.

#### Vulnerabilities / Gaps in DOCX ZIP Validation
In `api/security.py`:
```python
with zipfile.ZipFile(io.BytesIO(content)) as zf:
    namelist = zf.namelist()
    if "[Content_Types].xml" not in namelist and "word/document.xml" not in namelist:
        raise HTTPException(400, detail="Invalid DOCX structure...")
```
1. **Zip Bomb (Decompression Bomb):**
   The validation does not inspect `zf.infolist()` for total uncompressed size or compression ratio. A 2 MB zipped file expanding to 2 GB could cause an Out-Of-Memory (OOM) crash when parsed by `docx.Document(io.BytesIO(content))`.
2. **Path Traversal in Archive Members:**
   `zf.namelist()` is checked for presence of required files, but member filenames are not checked for path traversal components (e.g. `../../` or absolute paths). While `docx` reads internally from memory rather than extracting to disk, defense-in-depth requires rejecting malicious entry names.

---

### Area 7: Production Configuration & Secret Safety

- **Status:** 🛡️ **Verified Secure**
- **Affected Files:** `api/config.py`, `api/auth.py`, `api/main.py`

#### Verification Checklist
- **Startup Secret Validation:** Verified that `validate_production_config()` raises `RuntimeError` on startup if `ENVIRONMENT == "production"` and `SECRET_KEY` is missing, matches `DEFAULT_DEV_SECRET`, or is shorter than 32 characters.
- **Accidental Demo Login Prevention:** Verified that `demo_login` checks both `settings.RESII_DEMO_MODE` and `settings.ENVIRONMENT == "development"`. In production, it unconditionally returns `HTTP 403 Forbidden`.
- **Credential & Secret Logging:** Grep and AST inspection confirmed zero `logger` or `print` statements emitting `SECRET_KEY`, `password_hash`, or raw passwords. User dictionary output strips `password_hash` before serializing.

---

## 3. High-Severity & Critical Issues Identified

The audit identified three issues requiring remediation before Phase 6C:

1. **[HIGH] Forwarded IP Spoofing in Rate Limiter (`api/rate_limiter.py`)**
   - **Impact:** Attackers can bypass rate limits on login brute-force and public ATS checks by supplying arbitrary `X-Forwarded-For` headers.
   - **Fix:** Trust `X-Forwarded-For` only when `request.client.host` is in a defined `TRUSTED_PROXIES` whitelist.

2. **[HIGH] IDOR and CSRF Bypass in Templates API (`api/templates.py`)**
   - **Impact:** Unauthenticated or cross-tenant callers can switch templates on any resume via `POST /api/v3/templates/switch` and access previews via `/pdf/read/{id}` and `/word/read/{id}` without ownership checks.
   - **Fix:** Enforce `user = Depends(get_current_user_required)` on `POST /api/v3/templates/switch` and preview endpoints, and verify `resume.get("user_id") == user.id`.

3. **[MEDIUM] Insecure Production Cookie Defaults & Zip Bomb Guard (`api/config.py`, `api/security.py`)**
   - **Impact:** Missing `COOKIE_SECURE=true` in `.env` leaves production cookies unflagged; uncompressed size in DOCX uploads is unconstrained.
   - **Fix:** Default `COOKIE_SECURE` to `True` when `ENVIRONMENT == "production"`, enforce it in `validate_production_config`, and cap total DOCX uncompressed size to 50 MB in `validate_file_content`.

---

## 4. Next Step Recommendation

In accordance with execution boundaries:
- **Phase 6C will NOT be started automatically.**
- A proposed minimal patch for the 3 identified issues is ready for review.
- Awaiting user approval before applying the Phase 6B.1 security remediation.
