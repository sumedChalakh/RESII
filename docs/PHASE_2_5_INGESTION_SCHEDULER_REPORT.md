# RESII — PHASE 2.5: INGESTION SCHEDULER & CONSERVATIVE LIFECYCLE REPORT

**Date:** 2026-11-21  
**Project:** RESII AI Career Platform (`E:\SUMED_DATA\Rezifi`)  
**Status:** PASS — CONSERVATIVE LIFECYCLE & BACKGROUND SCHEDULER VERIFIED  

---

## 1. OBJECTIVE & SCOPE

Verify background synchronization scheduling, execution concurrency locks, synchronization logging, and conservative vacancy expiration.

---

## 2. CONSERVATIVE VACANCY LIFECYCLE POLICY

Premature deactivation of live job vacancies is a critical failure mode in career platforms. In RESII:
1. **Zero Deactivation on Provider Outage:** If a provider API request returns 0 jobs or fails with a network/server error (5xx, 429), existing jobs are **never** deactivated.
2. **Pre-Deactivation Verification Check:** When a vacancy is missing from a company's active external board payload, the system does not blindly mark it inactive. Instead:
   - It performs an external URL check via `connector.verify_job_url(mj.application_url)`.
   - If the external URL returns HTTP 404 or 410, it is confirmed removed, and the job is marked `is_active = False` with `verification_status = "expired"`.
   - If the external URL still responds with HTTP 200 or 302, it remains `is_active = True` with `verification_status = "verified"`.
   - If the check times out or encounters a temporary network error, the job remains active and is flagged as `verification_status = "unverified"`.

---

## 3. BACKGROUND SCHEDULER & CONCURRENCY CONTROLS

- Implemented in `api/jobs_engine/scheduler.py`:
  - Uses `threading.Thread` with a global `_scheduler_running` lock to prevent multiple worker loops from overlapping.
  - Test Suite Bypass: If `"pytest" in sys.modules` or `settings.ENVIRONMENT == "test"`, the scheduler thread is bypassed to prevent blocking or un-mocked external network traffic during CI/test execution.
  - Interval: Configured via `settings.JOB_SYNC_INTERVAL_HOURS` (default: 24 hours).
  - Sync History: Every execution writes an entry to `JobSyncLogModel` (`job_sync_logs` table) with `jobs_fetched`, `jobs_inserted`, `jobs_updated`, `jobs_deactivated`, execution start and completion timestamps, and status (`running`, `success`, `failed`).

---

## 4. TEST VERIFICATION

- Cycle 3 of `test_database_ingestion_and_deduplication` verified conservative lifecycle:
  - Job missing from feed with confirmed 404 verification deactivated properly.
  - Active jobs retained idempotently.
  - Result: **PASSED**.
