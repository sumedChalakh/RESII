import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from api.main import app
from api.models import (
    Base,
    CompanyRegistryModel,
    JobListingModel,
    JobSyncLogModel,
    JobVerificationLogModel,
    UserModel,
    ResumeModel
)
from api.db import get_db, SessionLocal
from api.config import settings
from api.security import unsign_session_id, generate_csrf_token
from api.rate_limiter import limiter
from api.jobs_engine.normalizer import (
    strip_html,
    extract_skills,
    infer_workplace_type,
    infer_experience_level,
    infer_employment_type,
    parse_salary
)
from api.jobs_engine.connectors.greenhouse import GreenhouseConnector
from api.jobs_engine.connectors.lever import LeverConnector
from api.jobs_engine.connectors.ashby import AshbyConnector
from api.jobs_engine.connectors.adzuna import AdzunaConnector
from api.jobs_engine.service import job_discovery_service

client = TestClient(app)

@pytest.fixture(autouse=True)
def authenticate_client():
    limiter.reset()
    res = client.post("/api/auth/demo-login")
    session_cookie = res.cookies.get("resii_session")
    session_id = unsign_session_id(session_cookie, settings.SECRET_KEY)
    if session_id:
        csrf_tok = generate_csrf_token(session_id, settings.SECRET_KEY)
        client.headers["X-CSRF-Token"] = csrf_tok


def test_normalizer_functions():
    """Verify HTML stripping, skill extraction, experience and salary normalization."""
    raw_html = "<p>Looking for a <strong>Senior Backend Engineer</strong> with experience in Python &amp; FastAPI.</p>"
    clean = strip_html(raw_html)
    assert clean == "Looking for a Senior Backend Engineer with experience in Python & FastAPI."
    assert "<" not in clean

    skills = extract_skills("We require proficiency in React, TypeScript, FastAPI, PostgreSQL, and Docker.")
    assert "React" in skills
    assert "TypeScript" in skills
    assert "FastAPI" in skills
    assert "PostgreSQL" in skills
    assert "Docker" in skills

    assert infer_workplace_type("Staff Engineer", "Remote, India", "100% remote position") == "remote"
    assert infer_workplace_type("Frontend Developer", "Bengaluru, India", "Hybrid 3 days in office") == "hybrid"
    assert infer_workplace_type("Hardware Engineer", "Pune, India", "Onsite lab") == "on_site"

    assert infer_experience_level("Software Engineer Intern", "6 month internship") == "internship"
    assert infer_experience_level("Graduate Trainee / Fresher", "0-1 year experience") == "fresher"
    assert infer_experience_level("Junior Developer", "1-2 years experience") == "0-2 yrs"
    assert infer_experience_level("Senior Machine Learning Engineer", "5+ years required") == "senior"
    assert infer_experience_level("Principal Architect", "Lead a team") == "lead"

    s_min, s_max, curr, formatted = parse_salary(None, None, "INR", "Salary: ₹18,00,000 - ₹25,00,000 per annum")
    assert s_min == 1800000.0
    assert s_max == 2500000.0
    assert curr == "INR"
    assert "₹18.0L" in formatted


def test_greenhouse_connector_normalization():
    """Verify Greenhouse connector parses payload into standardized format."""
    connector = GreenhouseConnector()
    mock_gh_job = {
        "id": 884422,
        "title": "Lead AI Engineer",
        "content": "<p>Build production LLM pipelines in Python, PyTorch, and FastAPI.</p>",
        "location": {"name": "Bengaluru, India"},
        "departments": [{"name": "AI Platform"}],
        "absolute_url": "https://boards.greenhouse.io/demo/jobs/884422",
        "updated_at": "2026-11-20T10:00:00Z"
    }

    norm = connector.normalize_job(mock_gh_job, company_meta={"id": "comp_1", "name": "Razorpay", "country": "India", "ats_board_token": "razorpay"})
    assert norm["external_job_id"] == "884422"
    assert norm["company_name"] == "Razorpay"
    assert norm["country"] == "India"
    assert norm["city"] == "Bengaluru"
    assert "Python" in norm["required_skills"] or "PyTorch" in norm["required_skills"]
    assert norm["source_name"] == "greenhouse"
    assert norm["application_url"] == "https://boards.greenhouse.io/demo/jobs/884422"


def test_lever_connector_normalization():
    """Verify Lever connector parses postings payload."""
    connector = LeverConnector()
    mock_lev_job = {
        "id": "lev_9988",
        "text": "Senior Full-Stack Engineer (Remote)",
        "descriptionPlain": "Develop frontend components with React and backend services with Node.js and Postgres.",
        "categories": {
            "team": "Engineering",
            "location": "Mumbai, India",
            "commitment": "Full-time"
        },
        "workplaceType": "remote",
        "hostedUrl": "https://jobs.lever.co/browserstack/lev_9988",
        "applyUrl": "https://jobs.lever.co/browserstack/lev_9988/apply",
        "createdAt": 1700000000000
    }

    norm = connector.normalize_job(mock_lev_job, company_meta={"id": "comp_2", "name": "BrowserStack", "country": "India", "ats_board_token": "browserstack"})
    assert norm["external_job_id"] == "lev_9988"
    assert norm["company_name"] == "BrowserStack"
    assert norm["workplace_type"] == "remote"
    assert norm["city"] == "Mumbai"
    assert norm["source_name"] == "lever"
    assert "React" in norm["required_skills"]


def test_ashby_connector_normalization():
    """Verify Ashby connector parses job board payload."""
    connector = AshbyConnector()
    mock_ash_job = {
        "id": "ash_112233",
        "title": "Staff Backend Engineer",
        "descriptionHtml": "<p>Design high-scale APIs with Go, Docker, and Kubernetes.</p>",
        "location": "Remote, India",
        "department": "Infrastructure",
        "employmentType": "FullTime",
        "jobUrl": "https://jobs.ashbyhq.com/retool/ash_112233"
    }

    norm = connector.normalize_job(mock_ash_job, company_meta={"id": "comp_3", "name": "Retool", "country": "India", "ats_board_token": "retool"})
    assert norm["external_job_id"] == "ash_112233"
    assert norm["company_name"] == "Retool"
    assert norm["source_name"] == "ashby"
    assert norm["experience_level"] == "lead"


def test_adzuna_connector_normalization():
    """Verify Adzuna aggregator connector parses listings payload."""
    connector = AdzunaConnector(app_id="test_id", app_key="test_key")
    mock_adz_job = {
        "id": "adz_445566",
        "title": "Python Developer",
        "description": "Looking for Python and PostgreSQL developer in Pune.",
        "company": {"display_name": "TCS"},
        "location": {"display_name": "Pune, Maharashtra, India"},
        "salary_min": 800000,
        "salary_max": 1400000,
        "redirect_url": "https://adzuna.in/job/445566",
        "created": "2026-11-19T08:00:00Z"
    }

    norm = connector.normalize_job(mock_adz_job)
    assert norm["external_job_id"] == "adz_445566"
    assert norm["company_name"] == "TCS"
    assert norm["city"] == "Pune"
    assert norm["country"] == "India"
    assert norm["salary_min"] == 800000.0
    assert norm["salary_max"] == 1400000.0


def test_database_ingestion_and_deduplication():
    """Verify that multiple sync runs update existing records without creating duplicates."""
    with SessionLocal() as db:
        # Clean up any leftover test data
        db.query(JobListingModel).filter(JobListingModel.company_id == "comp_test_dedup").delete()
        db.query(JobSyncLogModel).filter(JobSyncLogModel.company_id == "comp_test_dedup").delete()
        db.query(JobListingModel).filter(JobListingModel.external_job_id.in_(["1001", "1002"])).delete()
        db.commit()

        # Create a test company
        comp = CompanyRegistryModel(
            id="comp_test_dedup",
            name="Dedup Test Co",
            career_page_url="https://jobs.test.co",
            ats_provider="greenhouse",
            ats_board_token="test_dedup",
            country="India",
            status="active",
            sync_frequency_hours=24,
            is_active=True,
            created_at="2026-11-21T00:00:00Z",
            updated_at="2026-11-21T00:00:00Z"
        )
        db.merge(comp)
        db.commit()

        # Mock Greenhouse connector to return 2 jobs
        mock_raw = [
            {
                "id": 1001,
                "title": "Backend Engineer",
                "content": "<p>FastAPI and PostgreSQL</p>",
                "location": {"name": "Bengaluru, India"},
                "absolute_url": "https://boards.greenhouse.io/test/jobs/1001"
            },
            {
                "id": 1002,
                "title": "Frontend Engineer",
                "content": "<p>React and TypeScript</p>",
                "location": {"name": "Remote, India"},
                "absolute_url": "https://boards.greenhouse.io/test/jobs/1002"
            }
        ]

        with patch.object(job_discovery_service.gh, "fetch_jobs", return_value=mock_raw):
            # Run sync cycle 1
            res1 = job_discovery_service.sync_company(db, comp)
            assert res1["status"] == "success"
            assert res1["inserted"] == 2
            assert res1["updated"] == 0

            # Run sync cycle 2 (identical raw data)
            res2 = job_discovery_service.sync_company(db, comp)
            assert res2["status"] == "success"
            assert res2["inserted"] == 0
            assert res2["updated"] == 2  # Idempotent update!

            # Verify count in database
            jobs_count = db.query(JobListingModel).filter(JobListingModel.company_id == "comp_test_dedup").count()
            assert jobs_count == 2

            # Run sync cycle 3 (Job 1002 removed from external feed -> should deactivate via conservative check)
            with patch.object(job_discovery_service.gh, "fetch_jobs", return_value=[mock_raw[0]]):
                with patch.object(job_discovery_service.gh, "verify_job_url", return_value=(False, 404, "HTTP 404")):
                    res3 = job_discovery_service.sync_company(db, comp)
                    assert res3["deactivated"] == 1
                    job_1002 = db.query(JobListingModel).filter(
                        JobListingModel.company_id == "comp_test_dedup",
                        JobListingModel.external_job_id == "1002"
                    ).first()
                    assert job_1002.is_active is False
                    assert job_1002.verification_status == "expired"


def test_feed_api_with_real_database_records():
    """Verify that GET /api/jobs/feed accurately queries database records with filters and pagination."""
    with SessionLocal() as db:
        # Insert test jobs for filtering verification
        j1 = JobListingModel(
            id="job_test_filter_1",
            external_job_id="ext_f1",
            company_name="AlphaTech",
            source_name="greenhouse",
            source_job_url="https://alpha.com/job/1",
            job_title="Senior AI Engineer",
            description="Leading development of PyTorch neural architectures in Bengaluru.",
            location="Bengaluru, India",
            city="Bengaluru",
            country="India",
            workplace_type="remote",
            employment_type="full_time",
            experience_level="senior",
            salary_min=2500000.0,
            salary_max=3500000.0,
            salary_currency="INR",
            salary_formatted="₹25.0L – ₹35.0L/yr",
            required_skills=["Python", "PyTorch", "FastAPI"],
            preferred_skills=["Docker", "Kubernetes"],
            posted_at="2026-11-21T12:00:00Z",
            application_url="https://alpha.com/apply/1",
            is_active=True,
            verification_status="verified",
            first_seen_at="2026-11-21T00:00:00Z",
            last_seen_at="2026-11-21T12:00:00Z",
            last_verified_at="2026-11-21T12:00:00Z",
            created_at="2026-11-21T00:00:00Z",
            updated_at="2026-11-21T12:00:00Z"
        )
        j2 = JobListingModel(
            id="job_test_filter_2",
            external_job_id="ext_f2",
            company_name="BetaSoft",
            source_name="lever",
            source_job_url="https://beta.com/job/2",
            job_title="Junior Frontend Intern",
            description="Internship with React and Vite in Pune.",
            location="Pune, India",
            city="Pune",
            country="India",
            workplace_type="on_site",
            employment_type="internship",
            experience_level="internship",
            salary_min=300000.0,
            salary_max=450000.0,
            salary_currency="INR",
            salary_formatted="₹3.0L – ₹4.5L/yr",
            required_skills=["React", "TypeScript", "HTML", "CSS"],
            preferred_skills=[],
            posted_at="2026-11-20T10:00:00Z",
            application_url="https://beta.com/apply/2",
            is_active=True,
            verification_status="verified",
            first_seen_at="2026-11-20T00:00:00Z",
            last_seen_at="2026-11-20T10:00:00Z",
            last_verified_at="2026-11-20T10:00:00Z",
            created_at="2026-11-20T00:00:00Z",
            updated_at="2026-11-20T10:00:00Z"
        )
        db.merge(j1)
        db.merge(j2)
        db.commit()

    # 1. Query for AI Engineer
    r1 = client.get("/api/jobs/feed?query=PyTorch")
    assert r1.status_code == 200
    data1 = r1.json()
    assert data1["total"] >= 1
    assert any(j["id"] == "job_test_filter_1" for j in data1["jobs"])

    # 2. Query for Remote Only
    r2 = client.get("/api/jobs/feed?remote_only=true")
    assert r2.status_code == 200
    data2 = r2.json()
    for job in data2["jobs"]:
        assert job["is_remote"] is True

    # 3. Query for Experience Level = Internship
    r3 = client.get("/api/jobs/feed?experience_level=internship&company=BetaSoft")
    assert r3.status_code == 200
    data3 = r3.json()
    assert any(j["id"] == "job_test_filter_2" for j in data3["jobs"])
    for job in data3["jobs"]:
        assert job["experience_level"] == "internship"

    # 4. Query for Location = Pune
    r4 = client.get("/api/jobs/feed?location=Pune")
    assert r4.status_code == 200
    data4 = r4.json()
    assert any(j["id"] == "job_test_filter_2" for j in data4["jobs"])

    # 5. Job Details endpoint
    r5 = client.get("/api/jobs/detail/job_test_filter_1")
    assert r5.status_code == 200
    detail = r5.json()
    assert detail["job"]["title"] == "Senior AI Engineer"
    assert detail["job"]["company"] == "AlphaTech"
    assert "PyTorch" in detail["job"]["required_skills"]


def test_ai_resume_job_matching():
    """Verify evidence-grounded alignment calculation against candidate resume."""
    mock_resume_doc = {
        "header": {"name": "Alex Rivera"},
        "sections": [
            {
                "id": "sec_skills",
                "title": "Skills",
                "blocks": [
                    {
                        "id": "blk_skills",
                        "lines": [
                            {"id": "l_sk1", "text": "Python, FastAPI, TypeScript, React, Docker, PostgreSQL"}
                        ]
                    }
                ]
            },
            {
                "id": "sec_exp",
                "title": "Experience",
                "blocks": [
                    {
                        "id": "blk_exp1",
                        "title": "Senior Engineer at CloudScale",
                        "lines": [
                            {"id": "l_e1", "text": "Engineered high-throughput FastAPI services reducing latency by 34%."}
                        ]
                    }
                ]
            }
        ]
    }

    mock_job = JobListingModel(
        id="job_match_test",
        external_job_id="ext_m1",
        company_name="CloudScale",
        source_name="greenhouse",
        source_job_url="https://cloudscale.com/job/1",
        job_title="Senior Backend Engineer",
        description="Looking for Python, FastAPI, and Docker expertise.",
        location="Remote",
        country="India",
        workplace_type="remote",
        employment_type="full_time",
        experience_level="senior",
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        preferred_skills=["Docker", "Kubernetes"],
        posted_at="2026-11-21T00:00:00Z",
        application_url="https://cloudscale.com/apply/1",
        is_active=True,
        verification_status="verified",
        first_seen_at="2026-11-21T00:00:00Z",
        last_seen_at="2026-11-21T00:00:00Z",
        last_verified_at="2026-11-21T00:00:00Z",
        created_at="2026-11-21T00:00:00Z",
        updated_at="2026-11-21T00:00:00Z"
    )

    report = job_discovery_service.calculate_resume_job_match(mock_resume_doc, mock_job)
    assert report["match_percentage"] >= 80
    assert "Python" in report["matched_skills"]
    assert "FastAPI" in report["matched_skills"]
    assert "PostgreSQL" in report["matched_skills"]
    assert "Docker" in report["matched_skills"]
    assert "Kubernetes" in report["missing_preferred_skills"]
    assert len(report["missing_required_skills"]) == 0
    assert "Outstanding match" in report["explanation"]


def test_ssrf_protection_validator():
    """Verify that is_safe_external_url blocks loopback, private IPs, and cloud metadata."""
    from api.jobs_engine.connectors.base import is_safe_external_url

    # Blocked cases
    assert is_safe_external_url("http://127.0.0.1:8000/api")[0] is False
    assert is_safe_external_url("http://localhost/admin")[0] is False
    assert is_safe_external_url("http://169.254.169.254/latest/meta-data/")[0] is False
    assert is_safe_external_url("file:///etc/passwd")[0] is False
    assert is_safe_external_url("ftp://server/job")[0] is False
    assert is_safe_external_url("http://10.0.0.5/jobs")[0] is False
    assert is_safe_external_url("http://192.168.1.1/jobs")[0] is False

    # Allowed legitimate domains
    assert is_safe_external_url("https://boards.greenhouse.io/stripe")[0] is True
    assert is_safe_external_url("https://jobs.lever.co/spotify")[0] is True
    assert is_safe_external_url("https://jobs.ashbyhq.com/openai")[0] is True


def test_zero_fabrication_unauthenticated_user():
    """Verify unauthenticated user receives match_percentage: None instead of fake 85%."""
    # Unauthenticated client (no cookie or session)
    anon_client = TestClient(app)
    r = anon_client.get("/api/jobs/feed?query=PyTorch")
    assert r.status_code == 200
    data = r.json()
    if data["total"] > 0:
        first_job = data["jobs"][0]
        assert first_job["match_percentage"] is None
        assert first_job["match_report"]["status"] == "no_resume"

