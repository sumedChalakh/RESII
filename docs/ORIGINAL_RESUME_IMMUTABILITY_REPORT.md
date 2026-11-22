# RESII — Original Resume Immutability Report

**Subsystem:** Resume Ingestion, Cryptographic Verification & Managed Storage  
**Scope:** Strict Byte-Level Preservation of Candidate's Original Uploaded File  
**Status:** Complete & Production-Verified

---

## 1. Principle of Immutable Resume Storage

A core defect in prior prototypes was destructive parsing: when a candidate uploaded a resume, the system parsed it into an AST, discarded or ignored the original file formatting, and later synthesized new documents using generic HTML/CSS templates.

In RESII Production:
- **The candidate's original uploaded file is IMMUTABLE**.
- The exact original file bytes (`.docx` or `.pdf`) are stored in isolated storage (`storage/`) under managed access control.
- An original file is **NEVER** overwritten, modified, in-place mutated, or truncated during parsing, layout evaluation, or JD tailoring.

---

## 2. Cryptographic Integrity Architecture

### 2.1 SHA-256 Hashing at Ingestion
When a file is uploaded via `POST /api/v3/resumes/upload`:
1. Magic bytes are validated to prevent content spoofing.
2. The entire byte stream is hashed using `hashlib.sha256(content).hexdigest()`.
3. The original file is saved using atomic temporary write and rename via `storage_manager.save_file()`.
4. The database records:
   - `ManagedFileModel.file_hash`: Immutable SHA-256 hash.
   - `ManagedFileModel.is_immutable`: Boolean flag (`True`).
   - `ResumeModel.original_format`: Detected format (`docx` or `pdf`).
   - `ResumeModel.original_file_hash`: Linked SHA-256 checksum.
   - `ResumeModel.original_page_count`: Layout-audited page budget.

### 2.2 Live Integrity Auditing
`FileStorageManager.verify_file_integrity(db, user_id, file_id)` reads the physical file from disk and recalculates its SHA-256 hash. If any external process, editor, or script ever altered the original file on disk, `verify_file_integrity` raises an immediate `ValueError` and halts execution.

---

## 3. Automated Verification

- Test Suite: `tests/test_inplace_tailor_and_immutability.py`
  - `test_original_resume_immutability_and_tailored_versioning`:
    - Uploads a master resume with verified SHA-256 hash.
    - Executes complete in-place JD tailoring for Bristol-Myers Squibb.
    - Confirms that the original file on disk remained 100% byte-for-byte identical.
    - Confirms `verify_file_integrity()` returns `True`.
    - Confirms tailored output was created as an independent child artifact without affecting the parent file.
