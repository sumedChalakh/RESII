# RESII — PHASE 6H.0: FINAL IMPLEMENTATION READINESS & RISK ASSESSMENT

**Project:** RESII AI Career Platform (`E:\SUMED_DATA\Rezifi`)  
**Phase:** 6H.0 — Readiness Audit & Implementation Plan  
**Target Milestone:** Phase 6H  
**Status:** READY FOR IMPLEMENTATION (Awaiting explicit user approval)  
**Date:** 2026-11-21  

---

## 1. READINESS VERIFICATION SUMMARY

Every required prerequisite for Phase 6H has been investigated, verified against ground truth code, and frozen into specification.

| Area | Status | Evidence / Notes |
| :--- | :--- | :--- |
| **Database Architecture** | **READY** | SQLite `users`, `sessions`, `resumes`, `public_checks`, `managed_files` tables verified in `api/models.py`. |
| **Authentication Core** | **READY** | Session signing, Argon2id hashing, and cookie helpers exist in `api/security.py` and `api/auth.py`. |
| **Upload Pipeline** | **READY** | Bounded streaming, magic bytes validator, text extractor, and tree parser exist in `api/resumes.py` and `api/ingestion.py`. |
| **CSRF Subsystem** | **READY** | Double-submit CSRF cookie + header middleware active in `api/main.py`. |
| **Frontend Foundation** | **READY** | Redux store (`authSlice`), React Router v6, Lucide icons, Design token CSS variables exist. |
| **Test Baseline** | **READY** | 163 Pytest + 20 Node tests passing (100%). |

---

## 2. PRECISE IMPLEMENTATION SCOPE FOR PHASE 6H

To execute Phase 6H without architectural drift, the implementation must be limited strictly to the following 5 targeted work items:

### Work Item 1: Registration Endpoint (`api/auth.py`)
- Add `POST /api/auth/register`.
- Add `RegisterRequest` schema to `api/schemas.py`.
- Enforce password length $\ge 8$, unique email validation, Argon2id hashing.
- Issue active session and cookies (`resii_session`, `resii_csrf`) via `_set_auth_cookies()`.
- Add `/api/auth/register` to `exempt_paths` in `csrf_protect_middleware`.
- Update `enabled_providers()` to return `registration_open=True`.

### Work Item 2: Resume Management Routes (`api/resumes.py`)
- Implement `PUT /api/v3/resumes/{resume_id}/primary`:
  - Atomically set all other candidate resumes to `is_primary = False`.
  - Set target resume to `is_primary = True`.
- Implement `DELETE /api/v3/resumes/{resume_id}`:
  - Delete disk files via `storage_manager.delete_file()`.
  - Delete `ResumeModel` record.
- Implement `POST /api/v3/resumes/claim-public-check`:
  - Import anonymous check from `PublicCheckModel` into `ResumeModel` for `user.id`.
- Update `GET /api/v3/resumes`:
  - Include `target_role`, `target_company`, and `created_at` in response dictionaries.

### Work Item 3: Frontend Registration & Auth Redux Slice
- Create `web/src/pages/RegisterPage.tsx` with email, password, name fields.
- Update `web/src/App.tsx` routes: register `/register` and `/onboarding`.
- Update `web/src/pages/LoginPage.tsx`: add clear link to `/register`.
- Update `web/src/store/authSlice.ts`: add `registerUser` async thunk.

### Work Item 4: Frontend Public Check Claiming Decoupling
- Update `web/src/pages/KeepCheckPage.tsx`:
  - Remove `loginDemo()` call.
  - Check if user is authenticated:
    - If yes: call `/api/v3/resumes/claim-public-check` and navigate to `/edit/:newResumeId`.
    - If no: navigate to `/register?claim_check=:checkId`.

### Work Item 5: Dynamic Dashboard & Resume Upload Dropzone
- Create `web/src/components/ResumeDropzone.tsx`:
  - Drag-and-drop zone with client-side 10MB limit and format checks.
  - Submits to `POST /api/v3/resumes/upload` with `X-CSRF-Token`.
- Refactor `web/src/pages/DashboardPage.tsx`:
  - Fetch real user resumes from `GET /api/v3/resumes`.
  - Display user's genuine Primary Resume card.
  - Display list of tailored copies with "Make Primary", "Edit", and "Delete" actions.
  - Integrate dropzone for seamless upload.

---

## 3. RISK ASSESSMENT & MITIGATION STRATEGY

| Risk | Probability | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **CSRF Interception of Registration or Upload** | Medium | High | Add `/api/auth/register` to `exempt_paths` in `csrf_protect_middleware`. For upload, ensure `web/src/components/ResumeDropzone.tsx` reads `resii_csrf` cookie and passes `X-CSRF-Token` header. |
| **Primary Resume Collisions** | Low | Medium | Enforce database transaction in `PUT /api/v3/resumes/{id}/primary` that resets `is_primary = False` for all user's resumes before setting target to True. |
| **Orphaned Storage Files on Delete** | Low | Low | Call `storage_manager.delete_file()` before committing `db.delete(resume_model)`. |
| **Regression in Extension Pairing or Autofill** | Low | High | Extension uses `GET /api/v3/resumes` to select candidate data. Adding fields (`target_role`, `target_company`) is strictly additive and non-breaking. |
| **Demo Mode Interference** | Low | Low | Keep `/api/auth/demo-login` intact for development testing, gated by `RESII_DEMO_MODE=true`. |

---

## 4. ESTIMATED TEST SUITE EXPANSION FOR PHASE 6H

To ensure strict zero-regression quality, the following automated test cases will be authored during Phase 6H implementation:

1. `test_registration_success`: Registers fresh user, verifies Argon2id hash, verifies session cookie and CSRF cookie.
2. `test_registration_duplicate_email`: Asserts HTTP 400 when registering already-registered email.
3. `test_registration_short_password`: Asserts HTTP 400 when password is $< 8$ characters.
4. `test_set_primary_resume_atomicity`: Creates 3 resumes, switches primary, verifies exactly one is primary.
5. `test_delete_resume_and_file_cascade`: Uploads resume file, deletes resume, verifies SQLite record and disk file are purged.
6. `test_claim_public_check_workflow`: Creates public check, claims check as candidate, verifies new resume in `ResumeModel` and single-use claim lock.
7. `test_unauthenticated_claim_rejected`: Verifies HTTP 401 when unauthenticated request attempts to claim check.

---

## 5. FINAL READINESS SIGN-OFF

- **Code Validation:** Completed.
- **Specification:** Frozen and documented in `docs/`.
- **Pre-Implementation Check:** All existing tests passing (163 Pytest + 20 Node).
- **Next Step:** Halt turn, present findings to user, and await explicit approval to begin Phase 6H implementation.
