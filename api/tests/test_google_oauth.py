import pytest
import time
import uuid
import datetime
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from api.main import app
from api.config import settings
from api.db import SessionLocal
from api.models import (
    UserModel,
    UserProfileModel,
    UserPreferenceModel,
    UserSeasonModel,
    UserBillingModel,
    OAuthAccountModel,
)
from api.google_auth import (
    _store_oauth_state,
    _verify_and_consume_state,
    _oauth_states,
    _purge_expired_states,
)
from api.security import hash_password, sign_session_id, generate_csrf_token

client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup_oauth_data():
    """Clean up state dictionary and any test OAuth users before and after test."""
    _oauth_states.clear()
    yield
    _oauth_states.clear()
    with SessionLocal() as db:
        test_users = db.query(UserModel).filter(UserModel.email.like("%test_oauth%")).all()
        for u in test_users:
            db.query(OAuthAccountModel).filter(OAuthAccountModel.user_id == u.id).delete()
            db.query(UserProfileModel).filter(UserProfileModel.user_id == u.id).delete()
            db.query(UserPreferenceModel).filter(UserPreferenceModel.user_id == u.id).delete()
            db.query(UserSeasonModel).filter(UserSeasonModel.user_id == u.id).delete()
            db.query(UserBillingModel).filter(UserBillingModel.user_id == u.id).delete()
            db.delete(u)
        db.commit()


# =====================================================================
# 1. Configuration & Enabled Providers Tests
# =====================================================================

def test_google_oauth_endpoint_not_configured():
    """When GOOGLE_CLIENT_ID or SECRET is unset, /api/v3/auth/google returns 503."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", None), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", None):
        resp = client.get("/api/v3/auth/google", follow_redirects=False)
        assert resp.status_code == 503
        assert "not configured" in resp.json()["detail"].lower()


def test_enabled_providers_reflects_google_status():
    """Verify /api/auth/enabled-providers dynamically includes 'google' when configured."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", "mock-client-id"), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", "mock-secret"):
        resp = client.get("/api/auth/enabled-providers")
        assert resp.status_code == 200
        providers = resp.json()["providers"]
        assert "google" in providers
        assert "email" in providers


# =====================================================================
# 2. Authorization URL & CSRF State Generation
# =====================================================================

def test_google_auth_redirects_with_secure_state():
    """Calling /api/v3/auth/google initiates OAuth flow with signed state cookie."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", "test-client-id-123"), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret-456"), \
         patch.object(settings, "GOOGLE_REDIRECT_URI", "http://localhost:8100/api/v3/auth/google/callback"):
        
        resp = client.get("/api/v3/auth/google", follow_redirects=False)
        assert resp.status_code == 302
        location = resp.headers.get("location")
        assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")
        assert "client_id=test-client-id-123" in location
        assert "openid" in location
        assert "response_type=code" in location
        assert "state=" in location
        assert "nonce=" in location

        # Verify resii_oauth_state cookie was set
        assert "resii_oauth_state" in resp.cookies


# =====================================================================
# 3. State Management & CSRF Attack Prevention
# =====================================================================

def test_state_storage_ttl_and_expiry():
    """Verify state stores, consumes, and replay protection works."""
    state = "test_custom_state_123"
    nonce = "test_custom_nonce_456"
    _store_oauth_state(state, nonce)
    
    consumed = _verify_and_consume_state(state)
    assert consumed is not None
    assert consumed["nonce"] == nonce

    # Replay protection: cannot consume twice
    consumed_again = _verify_and_consume_state(state)
    assert consumed_again is None

    # Test TTL purge
    old_state = "test_expired_state"
    _oauth_states[old_state] = {
        "nonce": "old_nonce",
        "created_at": time.time() - 700,
        "redirect_url": "/dashboard"
    }
    _purge_expired_states()
    assert old_state not in _oauth_states


def test_callback_rejects_missing_state():
    """Callback rejects requests without state parameter."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", "test-client"), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-secret"):
        resp = client.get("/api/v3/auth/google/callback?code=mock-code&format=json")
        assert resp.status_code == 400
        assert "Missing OAuth state" in resp.json()["detail"]


def test_callback_rejects_tampered_state_cookie():
    """Callback rejects CSRF attacks with mismatched/forged state cookie."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", "test-client"), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-secret"):
        
        client.cookies.set("resii_oauth_state", "forged_unsigned_cookie")
        resp = client.get("/api/v3/auth/google/callback?code=mock-code&state=fake_state&format=json")
        assert resp.status_code == 400
        assert "OAuth state parameter" in resp.json()["detail"]


def test_callback_handles_user_cancellation():
    """When user cancels Google prompt (error=access_denied), redirect gracefully to login."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", "test-client"), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-secret"):
        resp = client.get("/api/v3/auth/google/callback?error=access_denied", follow_redirects=False)
        assert resp.status_code == 302
        location = resp.headers.get("location")
        assert "error=google_cancelled" in location or "access_denied" in location


# =====================================================================
# 4. Token Exchange & User Provisioning Flow
# =====================================================================

def test_callback_registration_for_new_user():
    """Simulate successful Google OAuth login for a brand-new candidate."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", "test-client-id"), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret"), \
         patch.object(settings, "GOOGLE_REDIRECT_URI", "http://localhost:8100/api/v3/auth/google/callback"):
        
        # 1. Initiate OAuth
        init_resp = client.get("/api/v3/auth/google", follow_redirects=False)
        assert init_resp.status_code == 302
        state_cookie = init_resp.cookies.get("resii_oauth_state")

        # Extract state from redirect location
        location = init_resp.headers["location"]
        state_param = [p.split("=")[1] for p in location.split("?")[1].split("&") if p.startswith("state=")][0]

        # 2. Mock token endpoint and verify_oauth2_token
        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.headers = {"content-type": "application/json"}
        mock_token_resp.json.return_value = {
            "access_token": "mock-access-token",
            "id_token": "mock-id-token",
            "token_type": "Bearer",
            "expires_in": 3600
        }

        mock_id_info = {
            "sub": "google-user-id-9999",
            "email": "test_oauth_newuser@example.com",
            "email_verified": True,
            "name": "Sarah Connor",
            "picture": "https://example.com/avatar.jpg",
            "iss": "https://accounts.google.com",
            "aud": "test-client-id"
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp), \
             patch("api.google_auth.google_id_token.verify_oauth2_token", return_value=mock_id_info):
            
            client.cookies.set("resii_oauth_state", state_cookie)
            cb_resp = client.get(
                f"/api/v3/auth/google/callback?code=mock-auth-code&state={state_param}&format=json"
            )
            assert cb_resp.status_code == 200
            data = cb_resp.json()
            assert data["status"] == "success"
            assert data["user"]["email"] == "test_oauth_newuser@example.com"
            assert data["user"]["name"] == "Sarah Connor"

            # Check that cookies were issued
            assert settings.COOKIE_NAME in cb_resp.cookies
            assert "resii_csrf" in cb_resp.cookies

            # Verify in DB
            with SessionLocal() as db:
                user = db.query(UserModel).filter(UserModel.email == "test_oauth_newuser@example.com").first()
                assert user is not None
                assert user.name == "Sarah Connor"
                assert user.role == "user"

                oauth_acc = db.query(OAuthAccountModel).filter(OAuthAccountModel.user_id == user.id).first()
                assert oauth_acc is not None
                assert oauth_acc.provider == "google"
                assert oauth_acc.provider_user_id == "google-user-id-9999"

                profile = db.query(UserProfileModel).filter(UserProfileModel.user_id == user.id).first()
                assert profile is not None

                billing = db.query(UserBillingModel).filter(UserBillingModel.user_id == user.id).first()
                assert billing is not None


def test_callback_rejects_unverified_email():
    """Unverified Google email must be rejected."""
    with patch.object(settings, "GOOGLE_CLIENT_ID", "test-client-id"), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret"):
        
        init_resp = client.get("/api/v3/auth/google", follow_redirects=False)
        state_cookie = init_resp.cookies.get("resii_oauth_state")
        location = init_resp.headers["location"]
        state_param = [p.split("=")[1] for p in location.split("?")[1].split("&") if p.startswith("state=")][0]

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.headers = {"content-type": "application/json"}
        mock_token_resp.json.return_value = {"id_token": "mock-id-token"}

        mock_id_info = {
            "sub": "unverified-google-id",
            "email": "test_oauth_unverified@example.com",
            "email_verified": False,
            "iss": "https://accounts.google.com",
            "aud": "test-client-id"
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp), \
             patch("api.google_auth.google_id_token.verify_oauth2_token", return_value=mock_id_info):
            
            client.cookies.set("resii_oauth_state", state_cookie)
            cb_resp = client.get(
                f"/api/v3/auth/google/callback?code=mock-code&state={state_param}&format=json"
            )
            assert cb_resp.status_code == 400
            assert "not verified" in cb_resp.json()["detail"].lower()


def test_account_linking_existing_password_user():
    """When an existing password-based candidate logs in with verified Google email, link safely."""
    # Pre-create user with password
    now_iso = datetime.datetime.utcnow().isoformat()
    pre_user_id = f"usr_{uuid.uuid4().hex[:12]}"
    with SessionLocal() as db:
        user = UserModel(
            id=pre_user_id,
            email="test_oauth_linkable@example.com",
            password_hash=hash_password("ExistingSecurePassword123!"),
            name="Alex Existing",
            role="user",
            avatar_url=None,
            created_at=now_iso,
            entitlements=["free"]
        )
        db.add(user)
        db.commit()

    with patch.object(settings, "GOOGLE_CLIENT_ID", "test-client-id"), \
         patch.object(settings, "GOOGLE_CLIENT_SECRET", "test-client-secret"):
        
        init_resp = client.get("/api/v3/auth/google", follow_redirects=False)
        state_cookie = init_resp.cookies.get("resii_oauth_state")
        location = init_resp.headers["location"]
        state_param = [p.split("=")[1] for p in location.split("?")[1].split("&") if p.startswith("state=")][0]

        mock_token_resp = MagicMock()
        mock_token_resp.status_code = 200
        mock_token_resp.headers = {"content-type": "application/json"}
        mock_token_resp.json.return_value = {"id_token": "mock-id-token"}

        mock_id_info = {
            "sub": "google-linked-id-8888",
            "email": "test_oauth_linkable@example.com",
            "email_verified": True,
            "name": "Alex Existing Updated",
            "iss": "https://accounts.google.com",
            "aud": "test-client-id"
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_token_resp), \
             patch("api.google_auth.google_id_token.verify_oauth2_token", return_value=mock_id_info):
            
            client.cookies.set("resii_oauth_state", state_cookie)
            cb_resp = client.get(
                f"/api/v3/auth/google/callback?code=mock-code&state={state_param}&format=json"
            )
            assert cb_resp.status_code == 200
            assert cb_resp.json()["user"]["email"] == "test_oauth_linkable@example.com"

            # Verify no duplicate user was created and OAuth record is linked
            with SessionLocal() as db:
                users = db.query(UserModel).filter(UserModel.email == "test_oauth_linkable@example.com").all()
                assert len(users) == 1
                assert users[0].id == pre_user_id
                
                oauth_link = db.query(OAuthAccountModel).filter(OAuthAccountModel.user_id == pre_user_id).first()
                assert oauth_link is not None
                assert oauth_link.provider == "google"
                assert oauth_link.provider_user_id == "google-linked-id-8888"


# =====================================================================
# 5. Account Security & Unlinking
# =====================================================================

def test_oauth_unlink_security_check():
    """A Google-only user without a password cannot unlink their account (lockout prevention)."""
    now_iso = datetime.datetime.utcnow().isoformat()
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    with SessionLocal() as db:
        user = UserModel(
            id=user_id,
            email="test_oauth_nopw@example.com",
            password_hash="!oauth_google_sentinel12345",
            name="OAuth Only User",
            role="user",
            avatar_url=None,
            created_at=now_iso,
            entitlements=["free"]
        )
        db.add(user)
        db.flush()
        oauth_acc = OAuthAccountModel(
            id=f"oa_{uuid.uuid4().hex[:12]}",
            user_id=user.id,
            provider="google",
            provider_user_id="google-sub-nopw",
            email=user.email,
            email_verified=True,
            created_at=now_iso,
            updated_at=now_iso
        )
        db.add(oauth_acc)
        db.commit()

    from api.database import active_sessions
    session_id = f"sess_{uuid.uuid4().hex}"
    active_sessions[session_id] = {
        "user": {
            "id": user_id,
            "email": "test_oauth_nopw@example.com",
            "name": "OAuth Only User",
            "role": "user"
        },
        "created_at": time.time(),
        "last_active": time.time()
    }

    signed_sess = sign_session_id(session_id, settings.SECRET_KEY)
    client.cookies.set(settings.COOKIE_NAME, signed_sess)

    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY)
    # Attempt unlink -> should be blocked with 400
    unlink_resp = client.post("/api/v3/auth/google/unlink", headers={"x-csrf-token": csrf_token})
    assert unlink_resp.status_code == 400
    assert "password" in unlink_resp.json()["detail"].lower()
