import pytest
import time
from fastapi.testclient import TestClient
from api.main import app
from api.config import settings
from api.rate_limiter import limiter

client = TestClient(app)


def test_extension_pair_and_status():
    # 1. Pair with valid code
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
    assert pair_res.status_code == 200, pair_res.text
    data = pair_res.json()
    assert data["status"] == "paired"
    assert "token" in data
    token = data["token"]
    assert data["user"]["email"] == "demo@resii.com"

    # 2. Status with Bearer token
    status_res = client.get(
        "/api/v3/extension/status",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert status_res.status_code == 200, status_res.text
    status_data = status_res.json()
    assert status_data["status"] == "connected"
    assert status_data["user"]["id"] == "usr_demo_101"

    # 3. Status with invalid token
    bad_res = client.get(
        "/api/v3/extension/status",
        headers={"Authorization": "Bearer bad_invalid_token"}
    )
    assert bad_res.status_code == 401


def test_single_use_pairing_code_lifecycle():
    # 1. Log in to get web session
    login_res = client.post("/api/auth/demo-login")
    assert login_res.status_code == 200, login_res.text
    cookies = login_res.cookies

    # 2. Generate cryptographically random pairing code (>= 128 bits entropy)
    code_res = client.post("/api/v3/extension/pairing-code", cookies=cookies)
    assert code_res.status_code == 200, code_res.text
    code_data = code_res.json()
    assert "pairing_code" in code_data
    code = code_data["pairing_code"]
    assert code.startswith("RESII-")
    assert len(code) == 38  # "RESII-" (6) + 32 hex chars (128 bits)
    assert code_data["ttl_seconds"] == 300

    # 3. Pair extension using the single-use code
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": code})
    assert pair_res.status_code == 200, pair_res.text
    pair_data = pair_res.json()
    assert pair_data["status"] == "paired"
    assert "token" in pair_data

    # 4. Attempt to RE-USE the exact same code -> MUST BE REJECTED (Single-use guarantee)
    reuse_res = client.post("/api/v3/extension/pair", json={"pairing_code": code})
    assert reuse_res.status_code == 401, "Single-use code reuse was not rejected!"


def test_production_demo_lockout():
    orig_env = settings.ENVIRONMENT
    try:
        settings.ENVIRONMENT = "production"
        res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
        assert res.status_code == 403, "Production demo pairing was not locked out!"
        assert "prohibited in production" in res.json()["detail"].lower()
    finally:
        settings.ENVIRONMENT = orig_env


def test_pairing_rate_limiting():
    # Clear IP rate limit history for clean test
    limiter.reset()

    # Issue 10 attempts (allowed threshold is 10 per 60s)
    for i in range(10):
        client.post("/api/v3/extension/pair", json={"pairing_code": f"BAD{i:03d}"})

    # The 11th attempt must trigger 429 Too Many Requests
    limited_res = client.post("/api/v3/extension/pair", json={"pairing_code": "BAD999"})
    assert limited_res.status_code == 429
    assert "Too many pairing attempts" in limited_res.json()["detail"]

    # Clear for subsequent tests
    limiter.reset()


def test_extension_candidate_profile_unfabricated():
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
    token = pair_res.json()["token"]

    res = client.get(
        "/api/v3/extension/candidate-profile",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "profile" in data
    assert "facts" in data
    assert "resumes" in data
    assert data["profile"]["email"] == "demo@resii.com"
    assert isinstance(data["resumes"], list)


def test_extension_generate_answers_and_demographic_safeguards():
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
    token = pair_res.json()["token"]

    req_data = {
        "job_title": "Senior Platform Engineer",
        "company": "Acme Corp",
        "questions": [
            "Will you now or in the future require visa sponsorship?",
            "How many years of experience do you have with distributed systems?",
            "What is your gender or ethnicity?",
            "What is your notice period?"
        ]
    }

    res = client.post(
        "/api/v3/extension/generate-answers",
        json=req_data,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    answers = data["answers"]
    assert len(answers) == 4

    # Question 1: Sponsorship
    q1 = answers[0]
    assert "sponsorship" in q1["provenance"]
    assert q1["confidence"] > 0.9
    assert q1["requires_user_input"] is False

    # Question 2: Years
    q2 = answers[1]
    assert "years_of_experience" in q2["provenance"]
    assert q2["requires_user_input"] is False

    # Question 3: Sensitive demographic -> MUST REQUIRE USER INPUT AND NEVER AUTOFILL
    q3 = answers[2]
    assert q3["provenance"] == "sensitive_demographic"
    assert q3["requires_user_input"] is True
    assert q3["answer"] == ""
    assert q3["confidence"] == 0.0

    # Question 4: Notice period
    q4 = answers[3]
    assert "notice_period" in q4["provenance"]
    assert q4["requires_user_input"] is False


def test_extension_track_application_lifecycle():
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
    token = pair_res.json()["token"]
    test_comp = f"Cloudflare-{int(time.time())}"

    # 1. Track as DRAFT (Autofilled but not submitted)
    draft_req = {
        "title": "Senior Staff Architect",
        "company": test_comp,
        "location": "Remote",
        "job_url": "https://cloudflare.com/careers/arch-101",
        "resume_id": "res_demo_primary",
        "form_provider": "Greenhouse",
        "stage": "draft",
        "notes": "Autofilled via extension, awaiting candidate final review."
    }

    res_draft = client.post(
        "/api/v3/extension/track-application",
        json=draft_req,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_draft.status_code == 200, res_draft.text
    data_draft = res_draft.json()
    assert data_draft["stage"] == "draft", "Autofill without submission must be recorded as draft!"
    assert data_draft["applied_date"] is None

    # 2. Track as APPLIED (Candidate explicitly confirmed manual submission)
    applied_req = {
        "title": "Senior Staff Architect",
        "company": test_comp,
        "location": "Remote",
        "job_url": "https://cloudflare.com/careers/arch-101",
        "resume_id": "res_demo_primary",
        "form_provider": "Greenhouse",
        "stage": "applied",
        "notes": "Candidate manually clicked submit on company website."
    }

    res_applied = client.post(
        "/api/v3/extension/track-application",
        json=applied_req,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_applied.status_code == 200, res_applied.text
    data_applied = res_applied.json()
    assert data_applied["stage"] == "applied"
    assert data_applied["applied_date"] is not None


def test_extension_token_rotation_and_revocation():
    client.cookies.clear()
    # 1. Pair extension to obtain initial token
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
    assert pair_res.status_code == 200
    token1 = pair_res.json()["token"]

    # Verify token1 works
    s1 = client.get("/api/v3/extension/status", headers={"Authorization": f"Bearer {token1}"})
    assert s1.status_code == 200

    # 2. Rotate token
    rot_res = client.post("/api/v3/extension/rotate-token", headers={"Authorization": f"Bearer {token1}"})
    assert rot_res.status_code == 200, rot_res.text
    rot_data = rot_res.json()
    assert rot_data["status"] == "rotated"
    token2 = rot_data["token"]
    assert token2 != token1

    # 3. Old token1 MUST now be rejected with 401
    s_old = client.get("/api/v3/extension/status", headers={"Authorization": f"Bearer {token1}"})
    assert s_old.status_code == 401, "Revoked token after rotation was not rejected!"

    # 4. New token2 MUST succeed
    s_new = client.get("/api/v3/extension/status", headers={"Authorization": f"Bearer {token2}"})
    assert s_new.status_code == 200

    # 5. Disconnect using token2
    disc_res = client.post("/api/v3/extension/disconnect", headers={"Authorization": f"Bearer {token2}"})
    assert disc_res.status_code == 200
    assert disc_res.json()["status"] == "disconnected"

    # 6. Disconnected token2 MUST now be rejected with 401
    s_disc = client.get("/api/v3/extension/status", headers={"Authorization": f"Bearer {token2}"})
    assert s_disc.status_code == 401, "Revoked token after disconnect was not rejected!"


def test_extension_real_tailoring_and_match():
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
    assert pair_res.status_code == 200
    token = pair_res.json()["token"]

    jd = """
    We are looking for an AI Engineer - Quality Systems.
    Responsibilities:
    - Build evaluation pipelines for LLM agents and benchmarking response fidelity.
    - Implement RAG architectures using LangGraph and Python.
    - Evaluate model drift, latency, and explainability with SHAP.
    Requirements:
    - 3+ years experience with Python, PySpark, AWS, and LLM benchmarking.
    """

    # 1. Real resume tailoring via extension endpoint
    tailor_res = client.post(
        "/api/v3/extension/tailor",
        json={
            "resume_id": "primary",
            "job_description": jd,
            "job_title": "AI Engineer - Quality system",
            "company_name": "Bristol-Myers Squibb"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert tailor_res.status_code == 200, tailor_res.text
    tailor_data = tailor_res.json()
    assert "review_id" in tailor_data
    assert "suggestions" in tailor_data
    assert len(tailor_data["suggestions"]) > 0

    # 2. Real match evaluation via extension endpoint
    match_res = client.post(
        "/api/v3/extension/match",
        json={
            "resume_id": "primary",
            "job_description": jd
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert match_res.status_code == 200, match_res.text
    match_data = match_res.json()
    assert "overall_score" in match_data
    assert isinstance(match_data["overall_score"], (int, float))

