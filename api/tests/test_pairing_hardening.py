import time
import secrets
import hashlib
import concurrent.futures
import pytest
from fastapi.testclient import TestClient
from api.main import app
from api.config import settings
from api.rate_limiter import limiter
from api.db import SessionLocal
from api.models import ExtensionPairingCodeModel, UserModel, ResumeModel

client = TestClient(app)


def _multiprocess_pairing_worker(raw_code: str) -> int:
    from fastapi.testclient import TestClient
    from api.main import app
    c = TestClient(app)
    r = c.post("/api/v3/extension/pair", json={"pairing_code": raw_code})
    return r.status_code


@pytest.fixture(autouse=True)
def clean_rate_limits():
    limiter.reset()
    yield
    limiter.reset()


def test_pairing_code_entropy_and_hashing():
    """
    Verifies that:
    1. Generated pairing codes have >= 128 bits of cryptographic entropy.
    2. Codes are formatted cleanly (RESII-<32_hex_chars>).
    3. The database stores ONLY the SHA-256 hash of the code, NEVER the raw code.
    4. Code has 300s TTL.
    """
    # 1. Log in
    login_res = client.post("/api/auth/demo-login")
    assert login_res.status_code == 200
    cookies = login_res.cookies

    # 2. Request pairing code
    code_res = client.post("/api/v3/extension/pairing-code", cookies=cookies)
    assert code_res.status_code == 200
    data = code_res.json()
    raw_code = data["pairing_code"]

    # Entropy check: "RESII-" (6 chars) + 32 hex chars (16 bytes = 128 bits)
    assert raw_code.startswith("RESII-")
    hex_part = raw_code.replace("RESII-", "")
    assert len(hex_part) == 32
    assert len(raw_code) == 38
    assert data["ttl_seconds"] == 300

    # Verify SHA-256 hash in database
    expected_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
    with SessionLocal() as db:
        # Search by raw code -> MUST BE EMPTY
        raw_match = db.query(ExtensionPairingCodeModel).filter(
            ExtensionPairingCodeModel.code_hash == raw_code
        ).first()
        assert raw_match is None, "SECURITY VIOLATION: Raw pairing code found in database!"

        # Search by hash -> MUST EXIST
        hash_match = db.query(ExtensionPairingCodeModel).filter(
            ExtensionPairingCodeModel.code_hash == expected_hash
        ).first()
        assert hash_match is not None, "Pairing code hash was not recorded in database."
        assert hash_match.consumed is False
        assert hash_match.expires_at > time.time()


def test_atomic_concurrent_pairing_consumption():
    """
    Verifies that under concurrent attempts using the exact same pairing code,
    SQLAlchemy/SQLite atomic update guarantees that EXACTLY ONE request succeeds,
    and all other concurrent requests are rejected (401 Unauthorized).
    """
    limiter.reset()

    # 1. Log in and get code
    login_res = client.post("/api/auth/demo-login")
    cookies = login_res.cookies
    code_res = client.post("/api/v3/extension/pairing-code", cookies=cookies)
    raw_code = code_res.json()["pairing_code"]

    # 2. Fire 10 concurrent requests to /api/v3/extension/pair using identical code
    def attempt_pair(thread_id):
        thread_client = TestClient(app)
        return thread_client.post("/api/v3/extension/pair", json={"pairing_code": raw_code})

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(attempt_pair, i) for i in range(10)]
        results = [f.result() for f in futures]

    status_codes = [r.status_code for r in results]
    success_count = status_codes.count(200)
    rejected_count = status_codes.count(401)

    assert success_count == 1, f"Atomic concurrency violation: Expected exactly 1 success, got {success_count} ({status_codes})"
    assert rejected_count >= 1, f"Expected rejected attempts, got {rejected_count}"

    # Verify database state is consumed
    code_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
    with SessionLocal() as db:
        entry = db.query(ExtensionPairingCodeModel).filter(
            ExtensionPairingCodeModel.code_hash == code_hash
        ).first()
        assert entry is not None
        assert entry.consumed is True


def test_pairing_code_expiration():
    """Verifies that expired pairing codes are rejected."""
    login_res = client.post("/api/auth/demo-login")
    cookies = login_res.cookies
    code_res = client.post("/api/v3/extension/pairing-code", cookies=cookies)
    raw_code = code_res.json()["pairing_code"]
    code_hash = hashlib.sha256(raw_code.encode("utf-8")).hexdigest()

    # Artificially expire the code in DB
    with SessionLocal() as db:
        entry = db.query(ExtensionPairingCodeModel).filter(
            ExtensionPairingCodeModel.code_hash == code_hash
        ).first()
        entry.expires_at = time.time() - 10.0  # 10 seconds in the past
        db.commit()

    # Pairing attempt must fail
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": raw_code})
    assert pair_res.status_code == 401
    assert "Invalid pairing credentials or pairing code" in pair_res.json()["detail"]


def test_pairing_rate_limiter_ip_and_account():
    """Verifies sliding window rate limiting on IP and account."""
    limiter.reset()

    # 1. IP rate limiting (threshold: 10 allowed per minute)
    for i in range(10):
        res = client.post("/api/v3/extension/pair", json={"pairing_code": f"WRONG{i:03d}"})
        assert res.status_code == 401

    # 11th attempt triggers 429
    res11 = client.post("/api/v3/extension/pair", json={"pairing_code": "WRONG011"})
    assert res11.status_code == 429
    assert "Too many pairing attempts" in res11.json()["detail"]

    limiter.reset()

    # 2. Account rate limiting (threshold: 5 allowed per minute)
    target_email = "brute_force_target@example.com"
    for i in range(5):
        res = client.post("/api/v3/extension/pair", json={"email": target_email, "password": "wrong"})
        assert res.status_code == 401

    res_account = client.post("/api/v3/extension/pair", json={"email": target_email, "password": "wrong"})
    assert res_account.status_code == 429
    assert "Too many login attempts for this account" in res_account.json()["detail"]

    limiter.reset()


def test_multi_process_atomic_pairing_concurrency():
    """
    Verifies atomic conditional update across independent OS processes
    with isolated database connections. Exactly 1 process succeeds.
    """
    limiter.reset()
    login_res = client.post("/api/auth/demo-login")
    cookies = login_res.cookies
    code_res = client.post("/api/v3/extension/pairing-code", cookies=cookies)
    raw_code = code_res.json()["pairing_code"]

    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(_multiprocess_pairing_worker, raw_code) for _ in range(4)]
        status_codes = [f.result() for f in futures]

    assert status_codes.count(200) == 1, f"Expected 1 success across separate processes, got {status_codes}"
    assert status_codes.count(401) == 3, f"Expected 3 rejections, got {status_codes}"
    limiter.reset()


def test_extension_session_revocation_on_disconnect():
    """
    Verifies that disconnecting an extension pairing revokes the session in SQLite,
    immediately invalidating subsequent API calls.
    """
    limiter.reset()
    client.cookies.clear()
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
    assert pair_res.status_code == 200
    token = pair_res.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Active status check succeeds
    status_res = client.get("/api/v3/extension/status", headers=headers)
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "connected"

    # 2. Revoke session via disconnect
    disc_res = client.post("/api/v3/extension/disconnect", headers=headers)
    assert disc_res.status_code == 200

    # 3. Subsequent call with revoked token must fail with 401
    stale_res = client.get("/api/v3/extension/status", headers=headers)
    assert stale_res.status_code == 401
    limiter.reset()

