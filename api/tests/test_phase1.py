import pytest
from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_unauthenticated_session_returns_null():
    """Verify that unauthenticated GET /api/auth/get-session returns null (exact Rezifi behavior)."""
    response = client.get("/api/auth/get-session")
    assert response.status_code == 200
    assert response.json() is None

def test_demo_login_flow():
    """Verify 1-click demo login sets session cookie and returns Alex Rivera."""
    response = client.post("/api/auth/demo-login")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["user"]["email"] == "demo@resii.com"
    assert data["user"]["name"] == "Alex Rivera"
    assert "resii_session" in response.cookies

    # Now verify GET /api/auth/get-session with this session cookie returns the user
    session_cookie = response.cookies["resii_session"]
    session_resp = client.get("/api/auth/get-session", cookies={"resii_session": session_cookie})
    assert session_resp.status_code == 200
    session_user = session_resp.json()
    assert session_user["email"] == "demo@resii.com"
    assert "ats_check" in session_user["entitlements"]

def test_custom_cors_and_computation_headers():
    """Verify required custom headers are exposed on API responses."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert "Server-Timing" in response.headers
    assert "X-Resume-Version" in response.headers
    assert "X-Page-Count" in response.headers
    assert "X-Tightened" in response.headers
    assert "X-Left-Out" in response.headers

def test_public_telemetry_arrival_204():
    """Verify public arrival beacon returns 204 No Content."""
    response = client.post("/public/visits/arrival")
    assert response.status_code == 204

def test_public_checks_creation_and_retrieval():
    """Verify public ATS check creation and retrieval."""
    res = client.post("/public/checks", json={"filename": "test_resume.pdf"})
    assert res.status_code == 200
    check = res.json()
    assert "id" in check
    assert check["ats_score"] == 78
    assert len(check["suggested_rewrites"]) > 0

    # Retrieve check
    get_res = client.get(f"/public/checks/{check['id']}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == check["id"]

def test_logout_clears_session():
    """Verify logout invalidates session."""
    login_res = client.post("/api/auth/demo-login")
    cookie = login_res.cookies["resii_session"]

    logout_res = client.post("/api/auth/logout", cookies={"resii_session": cookie})
    assert logout_res.status_code == 200

    # Now session should be null
    verify_res = client.get("/api/auth/get-session", cookies={"resii_session": cookie})
    assert verify_res.status_code == 200
    assert verify_res.json() is None
