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

def test_auto_apply_system():
    # 1. Get preferences
    pref_res = client.get("/api/auto-apply/preferences")
    assert pref_res.status_code == 200
    assert pref_res.json()["min_match_threshold"] == 85
    
    # 2. Update preferences
    up_pref_res = client.put("/api/auto-apply/preferences", json={
        "min_salary": 185000,
        "daily_submission_limit": 15
    })
    assert up_pref_res.status_code == 200
    assert up_pref_res.json()["min_salary"] == 185000
    assert up_pref_res.json()["daily_submission_limit"] == 15
    
    # 3. Facts store
    facts_res = client.get("/api/auto-apply/facts")
    assert facts_res.status_code == 200
    assert "work_authorization" in facts_res.json()["facts"]
    
    # 4. Update facts
    up_facts_res = client.put("/api/auto-apply/facts", json={
        "facts": {"preferred_location": "San Francisco, CA or New York, NY (Hybrid)"}
    })
    assert up_facts_res.status_code == 200
    
    # 5. Saved answers
    ans_res = client.get("/api/auto-apply/saved-answers/all")
    assert ans_res.status_code == 200
    assert len(ans_res.json()["answers"]) >= 1
    
    # 6. Generate job answers
    gen_res = client.post("/api/auto-apply/job-answers", json={
        "job_id": "job_101",
        "questions": ["Why are you interested in Stripe?", "Describe your experience with distributed queues."]
    })
    assert gen_res.status_code == 200
    assert len(gen_res.json()["answers"]) == 2
    
    # 7. History & Trigger
    hist_res = client.get("/api/auto-apply/history")
    assert hist_res.status_code == 200
    assert len(hist_res.json()["submissions"]) >= 1
    
    trig_res = client.post("/api/auto-apply/trigger")
    assert trig_res.status_code == 200
    assert trig_res.json()["status"] == "dispatched"

def test_season_gamification():
    # 1. Goal
    goal_res = client.get("/api/season/goal")
    assert goal_res.status_code == 200
    goal_data = goal_res.json()
    assert goal_data["season_number"] == 3
    assert len(goal_data["badges"]) >= 3
    
    # 2. Update goal
    up_goal_res = client.post("/api/season/goal", json={"target_applications": 15})
    assert up_goal_res.status_code == 200
    assert up_goal_res.json()["weekly_goal"]["target_applications"] == 15
    
    # 3. Mark seen
    seen_res = client.post("/api/season/seen?badge_id=b_ats_perfection")
    assert seen_res.status_code == 200
    
    # 4. Leaderboard
    lead_res = client.get("/api/season/elsewhere")
    assert lead_res.status_code == 200
    assert len(lead_res.json()["leaderboard"]) >= 3

def test_billing_and_account():
    # 1. Entitlements
    ent_res = client.get("/api/billing/entitlements")
    assert ent_res.status_code == 200
    assert ent_res.json()["tier"] in ["pro", "unlimited", "free"]
    
    # 2. Checkout session
    chk_res = client.post("/api/billing/checkout", json={"tier": "unlimited", "billing_period": "annual"})
    assert chk_res.status_code == 200
    assert "checkout_session_id" in chk_res.json()
    
    # 3. Promo code
    code_res = client.post("/api/billing/code", json={"code": "LAUNCH50"})
    assert code_res.status_code == 200
    assert code_res.json()["valid"] is True
    assert code_res.json()["discount_percentage"] == 50
    
    # 4. Invoices
    inv_res = client.get("/api/billing/payments")
    assert inv_res.status_code == 200
    assert len(inv_res.json()["invoices"]) >= 1
    
    # 5. Profile & preferences
    prof_res = client.get("/api/account/profile")
    assert prof_res.status_code == 200
    assert prof_res.json()["name"] == "Alex Rivera"
    
    up_prof_res = client.put("/api/account/profile", json={"title": "Staff Platform Engineer"})
    assert up_prof_res.status_code == 200
    assert up_prof_res.json()["title"] == "Staff Platform Engineer"
