# RESII — Next Phase Implementation Plan (Production Readiness)

**Target:** RESII Career Platform (`E:\SUMED_DATA\Rezifi`)  
**Objective:** Transition RESII from an in-memory prototype to a hardened, fully integrated, persistent production platform.  
**Guiding Constraints:**
- **Zero Regressions:** Must preserve the existing architecture and pass all 18 existing pytest test cases.
- **Strict Read-Only Audit:** No implementation code changes will be committed until explicit user approval is granted.
- **Port Harmony:** Preserve FreeFlow AI on `8000`, configure RESII API strictly on `8100`, Vite on `5173`, Marketing on `3000`, Ollama on `11434`.

---

## 1. Phased Implementation Roadmap

```
Phase 6A: Port Harmonization & Network Config
    │
    ▼
Phase 6B: Relational Database & Redis Persistence (SQLAlchemy + Alembic)
    │
    ▼
Phase 6C: Security Hardening (Bcrypt, IDOR Ownership Checks, Stream Limits)
    │
    ▼
Phase 6D: AI Engine & Local Ollama (:11434) Integration with Factual Safeguards
    │
    ▼
Phase 6E: Production Document Pipeline (True AST Parsing, WeasyPrint PDF, DOCX)
    │
    ▼
Phase 6F: Manifest V3 Chrome Extension (Greenhouse, Lever, Workday Autofill)
    │
    ▼
Phase 6G: External Services (Stripe Webhooks, Google OAuth, Marketing Next.js)
```

---

## 2. Phase-by-Phase Execution Details

### Phase 6A: Host Port Harmonization & Network Configuration
- **Objective:** Eliminate port collisions with FreeFlow AI and configure the correct tri-origin routing.
- **Tasks:**
  1. Change default port in `api/main.py` from `8000` to `8100`:
     ```python
     if __name__ == "__main__":
         uvicorn.run("api.main:app", host="0.0.0.0", port=8100, reload=True)
     ```
  2. Update `web/vite.config.ts`:
     - Proxy target for `/api` and `/public` set to `http://127.0.0.1:8100`.
  3. Update `infra/docker-compose.yml`:
     - API service port mapping set to `8100:8100`.
  4. Update `infra/Caddyfile`:
     - Reverse proxy for `api.resii.local` set to `api:8100`.
  5. Update `infra/.env` and `infra/.env.example`:
     - `API_URL=http://localhost:8100`.
- **Verification Gate:**
  - Launch API on 8100 and Vite on 5173 simultaneously. Verify `GET http://localhost:8100/api/health` returns HTTP 200 while FreeFlow AI continues operating uninterrupted on port 8000.

---

### Phase 6B: Database & State Persistence (PostgreSQL + Redis)
- **Objective:** Replace all volatile Python dictionaries with persistent relational tables.
- **Tasks:**
  1. Add dependencies to `api/requirements.txt`:
     `sqlalchemy>=2.0.0`, `asyncpg>=0.29.0`, `alembic>=1.13.0`, `redis>=5.0.0`.
  2. Define SQLAlchemy models in `api/models/`:
     - `User`: ID, email, password_hash, name, role, created_at.
     - `Resume`: ID, user_id, title, is_primary, version, ats_score, document_tree (JSONB).
     - `TailorReview`: ID, resume_id, job_title, company_name, match_rate, suggestions (JSONB).
     - `JobApplication`: ID, user_id, job_id, title, company, stage, match_percentage, notes.
     - `CandidateFact`: ID, user_id, key, value, source, verified.
     - `Subscription`: ID, user_id, tier, stripe_customer_id, status, renewal_date.
  3. Configure Alembic migrations (`alembic/versions/001_initial_schema.py`).
  4. Refactor `api/database.py` to maintain backward compatibility with existing tests while using database sessions.
- **Verification Gate:**
  - Run database migration, insert test records, restart API server, and verify all records persist.

---

### Phase 6C: Security & Authentication Hardening
- **Objective:** Remediate all critical security vulnerabilities identified in the Security Audit.
- **Tasks:**
  1. Implement real password hashing using `bcrypt` in `api/auth.py`.
  2. Enforce strict user authorization checks:
     - Verify `resume.user_id == current_user.id` on all read/update/delete endpoints in `api/resumes.py`.
     - Verify `application.user_id == current_user.id` in `api/jobs.py`.
  3. Implement stream size limiter on `POST /api/v3/resumes/upload` (10 MB max) to prevent memory exhaustion.
  4. Add file magic-byte validation (verifying `%PDF-` and `PK\x03\x04`).
  5. Implement double-submit CSRF cookie protection.
  6. Require strong `SECRET_KEY` in production environments.
- **Verification Gate:**
  - Execute automated penetration test verifying that invalid passwords and unauthorized cross-user IDOR access attempts receive HTTP 401 and HTTP 403.

---

### Phase 6D: AI Engine & Local Ollama Integration
- **Objective:** Connect real AI inference with strict factual safeguards and local Ollama support.
- **Tasks:**
  1. Add dependencies: `google-generativeai>=0.4.0`, `openai>=1.14.0`, `httpx>=0.27.0`.
  2. Implement `api/ai/` modular architecture:
     - `client.py`: Multi-provider router (Ollama `http://localhost:11434`, Gemini, OpenAI, Claude).
     - `prompts.py`: Versioned prompt templates with strict anti-hallucination instructions.
     - `schemas.py`: Pydantic structured output models for scoring and tailoring.
     - `cost_tracker.py`: Token usage, dollar cost, and latency recorder.
  3. Connect `api/tailor.py` and `api/layout_engine.py` to the real AI client.
- **Verification Gate:**
  - Run tailoring test against local Ollama (`llama3.2`) on port 11434 and verify non-hallucinated, structured JSON responses.

---

### Phase 6E: Production Document Pipeline
- **Objective:** Replace hardcoded seed data with true document parsing and real PDF/DOCX rendering.
- **Tasks:**
  1. Implement semantic AST parser in `api/ingestion.py`:
     - Dynamically segment lines into user-specific sections and bullet points.
     - Parse tables in DOCX files using `docx.table`.
  2. Implement real HTML/CSS-to-PDF rendering in `api/templates.py`:
     - Create Jinja2 HTML templates for each template (*Classic Spruce*, *Modern Tech*, *Executive Serif*, *Minimal Mono*, *Creative Bold*).
     - Render multi-page vector PDFs with selectable text using `weasyprint` or headless Chromium.
  3. Implement DOCX export generator using `python-docx`.
- **Verification Gate:**
  - Upload sample resume, edit in Tree Editor, download generated PDF and DOCX, and verify that the exported files contain the exact edited text.

---

### Phase 6F: Manifest V3 Chrome Extension
- **Objective:** Build the missing Chrome Extension for 1-click job application autofilling.
- **Tasks:**
  1. Create `extension/` directory with `manifest.json` (Manifest V3).
  2. Implement background service worker (`background.js`) handling session authentication with `http://localhost:8100/api/auth/get-session`.
  3. Implement content scripts (`content.js`) with DOM selectors for:
     - Greenhouse (`#first_name`, `#last_name`, `#email`, `#resume`)
     - Lever (`input[name="name"]`, `input[name="email"]`, `#resume-upload-input`)
     - Workday and LinkedIn Easy Apply
  4. Implement Side Panel UI (`sidepanel.html` / `sidepanel.tsx`) showing candidate facts, tailored bullets, and 1-click autofill button.
- **Verification Gate:**
  - Load unpacked extension in Chrome, test DOM detection on a Greenhouse/Lever test application page.

---

### Phase 6G: External Services & Marketing Site
- **Objective:** Complete third-party hooks and production frontend builds.
- **Tasks:**
  1. Implement Google OAuth authorization code flow.
  2. Implement Stripe Checkout Session creation and webhook listener for subscriptions.
  3. Install dependencies in `marketing/` (`npm install`), verify Next.js production build (`npm run build`).
- **Verification Gate:**
  - Run full test suite (`python -m pytest api/tests/ -v`) confirming 100% pass rate.

---

## 3. Approval Gate & Next Steps

All 6 audit documents have been generated in `docs/`:
- `docs/RESII_PRODUCTION_READINESS_AUDIT.md`
- `docs/RESII_INTEGRATION_GAP_MATRIX.md`
- `docs/RESII_SECURITY_AUDIT.md`
- `docs/RESII_AI_ENGINE_AUDIT.md`
- `docs/RESII_DOCUMENT_ENGINE_AUDIT.md`
- `docs/RESII_NEXT_PHASE_PLAN.md`

**Status:** Awaiting user approval to proceed with **Phase 6A (Port Harmonization & Network Configuration)**.
