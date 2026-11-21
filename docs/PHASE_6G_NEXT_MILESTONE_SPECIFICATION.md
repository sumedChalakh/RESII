# RESII Phase 6G: Next-Milestone Implementation Specification (Phase 6H)

**Project:** RESII AI Career Platform  
**Target Milestone:** **Phase 6H — First-Time Candidate Onboarding & Dynamic Multi-Resume Management**  
**Status:** **SPECIFICATION READY FOR REVIEW & APPROVAL**  
**Execution Boundary:** Specification only. No implementation until explicit user approval.

---

## 1. Objective

Solve the **"Demo Lockout"** problem.

Currently, RESII has a robust document engine, SQLite persistence, and security architecture, but a real human candidate arriving at the application cannot:
1. Create a personal account via a self-serve registration form.
2. Upload their genuine PDF or DOCX resume through the web interface.
3. View or manage their collection of uploaded resumes on the dashboard.
4. Delete old or superseded resumes.

Phase 6H connects the existing, fully-tested backend endpoints (`/api/auth/register`, `/api/v3/resumes/upload`, `/api/v3/resumes/`, `/api/v3/resumes/{id}`) to the React frontend (`web/`), transforming RESII from an API-accessible developer prototype into a functional web application that any job candidate can genuinely use.

---

## 2. Scope

### In Scope
1. **Frontend Authentication:**
   - Add a "Create Account" tab on `LoginPage.tsx` connected to `POST /api/auth/register`.
   - Provide client-side validation (email format, password strength >= 8 chars).
   - Automatically log in the candidate upon successful registration.
2. **Frontend Resume Upload Component:**
   - Create a reusable `ResumeDropzone` modal/card accepting `.pdf`, `.docx`, and `.txt` files up to 10 MB.
   - Wire to `POST /api/v3/resumes/upload` using `multipart/form-data` with CSRF protection.
   - Display parsing progress and error states (e.g. malformed files, oversized files).
3. **Dynamic Multi-Resume Dashboard:**
   - Replace hardcoded Alex Rivera mock cards in `DashboardPage.tsx` with dynamic data from `GET /api/v3/resumes/`.
   - Display resume title, version, ATS score, active template, and last updated timestamp.
   - Support primary resume designation (`PUT /api/v3/resumes/{id}/primary`).
   - Add a confirmation modal for resume deletion calling `DELETE /api/v3/resumes/{id}`.
4. **Public ATS Check Claiming Flow:**
   - Update `KeepCheckPage.tsx` so anonymous users who ran a public ATS check can register and claim their parsed document into their new personal account, rather than logging into the demo account.
5. **Marketing Safety Copy Correction:**
   - Correct `marketing/src/app/page.tsx:130` from "autonomous job application submissions" to "human-supervised application preparation and tracking".

---

## 3. Explicit Exclusions

To maintain strict architectural focus and zero regressions, Phase 6H will NOT:
1. Modify the AI inference engine or external LLM provider adapters.
2. Pull new Ollama models or require cloud AI API keys.
3. Modify the Chrome browser extension (`extension/`).
4. Modify SQLite database tables or run structural schema migrations.
5. Change ports (8100, 5173, 3000) or alter CORS policies.
6. Build a live external job search crawler.

---

## 4. Architecture & Integration Fit

The proposed work integrates directly into the existing architecture without introducing new dependencies or protocols:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        REACT WEB APPLICATION                           │
│                                                                        │
│  ┌──────────────────────┐  ┌────────────────────┐  ┌────────────────┐  │
│  │ LoginPage.tsx        │  │ ResumeDropzone.tsx │  │ DashboardPage  │  │
│  │ (Sign In / Register) │  │ (File Drag & Drop) │  │ (Dynamic List) │  │
│  └──────────┬───────────┘  └──────────┬─────────┘  └────────┬───────┘  │
└─────────────┼─────────────────────────┼─────────────────────┼──────────┘
              │ POST /api/auth/register │ POST /upload        │ GET /resumes
              │ Cookie: resii_session   │ X-CSRF-Token        │ X-CSRF-Token
┌─────────────▼─────────────────────────▼─────────────────────▼──────────┐
│                      FASTAPI BACKEND (PORT 8100)                       │
│  - api/auth.py        -> Registers user, hashes password, sets cookie  │
│  - api/resumes.py     -> Ingests file, builds AST, saves to SQLite     │
│  - api/ingestion.py   -> pypdf / python-docx extraction (unmodified)   │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       │ SessionLocal()
┌──────────────────────────────────────▼─────────────────────────────────┐
│                     SQLITE DATABASE (data/resii.db)                    │
│  - users & sessions tables (ACID transactions)                         │
│  - resumes & managed_files tables (WAL mode persistence)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Model & Entity Fit

**Zero Schema Migrations Required.**  
The backend database models in `api/models.py` already support all Phase 6H entities:
- `UserModel`: `id`, `email`, `name`, `password_hash`, `role`, `entitlements`.
- `ResumeModel`: `id`, `user_id`, `title`, `version`, `is_primary`, `ats_score`, `active_template`, `document`.
- `ManagedFileModel`: `id`, `user_id`, `resume_id`, `original_filename`, `content_type`, `file_size`, `storage_path`.

---

## 6. API Contracts (Existing & Target Payloads)

### 6.1 Registration Endpoint
- **Method / Path:** `POST /api/auth/register`
- **Request Body (JSON):**
  ```json
  {
    "email": "candidate@example.com",
    "password": "SecurePassword123!",
    "name": "Jane Doe"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "id": "usr_94a8f12c",
    "email": "candidate@example.com",
    "name": "Jane Doe",
    "role": "user"
  }
  ```
- **Cookie Set:** `resii_session=<signed_session_id>; HttpOnly; SameSite=Lax`

### 6.2 Resume Upload Endpoint
- **Method / Path:** `POST /api/v3/resumes/upload`
- **Headers:** `X-CSRF-Token: <csrf_token>`
- **Content-Type:** `multipart/form-data`
- **Form Field:** `file: <binary_pdf_or_docx_data>`
- **Response (200 OK):**
  ```json
  {
    "id": "res_849204ab",
    "title": "Jane Doe Resume",
    "version": 1,
    "ats_score": 82,
    "sections_count": 4,
    "created_at": "2026-11-21T12:00:00Z"
  }
  ```

### 6.3 List User Resumes Endpoint
- **Method / Path:** `GET /api/v3/resumes/`
- **Response (200 OK):**
  ```json
  {
    "resumes": [
      {
        "id": "res_849204ab",
        "title": "Jane Doe Resume",
        "version": 1,
        "is_primary": true,
        "ats_score": 82,
        "active_template": "classic_spruce",
        "created_at": "2026-11-21T12:00:00Z",
        "updated_at": "2026-11-21T12:00:00Z"
      }
    ],
    "total": 1
  }
  ```

### 6.4 Delete Resume Endpoint
- **Method / Path:** `DELETE /api/v3/resumes/{id}`
- **Headers:** `X-CSRF-Token: <csrf_token>`
- **Response (200 OK):** `{"deleted": true, "id": "res_849204ab"}`

---

## 7. Frontend User Journey Screen-by-Screen

```
SCREEN 1: LoginPage.tsx
[ Welcome to RESII ]
[ Sign In ]  |  [ Create Account ] <--- NEW TAB
Fields: Full Name, Email, Password
Button: [ Create Account & Get Started ]
Result: Sets session cookie, loads Dashboard.

SCREEN 2: DashboardPage.tsx
[ Welcome, Jane Doe ]
If 0 resumes:
  Render: Empty State Box -> [ Upload Your Resume (PDF/DOCX) ]
If >= 1 resumes:
  Render: Dynamic Cards (Title, Version, ATS Score, Primary Badge)
  Action Buttons: [ Edit in Tree Editor ] | [ Tailor to Job ] | [ PDF ] | [ DOCX ] | [ Delete ]
Header Action: [ + Upload New Resume ]

SCREEN 3: ResumeUploadModal (Component)
Drag & Drop Zone: "Drop your PDF or DOCX file here"
File size validation (< 10 MB).
Progress spinner: "Parsing document structure & ATS scoring..."
Success: Adds resume card to dashboard, awards XP.

SCREEN 4: EditTreePage.tsx
Binds dynamically to `/edit/{resumeId}`.
User can edit sections, lines, re-order blocks, save version with OCC, and export genuine PDF/DOCX.
```

---

## 8. Security & Failure Behavior

1. **CSRF Enforcement:** All state-changing operations (`upload`, `delete`, `set_primary`) require valid `X-CSRF-Token` headers.
2. **File Magic Byte Validation:** Backend verifies genuine PDF (`%PDF`) and DOCX (ZIP PK) magic headers, rejecting renamed executables or invalid files with HTTP 400.
3. **Upload Limit:** Enforces 10 MB strict limit on both client (React) and server (FastAPI) sides.
4. **Tenant Isolation:** Deleting or querying a resume strictly verifies `ResumeModel.user_id == current_user.id`. Cross-user tampering returns HTTP 404/403.
5. **Fail-Closed Cleanup:** If document ingestion fails midway, managed file storage rolls back cleanly.

---

## 9. Acceptance Criteria

| # | Acceptance Criterion | Verification Method |
|---|---|---|
| **AC-1** | A candidate can register a new account on `/login` without using pre-seeded accounts. | Browser / Playwright |
| **AC-2** | A candidate can drag-and-drop a genuine PDF and DOCX resume from their local machine. | Browser / Playwright |
| **AC-3** | Uploaded file is parsed by `api/ingestion.py` and saved to `resumes` and `managed_files` tables. | SQLite Verification |
| **AC-4** | `DashboardPage.tsx` dynamically renders the candidate's uploaded resumes instead of Alex Rivera. | DOM Inspection |
| **AC-5** | Clicking "Edit in Tree Editor" loads the uploaded candidate's actual text into `EditTreePage.tsx`. | DOM Inspection |
| **AC-6** | The candidate can download genuine PDF and DOCX exports of their uploaded resume. | SHA-256 / File verification |
| **AC-7** | The candidate can delete a resume, removing it from the dashboard and SQLite. | SQLite & UI verification |
| **AC-8** | Marketing copy on `marketing/src/app/page.tsx:130` removes "autonomous job application submissions". | Source Inspection |
| **AC-9** | Zero regressions across existing 163 Pytest tests and 20 Node test suites. | Automated Test Run |

---

## 10. Implementation Sequence (Future Milestone)

- **Stage 1:** Frontend Registration View in `LoginPage.tsx` & Redux Auth Slice integration.
- **Stage 2:** Reusable `ResumeDropzone` component with CSRF and file magic handling.
- **Stage 3:** Dynamic Dashboard Integration in `DashboardPage.tsx` with resume listing and deletion.
- **Stage 4:** Public check claiming in `KeepCheckPage.tsx`.
- **Stage 5:** Marketing safety copy correction.
- **Stage 6:** End-to-end Playwright browser test of the entire onboarding journey.

---

## 11. Rollback Strategy & Definition of Done

- **Rollback:** Because no database schema changes are made, reverting frontend components restores previous behavior immediately.
- **Definition of Done:** A fresh candidate can register, upload a real PDF resume, edit it in the tree editor, export a verified PDF, and delete the resume—proven in an automated Chromium browser test with 100% passing regression tests.
