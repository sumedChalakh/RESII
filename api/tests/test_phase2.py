import pytest
import io
from fastapi.testclient import TestClient
from api.main import app
from api.ingestion import parse_text_into_document_tree, extract_text_from_file
from api.layout_engine import calculate_layout_budget, compute_ats_score
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

def test_resume_parsing():
    """Verify parsing unstructured text into sections, blocks, lines."""
    raw = """Alex Rivera
Senior Full-Stack Engineer
alex@resii.dev
San Francisco, CA

EXPERIENCE
CloudScale Systems - Senior Software Engineer
2022 - Present
Engineered high-throughput FastAPI services, reducing P99 latency by 34%.
Orchestrated bi-weekly Agile sprints for a 6-engineer pod.
"""
    doc = parse_text_into_document_tree(raw)
    assert doc["header"]["name"] == "Alex Rivera"
    assert doc["header"]["email"] == "alex@resii.dev"
    assert len(doc["sections"]) >= 1
    assert doc["ats_score"] >= 70

def test_multipart_upload_endpoint():
    """Verify multipart file upload parsing into document tree."""
    dummy_pdf = b"%PDF-1.4 dummy resume content Alex Rivera alex@resii.dev"
    files = {"file": ("my_resume.pdf", io.BytesIO(dummy_pdf), "application/pdf")}
    
    response = client.post("/api/v3/resumes/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "document" in data
    assert data["version"] == 1

def test_get_resume_document_and_headers():
    """Verify GET /api/v3/resumes/{id}/document returns tree and custom layout headers."""
    response = client.get("/api/v3/resumes/primary/document")
    assert response.status_code == 200
    assert "X-Resume-Version" in response.headers
    assert "X-Page-Count" in response.headers
    assert "X-Tightened" in response.headers
    
    data = response.json()
    assert data["id"] == "primary"
    assert "document" in data
    assert "layout" in data

def test_optimistic_concurrency_conflict():
    """Verify that saving with a stale version triggers HTTP 409 Conflict."""
    # First get current document
    doc_resp = client.get("/api/v3/resumes/primary/document")
    current_ver = int(doc_resp.headers["X-Resume-Version"])

    # Attempt to save with a stale version (e.g. 1)
    stale_payload = {
        "version": 1,
        "document": doc_resp.json()["document"]
    }
    conflict_resp = client.put(
        "/api/v3/resumes/primary/document",
        json=stale_payload,
        headers={"X-Resume-Version": "1"}
    )
    
    if current_ver > 1:
        assert conflict_resp.status_code == 409
        detail = conflict_resp.json()["detail"]
        assert "server_version" in detail
        assert detail["server_version"] >= current_ver

def test_successful_save_bumps_version():
    """Verify saving with current version succeeds and increments X-Resume-Version."""
    doc_resp = client.get("/api/v3/resumes/primary/document")
    current_ver = int(doc_resp.headers["X-Resume-Version"])

    update_payload = {
        "version": current_ver,
        "document": doc_resp.json()["document"]
    }
    save_resp = client.put(
        "/api/v3/resumes/primary/document",
        json=update_payload,
        headers={"X-Resume-Version": str(current_ver)}
    )
    assert save_resp.status_code == 200
    new_ver = int(save_resp.headers["X-Resume-Version"])
    assert new_ver == current_ver + 1

def test_layout_budget_calculation():
    """Verify layout budget tightening when line count increases."""
    doc = parse_text_into_document_tree("Short resume")
    budget_small = calculate_layout_budget(doc)
    assert budget_small["page_count"] == 1
    assert budget_small["tightened"] is False
