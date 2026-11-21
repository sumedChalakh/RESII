import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel
from api.auth import get_current_user_optional, get_current_user_required
from api.schemas import UserSession
from api.db import SessionLocal
from api.models import JobApplicationModel, SavedSearchModel

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

@router.get("/feed")
def get_jobs_feed(
    query: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    remote_only: Optional[bool] = Query(False),
    sort_by: Optional[str] = Query("best_match"),
    user: Optional[UserSession] = Depends(get_current_user_optional)
):
    results = list(JOBS_FEED_DB)
    
    if remote_only:
        results = [j for j in results if j["is_remote"]]
        
    if query:
        q = query.lower()
        results = [
            j for j in results 
            if q in j["title"].lower() 
            or any(q in s.lower() for s in j["skills"])
            or q in j["description"].lower()
        ]
        
    if company:
        c = company.lower()
        results = [j for j in results if c in j["company"].lower()]
        
    if sort_by == "best_match":
        results.sort(key=lambda j: j["match_percentage"], reverse=True)
        
    return {
        "jobs": results,
        "total": len(results),
        "rank_status_token": "rank_sync_completed"
    }

@router.get("/rank-status/{job_id}")
def get_rank_status(job_id: str, resume_id: Optional[str] = "primary"):
    job = next((j for j in JOBS_FEED_DB if j["id"] == job_id), None)
    if not job:
        return {"status": "completed", "match_percentage": 85}
        
    return {
        "status": "completed",
        "job_id": job_id,
        "resume_id": resume_id,
        "match_percentage": job["match_percentage"],
        "top_aligned_skills": job["skills"][:3]
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
