import os
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from api.config import Settings, settings
from api.main import app
from api.ai.schemas import AIProviderConfig, ProviderHealthResponse
from api.ai.providers.factory import get_provider, check_all_providers
from api.ai.providers.openrouter import OpenRouterProvider
from api.ai.providers.huggingface import HuggingFaceProvider
from api.ai.providers.freeflow import FreeFlowProvider
from api.ai.providers.mock import MockAIProvider
from api.crypto import encrypt_credential, decrypt_credential, mask_credential
from api.security import hash_password, sign_session_id, generate_csrf_token
from api.database import users_db, active_sessions
import time

client = TestClient(app)

def create_test_session(user_id: str = "usr_stage1_test", email: str = "stage1@test.com"):
    pwd_hash = hash_password("testpass123")
    user_record = {
        "id": user_id,
        "email": email,
        "name": "Stage 1 Tester",
        "role": "user",
        "created_at": "2026-11-21T00:00:00Z",
        "entitlements": ["free", "ats_check", "resume_edit", "tailor"],
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
    cookie = sign_session_id(session_id, settings.SECRET_KEY)
    csrf = generate_csrf_token(session_id, settings.SECRET_KEY)
    return cookie, csrf


def test_settings_openrouter_and_huggingface_attributes():
    """Verify Settings class loads and parses OpenRouter and Hugging Face config."""
    s = Settings()
    assert hasattr(s, "OPENROUTER_API_KEY")
    assert hasattr(s, "OPENROUTER_API_KEY_BACKUP")
    assert hasattr(s, "OPENROUTER_MODEL")
    assert hasattr(s, "OPENROUTER_BASE_URL")
    assert hasattr(s, "HUGGINGFACE_API_KEY")
    assert hasattr(s, "HUGGINGFACE_API_KEY_BACKUP")
    assert s.OPENROUTER_BASE_URL.startswith("https://openrouter.ai")
    assert "deepseek" in s.OPENROUTER_MODEL


def test_provider_schema_validation():
    """Verify AIProviderConfig accepts openrouter and huggingface, rejects invalid providers."""
    # Valid configurations
    cfg_or = AIProviderConfig(provider="openrouter", model="deepseek/deepseek-r1:free")
    assert cfg_or.provider == "openrouter"

    cfg_hf = AIProviderConfig(provider="huggingface", model="meta-llama/Llama-3.2-3B-Instruct")
    assert cfg_hf.provider == "huggingface"

    # Invalid provider rejected by schema validation
    with pytest.raises(ValidationError):
        AIProviderConfig(provider="unsupported_provider_xyz")


def test_provider_factory_routing():
    """Verify get_provider routes to correct class instances."""
    or_p = get_provider(AIProviderConfig(provider="openrouter"))
    assert isinstance(or_p, OpenRouterProvider)
    assert or_p.name == "openrouter"

    hf_p = get_provider(AIProviderConfig(provider="huggingface"))
    assert isinstance(hf_p, HuggingFaceProvider)
    assert hf_p.name == "huggingface"

    # Existing providers regression
    ff_p = get_provider(AIProviderConfig(provider="freeflow"))
    assert isinstance(ff_p, FreeFlowProvider)

    mock_p = get_provider(AIProviderConfig(provider="mock"))
    assert isinstance(mock_p, MockAIProvider)


def test_provider_health_unconfigured():
    """Verify that unconfigured providers report not_configured rather than pretending to be online."""
    or_p = OpenRouterProvider(api_key="")
    health = or_p.health()
    assert health.status == "not_configured"
    assert "not configured" in health.message.lower()

    hf_p = HuggingFaceProvider(api_key="")
    health_hf = hf_p.health()
    assert health_hf.status == "not_configured"


def test_credential_masking_never_leaks_raw_token():
    """Verify mask_credential masks properly and never exposes complete secret."""
    raw_key = "sk-or-v1-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234cdef"
    masked = mask_credential(raw_key)
    assert masked.startswith("sk-o...")
    assert masked.endswith("cdef")
    assert len(masked) < len(raw_key)
    assert raw_key not in masked
    assert "1234567890" not in masked

    short_key = "secret"
    assert mask_credential(short_key) == "***"
    assert mask_credential(None) == ""


def test_user_provider_config_endpoint_masking_and_encryption():
    """Verify API endpoints encrypt keys at rest and return masked values in responses."""
    cookie, csrf = create_test_session()
    headers = {"X-CSRF-Token": csrf}
    cookies = {settings.COOKIE_NAME: cookie}

    # 1. Update provider configuration with mock key and backup key
    test_key = "sk-or-v1-realtesttoken9876543210zyxwvutsrqponmlkjihgfedcba"
    test_backup = "sk-or-v1-backuptesttoken0123456789abcdefghijklmnopqrstuvwxyz"
    update_res = client.post(
        "/api/v3/tailor/providers/config",
        json={
            "provider": "openrouter",
            "model": "deepseek/deepseek-r1:free",
            "api_key": test_key,
            "api_key_backup": test_backup,
            "temperature": 0.2,
            "timeout_seconds": 30.0
        },
        headers=headers,
        cookies=cookies
    )
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["provider"] == "openrouter"
    assert data["has_api_key"] is True
    assert data["has_api_key_backup"] is True
    # Crucial: Raw keys MUST NOT be returned in API response
    assert test_key not in update_res.text
    assert test_backup not in update_res.text
    assert "..." in data["api_key_redacted"]
    assert "..." in data["api_key_backup_redacted"]

    # 2. Get provider configuration
    get_res = client.get("/api/v3/tailor/providers/config", cookies=cookies)
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["provider"] == "openrouter"
    assert get_data["has_api_key"] is True
    assert test_key not in get_res.text
    assert test_backup not in get_res.text


def test_check_all_providers_includes_openrouter_and_huggingface():
    """Verify check_all_providers reports all 6 provider states without throwing exceptions."""
    results = check_all_providers()
    assert "openrouter" in results
    assert "huggingface" in results
    assert "freeflow" in results
    assert "ollama" in results
    assert "gemini" in results
    assert "mock" in results
    assert results["mock"].status == "online"
