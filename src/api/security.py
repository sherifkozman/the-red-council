# src/api/security.py

import os
import time
from collections import defaultdict
from typing import Optional, Dict, List
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# ============================================================
# Configuration from Environment
# ============================================================

# API keys: comma-separated list, empty = auth disabled (dev mode)
_API_KEYS_RAW = os.getenv("RED_COUNCIL_API_KEYS", "")
VALID_API_KEYS: frozenset[str] = frozenset(
    k.strip() for k in _API_KEYS_RAW.split(",") if k.strip()
)

# Auth mode: if no keys configured, auth is disabled (permissive dev mode)
AUTH_ENABLED = len(VALID_API_KEYS) > 0

# ============================================================
# 1. CSP Headers Middleware
# ============================================================


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers including CSP to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Content-Security-Policy - restrictive default for API
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            "frame-ancestors 'none'; "
            "base-uri 'none'; "
            "form-action 'none'"
        )

        # Additional security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response


# ============================================================
# 2. In-Memory Rate Limiting
# ============================================================


class RateLimiter:
    """Simple sliding window rate limiter per IP."""

    def __init__(
        self, requests_per_minute: int = 100
    ):  # Increased from 10 to 100 for dev usability
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    def _cleanup_old_entries(self) -> None:
        """Remove stale entries every 5 minutes to prevent memory growth."""
        now = time.time()
        if now - self._last_cleanup < 300:  # 5 min cleanup interval
            return

        cutoff = now - self.window_seconds
        stale_keys = [
            ip
            for ip, timestamps in self._requests.items()
            if not timestamps or timestamps[-1] < cutoff
        ]
        for key in stale_keys:
            del self._requests[key]
        self._last_cleanup = now

    def is_allowed(self, client_ip: str) -> bool:
        """Check if request is allowed and record it."""
        now = time.time()
        cutoff = now - self.window_seconds

        # Filter to only recent requests
        self._requests[client_ip] = [
            ts for ts in self._requests[client_ip] if ts > cutoff
        ]

        if len(self._requests[client_ip]) >= self.requests_per_minute:
            return False

        self._requests[client_ip].append(now)
        self._cleanup_old_entries()
        return True


# Global rate limiter instance
_rate_limiter = RateLimiter(requests_per_minute=100)


async def rate_limit_dependency(request: Request) -> None:
    """FastAPI dependency for rate limiting."""
    client_ip = request.client.host if request.client else "unknown"

    if not _rate_limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=429, detail="Rate limit exceeded. Try again in 60 seconds."
        )


# ============================================================
# 3. Bearer Token Auth Placeholder
# ============================================================

_bearer_scheme = HTTPBearer(auto_error=False)


async def verify_bearer_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> str:
    """
    API key authentication via Bearer token.

    Behavior:
    - If RED_COUNCIL_API_KEYS env var is set: validates token against allowed keys
    - If no keys configured: permissive dev mode (accepts any/no token)

    Returns:
        User identifier (the API key itself, or "anonymous" in dev mode)
    """
    # Dev mode: no keys configured, allow anonymous access
    if not AUTH_ENABLED:
        if credentials and credentials.credentials:
            return credentials.credentials
        return "anonymous"

    # Production mode: require valid API key
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    if token not in VALID_API_KEYS:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Return the API key as user identifier for access control
    return token
