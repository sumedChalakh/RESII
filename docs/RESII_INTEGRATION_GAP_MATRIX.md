# RESII — Integration Gap Matrix

**Target:** RESII Career Platform (`E:\SUMED_DATA\Rezifi`)  
**Scope:** External Services, Third-Party APIs, Storage, and Chrome Extension Integration Analysis  
**Status:** Audit Completed  

---

## 1. Integration Inventory & Gap Summary

| Integration Target | Planned Production Role | Current Codebase State | Gap Severity | Primary Missing Components |
| :--- | :--- | :--- | :---: | :--- |
| **Google OAuth** | 1-Click user sign-in & identity | Advertised in enum only | **CRITICAL** | OAuth client ID/secret, Google Auth endpoint, JWT decode, user upsert. |
| **Google Drive** | Direct import of PDF/DOCX resumes | Hardcoded mock boolean | **CRITICAL** | Google Picker API, Drive REST API (`files.get`), refresh token encryption. |
| **Google Docs** | 2-way real-time document sync | Returns fake Google Doc URL | **HIGH** | Google Docs API v1, AST-to-Docs batchUpdate serializer, sync cursor. |
| **Stripe Billing** | Subscription checkout, portal, webhook handling | Generates synthetic checkout URL | **CRITICAL** | `stripe-python` package, checkout session API, webhook endpoint & signature check. |
| **Job Feed Sources** | Live job aggregated from Greenhouse, Lever, Workday | 5 static Python dictionaries | **HIGH** | Aggregator scrapers, ATS board parsers, deduplication pipeline. |
| **Vector Search** | Semantic embedding resume-job match | Regex keyword counting | **HIGH** | Vector embedding generator, pgvector / Qdrant storage, cosine ranking. |
| **Hosted AI (OpenAI / Claude / Gemini)** | ATS scoring, line tailoring, bullet generation | Regex heuristic fallback | **CRITICAL** | API client SDKs, system prompts, structured JSON schemas, cost tracker. |
| **Local AI (Ollama :11434)** | Offline / privacy-preserving LLM inference | Completely unreferenced | **HIGH** | Ollama HTTP client (`/api/chat`), model pulling verification, fallback logic. |
| **Manifest V3 Chrome Extension** | 1-Click autofill on Greenhouse/Lever/LinkedIn | Missing entirely from repository | **BLOCKER** | `manifest.json`, background worker, content script, side panel, DOM detect. |
| **S3 / MinIO Storage** | Secure storage of uploaded & rendered resumes | Local RAM byte buffers only | **HIGH** | `boto3` or `minio` client, presigned URL generator, bucket lifecycle policies. |
| **PostgreSQL Database** | Persistent relational storage of all entities | Global in-memory Python dictionaries | **BLOCKER** | SQLAlchemy / SQLModel models, Alembic migrations, connection pool. |
| **Redis Cache** | Session storage, rate limits, async job queue | Global Python dictionary | **HIGH** | `redis-py` client, session key TTLs, Celery/ARQ job queue worker. |

---

## 2. In-Depth Integration Audit

### 2.1 Google Ecosystem (OAuth, Drive, Docs)

#### Google OAuth
- **Location in Code:** `api/auth.py:28-33`
- **Observed Implementation:**
  ```python
  @router.get("/enabled-providers", response_model=EnabledProvidersResponse)
  def enabled_providers():
      return EnabledProvidersResponse(
          providers=["email", "google", "demo"],
          registration_open=True
      )
  ```
- **The Gap:** The API declares `"google"` as an enabled provider, but there is no `GET /api/auth/oauth/google`, no redirect to `accounts.google.com/o/oauth2/v2/auth`, no callback endpoint `/api/auth/callback/google`, and no verification of Google ID tokens (`google-auth`).
- **Production Remediation:**
  1. Add `authlib` or `google-auth` to `api/requirements.txt`.
  2. Implement authorization code grant flow with PKCE.
  3. Store encrypted Google refresh tokens in a PostgreSQL `oauth_accounts` table.

#### Google Drive
- **Location in Code:** `api/account.py:59-75`, `web/src/pages/AccountPage.tsx:232-252`
- **Observed Implementation:**
  ```python
  @router.get("/google-drive/status")
  def google_drive_status(user: Optional[dict] = Depends(get_current_user_optional)):
      return {
          "connected": USER_PROFILE_DB.get("google_drive_connected", False),
          "email": USER_PROFILE_DB.get("google_account_email")
      }
  ```
- **The Gap:** Toggling "Connect Google Drive" simply sets an in-memory boolean flag `USER_PROFILE_DB["google_drive_connected"] = True`. No Google API client is used, no Google Picker is launched in the frontend, and files cannot actually be selected or streamed from Drive.
- **Production Remediation:**
  1. Add Google Drive scope (`https://www.googleapis.com/auth/drive.file`).
  2. Implement frontend Google Picker SDK loading in `web/src/components/DrivePicker.tsx`.
  3. Provide backend stream endpoint `POST /api/v3/resumes/import/google-drive` using `google-api-python-client`.

#### Google Docs
- **Location in Code:** `api/google_docs.py:18-45`
- **Observed Implementation:**
  ```python
  return {
      "google_doc_id": f"1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms_{resume_id[:4]}",
      "google_doc_url": f"https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms_{resume_id[:4]}/edit",
      "status": "in_sync"
  }
  ```
- **The Gap:** Returns a synthetic URL pointing to an invalid mock document ID.
- **Production Remediation:**
  1. Connect `docs.googleapis.com/v1/documents.create`.
  2. Implement document tree serializer translating sections, bold text, bullets, and margins into Google Docs `batchUpdate` requests (`InsertTextRequest`, `UpdateTextStyleRequest`, `CreateParagraphBulletsRequest`).

---

### 2.2 Stripe Billing & Subscription Lifecycle

- **Location in Code:** `api/billing.py:10-75`, `web/src/pages/BillingPage.tsx:43-68`
- **Observed Implementation:**
  ```python
  @router.post("/checkout")
  def create_checkout_session(req: CheckoutRequest, user: Optional[dict] = Depends(get_current_user_optional)):
      session_id = f"cs_test_{uuid.uuid4().hex}"
      BILLING_STATE["tier"] = req.tier
      return {
          "checkout_session_id": session_id,
          "url": f"https://checkout.stripe.com/pay/{session_id}",
          "tier": req.tier
      }
  ```
- **The Gap:**
  - `stripe` package is not in `api/requirements.txt`.
  - The returned URL is a fabricated string that leads to a 404 page if clicked.
  - No Stripe Customer IDs are created.
  - No webhook endpoint (`/api/billing/webhook`) exists to handle `checkout.session.completed`, `customer.subscription.updated`, or `invoice.payment_failed`.
- **Production Remediation:**
  1. Install `stripe>=8.0.0`.
  2. Implement `stripe.checkout.Session.create(...)` passing real `price_id` (monthly/annual for Pro/Unlimited).
  3. Implement webhook router validating `stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)`.
  4. Store customer subscription state in PostgreSQL `subscriptions` table.

---

### 2.3 Job Aggregation & Vector Match Engine

- **Location in Code:** `api/jobs.py:10-75`, `web/src/pages/JobsFeedPage.tsx:28-52`
- **Observed Implementation:**
  ```python
  JOBS_FEED_DB = [
      {"id": "job_101", "title": "Senior Full-Stack Engineer", "company": "Stripe", ...},
      {"id": "job_102", "title": "Distributed Systems Engineer", "company": "Datadog", ...},
      # only 5 static items
  ]
  ```
- **The Gap:**
  - Search queries execute simple substring matching `q in j["title"].lower()`.
  - Match scores are static hardcoded numbers (`94`, `89`, `92`, `86`, `84`).
  - No live job feed ingestion (Greenhouse API, Lever API, Adzuna, or SerpAPI).
  - No vector embeddings or similarity computation.
- **Production Remediation:**
  1. Add vector search backend using PostgreSQL `pgvector` extension or Qdrant.
  2. Compute 384-dimensional embeddings for candidate resumes and job postings using `all-MiniLM-L6-v2` (fast CPU/Ollama) or `text-embedding-3-small`.
  3. Execute cosine similarity ranking queries: `ORDER BY embedding <=> job_embedding LIMIT 20`.

---

### 2.4 AI Engine & Local Ollama Connectivity

- **Location in Code:** `api/llm_service.py:1-76`, `api/tailor.py:88-125`
- **Observed Implementation:**
  ```python
  def generate_bullet_rewrite(self, original_line: str, target_keyword: Optional[str] = None) -> str:
      clean = original_line.strip().rstrip(".")
      kw = target_keyword or "distributed system"
      return f"Architected high-throughput services incorporating {kw} best practices, reducing P99 latency by 32%."
  ```
- **The Gap:**
  - Zero network calls to LLMs.
  - Environment variables `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` are read in `__init__`, but never used.
  - Port `11434` (Ollama) is completely absent from all files.
- **Production Remediation:**
  1. Implement unified client supporting both hosted providers (OpenAI, Gemini, Claude) and local Ollama (`http://localhost:11434/api/chat`).
  2. Use structured output JSON schemas to enforce valid resume updates.
  3. Add factual constraints to ensure rewritten bullets never invent false metrics.

---

### 2.5 Manifest V3 Chrome Extension

- **Repository Search:**
  ```powershell
  Get-ChildItem -Path e:\SUMED_DATA\Rezifi -Filter "*manifest*" -Recurse -File
  ```
  **Result:** No extension manifest found (0 matches in project source).
- **The Gap:**
  - In `web/src/pages/AccountPage.tsx:265-280`, the UI shows a card: *"RESII Autofill Chrome Extension: 1-click instant autofill on LinkedIn, Greenhouse, Lever, and Workday forms"* with a button `onClick={() => alert('Opening Chrome Web Store listing for RESII Extension')}`.
  - The actual extension does not exist.
- **Required Extension Architecture:**
  ```
  extension/
  ├── manifest.json            # Manifest V3 (service_worker, side_panel, permissions)
  ├── src/
  │   ├── background/          # Background service worker (auth sync, storage)
  │   ├── content/             # Content script (DOM detector for Greenhouse/Lever/Workday)
  │   │   ├── detectors/       # Form element selector heuristics
  │   │   └── autofill.ts      # Field injection engine
  │   ├── sidepanel/           # Side panel UI (React/HTML showing ATS score & tailored bullets)
  │   └── options/             # Extension options page
  └── assets/                  # Icons (16, 48, 128px)
  ```

---

### 2.6 Persistence Layer (Database, Cache, Object Storage)

- **Observed State:**
  - Sessions: `active_sessions: Dict[str, Any] = {}`
  - Resumes: `resumes_db: Dict[str, Any] = {}`
  - Applications: `JOB_APPLICATIONS_DB: List[Dict[str, Any]] = []`
  - Facts: `FACTS_STORE: Dict[str, Any] = {}`
  - Tailor Reviews: `TAILOR_REVIEWS_DB: Dict[str, Any] = {}`
- **The Gap:**
  - `docker-compose.yml` launches `postgres:15-alpine` and `redis:7-alpine`, but the Python API code never opens a socket or connection to either service.
  - All data is volatile. Any server reload, crash, or deployment permanently destroys all user accounts, resumes, tailoring reviews, and tracked applications.
- **Production Remediation:**
  1. Integrate `SQLAlchemy` 2.0 with `asyncpg` connection pool.
  2. Define declarative models: `User`, `Resume`, `ResumeVersion`, `JobApplication`, `CandidateFact`, `Subscription`.
  3. Set up Alembic migration environment (`alembic init alembic`).
  4. Connect Redis for session tokens (`session:{token}`) with 7-day TTL.
  5. Connect MinIO / S3 for raw PDF/DOCX byte storage with presigned GET/PUT URLs.
