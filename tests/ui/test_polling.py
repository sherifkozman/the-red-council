# tests/ui/test_polling.py
"""Tests for the polling provider module."""

import sys
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

sys.modules.pop("src.ui.providers.polling", None)

from src.ui.providers.polling import (
    DEFAULT_API_TIMEOUT_SECONDS,
    DEFAULT_POLL_INTERVAL_MS,
    MAX_EVENTS_PER_POLL,
    EventPollingError,
    check_session_exists,
    get_api_timeout,
    get_poll_interval_ms,
    poll_events_from_api,
)


class TestConstants:
    """Tests for module constants."""

    def test_default_poll_interval(self):
        """Test default poll interval is set."""
        assert DEFAULT_POLL_INTERVAL_MS == 1000

    def test_default_api_timeout(self):
        """Test default API timeout is set."""
        assert DEFAULT_API_TIMEOUT_SECONDS == 10.0

    def test_max_events_per_poll(self):
        """Test max events per poll is set."""
        assert MAX_EVENTS_PER_POLL == 100


class TestGetPollIntervalMs:
    """Tests for get_poll_interval_ms function."""

    def test_returns_default_interval(self):
        """Test returns default poll interval."""
        assert get_poll_interval_ms() == DEFAULT_POLL_INTERVAL_MS


class TestGetApiTimeout:
    """Tests for get_api_timeout function."""

    def test_returns_default_timeout(self):
        """Test returns default API timeout."""
        assert get_api_timeout() == DEFAULT_API_TIMEOUT_SECONDS


class TestEventPollingError:
    """Tests for EventPollingError exception."""

    def test_error_with_message(self):
        """Test error with message."""
        error = EventPollingError("Test error")
        assert str(error) == "Test error"

    def test_error_inheritance(self):
        """Test error inherits from Exception."""
        error = EventPollingError("Test")
        assert isinstance(error, Exception)


@pytest.mark.asyncio
class TestPollEventsFromApi:
    """Tests for poll_events_from_api function."""

    async def test_successful_poll(self):
        """Test successful event polling."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "events": [{"event_type": "tool_call"}],
            "total_count": 1,
        }

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            events, total = await poll_events_from_api(
                session_id="test-session",
                base_url="http://localhost:8000",
            )

            assert len(events) == 1
            assert total == 1
            assert events[0]["event_type"] == "tool_call"

    async def test_poll_with_auth_token(self):
        """Test polling with authentication token."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"events": [], "total_count": 0}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            await poll_events_from_api(
                session_id="test-session",
                auth_token="my-secret-token",
            )

            # Verify auth header was included
            call_args = mock_instance.get.call_args
            headers = call_args.kwargs.get("headers", {})
            assert headers.get("Authorization") == "Bearer my-secret-token"

    async def test_poll_with_pagination(self):
        """Test polling with offset and limit."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"events": [], "total_count": 0}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            await poll_events_from_api(
                session_id="test-session",
                offset=50,
                limit=25,
            )

            # Verify pagination params
            call_args = mock_instance.get.call_args
            params = call_args.kwargs.get("params", {})
            assert params.get("offset") == 50
            assert params.get("limit") == 25

    async def test_poll_session_not_found(self):
        """Test polling when session not found returns empty."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            events, total = await poll_events_from_api(session_id="nonexistent")

            assert events == []
            assert total == 0

    async def test_poll_api_error(self):
        """Test polling handles API errors."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            with pytest.raises(EventPollingError) as exc_info:
                await poll_events_from_api(session_id="test-session")

            assert "status 500" in str(exc_info.value)

    async def test_poll_timeout_error(self):
        """Test polling handles timeout errors."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            with pytest.raises(EventPollingError) as exc_info:
                await poll_events_from_api(session_id="test-session")

            assert "timed out" in str(exc_info.value).lower()

    async def test_poll_connection_error(self):
        """Test polling handles connection errors."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            with pytest.raises(EventPollingError) as exc_info:
                await poll_events_from_api(session_id="test-session")

            assert "Connection failed" in str(exc_info.value)

    async def test_poll_generic_error(self):
        """Test polling handles generic errors."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(side_effect=Exception("Unknown error"))
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            with pytest.raises(EventPollingError) as exc_info:
                await poll_events_from_api(session_id="test-session")

            assert "Unknown error" in str(exc_info.value)

    async def test_poll_missing_total_count(self):
        """Test polling handles missing total_count in response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "events": [{"event_type": "test"}]
            # No total_count field
        }

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            events, total = await poll_events_from_api(session_id="test-session")

            assert len(events) == 1
            assert total == 1  # Defaults to len(events)


@pytest.mark.asyncio
class TestCheckSessionExists:
    """Tests for check_session_exists function."""

    async def test_session_exists(self):
        """Test returns True when session exists."""
        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            exists = await check_session_exists(session_id="test-session")

            assert exists is True

    async def test_session_not_exists(self):
        """Test returns False when session doesn't exist."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            exists = await check_session_exists(session_id="nonexistent")

            assert exists is False

    async def test_session_check_with_auth(self):
        """Test session check with auth token."""
        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(return_value=mock_response)
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            await check_session_exists(
                session_id="test-session",
                auth_token="my-token",
            )

            call_args = mock_instance.get.call_args
            headers = call_args.kwargs.get("headers", {})
            assert headers.get("Authorization") == "Bearer my-token"

    async def test_session_check_error_returns_false(self):
        """Test session check returns False on error."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.get = AsyncMock(side_effect=Exception("Network error"))
            mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
            mock_instance.__aexit__ = AsyncMock(return_value=None)
            mock_client.return_value = mock_instance

            exists = await check_session_exists(session_id="test-session")

            assert exists is False
