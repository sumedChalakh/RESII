import os
import time
import hmac
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from api.config import settings, validate_production_config
from api.auth import router as auth_router
from api.public import router as public_router
from api.resumes import router as resumes_router
from api.tailor import router as tailor_router
from api.templates import router as templates_router
from api.jobs import router as jobs_router
from api.auto_apply import router as auto_apply_router
from api.season import router as season_router
from api.billing import router as billing_router
from api.account import router as account_router
from api.extension import router as extension_router
from api.google_docs import router as google_docs_router
from api.google_auth import router as google_auth_router, alias_router as google_auth_alias_router
from api.security import unsign_session_id, generate_csrf_token
from api.database import active_sessions
from api.db import init_db

# Initialize database schema and verify production configuration
init_db()
validate_production_config(settings)

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="RESII Backend API - AI Career Platform (Security Hardened)"
)

# CORS configuration matching Rezifi's exposed headers specification
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        settings.MARKETING_URL,
        settings.API_URL,
        "http://localhost:8100",
        "http://127.0.0.1:8100",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://app.resii.com",
        "https://resii.com"
    ],
    allow_origin_regex=r"^(chrome-extension|moz-extension)://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "ETag",
        "Retry-After",
        "Server-Timing",
        "X-Page-Count",
        "X-Left-Out",
        "X-Tightened",
        "X-Resume-Version",
        "Content-Disposition"
    ],
)

@app.middleware("http")
async def csrf_protect_middleware(request: Request, call_next):
    """
    Double-submit CSRF protection middleware.
    State-changing methods (POST, PUT, PATCH, DELETE) made by authenticated
    sessions must present a matching, cryptographically valid X-CSRF-Token header.
    """
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        session_cookie = request.cookies.get(settings.COOKIE_NAME)
        if session_cookie:
            path = request.url.path
            exempt_paths = [
                "/api/auth/login",
                "/api/auth/register",
                "/api/auth/demo-login",
                "/api/auth/logout",
                "/api/auth/csrf-token",
                "/api/v3/extension/pair"
            ]
            is_exempt = any(path == ep or path.startswith("/public/") or path.startswith("/api/v3/extension/") for ep in exempt_paths)
            if not is_exempt:
                session_id = unsign_session_id(session_cookie, settings.SECRET_KEY)
                if session_id and session_id in active_sessions:
                    csrf_header = request.headers.get("x-csrf-token")
                    expected_token = generate_csrf_token(session_id, settings.SECRET_KEY)
                    if not csrf_header or not hmac.compare_digest(csrf_header, expected_token):
                        return JSONResponse(
                            status_code=403,
                            content={"detail": "CSRF token missing or invalid."}
                        )

    return await call_next(request)

@app.middleware("http")
async def add_custom_headers_and_timing(request: Request, call_next):
    start_time = time.time()
    response: Response = await call_next(request)
    duration_ms = int((time.time() - start_time) * 1000)
    
    # Server-Timing and default document computation headers
    response.headers["Server-Timing"] = f"app;dur={duration_ms}"
    if "X-Resume-Version" not in response.headers:
        response.headers["X-Resume-Version"] = "1"
    if "X-Page-Count" not in response.headers:
        response.headers["X-Page-Count"] = "1"
    if "X-Tightened" not in response.headers:
        response.headers["X-Tightened"] = "false"
    if "X-Left-Out" not in response.headers:
        response.headers["X-Left-Out"] = "0"
        
    return response

# Include Routers
app.include_router(auth_router)
app.include_router(public_router)
app.include_router(resumes_router)
app.include_router(tailor_router)
app.include_router(templates_router)
app.include_router(jobs_router)
app.include_router(auto_apply_router)
app.include_router(season_router)
app.include_router(billing_router)
app.include_router(account_router)
app.include_router(extension_router)
app.include_router(google_docs_router)
app.include_router(google_auth_router)
app.include_router(google_auth_alias_router)

@app.on_event("startup")
async def on_startup():
    from api.jobs_engine.scheduler import start_scheduler_task
    start_scheduler_task()

@app.on_event("shutdown")
async def on_shutdown():
    from api.jobs_engine.scheduler import stop_scheduler_task
    await stop_scheduler_task()

@app.get("/api/health")
def health():
    db_ok = False
    try:
        from api.db import SessionLocal
        from sqlalchemy import text
        with SessionLocal() as db:
            db.execute(text("SELECT 1")).scalar()
            db_ok = True
    except Exception:
        db_ok = False

    storage_ok = os.path.isdir(settings.STORAGE_DIR) and os.access(settings.STORAGE_DIR, os.W_OK)
    is_healthy = db_ok and storage_ok

    payload = {
        "status": "healthy" if is_healthy else "degraded",
        "service": "resii-api",
        "version": "1.0.0",
        "port": settings.PORT,
        "environment": settings.ENVIRONMENT,
        "checks": {
            "database": "online" if db_ok else "unreachable",
            "storage": "writable" if storage_ok else "unwritable"
        }
    }
    if not is_healthy:
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    return payload

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host=settings.API_HOST, port=settings.PORT, reload=True)
