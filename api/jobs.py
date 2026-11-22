import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel
from api.auth import get_current_user_optional, get_current_user_required
from api.schemas import UserSession
from api.db import SessionLocal
from api.models import (
    JobApplicationModel,
    SavedSearchModel,
    JobListingModel,
    CompanyRegistryModel,
    JobSyncLogModel,
    ResumeModel,
    UserProfileModel,
    UserPreferenceModel
)
from api.ai.evidence import build_evidence_ledger
from api.jobs_engine.service import job_discovery_service
from api.jobs_engine.registry import register_company, list_companies

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])

# Public / Authenticated Job Feed
JOBS_FEED_DB = [
    {
        "id": "job_101",
        "title": "Senior Full-Stack Engineer",
        "company": "Stripe",
        "logo_url": "https://logo.clearbit.com/stripe.com",
        "location": "San Francisco, CA",
        "is_remote": True,
        "salary_range": "$175,000 - $220,000",
        "skills": ["React", "TypeScript", "Python", "FastAPI", "PostgreSQL", "AWS"],
        "match_percentage": 94,
        "posted_at": "2 hours ago",
        "description": "We are seeking a Senior Full-Stack Engineer to lead critical platform initiatives across our developer billing infrastructure.",
        "apply_url": "https://stripe.com/jobs/101"
    },
    {
        "id": "job_102",
        "title": "Distributed Systems Engineer",
        "company": "Datadog",
        "logo_url": "https://logo.clearbit.com/datadoghq.com",
        "location": "New York, NY",
        "is_remote": True,
        "salary_range": "$180,000 - $230,000",
        "skills": ["Go", "Python", "Distributed Systems", "Kafka", "Docker", "Kubernetes"],
        "match_percentage": 89,
        "posted_at": "5 hours ago",
        "description": "Design and build telemetry pipelines processing millions of events per second with sub-second latency.",
        "apply_url": "https://datadog.com/jobs/102"
    },
    {
        "id": "job_103",
        "title": "Frontend Architect (Design Systems)",
        "company": "Linear",
        "logo_url": "https://logo.clearbit.com/linear.app",
        "location": "San Francisco, CA",
        "is_remote": True,
        "salary_range": "$165,000 - $210,000",
        "skills": ["React", "TypeScript", "Vite", "Design Systems", "Web Performance"],
        "match_percentage": 92,
        "posted_at": "1 day ago",
        "description": "Shape the future of developer workflows with unmatched attention to typography, micro-interactions, and 60fps performance.",
        "apply_url": "https://linear.app/jobs/103"
    },
    {
        "id": "job_104",
        "title": "Senior Backend Software Engineer",
        "company": "Retool",
        "logo_url": "https://logo.clearbit.com/retool.com",
        "location": "San Francisco, CA",
        "is_remote": False,
        "salary_range": "$170,000 - $215,000",
        "skills": ["Node.js", "Python", "PostgreSQL", "Redis", "Security"],
        "match_percentage": 86,
        "posted_at": "2 days ago",
        "description": "Scale enterprise connectors, on-prem deployment agents, and real-time execution sandboxes.",
        "apply_url": "https://retool.com/jobs/104"
    },
    {
        "id": "job_105",
        "title": "AI Platform Engineer",
        "company": "Anthropic",
        "logo_url": "https://logo.clearbit.com/anthropic.com",
        "location": "San Francisco, CA",
        "is_remote": True,
        "salary_range": "$200,000 - $260,000",
        "skills": ["Python", "PyTorch", "FastAPI", "Ray", "Distributed Training"],
        "match_percentage": 84,
        "posted_at": "3 days ago",
        "description": "Construct high-throughput serving architectures and evaluation harnesses for state-of-the-art frontier models.",
        "apply_url": "https://anthropic.com/jobs/105"
    }
]

# Tracked Job Applications (Kanban) - Scoped by user_id
JOB_APPLICATIONS_DB: List[Dict[str, Any]] = [
    {
        "id": "app_001",
        "user_id": "usr_demo_101",
        "job_id": "job_101",
        "title": "Senior Full-Stack Engineer",
        "company": "Stripe",
        "location": "San Francisco, CA (Remote)",
        "salary_range": "$175k - $220k",
        "stage": "interview",
        "match_percentage": 94,
        "applied_date": "2026-11-10",
        "notes": "Recruiter screen completed with Sarah. Technical systems design interview scheduled for Thursday.",
        "next_step": "Technical Round with Staff Architect",
        "next_step_date": "2026-11-19"
    },
    {
        "id": "app_002",
        "user_id": "usr_demo_101",
        "job_id": "job_103",
        "title": "Frontend Architect",
        "company": "Linear",
        "location": "San Francisco, CA (Remote)",
        "salary_range": "$165k - $210k",
        "stage": "applied",
        "match_percentage": 92,
        "applied_date": "2026-11-14",
        "notes": "Application submitted via Greenhouse with tailored portfolio resume.",
        "next_step": "Recruiter Screen",
        "next_step_date": "2026-11-21"
    },
    {
        "id": "app_003",
        "user_id": "usr_demo_101",
        "job_id": "job_102",
        "title": "Distributed Systems Engineer",
        "company": "Datadog",
        "location": "New York, NY (Remote)",
        "salary_range": "$180k - $230k",
        "stage": "offer",
        "match_percentage": 89,
        "applied_date": "2026-10-28",
        "notes": "Received written offer package. Equity grant 12,000 RSUs vesting over 4 years.",
        "next_step": "Decision by Monday",
        "next_step_date": "2026-11-24"
    },
    {
        "id": "app_004",
        "user_id": "usr_demo_101",
        "job_id": "job_105",
        "title": "AI Platform Engineer",
        "company": "Anthropic",
        "location": "San Francisco, CA (Remote)",
        "salary_range": "$200k - $260k",
        "stage": "saved",
        "match_percentage": 84,
        "applied_date": None,
        "notes": "Bookmarked for weekend application sprint.",
        "next_step": "Tailor ML experience resume",
        "next_step_date": "2026-11-18"
    }
]

SAVED_SEARCHES_DB: List[Dict[str, Any]] = [
    {
        "id": "search_001",
        "user_id": "usr_demo_101",
        "name": "Remote Full-Stack ($180k+)",
        "query": "Full-Stack Remote",
        "is_remote": True,
        "created_at": "2026-11-12"
    }
]

class CreateApplicationRequest(BaseModel):
    job_id: Optional[str] = None
    title: str
    company: str
    location: Optional[str] = "Remote"
    salary_range: Optional[str] = None
    stage: Optional[str] = "saved"
    match_percentage: Optional[int] = 85
    notes: Optional[str] = ""

class UpdateApplicationRequest(BaseModel):
    stage: Optional[str] = None
    notes: Optional[str] = None
    next_step: Optional[str] = None
    next_step_date: Optional[str] = None

class SavedSearchRequest(BaseModel):
    name: str
    query: str
    is_remote: Optional[bool] = False

from sqlalchemy import or_, and_, desc
from api.jobs_engine.registry import detect_ats_from_career_url

class CompanyRegistrationRequest(BaseModel):
    name: str
    career_page_url: Optional[str] = None
    ats_provider: Optional[str] = None
    ats_board_token: Optional[str] = None
    website_url: Optional[str] = None
    country: Optional[str] = "India"

class SyncJobsRequest(BaseModel):
    company_id: Optional[str] = None
    source: Optional[str] = None

def _verify_admin_access(user: UserSession):
    """
    Enforces strict administrator authorization for job discovery orchestration endpoints.
    Requires explicit 'admin' role or 'admin' entitlement. Regular users (even with 'job_search'
    entitlements) are rejected with HTTP 403 Forbidden.
    """
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required."
        )
    is_admin = (
        user.role == "admin"
        or "admin" in (user.entitlements or [])
    )
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privilege required to manage job providers and triggers."
        )

def _format_job_model(
    job: JobListingModel,
    resume_doc: Optional[dict] = None,
    profile_record: Optional[dict] = None,
    preferences_record: Optional[dict] = None,
    target_role: Optional[str] = None,
    ledger: Optional[Any] = None
) -> Dict[str, Any]:
    skills = (job.required_skills or []) + (job.preferred_skills or [])
    match_pct = None
    match_report = None
    if resume_doc:
        try:
            match_report = job_discovery_service.calculate_resume_job_match(
                resume_doc=resume_doc,
                job=job,
                profile_record=profile_record,
                preferences_record=preferences_record,
                target_role=target_role,
                ledger=ledger
            )
            match_pct = match_report.get("match_percentage")
        except Exception:
            pass
    else:
        match_report = {
            "status": "no_resume",
            "message": "Upload or select a resume to calculate AI fit score."
        }

    domain = job.company_website or ""
    if domain:
        domain = domain.replace("https://", "").replace("http://", "").split("/")[0]

    return {
        "id": job.id,
        "external_job_id": job.external_job_id,
        "title": job.job_title,
        "company": job.company_name,
        "company_website": job.company_website,
        "logo_url": f"https://logo.clearbit.com/{domain}" if domain else None,
        "location": job.location,
        "city": job.city,
        "country": job.country,
        "is_remote": job.workplace_type == "remote",
        "workplace_type": job.workplace_type,
        "employment_type": job.employment_type,
        "experience_level": job.experience_level,
        "salary_range": job.salary_formatted or "Competitive",
        "salary_min": job.salary_min,
        "salary_max": job.salary_max,
        "salary_currency": job.salary_currency,
        "skills": skills if skills else ["Software Engineering"],
        "required_skills": job.required_skills or [],
        "preferred_skills": job.preferred_skills or [],
        "department": job.department or "Engineering",
        "match_percentage": match_pct,
        "match_report": match_report,
        "posted_at": job.posted_at,
        "description": job.description,
        "apply_url": job.application_url,
        "application_url": job.application_url,
        "source_name": job.source_name,
        "verification_status": job.verification_status,
        "last_verified_at": job.last_verified_at
    }

@router.get("/feed")
def get_jobs_feed(
    query: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    remote_only: Optional[bool] = Query(False),
    workplace_type: Optional[str] = Query(None),
    experience_level: Optional[str] = Query(None),
    employment_type: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("best_match"),
    resume_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    user: Optional[UserSession] = Depends(get_current_user_optional)
):
    with SessionLocal() as db:
        db_job_count = db.query(JobListingModel).filter(JobListingModel.is_active == True).count()

        if db_job_count > 0:
            q = db.query(JobListingModel).filter(JobListingModel.is_active == True)

            if remote_only:
                q = q.filter(JobListingModel.workplace_type == "remote")
            elif workplace_type:
                q = q.filter(JobListingModel.workplace_type == workplace_type.lower())

            if country and country.lower() != "all":
                q = q.filter(JobListingModel.country.ilike(f"%{country}%"))

            if location:
                q = q.filter(or_(
                    JobListingModel.location.ilike(f"%{location}%"),
                    JobListingModel.city.ilike(f"%{location}%")
                ))

            if company:
                q = q.filter(JobListingModel.company_name.ilike(f"%{company}%"))

            if experience_level and experience_level.lower() != "all":
                q = q.filter(JobListingModel.experience_level == experience_level.lower())

            if employment_type and employment_type.lower() != "all":
                q = q.filter(JobListingModel.employment_type == employment_type.lower())

            if source and source.lower() != "all":
                q = q.filter(JobListingModel.source_name == source.lower())

            if query:
                search_term = f"%{query}%"
                q = q.filter(or_(
                    JobListingModel.job_title.ilike(search_term),
                    JobListingModel.company_name.ilike(search_term),
                    JobListingModel.description.ilike(search_term),
                    JobListingModel.location.ilike(search_term)
                ))

            # Retrieve authenticated user profile and resume data
            resume_doc = None
            active_resume = None
            user_resumes = []
            profile_record = None
            preferences_record = None
            ledger = None

            if user:
                # User Profile
                prof = db.query(UserProfileModel).filter(UserProfileModel.user_id == user.id).first()
                if prof:
                    profile_record = {
                        "name": prof.name,
                        "title": prof.title,
                        "location": prof.location,
                        "bio": prof.bio
                    }

                pref = db.query(UserPreferenceModel).filter(UserPreferenceModel.user_id == user.id).first()
                if pref:
                    preferences_record = {
                        "compact_view": pref.compact_view
                    }

                # Resumes
                user_resumes_db = db.query(ResumeModel).filter(ResumeModel.user_id == user.id).all()
                user_resumes = [
                    {
                        "id": r.id,
                        "title": r.title,
                        "is_primary": r.is_primary,
                        "target_role": r.target_role,
                        "ats_score": r.ats_score,
                        "updated_at": r.updated_at
                    }
                    for r in user_resumes_db
                ]

                # Specific requested resume or primary or fallback
                target_res_model = None
                if resume_id:
                    target_res_model = next((r for r in user_resumes_db if r.id == resume_id), None)
                if not target_res_model:
                    target_res_model = next((r for r in user_resumes_db if r.is_primary), None)
                if not target_res_model and user_resumes_db:
                    target_res_model = user_resumes_db[0]

                if target_res_model and isinstance(target_res_model.document, dict):
                    resume_doc = target_res_model.document
                    active_resume = {
                        "id": target_res_model.id,
                        "title": target_res_model.title,
                        "is_primary": target_res_model.is_primary,
                        "target_role": target_res_model.target_role,
                        "ats_score": target_res_model.ats_score
                    }
                    ledger = build_evidence_ledger(
                        user_id=user.id,
                        resume_record={"document": resume_doc},
                        profile_record=profile_record
                    )
                    active_resume["total_skills"] = len(ledger.skills)

            total = q.count()

            if sort_by == "best_match" and resume_doc:
                # Rank top candidate pool for sub-second responsive loading
                if not query:
                    candidate_pool = q.order_by(JobListingModel.posted_at.desc()).limit(200).all()
                else:
                    candidate_pool = q.order_by(JobListingModel.posted_at.desc()).limit(100).all()

                scored_jobs = [
                    _format_job_model(
                        j,
                        resume_doc=resume_doc,
                        profile_record=profile_record,
                        preferences_record=preferences_record,
                        target_role=active_resume.get("target_role") if active_resume else None,
                        ledger=ledger
                    )
                    for j in candidate_pool
                ]
                scored_jobs.sort(
                    key=lambda j: (j["match_percentage"] is not None, j["match_percentage"] or 0, j["posted_at"] or ""),
                    reverse=True
                )
                offset = (page - 1) * page_size
                formatted_jobs = scored_jobs[offset : offset + page_size]
            else:
                if sort_by == "newest":
                    q = q.order_by(JobListingModel.posted_at.desc())
                elif sort_by == "salary_high":
                    q = q.order_by(JobListingModel.salary_max.desc().nullslast())
                else:
                    q = q.order_by(JobListingModel.posted_at.desc())

                offset = (page - 1) * page_size
                items = q.offset(offset).limit(page_size).all()
                formatted_jobs = [
                    _format_job_model(
                        j,
                        resume_doc=resume_doc,
                        profile_record=profile_record,
                        preferences_record=preferences_record,
                        target_role=active_resume.get("target_role") if active_resume else None,
                        ledger=ledger
                    )
                    for j in items
                ]

            total_pages = max(1, (total + page_size - 1) // page_size) if total > 0 else 0

            return {
                "jobs": formatted_jobs,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "active_resume": active_resume,
                "user_resumes": user_resumes,
                "facets": {
                    "total_active": db_job_count,
                    "remote_count": db.query(JobListingModel).filter(JobListingModel.is_active == True, JobListingModel.workplace_type == "remote").count(),
                    "india_count": db.query(JobListingModel).filter(JobListingModel.is_active == True, JobListingModel.country == "India").count()
                },
                "rank_status_token": "rank_sync_completed"
            }

        # Zero fabrication: If no jobs exist in the database, return empty results truthfully
        return {
            "jobs": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0,
            "active_resume": None,
            "user_resumes": [],
            "facets": {
                "total_active": 0,
                "remote_count": 0,
                "india_count": 0
            },
            "rank_status_token": "no_jobs_found"
        }

@router.get("/detail/{job_id}")
def get_job_detail(
    job_id: str,
    resume_id: Optional[str] = Query(None),
    user: Optional[UserSession] = Depends(get_current_user_optional)
):
    with SessionLocal() as db:
        job = db.query(JobListingModel).filter(JobListingModel.id == job_id).first()
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

        resume_doc = None
        profile_record = None
        target_role = None
        ledger = None

        if user:
            prof = db.query(UserProfileModel).filter(UserProfileModel.user_id == user.id).first()
            if prof:
                profile_record = {"name": prof.name, "title": prof.title, "location": prof.location, "bio": prof.bio}

            user_resumes = db.query(ResumeModel).filter(ResumeModel.user_id == user.id).all()
            target_res = None
            if resume_id:
                target_res = next((r for r in user_resumes if r.id == resume_id), None)
            if not target_res:
                target_res = next((r for r in user_resumes if r.is_primary), None)
            if not target_res and user_resumes:
                target_res = user_resumes[0]

            if target_res and isinstance(target_res.document, dict):
                resume_doc = target_res.document
                target_role = target_res.target_role
                ledger = build_evidence_ledger(user.id, resume_record={"document": resume_doc}, profile_record=profile_record)

        formatted = _format_job_model(job, resume_doc, profile_record=profile_record, target_role=target_role, ledger=ledger)

        # Similar active jobs
        similar = db.query(JobListingModel).filter(
            JobListingModel.id != job.id,
            JobListingModel.is_active == True,
            or_(
                JobListingModel.company_name == job.company_name,
                JobListingModel.workplace_type == job.workplace_type
            )
        ).limit(4).all()

        return {
            "job": formatted,
            "similar_jobs": [_format_job_model(s, resume_doc, profile_record=profile_record, target_role=target_role, ledger=ledger) for s in similar]
        }


@router.post("/sync")
def trigger_job_sync(
    req: Optional[SyncJobsRequest] = None,
    user: UserSession = Depends(get_current_user_required)
):
    _verify_admin_access(user)
    with SessionLocal() as db:
        if req and req.company_id:
            comp = db.query(CompanyRegistryModel).filter(CompanyRegistryModel.id == req.company_id).first()
            if not comp:
                raise HTTPException(status_code=404, detail="Company not found")
            res = job_discovery_service.sync_company(db, comp)
            return {"status": "completed", "result": res}
        else:
            res = job_discovery_service.sync_all_registered_companies(db)
            return {"status": "completed", "result": res}

@router.get("/companies")
def get_registered_companies():
    with SessionLocal() as db:
        comps = list_companies(db, active_only=False)
        return {
            "companies": [
                {
                    "id": c.id,
                    "name": c.name,
                    "ats_provider": c.ats_provider,
                    "ats_board_token": c.ats_board_token,
                    "career_page_url": c.career_page_url,
                    "country": c.country,
                    "status": c.status,
                    "last_successful_sync": c.last_successful_sync,
                    "is_active": c.is_active
                }
                for c in comps
            ],
            "total": len(comps)
        }

@router.post("/companies")
def register_new_company(
    req: CompanyRegistrationRequest,
    user: UserSession = Depends(get_current_user_required)
):
    _verify_admin_access(user)
    with SessionLocal() as db:
        provider = req.ats_provider
        board_token = req.ats_board_token

        if not provider or not board_token:
            detected = detect_ats_from_career_url(req.career_page_url or "")
            if detected:
                provider, board_token = detected
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Could not automatically detect ATS provider. Please provide ats_provider and ats_board_token."
                )

        try:
            comp = register_company(
                db=db,
                name=req.name,
                ats_provider=provider,
                ats_board_token=board_token,
                career_page_url=req.career_page_url,
                website_url=req.website_url,
                country=req.country or "India"
            )
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))

        # Attempt immediate synchronization
        sync_result = job_discovery_service.sync_company(db, comp)
        return {
            "company": {
                "id": comp.id,
                "name": comp.name,
                "ats_provider": comp.ats_provider,
                "ats_board_token": comp.ats_board_token
            },
            "sync_result": sync_result
        }

@router.post("/verify/{job_id}")
def verify_job_endpoint(
    job_id: str,
    user: UserSession = Depends(get_current_user_required)
):
    with SessionLocal() as db:
        res = job_discovery_service.verify_job_status(db, job_id)
        return res

@router.get("/rank-status/{job_id}")
def get_rank_status(
    job_id: str,
    resume_id: Optional[str] = "primary",
    user: Optional[UserSession] = Depends(get_current_user_optional)
):
    with SessionLocal() as db:
        job = db.query(JobListingModel).filter(JobListingModel.id == job_id).first()
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

        resume_doc = None
        if user:
            res = db.query(ResumeModel).filter(ResumeModel.user_id == user.id, ResumeModel.is_primary == True).first()
            if not res:
                res = db.query(ResumeModel).filter(ResumeModel.user_id == user.id).first()
            if res and isinstance(res.document, dict):
                resume_doc = res.document
        
        if resume_doc:
            report = job_discovery_service.calculate_resume_job_match(resume_doc, job)
            return {
                "status": "completed",
                "job_id": job_id,
                "resume_id": resume_id,
                "match_percentage": report["match_percentage"],
                "top_aligned_skills": report["matched_skills"][:3],
                "match_report": report
            }
        return {
            "status": "no_resume",
            "job_id": job_id,
            "resume_id": resume_id,
            "match_percentage": None,
            "top_aligned_skills": (job.required_skills or [])[:3],
            "message": "Upload or select a resume to calculate fit score."
        }

def _app_to_dict(a: JobApplicationModel) -> Dict[str, Any]:
    return {
        "id": a.id,
        "user_id": a.user_id,
        "job_id": a.job_id,
        "title": a.title,
        "company": a.company,
        "location": a.location or "Remote",
        "salary_range": a.salary_range or "Competitive",
        "stage": a.stage,
        "match_percentage": a.match_percentage,
        "applied_date": a.applied_date,
        "notes": a.notes or "",
        "next_step": a.next_step or "Initial prep",
        "next_step_date": a.next_step_date
    }

def _search_to_dict(s: SavedSearchModel) -> Dict[str, Any]:
    return {
        "id": s.id,
        "user_id": s.user_id,
        "name": s.name,
        "query": s.query,
        "is_remote": s.is_remote,
        "created_at": s.created_at
    }

@router.get("/applications")
def list_applications(user: UserSession = Depends(get_current_user_required)):
    with SessionLocal() as db:
        apps = db.query(JobApplicationModel).filter(JobApplicationModel.user_id == user.id).all()
        user_apps = [_app_to_dict(a) for a in apps]

    return {
        "applications": user_apps,
        "stages": ["saved", "applied", "interview", "offer", "rejected"],
        "counts": {
            "saved": len([a for a in user_apps if a["stage"] == "saved"]),
            "applied": len([a for a in user_apps if a["stage"] == "applied"]),
            "interview": len([a for a in user_apps if a["stage"] == "interview"]),
            "offer": len([a for a in user_apps if a["stage"] == "offer"]),
            "rejected": len([a for a in user_apps if a["stage"] == "rejected"])
        }
    }

@router.post("/applications")
def create_application(req: CreateApplicationRequest, user: UserSession = Depends(get_current_user_required)):
    app_id = f"app_{uuid.uuid4().hex[:8]}"
    applied_d = datetime.now(timezone.utc).strftime("%Y-%m-%d") if req.stage == "applied" else None
    
    with SessionLocal() as db:
        new_app = JobApplicationModel(
            id=app_id,
            user_id=user.id,
            job_id=req.job_id or f"custom_{uuid.uuid4().hex[:6]}",
            title=req.title,
            company=req.company,
            location=req.location or "Remote",
            salary_range=req.salary_range or "Competitive",
            stage=req.stage or "saved",
            match_percentage=req.match_percentage or 85,
            applied_date=applied_d,
            notes=req.notes or "",
            next_step="Initial prep",
            next_step_date=None,
            created_at=datetime.now(timezone.utc).isoformat()
        )
        db.add(new_app)
        db.commit()
        res = _app_to_dict(new_app)

    return res

@router.patch("/applications/{application_id}")
def update_application(
    application_id: str,
    req: UpdateApplicationRequest,
    user: UserSession = Depends(get_current_user_required)
):
    with SessionLocal() as db:
        app = db.query(JobApplicationModel).filter(
            JobApplicationModel.id == application_id,
            JobApplicationModel.user_id == user.id
        ).first()

        if not app:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
            
        if req.stage:
            app.stage = req.stage
            if req.stage == "applied" and not app.applied_date:
                app.applied_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if req.notes is not None:
            app.notes = req.notes
        if req.next_step is not None:
            app.next_step = req.next_step
        if req.next_step_date is not None:
            app.next_step_date = req.next_step_date
            
        db.commit()
        res = _app_to_dict(app)

    return res

@router.delete("/applications/{application_id}")
def delete_application(application_id: str, user: UserSession = Depends(get_current_user_required)):
    with SessionLocal() as db:
        app = db.query(JobApplicationModel).filter(
            JobApplicationModel.id == application_id,
            JobApplicationModel.user_id == user.id
        ).first()

        if not app:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
        
        db.delete(app)
        db.commit()

    return {"status": "deleted", "id": application_id}

@router.get("/saved-searches")
def get_saved_searches(user: UserSession = Depends(get_current_user_required)):
    with SessionLocal() as db:
        searches = db.query(SavedSearchModel).filter(SavedSearchModel.user_id == user.id).all()
        user_searches = [_search_to_dict(s) for s in searches]
    return {"saved_searches": user_searches}

@router.post("/saved-searches")
def add_saved_search(req: SavedSearchRequest, user: UserSession = Depends(get_current_user_required)):
    search_id = f"search_{uuid.uuid4().hex[:6]}"
    with SessionLocal() as db:
        item = SavedSearchModel(
            id=search_id,
            user_id=user.id,
            name=req.name,
            query=req.query,
            is_remote=req.is_remote or False,
            created_at=datetime.now(timezone.utc).strftime("%Y-%m-%d")
        )
        db.add(item)
        db.commit()
        res = _search_to_dict(item)

    return res
