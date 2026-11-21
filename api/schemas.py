from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any

class UserSession(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    role: str = "user"
    avatar_url: Optional[str] = None
    created_at: str
    entitlements: List[str] = ["free", "ats_check", "resume_edit", "job_search"]

class LoginRequest(BaseModel):
    email: EmailStr
    password: Optional[str] = "demo123"
    provider: Optional[str] = "email"

class AuthResponse(BaseModel):
    status: str
    user: UserSession
    message: Optional[str] = None

class EnabledProvidersResponse(BaseModel):
    providers: List[str] = ["email", "google", "demo"]
    registration_open: bool = True
