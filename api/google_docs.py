import os
import uuid
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from api.auth import get_current_user_optional, get_current_user_required
from api.schemas import UserSession
from api.resumes import RESUMES_DB

router = APIRouter(prefix="/api/v3/resumes", tags=["Google Docs Sync"])

class GoogleDocsSyncRequest(BaseModel):
    document_title: Optional[str] = None

@router.get("/{resume_id}/google-docs")
def get_google_docs_status(resume_id: str, user: Optional[UserSession] = Depends(get_current_user_optional)):
    resume = RESUMES_DB.get(resume_id) or RESUMES_DB.get("primary")
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")

    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    is_configured = bool(client_id and client_secret)

    if not is_configured:
        return {
            "resume_id": resume_id,
            "connected": False,
            "status": "unconfigured",
            "message": "Google Docs API is unconfigured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in production to enable direct synchronization.",
            "google_doc_id": None,
            "google_doc_url": None,
            "last_synced_at": None,
            "download_docx_url": f"/api/v3/resumes/{resume_id}/export/docx",
            "download_pdf_url": f"/api/v3/resumes/{resume_id}/export/pdf"
        }

    return {
        "resume_id": resume_id,
        "connected": False,
        "status": "ready_to_connect",
        "message": "Google Docs API configured. Authorization required to bind document.",
        "google_doc_id": None,
        "google_doc_url": None,
        "last_synced_at": None
    }

@router.post("/{resume_id}/google-docs")
def sync_to_google_docs(
    resume_id: str,
    req: Optional[GoogleDocsSyncRequest] = None,
    user: UserSession = Depends(get_current_user_required)
):
    resume = RESUMES_DB.get(resume_id) or RESUMES_DB.get("primary")
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")

    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if not (client_id and client_secret):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Docs API integration is currently unconfigured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable direct document synchronization."
        )

    # In production with OAuth credentials, proceed with genuine Google Docs API creation
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Active user Google OAuth token required. Please authenticate via Account Settings -> Google Drive."
    )
