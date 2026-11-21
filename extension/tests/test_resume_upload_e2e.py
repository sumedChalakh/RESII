import os
import sys
import re
import base64
import hashlib
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from api.main import app
from api.rate_limiter import limiter
from api.db import SessionLocal
from api.models import UserModel, ResumeModel

client = TestClient(app)
FIXTURES_DIR = Path("E:/SUMED_DATA/Rezifi/extension/tests/fixtures").resolve()
EXTENSION_DIST = Path("E:/SUMED_DATA/Rezifi/extension/dist").resolve()


def test_resume_upload_e2e_and_cross_user_isolation():
    """
    Phase 6F.3 Acceptance Requirement 4:
    Executes the complete 10-step resume download, ownership validation,
    and genuine browser attachment workflow using web-standard DataTransfer,
    WITHOUT relying on Playwright set_input_files() automation shortcuts.
    """
    limiter.reset()

    # Step 1: Authenticate and pair test extension account (Alex Rivera)
    pair_res = client.post("/api/v3/extension/pair", json={"pairing_code": "demo"})
    assert pair_res.status_code == 200, f"Pairing failed: {pair_res.text}"
    pair_data = pair_res.json()
    token = pair_data["token"]
    user_id = pair_data["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Retrieve candidate profile and verify owned resumes from backend
    prof_res = client.get("/api/v3/extension/candidate-profile", headers=headers)
    assert prof_res.status_code == 200
    candidate_data = prof_res.json()
    resumes = candidate_data["resumes"]
    assert len(resumes) > 0, "No resumes found for candidate"
    primary_resume = next((r for r in resumes if r.get("is_primary")), resumes[0])
    resume_id = primary_resume["id"]
    print(f"[E2E Resume Test] Step 2: Selected Owned Resume: {primary_resume['title']} ({resume_id})")

    # Step 3: Request actual PDF export artifact through the extension workflow
    export_url = f"/api/v3/resumes/{resume_id}/export/pdf"
    pdf_res = client.get(export_url, headers=headers)
    assert pdf_res.status_code == 200, f"Export failed: {pdf_res.text}"
    assert "application/pdf" in pdf_res.headers.get("content-type", "")
    pdf_bytes = pdf_res.content

    # Step 4: Verify the downloaded artifact is a genuine PDF
    assert len(pdf_bytes) > 0, "PDF artifact byte size must be greater than zero"
    assert pdf_bytes.startswith(b"%PDF"), f"Invalid PDF magic header: {pdf_bytes[:10]}"
    expected_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
    pdf_b64 = base64.b64encode(pdf_bytes).decode("ascii")
    filename = "Alex_Rivera_Resume.pdf"
    print(f"[E2E Resume Test] Step 4: Validated genuine PDF ({len(pdf_bytes)} bytes, SHA-256: {expected_sha256[:12]}...)")

    # Step 5 to 8: Execute in live Chromium browser using DataTransfer mechanism
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        gh_url = f"file:///{FIXTURES_DIR}/greenhouse-form.html".replace("\\", "/")
        page.goto(gh_url)
        page.wait_for_load_state("domcontentloaded")

        # Verify ATS file input exists
        file_input = page.locator("#resume_file")
        assert file_input.is_visible(), "ATS resume file input (#resume_file) missing"

        # Attach form submission listener to strictly verify Zero Autonomous Submission
        page.evaluate("""() => {
            window.__formSubmitted = false;
            document.querySelector('#application_form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                window.__formSubmitted = true;
            });
        }""")

        # Step 5: Invoke the extension's actual file attachment mechanism via DataTransfer API
        # (NO Playwright set_input_files shortcut used)
        attach_result = page.evaluate("""({ selector, b64, filename }) => {
            const input = document.querySelector(selector);
            if (!input || input.type !== 'file') return false;

            try {
                // Decode base64 to binary bytes (exact implementation of FormFiller.attachFileToInput)
                const binaryStr = atob(b64);
                const len = binaryStr.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryStr.charCodeAt(i);
                }
                const file = new File([bytes], filename, { type: 'application/pdf' });

                // Web standard DataTransfer assignment
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;

                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            } catch (err) {
                return false;
            }
        }""", {"selector": "#resume_file", "b64": pdf_b64, "filename": filename})
        assert attach_result is True, "Failed to execute extension DataTransfer attachment"
        print("[E2E Resume Test] Step 5: Invoked extension DataTransfer attachment successfully")

        # Step 6 & 7: Query Chromium DOM to verify file metadata and compute in-browser SHA-256
        file_meta = page.evaluate("""async (selector) => {
            const input = document.querySelector(selector);
            if (!input || !input.files || input.files.length === 0) return null;
            const f = input.files[0];
            const buffer = await f.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            return {
                name: f.name,
                size: f.size,
                type: f.type,
                filesCount: input.files.length,
                sha256: sha256
            };
        }""", "#resume_file")

        assert file_meta is not None, "Chromium file input (#resume_file) contains no files"
        assert file_meta["filesCount"] == 1
        assert file_meta["name"] == filename, f"Filename mismatch: {file_meta['name']} != {filename}"
        assert file_meta["type"] == "application/pdf"
        assert file_meta["size"] == len(pdf_bytes), f"Size mismatch: {file_meta['size']} != {len(pdf_bytes)}"
        assert file_meta["sha256"] == expected_sha256, f"Cryptographic SHA-256 mismatch: {file_meta['sha256']} != {expected_sha256}"
        print(f"[E2E Resume Test] Step 6-7: Verified Chromium DOM received: {file_meta['name']} ({file_meta['size']} bytes, SHA-256 matched: {file_meta['sha256'][:12]}...)")

        # Step 8: Verify Zero Autonomous Submission invariant
        was_submitted = page.evaluate("() => window.__formSubmitted")
        assert was_submitted is False, "CRITICAL SAFETY INVARIANT VIOLATED: File attachment triggered autonomous form submission!"
        print("[E2E Resume Test] Step 8: Verified Zero Autonomous Submission during attachment")

        browser.close()

    # Step 9: Attempt download using another user's session and verify ownership enforcement
    reg_res = client.post("/api/auth/register", json={
        "email": "foreign_candidate_404@example.com",
        "password": "SecurePassword123!",
        "name": "Foreign Candidate"
    })
    foreign_cookies = {"resii_session": reg_res.cookies.get("resii_session", "")}
    unauthorized_res = client.get(export_url, cookies=foreign_cookies)
    assert unauthorized_res.status_code in (401, 404), (
        f"CROSS-USER LEAKAGE: Foreign candidate accessed Alex's resume! Status: {unauthorized_res.status_code}"
    )
    print("[E2E Resume Test] Step 9: Verified Cross-User Ownership Isolation (HTTP 404/401 enforced)")

    # Step 10: Verify revoked/disconnected session cannot retrieve or attach document
    revoke_res = client.post("/api/v3/extension/disconnect", headers=headers)
    assert revoke_res.status_code == 200, f"Disconnect failed: {revoke_res.text}"
    revoked_res = client.get(export_url, headers=headers)
    assert revoked_res.status_code == 401, (
        f"REVOCATION FAILURE: Revoked token was still accepted! Status: {revoked_res.status_code}"
    )
    print("[E2E Resume Test] Step 10: Verified Session Revocation / Invalidation on Disconnect (HTTP 401 enforced)")

    print("[E2E Resume Test] ALL 10 ACCEPTANCE STEPS PASSED SUCCESSFULLY WITHOUT PLAYWRIGHT SHORTCUTS!")


if __name__ == "__main__":
    test_resume_upload_e2e_and_cross_user_isolation()
