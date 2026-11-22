# RESII Extension Authentication & Token Security Architecture

**Project:** RESII AI Career Platform  
**Target:** Chrome Manifest V3 Security Architecture  
**Document:** Security Model, Token Lifecycle, and Storage Integrity  
**Date:** November 2026

---

## 1. Authentication Architecture Overview

The RESII Chrome Extension connects to the RESII backend using a secure pairing and token lifecycle designed to prevent credential theft, replay attacks, cross-tenant data exposure, and unauthorized API usage.

```
+-----------------------------------------------------------------------------------------+
|                                    PAIRING FLOW                                         |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  1. Candidate Dashboard         2. Backend (FastAPI)              3. Extension          |
|  [Generate Pairing Code] ------> Creates Single-Use Challenge                          |
|                                   - Code: 6 uppercase alphanumeric                      |
|                                   - Bound to User ID                                   |
|                                   - TTL: 300 seconds                                   |
|                                   - Invalidation on first use                           |
|                                                                                         |
|  4. Candidate enters code into Extension Popup -------------------> Extension Popup     |
|                                                                      |                  |
|  5. Extension exchanges code via POST /api/v3/extension/pair <-----+                  |
|                                                                                         |
|  6. Backend validates challenge atomically:                                            |
|     - Check code exists & not expired                                                   |
|     - Mark code consumed immediately                                                    |
|     - Generate raw token: `rezifi_ext_` + secrets.token_urlsafe(32)                      |
|     - Compute SHA-256 hash of token                                                     |
|     - Persist ExtensionTokenModel(token_hash, user_id, expires_at, revoked=False)        |
|     - Return raw token to extension ONCE                                                |
|                                                                                         |
|  7. Extension receives raw token:                                                       |
|     - Saves in `chrome.storage.local` (isolated MV3 context)                            |
|     - Never writes token to DOM or window.postMessage                                   |
|     - Uses Bearer header for all subsequent API requests                                |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Token Security Properties

### 2.1 Cryptographic Entropy
Extension tokens are generated using Python's standard `secrets.token_urlsafe(32)`:
- Length: 43 characters + 11-char prefix (`rezifi_ext_`) = 54 characters.
- Entropy: ~256 bits of cryptographically secure pseudorandomness.
- Collisions: Computationally infeasible ($2^{-256}$).

### 2.2 Database Hashing
Raw tokens are **never written to the database**.
- Storage field: `token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()`.
- If the database file is intercepted or backed up, raw credentials cannot be reconstructed (preimage resistance of SHA-256).

### 2.3 Expiration & Invalidation
- **Default Lifetime:** 30 days (`datetime.utcnow() + timedelta(days=30)`).
- **Revocation:** Explicitly flagged `revoked=True` when candidate clicks Disconnect or initiates Token Rotation.
- **Atomic Rotation:** `/api/v3/extension/rotate-token` flags old token revoked in the database and invalidates its cache entry, returning a new single-use token to the extension in one coordinated step.

### 2.4 Single-Use Pairing Challenge
- Pairing codes are 6-character uppercase strings generated from unconfusable characters (`secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")`).
- Valid for exactly 5 minutes (300 seconds).
- Atomic verification ensures that if two requests attempt to consume the same pairing code simultaneously, exactly one succeeds and the other receives a `400 Invalid or expired code` error.

---

## 3. Chrome Extension Storage Isolation

### 3.1 Content Script vs. Service Worker Boundary
- In Manifest V3, content scripts run inside web pages (e.g., Workday or Greenhouse). Even though content scripts have isolated JS worlds, any token passed into DOM attributes or accessible via prototype pollution represents a security risk.
- **Rule:** The raw token is stored strictly in `chrome.storage.local` by the background service worker.
- Content scripts do not receive the bearer token. Content scripts communicate with the service worker via internal `chrome.runtime.sendMessage` requests for specific domain actions (e.g., `ACTION_TAILOR_RESUME`, `ACTION_GET_PROFILE`).
- The service worker validates message origin and tab context before attaching the `Bearer <token>` header to the outbound backend HTTP request.

### 3.2 Revocation Handling
When a candidate disconnects from the extension popup or dashboard:
1. Extension fires `ACTION_DISCONNECT` to the service worker.
2. Service worker calls `/api/v3/extension/disconnect`.
3. Backend marks `revoked = True` in SQLite `ExtensionTokenModel` and deletes active session proxy entries.
4. Extension clears `chrome.storage.local.clear()`, wiping cached profile, resume ID, and credentials.
5. Content scripts detect unauthenticated state and dismantle the sidebar overlay.
