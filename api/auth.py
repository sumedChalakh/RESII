import time
import secrets
import uuid
import datetime
from fastapi import APIRouter, Request, Response, HTTPException, Depends, status
from typing import Optional
from api.config import settings
from api.schemas import UserSession, LoginRequest, RegisterRequest, AuthResponse, EnabledProvidersResponse
from api.database import active_sessions, users_db, DEMO_USER
from api.db import SessionLocal
from sqlalchemy.exc import IntegrityError
from api.models import UserModel, UserProfileModel, UserPreferenceModel, ExtensionTokenModel
from api.security import (
    verify_password,
    hash_password,
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
    raw_token = None
    # 1. Prioritize explicit Authorization or X-Extension-Token header
    auth_hdr = request.headers.get("authorization")
    if auth_hdr and auth_hdr.lower().startswith("bearer "):
        raw_token = auth_hdr.split(" ", 1)[1].strip()
        session_id = unsign_session_id(raw_token, settings.SECRET_KEY) or raw_token
    elif request.headers.get("x-extension-token"):
        raw_token = request.headers.get("x-extension-token").strip()
        session_id = unsign_session_id(raw_token, settings.SECRET_KEY) or raw_token

    # 2. Fall back to ambient signed session cookie
    if not session_id:
        cookie_val = request.cookies.get(settings.COOKIE_NAME)
        if cookie_val:
            session_id = unsign_session_id(cookie_val, settings.SECRET_KEY)

    if not session_id:
        return None

    now = time.time()

    # 3. If in memory active_sessions, validate freshness
    if session_id in active_sessions:
        session_entry = active_sessions[session_id]
        if session_entry.get("revoked", False):
            del active_sessions[session_id]
            return None

        created_at = session_entry.get("created_at", now)
        last_active = session_entry.get("last_active", now)
        if (now - created_at > settings.SESSION_MAX_AGE_SECONDS) or (now - last_active > settings.SESSION_IDLE_TIMEOUT_SECONDS):
            del active_sessions[session_id]
            return None

        session_entry["last_active"] = now
        user_dict = session_entry["user"]
        clean_user = {k: v for k, v in user_dict.items() if k != "password_hash"}
        return UserSession(**clean_user)

    # 4. If not in active_sessions and raw_token is present, verify against database ExtensionTokenModel
    if raw_token:
        import hashlib
        tok_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        try:
            with SessionLocal() as db:
                ext_tok = db.query(ExtensionTokenModel).filter(
                    ExtensionTokenModel.token_hash == tok_hash,
                    ExtensionTokenModel.revoked == False,
                    ExtensionTokenModel.expires_at > now
                ).first()
                if ext_tok:
                    db_user = db.query(UserModel).filter(UserModel.id == ext_tok.user_id).first()
                    if db_user:
                        ext_tok.last_used_at = now
                        db.commit()
                        user_data = {
                            "id": db_user.id,
                            "email": db_user.email,
                            "name": db_user.name,
                            "role": db_user.role,
                            "entitlements": db_user.entitlements
                        }
                        active_sessions[raw_token] = {
                            "user": user_data,
                            "user_id": db_user.id,
                            "token_id": ext_tok.id,
                            "created_at": now,
                            "last_active": now,
                            "revoked": False,
                            "is_extension": True
                        }
                        return UserSession(**user_data)
        except Exception:
            pass

    return None

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
    if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
        providers.append("google")
    if settings.RESII_DEMO_MODE and settings.ENVIRONMENT == "development":
        providers.append("demo")
    return EnabledProvidersResponse(
        providers=providers,
        registration_open=True
    )

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(reg_req: RegisterRequest, request: Request, response: Response):
    # Enforce brute-force / flood rate limit: 5 requests per minute per IP
    check_rate_limit(request, "auth_register", limit=5, window_seconds=60)

    clean_email = reg_req.email.lower().strip()
    password = reg_req.password

    # Validate password strength: minimum 8 characters, at least 1 letter, and at least 1 digit or special character
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )
    if not any(c.isalpha() for c in password) or not any(c.isdigit() or not c.isalnum() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one letter and one number or special character."
        )

    # Check for existing account
    with SessionLocal() as db:
        existing = db.query(UserModel).filter(UserModel.email == clean_email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email address already exists."
            )

        user_id = f"usr_{uuid.uuid4().hex[:12]}"
        clean_name = (reg_req.name or clean_email.split("@")[0].title()).strip()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        pw_hash = hash_password(password)

        new_user = UserModel(
            id=user_id,
            email=clean_email,
            name=clean_name,
            role="user",
            avatar_url=None,
            created_at=now_iso,
            entitlements=["free", "ats_check", "resume_edit", "job_search"],
            password_hash=pw_hash
        )
        db.add(new_user)

        # Initialize default user profile
        profile = UserProfileModel(
            user_id=user_id,
            name=clean_name,
            email=clean_email,
            title="Software Professional",
            location="Remote",
            bio="",
            phone="",
            website="",
            google_drive_connected=False,
            google_account_email=None
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

        try:
            db.commit()
        except IntegrityError as e:
            db.rollback()
            orig_str = str(getattr(e, "orig", e)).lower()
            err_str = str(e).lower()
            # Enforce duplicate-email mapping ONLY when the email uniqueness constraint failed
            is_email_unique = (
                "users.email" in orig_str
                or "users.email" in err_str
                or ("email" in orig_str and "unique" in orig_str)
            )
            if is_email_unique:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An account with this email address already exists."
                )
            # Unrelated integrity failure (e.g. check constraint, primary key, null constraint)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Account creation could not be completed due to a database integrity constraint."
            )
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred during account creation."
            )

        user_record = {
            "id": user_id,
            "email": clean_email,
            "name": clean_name,
            "role": "user",
            "avatar_url": None,
            "created_at": now_iso,
            "entitlements": ["free", "ats_check", "resume_edit", "job_search"],
            "password_hash": pw_hash
        }

    # Session rotation: invalidate existing session if present
    old_cookie = request.cookies.get(settings.COOKIE_NAME)
    old_session_id = unsign_session_id(old_cookie, settings.SECRET_KEY) if old_cookie else None
    if old_session_id and old_session_id in active_sessions:
        del active_sessions[old_session_id]

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
        message="Account registered successfully"
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
