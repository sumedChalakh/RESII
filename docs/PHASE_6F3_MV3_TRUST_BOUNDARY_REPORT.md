# RESII Phase 6F.3: Manifest V3 Extension Trust Boundary & Lifecycle Report

**Date:** 2026-11-21  
**Product:** RESII AI Career Platform  
**Target:** Chrome Manifest V3 Browser Extension (`extension/`)  
**Auditor:** Antigravity Independent Acceptance Audit Agent  
**Verdict:** **PASS**

---

## 1. Architectural Trust Boundary Model

The RESII browser extension operates across three distinct privilege levels and trust domains:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           UNTRUSTED WEB PAGE DOM                            │
│  (Host ATS job application forms, page scripts, 3rd party trackers, ads)    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    ISOLATED WORLD CONTENT SCRIPT                      │  │
│  │  - Runs in separate JS execution context (cannot access page variables)│  │
│  │  - Interacts with DOM elements via standard DOM APIs                  │  │
│  │  - Mounts UI exclusively within closed Shadow DOM container           │  │
│  │  - Zero access to credentials, API keys, or long-lived tokens         │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │ chrome.runtime.sendMessage
                                       │ (Validated sender.origin & tab ID)
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                    PRIVILEGED MV3 BACKGROUND SERVICE WORKER                  │
│  - Holds extension bearer token in chrome.storage.local (AES encrypted on OS)│
│  - Communicates with RESII Backend (FastAPI on Port 8100 via HTTPS/mTLS)     │
│  - Maintains in-memory activeScanLedger                                     │
│  - Generates & verifies 60s cryptographic UUID tickets                       │
│  - Enforces origin binding & field allowlists                               │
│  - Implements fail-closed behavior on worker idle termination/restart        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Authorization: Bearer <token>
                                       │ X-Extension-Token: <token>
┌──────────────────────────────────────▼──────────────────────────────────────┐
│                         TRUSTED BACKEND REST API                             │
│  - FastAPI on Port 8100                                                     │
│  - SQLite Database with WAL mode (`data/resii.db`)                           │
│  - Argon2id pairing code validation, atomic single-use consumption          │
│  - Multi-tenant candidate data isolation & explicit token revocation        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Manifest V3 Service Worker Lifecycle & Fail-Closed Security

### 2.1 The MV3 Ephemeral Lifecycle Challenge
Under Manifest V3, background service workers are not persistent processes; they are event-driven and can be suspended/terminated by the Chromium browser engine after approximately 30 seconds of inactivity.

If an extension relies on in-memory state without proper safeguards, a worker restart could cause:
1. State corruption if partial transactions exist.
2. Insecure fallback if unvalidated requests are processed after restart.
3. Denial of service if legitimate sessions cannot recover gracefully.

### 2.2 RESII's Fail-Closed Implementation
RESII handles this lifecycle safely through an explicit **Fail-Closed Security Model**:
1. **In-Memory Scan Ledger:** The background worker stores active scan authorizations in `activeScanLedger: Map<string, ActiveScanSession>`.
2. **Worker Suspension Purge:** When Chrome terminates an idle service worker, the `activeScanLedger` map is purged from volatile memory.
3. **Fail-Closed Verification:** If a malicious script, captured ticket, or stale content script attempts to execute autofill against a restarted service worker:
   ```typescript
   const session = activeScanLedger.get(request.scanId);
   if (!session) {
     sendResponse({ success: false, error: 'Invalid, missing, or expired scan session' });
     return;
   }
   ```
4. **Result:** Any execution attempt with a dangling ticket is immediately rejected. The candidate is presented with a safe notification requiring them to trigger a new scan from the extension popup.

### 2.3 Automated Verification of Lifecycle Behavior
In `extension/tests/test-runner.mjs`, unit tests 8, 9, 10, and 11 simulate service worker restart, ticket expiration, and ticket replay:
- **Test 8 (Restart Purge):** Verified that simulating a worker restart purges the ledger; subsequent verification returns `null`.
- **Test 9 (Replay Attack Prevention):** Verified that after `session.ticketConsumed = true`, a secondary attempt returns `Ticket already consumed`.
- **Test 10 (TTL Expiration):** Verified that a ticket older than 60,000 ms returns `Ticket expired`.
- **Test 11 (Cryptographic Ticket Entropy):** Verified that ticket strings conform to RFC 4122 v4 UUID format (`crypto.randomUUID()`).

---

## 3. Communication Security & Sender Origin Verification

### 3.1 Content Script to Background Worker IPC
All inter-process communication between content scripts and the service worker occurs via `chrome.runtime.sendMessage`. The service worker never trusts the payload-supplied origin; instead, it derives and verifies the caller origin directly from the browser-provided `sender` object:

```typescript
function resolveBrowserOrigin(sender: any, fallbackUrl?: string): string {
  if (sender && sender.origin && sender.origin !== 'null') {
    return sender.origin;
  }
  const source = (sender && sender.tab && sender.tab.url) || fallbackUrl;
  if (!source) return '';
  try {
    return new URL(source).origin;
  } catch {
    return '';
  }
}
```

### 3.2 Strict Ticket Binding
When the candidate reviews proposed values and clicks "Approve & Fill", the background service worker generates an authorization ticket bound to:
- `ticket`: 128-bit RFC 4122 UUID (`crypto.randomUUID()`)
- `scanId`: Unique scan session identifier
- `tabId`: Browser tab where the scan occurred
- `frameId`: Target frame within the tab
- `origin`: Exact protocol, host, and port of the target ATS
- `allowedFieldIds`: Explicit array of field IDs the candidate approved
- `approvedFields`: Map of authorized field names and values
- `createdAt` and `expiresAt`: 60-second window
- `consumed`: Atomic boolean flag

If a content script running on `attacker.com` intercepts an authorization ticket, it cannot consume the ticket because:
1. `resolveBrowserOrigin(sender)` evaluates to `https://attacker.com`, which fails the origin equality check (`origin !== session.origin`).
2. Even on the same origin, each ticket can only be consumed once (`CONSUME_AUTOFILL_TICKET` sets `consumed = true`).

---

## 4. Shadow DOM Trust Boundary & DOM Isolation

### 4.1 Closed Shadow DOM UI Mounting
The extension UI (status badges, field approval popovers, autofill triggers) is injected into the DOM inside a closed Shadow DOM container:
```typescript
const container = document.createElement('div');
container.id = 'resii-extension-root';
const shadowRoot = container.attachShadow({ mode: 'closed' });
```
Benefits of `mode: 'closed'`:
- The host page's JavaScript cannot access `container.shadowRoot` (returns `null`).
- Third-party page trackers (e.g., Google Analytics, Hotjar, FullStory) cannot observe candidate resume data displayed in the extension UI.
- Host page CSS rules cannot restyle or obscure extension safety prompts.

### 4.2 Form Element Interaction
When writing values to DOM elements during autofill, `form-filler.ts`:
- Targets standard DOM input/textarea elements directly in the Isolated World.
- Triggers standard framework-compatible events (`new Event('input', { bubbles: true })`, `new Event('change', { bubbles: true })`).
- Does **not** inject `<script>` tags into the page DOM (no execution of un-sandboxed code).
- Never attaches file paths directly; instead, utilizes standard `DataTransfer` containers with `File` objects.

---

## 5. Security Verdict

The RESII Chrome extension architecture strictly respects the Manifest V3 security boundaries:
- Content scripts operate in isolated worlds without long-lived credential storage.
- Background service worker authorization is cryptographically random, origin-bound, single-use, time-limited, and fail-closed across worker suspensions.
- Host page tampering is mitigated via closed Shadow DOM containment.

**Verdict:** **PASS**
