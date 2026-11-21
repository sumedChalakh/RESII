import os
from typing import List, Set, Optional
from pydantic import BaseModel, Field, model_validator

DEFAULT_DEV_SECRET = "resii_super_secret_development_session_key_2026"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA_DIR = os.path.join(BASE_DIR, "data")

def _default_trusted_proxies() -> List[str]:
    raw = os.getenv("TRUSTED_PROXIES", "127.0.0.1,::1,localhost")
    return [p.strip().lower() for p in raw.split(",") if p.strip()]

class Settings(BaseModel):
    APP_NAME: str = "RESII API"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    SECRET_KEY: str = os.getenv("SECRET_KEY", DEFAULT_DEV_SECRET)
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    MARKETING_URL: str = os.getenv("MARKETING_URL", "http://localhost:3000")
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8100"))
    API_URL: str = os.getenv("API_URL", "http://localhost:8100")
    COOKIE_NAME: str = "resii_session"
    COOKIE_SECURE: Optional[bool] = None
    COOKIE_SAMESITE: str = "lax"
    RESII_DEMO_MODE: bool = os.getenv("RESII_DEMO_MODE", "true").lower() == "true"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10 MB strict limit
    SESSION_MAX_AGE_SECONDS: int = 60 * 60 * 24 * 7  # 7 days
    SESSION_IDLE_TIMEOUT_SECONDS: int = 60 * 60 * 24  # 24 hours
    TRUSTED_PROXIES: List[str] = Field(default_factory=_default_trusted_proxies)
    DATA_DIR: str = os.getenv("RESII_DATA_DIR", DEFAULT_DATA_DIR)
    DATABASE_URL: Optional[str] = None
    STORAGE_DIR: Optional[str] = None
    BACKUP_DIR: Optional[str] = None
    FREEFLOW_API_URL: str = os.getenv("FREEFLOW_API_URL", "http://127.0.0.1:8000/v1")
    OLLAMA_API_URL: str = os.getenv("OLLAMA_API_URL", "http://127.0.0.1:11434")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "freeflow")
    LLM_MODEL: Optional[str] = os.getenv("LLM_MODEL", None)
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY", None)
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY", None)
    CREDENTIAL_ENCRYPTION_KEY: Optional[str] = os.getenv("CREDENTIAL_ENCRYPTION_KEY", None)

    @model_validator(mode="after")
    def resolve_defaults(self):
        # Resolve directories and database URL
        if not self.DATA_DIR:
            self.DATA_DIR = DEFAULT_DATA_DIR
        os.makedirs(self.DATA_DIR, exist_ok=True)

        if not self.DATABASE_URL:
            db_path = os.path.join(self.DATA_DIR, "resii.db").replace("\\", "/")
            self.DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{db_path}")

        if not self.STORAGE_DIR:
            self.STORAGE_DIR = os.getenv("RESII_STORAGE_DIR", os.path.join(self.DATA_DIR, "uploads"))
        os.makedirs(self.STORAGE_DIR, exist_ok=True)

        if not self.BACKUP_DIR:
            self.BACKUP_DIR = os.getenv("RESII_BACKUP_DIR", os.path.join(self.DATA_DIR, "backups"))
        os.makedirs(self.BACKUP_DIR, exist_ok=True)

        # Resolve COOKIE_SECURE: env var if present, else True for production, False for dev
        if self.COOKIE_SECURE is None:
            env_val = os.getenv("COOKIE_SECURE")
            if env_val is not None:
                self.COOKIE_SECURE = env_val.lower() == "true"
            else:
                self.COOKIE_SECURE = (self.ENVIRONMENT == "production")
        return self

    @property
    def trusted_proxies_set(self) -> Set[str]:
        return {p.lower() for p in self.TRUSTED_PROXIES}

settings = Settings()

def validate_production_config(s: Settings = settings):
    """
    Enforces strict security invariants in production.
    Fails fast if production deployment uses insecure defaults or weak configurations.
    """
    if s.ENVIRONMENT == "production":
        # 1. Require strong, non-default SECRET_KEY
        if not s.SECRET_KEY or s.SECRET_KEY == DEFAULT_DEV_SECRET or len(s.SECRET_KEY) < 32:
            raise RuntimeError(
                "Production deployment requires a strong, non-default SECRET_KEY of at least 32 characters."
            )

        # 2. Require COOKIE_SECURE=True
        if not s.COOKIE_SECURE:
            raise RuntimeError(
                "Production deployment requires COOKIE_SECURE=True to prevent cleartext session transmission."
            )

        # 3. Disallow insecure testclient in trusted proxies for production
        if "testclient" in s.trusted_proxies_set:
            raise RuntimeError(
                "Production deployment cannot include 'testclient' in TRUSTED_PROXIES."
            )

        # 4. Require explicit CREDENTIAL_ENCRYPTION_KEY in production
        if not s.CREDENTIAL_ENCRYPTION_KEY or len(s.CREDENTIAL_ENCRYPTION_KEY) < 16:
            raise RuntimeError(
                "Production deployment requires an explicit CREDENTIAL_ENCRYPTION_KEY of at least 16 characters."
            )
