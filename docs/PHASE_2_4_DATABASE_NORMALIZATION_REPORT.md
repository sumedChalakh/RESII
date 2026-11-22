# RESII — PHASE 2.4: DATABASE NORMALIZATION & DEDUPLICATION REPORT

**Date:** 2026-11-21  
**Project:** RESII AI Career Platform (`E:\SUMED_DATA\Rezifi`)  
**Status:** PASS — DATA NORMALIZATION & STRICT DEDUPLICATION VERIFIED  

---

## 1. OBJECTIVE & SCOPE

Verify database schema compliance, HTML text extraction safety, salary and skill normalization, and strict deduplication constraints.

---

## 2. SCHEMA COMPLIANCE & NORMALIZED MODELS

The database models in `api/models.py` provide a unified schema compatible with both SQLite and PostgreSQL:

- **`CompanyRegistryModel` (`company_registry` table):**
  - Primary key: `id` (e.g. `comp_gh_inmobi`)
  - Columns: `name`, `career_page_url`, `ats_provider`, `ats_board_token`, `website_url`, `country`, `status`, `last_successful_sync`, `last_failed_sync`, `sync_frequency_hours`, `is_active`, `created_at`, `updated_at`.
  - Indexes: Index on `(ats_provider, ats_board_token)`.

- **`JobListingModel` (`job_listings` table):**
  - Primary key: `id` (e.g. `job_gh_123456`)
  - Columns: `external_job_id`, `company_id`, `company_name`, `company_website`, `source_name`, `source_job_url`, `job_title`, `department`, `description`, `location`, `city`, `country`, `workplace_type`, `employment_type`, `experience_level`, `salary_min`, `salary_max`, `salary_currency`, `salary_formatted`, `required_skills` (JSON), `preferred_skills` (JSON), `posted_at`, `expires_at`, `application_url`, `is_active`, `verification_status`, `first_seen_at`, `last_seen_at`, `last_verified_at`, `created_at`, `updated_at`.
  - Unique Constraint: `UniqueConstraint('source_name', 'external_job_id', name='uq_source_external_job_id')`.
  - Indexes: B-tree indexes on `is_active`, `country`, `workplace_type`, `experience_level`, `posted_at`.

---

## 3. INJECTION-SAFE HTML PARSING

Replaced regex-based HTML stripping with Python's standard library `html.parser.HTMLParser` (`_TextExtractingParser`):
- Handles nested tags, block elements (`p`, `div`, `li`, `br`), and whitespace cleanly.
- Immune to catastrophic regular expression backtracking (ReDoS).
- Unescapes HTML entities safely (`&amp;`, `&quot;`, `&#39;`).

---

## 4. STRICT DEDUPLICATION POLICY

- Removed legacy fuzzy cross-source fallback matching on `(company_name, job_title)` to prevent accidental merging of distinct job requisitions.
- Deduplication is strictly keyed on `(source_name, external_job_id)`.
- Re-syncing an active vacancy updates all fields (`salary_formatted`, `description`, `last_seen_at`, `verification_status`) in place without creating duplicate records or altering existing IDs.

---

## 5. TEST VERIFICATION

- `test_database_ingestion_and_deduplication` in `api/tests/test_jobs_real.py`:
  - Cycle 1: 2 new jobs inserted.
  - Cycle 2: 2 jobs re-ingested; 0 inserted, 2 updated.
  - Total count remains exactly 2.
  - Result: **PASSED (0.04s)**.
