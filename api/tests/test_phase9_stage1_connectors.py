import pytest
from api.jobs_engine.connectors.smartrecruiters import SmartRecruitersConnector
from api.jobs_engine.connectors.remotive import RemotiveConnector
from api.jobs_engine.connectors.arbeitnow import ArbeitnowConnector
from api.jobs_engine.connectors.jobicy import JobicyConnector
from api.jobs_engine.connectors.workable import WorkableConnector
from api.jobs_engine.connectors.adzuna import AdzunaConnector
from api.jobs_engine.connectors.base import is_safe_external_url

def test_smartrecruiters_normalization():
    conn = SmartRecruitersConnector()
    raw = {
        "id": "743999999",
        "name": "Senior Backend Engineer",
        "company": {"identifier": "Swiggy", "name": "Swiggy"},
        "releasedDate": "2026-11-21T10:00:00Z",
        "location": {
            "city": "Bengaluru",
            "region": "Karnataka",
            "country": "in",
            "fullLocation": "Bengaluru, Karnataka, India",
            "remote": False,
            "hybrid": True
        },
        "typeOfEmployment": {"label": "Full-time"},
        "experienceLevel": {"label": "Senior"},
        "department": {"label": "Engineering"},
        "ref": "https://api.smartrecruiters.com/v1/companies/Swiggy/postings/743999999"
    }
    comp_meta = {
        "id": "comp_sr_swiggy",
        "name": "Swiggy",
        "country": "India",
        "ats_board_token": "Swiggy"
    }
    job = conn.normalize_job(raw, company_meta=comp_meta)
    assert job["id"] == "job_sr_Swiggy_743999999"
    assert job["company_name"] == "Swiggy"
    assert job["job_title"] == "Senior Backend Engineer"
    assert job["country"] == "India"
    assert job["city"] == "Bengaluru"
    assert job["workplace_type"] == "hybrid"
    assert job["employment_type"] == "full_time"
    assert job["experience_level"] == "senior"
    assert job["source_name"] == "smartrecruiters"
    assert job["application_url"] == "https://jobs.smartrecruiters.com/Swiggy/743999999"

def test_remotive_normalization():
    conn = RemotiveConnector()
    raw = {
        "id": 998877,
        "title": "Staff Python Developer",
        "company_name": "Distributed Labs",
        "url": "https://remotive.com/remote-jobs/software-dev/staff-python-998877",
        "description": "<p>Looking for an experienced Python developer with Django and FastAPI experience.</p>",
        "candidate_required_location": "India Only",
        "job_type": "full_time",
        "publication_date": "2026-11-20T12:00:00Z",
        "tags": ["python", "fastapi", "django", "backend"]
    }
    job = conn.normalize_job(raw)
    assert job["id"] == "job_rem_998877"
    assert job["company_name"] == "Distributed Labs"
    assert job["country"] == "India"
    assert job["workplace_type"] == "remote"
    assert job["source_name"] == "remotive"
    assert "Python" in job["required_skills"] or "FastAPI" in job["required_skills"]

def test_arbeitnow_normalization():
    conn = ArbeitnowConnector()
    raw = {
        "slug": "senior-frontend-engineer-react-12345",
        "company_name": "FinTech Corp",
        "title": "Senior Frontend Engineer (React)",
        "description": "Develop scalable UI applications with React, TypeScript and Next.js.",
        "remote": True,
        "url": "https://www.arbeitnow.com/jobs/companies/fintech-corp/senior-frontend-engineer-react-12345",
        "tags": ["Frontend", "React"],
        "job_types": ["Full-Time"],
        "location": "Berlin, Germany",
        "created_at": 1732147200
    }
    job = conn.normalize_job(raw)
    assert job["id"].startswith("job_arb_")
    assert job["company_name"] == "FinTech Corp"
    assert job["workplace_type"] == "remote"
    assert job["country"] == "Germany"
    assert job["source_name"] == "arbeitnow"

def test_jobicy_normalization():
    conn = JobicyConnector()
    raw = {
        "id": 554433,
        "jobTitle": "Lead DevOps Architect",
        "companyName": "CloudScale",
        "url": "https://jobicy.com/jobs/554433-lead-devops-architect",
        "jobExcerpt": "Design multi-region Kubernetes clusters and CI/CD pipelines.",
        "jobGeo": "India",
        "jobType": ["Full-Time"],
        "jobLevel": "Senior",
        "pubDate": "2026-11-21T08:00:00Z",
        "jobIndustry": ["DevOps & Sysadmin"]
    }
    job = conn.normalize_job(raw)
    assert job["id"] == "job_jbc_554433"
    assert job["company_name"] == "CloudScale"
    assert job["country"] == "India"
    assert job["workplace_type"] == "remote"
    assert job["source_name"] == "jobicy"

def test_workable_documented_behavior():
    conn = WorkableConnector()
    # Query an empty / unconfigured account
    jobs = conn.fetch_jobs("non_existent_or_disabled_account_xyz")
    assert jobs == []

def test_adzuna_disabled_when_credentials_absent():
    conn = AdzunaConnector(app_id=None, app_key=None)
    jobs = conn.fetch_jobs(country="in")
    assert jobs == []

def test_ssrf_safety_on_candidate_urls():
    # Loopback and private ranges must be blocked
    safe1, _ = is_safe_external_url("http://127.0.0.1:8000/jobs")
    assert safe1 is False

    safe2, _ = is_safe_external_url("http://169.254.169.254/latest/meta-data/")
    assert safe2 is False

    # Legitimate external URLs must be safe
    safe3, _ = is_safe_external_url("https://jobs.smartrecruiters.com/Swiggy/123456")
    assert safe3 is True

    safe4, _ = is_safe_external_url("https://remotive.com/remote-jobs/123")
    assert safe4 is True
