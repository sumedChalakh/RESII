from fastapi import APIRouter, Response, Request, status
import uuid
from api.rate_limiter import check_rate_limit
from api.db import SessionLocal
from api.models import PublicCheckModel

router = APIRouter(prefix="/public", tags=["public"])

# Store anonymous checks
public_checks_db = {}

@router.post("/visits/arrival", status_code=status.HTTP_204_NO_CONTENT)
def visit_arrival():
    """Telemetry arrival beacon matching Rezifi's 204 response."""
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/checks/config")
def checks_config():
    return {
        "max_file_size_mb": 10,
        "allowed_extensions": [".pdf", ".docx", ".txt"],
        "supported_features": ["ats_scoring", "machine_read", "grammar_analysis", "keyword_targeting"],
        "scoring_model_version": "v3.8-resii-ats"
    }

@router.post("/checks")
def create_check(request: Request, payload: dict = None):
    # Enforce rate limit: 10 public checks per minute per IP
    check_rate_limit(request, "public_checks", limit=10, window_seconds=60)

    check_id = f"chk_{uuid.uuid4().hex[:10]}"
    sample_check = {
        "id": check_id,
        "filename": (payload or {}).get("filename", "sample_resume.pdf"),
        "ats_score": 78,
        "target_score": 95,
        "headline": "Strong engineering foundation, but missing quantitative impact & ATS keywords.",
        "findings": [
            {
                "category": "Impact & Metrics",
                "score": 68,
                "status": "warning",
                "message": "Only 3 of 12 bullet points contain quantifiable business metrics ($ or %)."
            },
            {
                "category": "Keyword Density",
                "score": 82,
                "status": "good",
                "message": "Found core competencies: Python, React, PostgreSQL, Cloud Architecture."
            },
            {
                "category": "Formatting & Length",
                "score": 94,
                "status": "pass",
                "message": "1-page standard layout detected. Clean margin and typography hierarchy."
            }
        ],
        "fixes_count": 7,
        "suggested_rewrites": [
            {
                "original": "Worked on backend APIs and database performance.",
                "improved": "Engineered high-throughput FastAPI services, reducing P99 latency by 34% across 2M daily queries.",
                "category": "Engineering Impact"
            },
            {
                "original": "Responsible for managing team sprint tasks.",
                "improved": "Orchestrated bi-weekly Agile sprints for a 6-engineer pod, increasing story velocity by 22%.",
                "category": "Leadership"
            }
        ],
        "created_at": "2026-11-16T14:30:00Z"
    }
    public_checks_db[check_id] = sample_check
    with SessionLocal() as db:
        try:
            db_chk = PublicCheckModel(id=check_id, data=sample_check, created_at=sample_check["created_at"])
            db.add(db_chk)
            db.commit()
        except Exception:
            db.rollback()
    return sample_check

@router.get("/checks/{check_id}")
def get_check(check_id: str):
    with SessionLocal() as db:
        record = db.query(PublicCheckModel).filter(PublicCheckModel.id == check_id).first()
        if record:
            return record.data
    if check_id in public_checks_db:
        return public_checks_db[check_id]
    return {
        "id": check_id,
        "filename": "Uploaded_Resume.pdf",
        "ats_score": 78,
        "target_score": 95,
        "headline": "Strong engineering foundation, but missing quantitative impact & ATS keywords.",
        "findings": [
            {
                "category": "Impact & Metrics",
                "score": 68,
                "status": "warning",
                "message": "Only 3 of 12 bullet points contain quantifiable business metrics ($ or %)."
            },
            {
                "category": "Keyword Density",
                "score": 82,
                "status": "good",
                "message": "Found core competencies: Python, React, PostgreSQL, Cloud Architecture."
            },
            {
                "category": "Formatting & Length",
                "score": 94,
                "status": "pass",
                "message": "1-page standard layout detected. Clean margin and typography hierarchy."
            }
        ],
        "fixes_count": 7,
        "suggested_rewrites": [
            {
                "original": "Worked on backend APIs and database performance.",
                "improved": "Engineered high-throughput FastAPI services, reducing P99 latency by 34% across 2M daily queries.",
                "category": "Engineering Impact"
            }
        ],
        "created_at": "2026-11-16T14:30:00Z"
    }

@router.post("/promotions/stop")
def stop_promotions():
    return {"status": "unsubscribed", "type": "promotions"}

@router.post("/season/stop")
def stop_season_emails():
    return {"status": "unsubscribed", "type": "season"}
