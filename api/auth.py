import time
import secrets
from fastapi import APIRouter, Request, Response, HTTPException, Depends, status
from typing import Optional
from api.config import settings
from api.schemas import UserSession, LoginRequest, AuthResponse, EnabledProvidersResponse
from api.database import active_sessions, users_db, DEMO_USER
from api.security import (
    verify_password,
    sign_session_id,
    unsign_session_id,
    generate_csrf_token,
)
from api.rate_limiter import check_rate_limit

router = APIRouter(prefix="/api/auth", tags=["auth"])

def _set_auth_cookies(response: Response, session_id: str):
    """Sets both signed session cookie and companion CSRF cookie."""
    signed_session = sign_session_id(session_id, settings.SECRET_KEY)
    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY)

    # 1. HttpOnly signed session cookie
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=signed_session,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.SESSION_MAX_AGE_SECONDS,
        path="/"
    )

    # 2. Companion double-submit CSRF cookie (frontend readable)
    response.set_cookie(
        key="resii_csrf",
        value=csrf_token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.SESSION_MAX_AGE_SECONDS,
        path="/"
    )

def get_current_user(request: Request) -> Optional[UserSession]:
    """
    Extracts and cryptographically validates the signed session cookie or Bearer/Extension token.
    Enforces maximum age and idle expiration.
    """
    session_id = None
    # 1. Prioritize explicit Authorization or X-Extension-Token header
    auth_hdr = request.headers.get("authorization")
    if auth_hdr and auth_hdr.lower().startswith("bearer "):
        raw = auth_hdr.split(" ", 1)[1].strip()
        session_id = unsign_session_id(raw, settings.SECRET_KEY) or raw
    elif request.headers.get("x-extension-token"):
        raw = request.headers.get("x-extension-token").strip()
        session_id = unsign_session_id(raw, settings.SECRET_KEY) or raw

    # 2. Fall back to ambient signed session cookie
    if not session_id:
        cookie_val = request.cookies.get(settings.COOKIE_NAME)
        if cookie_val:
            session_id = unsign_session_id(cookie_val, settings.SECRET_KEY)

    if not session_id or session_id not in active_sessions:
        return None

    session_entry = active_sessions[session_id]
    now = time.time()

    # Check expiration limits
    created_at = session_entry.get("created_at", now)
    last_active = session_entry.get("last_active", now)

    if (now - created_at > settings.SESSION_MAX_AGE_SECONDS) or (now - last_active > settings.SESSION_IDLE_TIMEOUT_SECONDS):
        # Session expired
        del active_sessions[session_id]
        return None

    # Update last active timestamp
    session_entry["last_active"] = now

    user_dict = session_entry["user"]
    # Never expose password_hash
    clean_user = {k: v for k, v in user_dict.items() if k != "password_hash"}
    return UserSession(**clean_user)

get_current_user_optional = get_current_user

def get_current_user_required(user: Optional[UserSession] = Depends(get_current_user)) -> UserSession:
    """Dependency that strictly requires an authenticated session."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required."
        )
    return user

@router.get("/csrf-token")
def get_csrf_token(request: Request, response: Response):
    """
    Issues a CSRF token for the current session or a secure anonymous token.
    Sets the resii_csrf cookie.
    """
    cookie_val = request.cookies.get(settings.COOKIE_NAME)
    session_id = unsign_session_id(cookie_val, settings.SECRET_KEY) if cookie_val else None
    token_seed = session_id if session_id else "anon"
    token = generate_csrf_token(token_seed, settings.SECRET_KEY)

    response.set_cookie(
        key="resii_csrf",
        value=token,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.SESSION_MAX_AGE_SECONDS,
        path="/"
    )
    return {"csrf_token": token}

@router.get("/get-session", response_model=Optional[UserSession])
def get_session(request: Request):
    """
    Returns the authenticated user session, or null if unauthenticated.
    Exact match for Rezifi's GET /api/auth/get-session contract.
    """
    return get_current_user(request)

@router.get("/enabled-providers", response_model=EnabledProvidersResponse)
def enabled_providers():
    providers = ["email"]
    if settings.RESII_DEMO_MODE and settings.ENVIRONMENT == "development":
        providers.append("demo")
    return EnabledProvidersResponse(
        providers=providers,
        registration_open=False
    )

@router.post("/login", response_model=AuthResponse)
def login(login_req: LoginRequest, request: Request, response: Response):
    # Enforce brute-force rate limit: 5 requests per minute per IP
    check_rate_limit(request, "auth_login", limit=5, window_seconds=60)

    email = login_req.email.lower()
    user_record = users_db.get(email)

    if not user_record:
        # Uniform rejection prevents user enumeration and halts auto-registration bypass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Argon2id password verification
    stored_hash = user_record.get("password_hash")
    if not stored_hash or not verify_password(stored_hash, login_req.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Session rotation: invalidate existing session if present
    old_cookie = request.cookies.get(settings.COOKIE_NAME)
    old_session_id = unsign_session_id(old_cookie, settings.SECRET_KEY) if old_cookie else None
    if old_session_id and old_session_id in active_sessions:
        del active_sessions[old_session_id]

    # Generate fresh cryptographically secure session ID
    session_id = f"sess_{secrets.token_urlsafe(32)}"
    now = time.time()
    active_sessions[session_id] = {
        "user": user_record,
        "created_at": now,
        "last_active": now
    }

    _set_auth_cookies(response, session_id)

    clean_user = {k: v for k, v in user_record.items() if k != "password_hash"}
    return AuthResponse(
        status="success",
        user=UserSession(**clean_user),
        message="Logged in successfully"
    )

@router.post("/demo-login", response_model=AuthResponse)
def demo_login(request: Request, response: Response):
    """One-click instant login as Alex Rivera (demo account, dev mode only)"""
    # Demo login restricted strictly to dev environment with RESII_DEMO_MODE=true
    if not settings.RESII_DEMO_MODE or settings.ENVIRONMENT != "development":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo login is disabled in this environment."
        )

    # Rate limiting on demo login: 10 requests per minute
    check_rate_limit(request, "auth_demo_login", limit=10, window_seconds=60)

    # Rotate old session if present
    old_cookie = request.cookies.get(settings.COOKIE_NAME)
    old_session_id = unsign_session_id(old_cookie, settings.SECRET_KEY) if old_cookie else None
    if old_session_id and old_session_id in active_sessions:
        del active_sessions[old_session_id]

    session_id = f"sess_{secrets.token_urlsafe(32)}"
    now = time.time()
    active_sessions[session_id] = {
        "user": DEMO_USER,
        "created_at": now,
        "last_active": now
    }

    _set_auth_cookies(response, session_id)

    clean_user = {k: v for k, v in DEMO_USER.items() if k != "password_hash"}
    return AuthResponse(
        status="success",
        user=UserSession(**clean_user),
        message="Logged in as Demo User"
    )

@router.post("/logout")
def logout(response: Response, request: Request):
    cookie_val = request.cookies.get(settings.COOKIE_NAME)
    session_id = unsign_session_id(cookie_val, settings.SECRET_KEY) if cookie_val else None
    if session_id and session_id in active_sessions:
        del active_sessions[session_id]

    response.delete_cookie(key=settings.COOKIE_NAME, path="/")
    response.delete_cookie(key="resii_csrf", path="/")
    return {"status": "success", "message": "Logged out"}
