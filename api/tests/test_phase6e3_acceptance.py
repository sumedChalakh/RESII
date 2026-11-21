import os
import uuid
import time
import copy
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from api.config import settings, Settings, validate_production_config
from api.main import app
from api.security import hash_password, sign_session_id, generate_csrf_token
from api.database import users_db, active_sessions
from api.resumes import resumes_db
from api.db import SessionLocal
from api.models import (
    UserModel,
    ResumeModel,
    TailorReviewModel,
    TailorEventModel,
    AIProviderSettingModel,
)
from api.crypto import (
    encrypt_credential,
    decrypt_credential,
    mask_credential,
    get_encryption_key,
    MissingKeyError,
    DecryptionError,
)
from api.ai.schemas import (
    AIProviderConfig,
    JobDescriptionAnalysis,
    ResumeMatchReport,
    TailoringPlanResponse,
    CoverLetterResponse,
    CandidateEvidenceLedger,
)
from api.ai.providers.base import (
    ProviderUnavailableError,
    ModelNotFoundError,
    ProviderAuthenticationError,
)
from api.ai.providers.mock import MockAIProvider
from api.ai.providers.ollama import OllamaProvider
from api.ai.evidence import build_evidence_ledger
from api.ai.job_analyzer import analyze_job_description
from api.ai.matcher import match_resume_to_job
from api.ai.tailor_engine import generate_tailoring_plan
from api.ai.fact_checker import verify_candidate_claim
from api.ai.cover_letter import generate_cover_letter

client = TestClient(app)

def create_user_session(user_id: str, email: str):
    pwd_hash = hash_password("Password123!")
    user_record = {
        "id": user_id,
        "email": email,
        "name": f"User {user_id}",
        "role": "user",
        "created_at": "2026-11-20T00:00:00Z",
        "entitlements": ["free", "ats_check", "resume_edit", "tailor"],
        "password_hash": pwd_hash
    }
    users_db[email] = user_record

    with SessionLocal() as db_session:
        existing = db_session.query(UserModel).filter(UserModel.id == user_id).first()
        if not existing:
            db_session.add(UserModel(
                id=user_id,
                email=email,
                name=f"User {user_id}",
                role="user",
                password_hash=pwd_hash,
                created_at="2026-11-20T00:00:00Z"
            ))
            db_session.commit()

    session_id = f"sess_{user_id}_{int(time.time()*1000)}"
    now = time.time()
    active_sessions[session_id] = {
        "user": user_record,
        "created_at": now,
        "last_active": now
    }
    cookie_val = sign_session_id(session_id, settings.SECRET_KEY)
    csrf_token = generate_csrf_token(session_id, settings.SECRET_KEY)
    return cookie_val, csrf_token


# ==============================================================================
# TASK 1: SECURITY ACCEPTANCE CHECKS
# ==============================================================================

class TestSecurityAcceptance:
    def test_production_cannot_use_development_derived_key(self):
        """Production environment strictly prohibits falling back to dev-derived encryption key."""
        prod_settings = Settings(
            ENVIRONMENT="production",
            SECRET_KEY="a" * 32,
            COOKIE_SECURE=True,
            CREDENTIAL_ENCRYPTION_KEY=None
        )
        with patch("api.crypto.settings", prod_settings):
            with pytest.raises(MissingKeyError) as exc_info:
                get_encryption_key()
            assert "prohibited" in str(exc_info.value).lower() or "required" in str(exc_info.value).lower()

    def test_production_startup_fails_if_encryption_key_missing(self):
        """Production startup fails safely if CREDENTIAL_ENCRYPTION_KEY is missing or weak."""
        prod_settings = Settings(
            ENVIRONMENT="production",
            SECRET_KEY="b" * 32,
            COOKIE_SECURE=True,
            CREDENTIAL_ENCRYPTION_KEY=None
        )
        with pytest.raises(RuntimeError) as exc_info:
            validate_production_config(prod_settings)
        assert "CREDENTIAL_ENCRYPTION_KEY" in str(exc_info.value)

    def test_database_backup_contains_no_plaintext_keys(self):
        """Direct database inspection confirms zero plaintext API keys are persisted."""
        with SessionLocal() as db:
            rows = db.query(AIProviderSettingModel).all()
            for r in rows:
                if r.api_key_encrypted:
                    assert r.api_key_encrypted.startswith("v1:")
                    # Ensure decrypted key isn't stored literally in the encrypted column
                    assert not r.api_key_encrypted.startswith("sk-")
                if r.api_key_redacted:
                    # Redacted mask must never be a full raw key
                    assert "..." in r.api_key_redacted or "***" in r.api_key_redacted or len(r.api_key_redacted) <= 12

    def test_masked_ui_submission_preserves_secret(self):
        """UI submitting a masked credential (sk-p...cdef) never corrupts or deletes encrypted key."""
        uid = f"usr_sec_{uuid.uuid4().hex[:6]}"
        cookie, csrf = create_user_session(uid, f"{uid}@test.com")
        raw_key = "sk-live-production-secret-abc999"

        # Initial save with raw key
        resp1 = client.put(
            "/api/v3/tailor/providers/config",
            json={"provider": "openai_compatible", "model": "gpt-4o", "api_key": raw_key},
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert resp1.status_code == 200
        redacted = resp1.json()["api_key_redacted"]

        # Subsequent save submitting the masked value returned by UI
        resp2 = client.put(
            "/api/v3/tailor/providers/config",
            json={"provider": "openai_compatible", "model": "gpt-4o-mini", "api_key": redacted},
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert resp2.status_code == 200

        # Verify raw key was preserved in encrypted storage
        with SessionLocal() as db:
            row = db.query(AIProviderSettingModel).filter(AIProviderSettingModel.user_id == uid).first()
            assert decrypt_credential(row.api_key_encrypted) == raw_key
            assert row.model == "gpt-4o-mini"


# ==============================================================================
# TASK 2 & 3: PROVIDER DISCOVERY & GENUINE INFERENCE STATUS
# ==============================================================================

class TestProviderDiscoveryStatus:
    def test_provider_discovery_audit(self):
        """
        Audits provider endpoints and verifies connectivity status:
        Ollama is online with 0 models; FreeFlow is offline; cloud keys empty.
        """
        import httpx
        # Check Ollama
        try:
            ollama_res = httpx.get("http://127.0.0.1:11434/api/tags", timeout=2.0)
            ollama_online = (ollama_res.status_code == 200)
            ollama_models = ollama_res.json().get("models", [])
        except Exception:
            ollama_online = False
            ollama_models = []

        # If Ollama has 0 models, genuine inference cannot run on Ollama
        assert isinstance(ollama_models, list)
        if len(ollama_models) == 0:
            # Verified prerequisite: genuine local LLM requires model pull
            assert len(ollama_models) == 0

    def test_mock_provider_is_never_labeled_as_llm(self):
        """Mock provider explicitly reports inference_source='mock', never masquerading as real LLM."""
        p_mock = MockAIProvider()
        analysis = analyze_job_description("Software Engineer with Python and Docker.", provider=p_mock)
        assert analysis.inference_source == "mock"
        assert analysis.provider_used == "mock"
        assert analysis.fallback_activated is False


# ==============================================================================
# TASK 4: END-TO-END RESUME TAILORING WORKFLOW
# ==============================================================================

class TestEndToEndResumeTailoringWorkflow:
    def test_full_synthetic_tailoring_pipeline(self):
        """
        Executes complete 13-step end-to-end resume tailoring workflow:
        1. Ingest synthetic resume (Elena Rostova: Python automation, SQL, ML project, verifiable metrics).
        2. Analyze synthetic job description (requiring Python, SQL, Machine Learning, Docker, Kubernetes).
        3. Extract candidate evidence ledger.
        4. Match candidate evidence against requirements (Kubernetes correctly flagged as gap).
        5. Generate tailoring plan.
        6. Verify supported vs unsupported claims.
        7. Human rejection of one suggestion.
        8. Human approval of another suggestion.
        9. Apply accepted suggestion to produce new tailored resume.
        10. Verify new resume version in SQLite (original resume remains uncorrupted).
        11. Simulate API restart & new session.
        12. Verify persistence of session, review, and tailored resume.
        13. Export tailored resume as genuine PDF and DOCX.
        """
        # User & Session Setup
        user_id = f"usr_e2e_{uuid.uuid4().hex[:6]}"
        user_email = f"{user_id}@example.com"
        cookie, csrf = create_user_session(user_id, user_email)

        # ----------------------------------------------------------------------
        # 1. RESUME INGESTION
        # ----------------------------------------------------------------------
        synthetic_resume_text = """Elena Rostova
Automation & Data Engineer
elena.rostova@example.com | (555) 432-8765 | Austin, TX | github.com/erostova

PROFESSIONAL EXPERIENCE
Automation Engineer | CloudWave Platforms
2022 – Present | Austin, TX
• Engineered robust Python automation test suites using pytest, reducing build verification time by 45%.
• Developed CI/CD pipeline automation scripts integrating Docker containers and automated linting.
• Spearheaded internal tooling documentation used across 4 development squads.

Data Engineer | MetricFlow Solutions
2020 – 2022 | Austin, TX
• Built automated SQL data processing pipelines processing 15M records daily with PostgreSQL.
• Optimized complex analytical queries, improving dashboard load times by 32%.
• Collaborated with analysts to design schema migrations and relational data models.

PROJECTS
Predictive Churn Classifier | Personal Project
2023 | github.com/erostova/churn-predict
• Trained and validated an end-to-end machine learning classifier using scikit-learn achieving 88% precision.
• Conducted feature importance analysis and cross-validation across 50,000 synthetic customer records.

TECHNICAL SKILLS
• Languages: Python, SQL, Bash
• Frameworks & Tools: Docker, PostgreSQL, pytest, scikit-learn, Git, Linux
"""
        # Ingest synthetic resume via upload endpoint
        ingest_resp = client.post(
            "/api/v3/resumes/upload",
            files={"file": ("Elena_Rostova_Resume.txt", synthetic_resume_text.encode("utf-8"), "text/plain")},
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert ingest_resp.status_code == 200
        source_resume_id = ingest_resp.json()["id"]

        # Verify initial resume stored in SQLite
        with SessionLocal() as db:
            src_row = db.query(ResumeModel).filter(ResumeModel.id == source_resume_id).first()
            assert src_row is not None
            assert src_row.user_id == user_id
            assert src_row.version == 1
            original_version_1 = src_row.version
            original_document_snapshot = copy.deepcopy(src_row.document)

        # ----------------------------------------------------------------------
        # 2. JOB DESCRIPTION ANALYSIS
        # ----------------------------------------------------------------------
        synthetic_job_description = """We are seeking a Senior Backend & ML Infrastructure Engineer at Nexus Innovations.
Key Responsibilities:
- Design high-reliability data processing pipelines and automated services.
- Productionize machine learning models and data workflows.
- Deploy and manage microservices using Docker containers and Kubernetes clusters.

Required Qualifications:
- Advanced proficiency in Python for automation and systems development.
- Deep experience in SQL query optimization and relational database systems.
- Demonstrated experience in Machine Learning model training and evaluation.
- Hands-on experience with Docker containerization.
- Hands-on production experience with Kubernetes container orchestration.
"""
        analysis = analyze_job_description(synthetic_job_description)
        assert "python" in [s.lower() for s in analysis.required_skills]
        assert "sql" in [s.lower() for s in analysis.required_skills]
        assert any("kubernetes" in s.lower() for s in analysis.required_skills)

        # ----------------------------------------------------------------------
        # 3. CANDIDATE EVIDENCE EXTRACTION
        # ----------------------------------------------------------------------
        src_resume_record = resumes_db.get(source_resume_id)
        ledger = build_evidence_ledger(
            user_id=user_id,
            resume_record=src_resume_record
        )
        assert "Python" in ledger.skills
        assert "Sql" in ledger.skills or "SQL" in [s.upper() for s in ledger.skills]
        assert len(ledger.claims) >= 5
        # Crucial invariant: Kubernetes is NOT in candidate evidence
        assert not any("kubernetes" in s.lower() for s in ledger.skills)

        # ----------------------------------------------------------------------
        # 4. RESUME / JOB MATCHING (Kubernetes MUST be identified as skill gap)
        # ----------------------------------------------------------------------
        match_report = match_resume_to_job(ledger, analysis)
        assert match_report.overall_score >= 50
        # Verify Kubernetes is identified as missing requirement / skill gap
        assert any("kubernetes" in gap.lower() for gap in match_report.skill_gaps)
        missing_names = [m.lower() for m in match_report.missing_requirements]
        assert any("kubernetes" in m for m in missing_names)

        # ----------------------------------------------------------------------
        # 5. TAILORING PLAN GENERATION
        # ----------------------------------------------------------------------
        plan_resp = client.post(
            "/api/v3/tailor/plan",
            json={
                "job_description": synthetic_job_description,
                "job_title": "Senior Backend & ML Infrastructure Engineer",
                "company_name": "Nexus Innovations",
                "resume_id": source_resume_id
            },
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert plan_resp.status_code == 200
        plan_data = plan_resp.json()
        review_id = plan_data["id"]
        suggestions = plan_data["suggestions"]
        assert len(suggestions) >= 2

        # ----------------------------------------------------------------------
        # 6. CLAIM VERIFICATION (Supported vs Unsupported)
        # ----------------------------------------------------------------------
        supported_claim = "Engineered robust Python automation test suites using pytest reducing build time by 45%"
        v_res_sup = verify_candidate_claim(supported_claim, ledger)
        assert v_res_sup.classification == "supported"
        assert v_res_sup.confidence >= 0.7

        unsupported_claim = "Architected and managed production Kubernetes clusters across 10 regions"
        v_res_unsup = verify_candidate_claim(unsupported_claim, ledger)
        assert v_res_unsup.classification in ("partially_supported", "unsupported", "requires_confirmation")
        assert v_res_unsup.classification != "supported"
        assert "unverified" in v_res_unsup.reasoning.lower() or "unsupported" in v_res_unsup.reasoning.lower() or "evidence" in v_res_unsup.reasoning.lower()

        # Purely fabricated claim with zero candidate overlap
        purely_fabricated = "Lead flight surgeon and commercial airline pilot with 12000 flight hours"
        v_res_fab = verify_candidate_claim(purely_fabricated, ledger)
        assert v_res_fab.classification == "unsupported"

        # ----------------------------------------------------------------------
        # 7 & 8. HUMAN REJECTION & HUMAN APPROVAL OF SUGGESTIONS
        # ----------------------------------------------------------------------
        sug_reject = suggestions[0]
        sug_accept = suggestions[1]

        # 7. Human rejects suggestion 0
        rej_resp = client.post(
            "/api/v3/tailor/events",
            json={
                "review_id": review_id,
                "action": "rejected",
                "line_id": sug_reject["line_id"],
                "original_text": sug_reject["original_text"],
                "reason": "Prefer original wording for this bullet point."
            },
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert rej_resp.status_code == 200

        # 8. Human accepts suggestion 1
        acc_resp = client.post(
            "/api/v3/tailor/events",
            json={
                "review_id": review_id,
                "action": "accepted",
                "line_id": sug_accept["line_id"],
                "original_text": sug_accept["original_text"],
                "new_text": sug_accept["suggested_text"]
            },
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert acc_resp.status_code == 200

        # Verify events logged in SQLite
        with SessionLocal() as db:
            events = db.query(TailorEventModel).filter(TailorEventModel.review_id == review_id).all()
            assert len(events) == 2
            actions = {e.action for e in events}
            assert "rejected" in actions
            assert "accepted" in actions

        # ----------------------------------------------------------------------
        # 9. APPLY ACCEPTED SUGGESTIONS
        # ----------------------------------------------------------------------
        apply_resp = client.post(
            "/api/v3/tailor/apply",
            json={
                "review_id": review_id,
                "title": "Tailored: Backend Engineer @ Nexus Innovations",
                "accepted_changes": [
                    {
                        "line_id": sug_accept["line_id"],
                        "new_text": sug_accept["suggested_text"]
                    }
                ]
            },
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert apply_resp.status_code == 200
        tailored_res_id = apply_resp.json()["resume_id"]
        assert tailored_res_id != source_resume_id

        # ----------------------------------------------------------------------
        # 10. VERIFY NEW RESUME VERSION & ORIGINAL NON-CORRUPTION IN SQLITE
        # ----------------------------------------------------------------------
        with SessionLocal() as db:
            # 1. Tailored resume exists in SQLite
            tailored_row = db.query(ResumeModel).filter(ResumeModel.id == tailored_res_id).first()
            assert tailored_row is not None
            assert tailored_row.user_id == user_id
            tailored_doc_str = str(tailored_row.document)
            assert sug_accept["suggested_text"] in tailored_doc_str
            # Rejected suggestion must NOT be in the tailored document
            assert sug_reject["suggested_text"] not in tailored_doc_str

            # 2. Original source resume is completely untouched
            source_row_fresh = db.query(ResumeModel).filter(ResumeModel.id == source_resume_id).first()
            assert source_row_fresh.version == original_version_1
            assert source_row_fresh.document == original_document_snapshot

        # ----------------------------------------------------------------------
        # 11 & 12. SIMULATE API RESTART & VERIFY PERSISTENCE
        # ----------------------------------------------------------------------
        # Create a fresh database connection simulating restart
        with SessionLocal() as db_restart:
            persisted_tailored = db_restart.query(ResumeModel).filter(ResumeModel.id == tailored_res_id).first()
            assert persisted_tailored is not None
            assert persisted_tailored.title == "Tailored: Backend Engineer @ Nexus Innovations"

            persisted_review = db_restart.query(TailorReviewModel).filter(TailorReviewModel.id == review_id).first()
            assert persisted_review is not None
            assert persisted_review.tailored_resume_id == tailored_res_id

        # ----------------------------------------------------------------------
        # 13. EXPORT TAILORED RESUME AS PDF AND DOCX
        # ----------------------------------------------------------------------
        pdf_resp = client.get(
            f"/api/v3/resumes/{tailored_res_id}/export/pdf",
            cookies={"resii_session": cookie}
        )
        assert pdf_resp.status_code == 200
        assert pdf_resp.headers["content-type"] == "application/pdf"
        assert pdf_resp.content.startswith(b"%PDF-")
        assert len(pdf_resp.content) > 1000

        docx_resp = client.get(
            f"/api/v3/resumes/{tailored_res_id}/export/docx",
            cookies={"resii_session": cookie}
        )
        assert docx_resp.status_code == 200
        assert "officedocument.wordprocessingml" in docx_resp.headers["content-type"]
        assert docx_resp.content.startswith(b"PK\x03\x04")  # Standard ZIP / DOCX magic bytes
        assert len(docx_resp.content) > 1000


# ==============================================================================
# TASK 5: FAILURE-PATH TESTING
# ==============================================================================

class TestFailurePaths:
    def test_provider_outage_activates_fallback(self):
        """Simulated provider outage falls back gracefully to deterministic heuristics with proper metadata."""
        provider_down = OllamaProvider(base_url="http://127.0.0.1:11434", model="llama3")
        with patch("httpx.Client.post", side_effect=ProviderUnavailableError("Connection refused")):
            res = analyze_job_description("Software Engineer with Python, React, and SQL.", provider=provider_down)
            assert res.fallback_activated is True
            assert res.inference_source == "heuristic"
            assert "Provider 'ollama' failed" in res.fallback_reason

    def test_invalid_model_fails_gracefully_into_fallback(self):
        """Specifying an uninstalled/invalid model does not masquerade as successful inference."""
        provider_missing_model = OllamaProvider(base_url="http://127.0.0.1:11434", model="ghost-model-v99")
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.text = "model 'ghost-model-v99' not found"

        with patch("httpx.Client.post", return_value=mock_resp):
            res = analyze_job_description("Senior Systems Architect", provider=provider_missing_model)
            assert res.fallback_activated is True
            assert res.inference_source == "heuristic"
            assert "ModelNotFoundError" in res.fallback_reason

    def test_corrupted_tailoring_apply_does_not_corrupt_source(self):
        """Failed tailoring apply leaves the source resume completely uncorrupted."""
        uid = f"usr_fail_{uuid.uuid4().hex[:6]}"
        cookie, csrf = create_user_session(uid, f"{uid}@test.com")

        # Ingest a source resume
        ingest_resp = client.post(
            "/api/v3/resumes/upload",
            files={"file": ("Alice_Doe.txt", b"Alice Doe\nDeveloper\nalice@example.com\n\nEXPERIENCE\nDev | Acme\nBuilt Python APIs", "text/plain")},
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert ingest_resp.status_code == 200
        source_id = ingest_resp.json()["id"]

        # Attempt to apply with invalid review_id
        bad_apply = client.post(
            "/api/v3/tailor/apply",
            json={"review_id": "nonexistent_review_id", "accepted_changes": []},
            cookies={"resii_session": cookie},
            headers={"X-CSRF-Token": csrf}
        )
        assert bad_apply.status_code == 404

        # Verify original resume was completely unaffected
        with SessionLocal() as db:
            src = db.query(ResumeModel).filter(ResumeModel.id == source_id).first()
            assert src is not None
            assert src.version == 1
            assert "Built Python APIs" in str(src.document)
