# RESII — Resume Version Management Report

**Subsystem:** Tailored Resume Versioning & History  
**Database Table:** `tailored_resumes` (`TailoredResumeModel`)  
**Status:** Complete & Production-Verified

---

## 1. Resume Hierarchy: Master vs. Tailored Copies

RESII maintains a clear architectural distinction between master and tailored documents:

```
[UserModel]
     │
     ├── 1. [ResumeModel] (is_primary=True, is_original=True)
     │       └── [ManagedFileModel] (original master file, immutable SHA-256)
     │
     └── 2. [TailoredResumeModel] (Job-specific child copies)
             ├── id: tr_xxxx
             ├── parent_resume_id: rez_xxxx
             ├── company_name: "Bristol-Myers Squibb..."
             ├── job_title: "AI Engineer"
             ├── status: "Draft" | "Applied" | "Archived"
             ├── tailored_format: "docx" | "pdf"
             ├── page_count: 1 (strictly matches parent)
             ├── ats_score: 96
             ├── changes_summary: [...]
             └── tailored_file_path: "storage/tr_xxxx.docx"
```

---

## 2. Dashboard Version Management UI

In `web/src/pages/DashboardPage.tsx`:
1. **Collapsible Accordion**:
   - Header shows total tailored count `[ 38 ]` and applied count `[ 25 applied ]`.
   - Right-side action `Show all 38 v` / `Show less`.
2. **Tailored Copy Row**:
   - **Company Initial Box**: Distinctive colored square (e.g. `[ B ]` for Bristol-Myers Squibb).
   - **Role & Company**: Full title and company name.
   - **Status Badge**: Amber `Draft` badge or emerald `Applied` badge.
   - **Timestamp**: Human-readable relative time (e.g. *"5 hours ago"*).
   - **Re-tailor Action**: Sparkle icon button allowing immediate re-calibration for new job criteria.
3. **Dedicated Endpoints**:
   - `GET /api/v3/tailor/tailored-resumes`: Enumerates all tailored versions for the authenticated candidate.
   - `GET /api/v3/tailor/tailored-resumes/{id}/download`: Direct attachment download.

---

## 3. Database Migration & Schema Compatibility

Added via idempotent SQLite migration in `api/db.py`:
- `CREATE TABLE IF NOT EXISTS tailored_resumes (...)` with cascading delete linked to `users.id` and `resumes.id`.
- Verified non-destructive: active SQLite database (`data/resii.db`) retained all 3,046 genuine jobs, 21 company integrations, and user application history.
