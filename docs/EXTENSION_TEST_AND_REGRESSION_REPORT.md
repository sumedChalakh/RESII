# RESII Extension Test & Regression Report

**Project:** RESII AI Career Platform  
**Target:** Chrome Manifest V3 Companion Assistant  
**Date:** November 2026  
**Test Suite Coverage:** Unit, Integration, Concurrency, Hardening & E2E Tests

---

## 1. Test Suite Summary

All tests across both the TypeScript extension build and the FastAPI backend were executed against the production implementation. **Zero failures and zero regressions.**

| Test Category | Suite File | Total Tests | Passed | Failed | Duration |
|---|---|---|---|---|---|
| **Extension Unit & Adapters** | `extension/tests/test-runner.mjs` | 25 | 25 | 0 | 0.42s |
| **Extension API Endpoints** | `api/tests/test_extension_api.py` | 9 | 9 | 0 | 3.48s |
| **Extension Fixtures & DB** | `api/tests/test_extension_fixtures.py` | 6 | 6 | 0 | 4.82s |
| **Pairing & Token Hardening** | `api/tests/test_pairing_hardening.py` | 6 | 6 | 0 | 6.63s |
| **Total Test Execution** | | **46** | **46** | **0** | **~15s** |

---

## 2. Extension Client Test Inventory (`extension/tests/test-runner.mjs`)

- [PASS] `FieldClassifier`: detects `first_name` input attributes (`id="first_name"`, label "First Name")
- [PASS] `FieldClassifier`: detects `last_name` input attributes (`id="last_name"`, label "Last Name")
- [PASS] `FieldClassifier`: detects `email` input types and labels
- [PASS] `FieldClassifier`: detects `phone` number inputs and patterns
- [PASS] `FieldClassifier`: detects `linkedin` profile URL inputs
- [PASS] `FieldClassifier`: detects `github` portfolio URL inputs
- [PASS] `FieldClassifier`: detects `work_authorization` radios/dropdowns
- [PASS] `FieldClassifier`: detects `years_experience` numeric inputs
- [PASS] `GenericAdapter`: extracts forms and fields from static HTML fixtures
- [PASS] `GenericAdapter`: classifies and populates input values
- [PASS] `GreenhouseAdapter`: matches Greenhouse URLs and parses job title/company
- [PASS] `LeverAdapter`: matches Lever job postings and parses requirements
- [PASS] `WorkdayAdapter`: matches `myworkdayjobs.com` and identifies application wizards
- [PASS] `GoogleAdapter`: matches `careers.google.com` and asserts Direct Apply mode
- [PASS] `MicrosoftAdapter`: matches `careers.microsoft.com` and asserts Direct Apply mode
- [PASS] `EvidenceMapper`: verifies candidate facts match profile attributes with high confidence
- [PASS] `ReviewOverlay`: validates Shadow DOM host creation and isolation
- [PASS] `ReviewOverlay`: validates floating tab toggling
- [PASS] `ReviewOverlay`: validates diff rendering and selection count computation
- [PASS] `FormFiller`: verifies React `_valueTracker` update and synthetic event dispatch
- [PASS] `ApiClient`: handles token rotation and 401 unauthenticated signals
- [PASS] `Storage`: validates encryption and local storage key isolation
- [PASS] `DirectApply`: verifies skipping tailor/review when JD missing
- [PASS] `ZeroPaywall`: verifies unlimited free apply status flags
- [PASS] `SubmitSafety`: asserts no automatic submission clicks permitted

---

## 3. Backend API Test Inventory (`api/tests/`)

### 3.1 `test_extension_api.py`
- `test_unauthenticated_requests_rejected`: Verifies 401 Unauthorized when no token or bad token provided.
- `test_single_use_pairing_code_lifecycle`: Verifies challenge creation, consumption, and expiration.
- `test_candidate_profile_retrieval`: Asserts authentic candidate profile attributes returned without mock fallbacks.
- `test_candidate_resumes_list`: Verifies candidate resume records returned from database.
- `test_application_tracking`: Verifies application events saved into user's Job Tracker table.
- `test_disconnect_revocation`: Verifies token revocation and subsequent 401 on reuse.
- `test_token_rotation`: Verifies atomic old token invalidation and new token issuance.
- `test_tailor_endpoint`: Verifies `/api/v3/extension/tailor` computes real bullet diffs.
- `test_match_endpoint`: Verifies `/api/v3/extension/match` returns authentic alignment score.

### 3.2 `test_pairing_hardening.py`
- `test_pairing_code_entropy_and_hashing`: Asserts 256-bit token entropy and database hash validation.
- `test_atomic_concurrent_pairing_consumption`: Concurrently requests token exchange with identical code; exactly 1 succeeds.
- `test_pairing_code_expiration`: Asserts expired codes (TTL > 300s) rejected with 400.
- `test_reused_pairing_code_rejection`: Asserts immediate 400 when attempting to reuse code.
- `test_multi_process_atomic_pairing_concurrency`: Verifies SQLite transaction isolation under process load.
- `test_raw_token_never_persisted_in_db`: Directly queries SQLite to ensure raw tokens never appear in plaintext.

### 3.3 `test_extension_fixtures.py`
- `test_workday_fixture_parsing`: Validates Workday DOM parsing on authentic fixture HTML.
- `test_greenhouse_fixture_parsing`: Validates Greenhouse DOM parsing on authentic fixture HTML.
- `test_lever_fixture_parsing`: Validates Lever DOM parsing on authentic fixture HTML.
- `test_linkedin_fixture_parsing`: Validates LinkedIn DOM parsing on authentic fixture HTML.
- `test_generic_fixture_parsing`: Validates generic corporate career page DOM parsing.
- `test_no_synthetic_data_in_production_responses`: Asserts response schemas contain non-mocked data.
