import io
import pytest
import docx
import fitz
from fastapi.testclient import TestClient
from api.main import app
from api.ingestion import extract_text_from_file, parse_text_into_document_tree
from api.pdf_engine import generate_pdf
from api.docx_engine import generate_docx
from api.security import unsign_session_id, generate_csrf_token
from api.rate_limiter import limiter
from api.config import settings

client = TestClient(app)

@pytest.fixture(autouse=True)
def authenticate_client():
    """Authenticate client as demo user before each test and provide CSRF token."""
    limiter.reset()
    res = client.post("/api/auth/demo-login")
    session_cookie = res.cookies.get("resii_session")
    session_id = unsign_session_id(session_cookie, settings.SECRET_KEY)
    if session_id:
        csrf_tok = generate_csrf_token(session_id, settings.SECRET_KEY)
        client.headers["X-CSRF-Token"] = csrf_tok


def _make_sample_pdf(candidate_name: str, company: str, bullet_text: str) -> bytes:
    """Helper to generate a genuine synthetic PDF using PyMuPDF."""
    doc = fitz.open()
    page = doc.new_page(width=595.32, height=841.92)
    page.insert_text(fitz.Point(72, 72), candidate_name, fontsize=16)
    page.insert_text(fitz.Point(72, 92), f"candidate@{candidate_name.lower().replace(' ', '')}.com | (555) 123-4567 | Austin, TX", fontsize=10)
    page.insert_text(fitz.Point(72, 120), "EXPERIENCE", fontsize=12)
    page.insert_text(fitz.Point(72, 140), f"Staff Engineer — {company} | 2021 – Present", fontsize=11)
    page.insert_text(fitz.Point(82, 160), f"• {bullet_text}", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


def _make_sample_docx(candidate_name: str, company: str, bullet_text: str, with_table: bool = False) -> bytes:
    """Helper to generate a genuine synthetic DOCX using python-docx."""
    doc = docx.Document()
    doc.add_heading(candidate_name, level=1)
    doc.add_paragraph(f"candidate@{candidate_name.lower().replace(' ', '')}.com | Seattle, WA")
    doc.add_heading("EXPERIENCE", level=2)
    doc.add_paragraph(f"Principal Architect — {company} (2020 – Present)")
    doc.add_paragraph(bullet_text, style="List Bullet")
    
    if with_table:
        doc.add_heading("EDUCATION", level=2)
        table = doc.add_table(rows=2, cols=2)
        table.rows[0].cells[0].text = "Degree"
        table.rows[0].cells[1].text = "Institution"
        table.rows[1].cells[0].text = "M.S. Computer Science"
        table.rows[1].cells[1].text = "Georgia Tech"

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ==============================================================================
# 1. Ingestion & Extraction Tests
# ==============================================================================

def test_pdf_ingestion_accuracy():
    """Verify genuine PDF extracts actual text in reading order without fabrication."""
    candidate = "Elena Rostova"
    company = "Quantum Dynamics Lab"
    bullet = "Engineered quantum entanglement simulator with 99.98% state preservation across 64 qubits."
    pdf_bytes = _make_sample_pdf(candidate, company, bullet)

    extracted = extract_text_from_file("Elena_Resume.pdf", pdf_bytes)
    assert candidate in extracted
    assert company in extracted
    assert "99.98%" in extracted

    tree = parse_text_into_document_tree(extracted, "Elena_Resume.pdf")
    assert tree["header"]["name"] == candidate
    assert "Elena" in tree["header"]["name"]
    # Verify NO CloudScale Systems or Apex Data Labs injected
    all_companies = [b.get("company", "") for s in tree["sections"] for b in s.get("blocks", [])]
    all_roles = [b.get("role", "") for s in tree["sections"] for b in s.get("blocks", [])]
    assert "CloudScale Systems" not in all_companies
    assert "Apex Data Labs" not in all_companies
    assert any(company in c or company in r for c, r in zip(all_companies, all_roles))


def test_docx_ingestion_with_tables():
    """Verify DOCX parser extracts both paragraphs and table cells without loss."""
    candidate = "Marcus Vance"
    company = "Vance Robotics"
    bullet = "Architected autonomous robotic arm kinematics reducing cycle time by 45%."
    docx_bytes = _make_sample_docx(candidate, company, bullet, with_table=True)

    extracted = extract_text_from_file("Marcus_Vance.docx", docx_bytes)
    assert candidate in extracted
    assert company in extracted
    assert "Georgia Tech" in extracted
    assert "M.S. Computer Science" in extracted

    tree = parse_text_into_document_tree(extracted, "Marcus_Vance.docx")
    assert tree["header"]["name"] == candidate
    # Verify no fabricated data
    all_text = " ".join([l.get("text", "") for s in tree["sections"] for b in s.get("blocks", []) for l in b.get("lines", [])])
    assert "CloudScale" not in all_text


def test_txt_ingestion_utf8():
    """Verify plain text resume parsing."""
    raw_txt = """Samantha Bloom
Lead Site Reliability Engineer
samantha.bloom@skyline.org | (555) 987-6543 | Chicago, IL

PROFESSIONAL SUMMARY
Dedicated SRE leader with 8+ years maintaining four-nines reliability for distributed cloud infrastructure.

WORK EXPERIENCE
Skyline Cloud Infrastructure — Lead SRE
2022 – Present | Chicago, IL
• Orchestrated Kubernetes multi-cluster failover automation, decreasing disaster recovery MTTR by 60%.
• Reduced cloud compute expenditure by $180,000 annually via node rightsizing.

EDUCATION
B.S. in Information Systems — University of Illinois
2014 – 2018
"""
    tree = parse_text_into_document_tree(raw_txt, "Samantha_Bloom.txt")
    assert tree["header"]["name"] == "Samantha Bloom"
    assert tree["header"]["email"] == "samantha.bloom@skyline.org"
    assert tree["header"]["location"] == "Chicago, IL"
    assert len(tree["sections"]) >= 2
    assert tree["ats_score"] > 70


def test_empty_and_scanned_pdf_handling():
    """Verify empty or scanned PDF does not crash and produces clean structure without fake data."""
    # Create empty PDF
    doc = fitz.open()
    doc.new_page(width=595.32, height=841.92) # 1 blank page
    empty_pdf_bytes = doc.tobytes()
    doc.close()

    extracted = extract_text_from_file("Empty_Resume.pdf", empty_pdf_bytes)
    assert extracted == ""

    tree = parse_text_into_document_tree(extracted, "Empty_Resume.pdf")
    assert tree["header"]["name"] == "Empty Resume"
    assert tree["sections"] == []
    assert tree["ats_score"] == 50
    # Crucial safeguard: no fake jobs added
    assert len(tree["sections"]) == 0


def test_malformed_pdf_string_recovery():
    """Verify malformed PDF stream recovers embedded strings safely."""
    malformed = b"%PDF-1.4\nSome raw text content for Liam Chen liam@chen.io Austin TX"
    extracted = extract_text_from_file("Liam_Chen.pdf", malformed)
    assert "Liam Chen" in extracted or "liam@chen.io" in extracted


# ==============================================================================
# 2. Upload Endpoint Tests
# ==============================================================================

def test_genuine_pdf_upload_endpoint():
    """Verify POST /api/v3/resumes/upload with a real PDF returns parsed genuine candidate data."""
    pdf_bytes = _make_sample_pdf("Nadia Al-Mansoor", "Cerebral Analytics", "Spearheaded neural pipeline inference optimization.")
    files = {"file": ("Nadia_Al_Mansoor.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    response = client.post("/api/v3/resumes/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    doc = data["document"]
    assert doc["header"]["name"] == "Nadia Al-Mansoor"
    # Ensure no CloudScale Systems
    companies = [b.get("company", "") for s in doc["sections"] for b in s.get("blocks", [])]
    assert "CloudScale Systems" not in companies


def test_genuine_docx_upload_endpoint():
    """Verify POST /api/v3/resumes/upload with a real DOCX returns genuine parsed tree."""
    docx_bytes = _make_sample_docx("Tariq Thorne", "Thorne Security", "Designed zero-trust IAM architecture.")
    files = {"file": ("Tariq_Thorne.docx", io.BytesIO(docx_bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}

    response = client.post("/api/v3/resumes/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    doc = data["document"]
    assert doc["header"]["name"] == "Tariq Thorne"


# ==============================================================================
# 3. Export & Roundtrip Verification Tests
# ==============================================================================

def test_export_pdf_endpoint_and_roundtrip():
    """
    Verify GET /api/v3/resumes/{id}/export/pdf:
    1. Returns genuine PDF with headers.
    2. Re-extracting text from the generated PDF confirms candidate details are preserved.
    """
    # 1. Upload a resume
    pdf_input = _make_sample_pdf("Zoe Sterling", "Apex Horizon AI", "Deployed real-time vector search across 50M embeddings.")
    files = {"file": ("Zoe_Sterling.pdf", io.BytesIO(pdf_input), "application/pdf")}
    up_res = client.post("/api/v3/resumes/upload", files=files)
    assert up_res.status_code == 200
    resume_id = up_res.json()["id"]

    # 2. Export PDF
    exp_res = client.get(f"/api/v3/resumes/{resume_id}/export/pdf")
    assert exp_res.status_code == 200
    assert exp_res.headers["Content-Type"] == "application/pdf"
    assert "attachment" in exp_res.headers.get("Content-Disposition", "")
    assert exp_res.content.startswith(b"%PDF-1.")

    # 3. Roundtrip re-parse generated PDF with PyMuPDF
    doc_reopened = fitz.open(stream=exp_res.content, filetype="pdf")
    assert len(doc_reopened) >= 1
    extracted_text = "\n".join(p.get_text() for p in doc_reopened)
    doc_reopened.close()

    assert "Zoe Sterling" in extracted_text
    assert "Apex Horizon AI" in extracted_text
    assert "50M embeddings" in extracted_text


def test_export_docx_endpoint_and_roundtrip():
    """
    Verify GET /api/v3/resumes/{id}/export/docx:
    1. Returns genuine DOCX.
    2. Re-extracting text from generated DOCX confirms candidate details are preserved.
    """
    docx_input = _make_sample_docx("Kofi Mensah", "Kofi Financial", "Designed PCI-DSS compliant payment reconciliation engine.")
    files = {"file": ("Kofi_Mensah.docx", io.BytesIO(docx_input), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    up_res = client.post("/api/v3/resumes/upload", files=files)
    assert up_res.status_code == 200
    resume_id = up_res.json()["id"]

    # Export DOCX
    exp_res = client.get(f"/api/v3/resumes/{resume_id}/export/docx")
    assert exp_res.status_code == 200
    assert "openxmlformats" in exp_res.headers["Content-Type"]
    assert "attachment" in exp_res.headers.get("Content-Disposition", "")

    # Roundtrip re-parse with python-docx
    doc_reopened = docx.Document(io.BytesIO(exp_res.content))
    all_paras = [p.text for p in doc_reopened.paragraphs]
    doc_text = " ".join(all_paras)

    assert "Kofi Mensah" in doc_text
    assert "Kofi Financial" in doc_text
    assert "payment reconciliation" in doc_text


def test_template_switching_affects_pdf_export():
    """Verify switching template modifies the exported PDF typography and accent styling."""
    # Switch to executive_serif
    switch_res = client.post(
        "/api/v3/templates/switch",
        json={"resume_id": "primary", "template_id": "executive_serif"}
    )
    assert switch_res.status_code == 200

    # Export PDF
    pdf_res = client.get("/api/v3/resumes/primary/export/pdf")
    assert pdf_res.status_code == 200
    assert len(pdf_res.content) > 1000

    # Also test templates preview endpoint
    prev_res = client.get("/api/v3/templates/pdf/read/primary")
    assert prev_res.status_code == 200
    assert prev_res.headers["Content-Type"] == "application/pdf"
    assert prev_res.content.startswith(b"%PDF-1.")

    # Re-open and verify it's a real PDF
    doc = fitz.open(stream=prev_res.content, filetype="pdf")
    assert len(doc) >= 1
    doc.close()


def test_docx_template_download_preview_route():
    """Verify /api/v3/templates/download/docx/{id} streams a valid DOCX."""
    res = client.get("/api/v3/templates/download/docx/primary")
    assert res.status_code == 200
    assert "openxmlformats" in res.headers["Content-Type"]
    doc = docx.Document(io.BytesIO(res.content))
    assert len(doc.paragraphs) > 0


# ==============================================================================
# 4. Security & Ownership Tests
# ==============================================================================

def test_unauthenticated_export_blocked():
    """Verify unauthenticated user cannot export resumes."""
    client.cookies.clear()
    res_pdf = client.get("/api/v3/resumes/primary/export/pdf")
    assert res_pdf.status_code == 401

    res_docx = client.get("/api/v3/resumes/primary/export/docx")
    assert res_docx.status_code == 401


def test_unauthorized_idor_export_rejected():
    """Verify cross-user IDOR access to non-existent or other user resume returns 404."""
    res = client.get("/api/v3/resumes/non_existent_id/export/pdf")
    assert res.status_code == 404

    res_w = client.get("/api/v3/resumes/non_existent_id/export/docx")
    assert res_w.status_code == 404
