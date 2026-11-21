import time
import ipaddress
from typing import Dict, List, Tuple, Set, Optional
from fastapi import Request, HTTPException
from api.config import settings

class InMemoryRateLimiter:
    """
    In-memory sliding window rate limiter keyed by client identifier.
    Thread-safe for typical async FastAPI runtimes and periodically purges stale keys.
    """
    def __init__(self, purge_interval_seconds: int = 300):
        self.requests: Dict[str, List[float]] = {}
        self.last_purge = time.time()
        self.purge_interval = purge_interval_seconds

    def _purge_stale(self, current_time: float, max_age: float = 600):
        if current_time - self.last_purge > self.purge_interval:
            stale_keys = [
                k for k, timestamps in self.requests.items()
                if not timestamps or timestamps[-1] < current_time - max_age
            ]
            for k in stale_keys:
                del self.requests[k]
            self.last_purge = current_time

    def is_allowed(self, key: str, limit: int, window_seconds: int) -> Tuple[bool, int]:
        """
        Returns (is_allowed, retry_after_seconds).
        """
        current_time = time.time()
        self._purge_stale(current_time)

        timestamps = self.requests.get(key, [])
        cutoff = current_time - window_seconds
        valid_timestamps = [t for t in timestamps if t > cutoff]

        if len(valid_timestamps) < limit:
            valid_timestamps.append(current_time)
            self.requests[key] = valid_timestamps
            return True, 0
        else:
            oldest = valid_timestamps[0]
            retry_after = max(1, int(oldest + window_seconds - current_time))
            self.requests[key] = valid_timestamps
            return False, retry_after

    def reset(self):
        """Reset all rate limiter state (useful for tests)."""
        self.requests.clear()

# Global rate limiter instance
limiter = InMemoryRateLimiter()

def normalize_ip(raw_ip: str) -> Optional[str]:
    """
    Normalizes an IPv4 or IPv6 address string into canonical form.
    Strips surrounding brackets, port numbers, and returns None if malformed.
    """
    if not raw_ip or not isinstance(raw_ip, str):
        return None
    cleaned = raw_ip.strip()
    if not cleaned:
        return None

    # Handle [IPv6]:port or [IPv6]
    if cleaned.startswith("[") and "]" in cleaned:
        bracket_content = cleaned[1:cleaned.index("]")]
        cleaned = bracket_content
    elif ":" in cleaned and "." in cleaned:
        # IPv4 with port e.g. 192.168.1.1:8080
        cleaned = cleaned.split(":")[0]

    try:
        ip_obj = ipaddress.ip_address(cleaned)
        return str(ip_obj)
    except ValueError:
        # Could be a named hostname like 'localhost' or 'testclient'
        lower = cleaned.lower()
        if lower in ("localhost", "testclient"):
            return lower
        return None

def resolve_client_ip(request: Request, trusted_proxies: Optional[Set[str]] = None) -> str:
    """
    Resolves client IP following trusted proxy boundary rules:
    1. If request.client is None or empty, returns '127.0.0.1'.
    2. Identifies immediate peer IP (request.client.host).
    3. Normalizes peer IP.
    4. If immediate peer is NOT in trusted_proxies, uses immediate peer IP directly,
       completely ignoring any client-supplied X-Forwarded-For headers.
    5. If immediate peer IS in trusted_proxies, traverses the X-Forwarded-For chain
       from right to left: the first untrusted, valid IP from the right is the genuine client IP.
    6. If all addresses in the chain are trusted or invalid, falls back to immediate peer.
    """
    if trusted_proxies is None:
        trusted_proxies = settings.trusted_proxies_set

    # 1. Immediate socket peer
    peer_raw = request.client.host if request.client and request.client.host else "127.0.0.1"
    peer_norm = normalize_ip(peer_raw) or peer_raw.lower()

    # 2. If immediate peer is untrusted, NEVER trust X-Forwarded-For
    if peer_norm not in trusted_proxies:
        return peer_norm

    # 3. Peer is trusted reverse proxy -> inspect X-Forwarded-For
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return peer_norm

    # Split chain: e.g. "client, proxy1, proxy2"
    hops = [h.strip() for h in forwarded.split(",") if h.strip()]
    if not hops:
        return peer_norm

    # Walk from right to left to find the first untrusted hop
    for hop in reversed(hops):
        norm_hop = normalize_ip(hop)
        if not norm_hop:
            # Malformed entry in forwarded chain -> skip or ignore
            continue
        if norm_hop not in trusted_proxies:
            return norm_hop

    return peer_norm

def check_rate_limit(
    request: Request,
    key_prefix: str,
    limit: int,
    window_seconds: int = 60,
    trusted_proxies: Optional[Set[str]] = None
) -> None:
    """
    Extracts validated client IP, checks sliding window rate limit, and raises HTTP 429 if exceeded.
    """
    client_ip = resolve_client_ip(request, trusted_proxies)
    key = f"{key_prefix}:{client_ip}"
    allowed, retry_after = limiter.is_allowed(key, limit, window_seconds)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)}
        )
