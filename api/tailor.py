import uuid
import re
import copy
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel

from api.auth import get_current_user_required
from api.schemas import UserSession
from api.resumes import RESUMES_DB
from api.db import SessionLocal
from api.models import (
    TailorReviewModel,
    TailorEventModel,
    CandidateFactsModel,
    UserProfileModel,
    CoverLetterModel,
    AIProviderSettingModel,
    ResumeModel,
)
from api.crypto import encrypt_credential, decrypt_credential, mask_credential
from api.ai.schemas import (
    AIProviderConfig,
    ProviderHealthResponse,
    JobDescriptionAnalysis,
    ResumeMatchReport,
    TailoringPlanResponse,
    TailorSuggestion,
    FactVerificationResult,
    CoverLetterRequest,
    CoverLetterResponse,
)
from api.ai.providers.factory import get_provider, check_all_providers
from api.ai.providers.base import ProviderError
from api.ai.evidence import build_evidence_ledger
from api.ai.job_analyzer import analyze_job_description
from api.ai.matcher import match_resume_to_job
from api.ai.tailor_engine import generate_tailoring_plan
from api.ai.fact_checker import verify_candidate_claim
from api.ai.cover_letter import generate_cover_letter

router = APIRouter(prefix="/api/v3/tailor", tags=["Tailoring"])

# In-memory store for tailoring reviews and events (isolated by user_id)
TAILOR_REVIEWS_DB: Dict[str, Dict[str, Any]] = {}
TAILOR_EVENTS_DB: List[Dict[str, Any]] = []

class ReadWordsRequest(BaseModel):
    job_description: str
    resume_id: Optional[str] = "primary"

class TailorPlanRequest(BaseModel):
    job_description: str
    job_title: Optional[str] = "Target Role"
    company_name: Optional[str] = "Target Company"
    resume_id: Optional[str] = "primary"

class TailorEventRequest(BaseModel):
    review_id: str
    action: str
    line_id: str
    original_text: str
    new_text: Optional[str] = None
    reason: Optional[str] = None

class ApplyTailoringRequest(BaseModel):
    review_id: str
    title: Optional[str] = None
    accepted_changes: List[Dict[str, Any]]

class VerifyClaimRequest(BaseModel):
    claim: str
    resume_id: Optional[str] = "primary"


def _get_user_ai_config(db, user_id: str) -> AIProviderConfig:
    setting = db.query(AIProviderSettingModel).filter(AIProviderSettingModel.user_id == user_id).first()
    if setting:
        raw_key = None
        if setting.api_key_encrypted:
            try:
                raw_key = decrypt_credential(setting.api_key_encrypted)
            except Exception:
                raw_key = None

        return AIProviderConfig(
            provider=setting.provider,
            model=setting.model,
            base_url=setting.base_url,
            api_key=raw_key,
            temperature=setting.temperature,
            timeout_seconds=setting.timeout_seconds
        )
    return AIProviderConfig()


def _get_user_evidence(db, user_id: str, resume_record: Optional[Dict[str, Any]] = None):
    facts_model = db.query(CandidateFactsModel).filter(CandidateFactsModel.user_id == user_id).first()
    profile_model = db.query(UserProfileModel).filter(UserProfileModel.user_id == user_id).first()

    facts_dict = facts_model.facts if facts_model else {}
    profile_dict = {
        "name": profile_model.name,
        "title": profile_model.title,
        "bio": profile_model.bio
    } if profile_model else {}

    return build_evidence_ledger(
        user_id=user_id,
        resume_record=resume_record,
        facts_record=facts_dict,
        profile_record=profile_dict
    )


# =========================================================================
# PROVIDER MANAGEMENT ENDPOINTS
# =========================================================================
@router.get("/providers/health")
def get_providers_health(user: UserSession = Depends(get_current_user_required)):
    """Check connectivity and discover models across all configured providers."""
    return {"providers": check_all_providers()}

@router.get("/providers/config")
def get_provider_config(user: UserSession = Depends(get_current_user_required)):
    """Get active user provider settings without exposing sensitive credentials."""
    with SessionLocal() as db:
        cfg = _get_user_ai_config(db, user.id)
        setting = db.query(AIProviderSettingModel).filter(AIProviderSettingModel.user_id == user.id).first()
        return {
            "provider": cfg.provider,
            "model": cfg.model,
            "base_url": cfg.base_url,
            "temperature": cfg.temperature,
            "timeout_seconds": cfg.timeout_seconds,
            "has_api_key": bool(cfg.api_key),
            "api_key_redacted": setting.api_key_redacted if setting else None
        }

@router.post("/providers/config")
@router.put("/providers/config")
def update_provider_config(req: AIProviderConfig, user: UserSession = Depends(get_current_user_required)):
    """Update active user provider settings securely with encrypted key storage."""
    with SessionLocal() as db:
        setting = db.query(AIProviderSettingModel).filter(AIProviderSettingModel.user_id == user.id).first()
        if not setting:
            setting = AIProviderSettingModel(user_id=user.id)
            db.add(setting)

        setting.provider = req.provider
        setting.model = req.model
        setting.base_url = req.base_url

        # Handle API key encryption safely
        if req.api_key and req.api_key.strip():
            key_val = req.api_key.strip()
            if key_val in ("__CLEAR__", "__DELETE__"):
                setting.api_key_encrypted = None
                setting.api_key_redacted = None
            elif not ("..." in key_val or key_val == "***"):
                # New raw key provided: encrypt at rest and store redacted mask
                setting.api_key_encrypted = encrypt_credential(key_val)
                setting.api_key_redacted = mask_credential(key_val)
            # If masked value submitted, preserve existing encrypted credential without overwriting!
        elif req.api_key == "":
            # Explicit empty string does not overwrite unless clear token is sent
            pass

        setting.temperature = req.temperature
        setting.timeout_seconds = req.timeout_seconds
        db.commit()

        return {
            "status": "updated",
            "provider": setting.provider,
            "model": setting.model,
            "base_url": setting.base_url,
            "temperature": setting.temperature,
            "timeout_seconds": setting.timeout_seconds,
            "has_api_key": bool(setting.api_key_encrypted),
            "api_key_redacted": setting.api_key_redacted
        }

@router.post("/providers/test")
def test_provider_connection(config: Optional[AIProviderConfig] = None, user: UserSession = Depends(get_current_user_required)):
    """Test roundtrip completion on specified or active provider."""
    p = get_provider(config)
    health = p.health()
    if health.status == "offline":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Provider '{p.name}' is offline: {health.message}"
        )
    try:
        reply = p.generate(prompt="Respond with the single word: OK", max_tokens=10)
        return {
            "status": "success",
            "provider": p.name,
            "health": health,
            "response": str(reply).strip()
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Provider '{p.name}' failed test completion: {e}"
        )


# =========================================================================
# JOB ANALYSIS & MATCHING ENDPOINTS
# =========================================================================
@router.post("/analyze-job", response_model=JobDescriptionAnalysis)
def analyze_job(req: ReadWordsRequest, user: UserSession = Depends(get_current_user_required)):
    """Extract structured requirements, skills, experience, and responsibilities from a job description."""
    with SessionLocal() as db:
        p_cfg = _get_user_ai_config(db, user.id)
    p = get_provider(p_cfg)
    return analyze_job_description(req.job_description, provider=p)

@router.post("/match", response_model=ResumeMatchReport)
def match_resume(req: ReadWordsRequest, user: UserSession = Depends(get_current_user_required)):
    """Compute evidence-grounded match between candidate claims and target job requirements."""
    target_resume_id = req.resume_id or "primary"
    resume = RESUMES_DB.get(target_resume_id)
    if not resume or resume.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target resume not found.")

    with SessionLocal() as db:
        p_cfg = _get_user_ai_config(db, user.id)
        ledger = _get_user_evidence(db, user.id, resume)
    
    p = get_provider(p_cfg)
    analysis = analyze_job_description(req.job_description, provider=p)
    return match_resume_to_job(ledger, analysis, provider=p)

@router.post("/read-words")
def read_words(req: ReadWordsRequest, user: UserSession = Depends(get_current_user_required)):
    """
    Contract-compatible endpoint for frontend: returns match rate and keyword coverage.
    Grounded in candidate evidence ledger.
    """
    target_resume_id = req.resume_id or "primary"
    resume = RESUMES_DB.get(target_resume_id)
    if not resume or resume.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target resume not found.")

    with SessionLocal() as db:
        p_cfg = _get_user_ai_config(db, user.id)
        ledger = _get_user_evidence(db, user.id, resume)

    p = get_provider(p_cfg)
    analysis = analyze_job_description(req.job_description, provider=p)
    match_report = match_resume_to_job(ledger, analysis, provider=p)

    matched_kw = [m.requirement for m in match_report.matched_requirements]
    missing_kw = match_report.missing_requirements

    return {
        "match_rate": match_report.overall_score,
        "total_keywords_found": len(analysis.important_keywords),
        "matched_keywords": matched_kw[:20],
        "missing_keywords": missing_kw[:20],
        "top_skills": analysis.required_skills[:10],
        "skill_gaps": match_report.skill_gaps,
        "provider_used": match_report.provider_used,
        "model_used": match_report.model_used,
        "fallback_activated": match_report.fallback_activated,
        "inference_source": match_report.inference_source,
        "fallback_reason": match_report.fallback_reason
    }


# =========================================================================
# EVIDENCE-GROUNDED TAILORING ENDPOINTS
# =========================================================================
@router.post("/plan")
def create_tailoring_plan(req: TailorPlanRequest, user: UserSession = Depends(get_current_user_required)):
    """
    Generates contextual, evidence-grounded resume tailoring suggestions.
    Guarantees zero fabricated metrics, employers, or skills.
    """
    target_resume_id = req.resume_id or "primary"
    resume = RESUMES_DB.get(target_resume_id)
    if not resume or resume.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target resume not found.")

    with SessionLocal() as db:
        p_cfg = _get_user_ai_config(db, user.id)
        ledger = _get_user_evidence(db, user.id, resume)

    p = get_provider(p_cfg)
    analysis = analyze_job_description(req.job_description, provider=p)
    if req.job_title and req.job_title != "Target Role":
        analysis.job_title = req.job_title
    if req.company_name and req.company_name != "Target Company":
        analysis.company = req.company_name

    plan: TailoringPlanResponse = generate_tailoring_plan(
        resume_id=target_resume_id,
        resume_doc=resume.get("document", {}),
        ledger=ledger,
        analysis=analysis,
        provider=p
    )

    review_dict = plan.model_dump()
    review_dict["id"] = plan.review_id
    review_dict["user_id"] = user.id

    # Persist review session in SQLite
    with SessionLocal() as db:
        m = TailorReviewModel(
            id=plan.review_id,
            user_id=user.id,
            resume_id=target_resume_id,
            job_title=plan.job_title,
            company_name=plan.company_name,
            created_at=datetime.now(timezone.utc).isoformat(),
            total_suggestions=plan.total_suggestions,
            suggestions=[s.model_dump() for s in plan.suggestions],
            status="pending_review",
            events_count=0
        )
        db.add(m)
        db.commit()

    TAILOR_REVIEWS_DB[plan.review_id] = review_dict
    return review_dict

@router.post("/events")
def log_tailor_event(event: TailorEventRequest, user: UserSession = Depends(get_current_user_required)):
    """Record individual human accept/reject decisions on tailoring suggestions."""
    event_id = f"evt_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    
    with SessionLocal() as db:
        rev = db.query(TailorReviewModel).filter(
            TailorReviewModel.id == event.review_id,
            TailorReviewModel.user_id == user.id
        ).first()
        if not rev:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review session not found.")

        evt = TailorEventModel(
            id=event_id,
            review_id=event.review_id,
            user_id=user.id,
            action=event.action,
            line_id=event.line_id,
            original_text=event.original_text,
            new_text=event.new_text,
            reason=event.reason,
            timestamp=now_iso
        )
        db.add(evt)
        rev.events_count = (rev.events_count or 0) + 1
        db.commit()

    return {"status": "ok", "event_id": event_id}

@router.get("/reviews")
def get_tailor_reviews(resume_id: Optional[str] = None, user: UserSession = Depends(get_current_user_required)):
    """List historical tailoring reviews for user."""
    with SessionLocal() as db:
        q = db.query(TailorReviewModel).filter(TailorReviewModel.user_id == user.id)
        if resume_id:
            q = q.filter(TailorReviewModel.resume_id == resume_id)
        reviews = q.order_by(TailorReviewModel.created_at.desc()).all()
        user_reviews = [{
            "id": r.id,
            "user_id": r.user_id,
            "resume_id": r.resume_id,
            "job_title": r.job_title,
            "company_name": r.company_name,
            "created_at": r.created_at,
            "total_suggestions": r.total_suggestions,
            "suggestions": r.suggestions,
            "status": r.status,
            "events_count": r.events_count,
            "tailored_resume_id": r.tailored_resume_id
        } for r in reviews]

    return {"reviews": user_reviews}

@router.post("/apply")
def apply_tailoring(req: ApplyTailoringRequest, user: UserSession = Depends(get_current_user_required)):
    """
    Applies human-approved suggestions transactionally.
    Clones the source resume into a tailored resume copy without altering the original.
    Supports both Phase 6C items/bullets and legacy blocks format.
    """
    with SessionLocal() as db:
        review_model = db.query(TailorReviewModel).filter(
            TailorReviewModel.id == req.review_id,
            TailorReviewModel.user_id == user.id
        ).first()
        if not review_model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review session not found.")
        source_res_id = review_model.resume_id
        job_t = review_model.job_title
        comp_n = review_model.company_name

    source_resume = RESUMES_DB.get(source_res_id or "primary")
    if not source_resume or source_resume.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source resume not found.")
        
    new_doc = copy.deepcopy(source_resume.get("document", {}))
    change_map = {c["line_id"]: c["new_text"] for c in req.accepted_changes if "line_id" in c and "new_text" in c}
    
    # 1. Update modern Phase 6C structure (items -> bullets)
    for sec in new_doc.get("sections", []):
        sec_id = sec.get("id", "")
        for i_idx, item in enumerate(sec.get("items", [])):
            item_id = item.get("id", f"{sec_id}_item_{i_idx}")
            bullets = item.get("bullets", [])
            for b_idx in range(len(bullets)):
                line_id = f"{item_id}_b{b_idx}"
                if line_id in change_map:
                    bullets[b_idx] = change_map[line_id]

    # 2. Update legacy structure if present (blocks -> lines)
    for sec in new_doc.get("sections", []):
        for blk in sec.get("blocks", []):
            for line in blk.get("lines", []):
                lid = line.get("id")
                if lid in change_map:
                    line["text"] = change_map[lid]
                    if "rewrite" in line:
                        del line["rewrite"]
                        
    new_resume_id = f"res_{uuid.uuid4().hex[:8]}"
    tailored_title = req.title or f"Tailored: {job_t or 'Software Engineer'} @ {comp_n or 'Company'}"
    
    new_resume = {
        "id": new_resume_id,
        "user_id": user.id,
        "title": tailored_title,
        "ats_score": min(98, source_resume.get("ats_score", 85) + 6),
        "target_role": job_t or "Software Engineer",
        "target_company": comp_n or "Target",
        "version": 1,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_primary": False,
        "document": new_doc
    }
    
    RESUMES_DB[new_resume_id] = new_resume
    
    with SessionLocal() as db:
        rev = db.query(TailorReviewModel).filter(TailorReviewModel.id == req.review_id).first()
        if rev:
            rev.status = "applied"
            rev.tailored_resume_id = new_resume_id
            db.commit()
    
    return {
        "message": "Tailored resume created successfully",
        "resume_id": new_resume_id,
        "title": tailored_title,
        "ats_score": new_resume["ats_score"]
    }


# =========================================================================
# FACT VERIFICATION & COVER LETTER ENDPOINTS
# =========================================================================
@router.post("/verify-claim", response_model=FactVerificationResult)
def verify_claim(req: VerifyClaimRequest, user: UserSession = Depends(get_current_user_required)):
    """Classifies a candidate claim against verified evidence without automated upgrading."""
    target_resume_id = req.resume_id or "primary"
    resume = RESUMES_DB.get(target_resume_id)
    with SessionLocal() as db:
        ledger = _get_user_evidence(db, user.id, resume)
    return verify_candidate_claim(req.claim, ledger)

@router.post("/cover-letter", response_model=CoverLetterResponse)
def create_cover_letter(req: CoverLetterRequest, user: UserSession = Depends(get_current_user_required)):
    """Generates a role-specific cover letter using actual candidate evidence only."""
    target_resume_id = req.resume_id or "primary"
    resume = RESUMES_DB.get(target_resume_id)
    if not resume or resume.get("user_id") != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target resume not found.")

    with SessionLocal() as db:
        p_cfg = _get_user_ai_config(db, user.id)
        ledger = _get_user_evidence(db, user.id, resume)

    p = get_provider(p_cfg)
    analysis = analyze_job_description(req.job_description, provider=p)
    if req.job_title:
        analysis.job_title = req.job_title
    if req.company_name:
        analysis.company = req.company_name

    res: CoverLetterResponse = generate_cover_letter(
        ledger=ledger,
        analysis=analysis,
        tone=req.tone,
        length=req.length,
        provider=p
    )

    # Persist in database
    with SessionLocal() as db:
        cl_model = CoverLetterModel(
            id=res.id,
            user_id=user.id,
            job_title=res.job_title,
            company_name=res.recipient_company,
            tone=res.tone,
            length=res.length,
            content=res.content,
            paragraphs=res.paragraphs,
            grounded_claims=res.grounded_claims,
            created_at=res.created_at,
            updated_at=res.created_at
        )
        db.add(cl_model)
        db.commit()

    return res

@router.get("/cover-letters")
def list_cover_letters(user: UserSession = Depends(get_current_user_required)):
    """List historical grounded cover letters generated for user."""
    with SessionLocal() as db:
        records = db.query(CoverLetterModel).filter(CoverLetterModel.user_id == user.id).order_by(CoverLetterModel.created_at.desc()).all()
        return {
            "cover_letters": [{
                "id": cl.id,
                "job_title": cl.job_title,
                "company_name": cl.company_name,
                "tone": cl.tone,
                "length": cl.length,
                "content": cl.content,
                "paragraphs": cl.paragraphs,
                "grounded_claims": cl.grounded_claims,
                "created_at": cl.created_at
            } for cl in records]
        }
