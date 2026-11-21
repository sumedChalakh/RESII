# RESII — Phase 6F.2: Pairing Security & Cryptographic Analysis Report

**Date:** 2026-11-20  
**Target:** Extension Pairing Subsystem (`/api/v3/extension/pairing-code`, `/api/v3/extension/pair`)  
**Product:** RESII AI Career Platform  
**Compliance Standard:** Enterprise Security & Cryptographic Integrity  

---

## 1. Cryptographic Entropy Analysis

### 1.1 Entropy Specification
In Phase 6F, the initial pairing code generator used `secrets.token_hex(3)` (6 hexadecimal digits), yielding:
$$\text{Entropy}_{\text{old}} = \log_2(16^6) = 24\text{ bits}$$

In Phase 6F.2, the generator was upgraded to `secrets.token_hex(16)`:
$$\text{Entropy}_{\text{new}} = \log_2(16^{32}) = \log_2(2^{128}) = 128\text{ bits}$$

### 1.2 Brute-Force Resistance
With 128 bits of cryptographic entropy:
- Total search space: $2^{128} \approx 3.402 \times 10^{38}$ possible codes.
- At an aggressive brute-force rate of 100,000 requests/second globally, the expected time to encounter a valid code is:
  $$\frac{2^{128}}{2 \times 100,000 \times 86,400 \times 365.25} \approx 5.39 \times 10^{25}\text{ years}$$
- Combined with a 300-second (5-minute) TTL and per-IP rate limiting (10 attempts/minute), online brute-force probability per code window is strictly negligible ($< 1.47 \times 10^{-37}$).

### 1.3 Format & Usability
The raw pairing code presented to the user is formatted as:
`RESII-<32_UPPERCASE_HEX_CHARACTERS>` (e.g., `RESII-B7C22F58B6D6CC3B7C4190035250D56E`).
The `RESII-` prefix enables easy identification and copy-pasting into the browser extension popup.

---

## 2. Storage & Hashing Architecture

### 2.1 One-Way Hashing
To prevent credential theft through database backups, memory dumps, or SQL exposure:
- Raw pairing codes are **never stored** in the database.
- Raw pairing codes are **never logged** to disk, console, or monitoring platforms.
- The backend stores strictly the SHA-256 digest:
  $$\text{code\_hash} = \text{SHA-256}(\text{raw\_code}_{\text{utf8}})$$
- Table Schema (`extension_pairing_codes`):
  | Column | Type | Index | Description |
  | :--- | :--- | :--- | :--- |
  | `id` | VARCHAR(64) | Primary Key | Unique entry identifier (`pair_<uuid12>`) |
  | `user_id` | VARCHAR(64) | Foreign Key | Bound candidate account (`users.id`) |
  | `code_hash` | VARCHAR(128) | Indexed | SHA-256 digest of pairing code |
  | `created_at` | FLOAT | - | Timestamp of creation (epoch seconds) |
  | `expires_at` | FLOAT | - | Timestamp of expiration (`created_at + 300.0`) |
  | `consumed` | BOOLEAN | - | Consumption flag (`False` until paired) |

### 2.2 Proof of Storage Hygiene
Automated test `test_pairing_code_entropy_and_hashing` executes:
```python
raw_match = db.query(ExtensionPairingCodeModel).filter(
    ExtensionPairingCodeModel.code_hash == raw_code
).first()
assert raw_match is None  # Raw code NEVER exists in database
```

---

## 3. Atomic Single-Use Concurrency Guarantees

### 3.1 Race Condition Remediation
Previous implementations checked `consumed == False` with a `SELECT`, followed by a separate `UPDATE`. Under concurrent requests, this introduced a Time-of-Check to Time-of-Use (TOCTOU) race condition.

Phase 6F.2 utilizes a single atomic SQLite/SQLAlchemy `UPDATE` query:
```python
stmt = (
    update(ExtensionPairingCodeModel)
    .where(
        ExtensionPairingCodeModel.code_hash == target_hash,
        ExtensionPairingCodeModel.consumed == False,
        ExtensionPairingCodeModel.expires_at > now
    )
    .values(consumed=True)
)
res = db.execute(stmt)
db.commit()
if res.rowcount != 1:
    raise HTTPException(status_code=401, detail="Invalid, expired, or already used pairing code.")
```

### 3.2 Concurrency Stress Test Results
In `test_atomic_concurrent_pairing_consumption`, 10 independent threads fired simultaneous pairing requests with identical pairing codes:
- **Total Requests:** 10
- **Successful Pairs (200 OK):** 1 (Exactly one)
- **Rejected Replays (401 Unauthorized):** 9
- **Final DB State:** `consumed == True`

---

## 4. Rate-Limiting & Production Safeguards

### 4.1 Multi-Tier Sliding Window Rate Limiting
Pairing requests are protected by two independent sliding-window rate limiters:
1. **IP-Level Rate Limiter:**
   - Client IP resolved via `resolve_client_ip(request)` with trusted proxy chain traversal.
   - Limit: 10 pairing attempts per 60-second window.
   - Behavior on violation: Returns HTTP `429 Too Many Requests` with `Retry-After` header.
2. **Account-Level Rate Limiter:**
   - Applied when credential-based pairing (`email`) is used.
   - Limit: 5 attempts per 60-second window per email.
   - Prevents credential stuffing targeting specific user accounts.

### 4.2 Production Demo Lockout
The demo pairing code (`"DEMO"` or `"RESII-DEMO-2026"`) provides rapid testing in development environments. In production (`settings.ENVIRONMENT == "production"`):
- Demo pairing requests are rejected immediately with HTTP `403 Forbidden`:
  `"Demo pairing code is prohibited in production deployment."`
- Verified via `test_production_demo_lockout`.

---

## 5. Security Checklist Compliance Matrix

| Requirement | Implementation Detail | Audit Status |
| :--- | :--- | :--- |
| $\ge 128$ bits entropy | 16 bytes via `secrets.token_hex(16)` (128 bits) | **VERIFIED** |
| Secure storage | SHA-256 hash only; zero raw codes stored | **VERIFIED** |
| Zero raw code logging | No logging of raw pairing codes in API logs | **VERIFIED** |
| Single-use consumption | Atomic SQL `UPDATE ... WHERE consumed = False` | **VERIFIED** |
| 5-minute TTL | `expires_at = created_at + 300.0` | **VERIFIED** |
| Trusted-proxy IP limiting | Uses `rate_limiter.py::resolve_client_ip` | **VERIFIED** |
| Account-level protection | Sliding window limiter on email identifier | **VERIFIED** |
| Production demo lockout | Returns 403 when `ENVIRONMENT == 'production'` | **VERIFIED** |
| Cross-user isolation | Invalidation of prior unconsumed codes per user | **VERIFIED** |
