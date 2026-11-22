# RESII Chrome Extension Production Installation Guide

**Project:** RESII AI Career Platform  
**Target:** Chrome Manifest V3 Companion Assistant  
**Bundle:** `extension/dist/rezifi-extension-production.zip` or `extension/dist/`  
**Date:** November 2026

---

## 1. Prerequisites

1. **Google Chrome** (v112 or newer) or any Chromium-compatible browser (Brave, Edge, Arc).
2. **RESII Backend Service** running locally or on your organization's server:
   ```bash
   # From the repository root (E:\SUMED_DATA\Rezifi)
   python -m uvicorn api.main:app --host 127.0.0.1 --port 8100
   ```
3. **RESII Web App** running on port 3000 (or production domain).

---

## 2. Installation Options

### Option A: Install from Unpacked Directory (Recommended for Development & Staging)
1. Open Google Chrome.
2. Navigate to `chrome://extensions/`.
3. In the top-right corner, enable the **Developer mode** toggle.
4. Click the **Load unpacked** button in the top-left toolbar.
5. Select the `dist/` directory inside the repository:
   ```
   E:\SUMED_DATA\Rezifi\extension\dist
   ```
6. The extension **"Rezifi — AI Application Autofill & Tracker"** will appear in your extension list with its icon.

---

### Option B: Install from Production ZIP Archive
1. If deploying to candidates or testers without repository access, locate the generated ZIP bundle:
   ```
   E:\SUMED_DATA\Rezifi\extension\dist\rezifi-extension-production.zip
   ```
2. Unzip the file into a dedicated folder (e.g. `C:\Users\<User>\AppData\Local\RezifiExtension`).
3. Open `chrome://extensions/` with Developer Mode enabled.
4. Click **Load unpacked** and select the unzipped folder.

---

## 3. Account Pairing & Connection Steps

1. **Log in to RESII:** Open your browser and log into your account at `http://localhost:3000` (or your RESII URL).
2. **Generate Pairing Code:**
   - Navigate to **Settings** > **Extension Pairing** (or visit the pairing tab in your candidate dashboard).
   - Click **Generate Pairing Code**. You will receive a 6-character single-use code (valid for 5 minutes).
3. **Open the Extension Popup:**
   - Click the **Puzzle icon** in Chrome's top bar and pin **Rezifi**.
   - Click the **Rezifi extension icon**.
4. **Complete Pairing:**
   - Enter your backend URL if prompted (defaults to `http://localhost:8100`).
   - Enter your 6-character code and click **Connect Account**.
   - The popup will immediately display:
     - Connected Candidate Name & Email.
     - Active Primary Resume Name.
     - Connection Status (`Connected & Authenticated`).
     - Token Rotation & Disconnect controls.

---

## 4. Usage on Supported Career Sites

1. **Navigate to Any Career Portal:**
   - Supported portals: Workday (`*.myworkdayjobs.com`), Greenhouse (`boards.greenhouse.io`), Lever (`jobs.lever.co`), LinkedIn Jobs, Google Careers, Microsoft Careers, or any custom corporate ATS.
2. **Launch the Companion Sidebar:**
   - Look for the floating cyan RESII tab on the right edge of the screen.
   - Click the tab to expand the full-height (`420px`) assistant.
3. **Tailor & Review:**
   - On job postings with a description, view the match score and click **Tailor Resume**.
   - Review proposed bullet edits with checkboxes, then click **Use X edits**.
4. **Direct Fill (Google/Microsoft/Direct Apply):**
   - On Google Careers, Microsoft Careers, or direct application forms where no JD exists, the assistant automatically enters **Fill** mode.
   - Click **⚡ Autofill Application** (either in the sidebar or via the floating bottom button).
   - Form fields will be accurately populated with your authentic profile details.
5. **Human-Supervised Submission:**
   - Review all populated answers on the employer's page.
   - Submit the application yourself on the employer portal.
   - Click **Sync to Job Tracker** in the sidebar to record the application in your RESII tracker.

---

## 5. Troubleshooting & Diagnostics

- **Backend Offline Banner:** If the backend is stopped, the extension displays *"Backend service offline. Please start Rezifi API."* Check that port 8100 is running.
- **Token Disconnected / 401:** If your session expired or was revoked, click the extension icon, disconnect, and generate a new pairing code from your dashboard.
- **Rebuilding Extension After Edits:**
  ```bash
  node extension/scripts/build.js
  ```
  Then click the **Refresh** icon on `chrome://extensions/`.
