# src/api/security.py

import time
from collections import defaultdict
from typing import Optional, Dict, List
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

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
    
    def __init__(self, requests_per_minute: int = 100): # Increased from 10 to 100 for dev usability
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
            ip for ip, timestamps in self._requests.items()
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
            status_code=429,
            detail="Rate limit exceeded. Try again in 60 seconds."
        )


# ============================================================
# 3. Bearer Token Auth Placeholder
# ============================================================

_bearer_scheme = HTTPBearer(auto_error=False)


async def verify_bearer_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme)
) -> Optional[str]:
    """
    Placeholder Bearer token authentication.
    
    TODO (Post-Hackathon): Implement actual token validation:
    - JWT verification with proper secret
    - Token expiration checks
    - User/scope extraction
    
    Currently: Accepts any token or no token (permissive for MVP).
    """
    if credentials is None:
        # TODO: Change to raise HTTPException(401) when auth is required
        return None
    
    token = credentials.credentials
    
    # Placeholder validation - accept any non-empty token
    # TODO: Replace with actual JWT/API key validation
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )
    
    return token  # Return token/user info for downstream use
