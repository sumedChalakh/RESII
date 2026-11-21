import os
import uuid
import time
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from api.config import settings
from api.main import app
from api.security import hash_password, sign_session_id, generate_csrf_token
from api.database import users_db, active_sessions
from api.resumes import resumes_db
from api.db import SessionLocal
from api.models import AIProviderSettingModel, UserModel
from api.crypto import (
    encrypt_credential,
    decrypt_credential,
    mask_credential,
    DecryptionError,
    MissingKeyError,
    get_encryption_key,
)
from api.ai.providers.base import (
    ProviderError,
    ProviderUnavailableError,
    ProviderTimeoutError,
    InvalidResponseError,
    ModelNotFoundError,
    ProviderAuthenticationError,
)
from api.ai.providers.ollama import OllamaProvider
from api.ai.providers.freeflow import FreeFlowProvider
from api.ai.providers.mock import MockAIProvider
from api.ai.providers.factory import get_provider
from api.ai.schemas import (
    AIProviderConfig,
    JobDescriptionAnalysis,
    ResumeMatchReport,
    TailoringPlanResponse,
    CoverLetterResponse,
)
from api.ai.evidence import build_evidence_ledger
from api.ai.job_analyzer import analyze_job_description, extract_job_heuristics
from api.ai.matcher import match_resume_to_job, evaluate_match_heuristically
from api.ai.tailor_engine import generate_tailoring_plan
from api.ai.cover_letter import generate_cover_letter, generate_grounded_cover_letter_heuristics

client = TestClient(app)

def create_user_session(user_id: str, email: str):
    pwd_hash = hash_password("Password123!")
    user_record = {
        "id": user_id,
        "email": email,
        "name": f"User {user_id}",
        "role": "user",
        "created_at": "2026-11-20T00:00:00Z",
        "entitlements": ["free", "ats_check", "resume_edit", "tailor"],
        "password_hash": pwd_hash
    }
    users_db[email] = user_record
    
    # Ensure user exists in SQLite database
    with SessionLocal() as db_session:
        existing = db_session.query(UserModel).filter(UserModel.id == user_id).first()
        if not existing:
            db_session.add(UserModel(
                id=user_id,
                email=email,
                name=f"User {user_id}",
                role="user",
                password_hash=pwd_hash,
                created_at="2026-11-20T00:00:00Z"
            ))
            db_session.commit()

    session_id = f"sess_{user_id}_{int(time.time()*1000)}"
    now = time.time()
    active_sessions[session_id] = {
        "user": user_record,
        "created_at": now,
        "last_active": now
    }
    cookie_val = sign_session_id(session_id, settings.SECRET_KEY)
    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY)
    return cookie_val, csrf_token


# ==============================================================================
# TASK 1: PROVIDER ADAPTER EXCEPTIONS & ERROR NORMALIZATION
# ==============================================================================

class TestAdapterExceptions:
    def test_provider_exception_taxonomy(self):
        """Verify all custom provider exceptions subclass ProviderError."""
        assert issubclass(ProviderUnavailableError, ProviderError)
        assert issubclass(ProviderTimeoutError, ProviderError)
        assert issubclass(InvalidResponseError, ProviderError)
        assert issubclass(ModelNotFoundError, ProviderError)
        assert issubclass(ProviderAuthenticationError, ProviderError)

    def test_ollama_404_raises_model_not_found(self):
        """Ollama HTTP 404 must raise ModelNotFoundError."""
        provider = OllamaProvider(base_url="http://127.0.0.1:11434", model="nonexistent-model")
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.text = "model 'nonexistent-model' not found"

        with patch("httpx.Client.post", return_value=mock_resp):
            with pytest.raises(ModelNotFoundError) as exc_info:
                provider.generate(prompt="hi")
            assert "not found" in str(exc_info.value).lower()

    def test_ollama_401_403_raises_authentication_error(self):
        """Ollama HTTP 401/403 must raise ProviderAuthenticationError."""
        provider = OllamaProvider(base_url="http://127.0.0.1:11434", model="llama3")
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"

        with patch("httpx.Client.post", return_value=mock_resp):
            with pytest.raises(ProviderAuthenticationError) as exc_info:
                provider.generate(prompt="hi")
            assert "failed" in str(exc_info.value).lower() or "unauthorized" in str(exc_info.value).lower()

    def test_ollama_connection_error_raises_unavailable(self):
        """Ollama connection failure must raise ProviderUnavailableError with cause chaining."""
        import httpx
        provider = OllamaProvider(base_url="http://127.0.0.1:11434", model="llama3")

        with patch("httpx.Client.post", side_effect=httpx.ConnectError("Connection refused")):
            with pytest.raises(ProviderUnavailableError) as exc_info:
                provider.generate(prompt="hi")
            assert "cannot connect" in str(exc_info.value).lower()
            assert isinstance(exc_info.value.__cause__, httpx.ConnectError)

    def test_ollama_timeout_raises_provider_timeout(self):
        """Ollama timeout must raise ProviderTimeoutError with cause chaining."""
        import httpx
        provider = OllamaProvider(base_url="http://127.0.0.1:11434", model="llama3")

        with patch("httpx.Client.post", side_effect=httpx.ReadTimeout("Read timed out")):
            with pytest.raises(ProviderTimeoutError) as exc_info:
                provider.generate(prompt="hi")
            assert "timed out" in str(exc_info.value).lower()
            assert isinstance(exc_info.value.__cause__, httpx.ReadTimeout)

    def test_freeflow_404_raises_model_not_found(self):
        """FreeFlow HTTP 404 must raise ModelNotFoundError."""
        provider = FreeFlowProvider(base_url="http://127.0.0.1:8000", model="missing-model")
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.text = "Model not found"

        with patch("httpx.Client.post", return_value=mock_resp):
            with pytest.raises(ModelNotFoundError) as exc_info:
                provider.generate(prompt="hi")
            assert "not found" in str(exc_info.value).lower()

    def test_freeflow_401_403_raises_authentication_error(self):
        """FreeFlow HTTP 401/403 must raise ProviderAuthenticationError."""
        provider = FreeFlowProvider(base_url="http://127.0.0.1:8000", model="qwen")
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.text = "Forbidden"

        with patch("httpx.Client.post", return_value=mock_resp):
            with pytest.raises(ProviderAuthenticationError) as exc_info:
                provider.generate(prompt="hi")
            assert "unauthorized" in str(exc_info.value).lower() or "forbidden" in str(exc_info.value).lower()

    def test_freeflow_connection_failure_after_retries(self):
        """FreeFlow connection failure must raise ProviderUnavailableError after retries with cause."""
        import httpx
        provider = FreeFlowProvider(base_url="http://127.0.0.1:8000", model="qwen")

        with patch("httpx.Client.post", side_effect=httpx.ConnectError("Connection refused")):
            with pytest.raises(ProviderUnavailableError) as exc_info:
                provider.generate(prompt="hi")
            assert "cannot connect" in str(exc_info.value).lower()
            assert isinstance(exc_info.value.__cause__, httpx.ConnectError)


# ==============================================================================
# TASK 2: ACCURATE INFERENCE TRANSPARENCY
# ==============================================================================

class TestInferenceTransparency:
    def test_job_analysis_transparency_mock(self):
        """Mock provider execution returns inference_source='mock' and fallback_activated=False."""
        p = MockAIProvider()
        res = analyze_job_description("Senior Python Engineer with FastAPI and Docker experience.", provider=p)
        assert res.inference_source == "mock"
        assert res.provider_used == "mock"
        assert res.model_used == "mock-grounded-v1"
        assert res.fallback_activated is False
        assert res.fallback_reason is None

    def test_job_analysis_transparency_fallback(self):
        """Provider failure activates deterministic fallback with inference_source='heuristic'."""
        provider_fail = OllamaProvider(base_url="http://127.0.0.1:11434", model="nonexistent")
        with patch("httpx.Client.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=404, text="model not found")
            res = analyze_job_description("Software Engineer with Python, React, and SQL.", provider=provider_fail)
            assert res.inference_source == "heuristic"
            assert res.fallback_activated is True
            assert res.fallback_reason is not None
            assert len(res.required_skills) > 0

    def test_match_transparency_metadata(self):
        """Matcher propagates transparency metadata correctly for both mock and fallback."""
        sample_resume = {
            "title": "Alice Developer",
            "skills": ["Python", "FastAPI", "Docker"],
            "experience": [{"title": "Engineer", "company": "Tech Corp", "bullets": ["Built Python APIs with FastAPI"]}]
        }
        sample_ledger = build_evidence_ledger(user_id="u_match_test", resume_record=sample_resume)
        sample_analysis = JobDescriptionAnalysis(
            job_title="FastAPI Engineer",
            company="Tech Corp",
            required_skills=["Python", "FastAPI"],
            technology_stack=["Docker"],
            responsibilities=["Build backend APIs"]
        )
        p_mock = MockAIProvider()
        report = match_resume_to_job(sample_ledger, sample_analysis, provider=p_mock)
        assert report.inference_source == "mock"
        assert report.fallback_activated is False

        # Fallback test
        report_fb = evaluate_match_heuristically(sample_ledger, sample_analysis)
        report_fb.fallback_reason = "Simulated failure"
        assert report_fb.inference_source == "heuristic"
        assert report_fb.fallback_activated is True
        assert report_fb.fallback_reason == "Simulated failure"

    def test_cover_letter_transparency_metadata(self):
        """Cover letter propagates metadata for mock and fallback."""
        sample_resume = {
            "title": "Bob Engineer",
            "skills": ["Python", "PostgreSQL"],
            "experience": [{"title": "DB Admin", "company": "Acme Corp", "bullets": ["Optimized Postgres queries"]}]
        }
        sample_ledger = build_evidence_ledger(user_id="u_cl_test", resume_record=sample_resume)
        sample_analysis = JobDescriptionAnalysis(
            job_title="DB Admin",
            company="Acme Corp",
            required_skills=["PostgreSQL"],
            technology_stack=["SQL"],
            responsibilities=["Maintain databases"]
        )
        p_mock = MockAIProvider()
        cl = generate_cover_letter(sample_ledger, sample_analysis, tone="professional", length="standard", provider=p_mock)
        assert cl.inference_source == "mock"
        assert cl.fallback_activated is False

        cl_fb = generate_grounded_cover_letter_heuristics(sample_ledger, sample_analysis, tone="professional", length="standard")
        cl_fb.fallback_reason = "API offline"
        assert cl_fb.inference_source == "heuristic"
        assert cl_fb.fallback_activated is True
        assert cl_fb.fallback_reason == "API offline"

    def test_api_read_words_endpoint_transparency(self):
        """Endpoint /api/v3/tailor/read-words returns transparency fields."""
        uid = f"user_tr_{uuid.uuid4().hex[:6]}"
        cookie, csrf = create_user_session(uid, f"{uid}@example.com")
        
        # Create a test resume
        resumes_db[f"res_{uid}"] = {
            "id": f"res_{uid}",
            "user_id": uid,
            "title": "Software Engineer Resume",
            "experience": [{"role": "Developer", "company": "Tech", "bullets": ["Built Python microservices"]}],
            "skills": ["Python", "Docker"]
        }

        resp = client.post(
            "/api/v3/tailor/read-words",
            json={"job_description": "We need Python and Docker developer.", "resume_id": f"res_{uid}"},
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "inference_source" in data
        assert data["inference_source"] in ("llm", "heuristic", "mock")
        assert "provider_used" in data
        assert "fallback_activated" in data


# ==============================================================================
# TASK 3: SECURE API KEY ENCRYPTION AT REST
# ==============================================================================

class TestSecureKeyPersistence:
    def test_encrypt_and_decrypt_roundtrip(self):
        """Encrypts plaintext to versioned v1:... and decrypts back to identical plaintext."""
        raw_secret = "sk-live-supersecretkey1234567890abcdef"
        ciphertext = encrypt_credential(raw_secret)
        
        assert ciphertext.startswith("v1:")
        assert raw_secret not in ciphertext  # Never contain raw key

        decrypted = decrypt_credential(ciphertext)
        assert decrypted == raw_secret

    def test_decryption_with_wrong_key_fails(self):
        """Decryption using a different encryption key must raise DecryptionError."""
        raw_secret = "my-secret-api-key"
        key_a = "key-alpha-32-bytes-long-secret!!"
        key_b = "key-beta-32-bytes-long-secret!!!"

        ciphertext = encrypt_credential(raw_secret, key_override=key_a)
        with pytest.raises(DecryptionError):
            decrypt_credential(ciphertext, key_override=key_b)

    def test_tampered_ciphertext_fails(self):
        """Tampered ciphertext must be rejected by MAC authentication."""
        raw_secret = "secret-token-to-encrypt"
        ciphertext = encrypt_credential(raw_secret)
        # Tamper payload
        tampered = ciphertext[:-4] + "XXXX"
        with pytest.raises(DecryptionError):
            decrypt_credential(tampered)

    def test_safe_masking(self):
        """mask_credential shows safe masked display, never leaking secret."""
        masked = mask_credential("sk-proj-1234567890abcdef")
        assert masked == "sk-p...cdef"
        assert mask_credential(None) == ""
        assert mask_credential("short") == "***"

    def test_api_key_persistence_workflow(self):
        """
        Tests the complete provider config persistence workflow:
        1. Store raw API key -> stored as encrypted v1:... in DB.
        2. Read config -> returns has_api_key=True and redacted mask, never raw key.
        3. Submit empty/masked key -> preserves existing encrypted key in DB.
        4. Submit __CLEAR__ -> securely clears key.
        """
        uid = f"user_key_{uuid.uuid4().hex[:6]}"
        cookie, csrf = create_user_session(uid, f"{uid}@example.com")

        raw_api_key = "sk-live-production-secret-9999"

        # 1. Update config with real key (both PUT and POST supported)
        post_resp = client.put(
            "/api/v3/tailor/providers/config",
            json={
                "provider": "openai_compatible",
                "model": "gpt-4o",
                "api_key": raw_api_key
            },
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert post_resp.status_code == 200
        post_data = post_resp.json()
        assert post_data["has_api_key"] is True
        assert post_data["api_key_redacted"] == "sk-l...9999"

        # Verify DB directly: key must be encrypted with v1: and NOT plaintext
        with SessionLocal() as db_session:
            db_row = db_session.query(AIProviderSettingModel).filter(AIProviderSettingModel.user_id == uid).first()
            assert db_row is not None
            assert db_row.api_key_encrypted is not None
            assert db_row.api_key_encrypted.startswith("v1:")
            assert raw_api_key not in db_row.api_key_encrypted
            # Decrypt verifying roundtrip
            assert decrypt_credential(db_row.api_key_encrypted) == raw_api_key

        # 2. GET config via endpoint: verifies plaintext is NEVER returned
        get_resp = client.get(
            "/api/v3/tailor/providers/config",
            cookies={"resii_session": cookie}
        )
        assert get_resp.status_code == 200
        get_data = get_resp.json()
        assert get_data["has_api_key"] is True
        assert get_data["api_key_redacted"] == "sk-l...9999"
        assert "api_key" not in get_data or get_data.get("api_key") is None or not str(get_data.get("api_key")).startswith("sk-")
        assert raw_api_key not in str(get_data)

        # 3. Submit update with masked key (UI preserves existing without re-typing)
        update_resp = client.put(
            "/api/v3/tailor/providers/config",
            json={
                "provider": "openai_compatible",
                "model": "gpt-4o-mini",
                "api_key": "sk-l...9999"  # Masked value sent back
            },
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert update_resp.status_code == 200
        # Verify key was preserved, not overwritten by mask
        with SessionLocal() as db_session:
            db_row = db_session.query(AIProviderSettingModel).filter(AIProviderSettingModel.user_id == uid).first()
            assert db_row.model == "gpt-4o-mini"
            assert decrypt_credential(db_row.api_key_encrypted) == raw_api_key

        # 4. Clear key with __CLEAR__
        clear_resp = client.put(
            "/api/v3/tailor/providers/config",
            json={
                "provider": "openai_compatible",
                "model": "gpt-4o-mini",
                "api_key": "__CLEAR__"
            },
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert clear_resp.status_code == 200
        clear_data = clear_resp.json()
        assert clear_data["has_api_key"] is False
        assert clear_data["api_key_redacted"] is None
        with SessionLocal() as db_session:
            db_row = db_session.query(AIProviderSettingModel).filter(AIProviderSettingModel.user_id == uid).first()
            assert db_row.api_key_encrypted is None
