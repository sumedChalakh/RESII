import time
import pytest
from fastapi.testclient import TestClient
from api.main import app
from api.database import active_sessions
from api.config import settings
from api.security import sign_session_id
from api.db import SessionLocal
from api.models import ResumeModel, JobApplicationModel, JobListingModel
from api.season import _compute_activity_based_season

@pytest.fixture
def test_client():
    return TestClient(app)

def test_dashboard_overview_endpoint(test_client):
    user_data = {
        'id': 'usr_486f8383c717',
        'email': 'sumedchalakh528@gmail.com',
        'name': 'Sumed Chalakh',
        'created_at': '2026-11-21T00:00:00Z'
    }
    session_id = 'test-session-dashboard-verify'
    active_sessions[session_id] = {'user': user_data, 'created_at': time.time()}
    signed = sign_session_id(session_id, settings.SECRET_KEY)
    test_client.cookies.set(settings.COOKIE_NAME, signed)

    res = test_client.get('/api/v3/resumes/dashboard-overview')
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"

    data = res.json()
    assert "primary_resume" in data
    assert data["primary_resume"] is not None
    assert data["primary_resume"]["candidate_name"] == "SUMED CHALAKH"
    assert len(data["primary_resume"]["preview_sections"]) > 0

    assert "this_week" in data
    assert data["this_week"]["applied_count"] == 1
    # User has 1 application and 2 resumes in DB, which derives level 2 with 550 XP (not hardcoded level 6)
    assert data["this_week"]["level"] == 2
    assert data["this_week"]["points_to_next"] == 250

    assert "tailored_summary" in data
    assert data["tailored_summary"]["total_count"] == 0

    assert "top_matches" in data
    assert len(data["top_matches"]) > 0

def test_jobs_feed_performance_and_content(test_client):
    user_data = {
        'id': 'usr_486f8383c717',
        'email': 'sumedchalakh528@gmail.com',
        'name': 'Sumed Chalakh',
        'created_at': '2026-11-21T00:00:00Z'
    }
    session_id = 'test-session-feed-verify'
    active_sessions[session_id] = {'user': user_data, 'created_at': time.time()}
    signed = sign_session_id(session_id, settings.SECRET_KEY)
    test_client.cookies.set(settings.COOKIE_NAME, signed)

    t0 = time.time()
    res = test_client.get('/api/jobs/feed')
    t1 = time.time()

    assert res.status_code == 200
    assert (t1 - t0) < 1.0, f"Jobs feed response took {t1 - t0:.2f}s, expected < 1.0s"

    data = res.json()
    assert data["total"] > 0
    assert len(data["jobs"]) > 0
    assert data["jobs"][0]["title"] is not None
    assert data["jobs"][0]["company"] is not None

def test_new_user_season_level_starts_at_level_1():
    with SessionLocal() as db:
        # A hypothetical new user with 0 activity
        result = _compute_activity_based_season(db, "usr_nonexistent_new_user_12345")
        assert result["current_level"] == 1
        assert result["current_xp"] == 0
        assert result["xp_to_next_level"] == 400
        assert result["tier"] == "Bronze"
