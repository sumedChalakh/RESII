# RESII Phase 7 — Production Installation Runbook

**Project:** `E:\SUMED_DATA\Rezifi`  
**Subsystem:** Chrome Manifest V3 Browser Extension (`extension/`)  
**Package:** `extension/dist/rezifi-extension-production.zip` (50,002 bytes)  
**Distribution Directory:** `extension/dist/`  
**Date:** November 21, 2026

---

## 1. System Requirements

- **Browser:** Google Chrome (v110 or higher) or any Chromium-compatible browser (Brave, Microsoft Edge, Opera).
- **Backend Service:** RESII FastAPI backend service running at `http://127.0.0.1:8100` (or configured production domain).
- **Node.js Environment (Build only):** Node.js 18+ with npm.

---

## 2. Production Build & Packaging Procedure

If building the distribution package from source:

```powershell
# 1. Navigate to project root
cd E:\SUMED_DATA\Rezifi

# 2. Build the extension bundle via esbuild
node extension/scripts/build.js

# 3. Create the production ZIP archive
python -c "import zipfile, os; zpath = 'extension/dist/rezifi-extension-production.zip'; z = zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED); dist_dir = 'extension/dist'; [z.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), dist_dir)) for root, _, files in os.walk(dist_dir) for f in files if f != 'rezifi-extension-production.zip']; z.close(); print('Package size:', os.path.getsize(zpath))"
```

Verified artifacts created:
- [`extension/dist/manifest.json`](file:///E:/SUMED_DATA/Rezifi/extension/dist/manifest.json)
- [`extension/dist/background/service-worker.js`](file:///E:/SUMED_DATA/Rezifi/extension/dist/background/service-worker.js) (29.6 KB)
- [`extension/dist/content/index.js`](file:///E:/SUMED_DATA/Rezifi/extension/dist/content/index.js) (113.9 KB)
- [`extension/dist/popup/popup.js`](file:///E:/SUMED_DATA/Rezifi/extension/dist/popup/popup.js) (4.8 KB)
- [`extension/dist/rezifi-extension-production.zip`](file:///E:/SUMED_DATA/Rezifi/extension/dist/rezifi-extension-production.zip) (50,002 bytes)

---

## 3. Installation into Google Chrome

### Method A: Load Unpacked Directory (Recommended for Local Dev & Testing)
1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in the URL address bar.
3. Toggle on **Developer mode** in the upper-right corner.
4. Click the **Load unpacked** button in the upper-left corner.
5. In the file picker, select the directory:  
   `E:\SUMED_DATA\Rezifi\extension\dist`
6. Confirm that **"RESII — AI Application Autofill & Tracker"** appears in your extension cards list with version `1.0.0`.
7. Pin RESII to the Chrome toolbar by clicking the puzzle-piece icon and selecting the pin icon next to RESII.

### Method B: Install from Production ZIP Archive
1. Unzip `extension/dist/rezifi-extension-production.zip` into a clean directory.
2. In `chrome://extensions/`, click **Load unpacked** and select the unzipped directory.

---

## 4. Pairing Runbook with Authenticated RESII Platform

1. Start the RESII backend API server:
   ```powershell
   uvicorn api.main:app --host 127.0.0.1 --port 8100
   ```
2. Open your browser and log into the RESII web application at `http://localhost:8100/`.
3. In the RESII dashboard, generate an extension pairing code (or use the one-click pairing prompt).
4. Click the **RESII extension icon** in the Chrome toolbar.
5. Enter the pairing code (e.g. `RESII-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`) into the extension popup and click **Connect**.
6. The popup will display a green indicator: **"Connected: [Candidate Name]"** and list your verified resumes.

---

## 5. Usage & Verification on Job Boards

1. **Greenhouse Job:** Navigate to any job on `boards.greenhouse.io/<company>/jobs/<id>`.  
   - A cyan tab appears on the right edge of the screen.
   - Click the tab to open the 4-step assistant:
     - **Step 1 (Tailor):** Review role, company, and real ATS score.
     - **Step 2 (Review):** Review verified summary and experience bullets.
     - **Step 3 (Fill):** Preview field mappings. Click **"Autofill Form Now"** to populate inputs and attach your resume PDF.
     - **Step 4 (Submit):** Review answers, manually click Submit, then click **"Track Application in Rezifi"**.
2. **Lever Job:** Navigate to `jobs.lever.co/<company>/<id>`. Assistant automatically detects posting headline and form fields.
3. **Workday Job:** Navigate to `*.myworkdayjobs.com`. Multi-step form automation targeting `data-automation-id` triggers seamlessly.
4. **Custom Career Portals:** On any external career page, click the RESII toolbar icon. The extension will inspect the page, classify authentic application inputs, and offer the supervised autofill workflow.

---

## 6. Known Limitations & Operating Fallbacks

1. **Final Submit Automation:** In compliance with ethical standards and anti-bot regulations, RESII intentionally prohibits clicking the final submit button. Applicants must always review and submit manually.
2. **Voluntary Demographic Questions (EEOC):** Race, ethnicity, veteran status, and disability questions are quarantined from automated filling to prevent inaccurate declarations.
3. **Custom Drag-and-Drop File Uploaders:** On platforms that reject programmatic standard `DataTransfer` file assignment (e.g. Workday custom drag zones), the extension populates all textual and dropdown fields and displays a clear note: *"Please select your resume file manually."*
