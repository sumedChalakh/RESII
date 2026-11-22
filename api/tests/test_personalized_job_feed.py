import uuid
import pytest
from fastapi.testclient import TestClient
from api.main import app
from api.db import SessionLocal
from api.models import (
    UserModel,
    ResumeModel,
    UserProfileModel,
    JobListingModel,
    JobApplicationModel
)
from api.security import hash_password, unsign_session_id, generate_csrf_token
from api.config import settings

client = TestClient(app)

def create_authenticated_session(user_id: str, email: str, name: str, role: str = "user", client_instance=None):
    """Helper to register and generate cookies + CSRF tokens for an isolated test user."""
    c = client_instance or client
    with SessionLocal() as db:
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            user = UserModel(
                id=user_id,
                email=email,
                name=name,
                role=role,
                created_at="2026-11-21T00:00:00Z",
                entitlements=["job_search", "ats_check"],
                password_hash=hash_password("TestSecret123!")
            )
            db.add(user)
            db.commit()

    # Login via /api/auth/login
    res = c.post("/api/auth/login", json={"email": email, "password": "TestSecret123!"})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    session_cookie = res.cookies.get("resii_session")
    session_id = unsign_session_id(session_cookie, settings.SECRET_KEY)
    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY) if session_id else ""
    return session_cookie, csrf_token


# =========================================================================
# TEST A — Existing Resume & Active Profile Resolution
# =========================================================================
def test_a_existing_resume_resolution():
    """Verify authenticated user's active resume and structured profile are resolved."""
    login_res = client.post("/api/auth/demo-login")
    assert login_res.status_code == 200
    cookie = login_res.cookies.get("resii_session")

    # 1. Fetch user resumes
    resumes_resp = client.get("/api/v3/resumes", cookies={"resii_session": cookie})
    assert resumes_resp.status_code == 200
    resumes = resumes_resp.json()
    assert len(resumes) >= 1

    primary_resume = next((r for r in resumes if r.get("is_primary")), resumes[0])
    assert primary_resume["id"] is not None
    assert primary_resume["ats_score"] > 0

    # 2. Fetch full resume document
    doc_resp = client.get(f"/api/v3/resumes/{primary_resume['id']}/document", cookies={"resii_session": cookie})
    assert doc_resp.status_code == 200
    doc_data = doc_resp.json()
    assert "document" in doc_data
    doc_tree = doc_data["document"]
    assert "header" in doc_tree
    assert "sections" in doc_tree

    # 3. Call Jobs feed and verify active_resume is populated
    feed_resp = client.get("/api/jobs/feed", cookies={"resii_session": cookie})
    assert feed_resp.status_code == 200
    feed_data = feed_resp.json()
    assert feed_data["active_resume"] is not None
    assert feed_data["active_resume"]["id"] == primary_resume["id"]
    assert len(feed_data["user_resumes"]) >= 1


# =========================================================================
# TEST B — Personalized Recommendations & Match Scores
# =========================================================================
def test_b_personalized_job_feed_matching():
    """Verify job feed uses the candidate's active resume for matching, sorting, and explanations."""
    login_res = client.post("/api/auth/demo-login")
    cookie = login_res.cookies.get("resii_session")

    feed_resp = client.get("/api/jobs/feed?sort_by=best_match&page_size=15", cookies={"resii_session": cookie})
    assert feed_resp.status_code == 200
    data = feed_resp.json()
    assert data["total"] > 0
    jobs = data["jobs"]
    assert len(jobs) > 0

    # Ensure match scores are populated for authenticated user with active resume
    scored_jobs = [j for j in jobs if j["match_percentage"] is not None]
    assert len(scored_jobs) > 0

    # Verify best-match sorting order (highest scores first)
    scores = [j["match_percentage"] for j in scored_jobs]
    assert scores == sorted(scores, reverse=True), "Jobs are not sorted by match score descending"

    # Inspect top match
    top_job = scored_jobs[0]
    assert top_job["match_percentage"] >= 65, f"Expected strong/good match for top job, got {top_job['match_percentage']}"
    assert top_job["match_report"] is not None
    report = top_job["match_report"]
    assert "matched_skills" in report
    assert "missing_required_skills" in report
    assert "explanation" in report
    assert len(report["explanation"]) > 10
    assert "role_compatibility" in report
    assert "experience_compatibility" in report


# =========================================================================
# TEST C — Resume Switching & Dynamic Feed Updates
# =========================================================================
def test_c_resume_switching_updates_feed():
    """Verify selecting a different resume or changing primary updates the job recommendations."""
    login_res = client.post("/api/auth/demo-login")
    cookie = login_res.cookies.get("resii_session")
    session_id = unsign_session_id(cookie, settings.SECRET_KEY)
    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY)

    # 1. Fetch user resumes
    resumes_resp = client.get("/api/v3/resumes", cookies={"resii_session": cookie})
    resumes = resumes_resp.json()

    # Ensure we have at least 2 resumes for testing switching
    if len(resumes) < 2:
        # Create a second resume for this user with distinct ML/Data profile
        new_res = ResumeModel(
            id=f"rez_test_switch_{uuid.uuid4().hex[:6]}",
            user_id="usr_demo_101",
            title="Senior Machine Learning Specialist",
            version=1,
            is_primary=False,
            ats_score=88,
            target_role="Machine Learning Engineer",
            created_at="2026-11-21T00:00:00Z",
            updated_at="2026-11-21T00:00:00Z",
            document={
                "header": {"name": "Alex Rivera", "title": "Staff ML Scientist", "location": "Bengaluru, India"},
                "sections": [
                    {
                        "id": "sec_skills",
                        "type": "skills",
                        "title": "Skills",
                        "blocks": [{
                            "id": "b_sk",
                            "lines": [{"id": "l_1", "text": "PyTorch, TensorFlow, Python, NLP, Computer Vision, FastAPI, Docker"}]
                        }]
                    },
                    {
                        "id": "sec_exp",
                        "type": "experience",
                        "title": "Experience",
                        "blocks": [{
                            "id": "b_exp",
                            "role": "Staff Machine Learning Engineer",
                            "company": "DeepScale",
                            "lines": [{"id": "l_2", "text": "Engineered production Transformer models."}]
                        }]
                    }
                ]
            }
        )
        with SessionLocal() as db:
            db.add(new_res)
            db.commit()
        second_resume_id = new_res.id
    else:
        second_resume_id = resumes[1]["id"]

    # 2. Get recommendations with default primary resume
    r1 = client.get("/api/jobs/feed?sort_by=best_match", cookies={"resii_session": cookie})
    data1 = r1.json()
    active1_id = data1["active_resume"]["id"]

    # 3. Request feed explicitly with second resume
    r2 = client.get(f"/api/jobs/feed?resume_id={second_resume_id}&sort_by=best_match", cookies={"resii_session": cookie})
    data2 = r2.json()
    assert data2["active_resume"]["id"] == second_resume_id

    # 4. Verify that set-primary endpoint atomically switches active primary resume
    set_prim_res = client.post(
        f"/api/v3/resumes/{second_resume_id}/set-primary",
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf_token}
    )
    assert set_prim_res.status_code == 200
    prim_data = set_prim_res.json()
    assert prim_data["is_primary"] is True
    assert prim_data["id"] == second_resume_id

    # 5. Default feed without resume_id now uses the newly marked primary resume
    r3 = client.get("/api/jobs/feed?sort_by=best_match", cookies={"resii_session": cookie})
    data3 = r3.json()
    assert data3["active_resume"]["id"] == second_resume_id

    # Revert primary back to original
    client.post(
        f"/api/v3/resumes/{active1_id}/set-primary",
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf_token}
    )


# =========================================================================
# TEST D — User Isolation & Profile Distinctness
# =========================================================================
def test_d_user_isolation_and_differing_recommendations():
    """Verify two distinct candidate accounts receive appropriate, non-leaking recommendations."""
    client_fe = TestClient(app)
    client_sales = TestClient(app)

    uid_fe = f"usr_test_fe_{uuid.uuid4().hex[:6]}"
    uid_sales = f"usr_test_sales_{uuid.uuid4().hex[:6]}"

    cookie_fe, csrf_fe = create_authenticated_session(uid_fe, f"{uid_fe}@test.com", "Frontend Specialist", client_instance=client_fe)
    cookie_sales, csrf_sales = create_authenticated_session(uid_sales, f"{uid_sales}@test.com", "Sales Director", client_instance=client_sales)

    # Seed isolated resume for Frontend engineer
    with SessionLocal() as db:
        res_fe = ResumeModel(
            id=f"rez_{uid_fe}",
            user_id=uid_fe,
            title="React Frontend Developer",
            version=1,
            is_primary=True,
            ats_score=85,
            target_role="Frontend Engineer",
            created_at="2026-11-21T00:00:00Z",
            updated_at="2026-11-21T00:00:00Z",
            document={
                "header": {"name": "Frontend Specialist", "title": "Senior React Engineer"},
                "sections": [{
                    "id": "s1", "type": "skills", "title": "Skills",
                    "blocks": [{"id": "b1", "lines": [{"id": "l1", "text": "React, TypeScript, Next.js, Redux, CSS, HTML5, Vite"}]}]
                }]
            }
        )
        res_sales = ResumeModel(
            id=f"rez_{uid_sales}",
            user_id=uid_sales,
            title="Enterprise Sales Leader",
            version=1,
            is_primary=True,
            ats_score=80,
            target_role="Strategic Account Executive",
            created_at="2026-11-21T00:00:00Z",
            updated_at="2026-11-21T00:00:00Z",
            document={
                "header": {"name": "Sales Director", "title": "Account Director, Enterprise Sales"},
                "sections": [{
                    "id": "s1", "type": "skills", "title": "Skills",
                    "blocks": [{"id": "b1", "lines": [{"id": "l1", "text": "Enterprise Sales, Account Management, Revenue Growth, GTM, B2B SaaS"}]}]
                }]
            }
        )
        db.add(res_fe)
        db.add(res_sales)
        db.commit()
        res_fe_id = res_fe.id
        res_sales_id = res_sales.id

    # Query feeds for both users
    resp_fe = client_fe.get("/api/jobs/feed?sort_by=best_match&page_size=10")
    assert resp_fe.status_code == 200
    jobs_fe = resp_fe.json()["jobs"]

    resp_sales = client_sales.get("/api/jobs/feed?sort_by=best_match&page_size=10")
    assert resp_sales.status_code == 200
    jobs_sales = resp_sales.json()["jobs"]

    # Top recommendations must differ substantially
    top_fe_titles = [j["title"].lower() for j in jobs_fe[:5]]
    top_sales_titles = [j["title"].lower() for j in jobs_sales[:5]]

    assert any("engineer" in t or "developer" in t or "frontend" in t for t in top_fe_titles)
    assert any("account" in t or "sales" in t or "gtm" in t or "director" in t for t in top_sales_titles)

    # Privacy verification: User FE cannot access User Sales's resume
    leak_resp = client_fe.get(f"/api/v3/resumes/{res_sales_id}/document")
    assert leak_resp.status_code == 404, "Security violation: Cross-tenant resume access was permitted"

    # Privacy verification: User FE cannot request recommendations using User Sales's resume
    feed_leak_resp = client_fe.get(f"/api/jobs/feed?resume_id={res_sales_id}")
    # Should fall back to User FE's own resume, NOT User Sales's resume
    feed_leak_data = feed_leak_resp.json()
    assert feed_leak_data["active_resume"]["id"] == res_fe_id


# =========================================================================
# TEST E — Job Actions & Tracking
# =========================================================================
def test_e_job_actions_and_tracking():
    """Verify application tracking, job details, and tailor navigation payload."""
    login_res = client.post("/api/auth/demo-login")
    cookie = login_res.cookies.get("resii_session")
    session_id = unsign_session_id(cookie, settings.SECRET_KEY)
    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY)

    # 1. Fetch job feed to get a real job ID
    feed = client.get("/api/jobs/feed?page_size=3", cookies={"resii_session": cookie}).json()
    assert len(feed["jobs"]) > 0
    test_job = feed["jobs"][0]

    # 2. Get Job Detail endpoint
    detail_res = client.get(f"/api/jobs/detail/{test_job['id']}", cookies={"resii_session": cookie})
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["job"]["id"] == test_job["id"]
    assert "description" in detail_data["job"]

    # 3. Track application
    track_res = client.post(
        "/api/jobs/applications",
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf_token},
        json={
            "job_id": test_job["id"],
            "title": test_job["title"],
            "company": test_job["company"],
            "location": test_job["location"],
            "salary_range": test_job["salary_range"],
            "stage": "applied",
            "match_percentage": test_job.get("match_percentage") or 85,
            "notes": "Automated acceptance test tracking."
        }
    )
    assert track_res.status_code in (200, 201)
    track_data = track_res.json()
    assert track_data["stage"] == "applied"
    assert track_data["company"] == test_job["company"]


# =========================================================================
# TEST F — Regression & Safety Guards
# =========================================================================
def test_f_zero_fabrication_and_filters():
    """Verify unauthenticated safety, filter precision, and no fabricated match scores."""
    # 1. Unauthenticated request has no fake score
    anon_client = TestClient(app)
    anon_resp = anon_client.get("/api/jobs/feed")
    assert anon_resp.status_code == 200
    anon_data = anon_resp.json()
    assert anon_data["active_resume"] is None
    if anon_data["total"] > 0:
        for job in anon_data["jobs"]:
            assert job["match_percentage"] is None
            assert job["match_report"]["status"] == "no_resume"

    # 2. Remote only filter
    login_res = client.post("/api/auth/demo-login")
    cookie = login_res.cookies.get("resii_session")

    remote_resp = client.get("/api/jobs/feed?remote_only=true", cookies={"resii_session": cookie})
    assert remote_resp.status_code == 200
    for j in remote_resp.json()["jobs"]:
        assert j["is_remote"] is True
