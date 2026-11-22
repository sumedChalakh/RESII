import uuid
import secrets
import time
import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.db import SessionLocal
from api.models import UserModel, ResumeModel, ManagedFileModel
from api.security import sign_session_id, generate_csrf_token
from api.rate_limiter import limiter
from api.config import settings

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_test_state():
    limiter.reset()
    client.cookies.clear()
    yield
    limiter.reset()
    client.cookies.clear()


def test_scenario_01_successful_registration():
    """Scenario 1: Successful registration creates user, profile, sets cookies and returns 201."""
    unique_email = f"candidate_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": unique_email,
        "password": "ValidPassword123!",
        "name": "Alex Taylor"
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["status"] == "success"
    assert data["user"]["email"] == unique_email
    assert data["user"]["name"] == "Alex Taylor"
    assert data["user"]["role"] == "user"
    assert "free" in data["user"]["entitlements"]
    assert "admin" not in data["user"]["entitlements"]

    # Verify cookies
    assert "resii_session" in res.cookies
    assert "resii_csrf" in res.cookies


def test_scenario_02_duplicate_email_rejection():
    """Scenario 2: Duplicate email registration returns 409 Conflict."""
    unique_email = f"candidate_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": unique_email,
        "password": "ValidPassword123!",
        "name": "First User"
    }
    res1 = client.post("/api/auth/register", json=payload)
    assert res1.status_code == 201

    # Attempt to register again with same email
    res2 = client.post("/api/auth/register", json=payload)
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"].lower()


def test_scenario_03_invalid_email_rejection():
    """Scenario 3: Invalid email format is rejected with 422."""
    payload = {
        "email": "not-a-valid-email",
        "password": "ValidPassword123!",
        "name": "Invalid User"
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 422


def test_scenario_04_weak_password_rejection():
    """Scenario 4: Weak passwords (short or missing digits/symbols) are rejected with 400."""
    # Too short (<8 chars)
    res_short = client.post("/api/auth/register", json={
        "email": f"cand_{uuid.uuid4().hex[:6]}@example.com",
        "password": "Short1!"
    })
    assert res_short.status_code == 400
    assert "at least 8 characters" in res_short.json()["detail"]

    # Only letters (no numbers or symbols)
    res_no_num = client.post("/api/auth/register", json={
        "email": f"cand_{uuid.uuid4().hex[:6]}@example.com",
        "password": "AllLettersPassword"
    })
    assert res_no_num.status_code == 400
    assert "letter and one number or special character" in res_no_num.json()["detail"]


def test_scenario_05_login_after_registration():
    """Scenario 5: Successfully login with newly registered credentials."""
    email = f"candidate_{uuid.uuid4().hex[:8]}@example.com"
    password = "CorrectPassword2026!"
    
    # 1. Register
    reg_res = client.post("/api/auth/register", json={"email": email, "password": password, "name": "Login Test"})
    assert reg_res.status_code == 201

    # Clear cookies to simulate returning from fresh session
    client.cookies.clear()

    # 2. Login
    login_res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["user"]["email"] == email
    assert "resii_session" in login_res.cookies


def test_scenario_06_authenticated_session_verification():
    """Scenario 6: Verify authenticated session returns the registered user's profile."""
    email = f"candidate_{uuid.uuid4().hex[:8]}@example.com"
    password = "SessionPassword123!"
    reg_res = client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201
    cookie = reg_res.cookies["resii_session"]

    session_res = client.get("/api/auth/get-session", cookies={"resii_session": cookie})
    assert session_res.status_code == 200
    user_data = session_res.json()
    assert user_data["email"] == email


def test_scenario_07_resume_upload():
    """Scenario 7: Authenticated candidate can upload a valid resume."""
    email = f"candidate_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post("/api/auth/register", json={"email": email, "password": "ValidPassword123!"})
    cookie = reg_res.cookies["resii_session"]
    csrf = reg_res.cookies["resii_csrf"]

    resume_text = (
        b"Jane Candidate\n"
        b"Staff Software Engineer\n"
        b"jane@example.com | San Francisco, CA\n\n"
        b"EXPERIENCE\n"
        b"Principal Architect at Acme Corp (2020 - Present)\n"
        b"- Scaled distributed microservices with 99.99% availability.\n"
    )

    upload_res = client.post(
        "/api/v3/resumes/upload",
        files={"file": ("resume.txt", resume_text, "text/plain")},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert upload_res.status_code == 200, upload_res.text
    data = upload_res.json()
    assert "id" in data
    assert data["title"] == "Resume"
    assert data["version"] == 1


def test_scenario_08_resume_listing():
    """Scenario 8: GET /api/v3/resumes returns candidate's uploaded resumes."""
    email = f"candidate_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post("/api/auth/register", json={"email": email, "password": "ValidPassword123!"})
    cookie = reg_res.cookies["resii_session"]
    csrf = reg_res.cookies["resii_csrf"]

    # Initially 0 resumes for fresh candidate
    list1 = client.get("/api/v3/resumes", cookies={"resii_session": cookie})
    assert list1.status_code == 200
    assert len(list1.json()) == 0

    # Upload 1 resume
    upload_res = client.post(
        "/api/v3/resumes/upload",
        files={"file": ("test_doc.txt", b"Test Candidate\nExperience\n- Did something.", "text/plain")},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert upload_res.status_code == 200

    # List again -> 1 resume
    list2 = client.get("/api/v3/resumes", cookies={"resii_session": cookie})
    assert list2.status_code == 200
    items = list2.json()
    assert len(items) == 1
    assert items[0]["id"] == upload_res.json()["id"]


def test_scenario_09_resume_deletion():
    """Scenario 9: Candidate can delete their own resume."""
    email = f"candidate_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post("/api/auth/register", json={"email": email, "password": "ValidPassword123!"})
    cookie = reg_res.cookies["resii_session"]
    csrf = reg_res.cookies["resii_csrf"]

    # Upload resume
    upload_res = client.post(
        "/api/v3/resumes/upload",
        files={"file": ("delete_me.txt", b"Temporary Candidate Resume\nExperience\n- Details", "text/plain")},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    resume_id = upload_res.json()["id"]

    # Delete resume
    del_res = client.delete(
        f"/api/v3/resumes/{resume_id}",
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify subsequent GET returns 404
    get_res = client.get(f"/api/v3/resumes/{resume_id}", cookies={"resii_session": cookie})
    assert get_res.status_code == 404


def test_scenario_10_unauthorized_resume_deletion():
    """Scenario 10: Unauthenticated requests cannot delete resumes."""
    client.cookies.clear()
    del_res = client.delete("/api/v3/resumes/primary")
    assert del_res.status_code == 401


def test_scenario_11_cross_user_resume_access_prevention():
    """Scenario 11: Candidate A cannot access or delete Candidate B's resume."""
    client_a = TestClient(app)
    client_b = TestClient(app)

    # Register Candidate A
    email_a = f"cand_a_{uuid.uuid4().hex[:6]}@example.com"
    reg_a = client_a.post("/api/auth/register", json={"email": email_a, "password": "Password123!"})
    assert reg_a.status_code == 201
    csrf_a = reg_a.cookies["resii_csrf"]

    # Register Candidate B
    email_b = f"cand_b_{uuid.uuid4().hex[:6]}@example.com"
    reg_b = client_b.post("/api/auth/register", json={"email": email_b, "password": "Password123!"})
    assert reg_b.status_code == 201
    csrf_b = reg_b.cookies["resii_csrf"]

    # Candidate A uploads resume
    up_a = client_a.post(
        "/api/v3/resumes/upload",
        files={"file": ("a_resume.txt", b"Candidate A Resume\nContent", "text/plain")},
        headers={"X-CSRF-Token": csrf_a}
    )
    assert up_a.status_code == 200, up_a.text
    res_a_id = up_a.json()["id"]

    # Candidate B tries to read Candidate A's resume -> 404
    read_attempt = client_b.get(f"/api/v3/resumes/{res_a_id}")
    assert read_attempt.status_code == 404

    # Candidate B tries to delete Candidate A's resume -> 404
    del_attempt = client_b.delete(
        f"/api/v3/resumes/{res_a_id}",
        headers={"X-CSRF-Token": csrf_b}
    )
    assert del_attempt.status_code == 404


def test_scenario_12_database_persistence():
    """Scenario 12: Registered users and uploaded resumes persist in the database."""
    email = f"persist_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post("/api/auth/register", json={"email": email, "password": "Password123!", "name": "Persist User"})
    cookie = reg_res.cookies["resii_session"]
    csrf = reg_res.cookies["resii_csrf"]

    up_res = client.post(
        "/api/v3/resumes/upload",
        files={"file": ("persisted.txt", b"Persisted Resume Text\nContent", "text/plain")},
        cookies={"resii_session": cookie},
        headers={"X-CSRF-Token": csrf}
    )
    res_id = up_res.json()["id"]

    # Query DB directly via SessionLocal
    with SessionLocal() as db:
        user_row = db.query(UserModel).filter(UserModel.email == email).first()
        assert user_row is not None
        assert user_row.name == "Persist User"

        resume_row = db.query(ResumeModel).filter(ResumeModel.id == res_id).first()
        assert resume_row is not None
        assert resume_row.user_id == user_row.id


def test_scenario_13_csrf_protection_remains_enforced():
    """Scenario 13: Authenticated state-changing endpoints reject missing or invalid CSRF token."""
    email = f"csrf_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post("/api/auth/register", json={"email": email, "password": "Password123!"})
    cookie = reg_res.cookies["resii_session"]

    # Attempt delete without CSRF header
    del_res = client.delete("/api/v3/resumes/any_id", cookies={"resii_session": cookie})
    assert del_res.status_code == 403
    assert "CSRF token missing or invalid" in del_res.json()["detail"]


def test_scenario_14_existing_demo_and_auth_no_regression():
    """Scenario 14: Existing demo login and standard auth flow remain functional."""
    demo_res = client.post("/api/auth/demo-login")
    assert demo_res.status_code == 200
    data = demo_res.json()
    assert data["user"]["email"] == "demo@resii.com"
    assert data["user"]["name"] == "Alex Rivera"

    demo_cookie = demo_res.cookies["resii_session"]
    sess_res = client.get("/api/auth/get-session", cookies={"resii_session": demo_cookie})
    assert sess_res.status_code == 200
    assert sess_res.json()["email"] == "demo@resii.com"


def test_scenario_15_concurrent_registration_race_handling(monkeypatch):
    """Scenario 15: Concurrent duplicate registration hitting database UNIQUE constraint returns 409, not 500."""
    email = f"race_{uuid.uuid4().hex[:8]}@example.com"
    password = "RacePassword123!"

    # 1. First registration commits successfully
    res1 = client.post("/api/auth/register", json={"email": email, "password": password})
    assert res1.status_code == 201

    # 2. Simulate concurrent second request where application pre-check read None before commit
    orig_query = SessionLocal.query if hasattr(SessionLocal, "query") else None

    from sqlalchemy.orm import Session
    real_query = Session.query

    def mock_query(self, *entities, **kwargs):
        q = real_query(self, *entities, **kwargs)
        # If querying UserModel by email, pretend user was not found to simulate race window
        if entities and entities[0] is UserModel:
            orig_filter = q.filter
            def mock_filter(*criterion):
                filtered = orig_filter(*criterion)
                # Override .first() to return None simulating the pre-check window
                filtered.first = lambda: None
                return filtered
            q.filter = mock_filter
        return q

    monkeypatch.setattr(Session, "query", mock_query)

    # Second registration should hit database UNIQUE constraint on commit and return 409
    res2 = client.post("/api/auth/register", json={"email": email, "password": password})
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"]


def test_scenario_16_unexpected_integrity_failure_handling(monkeypatch):
    """Scenario 16: Unrelated integrity errors return HTTP 500 and are NOT misclassified as 409."""
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    email = f"integrity_{uuid.uuid4().hex[:8]}@example.com"
    password = "IntegrityPassword123!"

    def mock_commit(self):
        # Simulate an unrelated database constraint violation (e.g. check constraint or foreign key)
        raise IntegrityError(
            statement="INSERT INTO users ...",
            params={},
            orig=Exception("CHECK constraint failed: users.role")
        )

    monkeypatch.setattr(Session, "commit", mock_commit)

    res = client.post("/api/auth/register", json={"email": email, "password": password})
    assert res.status_code == 500
    assert "already exists" not in res.json()["detail"].lower()
    assert "integrity constraint" in res.json()["detail"].lower()

