# src/core/security.py

import time
import nh3
from typing import Dict, Tuple

# Rate limiting storage (simple in-memory)
# Key: client_id, Value: (request_count, window_start_time)
_RATE_LIMITS: Dict[str, Tuple[int, float]] = {}

RATE_LIMIT_REQUESTS = 50
RATE_LIMIT_WINDOW = 60  # seconds

# Allowed tags for UI rendering (safe subset)
ALLOWED_TAGS = {"p", "b", "i", "code", "pre", "ul", "li", "br", "strong", "em"}


def sanitize_output(text: str) -> str:
    """
    Sanitizes text for display in the UI to prevent XSS.
    All LLM outputs must pass through this before rendering in the DASHBOARD.

    CRITICAL: Do NOT use this for storage or execution paths (Attacker -> Target),
    as it will neutralize red-team payloads. Use only for UI presentation.
    """
    if not text:
        return ""
    # nh3 is a Rust-based HTML sanitizer (faster and safer than bleach)
    return nh3.clean(text, tags=ALLOWED_TAGS)


def validate_input(text: str, max_length: int = 10000) -> str:
    """
    Validates user/LLM input.
    - Checks length
    """
    if not text:
        raise ValueError("Input cannot be empty")

    if len(text) > max_length:
        raise ValueError(f"Input exceeds maximum length of {max_length} characters")

    return text.strip()


def check_rate_limit(client_id: str) -> bool:
    """
    Simple sliding window rate limiter.
    Returns True if request is allowed, False if limited.
    """
    now = time.time()
    current = _RATE_LIMITS.get(client_id, (0, now))
    count, window_start = current

    if now - window_start > RATE_LIMIT_WINDOW:
        # Reset window
        _RATE_LIMITS[client_id] = (1, now)
        return True

    if count >= RATE_LIMIT_REQUESTS:
        return False

    _RATE_LIMITS[client_id] = (count + 1, window_start)
    return True
