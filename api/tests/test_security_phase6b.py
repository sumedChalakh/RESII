import pytest
import io
import time
import zipfile
from fastapi.testclient import TestClient
from api.main import app
from api.config import settings, validate_production_config, Settings
from api.database import active_sessions, users_db, DEMO_USER
from api.security import (
    sign_session_id,
    unsign_session_id,
    generate_csrf_token,
    hash_password,
    verify_password
)
from api.rate_limiter import limiter
from api.resumes import resumes_db
from api.jobs import JOB_APPLICATIONS_DB
from api.tailor import TAILOR_REVIEWS_DB

client = TestClient(app)

# Helper to create an isolated user with active session
def create_test_user_session(user_id: str, email: str, password: str = "securepass123"):
    pwd_hash = hash_password(password)
    user_record = {
        "id": user_id,
        "email": email,
        "name": f"User {user_id}",
        "role": "user",
        "created_at": "2026-11-19T00:00:00Z",
        "entitlements": ["free", "ats_check", "resume_edit"],
        "password_hash": pwd_hash
    }
    users_db[email] = user_record
    
    session_id = f"sess_{user_id}_{int(time.time()*1000)}"
    now = time.time()
    active_sessions[session_id] = {
        "user": user_record,
        "created_at": now,
        "last_active": now
    }
    cookie_val = sign_session_id(session_id, settings.SECRET_KEY)
    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY)
    return user_record, session_id, cookie_val, csrf_token


# 1. Password verification with Argon2id succeeds for valid credentials
def test_password_verification_success():
    limiter.reset()
    res = client.post("/api/auth/login", json={"email": "demo@resii.com", "password": "demo123"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["user"]["email"] == "demo@resii.com"
    assert "resii_session" in res.cookies
    assert "resii_csrf" in res.cookies


# 2. Password verification fails for wrong password (HTTP 401)
def test_password_verification_failure():
    limiter.reset()
    res = client.post("/api/auth/login", json={"email": "demo@resii.com", "password": "wrongpassword!"})
    assert res.status_code == 401
    assert "Invalid email or password" in res.json()["detail"]


# 3. Prevent auto-registration of arbitrary email addresses
def test_prevent_automatic_registration():
    limiter.reset()
    random_email = "attacker_random_999@evil.com"
    res = client.post("/api/auth/login", json={"email": random_email, "password": "anypassword"})
    assert res.status_code == 401
    assert "Invalid email or password" in res.json()["detail"]
    assert random_email not in users_db


# 4. Demo login restricted when disabled or in production
def test_demo_login_disabled_in_production_or_flag(monkeypatch):
    limiter.reset()
    # Scenario A: RESII_DEMO_MODE is False
    monkeypatch.setattr(settings, "RESII_DEMO_MODE", False)
    res = client.post("/api/auth/demo-login")
    assert res.status_code == 403
    assert "Demo login is disabled" in res.json()["detail"]

    # Scenario B: ENVIRONMENT is production
    monkeypatch.setattr(settings, "RESII_DEMO_MODE", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    res_prod = client.post("/api/auth/demo-login")
    assert res_prod.status_code == 403

    # Restore dev environment
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "RESII_DEMO_MODE", True)


# 5. Session cookie cryptographic signature validation (tampering rejected)
def test_session_cookie_signature_verification():
    # Valid login to get legitimate signed cookie
    limiter.reset()
    login_res = client.post("/api/auth/demo-login")
    valid_cookie = login_res.cookies["resii_session"]

    # Tamper with session identifier
    session_id, sig = valid_cookie.rsplit(".", 1)
    tampered_cookie = f"sess_forged_admin_id.{sig}"

    res = client.get("/api/auth/get-session", cookies={"resii_session": tampered_cookie})
    assert res.status_code == 200
    assert res.json() is None

    # Completely arbitrary cookie
    res_arbitrary = client.get("/api/auth/get-session", cookies={"resii_session": "not_even_signed"})
    assert res_arbitrary.status_code == 200
    assert res_arbitrary.json() is None


# 6. Session idle and max age expiration enforcement
def test_session_idle_and_max_age_expiration():
    _, session_id, cookie_val, _ = create_test_user_session("usr_exp_1", "exp@resii.com")

    # Verify session works initially
    res_ok = client.get("/api/auth/get-session", cookies={"resii_session": cookie_val})
    assert res_ok.status_code == 200
    assert res_ok.json()["id"] == "usr_exp_1"

    # Simulate idle timeout (> 24 hours ago)
    active_sessions[session_id]["last_active"] = time.time() - (settings.SESSION_IDLE_TIMEOUT_SECONDS + 10)
    res_idle = client.get("/api/auth/get-session", cookies={"resii_session": cookie_val})
    assert res_idle.status_code == 200
    assert res_idle.json() is None
    assert session_id not in active_sessions


# 7. Session rotation upon login
def test_session_rotation_on_login():
    limiter.reset()
    # Initial login
    res1 = client.post("/api/auth/demo-login")
    cookie1 = res1.cookies["resii_session"]
    sess_id_1 = unsign_session_id(cookie1, settings.SECRET_KEY)

    # Second login from same client rotates session
    res2 = client.post("/api/auth/demo-login", cookies={"resii_session": cookie1})
    cookie2 = res2.cookies["resii_session"]
    sess_id_2 = unsign_session_id(cookie2, settings.SECRET_KEY)

    assert sess_id_1 != sess_id_2
    assert sess_id_1 not in active_sessions
    assert sess_id_2 in active_sessions


# 8. Session invalidation on logout
def test_session_invalidation_on_logout():
    limiter.reset()
    login_res = client.post("/api/auth/demo-login")
    cookie = login_res.cookies["resii_session"]
    sess_id = unsign_session_id(cookie, settings.SECRET_KEY)
    assert sess_id in active_sessions

    logout_res = client.post("/api/auth/logout", cookies={"resii_session": cookie})
    assert logout_res.status_code == 200
    assert sess_id not in active_sessions

    check_res = client.get("/api/auth/get-session", cookies={"resii_session": cookie})
    assert check_res.json() is None


# 9. Production secret key validation
def test_production_secret_key_validation():
    # Attempting to start in production with default development key must raise RuntimeError
    insecure_settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="resii_super_secret_development_session_key_2026"
    )
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_config(insecure_settings)
    assert "SECRET_KEY of at least 32 characters" in str(exc_info.value)

    # Short secret key in production must also raise RuntimeError
    short_settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="short_key_123"
    )
    with pytest.raises(RuntimeError):
        validate_production_config(short_settings)

    # Strong 32+ character secret key in production succeeds
    valid_prod_settings = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="a" * 32,
        CREDENTIAL_ENCRYPTION_KEY="prod_cred_enc_key_32_bytes_safe!"
    )
    validate_production_config(valid_prod_settings)


# 10. Cookie security flags verification
def test_cookie_security_flags():
    limiter.reset()
    res = client.post("/api/auth/demo-login")
    raw_cookies = res.headers.get_list("set-cookie")
    
    session_cookie_hdr = next((c for c in raw_cookies if settings.COOKIE_NAME in c), None)
    assert session_cookie_hdr is not None
    assert "HttpOnly" in session_cookie_hdr
    assert "samesite=lax" in session_cookie_hdr.lower()
    assert "Path=/" in session_cookie_hdr


# 11. IDOR prevention on GET /api/v3/resumes/{id}/document
def test_idor_prevention_on_resumes_get():
    # Create User A and User B
    _, _, cookie_a, csrf_a = create_test_user_session("usr_alice", "alice@resii.com")
    _, _, cookie_b, csrf_b = create_test_user_session("usr_bob", "bob@resii.com")

    # User A creates a resume
    create_res = client.post(
        "/api/v3/resumes",
        json={"title": "Alice Secret Resume"},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    assert create_res.status_code == 201
    resume_a_id = create_res.json()["id"]

    # User A can access it
    res_a = client.get(
        f"/api/v3/resumes/{resume_a_id}/document",
        cookies={"resii_session": cookie_a}
    )
    assert res_a.status_code == 200
    assert res_a.json()["title"] == "Alice Secret Resume"

    # User B attempting to access User A's resume receives 404 Not Found
    res_b = client.get(
        f"/api/v3/resumes/{resume_a_id}/document",
        cookies={"resii_session": cookie_b}
    )
    assert res_b.status_code == 404
    assert res_b.json()["detail"] == "Resume not found."


# 12. IDOR prevention on PUT /api/v3/resumes/{id}/document
def test_idor_prevention_on_resumes_update():
    _, _, cookie_a, csrf_a = create_test_user_session("usr_alice_2", "alice2@resii.com")
    _, _, cookie_b, csrf_b = create_test_user_session("usr_bob_2", "bob2@resii.com")

    create_res = client.post(
        "/api/v3/resumes",
        json={"title": "Alice Original Title"},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    resume_id = create_res.json()["id"]

    # User B attempts to tamper with User A's resume -> 404
    tamper_res = client.put(
        f"/api/v3/resumes/{resume_id}/document",
        json={"version": 1, "title": "Hacked by Bob"},
        cookies={"resii_session": cookie_b},
        headers={"X-CSRF-Token": csrf_b}
    )
    assert tamper_res.status_code == 404
    assert resumes_db[resume_id]["title"] == "Alice Original Title"


# 13. IDOR prevention on Job Applications
def test_idor_prevention_on_job_applications():
    _, _, cookie_a, csrf_a = create_test_user_session("usr_alice_3", "alice3@resii.com")
    _, _, cookie_b, csrf_b = create_test_user_session("usr_bob_3", "bob3@resii.com")

    # User A creates application
    app_res = client.post(
        "/api/jobs/applications",
        json={"title": "Staff Engineer", "company": "Apple"},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    assert app_res.status_code == 200
    app_id = app_res.json()["id"]

    # User B lists applications: does NOT see User A's application
    list_b = client.get("/api/jobs/applications", cookies={"resii_session": cookie_b})
    assert list_b.status_code == 200
    b_app_ids = [a["id"] for a in list_b.json()["applications"]]
    assert app_id not in b_app_ids

    # User B attempts to update User A's application -> 404
    patch_b = client.patch(
        f"/api/jobs/applications/{app_id}",
        json={"stage": "rejected"},
        cookies={"resii_session": cookie_b},
        headers={"X-CSRF-Token": csrf_b}
    )
    assert patch_b.status_code == 404

    # User B attempts to delete User A's application -> 404
    del_b = client.delete(
        f"/api/jobs/applications/{app_id}",
        cookies={"resii_session": cookie_b},
        headers={"X-CSRF-Token": csrf_b}
    )
    assert del_b.status_code == 404


# 14. IDOR prevention on Tailoring sessions
def test_idor_prevention_on_tailoring():
    _, _, cookie_a, csrf_a = create_test_user_session("usr_alice_4", "alice4@resii.com")
    _, _, cookie_b, csrf_b = create_test_user_session("usr_bob_4", "bob4@resii.com")

    # User A creates a resume
    c_res = client.post(
        "/api/v3/resumes",
        json={"title": "Tailor Base"},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    rez_id = c_res.json()["id"]

    # User B attempts to generate tailoring plan on User A's resume -> 404
    plan_b = client.post(
        "/api/v3/tailor/plan",
        json={"job_description": "Software engineer React Python", "resume_id": rez_id},
        cookies={"resii_session": cookie_b},
        headers={"X-CSRF-Token": csrf_b}
    )
    assert plan_b.status_code == 404

    # User A creates plan
    plan_a = client.post(
        "/api/v3/tailor/plan",
        json={"job_description": "Software engineer React Python", "resume_id": rez_id},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    assert plan_a.status_code == 200
    rev_id = plan_a.json()["id"]

    # User B attempts to apply User A's plan -> 404
    apply_b = client.post(
        "/api/v3/tailor/apply",
        json={"review_id": rev_id, "accepted_changes": []},
        cookies={"resii_session": cookie_b},
        headers={"X-CSRF-Token": csrf_b}
    )
    assert apply_b.status_code == 404


# 15. Unbounded file upload rejection (Payload > 10MB -> HTTP 413)
def test_unbounded_file_upload_rejection():
    _, _, cookie, csrf = create_test_user_session("usr_uploader", "uploader@resii.com")
    
    # 10 MB + 1024 bytes strictly exceeds the MAX_UPLOAD_SIZE limit
    oversized_data = b"0" * (settings.MAX_UPLOAD_SIZE + 1024)
    files = {"file": ("huge_file.pdf", io.BytesIO(oversized_data), "application/pdf")}

    res = client.post(
        "/api/v3/resumes/upload",
        files=files,
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert res.status_code == 413
    assert "exceeds maximum allowed size" in res.json()["detail"]


# 16. Magic-byte and structural integrity validation (reject spoofed files)
def test_file_magic_byte_validation():
    _, _, cookie, csrf = create_test_user_session("usr_uploader_2", "uploader2@resii.com")

    # 1. Fake PDF (plain text disguised as .pdf)
    fake_pdf = b"This is not a real PDF file at all."
    res_fake_pdf = client.post(
        "/api/v3/resumes/upload",
        files={"file": ("spoofed.pdf", io.BytesIO(fake_pdf), "application/pdf")},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert res_fake_pdf.status_code == 400
    assert "Invalid file signature" in res_fake_pdf.json()["detail"]

    # 2. Fake DOCX (not a zip file)
    fake_docx = b"Plain text disguised as docx"
    res_fake_docx = client.post(
        "/api/v3/resumes/upload",
        files={"file": ("spoofed.docx", io.BytesIO(fake_docx), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert res_fake_docx.status_code == 400
    assert "missing ZIP magic bytes" in res_fake_docx.json()["detail"]

    # 3. Empty file (0 bytes)
    empty_file = b""
    res_empty = client.post(
        "/api/v3/resumes/upload",
        files={"file": ("empty.txt", io.BytesIO(empty_file), "text/plain")},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert res_empty.status_code == 400
    assert "0 bytes" in res_empty.json()["detail"]


# 17. Process-local rate limiting enforcement (HTTP 429 + Retry-After)
def test_rate_limiting_enforcement():
    limiter.reset()
    client_ip_headers = {"X-Forwarded-For": "203.0.113.195"}

    # Limit for login is 5 per minute
    for i in range(5):
        r = client.post(
            "/api/auth/login",
            json={"email": "demo@resii.com", "password": "wrong"},
            headers=client_ip_headers
        )
        assert r.status_code == 401

    # 6th request triggers rate limit
    blocked_res = client.post(
        "/api/auth/login",
        json={"email": "demo@resii.com", "password": "wrong"},
        headers=client_ip_headers
    )
    assert blocked_res.status_code == 429
    assert "Retry-After" in blocked_res.headers
    assert int(blocked_res.headers["Retry-After"]) >= 1

    # Reset limiter for subsequent tests
    limiter.reset()


# 18. CSRF protection on authenticated state-changing requests
def test_csrf_protection_on_authenticated_mutations():
    _, _, cookie, csrf = create_test_user_session("usr_csrf_test", "csrf@resii.com")

    # Mutation with valid CSRF token succeeds
    res_valid = client.post(
        "/api/v3/resumes",
        json={"title": "Legit CSRF Resume"},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert res_valid.status_code == 201

    # Mutation with missing X-CSRF-Token header returns HTTP 403 Forbidden
    res_missing = client.post(
        "/api/v3/resumes",
        json={"title": "Forged Resume"},
        cookies={"resii_session": cookie}
    )
    assert res_missing.status_code == 403
    assert "CSRF token missing or invalid" in res_missing.json()["detail"]

    # Mutation with invalid/tampered X-CSRF-Token header returns HTTP 403 Forbidden
    res_tampered = client.post(
        "/api/v3/resumes",
        json={"title": "Forged Resume"},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": "tampered_token_xyz"}
    )
    assert res_tampered.status_code == 403
    assert "CSRF token missing or invalid" in res_tampered.json()["detail"]


# =========================================================================
# Phase 6B.2 Regression Test Suite: Verification & Remediation Coverage
# =========================================================================

# --- Finding 1: Rate Limiter & Trusted Proxy Tests ---

def test_rate_limiter_spoofed_headers_untrusted_peer_blocked():
    """
    Verifies that when the immediate peer is untrusted, client-supplied
    X-Forwarded-For headers with rotating IPs are ignored, preventing spoofing bypass.
    """
    limiter.reset()
    # Untrusted client sends rotating X-Forwarded-For headers
    for i in range(5):
        r = client.post(
            "/api/auth/login",
            json={"email": "demo@resii.com", "password": "wrong"},
            headers={"X-Forwarded-For": f"198.51.100.{i}"}
        )
        assert r.status_code == 401

    # 6th request from the same peer must be blocked with HTTP 429 despite new spoofed IP
    blocked = client.post(
        "/api/auth/login",
        json={"email": "demo@resii.com", "password": "wrong"},
        headers={"X-Forwarded-For": "198.51.100.99"}
    )
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers
    limiter.reset()


def test_rate_limiter_trusted_proxy_forwarded_chain_traversal():
    """
    Verifies that when immediate peer is a trusted proxy, resolve_client_ip
    correctly selects the rightmost untrusted hop in X-Forwarded-For.
    """
    from starlette.requests import Request
    from api.rate_limiter import resolve_client_ip

    trusted = {"127.0.0.1", "10.0.0.1"}

    # Case A: Single client hop via trusted proxy
    scope = {
        "type": "http",
        "client": ("127.0.0.1", 54321),
        "headers": [(b"x-forwarded-for", b"203.0.113.195")]
    }
    req = Request(scope)
    assert resolve_client_ip(req, trusted) == "203.0.113.195"

    # Case B: Multi-proxy chain: client -> intermediate proxy -> trusted proxy (10.0.0.1) -> peer (127.0.0.1)
    scope_multi = {
        "type": "http",
        "client": ("127.0.0.1", 54321),
        "headers": [(b"x-forwarded-for", b"198.51.100.22, 192.0.2.1, 10.0.0.1")]
    }
    req_multi = Request(scope_multi)
    # The rightmost untrusted hop before 10.0.0.1 is 192.0.2.1
    assert resolve_client_ip(req_multi, trusted) == "192.0.2.1"


def test_rate_limiter_malformed_and_ipv6_normalization():
    """
    Verifies that malformed forwarded headers and IPv6 addresses are handled safely.
    """
    from starlette.requests import Request
    from api.rate_limiter import resolve_client_ip, normalize_ip

    # IPv6 bracket with port normalization
    assert normalize_ip("[2001:db8::1]:8080") == "2001:db8::1"
    assert normalize_ip("2001:db8::1") == "2001:db8::1"
    assert normalize_ip("192.168.1.1:9000") == "192.168.1.1"
    assert normalize_ip("invalid-ip-string") is None
    assert normalize_ip("") is None

    # Malformed X-Forwarded-For gracefully falls back to trusted peer
    trusted = {"127.0.0.1"}
    scope_malformed = {
        "type": "http",
        "client": ("127.0.0.1", 54321),
        "headers": [(b"x-forwarded-for", b"garbage_value, ;;;;")]
    }
    req = Request(scope_malformed)
    assert resolve_client_ip(req, trusted) == "127.0.0.1"


# --- Finding 2: Templates IDOR, Information Disclosure & CSRF Tests ---

def test_templates_unauthenticated_switch_rejected_401():
    """Unauthenticated template switch must be rejected with HTTP 401."""
    client.cookies.clear()
    res = client.post(
        "/api/v3/templates/switch",
        json={"resume_id": "primary", "template_id": "modern_tech"}
    )
    assert res.status_code == 401
    assert "Authentication required" in res.json()["detail"]


def test_templates_cross_user_switch_rejected_404():
    """User B cannot switch templates on User A's resume (returns 404)."""
    _, _, cookie_a, csrf_a = create_test_user_session("usr_tmpl_a", "tmpl_a@resii.com")
    _, _, cookie_b, csrf_b = create_test_user_session("usr_tmpl_b", "tmpl_b@resii.com")

    # User A creates a resume
    c_res = client.post(
        "/api/v3/resumes",
        json={"title": "Template Test Resume"},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    assert c_res.status_code == 201
    rez_id = c_res.json()["id"]

    # User B attempts to switch template on User A's resume -> 404
    sw_res = client.post(
        "/api/v3/templates/switch",
        json={"resume_id": rez_id, "template_id": "executive_serif"},
        cookies={"resii_session": cookie_b},
        headers={"X-CSRF-Token": csrf_b}
    )
    assert sw_res.status_code == 404
    assert "Resume not found" in sw_res.json()["detail"]


def test_templates_unauthorized_pdf_preview_rejected_404():
    """User B cannot access PDF preview for User A's resume."""
    _, _, cookie_a, csrf_a = create_test_user_session("usr_pdf_a", "pdf_a@resii.com")
    _, _, cookie_b, _ = create_test_user_session("usr_pdf_b", "pdf_b@resii.com")

    c_res = client.post(
        "/api/v3/resumes",
        json={"title": "PDF Private Resume"},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    rez_id = c_res.json()["id"]

    # User B requests PDF preview -> 404
    pdf_res = client.get(
        f"/api/v3/templates/pdf/read/{rez_id}",
        cookies={"resii_session": cookie_b}
    )
    assert pdf_res.status_code == 404


def test_templates_unauthorized_docx_preview_rejected_404():
    """User B cannot access Word export preview for User A's resume."""
    _, _, cookie_a, csrf_a = create_test_user_session("usr_docx_a", "docx_a@resii.com")
    _, _, cookie_b, _ = create_test_user_session("usr_docx_b", "docx_b@resii.com")

    c_res = client.post(
        "/api/v3/resumes",
        json={"title": "Docx Private Resume"},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    rez_id = c_res.json()["id"]

    docx_res = client.get(
        f"/api/v3/templates/word/read/{rez_id}",
        cookies={"resii_session": cookie_b}
    )
    assert docx_res.status_code == 404


def test_templates_valid_owned_switch_succeeds():
    """Owner can switch templates on their own resume."""
    _, _, cookie, csrf = create_test_user_session("usr_tmpl_owner", "owner@resii.com")

    c_res = client.post(
        "/api/v3/resumes",
        json={"title": "Owner Resume"},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    rez_id = c_res.json()["id"]

    sw_res = client.post(
        "/api/v3/templates/switch",
        json={"resume_id": rez_id, "template_id": "minimal_mono"},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert sw_res.status_code == 200
    assert sw_res.json()["template"]["id"] == "minimal_mono"


def test_templates_csrf_protection_on_switch():
    """Template switch requires valid CSRF header when authenticated."""
    _, _, cookie, _ = create_test_user_session("usr_tmpl_csrf", "tmpl_csrf@resii.com")

    sw_res = client.post(
        "/api/v3/templates/switch",
        json={"resume_id": "any_id", "template_id": "minimal_mono"},
        cookies={"resii_session": cookie}
    )
    assert sw_res.status_code == 403
    assert "CSRF token missing or invalid" in sw_res.json()["detail"]


def test_billing_and_season_authentication_and_isolation():
    """Verifies that billing and season mutations require auth and isolate data per user."""
    client.cookies.clear()
    # Unauthenticated billing checkout rejected
    res_unauth_bill = client.post("/api/billing/checkout", json={"tier": "unlimited"})
    assert res_unauth_bill.status_code == 401

    # Unauthenticated season goal update rejected
    res_unauth_season = client.post("/api/season/goal", json={"target_applications": 20})
    assert res_unauth_season.status_code == 401

    # Authenticated user A checkout does not affect User B
    _, _, cookie_a, csrf_a = create_test_user_session("usr_iso_a", "iso_a@resii.com")
    _, _, cookie_b, _ = create_test_user_session("usr_iso_b", "iso_b@resii.com")

    chk_res = client.post(
        "/api/billing/checkout",
        json={"tier": "unlimited"},
        cookies={"resii_session": cookie_a},
        headers={"X-CSRF-Token": csrf_a}
    )
    assert chk_res.status_code == 200

    # User B entitlements remain 'free'
    ent_b = client.get("/api/billing/entitlements", cookies={"resii_session": cookie_b})
    assert ent_b.status_code == 200
    assert ent_b.json()["tier"] == "free"


# --- Finding 3: Production Cookie Security Tests ---

def test_production_cookie_secure_defaults_and_validation(monkeypatch):
    """Verifies production defaults for COOKIE_SECURE and startup rejection of insecure settings."""
    # Production defaults COOKIE_SECURE to True
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    prod_settings = Settings(ENVIRONMENT="production", SECRET_KEY="a" * 32, CREDENTIAL_ENCRYPTION_KEY="prod_cred_enc_key_32_bytes_safe!")
    assert prod_settings.COOKIE_SECURE is True
    validate_production_config(prod_settings)

    # Explicit COOKIE_SECURE=False in production must be rejected by validator
    insecure_prod = Settings(ENVIRONMENT="production", SECRET_KEY="a" * 32, COOKIE_SECURE=False)
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_config(insecure_prod)
    assert "COOKIE_SECURE=True" in str(exc_info.value)

    # Development preserves COOKIE_SECURE=False
    monkeypatch.setenv("ENVIRONMENT", "development")
    dev_settings = Settings(ENVIRONMENT="development")
    assert dev_settings.COOKIE_SECURE is False


# --- Finding 4: DOCX Archive Safety & Zip Bomb Defense Tests ---

def _build_docx_zip(entries: dict, compression=zipfile.ZIP_DEFLATED) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=compression) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def test_docx_safety_oversized_uncompressed():
    """DOCX with total uncompressed size exceeding 50 MB is rejected with HTTP 400."""
    from api.security import validate_docx_archive
    from fastapi import HTTPException

    # 3 files of 18 MB each (each < 20MB limit, total 54 MB > 50 MB limit)
    entries = {
        "[Content_Types].xml": b"<xml/>",
        "word/document.xml": b"0" * (18 * 1024 * 1024),
        "word/part1.xml": b"0" * (18 * 1024 * 1024),
        "word/part2.xml": b"0" * (18 * 1024 * 1024),
    }
    oversized_zip = _build_docx_zip(entries, compression=zipfile.ZIP_STORED)

    with pytest.raises(HTTPException) as exc:
        validate_docx_archive(oversized_zip)
    assert exc.value.status_code == 400
    assert "exceeds 50 MB safety limit" in exc.value.detail


def test_docx_safety_single_member_oversized():
    """DOCX with single member exceeding 20 MB is rejected with HTTP 400."""
    from api.security import validate_docx_archive
    from fastapi import HTTPException

    entries = {
        "[Content_Types].xml": b"<xml/>",
        "word/document.xml": b"0" * (21 * 1024 * 1024)
    }
    oversized_zip = _build_docx_zip(entries, compression=zipfile.ZIP_STORED)

    with pytest.raises(HTTPException) as exc:
        validate_docx_archive(oversized_zip)
    assert exc.value.status_code == 400
    assert "exceeds 20 MB limit" in exc.value.detail


def test_docx_safety_excessive_member_count():
    """DOCX with member count exceeding 1,000 is rejected with HTTP 400."""
    from api.security import validate_docx_archive
    from fastapi import HTTPException

    entries = {f"file_{i}.txt": b"data" for i in range(1005)}
    entries["[Content_Types].xml"] = b"<xml/>"
    entries["word/document.xml"] = b"<xml/>"
    heavy_zip = _build_docx_zip(entries, compression=zipfile.ZIP_STORED)

    with pytest.raises(HTTPException) as exc:
        validate_docx_archive(heavy_zip)
    assert exc.value.status_code == 400
    assert "Archive member count" in exc.value.detail


def test_docx_safety_high_compression_ratio_zip_bomb():
    """DOCX member with extreme compression ratio (> 100:1) is rejected as a Zip Bomb."""
    from api.security import validate_docx_archive
    from fastapi import HTTPException

    # 5 MB of repeating zeros compresses down to ~5 KB (> 1000:1 ratio)
    entries = {
        "[Content_Types].xml": b"<xml/>",
        "word/document.xml": b"0" * (5 * 1024 * 1024)
    }
    bomb_zip = _build_docx_zip(entries, compression=zipfile.ZIP_DEFLATED)

    with pytest.raises(HTTPException) as exc:
        validate_docx_archive(bomb_zip)
    assert exc.value.status_code == 400
    assert "Zip Bomb detected" in exc.value.detail


def test_docx_safety_path_traversal():
    """DOCX containing path traversal components (..) or absolute paths is rejected."""
    from api.security import validate_docx_archive
    from fastapi import HTTPException

    # Case A: Directory traversal component
    entries_traversal = {
        "[Content_Types].xml": b"<xml/>",
        "word/document.xml": b"<xml/>",
        "../../evil.xml": b"<evil/>"
    }
    traversal_zip = _build_docx_zip(entries_traversal)
    with pytest.raises(HTTPException) as exc:
        validate_docx_archive(traversal_zip)
    assert exc.value.status_code == 400
    assert "path traversal" in exc.value.detail

    # Case B: Absolute path
    entries_abs = {
        "[Content_Types].xml": b"<xml/>",
        "word/document.xml": b"<xml/>",
        "/etc/passwd": b"root:x:0:0"
    }
    abs_zip = _build_docx_zip(entries_abs)
    with pytest.raises(HTTPException) as exc:
        validate_docx_archive(abs_zip)
    assert exc.value.status_code == 400
    assert "absolute path" in exc.value.detail


def test_docx_safety_missing_structural_members():
    """ZIP package missing WordprocessingML structural members is rejected."""
    from api.security import validate_docx_archive
    from fastapi import HTTPException

    # Missing word/document.xml
    entries = {"[Content_Types].xml": b"<xml/>", "other.xml": b"<xml/>"}
    incomplete_zip = _build_docx_zip(entries)
    with pytest.raises(HTTPException) as exc:
        validate_docx_archive(incomplete_zip)
    assert exc.value.status_code == 400
    assert "Missing required WordprocessingML definitions" in exc.value.detail


def test_docx_safety_valid_archive():
    """A legitimate DOCX package passes validation successfully."""
    import docx
    from api.security import validate_docx_archive

    doc = docx.Document()
    doc.add_paragraph("Alex Rivera - Senior Software Engineer")
    buf = io.BytesIO()
    doc.save(buf)
    valid_docx_bytes = buf.getvalue()

    # Must pass without raising HTTPException
    validate_docx_archive(valid_docx_bytes)

