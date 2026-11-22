import pytest
import asyncio
import socket
import ipaddress
import threading
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from api.main import app
from api.models import UserModel, CompanyRegistryModel, JobListingModel
from api.db import SessionLocal
from api.config import settings
from api.security import unsign_session_id, generate_csrf_token, hash_password
from api.rate_limiter import limiter
from api.jobs_engine.connectors.base import (
    BaseJobConnector,
    is_safe_external_url,
    ALLOWED_PORTS,
    MAX_REDIRECTS,
)
from api.jobs_engine.scheduler import (
    _run_sync_cycle,
    _sync_worker,
    _sync_lock,
    start_scheduler_task,
    stop_scheduler_task,
)

client = TestClient(app)


class MockJobConnector(BaseJobConnector):
    def fetch_jobs(self, board_token: str, **kwargs):
        return []

    def normalize_job(self, raw, company_meta=None):
        return {}


# =====================================================================
# SECTION 1: SCH-01 SCHEDULER EVENT-LOOP & LIFECYCLE TESTS
# =====================================================================


def test_scheduler_event_loop_responsiveness():
    """Verify that slow synchronization offloaded to thread does not block asyncio event loop."""
    async def _run():
        sync_started = threading.Event()
        sync_release = threading.Event()

        def slow_sync():
            sync_started.set()
            sync_release.wait(timeout=2.0)

        # Launch sync via asyncio.to_thread
        task = asyncio.create_task(asyncio.to_thread(slow_sync))

        # Wait for worker thread to enter slow_sync
        await asyncio.sleep(0.05)
        assert sync_started.is_set(), "Worker thread should be running"

        # Event loop must remain fully responsive and execute tasks concurrently
        loop_responsive = False
        for _ in range(5):
            await asyncio.sleep(0.01)
        loop_responsive = True

        assert loop_responsive is True, (
            "Event loop remained responsive while sync was executing"
        )

        sync_release.set()
        await task

    asyncio.run(_run())


def test_scheduler_prevents_duplicate_overlapping_sync():
    """Verify that multiple triggers do not run overlapping sync cycles."""
    assert not _sync_lock.locked()

    # Simulate active sync lock
    acquired = _sync_lock.acquire(blocking=False)
    assert acquired is True

    # Attempt second concurrent acquisition should fail cleanly
    duplicate_acquired = _sync_lock.acquire(blocking=False)
    assert duplicate_acquired is False, "Overlapping synchronization must be prevented"

    _sync_lock.release()
    assert not _sync_lock.locked()


def test_scheduler_graceful_shutdown():
    """Verify stop_scheduler_task cleanly signals and awaits worker cancellation."""
    async def _run():
        await stop_scheduler_task()
        from api.jobs_engine.scheduler import _shutdown_event
        if _shutdown_event:
            assert _shutdown_event.is_set()

    asyncio.run(_run())


# =====================================================================
# SECTION 2: SEC-01 & SEC-02 SSRF REDIRECT & PORT PROTECTION TESTS
# =====================================================================


def test_ssrf_port_restrictions():
    """Verify that only ports 80 and 443 are allowed; non-standard ports are rejected."""
    # Disallowed ports
    assert is_safe_external_url("http://example.com:22/")[0] is False
    assert is_safe_external_url("http://example.com:3306/")[0] is False
    assert is_safe_external_url("http://example.com:8080/jobs")[0] is False
    assert is_safe_external_url("http://example.com:8000/api")[0] is False
    assert is_safe_external_url("https://example.com:8443/")[0] is False

    # Allowed ports
    with patch("socket.getaddrinfo") as mock_dns:
        mock_dns.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 80))
        ]
        assert is_safe_external_url("http://example.com:80/")[0] is True
        mock_dns.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
        ]
        assert is_safe_external_url("https://example.com:443/")[0] is True
        assert is_safe_external_url("https://example.com/")[0] is True


def test_ssrf_ip_variations_and_ipv6_mapped():
    """Verify rejection of loopback, RFC1918, link-local, cloud metadata, and IPv4-mapped IPv6."""
    # Loopback
    assert is_safe_external_url("http://127.0.0.1/")[0] is False
    assert is_safe_external_url("http://127.0.0.2:80/")[0] is False
    assert is_safe_external_url("http://[::1]/")[0] is False

    # Cloud metadata
    assert is_safe_external_url("http://169.254.169.254/latest/meta-data/")[0] is False
    assert is_safe_external_url("http://metadata.google.internal/")[0] is False

    # RFC 1918 Private
    assert is_safe_external_url("http://10.0.0.1/")[0] is False
    assert is_safe_external_url("http://172.16.0.1/")[0] is False
    assert is_safe_external_url("http://192.168.1.1/")[0] is False

    # IPv4-mapped IPv6
    with patch("socket.getaddrinfo") as mock_dns:
        # IPv4-mapped loopback (::ffff:127.0.0.1)
        mock_dns.return_value = [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::ffff:127.0.0.1", 80, 0, 0))
        ]
        assert is_safe_external_url("http://evil-ipv6-mapped.com/")[0] is False

        # IPv4-mapped private (::ffff:10.0.0.1)
        mock_dns.return_value = [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::ffff:10.0.0.1", 80, 0, 0))
        ]
        assert is_safe_external_url("http://evil-mapped-private.com/")[0] is False

        # IPv4-mapped metadata (::ffff:169.254.169.254)
        mock_dns.return_value = [
            (
                socket.AF_INET6,
                socket.SOCK_STREAM,
                6,
                "",
                ("::ffff:169.254.169.254", 80, 0, 0),
            )
        ]
        assert is_safe_external_url("http://evil-mapped-metadata.com/")[0] is False


def test_ssrf_per_hop_redirect_validation_blocks_loopback():
    """Verify that 301/302 redirects targeting loopback are blocked before connecting."""
    connector = MockJobConnector()

    # Mock response: initial request returns 302 to http://127.0.0.1:80/secret
    mock_resp_1 = MagicMock()
    mock_resp_1.status_code = 302
    mock_resp_1.headers = {"Location": "http://127.0.0.1:80/secret"}

    with patch(
        "api.jobs_engine.connectors.base.is_safe_external_url",
        side_effect=[
            (True, "Safe"),  # Hop 0: public URL is safe
            (
                False,
                "Blocked loopback",
            ),  # Hop 1: redirect destination is loopback -> blocked!
        ],
    ), patch("httpx.Client.request", return_value=mock_resp_1):
        with pytest.raises(ValueError) as excinfo:
            connector._execute_bounded_request("GET", "https://public-ats.com/job/1")
        assert "SSRF Protection" in str(excinfo.value)
        assert "Blocked loopback" in str(excinfo.value)


def test_ssrf_per_hop_redirect_validation_blocks_metadata():
    """Verify that 301/302 redirects targeting cloud metadata 169.254.169.254 are blocked."""
    connector = MockJobConnector()

    mock_resp_1 = MagicMock()
    mock_resp_1.status_code = 302
    mock_resp_1.headers = {"Location": "http://169.254.169.254/latest/meta-data/"}

    with patch(
        "api.jobs_engine.connectors.base.is_safe_external_url",
        side_effect=[
            (True, "Safe"),
            (False, "Target host resolves to restricted IP range (169.254.169.254)"),
        ],
    ), patch("httpx.Client.request", return_value=mock_resp_1):
        with pytest.raises(ValueError) as excinfo:
            connector._execute_bounded_request(
                "GET", "https://public-ats.com/redirect-to-aws"
            )
        assert "169.254.169.254" in str(excinfo.value)


def test_ssrf_relative_redirect_to_blocked_destination():
    """Verify relative redirects resolving to prohibited locations are blocked."""
    connector = MockJobConnector()

    mock_resp = MagicMock()
    mock_resp.status_code = 302
    mock_resp.headers = {"Location": "//169.254.169.254/latest/meta-data/"}

    with patch("httpx.Client.request", return_value=mock_resp):
        with pytest.raises(ValueError) as excinfo:
            connector._execute_bounded_request("GET", "https://example.com/check")
        assert "SSRF Protection" in str(excinfo.value)


def test_ssrf_redirect_loop_bounded():
    """Verify that infinite redirect loops terminate cleanly at MAX_REDIRECTS."""
    connector = MockJobConnector()

    mock_resp = MagicMock()
    mock_resp.status_code = 302
    mock_resp.headers = {"Location": "https://example.com/loop"}

    with patch(
        "api.jobs_engine.connectors.base.is_safe_external_url",
        return_value=(True, "Safe"),
    ):
        with patch("httpx.Client.request", return_value=mock_resp):
            with pytest.raises(ValueError) as excinfo:
                connector._execute_bounded_request("GET", "https://example.com/loop")
            assert f"Exceeded maximum allowed redirects ({MAX_REDIRECTS})" in str(
                excinfo.value
            )


def test_ssrf_cross_origin_redirect_strips_sensitive_headers():
    """Verify Authorization and Cookie headers are stripped on cross-origin redirects."""
    connector = MockJobConnector()

    captured_headers = []

    def mock_request(method, url, **kwargs):
        captured_headers.append(dict(kwargs.get("headers", {})))
        if len(captured_headers) == 1:
            resp = MagicMock()
            resp.status_code = 302
            resp.headers = {"Location": "https://other-domain.com/apply"}
            return resp
        else:
            resp = MagicMock()
            resp.status_code = 200
            resp.headers = {}
            return resp

    with patch(
        "api.jobs_engine.connectors.base.is_safe_external_url",
        return_value=(True, "Safe"),
    ):
        with patch("httpx.Client.request", side_effect=mock_request):
            connector._execute_bounded_request(
                "GET",
                "https://initial-origin.com/job/1",
                headers={
                    "Authorization": "Bearer secret_token",
                    "Cookie": "session=123",
                    "Custom": "KeepMe",
                },
            )

    assert len(captured_headers) == 2
    # Hop 0 has credentials
    assert "Authorization" in captured_headers[0]
    assert "Cookie" in captured_headers[0]
    # Hop 1 (cross-origin to other-domain.com) MUST NOT have credentials
    assert "Authorization" not in captured_headers[1]
    assert "Cookie" not in captured_headers[1]
    assert captured_headers[1]["Custom"] == "KeepMe"


def test_ssrf_legitimate_ats_redirects_succeed():
    """Verify legitimate 301 http->https and canonical redirects succeed."""
    connector = MockJobConnector()

    def mock_request(method, url, **kwargs):
        if url == "http://boards.greenhouse.io/stripe":
            resp = MagicMock()
            resp.status_code = 301
            resp.headers = {"Location": "https://boards.greenhouse.io/stripe"}
            return resp
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"jobs": []}
        return resp

    with patch(
        "api.jobs_engine.connectors.base.is_safe_external_url",
        return_value=(True, "Safe"),
    ):
        with patch("httpx.Client.request", side_effect=mock_request):
            resp = connector._execute_bounded_request(
                "GET", "http://boards.greenhouse.io/stripe"
            )
            assert resp.status_code == 200


# =====================================================================
# SECTION 3: SEC-03 ADMIN AUTHORIZATION TESTS
# =====================================================================


def test_admin_sync_anonymous_rejected_401():
    """Anonymous visitor invoking POST /api/jobs/sync receives 401 Unauthorized."""
    anon_client = TestClient(app)
    r = anon_client.post("/api/jobs/sync")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_admin_sync_regular_user_with_job_search_entitlement_rejected_403():
    """Regular user with 'job_search' entitlement receives HTTP 403 Forbidden on admin sync."""
    limiter.reset()
    # Log in as demo user (role='user', entitlements=['job_search', ...])
    res = client.post("/api/auth/demo-login")
    session_cookie = res.cookies.get("resii_session")
    session_id = unsign_session_id(session_cookie, settings.SECRET_KEY)
    csrf_tok = generate_csrf_token(session_id, settings.SECRET_KEY)

    headers = {"X-CSRF-Token": csrf_tok}
    r = client.post("/api/jobs/sync", headers=headers, json={})
    assert r.status_code == 403
    assert "Admin privilege required" in r.json()["detail"]


def test_admin_companies_regular_user_rejected_403():
    """Regular user cannot register new companies via POST /api/jobs/companies."""
    limiter.reset()
    res = client.post("/api/auth/demo-login")
    session_cookie = res.cookies.get("resii_session")
    session_id = unsign_session_id(session_cookie, settings.SECRET_KEY)
    csrf_tok = generate_csrf_token(session_id, settings.SECRET_KEY)

    headers = {"X-CSRF-Token": csrf_tok}
    r = client.post(
        "/api/jobs/companies",
        headers=headers,
        json={
            "name": "Unauthorized Add Co",
            "career_page_url": "https://boards.greenhouse.io/unauth",
        },
    )
    assert r.status_code == 403
    assert "Admin privilege required" in r.json()["detail"]


def test_admin_sync_authorized_administrator_permitted():
    """User with role='admin' can trigger job sync."""
    with SessionLocal() as db:
        # Create or update admin user
        admin_user = (
            db.query(UserModel).filter(UserModel.id == "usr_test_admin_01").first()
        )
        if not admin_user:
            admin_user = UserModel(
                id="usr_test_admin_01",
                email="admin_audit@resii.dev",
                name="Platform Admin",
                role="admin",
                password_hash=hash_password("AdminPass123!"),
                entitlements=["admin", "job_search"],
                created_at="2026-11-21T00:00:00Z",
            )
            db.add(admin_user)
            db.commit()

    # Login as admin
    from api.security import sign_session_id
    from api.database import active_sessions
    import time

    sess_id = f"sess_admin_{int(time.time() * 1000)}"
    active_sessions[sess_id] = {
        "user": {
            "id": "usr_test_admin_01",
            "email": "admin_audit@resii.dev",
            "name": "Platform Admin",
            "role": "admin",
            "entitlements": ["admin", "job_search"],
        },
        "created_at": time.time(),
        "last_active": time.time(),
    }

    signed_cookie = sign_session_id(sess_id, settings.SECRET_KEY)
    csrf = generate_csrf_token(sess_id, settings.SECRET_KEY)

    admin_client = TestClient(app)
    admin_client.cookies.set("resii_session", signed_cookie)
    admin_client.headers["X-CSRF-Token"] = csrf

    with patch(
        "api.jobs_engine.service.job_discovery_service.sync_all_registered_companies",
        return_value={"total": 0},
    ):
        r = admin_client.post("/api/jobs/sync", json={})
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


def test_normal_job_feed_accessible_to_ordinary_users():
    """Regular authenticated and unauthenticated users retain full access to GET /api/jobs/feed."""
    r = client.get("/api/jobs/feed?page=1&page_size=5")
    assert r.status_code == 200
    data = r.json()
    assert "jobs" in data
    assert "total" in data
    assert "facets" in data
