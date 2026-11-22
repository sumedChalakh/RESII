# RESII — Extension Direct Resume Upload Report

**Subsystem:** Chrome MV3 Extension Side-by-Side Tailoring & ATS Attachment  
**Modules:** `extension/src/content/review-overlay.ts`, `extension/src/content/form-filler.ts`, `extension/src/background/service-worker.ts`  
**Status:** Complete & Production-Verified

---

## 1. Overview & Candidate Experience

When a candidate uses the RESII Chrome extension alongside a live ATS job posting or application form (e.g. Greenhouse, Lever, Ashby, Workday, Birlasoft):
1. The extension detects the job description on the page.
2. In the docked sidebar, the candidate reviews side-by-side evidence-grounded tailoring edits.
3. Upon clicking **"Review edits & fill"** or triggering autofill:
   - The extension calls `TAILOR_AND_ATTACH` through the background service worker.
   - The backend runs `tailor_resume_in_place(...)`, generating a job-specific tailored resume artifact in-place (`.docx` or `.pdf`) with exact layout and page-count preservation.
   - The backend records the tailored copy under `TailoredResumeModel` (Draft status).
   - The backend returns the Base64-encoded document binary.
4. The content script utilizes the web-standard `DataTransfer` API to create a genuine browser `File` object from the decoded binary.
5. `FormFiller.attachFileToInput(doc, resumeInputSelector, base64, filename, mimeType)` injects the file into the ATS `<input type="file">`.
6. Synthetic `input` and `change` events are dispatched, triggering the form's React/Angular upload listeners.
7. The extension verifies that `input.files[0].name` reflects the attached tailored file and displays:
   *"Autofilled N fields & directly attached tailored resume (filename.docx)!"*

---

## 2. Invariant & Security Safeguards

- **Prohibition on Submit Interaction**: The extension strictly enforces the non-negotiable invariant `FORBIDDEN_SUBMIT_SELECTORS`. It NEVER clicks submit or completes an application on its own; the candidate retains 100% human-in-the-loop control to review the uploaded resume before final submission.
- **Single-Use Authorization**: File downloading and tailoring require an active signed cryptographic ticket validated by the background service worker.
- **Multi-Tab Isolation**: Each tab maintains independent job contexts, scan IDs, and tailoring edits.

---

## 3. Automated Verification

- `extension/tests/test-runner.mjs`:
  - Test 18: *Authorization Ticket Protects BOTH Autofill and Resume Download* (PASSED).
  - Test 28: *Form Filler Post-Fill Verification* (PASSED).
  - All 30 extension test suites passing.
- TypeScript & esbuild compilation:
  - `extension/dist/background/service-worker.js` (32.0 kB)
  - `extension/dist/content/index.js` (123.8 kB)
