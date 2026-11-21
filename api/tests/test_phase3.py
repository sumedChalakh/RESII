import pytest
from fastapi.testclient import TestClient
from api.main import app
from api.security import unsign_session_id, generate_csrf_token
from api.rate_limiter import limiter
from api.config import settings

client = TestClient(app)

@pytest.fixture(autouse=True)
def authenticate_client():
    """Authenticate client as demo user before each test."""
    limiter.reset()
    res = client.post("/api/auth/demo-login")
    session_cookie = res.cookies.get("resii_session")
    session_id = unsign_session_id(session_cookie, settings.SECRET_KEY)
    if session_id:
        csrf_tok = generate_csrf_token(session_id, settings.SECRET_KEY)
        client.headers["X-CSRF-Token"] = csrf_tok

def test_tailor_read_words_and_plan():
    job_desc = (
        "Looking for a Senior Full-Stack Engineer with extensive experience in React, TypeScript, "
        "FastAPI, Distributed Systems, and PostgreSQL. Must have demonstrated success with P99 latency."
    )
    
    # 1. Read words
    rw_res = client.post("/api/v3/tailor/read-words", json={"job_description": job_desc, "resume_id": "primary"})
    assert rw_res.status_code == 200
    rw_data = rw_res.json()
    assert "match_rate" in rw_data
    assert rw_data["match_rate"] > 0
    assert len(rw_data["top_skills"]) > 0
    
    # 2. Tailor plan
    plan_res = client.post("/api/v3/tailor/plan", json={
        "job_description": job_desc,
        "job_title": "Senior Full-Stack Engineer",
        "company_name": "Stripe",
        "resume_id": "primary"
    })
    assert plan_res.status_code == 200
    plan_data = plan_res.json()
    assert "id" in plan_data
    review_id = plan_data["id"]
    assert len(plan_data["suggestions"]) > 0
    first_sug = plan_data["suggestions"][0]
    assert "line_id" in first_sug
    assert "suggested_text" in first_sug
    
    # 3. Log event
    evt_res = client.post("/api/v3/tailor/events", json={
        "review_id": review_id,
        "action": "accept",
        "line_id": first_sug["line_id"],
        "original_text": first_sug["original_text"],
        "new_text": first_sug["suggested_text"]
    })
    assert evt_res.status_code == 200
    assert evt_res.json()["status"] == "ok"
    
    # 4. Check reviews
    rev_res = client.get("/api/v3/tailor/reviews")
    assert rev_res.status_code == 200
    reviews = rev_res.json()["reviews"]
    assert any(r["id"] == review_id for r in reviews)
    
    # 5. Apply tailoring to produce tailored resume copy
    apply_res = client.post("/api/v3/tailor/apply", json={
        "review_id": review_id,
        "title": "Tailored: Stripe Senior Engineer",
        "accepted_changes": [
            {"line_id": first_sug["line_id"], "new_text": first_sug["suggested_text"]}
        ]
    })
    assert apply_res.status_code == 200
    applied_data = apply_res.json()
    assert "resume_id" in applied_data
    assert applied_data["title"] == "Tailored: Stripe Senior Engineer"

def test_templates_catalog_and_switch():
    # 1. List catalog
    t_res = client.get("/api/v3/templates/")
    assert t_res.status_code == 200
    t_data = t_res.json()
    assert len(t_data["templates"]) >= 3
    
    # 2. Switch template
    sw_res = client.post("/api/v3/templates/switch", json={
        "resume_id": "primary",
        "template_id": "modern_tech"
    })
    assert sw_res.status_code == 200
    sw_data = sw_res.json()
    assert sw_data["status"] == "success"
    assert sw_data["template"]["id"] == "modern_tech"
    
    # 3. PDF preview read
    pdf_res = client.get("/api/v3/templates/pdf/read/primary")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert b"%PDF" in pdf_res.content

def test_jobs_feed_and_kanban_tracker():
    # 1. Jobs feed search
    feed_res = client.get("/api/jobs/feed?query=full-stack&remote_only=true")
    assert feed_res.status_code == 200
    feed_data = feed_res.json()
    assert len(feed_data["jobs"]) >= 1
    assert feed_data["jobs"][0]["is_remote"] is True
    
    # 2. Rank status polling
    job_id = feed_data["jobs"][0]["id"]
    rank_res = client.get(f"/api/jobs/rank-status/{job_id}")
    assert rank_res.status_code == 200
    assert rank_res.json()["status"] == "completed"
    
    # 3. List tracked applications
    apps_res = client.get("/api/jobs/applications")
    assert apps_res.status_code == 200
    apps_data = apps_res.json()
    assert len(apps_data["applications"]) >= 1
    assert "counts" in apps_data
    
    # 4. Create new job application
    new_app_res = client.post("/api/jobs/applications", json={
        "title": "Senior AI Systems Engineer",
        "company": "OpenAI",
        "location": "San Francisco, CA (Hybrid)",
        "salary_range": "$210,000 - $280,000",
        "stage": "applied",
        "match_percentage": 91
    })
    assert new_app_res.status_code == 200
    new_app = new_app_res.json()
    assert "id" in new_app
    app_id = new_app["id"]
    
    # 5. Update application stage (Drag and Drop in Kanban)
    patch_res = client.patch(f"/api/jobs/applications/{app_id}", json={
        "stage": "interview",
        "notes": "First round screen passed."
    })
    assert patch_res.status_code == 200
    assert patch_res.json()["stage"] == "interview"
    
    # 6. Delete application
    del_res = client.delete(f"/api/jobs/applications/{app_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"
