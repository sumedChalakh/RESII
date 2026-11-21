import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.auth import get_current_user_required
from api.schemas import UserSession
from api.db import SessionLocal
from api.models import AutoApplyPreferenceModel, CandidateFactsModel, SubmissionHistoryModel

router = APIRouter(prefix="/api/auto-apply", tags=["Auto-Apply"])

# In-memory stores for Auto-Apply isolated by user_id
AUTO_APPLY_PREFERENCES_BY_USER: Dict[str, Dict[str, Any]] = {
    "usr_demo_101": {
        "enabled": True,
        "target_roles": ["Senior Full-Stack Engineer", "Staff Software Engineer", "Backend Architect"],
        "min_salary": 170000,
        "remote_only": True,
        "min_match_threshold": 85,
        "daily_submission_limit": 10,
        "auto_review_tailoring": True
    }
}

FACTS_STORE_BY_USER: Dict[str, Dict[str, Any]] = {
    "usr_demo_101": {
        "work_authorization": "Authorized to work in the US (Citizen / Permanent Resident)",
        "requires_sponsorship": "No",
        "years_of_experience": "6+ years",
        "highest_education": "Bachelor of Science in Computer Science, UC Berkeley",
        "notice_period": "2 weeks",
        "preferred_location": "San Francisco, CA or Remote",
        "linkedin_url": "https://linkedin.com/in/alex-rivera-dev",
        "github_url": "https://github.com/alexrivera-tech",
        "portfolio_url": "https://alexrivera.dev"
    }
}

SAVED_ANSWERS_DB: List[Dict[str, str]] = [
    {
        "question": "Describe a difficult technical problem you solved and how you measured success.",
        "answer": "At CloudScale, resolved a distributed Redis connection leak under 2M daily queries by instrumenting connection pool metrics and re-architecting async connection lifecycles, resulting in 34% lower P99 latencies and 0 connection drops."
    },
    {
        "question": "What is your philosophy on writing maintainable software?",
        "answer": "Software should be written to optimize developer readability and testability. I prioritize clear domain boundaries, strong type definitions, reproducible local development setups, and end-to-end integration tests."
    }
]

SUBMISSION_HISTORY_BY_USER: Dict[str, List[Dict[str, Any]]] = {
    "usr_demo_101": [
        {
            "id": "sub_901",
            "company": "Stripe",
            "role": "Senior Full-Stack Engineer",
            "submitted_at": "2026-11-16T10:15:00Z",
            "match_percentage": 94,
            "tailored_resume": "Tailored: Senior Full-Stack Engineer @ Stripe",
            "status": "submitted_successfully",
            "form_provider": "Greenhouse"
        },
        {
            "id": "sub_902",
            "company": "Linear",
            "role": "Frontend Architect",
            "submitted_at": "2026-11-15T18:30:00Z",
            "match_percentage": 92,
            "tailored_resume": "Tailored: Frontend Architect @ Linear",
            "status": "submitted_successfully",
            "form_provider": "Lever"
        },
        {
            "id": "sub_903",
            "company": "Datadog",
            "role": "Distributed Systems Engineer",
            "submitted_at": "2026-11-14T14:20:00Z",
            "match_percentage": 89,
            "tailored_resume": "Tailored: Distributed Systems Engineer @ Datadog",
            "status": "interview_requested",
            "form_provider": "Workday"
        }
    ]
}

class PreferencesRequest(BaseModel):
    enabled: Optional[bool] = None
    target_roles: Optional[List[str]] = None
    min_salary: Optional[int] = None
    remote_only: Optional[bool] = None
    min_match_threshold: Optional[int] = None
    daily_submission_limit: Optional[int] = None
    auto_review_tailoring: Optional[bool] = None

class FactsUpdateRequest(BaseModel):
    facts: Dict[str, Any]

class GenerateAnswersRequest(BaseModel):
    job_id: str
    questions: List[str]

def _get_user_prefs(user_id: str) -> Dict[str, Any]:
    with SessionLocal() as db:
        p = db.query(AutoApplyPreferenceModel).filter(AutoApplyPreferenceModel.user_id == user_id).first()
        if not p:
            p = AutoApplyPreferenceModel(
                user_id=user_id,
                enabled=False,
                target_roles=["Software Engineer"],
                min_salary=120000,
                remote_only=True,
                min_match_threshold=80,
                daily_submission_limit=5,
                auto_review_tailoring=True
            )
            db.add(p)
            db.commit()
            db.refresh(p)
        return {
            "enabled": p.enabled,
            "target_roles": p.target_roles or ["Software Engineer"],
            "min_salary": p.min_salary,
            "remote_only": p.remote_only,
            "min_match_threshold": p.min_match_threshold,
            "daily_submission_limit": p.daily_submission_limit,
            "auto_review_tailoring": p.auto_review_tailoring
        }

def _get_user_facts(user_id: str) -> Dict[str, Any]:
    with SessionLocal() as db:
        f = db.query(CandidateFactsModel).filter(CandidateFactsModel.user_id == user_id).first()
        if not f:
            f = CandidateFactsModel(
                user_id=user_id,
                facts={
                    "work_authorization": "Authorized to work in country of residence",
                    "requires_sponsorship": "No",
                    "years_of_experience": "3+ years",
                    "highest_education": "Bachelor's Degree",
                    "notice_period": "2 weeks",
                    "preferred_location": "Remote"
                }
            )
            db.add(f)
            db.commit()
            db.refresh(f)
        return dict(f.facts or {})

@router.get("/preferences")
def get_preferences(user: UserSession = Depends(get_current_user_required)):
    return _get_user_prefs(user.id)

@router.put("/preferences")
def update_preferences(req: PreferencesRequest, user: UserSession = Depends(get_current_user_required)):
    with SessionLocal() as db:
        p = db.query(AutoApplyPreferenceModel).filter(AutoApplyPreferenceModel.user_id == user.id).first()
        if not p:
            p = AutoApplyPreferenceModel(user_id=user.id)
            db.add(p)

        if req.enabled is not None:
            p.enabled = req.enabled
        if req.target_roles is not None:
            p.target_roles = req.target_roles
        if req.min_salary is not None:
            p.min_salary = req.min_salary
        if req.remote_only is not None:
            p.remote_only = req.remote_only
        if req.min_match_threshold is not None:
            p.min_match_threshold = req.min_match_threshold
        if req.daily_submission_limit is not None:
            p.daily_submission_limit = req.daily_submission_limit
        if req.auto_review_tailoring is not None:
            p.auto_review_tailoring = req.auto_review_tailoring

        db.commit()
        db.refresh(p)
        return {
            "enabled": p.enabled,
            "target_roles": p.target_roles,
            "min_salary": p.min_salary,
            "remote_only": p.remote_only,
            "min_match_threshold": p.min_match_threshold,
            "daily_submission_limit": p.daily_submission_limit,
            "auto_review_tailoring": p.auto_review_tailoring
        }

@router.get("/facts")
def get_facts(user: UserSession = Depends(get_current_user_required)):
    return {"facts": _get_user_facts(user.id)}

@router.put("/facts")
def update_facts(req: FactsUpdateRequest, user: UserSession = Depends(get_current_user_required)):
    with SessionLocal() as db:
        f = db.query(CandidateFactsModel).filter(CandidateFactsModel.user_id == user.id).first()
        if not f:
            f = CandidateFactsModel(user_id=user.id, facts={})
            db.add(f)
        
        current_facts = dict(f.facts or {})
        current_facts.update(req.facts)
        f.facts = current_facts
        db.commit()
        return {"status": "updated", "facts": current_facts}

@router.get("/saved-answers/all")
def get_saved_answers(user: UserSession = Depends(get_current_user_required)):
    return {"answers": SAVED_ANSWERS_DB}

@router.post("/job-answers")
def generate_job_answers(req: GenerateAnswersRequest, user: UserSession = Depends(get_current_user_required)):
    answers = []
    facts = _get_user_facts(user.id)
    for q in req.questions:
        ql = q.lower()
        if "sponsorship" in ql or "visa" in ql:
            ans = f"Work Authorization Status: {facts.get('work_authorization', 'Authorized to work')}. Requires sponsorship: {facts.get('requires_sponsorship', 'No')}."
        elif "years" in ql or "experience" in ql:
            ans = f"I bring {facts.get('years_of_experience', 'several years of')} verified software engineering experience across production systems."
        elif "education" in ql or "degree" in ql:
            ans = f"Educational background: {facts.get('highest_education', 'Bachelor of Science')}."
        elif "notice" in ql or "start date" in ql:
            ans = f"Notice period: {facts.get('notice_period', 'Standard 2 weeks')}."
        elif "location" in ql or "remote" in ql or "relocate" in ql:
            ans = f"Preferred location: {facts.get('preferred_location', 'Remote')}."
        else:
            ans = f"Based on my verified background ({facts.get('years_of_experience', '6+ years')}), I bring focused engineering ownership, clean architectural practices, and proven production reliability."
        answers.append({"question": q, "answer": ans})
    return {"job_id": req.job_id, "answers": answers}

@router.get("/history")
def get_submission_history(user: UserSession = Depends(get_current_user_required)):
    with SessionLocal() as db:
        subs = db.query(SubmissionHistoryModel).filter(SubmissionHistoryModel.user_id == user.id).all()
        user_subs = [{
            "id": s.id,
            "company": s.company,
            "role": s.role,
            "submitted_at": s.submitted_at,
            "match_percentage": s.match_percentage,
            "tailored_resume": s.tailored_resume,
            "status": s.status,
            "form_provider": s.form_provider
        } for s in subs]
    # Fallback to in-memory if empty for demo
    if not user_subs and user.id in SUBMISSION_HISTORY_BY_USER:
        user_subs = SUBMISSION_HISTORY_BY_USER[user.id]
    return {"submissions": user_subs}

@router.post("/trigger")
def trigger_auto_apply_cycle(user: UserSession = Depends(get_current_user_required)):
    return {
        "status": "dispatched",
        "user_id": user.id,
        "mode": "background_worker",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "queued_jobs": 3
    }
