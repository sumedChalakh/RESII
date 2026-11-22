import pytest
import os
import time
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from api.main import app
from api.config import settings
from api.db import SessionLocal
from api.models import (
    UserModel,
    ResumeModel,
    JobApplicationModel,
    CandidateFactsModel,
    UserBillingModel,
    UserSeasonModel,
    PublicCheckModel
)
from api.security import sign_session_id, generate_csrf_token, hash_password
from api.ai.providers.factory import get_provider, check_all_providers
from api.ai.providers.huggingface import HuggingFaceProvider
from api.ai.providers.base import ProviderUnavailableError, ProviderAuthenticationError
from api.ai.schemas import AIProviderConfig

client = TestClient(app)

def _create_test_auth_headers(user_id: str, email: str, role: str = "user"):
    sess_id = f"sess_test_{user_id}_{int(time.time()*1000)}"
    from api.database import active_sessions
    active_sessions[sess_id] = {
        "user": {
            "id": user_id,
            "email": email,
            "name": "Test Candidate",
            "role": role,
            "entitlements": ["free", "ats_check"]
        },
        "created_at": time.time(),
        "last_active": time.time()
    }
    signed_cookie = sign_session_id(sess_id, settings.SECRET_KEY)
    csrf_tok = generate_csrf_token(sess_id, settings.SECRET_KEY)
    return {
        "Cookie": f"{settings.COOKIE_NAME}={signed_cookie}",
        "X-CSRF-Token": csrf_tok
    }

# =====================================================================
# 1. AI PROVIDER TRUTHFULNESS & HUGGING FACE INFERENCE
# =====================================================================

def test_ai_provider_no_silent_mock_fallback_for_unknown():
    """Unrecognized or unconfigured AI provider must raise ProviderUnavailableError rather than silent mock fallback."""
    with patch.dict(os.environ, {"LLM_PROVIDER": "unknown_llm_provider_xyz"}):
        with pytest.raises(ProviderUnavailableError) as excinfo:
            get_provider(None)
        assert "not supported or recognized" in str(excinfo.value)

def test_ai_provider_mock_prohibited_in_production():
    """Requesting mock provider under production environment must fail."""
    with patch.object(settings, "ENVIRONMENT", "production"):
        config = AIProviderConfig(provider="mock")
        with pytest.raises(ProviderUnavailableError) as excinfo:
            get_provider(config)
        assert "strictly prohibited in production" in str(excinfo.value)

def test_huggingface_provider_health_check_truthful():
    """HuggingFaceProvider reports not_configured when no key is set, never false positive."""
    hf = HuggingFaceProvider(api_key="")
    h = hf.health()
    assert h.status == "not_configured"
    assert "HUGGINGFACE_API_KEY is not configured" in h.message

def test_huggingface_provider_live_generate():
    """HuggingFaceProvider parses serverless inference response properly."""
    hf = HuggingFaceProvider(api_key="hf_test_dummy_key", model="meta-llama/Llama-3.2-3B-Instruct")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = [{"generated_text": "Tailored engineering bullet point."}]

    with patch("httpx.Client.post", return_value=mock_resp):
        res = hf.generate("Rewrite this bullet")
        assert res == "Tailored engineering bullet point."

# =====================================================================
# 2. AUTO-APPLY CANDIDATE ASSISTANCE & FACT VAULT
# =====================================================================

def test_auto_apply_trigger_truthful_assisted_mode():
    """Triggering auto-apply returns assisted mode status rather than fake autonomous submission."""
    headers = _create_test_auth_headers("usr_trans_01", "cand1@resii.dev")
    r = client.post("/api/auto-apply/trigger", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] in ("assisted_mode_active", "dispatched")
    assert data["extension_assisted"] is True
    assert "Autonomous unattended submission is disabled" in data["message"]

def test_auto_apply_facts_vault_isolated_by_user():
    """Candidate facts vault is persistently stored and isolated by user ID."""
    headers = _create_test_auth_headers("usr_trans_02", "cand2@resii.dev")
    r_put = client.put("/api/auto-apply/facts", headers=headers, json={
        "facts": {"work_authorization": "US Citizen", "years_of_experience": "7 years"}
    })
    assert r_put.status_code == 200

    r_get = client.get("/api/auto-apply/facts", headers=headers)
    assert r_get.status_code == 200
    facts = r_get.json()["facts"]
    assert facts.get("work_authorization") == "US Citizen"
    assert facts.get("years_of_experience") == "7 years"

# =====================================================================
# 3. BILLING & SUBSCRIPTIONS
# =====================================================================

def test_billing_checkout_disabled_when_stripe_unconfigured():
    """POST /api/billing/checkout returns 503 Service Unavailable when STRIPE_SECRET_KEY is unconfigured in production."""
    with patch.dict(os.environ, {}, clear=False), patch.object(settings, "ENVIRONMENT", "production"):
        if "STRIPE_SECRET_KEY" in os.environ:
            del os.environ["STRIPE_SECRET_KEY"]
        headers = _create_test_auth_headers("usr_trans_03", "cand3@resii.dev")
        r = client.post("/api/billing/checkout", headers=headers, json={"tier": "pro"})
        assert r.status_code == 503
        assert "STRIPE_SECRET_KEY" in r.json()["detail"]

def test_billing_entitlements_default_free_tier():
    """Candidate without active subscription receives default free tier with zero fake credit cards."""
    headers = _create_test_auth_headers("usr_trans_04", "cand4@resii.dev")
    r = client.get("/api/billing/entitlements", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["tier"] == "free"
    assert data["payment_method"] == "None"

# =====================================================================
# 4. GOOGLE DRIVE & GOOGLE DOCS TRUTHFUL INTEGRATION
# =====================================================================

def test_google_docs_status_unconfigured():
    """GET /api/v3/resumes/{id}/google-docs returns unconfigured status when Google OAuth credentials missing."""
    with patch.dict(os.environ, {}, clear=False):
        if "GOOGLE_CLIENT_ID" in os.environ:
            del os.environ["GOOGLE_CLIENT_ID"]
        headers = _create_test_auth_headers("usr_trans_05", "cand5@resii.dev")
        r = client.get("/api/v3/resumes/primary/google-docs", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["connected"] is False
        assert data["status"] == "unconfigured"
        assert data["google_doc_id"] is None
        assert "download_docx_url" in data

def test_google_drive_connect_fails_truthfully_when_unconfigured():
    """POST /api/account/google-drive/connect fails with 503 when Google OAuth credentials missing."""
    with patch.dict(os.environ, {}, clear=False):
        if "GOOGLE_CLIENT_ID" in os.environ:
            del os.environ["GOOGLE_CLIENT_ID"]
        headers = _create_test_auth_headers("usr_trans_06", "cand6@resii.dev")
        r = client.post("/api/account/google-drive/connect", headers=headers)
        assert r.status_code == 503
        assert "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" in r.json()["detail"]

# =====================================================================
# 5. GROUNDED GAMIFICATION & SEASON ANALYTICS
# =====================================================================

def test_season_goal_derived_from_actual_database_records():
    """Season XP and level are computed strictly from real applications and tailored resumes in database."""
    import uuid
    uid = f"usr_trans_{uuid.uuid4().hex[:8]}"
    headers = _create_test_auth_headers(uid, f"{uid}@resii.dev")

    with SessionLocal() as db:
        # Create 2 job applications for this candidate
        app1 = JobApplicationModel(
            id=f"app_test_{uuid.uuid4().hex[:8]}",
            user_id=uid,
            title="Backend Lead",
            company="Acme Corp",
            stage="applied",
            match_percentage=90,
            created_at="2026-11-21T00:00:00Z"
        )
        app2 = JobApplicationModel(
            id=f"app_test_{uuid.uuid4().hex[:8]}",
            user_id=uid,
            title="Senior Architect",
            company="Tech Corp",
            stage="interview",
            match_percentage=95,
            created_at="2026-11-21T01:00:00Z"
        )
        db.add_all([app1, app2])
        db.commit()

    r = client.get("/api/season/goal", headers=headers)
    assert r.status_code == 200
    data = r.json()
    metrics = data["verified_metrics"]
    assert metrics["total_applications"] >= 2
    assert metrics["interviews_scheduled"] >= 1
    # Check that XP is calculated
    assert data["current_xp"] > 0
    assert data["current_level"] >= 1

def test_season_leaderboard_no_fake_competitors():
    """Leaderboard returns only truthful participant progress without fake names."""
    headers = _create_test_auth_headers("usr_trans_08", "cand8@resii.dev")
    r = client.get("/api/season/elsewhere", headers=headers)
    assert r.status_code == 200
    data = r.json()
    names = [entry["name"] for entry in data["leaderboard"]]
    assert "Elena R." not in names
    assert "Marcus K." not in names

# =====================================================================
# 6. REAL PUBLIC ATS CHECK
# =====================================================================

def test_public_check_with_real_text_computes_metrics():
    """POST /public/checks parses input text, detects action verbs and metrics dynamically."""
    sample_resume = (
        "Experienced software developer.\n"
        "Engineered scalable microservices, reducing latency by 40% across 5M daily queries.\n"
        "Spearheaded PostgreSQL database optimization and built Kafka event streaming.\n"
    )
    r = client.post("/public/checks", json={"filename": "my_resume.txt", "text": sample_resume})
    assert r.status_code == 200
    data = r.json()
    assert "chk_" in data["id"]
    assert data["ats_score"] >= 80
    categories = [f["category"] for f in data["findings"]]
    assert "Impact & Metrics" in categories
    assert "Action Verb Strength" in categories

# =====================================================================
# 7. HEALTH CHECK ENHANCEMENT
# =====================================================================

def test_health_check_endpoint():
    """GET /api/health returns database online and storage writable status."""
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert data["checks"]["database"] == "online"
    assert data["checks"]["storage"] == "writable"
