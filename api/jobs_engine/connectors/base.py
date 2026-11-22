import time
import socket
import ipaddress
import urllib.parse
from urllib.parse import urlparse, urljoin
import httpx
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Tuple

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 RESII-Career-Engine/1.0"
ALLOWED_PORTS = {80, 443}
ALLOWED_SCHEMES = {"http", "https"}
MAX_REDIRECTS = 5

BLOCKED_IP_NETWORKS = [
    # IPv4 Blocked & Reserved Networks
    ipaddress.ip_network("0.0.0.0/8"),          # Current network (RFC 1122)
    ipaddress.ip_network("10.0.0.0/8"),         # Private RFC 1918
    ipaddress.ip_network("100.64.0.0/10"),       # Shared address space / CGNAT (RFC 6598)
    ipaddress.ip_network("127.0.0.0/8"),        # Loopback (RFC 1122)
    ipaddress.ip_network("169.254.0.0/16"),     # Link-local / Cloud metadata (RFC 3927)
    ipaddress.ip_network("172.16.0.0/12"),      # Private RFC 1918
    ipaddress.ip_network("192.0.0.0/24"),       # IETF Protocol Assignments (RFC 6890)
    ipaddress.ip_network("192.0.2.0/24"),       # Documentation TEST-NET-1 (RFC 5737)
    ipaddress.ip_network("192.88.99.0/24"),     # 6to4 Relay Anycast (RFC 7526)
    ipaddress.ip_network("192.168.0.0/16"),     # Private RFC 1918
    ipaddress.ip_network("198.18.0.0/15"),      # Network Device Benchmark (RFC 2544)
    ipaddress.ip_network("198.51.100.0/24"),    # Documentation TEST-NET-2 (RFC 5737)
    ipaddress.ip_network("203.0.113.0/24"),     # Documentation TEST-NET-3 (RFC 5737)
    ipaddress.ip_network("224.0.0.0/4"),        # Multicast (RFC 5771)
    ipaddress.ip_network("240.0.0.0/4"),        # Reserved for future use (RFC 1112)
    ipaddress.ip_network("255.255.255.255/32"), # Broadcast

    # IPv6 Blocked & Reserved Networks
    ipaddress.ip_network("::/128"),             # Unspecified
    ipaddress.ip_network("::1/128"),            # Loopback
    ipaddress.ip_network("::ffff:0:0/96"),      # IPv4-mapped IPv6
    ipaddress.ip_network("64:ff9b::/96"),       # IPv4-IPv6 translation
    ipaddress.ip_network("100::/64"),           # Discard-only prefix
    ipaddress.ip_network("2001::/23"),          # IETF Protocol Assignments
    ipaddress.ip_network("2001:db8::/32"),      # Documentation
    ipaddress.ip_network("2002::/16"),          # 6to4
    ipaddress.ip_network("fc00::/7"),           # Unique local (ULA)
    ipaddress.ip_network("fe80::/10"),          # Link-local
    ipaddress.ip_network("ff00::/8"),           # Multicast
]

def is_safe_external_url(url: str) -> Tuple[bool, str]:
    """
    Validates that a URL is a legitimate, publicly routable external HTTP/HTTPS address.
    Defends against Server-Side Request Forgery (SSRF) targeting loopback, private networks,
    cloud instance metadata endpoints (169.254.169.254), non-standard ports, and IPv4-mapped IPv6.
    """
    if not url or not isinstance(url, str):
        return False, "URL is empty or invalid"

    try:
        parsed = urlparse(url.strip())
    except Exception as e:
        return False, f"Malformed URL: {e}"

    scheme = parsed.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        return False, f"Unsupported scheme: {parsed.scheme}. Only HTTP and HTTPS permitted."

    # Validate port restrictions (only ports 80 and 443 allowed)
    port = parsed.port
    if port is not None and port not in ALLOWED_PORTS:
        return False, f"Port {port} is not permitted. Only ports 80 and 443 are allowed."

    host = parsed.hostname
    if not host:
        return False, "URL contains no hostname"

    host_lower = host.lower().strip("[]")
    if (
        host_lower in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal")
        or host_lower.endswith(".local")
        or host_lower.endswith(".internal")
        or host_lower.endswith(".arpa")
        or host_lower.endswith(".localhost")
    ):
        return False, "Access to private or local network resources is strictly forbidden"

    # Resolve all DNS A and AAAA records for the hostname
    target_port = port or (443 if scheme == "https" else 80)
    try:
        addr_info = socket.getaddrinfo(host_lower, target_port, proto=socket.IPPROTO_TCP)
        if not addr_info:
            return False, "Hostname did not resolve to any IP address"

        for entry in addr_info:
            ip_str = entry[4][0]
            ip_obj = ipaddress.ip_address(ip_str)

            # Check IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
            if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped:
                mapped_v4 = ip_obj.ipv4_mapped
                for net in BLOCKED_IP_NETWORKS:
                    if isinstance(net, ipaddress.IPv4Network) and mapped_v4 in net:
                        return False, f"Target host resolves to restricted IPv4-mapped address ({mapped_v4})"

            for net in BLOCKED_IP_NETWORKS:
                if ip_obj in net:
                    return False, f"Target host resolves to restricted IP range ({ip_str})"
    except socket.gaierror:
        # If DNS cannot be resolved, flag as unresolvable
        return False, "Hostname could not be resolved"
    except Exception as e:
        return False, f"DNS validation error: {str(e)[:80]}"

    return True, "Safe"


class BaseJobConnector(ABC):
    """Abstract base connector for external job boards and aggregators with per-hop SSRF validation."""

    def __init__(self, timeout: float = 12.0, max_retries: int = 2):
        self.timeout = timeout
        self.max_retries = max_retries

    def _execute_bounded_request(
        self,
        method: str,
        initial_url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[float] = None
    ) -> httpx.Response:
        """
        Executes an HTTP request with per-hop SSRF validation.
        Manual redirect handling ensures every 301, 302, 303, 307, 308 destination
        is validated against is_safe_external_url BEFORE the connection is made.
        Sensitive headers (Authorization, Cookie) are stripped on cross-origin redirects.
        """
        current_url = initial_url
        req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        if headers:
            req_headers.update(headers)

        req_timeout = timeout or self.timeout

        for hop in range(MAX_REDIRECTS + 1):
            is_safe, reason = is_safe_external_url(current_url)
            if not is_safe:
                raise ValueError(f"SSRF Protection: Blocked request to {current_url}: {reason}")

            # Never follow redirects automatically — inspect each hop explicitly
            with httpx.Client(timeout=req_timeout, follow_redirects=False) as client:
                if method.upper() == "HEAD":
                    resp = client.head(current_url, headers=req_headers)
                elif method.upper() == "GET":
                    req_params = params if hop == 0 else None
                    resp = client.get(current_url, params=req_params, headers=req_headers)
                else:
                    resp = client.request(method, current_url, params=params if hop == 0 else None, headers=req_headers)

            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location")
                if not location:
                    return resp

                # Safely resolve relative redirects against current_url
                next_url = urllib.parse.urljoin(current_url, location)

                # Cross-origin credential stripping
                curr_parsed = urllib.parse.urlparse(current_url)
                next_parsed = urllib.parse.urlparse(next_url)
                if (curr_parsed.scheme, curr_parsed.netloc) != (next_parsed.scheme, next_parsed.netloc):
                    req_headers.pop("Authorization", None)
                    req_headers.pop("Cookie", None)

                current_url = next_url
                continue

            return resp

        raise ValueError(f"SSRF Protection: Exceeded maximum allowed redirects ({MAX_REDIRECTS}) for {initial_url}")

    def _safe_get(self, url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> httpx.Response:
        """Executes HTTP GET with bounded retries, per-hop SSRF validation, and exponential backoff."""
        last_exc = None
        for attempt in range(self.max_retries + 1):
            try:
                resp = self._execute_bounded_request("GET", url, params=params, headers=headers)
                if resp.status_code in (429, 500, 502, 503, 504):
                    if attempt < self.max_retries:
                        time.sleep(0.5 * (attempt + 1))
                        continue
                return resp
            except (httpx.TimeoutException, httpx.NetworkError, httpx.RequestError) as e:
                last_exc = e
                if attempt < self.max_retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
            except ValueError as ve:
                # SSRF or validation error must fail immediately without retrying
                raise ve
        if last_exc:
            raise last_exc
        raise RuntimeError(f"Request failed for {url}")

    @abstractmethod
    def fetch_jobs(self, board_token: str, **kwargs) -> List[Dict[str, Any]]:
        """Fetches raw job listing payloads from external source."""
        pass

    @abstractmethod
    def normalize_job(self, raw: Dict[str, Any], company_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Normalizes raw external payload into RESII JobListing schema."""
        pass

    def verify_job_url(self, url: str) -> Tuple[bool, int, str]:
        """Performs a lightweight verification check on a job application URL with SSRF guards."""
        is_safe, reason = is_safe_external_url(url)
        if not is_safe:
            return False, 400, f"Blocked unsafe URL: {reason}"

        try:
            resp = self._execute_bounded_request("HEAD", url, timeout=8.0)
            if resp.status_code in (404, 410):
                return False, resp.status_code, "Job posting removed or expired (HTTP 404/410)"
            elif resp.status_code < 400:
                return True, resp.status_code, "Verified active"
            else:
                return False, resp.status_code, f"Unexpected response status: {resp.status_code}"
        except ValueError as ve:
            return False, 400, f"Blocked unsafe redirect: {str(ve)[:120]}"
        except httpx.TimeoutException:
            return False, 408, "Verification request timed out"
        except Exception as e:
            return False, 0, f"Verification failed: {str(e)[:120]}"
