# RESII — Root Cause Analysis: Personalized Job Feed & Active Resume Matching

**Date:** 2026-11-21  
**Project:** `E:\SUMED_DATA\Rezifi`  
**Module:** Jobs → Discover  
**Author:** Antigravity Engineering (Senior Staff Diagnostic Report)

---

## 1. Executive Summary

When a user logged into RESII, uploaded a resume, and navigated to **Jobs → Discover**, the feed displayed opportunities that were irrelevant to their background, showed non-personalized results, or lacked AI match ranking.

Our systematic trace across the end-to-end data pipeline:
`Authenticated User → Uploaded Resume → Resume Parsing → Structured Candidate Profile → Active Resume → Job Matching → Personalized Job API → Jobs Discover Frontend`
revealed four primary architectural and implementation root causes, along with three contributing factors.

---

## 2. End-to-End Pipeline Trace & Root Causes

### Root Cause 1: Pre-Pagination Before Score Calculation (The "Top 15 Blindness" Bug)
* **Location:** `api/jobs.py` (Lines 352–368)
* **Flaw:**
  ```python
  offset = (page - 1) * page_size
  items = q.offset(offset).limit(page_size).all()
  formatted_jobs = [_format_job_model(j, resume_doc) for j in items]

  if sort_by == "best_match":
      formatted_jobs.sort(
          key=lambda j: (j["match_percentage"] is not None, j["match_percentage"] or 0, j["posted_at"] or ""),
          reverse=True
      )
  ```
* **Impact:** The database holds 3,045 active vacancies. The query fetched **only the newest 15 jobs** based on `posted_at.desc()`. It then computed match scores *only for those 15 jobs* and sorted them. Hundreds of engineering, software, and developer roles posted earlier were never scored or evaluated. If the newest 15 jobs in the database happened to be Sales, Legal, or Account Executive positions (the most common recent postings in the current database), the candidate was shown those 15 irrelevant jobs, even if their resume was for a Senior Full-Stack Engineer.

### Root Cause 2: Uploaded Resumes Never Marked as Primary / Active
* **Location:** `api/resumes.py` (Line 242)
* **Flaw:**
  When a candidate uploads a resume at `POST /api/v3/resumes/upload`, `is_primary` was hardcoded to `False`.
  ```python
  resume_record = {
      "id": new_id,
      "user_id": user.id,
      "title": ...,
      "version": 1,
      "is_primary": False,  # <-- Never set to True on upload
      ...
  }
  ```
  Furthermore, the API lacked an endpoint (`/api/v3/resumes/{resume_id}/set-primary` or `/api/v3/resumes/{resume_id}/primary`) to allow a candidate to mark a resume as primary or active.
* **Impact:**
  - If a user had an existing seeded or old resume, uploading a new resume never updated their active profile for job matching.
  - If a new user uploaded their first resume, `is_primary` remained `False`. While a fallback `db.query(ResumeModel).filter(ResumeModel.user_id == user.id).first()` existed, any user with multiple resumes had no mechanism to choose which resume drove their recommendations.

### Root Cause 3: Frontend `fetchFeed` Lacked `credentials: 'include'` and Resume Context
* **Location:** `web/src/pages/JobsFeedPage.tsx` (Line 119)
* **Flaw:**
  `const res = await fetch('/api/jobs/feed?' + params.toString());`
  In standard web Fetch API, omitting `credentials: 'include'` means cookies (including the HttpOnly `resii_session` authentication cookie) may be omitted across origins or strict reverse proxies. When omitted, `get_current_user_optional` in `api/jobs.py` resolved `user = None`.
  Additionally, the frontend had no UI selector for the candidate's active resume and did not pass `resume_id` to the feed endpoint.

### Root Cause 4: Overly Simplistic Matching Logic (Lack of Multi-Dimensional Compatibility)
* **Location:** `api/jobs_engine/service.py` (`calculate_resume_job_match`) & `api/ai/evidence.py` (`build_evidence_ledger`)
* **Flaw:**
  1. `build_evidence_ledger` only matched skills against `COMMON_TECH_SKILLS`, a static list of 40 lowercase terms. Declared skills in the "Skills" section of the resume (e.g., PyTorch, Next.js, Pandas, Scikit-Learn, Rust, Kotlin, etc.) were frequently missed.
  2. `calculate_resume_job_match` only computed:
     `req_score = (len(matched_req) / total_req) * 70` + `pref_score * 20` + `10`
     It completely omitted:
     - **Role compatibility:** Job title vs. candidate title, experience roles, and target role preferences.
     - **Experience compatibility:** Seniority mismatch detection (e.g. Senior engineer vs. Intern role).
     - **Education compatibility:** Degree qualification checks.
     - **Candidate preferences:** Remote vs. on-site and location matching.

---

## 3. Investigation Checklist (12 Verification Items)

| Check | Area | Finding |
|---|---|---|
| 1 | Jobs API receives authenticated user ID | **Broken in frontend fetch**: `credentials: 'include'` was missing in `JobsFeedPage.tsx`. |
| 2 | API fetches all jobs without personalization | **Partially broken**: When `user` was None, all jobs had `match_percentage: null`. |
| 3 | Matching service uses default or hardcoded profile | **Partially broken**: Ignored `UserProfileModel`, candidate preferences, and target roles. |
| 4 | Resume parser persistence of structured skills | **Intact in DB, flawed in evidence extractor**: Document tree stored full sections, but evidence extractor used 40-word regex filter. |
| 5 | Matching engine reads outdated candidate profile | **Present**: Fallback read first resume by ID, ignoring active switch without cache invalidation. |
| 6 | Uploaded resume marked as active resume | **Broken**: Uploaded resumes were hardcoded to `is_primary = False`. No set-primary endpoint existed. |
| 7 | Frontend calls generic vs personalized endpoint | **Broken**: Called `/api/jobs/feed` without passing candidate's selected `resume_id`. |
| 8 | Match score computed but ignored by frontend | **Partially present**: Frontend displayed score badge, but lacked breakdown or resume selector. |
| 9 | Sorting based on match scores | **Critically Broken**: Sorted only the top 15 by `posted_at`, not all candidate listings! |
| 10 | Filters override personalized results | **Present**: Applying filters with pre-sliced limit resulted in 0 or random items. |
| 11 | Candidate profile and resume records linked | **Intact in DB**: Foreign key `user_id` correctly linked `users` and `resumes`. |
| 12 | Job descriptions incomplete or unsuitable | **Resolved**: 3,045 active vacancies exist in `resii.db`, including engineering, AI, and full-stack roles. |

---

## 4. Fix Strategy & Implementation Plan

1. **API — Resume Management (`api/resumes.py`):**
   - Automatically mark uploaded resume as `is_primary = True` if the candidate has no primary resume.
   - Implement `POST /api/v3/resumes/{resume_id}/set-primary` and `PUT /api/v3/resumes/{resume_id}/primary` to allow switching active resumes atomically.
2. **API — Multi-Dimensional Matching Engine (`api/jobs_engine/service.py`):**
   - Implement comprehensive matching evaluating:
     - Professional role compatibility (title, past roles, target role)
     - Skill compatibility (required, preferred, tech stack, comprehensive lexicon)
     - Experience compatibility (seniority mismatch detection, years of experience)
     - Education compatibility (degree requirements)
     - Candidate preferences (workplace mode, location)
   - Return explainable signals (`match_percentage`, `match_strength`, `matched_skills`, `missing_required_skills`, `missing_preferred_skills`, `role_compatibility`, `experience_compatibility`, `education_compatibility`, `location_compatibility`, `seniority_mismatch`, `explanation`, `recommendation`).
3. **API — Jobs Discovery Feed (`api/jobs.py`):**
   - Support `resume_id` parameter.
   - For `sort_by == "best_match"`, retrieve candidate vacancies matching filters, calculate match scores across the pool, sort by match score descending, and paginate accurately.
   - Return active resume metadata and candidate's resumes list in feed response.
4. **Frontend — Jobs Discover Page (`web/src/pages/JobsFeedPage.tsx`):**
   - Ensure `credentials: 'include'` on all fetch calls.
   - Add Active Resume Selector dropdown at the top of the feed with one-click switching.
   - Display match strength, matched skills, missing skills, and detailed match analysis breakdown.
   - Recompute recommendations when active resume changes.
5. **Deterministic Verification Tests:**
   - Isolated tests covering Tests A, B, C, D, E, F as required by the specification.
