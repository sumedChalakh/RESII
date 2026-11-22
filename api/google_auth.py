import time
import secrets
import uuid
import threading
import urllib.parse
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, Request, Response, HTTPException, Depends, status
from fastapi.responses import RedirectResponse, JSONResponse
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

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
from api.database import active_sessions
from api.auth import _set_auth_cookies, get_current_user_optional, get_current_user_required
from api.security import sign_session_id, unsign_session_id
from api.schemas import UserSession, AuthResponse

router = APIRouter(prefix="/api/v3/auth/google", tags=["Google OAuth"])
alias_router = APIRouter(prefix="/api/auth/google", tags=["Google OAuth"])

# Thread-safe in-memory store for active OAuth states (10-minute TTL)
_oauth_states_lock = threading.Lock()
_oauth_states: Dict[str, Dict[str, Any]] = {}
STATE_TTL_SECONDS = 600  # 10 minutes


def _purge_expired_states():
    now = time.time()
    expired = [s for s, data in _oauth_states.items() if now - data.get("created_at", 0) > STATE_TTL_SECONDS]
    for s in expired:
        _oauth_states.pop(s, None)


def _store_oauth_state(state: str, nonce: str, redirect_url: Optional[str] = None):
    with _oauth_states_lock:
        _purge_expired_states()
        _oauth_states[state] = {
            "nonce": nonce,
            "created_at": time.time(),
            "redirect_url": redirect_url or "/dashboard"
        }


def _verify_and_consume_state(state: str, cookie_state: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if not state:
        return None

    with _oauth_states_lock:
        _purge_expired_states()
        state_data = _oauth_states.pop(state, None)

    if state_data:
        return state_data

    # Fallback to signed cookie verification if server was restarted between redirect and callback
    if cookie_state:
        unsigned = unsign_session_id(cookie_state, settings.SECRET_KEY)
        if unsigned and unsigned == state:
            return {"nonce": "", "created_at": time.time(), "redirect_url": "/dashboard"}

    return None


@router.get("", summary="Initiate Google OAuth 2.0 Authorization Flow")
@alias_router.get("", include_in_schema=False)
def initiate_google_oauth(
    request: Request,
    response: Response,
    redirect_url: Optional[str] = None,
    format: Optional[str] = None
):
    """
    Initiates Google OAuth 2.0 authorization code flow.
    Generates a cryptographically secure state and nonce, stores state with TTL,
    sets a signed HttpOnly verification cookie, and redirects to Google.
    """
    client_id = settings.GOOGLE_CLIENT_ID
    client_secret = settings.GOOGLE_CLIENT_SECRET
    redirect_uri = settings.GOOGLE_REDIRECT_URI

    if not (client_id and client_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )

    # Cryptographically secure random state (>= 192 bits entropy) & nonce
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)

    _store_oauth_state(state, nonce, redirect_url)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "access_type": "offline",
        "prompt": "select_account"
    }

    google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"

    # Set companion signed state cookie to guard against CSRF across instances
    signed_state = sign_session_id(state, settings.SECRET_KEY)

    if format == "json":
        json_resp = JSONResponse({
            "status": "ready",
            "auth_url": google_auth_url,
            "state": state,
            "redirect_uri": redirect_uri
        })
        json_resp.set_cookie(
            key="resii_oauth_state",
            value=signed_state,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite="lax",
            max_age=STATE_TTL_SECONDS,
            path="/"
        )
        return json_resp

    redirect_resp = RedirectResponse(url=google_auth_url, status_code=status.HTTP_302_FOUND)
    redirect_resp.set_cookie(
        key="resii_oauth_state",
        value=signed_state,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=STATE_TTL_SECONDS,
        path="/"
    )
    return redirect_resp


@router.get("/callback", summary="Google OAuth 2.0 Authorization Callback")
@alias_router.get("/callback", include_in_schema=False)
async def google_oauth_callback(
    request: Request,
    response: Response,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    format: Optional[str] = None
):
    """
    Handles Google OAuth 2.0 callback.
    Validates CSRF state, exchanges authorization code server-side for ID token,
    cryptographically verifies ID token via Google public certificates,
    links or provisions user account safely, issues RESII session, and redirects to dashboard.
    """
    cookie_state = request.cookies.get("resii_oauth_state")

    # 1. Handle user cancellation or Google error
    if error:
        frontend_login = f"{settings.FRONTEND_URL}/login?error=google_cancelled&details={urllib.parse.quote(error_description or error)}"
        err_resp = RedirectResponse(url=frontend_login, status_code=status.HTTP_302_FOUND)
        err_resp.delete_cookie(key="resii_oauth_state", path="/")
        return err_resp

    # 2. Cryptographic CSRF state validation (single-use guarantee)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing OAuth state parameter."
        )

    state_data = _verify_and_consume_state(state, cookie_state)
    if not state_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid, expired, or replayed OAuth state parameter. Please try logging in again."
        )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorization code from Google."
        )

    client_id = settings.GOOGLE_CLIENT_ID
    client_secret = settings.GOOGLE_CLIENT_SECRET
    redirect_uri = settings.GOOGLE_REDIRECT_URI

    if not (client_id and client_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is unconfigured on this server."
        )

    # 3. Server-to-server authorization code exchange with Google token endpoint
    token_url = "https://oauth2.googleapis.com/token"
    token_payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_resp = await client.post(
                token_url,
                data=token_payload,
                headers={"Accept": "application/json"}
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Network error communicating with Google token endpoint: {str(e)}"
        )

    if token_resp.status_code != 200:
        err_data = token_resp.json() if "application/json" in token_resp.headers.get("content-type", "") else {}
        err_msg = err_data.get("error_description") or err_data.get("error") or f"HTTP {token_resp.status_code}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Google token exchange failed: {err_msg}"
        )

    token_data = token_resp.json()
    raw_id_token = token_data.get("id_token")

    if not raw_id_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google response did not include an ID token."
        )

    # 4. Cryptographic ID token verification using Google's audited library
    try:
        id_info = google_id_token.verify_oauth2_token(
            raw_id_token,
            google_requests.Request(),
            audience=client_id,
            clock_skew_in_seconds=10
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cryptographic verification of Google ID token failed: {str(e)}"
        )

    # Verify issuer
    if id_info.get("iss") not in ["accounts.google.com", "https://accounts.google.com"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Untrusted Google token issuer: {id_info.get('iss')}"
        )

    # 5. Extract verified identity claims
    google_sub = id_info.get("sub")
    clean_email = (id_info.get("email") or "").lower().strip()
    is_email_verified = bool(id_info.get("email_verified", False))
    full_name = (id_info.get("name") or clean_email.split("@")[0].title()).strip()
    avatar_url = id_info.get("picture")

    if not google_sub or not clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google ID token missing essential identity attributes (sub or email)."
        )

    # Strict invariant: Reject unverified emails
    if not is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google email is not verified. RESII requires a verified email address."
        )

    now_iso = datetime.now(timezone.utc).isoformat()

    # 6. Database Account Provisioning / Linking
    with SessionLocal() as db:
        # A. Check if user is already linked via Google subject identifier
        oauth_entry = db.query(OAuthAccountModel).filter(
            OAuthAccountModel.provider == "google",
            OAuthAccountModel.provider_user_id == google_sub
        ).first()

        user_model = None

        if oauth_entry:
            # Existing Google-linked user
            user_model = db.query(UserModel).filter(UserModel.id == oauth_entry.user_id).first()
            if not user_model:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User account associated with this Google identity no longer exists."
                )

            # Update identity metadata
            oauth_entry.updated_at = now_iso
            oauth_entry.raw_profile = id_info
            if avatar_url and not user_model.avatar_url:
                user_model.avatar_url = avatar_url
            db.commit()

        else:
            # B. Check if account already exists with the same verified email
            existing_user = db.query(UserModel).filter(UserModel.email == clean_email).first()

            if existing_user:
                # Safe Account Linking: Link Google provider to existing email/password account
                user_model = existing_user
                new_oauth = OAuthAccountModel(
                    id=f"oa_{uuid.uuid4().hex[:12]}",
                    user_id=user_model.id,
                    provider="google",
                    provider_user_id=google_sub,
                    email=clean_email,
                    email_verified=True,
                    created_at=now_iso,
                    updated_at=now_iso,
                    raw_profile=id_info
                )
                db.add(new_oauth)

                if avatar_url and not user_model.avatar_url:
                    user_model.avatar_url = avatar_url

                # Also mark Google connected in profile
                profile = db.query(UserProfileModel).filter(UserProfileModel.user_id == user_model.id).first()
                if profile:
                    profile.google_account_email = clean_email

                db.commit()

            else:
                # C. New User Registration via Google OAuth
                user_id = f"usr_{uuid.uuid4().hex[:12]}"
                # Unmatchable sentinel password hash for pure OAuth users
                unmatchable_pw = f"!oauth_google_{secrets.token_hex(24)}"

                new_user = UserModel(
                    id=user_id,
                    email=clean_email,
                    name=full_name,
                    role="user",
                    avatar_url=avatar_url,
                    created_at=now_iso,
                    entitlements=["free", "ats_check", "resume_edit", "job_search"],
                    password_hash=unmatchable_pw
                )
                db.add(new_user)
                db.flush()

                # Initialize default profile
                profile = UserProfileModel(
                    user_id=user_id,
                    name=full_name,
                    email=clean_email,
                    title="Software Professional",
                    location="Remote",
                    bio="",
                    phone="",
                    website="",
                    google_drive_connected=False,
                    google_account_email=clean_email
                )
                db.add(profile)

                # Initialize default preferences
                prefs = UserPreferenceModel(
                    user_id=user_id,
                    email_job_alerts=True,
                    email_weekly_digest=True,
                    marketing_emails=False,
                    theme="system",
                    compact_view=False
                )
                db.add(prefs)

                # Initialize season & billing
                season = UserSeasonModel(
                    user_id=user_id,
                    season_data={
                        "season_number": 1,
                        "title": "Season 1: Career Launch",
                        "ends_in_days": 30,
                        "current_level": 1,
                        "current_xp": 100,
                        "xp_to_next_level": 500,
                        "streak_days": 1,
                        "weekly_goal": {"target_applications": 5, "completed_applications": 0, "target_tailored_resumes": 2, "completed_tailored_resumes": 0},
                        "badges": []
                    }
                )
                db.add(season)

                billing = UserBillingModel(
                    user_id=user_id,
                    tier="free",
                    status="active",
                    features=["Unlimited Free Applies", "Basic ATS Check"],
                    quotas={"tailoring_runs_remaining": "Unlimited", "auto_applies_limit": 50}
                )
                db.add(billing)

                # Link OAuth account record
                new_oauth = OAuthAccountModel(
                    id=f"oaa_{uuid.uuid4().hex[:12]}",
                    user_id=user_id,
                    provider="google",
                    provider_user_id=google_sub,
                    email=clean_email,
                    email_verified=True,
                    created_at=now_iso,
                    updated_at=now_iso,
                    raw_profile=id_info
                )
                db.add(new_oauth)

                db.commit()
                user_model = new_user

        user_data = {
            "id": user_model.id,
            "email": user_model.email,
            "name": user_model.name,
            "role": user_model.role,
            "avatar_url": user_model.avatar_url,
            "created_at": user_model.created_at,
            "entitlements": list(user_model.entitlements or []),
            "password_hash": user_model.password_hash
        }

    # 7. Session Creation & Session Rotation
    old_cookie = request.cookies.get(settings.COOKIE_NAME)
    old_session_id = unsign_session_id(old_cookie, settings.SECRET_KEY) if old_cookie else None
    if old_session_id and old_session_id in active_sessions:
        del active_sessions[old_session_id]

    session_id = f"sess_{secrets.token_urlsafe(32)}"
    now = time.time()
    active_sessions[session_id] = {
        "user": user_data,
        "created_at": now,
        "last_active": now
    }

    clean_user = {k: v for k, v in user_data.items() if k != "password_hash"}

    # Determine destination URL
    target_dest = state_data.get("redirect_url") or "/dashboard"
    if not target_dest.startswith("/"):
        target_dest = "/dashboard"

    redirect_target = f"{settings.FRONTEND_URL}{target_dest}"

    # Format=json support for direct API clients / automated testing
    if format == "json" or request.headers.get("accept") == "application/json":
        json_resp = JSONResponse({
            "status": "success",
            "user": clean_user,
            "message": "Authenticated with Google successfully."
        })
        _set_auth_cookies(json_resp, session_id)
        json_resp.delete_cookie(key="resii_oauth_state", path="/")
        return json_resp

    # Standard browser redirect to frontend dashboard
    final_resp = RedirectResponse(url=redirect_target, status_code=status.HTTP_302_FOUND)
    _set_auth_cookies(final_resp, session_id)
    final_resp.delete_cookie(key="resii_oauth_state", path="/")
    return final_resp


@router.get("/status", summary="Check Google Account Link Status")
@alias_router.get("/status", include_in_schema=False)
def get_google_account_status(user: UserSession = Depends(get_current_user_required)):
    """Checks whether the currently authenticated candidate has a Google account linked."""
    with SessionLocal() as db:
        oauth_acc = db.query(OAuthAccountModel).filter(
            OAuthAccountModel.user_id == user.id,
            OAuthAccountModel.provider == "google"
        ).first()

        return {
            "connected": oauth_acc is not None,
            "email": oauth_acc.email if oauth_acc else None,
            "connected_at": oauth_acc.created_at if oauth_acc else None
        }


@router.post("/unlink", summary="Unlink Google Account")
@alias_router.post("/unlink", include_in_schema=False)
def unlink_google_account(user: UserSession = Depends(get_current_user_required)):
    """
    Unlinks Google identity from the user account.
    Requires that the user has a valid password set so they are not locked out.
    """
    with SessionLocal() as db:
        user_model = db.query(UserModel).filter(UserModel.id == user.id).first()
        if not user_model:
            raise HTTPException(status_code=404, detail="User not found.")

        # If user has only an unmatchable OAuth sentinel password, disallow unlinking without setting a password
        if user_model.password_hash.startswith("!oauth_"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot unlink Google account without first setting a password in Account Settings."
            )

        deleted = db.query(OAuthAccountModel).filter(
            OAuthAccountModel.user_id == user.id,
            OAuthAccountModel.provider == "google"
        ).delete()

        # Update profile
        profile = db.query(UserProfileModel).filter(UserProfileModel.user_id == user.id).first()
        if profile:
            profile.google_account_email = None

        db.commit()

        return {
            "status": "success",
            "message": "Google account unlinked successfully." if deleted else "No Google account was linked."
        }
