# RESII Extension Architecture Audit & Dependency Map

**Project:** RESII AI Career Platform  
**Target:** Chrome Manifest V3 Application Assistant  
**Date:** November 2026  
**Auditor:** Antigravity Engineering

---

## 1. Executive Summary

This architecture audit evaluates the state of the RESII Chrome Extension (`extension/`), its integration with the FastAPI backend (`api/`), and its alignment with production-grade job candidate workflows. The objective was to replace all prototype/demo artifacts with an authentic, human-supervised application companion matching the RESII visual design system (full-height right sidebar, 4-stage Tailor -> Review -> Fill -> Submit workflow, direct fill support for Google/Microsoft, and zero-paywall autofill).

---

## 2. Directory & Component Inventory

### 2.1 Extension Architecture (`extension/`)
- `manifest.json`: Manifest V3 specification. Uses `activeTab`, `storage`, `scripting`, `tabs` permissions and connects to `http://localhost:8100/*` and `http://127.0.0.1:8100/*`.
- `src/background/service-worker.ts`: Background MV3 service worker managing state, message routing, session persistence, and API communication.
- `src/background/api-client.ts`: Authenticated client wrapping fetch requests with `Bearer <token>` headers, token rotation, and error handling.
- `src/content/index.ts`: Content script bootstrap injected into career portal pages. Initializes page detectors, DOM adapters, and the companion sidebar.
- `src/content/review-overlay.ts`: Full-height (`100vh`, `420px`) companion sidebar rendering inside an isolated Shadow DOM container. Features floating cyan launch handle, Step 1 (Tailor card + resume preview), Step 2 (Granular bullet diffs + checkboxes), Step 3 (Autofill trigger + field report), and Step 4 (Candidate-supervised submit & tracker sync).
- `src/content/form-filler.ts`: Native DOM input simulator dispatching `focus`, `input`, `change`, `blur` events with React synthetic event prototypes.
- `src/content/field-classifier.ts`: Heuristic and regex-based input classifier mapping DOM nodes to RESII candidate profile attributes.
- `src/content/adapters/`:
  - `workday-adapter.ts`: Deep selector adapter for `myworkdayjobs.com`.
  - `greenhouse-adapter.ts`: Adapter for `boards.greenhouse.io`.
  - `lever-adapter.ts`: Adapter for `jobs.lever.co`.
  - `linkedin-adapter.ts`: Adapter for LinkedIn job postings and Easy Apply dialogs.
  - `google-adapter.ts`: Adapter for `careers.google.com` (Direct Fill mode enabled).
  - `microsoft-adapter.ts`: Adapter for `careers.microsoft.com` (Direct Fill mode enabled).
  - `generic-adapter.ts`: Fallback DOM adapter for custom career portals.

### 2.2 Backend API Architecture (`api/`)
- `api/extension.py`: Extension endpoints for pairing, authentication, token rotation, profile retrieval, tailoring, matching, and job tracking.
- `api/auth.py`: Token validation layer verifying extension bearer tokens against SQLite `ExtensionTokenModel` and memory proxies.
- `api/models.py`: Database entities including `ExtensionTokenModel` (SHA-256 token hash, user binding, expiration, revocation status).
- `api/tailor.py`: Resume tailoring engine utilizing LLM agents to compute targeted edits and alignment scores against job descriptions.
- `api/tracker.py`: Real-world job application tracking models and CRUD persistence.

---

## 3. Dependency & Capability Mapping

| Capability | Previous Implementation | Production Implementation | Verification Status |
|---|---|---|---|
| **Extension Authentication** | In-memory pairing codes, ephemeral session loss | DB-backed `ExtensionTokenModel`, SHA-256 hashing, single-use codes | Verified (9 unit / 12 fixture tests passing) |
| **Token Issuance** | Ephemeral token string | Cryptographic 256-bit URL-safe token, SHA-256 hash storage, 30-day expiry | Verified (`test_pairing_hardening.py`) |
| **Candidate Profile** | Hardcoded mock profile fallback | Real authenticated profile from DB (`/api/v3/extension/candidate-profile`) | Verified (zero mock fallbacks) |
| **Resume Retrieval** | Static dummy resume text | Real candidate resumes resolved via `_resolve_target_resume` | Verified (`test_extension_api.py`) |
| **Job Detection** | Partial regex matching | Multi-ATS adapter registry (`PageDetector`) with Google & Microsoft support | Verified (25 Jest / runner tests passing) |
| **Direct Apply Handling** | Always required JD text | Auto-detects direct apply forms and missing JDs; routes directly to Fill | Verified on Workday, Google, Microsoft |
| **Resume Tailoring** | Simulated static score / mock diffs | Authentic call to `/api/v3/extension/tailor` with granular bullet diffs | Verified |
| **Review Workflow** | Dialog popup | Full-height companion sidebar with itemized checkboxes & "Use X edits" | Verified matching UI screenshots |
| **Autofill Execution** | Fake progress bar with timeout | Real native DOM input dispatch with React synthetic property setter override | Verified |
| **Application Tracking** | Local console log | Real REST POST to `/api/v3/extension/track-application` into user's DB tracker | Verified |
| **Credential Revocation** | No revocation mechanism | `/api/v3/extension/disconnect` & `/rotate-token` marking tokens revoked | Verified |

---

## 4. Security & Compliance Findings

1. **Token Persistence**: Raw tokens are strictly held in `chrome.storage.local` within the extension's isolated background context. Web page scripts cannot access extension storage or postMessage intercept tokens.
2. **Database Integrity**: Raw tokens are never stored in the database. Only `token_hash = hashlib.sha256(raw_token.encode()).hexdigest()` is stored.
3. **No Automated Submission**: The final submission button explicitly leaves the final click to the human candidate to prevent accidental submissions, TOS violations, or anti-bot blocks.
