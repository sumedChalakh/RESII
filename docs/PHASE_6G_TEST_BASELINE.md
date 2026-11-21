# RESII Phase 6G: Test and Build Baseline Report

**Date:** 2026-11-21  
**Product:** RESII AI Career Platform  
**Target:** Automated Test Suites & Production Bundlers  
**Auditor:** Principal Software Architect  
**Audit Mode:** STRICT READ-ONLY AUDIT  
**Baseline Status:** **100% Passing Tests, Production Builds Verified**

---

## 1. Executive Summary

This report establishes the verified test and build baseline for Phase 6G. Every test suite was executed in the active Windows 10 environment using safe, read-only commands.

### Key Results:
- **Pytest Suite:** 163 / 163 tests passed (0 failed, 0 skipped, 0 deselected) in 212.25s.
- **Node.js Extension Suite:** 20 / 20 test suites passed in 24.58ms.
- **Web Frontend Build:** Built production bundle in 4.69s (1518 modules transformed).
- **Extension Build:** Bundled service-worker, content script, and popup in 11ms.
- **Marketing Build:** Classified as `BLOCKED` because `marketing/node_modules` is not installed, and package installation is strictly prohibited in this read-only audit.

---

## 2. Pytest Execution Baseline

### 2.1 Execution Command
```bash
python -m pytest api/tests extension/tests
```

### 2.2 Execution Metrics
- **Environment:** Windows 10, Python 3.12.4, pytest-8.2.2, pluggy-1.6.0
- **Total Collected:** 163
- **Passed:** 163
- **Failed:** 0
- **Skipped:** 0
- **Deselected:** 0
- **Duration:** 212.25 seconds (3 minutes, 32 seconds)
- **Warnings:** 87 warnings (primarily HTTPX deprecated per-request cookie usage in test clients, and 1 expected SQLAlchemy identity key conflict during transactional rollback verification).

### 2.3 Detailed File Breakdown
| # | Test File | Collected | Passed | Failed | Duration | Focus Area |
|---|---|:---:|:---:|:---:|:---:|---|
| 1 | `api/tests/test_ai_engine_phase6e.py` | 25 | 25 | 0 | ~32s | AI evidence ledger, matching, OCC |
| 2 | `api/tests/test_document_engine_phase6c.py` | 13 | 13 | 0 | ~18s | Ingestion, AST preservation, export |
| 3 | `api/tests/test_extension_api.py` | 7 | 7 | 0 | ~8s | Pairing, profile sync, demographic checks |
| 4 | `api/tests/test_extension_fixtures.py` | 6 | 6 | 0 | ~7s | Multi-ATS form mapping & submit isolation |
| 5 | `api/tests/test_pairing_hardening.py` | 6 | 6 | 0 | ~8s | 128-bit pairing, concurrency & disconnect |
| 6 | `api/tests/test_persistence_phase6d.py` | 22 | 22 | 0 | ~30s | SQLite WAL, ACID rollback, persistence |
| 7 | `api/tests/test_phase1.py` | 6 | 6 | 0 | ~4s | Baseline platform foundation |
| 8 | `api/tests/test_phase2.py` | 6 | 6 | 0 | ~5s | Authentication tokens, cookies, sessions |
| 9 | `api/tests/test_phase3.py` | 3 | 3 | 0 | ~4s | Document generation pipelines |
| 10 | `api/tests/test_phase4.py` | 3 | 3 | 0 | ~4s | Analytics & metrics endpoints |
| 11 | `api/tests/test_phase6e3_acceptance.py` | 10 | 10 | 0 | ~24s | Synthetic tailoring & fact checking |
| 12 | `api/tests/test_remediation_phase6e2.py` | 18 | 18 | 0 | ~22s | Provider exceptions & key encryption |
| 13 | `api/tests/test_security_phase6b.py` | 36 | 36 | 0 | ~36s | OWASP security, CSRF, IDOR, headers |
| 14 | `extension/tests/test_e2e_browser.py` | 1 | 1 | 0 | ~7s | Chromium MV3 extension multi-ATS E2E |
| 15 | `extension/tests/test_resume_upload_e2e.py` | 1 | 1 | 0 | ~6s | 10-step Chromium DataTransfer & SHA-256 |
| **Total** | **15 Files** | **163** | **163** | **0** | **212.25s** | **100% Pass Rate** |

---

## 3. Node.js Test Runner Baseline

### 3.1 Execution Command
```bash
node extension/tests/test-runner.mjs
```

### 3.2 Execution Metrics
- **Runtime:** Node.js v20+ with built-in `node:test` runner
- **Suites Collected:** 20
- **Passed:** 20
- **Failed:** 0
- **Duration:** 24.58 ms
- **Scope Covered:**
  - Greenhouse, Lever, Workday, LinkedIn, Generic ATS classification (Tests 1–4)
  - Non-negotiable demographic quarantine and zero-submission checks (Tests 5–6)
  - Service-worker ticket binding, replay attack prevention, fail-closed restart (Tests 7–10)
  - Browser sender metadata resolution: top-frame, subframe isolation, opaque origins (Tests 11–15)
  - Mismatched tab/frame ID and origin navigation protection (Tests 16–17)
  - Dual-protection ticket covering autofill and resume download (Test 18)
  - 122 bits of UUID v4 cryptographic entropy verification (Test 19)

---

## 4. Production Build Baselines

### 4.1 React Web Frontend Build
- **Command:** `npm --prefix web run build`
- **Compiler:** `tsc && vite build`
- **Duration:** 4.69 seconds
- **Output:**
  - 1518 modules transformed
  - HTML: `dist/index.html` (2.70 kB, gzip: 1.01 kB)
  - CSS: `dist/assets/index-J_VSxtmE.css` (3.54 kB, gzip: 1.42 kB)
  - JS: 31 chunks generated (largest: `vendor-DOzpLUga.js` at 162.28 kB, gzip: 52.95 kB)
- **Status:** **PASS (Zero TypeScript or bundling errors)**

### 4.2 Browser Extension Build
- **Command:** `node extension/scripts/build.js`
- **Bundler:** esbuild
- **Duration:** 11 ms
- **Output:**
  - `extension/dist/background/service-worker.js` (19.7 kB)
  - `extension/dist/content/index.js` (48.3 kB)
  - `extension/dist/popup/popup.js` (4.8 kB)
  - Manifest V3 manifest and HTML test fixtures copied
- **Status:** **PASS (Zero bundling errors)**

### 4.3 Marketing Portal Build
- **Command:** `npm --prefix marketing run build` (evaluated)
- **Prerequisite Check:** `Test-Path marketing/node_modules` returns `False`.
- **Constraint:** Package installation (`npm install`) is strictly forbidden by the audit boundaries.
- **Status:** **BLOCKED (Missing dependencies; requires `npm install` in future implementation phase)**

---

## 5. Test Reconciliation Summary

```
======================================================
TOTAL AUTOMATED TEST COVERAGE: 183 Unique Tests
├── Backend & Browser Pytest Suite: 163 Tests (PASS)
└── Extension Node.js Unit Suite:     20 Tests (PASS)
======================================================
183 / 183 Passed (100% Verified)
```
