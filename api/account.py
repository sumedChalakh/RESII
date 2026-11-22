import os
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
import copy
from api.auth import get_current_user_required
from api.schemas import UserSession
from api.db import SessionLocal
from api.models import UserProfileModel, UserPreferenceModel, UserModel

router = APIRouter(prefix="/api/account", tags=["Account"])

class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None

class UpdatePreferencesRequest(BaseModel):
    email_job_alerts: Optional[bool] = None
    email_weekly_digest: Optional[bool] = None
    marketing_emails: Optional[bool] = None
    theme: Optional[str] = None
    compact_view: Optional[bool] = None

def _get_user_profile(user_id: str, email: str = "") -> Dict[str, Any]:
    with SessionLocal() as db:
        record = db.query(UserProfileModel).filter(UserProfileModel.user_id == user_id).first()
        if record:
            return {
                "name": record.name,
                "email": record.email,
                "title": record.title,
                "location": record.location,
                "bio": record.bio or "",
                "phone": record.phone or "",
                "website": record.website or "",
                "google_drive_connected": record.google_drive_connected,
                "google_account_email": record.google_account_email
            }

        # Query user model to get real name
        user_model = db.query(UserModel).filter(UserModel.id == user_id).first()
        user_name = user_model.name if user_model else (email.split("@")[0].capitalize() if email else "Candidate")
        user_email = user_model.email if user_model else (email or f"{user_id}@resii.dev")

        default_profile = {
            "name": user_name,
            "email": user_email,
            "title": "Software Professional",
            "location": "Remote",
            "bio": "",
            "phone": "",
            "website": "",
            "google_drive_connected": False,
            "google_account_email": None
        }

        try:
            db_record = UserProfileModel(
                user_id=user_id,
                name=user_name,
                email=user_email,
                title="Software Professional",
                location="Remote",
                bio="",
                phone="",
                website="",
                google_drive_connected=False,
                google_account_email=None
            )
            db.add(db_record)
            db.commit()
        except Exception:
            db.rollback()
        return default_profile

def _save_user_profile(user_id: str, profile_data: Dict[str, Any]) -> None:
    with SessionLocal() as db:
        record = db.query(UserProfileModel).filter(UserProfileModel.user_id == user_id).first()
        if record:
            record.name = profile_data.get("name", record.name)
            record.email = profile_data.get("email", record.email)
            record.title = profile_data.get("title", record.title)
            record.location = profile_data.get("location", record.location)
            record.bio = profile_data.get("bio", record.bio)
            record.phone = profile_data.get("phone", record.phone)
            record.website = profile_data.get("website", record.website)
            record.google_drive_connected = profile_data.get("google_drive_connected", record.google_drive_connected)
            record.google_account_email = profile_data.get("google_account_email", record.google_account_email)
            db.commit()
        else:
            try:
                db_record = UserProfileModel(
                    user_id=user_id,
                    name=profile_data.get("name", "User"),
                    email=profile_data.get("email", "user@resii.com"),
                    title=profile_data.get("title"),
                    location=profile_data.get("location"),
                    bio=profile_data.get("bio"),
                    phone=profile_data.get("phone"),
                    website=profile_data.get("website"),
                    google_drive_connected=profile_data.get("google_drive_connected", False),
                    google_account_email=profile_data.get("google_account_email")
                )
                db.add(db_record)
                db.commit()
            except Exception:
                db.rollback()

def _get_user_preferences(user_id: str) -> Dict[str, Any]:
    with SessionLocal() as db:
        record = db.query(UserPreferenceModel).filter(UserPreferenceModel.user_id == user_id).first()
        if record:
            return {
                "email_job_alerts": record.email_job_alerts,
                "email_weekly_digest": record.email_weekly_digest,
                "marketing_emails": record.marketing_emails,
                "theme": record.theme,
                "compact_view": record.compact_view
            }

        default_prefs = {
            "email_job_alerts": True,
            "email_weekly_digest": True,
            "marketing_emails": False,
            "theme": "system",
            "compact_view": False
        }
        try:
            db_record = UserPreferenceModel(
                user_id=user_id,
                email_job_alerts=True,
                email_weekly_digest=True,
                marketing_emails=False,
                theme="system",
                compact_view=False
            )
            db.add(db_record)
            db.commit()
        except Exception:
            db.rollback()
        return default_prefs

def _save_user_preferences(user_id: str, prefs_data: Dict[str, Any]) -> None:
    with SessionLocal() as db:
        record = db.query(UserPreferenceModel).filter(UserPreferenceModel.user_id == user_id).first()
        if record:
            record.email_job_alerts = prefs_data.get("email_job_alerts", record.email_job_alerts)
            record.email_weekly_digest = prefs_data.get("email_weekly_digest", record.email_weekly_digest)
            record.marketing_emails = prefs_data.get("marketing_emails", record.marketing_emails)
            record.theme = prefs_data.get("theme", record.theme)
            record.compact_view = prefs_data.get("compact_view", record.compact_view)
            db.commit()
        else:
            try:
                db_record = UserPreferenceModel(
                    user_id=user_id,
                    email_job_alerts=prefs_data.get("email_job_alerts", True),
                    email_weekly_digest=prefs_data.get("email_weekly_digest", True),
                    marketing_emails=prefs_data.get("marketing_emails", False),
                    theme=prefs_data.get("theme", "system"),
                    compact_view=prefs_data.get("compact_view", False)
                )
                db.add(db_record)
                db.commit()
            except Exception:
                db.rollback()

@router.get("/profile")
def get_profile(user: UserSession = Depends(get_current_user_required)):
    return _get_user_profile(user.id, user.email)

@router.put("/profile")
def update_profile(req: UpdateProfileRequest, user: UserSession = Depends(get_current_user_required)):
    profile = _get_user_profile(user.id, user.email)
    if req.name is not None:
        profile["name"] = req.name
    if req.title is not None:
        profile["title"] = req.title
    if req.location is not None:
        profile["location"] = req.location
    if req.bio is not None:
        profile["bio"] = req.bio
    if req.phone is not None:
        profile["phone"] = req.phone
    if req.website is not None:
        profile["website"] = req.website
    _save_user_profile(user.id, profile)
    return profile

@router.get("/preferences")
def get_preferences(user: UserSession = Depends(get_current_user_required)):
    return _get_user_preferences(user.id)

@router.put("/preferences")
def update_preferences(req: UpdatePreferencesRequest, user: UserSession = Depends(get_current_user_required)):
    prefs = _get_user_preferences(user.id)
    if req.email_job_alerts is not None:
        prefs["email_job_alerts"] = req.email_job_alerts
    if req.email_weekly_digest is not None:
        prefs["email_weekly_digest"] = req.email_weekly_digest
    if req.marketing_emails is not None:
        prefs["marketing_emails"] = req.marketing_emails
    if req.theme is not None:
        prefs["theme"] = req.theme
    if req.compact_view is not None:
        prefs["compact_view"] = req.compact_view
    _save_user_preferences(user.id, prefs)
    return prefs

@router.get("/google-drive/status")
def google_drive_status(user: UserSession = Depends(get_current_user_required)):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    is_configured = bool(client_id and client_secret)

    profile = _get_user_profile(user.id, user.email)
    return {
        "connected": profile.get("google_drive_connected", False) if is_configured else False,
        "email": profile.get("google_account_email") if is_configured else None,
        "configured": is_configured,
        "status": "connected" if (is_configured and profile.get("google_drive_connected")) else ("unconfigured" if not is_configured else "disconnected")
    }

@router.post("/google-drive/connect")
def google_drive_connect(user: UserSession = Depends(get_current_user_required)):
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if not (client_id and client_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Drive integration is unconfigured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in production to enable OAuth authorization."
        )

    # In production with OAuth credentials, return the consent URL
    redirect_uri = f"{os.getenv('FRONTEND_URL', 'http://localhost:5173')}/account/google-callback"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope=https://www.googleapis.com/auth/drive.file&"
        f"access_type=offline&prompt=consent"
    )
    return {
        "status": "auth_required",
        "auth_url": auth_url,
        "message": "Redirect to Google OAuth consent screen."
    }

@router.post("/google-drive/disconnect")
def google_drive_disconnect(user: UserSession = Depends(get_current_user_required)):
    profile = _get_user_profile(user.id, user.email)
    profile["google_drive_connected"] = False
    profile["google_account_email"] = None
    _save_user_profile(user.id, profile)
    return {"status": "disconnected"}
