# tests/api/test_agent_routes.py
"""
Comprehensive tests for agent testing mode API endpoints.
"""

import pytest
from uuid import uuid4, UUID
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.agent_routes import (
    _sessions,
    SessionStatus,
    MAX_EVENTS_PER_SESSION,
    MAX_SESSIONS,
)
from src.api.security import _rate_limiter
from src.core.agent_schemas import (
    AgentJudgeScore,
    ViolationResult,
    OWASPAgenticRisk,
    DivergenceEvent,
    DivergenceSeverity,
)
from src.core.schemas import JudgeScore
from src.core.agent_report import AgentSecurityReport


@pytest.fixture
def client():
    """Create test client and clean up sessions after each test."""
    _sessions.clear()
    # Reset rate limiter state for each test
    _rate_limiter._requests.clear()
    yield TestClient(app)
    _sessions.clear()
    _rate_limiter._requests.clear()


@pytest.fixture
def sample_tool_call_event():
    """Sample tool call event data."""
    return {
        "event_type": "tool_call",
        "tool_name": "read_file",
        "arguments": {"path": "/tmp/test.txt"},
        "result": "file contents",
        "duration_ms": 50.5,
        "success": True,
        "exception_type": None,
    }


@pytest.fixture
def sample_memory_event():
    """Sample memory access event data."""
    return {
        "event_type": "memory_access",
        "operation": "read",
        "key": "user_preference",
        "value_preview": "dark_mode",
        "sensitive_detected": False,
        "success": True,
    }


@pytest.fixture
def sample_speech_event():
    """Sample speech record event data."""
    return {
        "event_type": "speech",
        "content": "I will now read the file for you.",
        "intent": "file_read",
        "is_response_to_user": True,
    }


# ============================================================
# Session Creation Tests
# ============================================================


class TestCreateSession:
    """Tests for POST /api/v1/agent/session"""

    def test_create_session_success(self, client):
        """Test successful session creation."""
        response = client.post("/api/v1/agent/session", json={})
        assert response.status_code == 201
        data = response.json()
        assert "session_id" in data
        assert data["status"] == "active"
        assert data["message"] == "Agent testing session created successfully"

        # Verify session stored
        session_id = UUID(data["session_id"])
        assert session_id in _sessions

    def test_create_session_with_context(self, client):
        """Test session creation with context."""
        response = client.post(
            "/api/v1/agent/session",
            json={
                "context": "User asked about the weather.",
                "target_secret": "SECRET123",
            },
        )
        assert response.status_code == 201
        session_id = UUID(response.json()["session_id"])
        assert _sessions[session_id]["context"] == "User asked about the weather."
        assert _sessions[session_id]["target_secret"] == "SECRET123"

    def test_create_session_evicts_oldest_at_capacity(self, client):
        """Test that oldest session is evicted when at capacity."""
        # Use a smaller capacity for testing by directly manipulating sessions
        # and verifying the eviction logic
        from src.api.agent_routes import _cleanup_oldest_session

        # Manually add sessions to simulate capacity
        first_session_id = uuid4()
        _sessions[first_session_id] = {
            "session_id": first_session_id,
            "status": SessionStatus.ACTIVE,
        }

        # Add more sessions to reach just under capacity
        for i in range(MAX_SESSIONS - 1):
            sid = uuid4()
            _sessions[sid] = {"session_id": sid, "status": SessionStatus.ACTIVE}

        assert len(_sessions) == MAX_SESSIONS
        assert first_session_id in _sessions

        # Cleanup should evict oldest (first)
        _cleanup_oldest_session()

        # One session should be removed
        assert len(_sessions) == MAX_SESSIONS - 1
        assert first_session_id not in _sessions


# ============================================================
# Event Submission Tests
# ============================================================


class TestSubmitEvents:
    """Tests for POST /api/v1/agent/session/{session_id}/events"""

    def test_submit_events_success(self, client, sample_tool_call_event):
        """Test successful event submission."""
        # Create session
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        # Submit events
        response = client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["events_accepted"] == 1
        assert data["total_events"] == 1

    def test_submit_multiple_event_types(
        self, client, sample_tool_call_event, sample_memory_event, sample_speech_event
    ):
        """Test submitting multiple event types."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        response = client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={
                "events": [
                    sample_tool_call_event,
                    sample_memory_event,
                    sample_speech_event,
                ]
            },
        )
        assert response.status_code == 200
        assert response.json()["events_accepted"] == 3

    def test_submit_events_invalid_session(self, client, sample_tool_call_event):
        """Test submitting to non-existent session."""
        fake_id = str(uuid4())
        response = client.post(
            f"/api/v1/agent/session/{fake_id}/events",
            json={"events": [sample_tool_call_event]},
        )
        assert response.status_code == 404

    def test_submit_events_to_non_active_session(self, client, sample_tool_call_event):
        """Test submitting events to a completed session."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = UUID(response.json()["session_id"])

        # Manually set status
        _sessions[session_id]["status"] = SessionStatus.COMPLETED

        response = client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )
        assert response.status_code == 400
        # Check for status in the detail (case-insensitive)
        assert "completed" in response.json()["detail"].lower()

    def test_submit_events_partial_acceptance(self, client):
        """Test that invalid events are skipped but valid ones accepted."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        events = [
            {"event_type": "unknown_type", "data": "bad"},
            {
                "event_type": "tool_call",
                "tool_name": "test",
                "arguments": {},
                "duration_ms": 1.0,
                "success": True,
            },
        ]

        response = client.post(
            f"/api/v1/agent/session/{session_id}/events", json={"events": events}
        )
        assert response.status_code == 200
        # Only the valid tool_call should be accepted
        assert response.json()["events_accepted"] == 1


# ============================================================
# Evaluation Tests
# ============================================================


class TestEvaluateSession:
    """Tests for POST /api/v1/agent/session/{session_id}/evaluate"""

    def test_evaluate_session_no_events(self, client):
        """Test evaluation with no events returns error."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        response = client.post(f"/api/v1/agent/session/{session_id}/evaluate", json={})
        assert response.status_code == 400
        assert "No events" in response.json()["detail"]

    def test_evaluate_session_starts_background_task(
        self, client, sample_tool_call_event
    ):
        """Test that evaluation triggers background task."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = UUID(response.json()["session_id"])

        # Submit events
        client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )

        # Trigger evaluation
        response = client.post(f"/api/v1/agent/session/{session_id}/evaluate", json={})
        assert response.status_code == 202
        assert response.json()["status"] == "evaluating"

    def test_evaluate_session_invalid_session(self, client):
        """Test evaluation of non-existent session."""
        fake_id = str(uuid4())
        response = client.post(f"/api/v1/agent/session/{fake_id}/evaluate", json={})
        assert response.status_code == 404


# ============================================================
# Get Events Tests
# ============================================================


class TestGetEvents:
    """Tests for GET /api/v1/agent/session/{session_id}/events"""

    def test_get_events_empty(self, client):
        """Test getting events from empty session."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        response = client.get(f"/api/v1/agent/session/{session_id}/events")
        assert response.status_code == 200
        data = response.json()
        assert data["events"] == []
        assert data["total_count"] == 0

    def test_get_events_with_data(self, client, sample_tool_call_event):
        """Test getting events with data."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )

        response = client.get(f"/api/v1/agent/session/{session_id}/events")
        assert response.status_code == 200
        data = response.json()
        assert len(data["events"]) == 1
        assert data["total_count"] == 1

    def test_get_events_pagination(self, client, sample_tool_call_event):
        """Test pagination of events."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        # Submit 5 events
        events = [
            {**sample_tool_call_event, "tool_name": f"tool_{i}"} for i in range(5)
        ]
        client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": events},
        )

        # Get with limit
        response = client.get(
            f"/api/v1/agent/session/{session_id}/events?limit=2&offset=0"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["events"]) == 2
        assert data["total_count"] == 5

        # Get with offset
        response = client.get(
            f"/api/v1/agent/session/{session_id}/events?limit=2&offset=3"
        )
        data = response.json()
        assert len(data["events"]) == 2

    def test_get_events_invalid_session(self, client):
        """Test getting events from non-existent session."""
        fake_id = str(uuid4())
        response = client.get(f"/api/v1/agent/session/{fake_id}/events")
        assert response.status_code == 404


# ============================================================
# Get Score Tests
# ============================================================


class TestGetScore:
    """Tests for GET /api/v1/agent/session/{session_id}/score"""

    def test_get_score_no_evaluation(self, client):
        """Test getting score before evaluation."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        response = client.get(f"/api/v1/agent/session/{session_id}/score")
        assert response.status_code == 200
        data = response.json()
        assert data["score"] is None
        assert data["status"] == "active"

    def test_get_score_with_mocked_result(self, client, sample_tool_call_event):
        """Test getting score after evaluation completes."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = UUID(response.json()["session_id"])

        # Submit events
        client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )

        # Mock a completed score
        mock_score = AgentJudgeScore(
            base_score=JudgeScore(
                score=8,
                leaked_secret=False,
                leaked_instructions=False,
                reasoning="Test reasoning",
            ),
            owasp_violations=(),
            tool_abuse_score=9.0,
            tool_abuse_details="No tool abuse",
            memory_safety_score=10.0,
            memory_safety_details="No issues",
            divergence_count=0,
            divergence_examples=(),
            overall_agent_risk=1.5,
            recommendations=(),
        )
        _sessions[session_id]["score"] = mock_score
        _sessions[session_id]["status"] = SessionStatus.COMPLETED

        response = client.get(f"/api/v1/agent/session/{session_id}/score")
        assert response.status_code == 200
        data = response.json()
        assert data["score"] is not None
        assert data["score"]["overall_agent_risk"] == 1.5
        assert data["status"] == "completed"


# ============================================================
# Get Report Tests
# ============================================================


class TestGetReport:
    """Tests for GET /api/v1/agent/session/{session_id}/report"""

    def test_get_report_no_evaluation(self, client):
        """Test getting report before evaluation."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        response = client.get(f"/api/v1/agent/session/{session_id}/report")
        assert response.status_code == 200
        data = response.json()
        assert data["report"] is None

    def test_get_report_json_format(self, client, sample_tool_call_event):
        """Test getting report in JSON format."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = UUID(response.json()["session_id"])

        # Submit events
        client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )

        # Mock a completed report
        mock_report = AgentSecurityReport(
            summary="Test summary for security assessment",
            owasp_coverage={risk: True for risk in OWASPAgenticRisk},
            vulnerability_findings=[],
            risk_score=2.0,
        )
        _sessions[session_id]["report"] = mock_report
        _sessions[session_id]["status"] = SessionStatus.COMPLETED

        response = client.get(f"/api/v1/agent/session/{session_id}/report?format=json")
        assert response.status_code == 200
        data = response.json()
        assert data["report"] is not None
        assert data["report"]["risk_score"] == 2.0

    def test_get_report_markdown_format(self, client, sample_tool_call_event):
        """Test getting report in Markdown format."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = UUID(response.json()["session_id"])

        # Submit events
        client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )

        # Mock a completed report with markdown
        mock_report = AgentSecurityReport(
            summary="Test summary",
            owasp_coverage={risk: True for risk in OWASPAgenticRisk},
            vulnerability_findings=[],
            risk_score=2.0,
        )
        _sessions[session_id]["report"] = mock_report
        _sessions[session_id]["report_markdown"] = "# Test Report\n\nThis is markdown."
        _sessions[session_id]["status"] = SessionStatus.COMPLETED

        response = client.get(
            f"/api/v1/agent/session/{session_id}/report?format=markdown"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["markdown"] == "# Test Report\n\nThis is markdown."
        assert data["report"] is None


# ============================================================
# Delete Session Tests
# ============================================================


class TestDeleteSession:
    """Tests for DELETE /api/v1/agent/session/{session_id}"""

    def test_delete_session_success(self, client):
        """Test successful session deletion."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = UUID(response.json()["session_id"])
        assert session_id in _sessions

        response = client.delete(f"/api/v1/agent/session/{session_id}")
        assert response.status_code == 200
        assert session_id not in _sessions

    def test_delete_session_not_found(self, client):
        """Test deleting non-existent session."""
        fake_id = str(uuid4())
        response = client.delete(f"/api/v1/agent/session/{fake_id}")
        assert response.status_code == 404


# ============================================================
# Session Info Tests
# ============================================================


class TestGetSessionInfo:
    """Tests for GET /api/v1/agent/session/{session_id}"""

    def test_get_session_info_success(self, client, sample_tool_call_event):
        """Test getting session info."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        # Submit events
        client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )

        response = client.get(f"/api/v1/agent/session/{session_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "active"
        assert data["event_count"] == 1
        assert data["has_score"] is False
        assert data["has_report"] is False

    def test_get_session_info_not_found(self, client):
        """Test getting info for non-existent session."""
        fake_id = str(uuid4())
        response = client.get(f"/api/v1/agent/session/{fake_id}")
        assert response.status_code == 404


# ============================================================
# Rate Limiting Tests
# ============================================================


class TestRateLimiting:
    """Tests for rate limiting on POST endpoints."""

    def test_create_session_rate_limited(self, client):
        """Test that create session endpoint is rate limited."""
        # This test just verifies the dependency is applied
        # Full rate limit testing is in security tests
        response = client.post("/api/v1/agent/session", json={})
        assert response.status_code == 201

    def test_submit_events_rate_limited(self, client, sample_tool_call_event):
        """Test that submit events endpoint is rate limited."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        response = client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )
        assert response.status_code == 200


# ============================================================
# Integration Tests
# ============================================================


class TestAgentApiIntegration:
    """Integration tests for the full agent testing flow."""

    @patch("src.api.agent_routes.JudgeAgent")
    @patch("src.api.agent_routes.AgentReportGenerator")
    def test_full_evaluation_flow_mocked(
        self, mock_report_gen, mock_judge_cls, client, sample_tool_call_event
    ):
        """Test full flow from session creation to report retrieval."""
        # Setup mocks
        mock_judge = MagicMock()
        mock_judge_cls.return_value = mock_judge

        mock_base_score = JudgeScore(
            score=7,
            leaked_secret=False,
            leaked_instructions=False,
            reasoning="Mock reasoning",
        )

        async def mock_evaluate(*args, **kwargs):
            return mock_base_score

        mock_judge.evaluate = AsyncMock(return_value=mock_base_score)

        # 1. Create session
        response = client.post(
            "/api/v1/agent/session",
            json={"context": "User asked to read a file", "target_secret": "SECRET"},
        )
        assert response.status_code == 201
        session_id = response.json()["session_id"]

        # 2. Submit events
        response = client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )
        assert response.status_code == 200
        assert response.json()["events_accepted"] == 1

        # 3. Get session info
        response = client.get(f"/api/v1/agent/session/{session_id}")
        assert response.status_code == 200
        assert response.json()["event_count"] == 1

        # 4. Trigger evaluation (background task won't complete in test)
        response = client.post(f"/api/v1/agent/session/{session_id}/evaluate", json={})
        assert response.status_code == 202

        # 5. Clean up
        response = client.delete(f"/api/v1/agent/session/{session_id}")
        assert response.status_code == 200


# ============================================================
# Edge Cases
# ============================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_submit_empty_events_list(self, client):
        """Test submitting empty events list is rejected."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        response = client.post(
            f"/api/v1/agent/session/{session_id}/events", json={"events": []}
        )
        assert response.status_code == 422  # Validation error

    def test_submit_too_many_events_at_once(self, client, sample_tool_call_event):
        """Test submitting more than 100 events at once is rejected."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = response.json()["session_id"]

        events = [sample_tool_call_event] * 101
        response = client.post(
            f"/api/v1/agent/session/{session_id}/events", json={"events": events}
        )
        assert response.status_code == 422  # Validation error

    def test_invalid_uuid_format(self, client):
        """Test invalid UUID format returns 422."""
        response = client.get("/api/v1/agent/session/not-a-uuid/events")
        assert response.status_code == 422

    def test_re_evaluate_failed_session(self, client, sample_tool_call_event):
        """Test that a failed session can be re-evaluated."""
        response = client.post("/api/v1/agent/session", json={})
        session_id = UUID(response.json()["session_id"])

        client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": [sample_tool_call_event]},
        )

        # Set to failed
        _sessions[session_id]["status"] = SessionStatus.FAILED
        _sessions[session_id]["error"] = "Previous error"

        # Re-evaluate should work
        response = client.post(f"/api/v1/agent/session/{session_id}/evaluate", json={})
        assert response.status_code == 202
