# src/ui/providers/polling.py
"""
Polling providers for real-time updates in the UI.

Includes:
- Arena state streaming for LLM testing mode
- Event polling for SDK agent testing mode
"""

import logging
import re
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from pydantic import SecretStr

from src.core.schemas import ArenaState
from src.orchestrator.runner import ArenaRunner

logger = logging.getLogger(__name__)

# Default polling configuration
DEFAULT_POLL_INTERVAL_MS = 1000
DEFAULT_API_TIMEOUT_SECONDS = 10.0
MAX_EVENTS_PER_POLL = 100


class EventPollingError(Exception):
    """Error during event polling."""


# Session ID validation pattern (UUID or alphanumeric with hyphens)
SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def _validate_session_id(session_id: str) -> None:
    """Validate session_id format to prevent path traversal.

    Args:
        session_id: The session ID to validate.

    Raises:
        ValueError: If session_id contains unsafe characters.
    """
    if not session_id or not SESSION_ID_PATTERN.match(session_id):
        raise ValueError(f"Invalid session_id format: {session_id[:20]}...")


async def run_arena_stream(
    secret: str, system_prompt: str, max_rounds: int = 3
) -> AsyncGenerator[ArenaState, None]:
    """
    Runs the arena and yields state updates after each step.
    """
    runner = ArenaRunner()

    current_state = ArenaState(
        run_id=str(uuid.uuid4()),
        state="ATTACKING",
        status="ONGOING",
        target_secret=SecretStr(secret),
        system_prompt=system_prompt,
        initial_target_prompt=system_prompt,
        current_round=1,
        max_rounds=max_rounds,
        rounds=[],
    )

    # Use astream for real-time updates
    async for chunk in runner.graph.astream(current_state, {"recursion_limit": 50}):
        for _node_name, updates in chunk.items():
            # Update state immutably using Pydantic's model_copy
            # Note: Pydantic v2 uses model_copy(update=...)
            current_state = current_state.model_copy(update=updates)

            yield current_state


async def poll_events_from_api(
    session_id: str,
    base_url: str = "http://localhost:8000",
    auth_token: str | None = None,
    offset: int = 0,
    limit: int = MAX_EVENTS_PER_POLL,
    timeout: float = DEFAULT_API_TIMEOUT_SECONDS,
) -> tuple[list[dict[str, Any]], int]:
    """
    Poll events from the API for a given session.

    Args:
        session_id: The session ID to poll events for.
        base_url: Base URL of the API server.
        auth_token: Optional bearer token for authentication.
        offset: Starting offset for pagination.
        limit: Maximum number of events to retrieve.
        timeout: Request timeout in seconds.

    Returns:
        Tuple of (events list, total count).

    Raises:
        EventPollingError: If the request fails.
        ValueError: If session_id format is invalid.
    """
    _validate_session_id(session_id)
    url = f"{base_url}/api/v1/agent/session/{session_id}/events"

    headers = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    params = {"offset": offset, "limit": limit}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, headers=headers, params=params)

            if response.status_code == 404:
                logger.debug(f"Session {session_id} not found")
                return [], 0

            if response.status_code != 200:
                error_msg = f"API returned status {response.status_code}"
                logger.error(f"Event polling failed: {error_msg}")
                raise EventPollingError(error_msg)

            data = response.json()
            events = data.get("events", [])
            total_count = data.get("total_count", len(events))

            return events, total_count

    except httpx.TimeoutException as e:
        logger.warning(f"Event polling timed out: {e}")
        raise EventPollingError("Request timed out") from e
    except httpx.ConnectError as e:
        logger.warning(f"Event polling connection failed: {e}")
        raise EventPollingError("Connection failed") from e
    except Exception as e:
        logger.error(f"Event polling failed: {e}", exc_info=True)
        raise EventPollingError(str(e)) from e


async def check_session_exists(
    session_id: str,
    base_url: str = "http://localhost:8000",
    auth_token: str | None = None,
    timeout: float = DEFAULT_API_TIMEOUT_SECONDS,
) -> bool:
    """
    Check if a session exists on the API server.

    Args:
        session_id: The session ID to check.
        base_url: Base URL of the API server.
        auth_token: Optional bearer token for authentication.
        timeout: Request timeout in seconds.

    Returns:
        True if session exists, False otherwise.

    Raises:
        ValueError: If session_id format is invalid.
    """
    _validate_session_id(session_id)
    url = f"{base_url}/api/v1/agent/session/{session_id}"

    headers = {"Content-Type": "application/json"}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, headers=headers)
            return response.status_code == 200
    except Exception as e:
        logger.debug(f"Session check failed: {e}")
        return False


def get_poll_interval_ms() -> int:
    """Get the configured poll interval in milliseconds."""
    return DEFAULT_POLL_INTERVAL_MS


def get_api_timeout() -> float:
    """Get the configured API timeout in seconds."""
    return DEFAULT_API_TIMEOUT_SECONDS
