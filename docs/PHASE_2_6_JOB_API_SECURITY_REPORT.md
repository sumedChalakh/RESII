# RESII — PHASE 2.6: JOB API SECURITY & SSRF PROTECTION REPORT

**Date:** 2026-11-21  
**Project:** RESII AI Career Platform (`E:\SUMED_DATA\Rezifi`)  
**Status:** PASS — SSRF GUARDS & ADMIN AUTHORIZATION VERIFIED  

---

## 1. OBJECTIVE & SCOPE

Harden RESII job ingestion, career URL detection, application URL verification, and administrative triggers against SSRF, unauthorized invocation, and input manipulation.

---

## 2. SSRF (SERVER-SIDE REQUEST FORGERY) DEFENSE MATRIX

Job aggregation engines inherently fetch remote URLs provided by third parties or users. To protect RESII's internal infrastructure and cloud host environment, `is_safe_external_url` in `api/jobs_engine/connectors/base.py` enforces:

1. **Protocol Restriction:** Only `http` and `https` schemes are allowed (`file://`, `ftp://`, `gopher://` rejected).
2. **Hostname Validation:** Rejects empty hostnames, `localhost`, `.local`, `.internal`, and `metadata.google.internal`.
3. **DNS Resolution & IP Blacklisting:** Resolves all IPv4 and IPv6 addresses via `socket.getaddrinfo` prior to initiating any HTTP connection and blocks:
   - Loopback: `127.0.0.0/8`, `::1/128`
   - Private RFC1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Cloud Instance Metadata: `169.254.0.0/16` (protects AWS EC2, GCP, Azure metadata tokens)
   - Zero network: `0.0.0.0/8`
   - IPv6 unique local / link local: `fc00::/7`, `fe80::/10`
4. **Integration Points:**
   - `BaseJobConnector._safe_get`: Validates target URL before every outbound GET request.
   - `BaseJobConnector.verify_job_url`: Rejects private/internal verification targets with HTTP 400.
   - `api/jobs_engine/registry.py`: Validates `career_page_url` and `website_url` during company registration.

---

## 3. ROLE & ENTITLEMENT AUTHORIZATION

- `POST /api/jobs/sync`: Gated by `_verify_admin_access(user)`. Requires `role == "admin"`, `admin` entitlement, or platform engineer account. Non-authorized users receive `HTTP 403 FORBIDDEN`.
- `POST /api/jobs/companies`: Requires `_verify_admin_access(user)`.
- `POST /api/jobs/verify/{job_id}`: Requires authenticated user session.
- CSRF Protection: Inherits RESII global double-submit cookie and `X-CSRF-Token` headers for mutating endpoints.

---

## 4. TEST VERIFICATION

- `test_ssrf_protection_validator` in `api/tests/test_jobs_real.py`:
  - Validates rejection of `http://127.0.0.1:8000/api`, `http://localhost/admin`, `http://169.254.169.254/latest/meta-data/`, `file:///etc/passwd`, `http://10.0.0.5/jobs`, `http://192.168.1.1/jobs`.
  - Validates permission for legitimate external domains: `boards.greenhouse.io`, `jobs.lever.co`, `jobs.ashbyhq.com`.
  - Result: **PASSED (0.01s)**.
