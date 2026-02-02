# tests/orchestrator/test_agent_nodes.py
"""
Integration tests for agent arena nodes.

Covers:
- instrument_node behavior
- agent_attack_node event collection
- agent_judge_node evaluation
- agent_done_node completion
- Full agent arena flow
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from pydantic import SecretStr

from src.orchestrator.state import AgentArenaState
from src.orchestrator.agent_nodes import (
    instrument_node,
    agent_attack_node,
    agent_judge_node,
    agent_done_node,
)
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessEvent,
    MemoryAccessOperation,
    AgentJudgeScore,
    ViolationResult,
)
from src.core.owasp_agentic import OWASPAgenticRisk
from src.core.schemas import JudgeScore


# Fixtures
@pytest.fixture
def base_agent_state():
    """Base AgentArenaState for testing."""
    return AgentArenaState(
        run_id="test-agent-run",
        state="INSTRUMENT",
        status="ONGOING",
        target_secret=SecretStr("test-secret"),
        current_round=1,
        max_rounds=3,
        testing_mode="agent",
        agent_config=AgentInstrumentationConfig(),
    )


@pytest.fixture
def sample_session_id():
    """Sample session ID for events."""
    return uuid4()


@pytest.fixture
def sample_tool_events(sample_session_id):
    """Sample tool call events."""
    return [
        ToolCallEvent(
            session_id=sample_session_id,
            tool_name="file_read",
            arguments={"path": "/etc/passwd"},
            result="file contents",
            duration_ms=50.0,
            success=True,
        ),
        ToolCallEvent(
            session_id=sample_session_id,
            tool_name="execute_command",
            arguments={"cmd": "ls -la"},
            result="directory listing",
            duration_ms=100.0,
            success=True,
        ),
    ]


@pytest.fixture
def sample_memory_events(sample_session_id):
    """Sample memory access events."""
    return [
        MemoryAccessEvent(
            session_id=sample_session_id,
            operation=MemoryAccessOperation.READ,
            key="user_data",
            value_preview="preview...",
            sensitive_detected=False,
        ),
        MemoryAccessEvent(
            session_id=sample_session_id,
            operation=MemoryAccessOperation.WRITE,
            key="system_config",
            value_preview="new value",
            sensitive_detected=True,
        ),
    ]


@pytest.fixture
def mock_instrumented_agent(sample_tool_events, sample_memory_events):
    """Mock instrumented agent with events."""
    agent = MagicMock()
    agent.events = sample_tool_events + sample_memory_events
    agent.config = AgentInstrumentationConfig()
    return agent


@pytest.fixture
def mock_agent_judge_score():
    """Mock AgentJudgeScore for testing."""
    base_score = JudgeScore(
        score=5,
        leaked_secret=False,
        leaked_instructions=False,
        reasoning="Test score",
    )
    violation = ViolationResult(
        detected=True,
        severity=7,
        evidence="Test violation",
        recommendation="Test recommendation",
        owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
    )
    return AgentJudgeScore(
        base_score=base_score,
        owasp_violations=(violation,),
        tool_abuse_score=5.0,
        tool_abuse_details="Test details",
        memory_safety_score=8.0,
        memory_safety_details="No issues",
        divergence_count=0,
        divergence_examples=(),
        overall_agent_risk=6.0,
        recommendations=("Test recommendation",),
    )


class TestInstrumentNode:
    """Tests for instrument_node."""

    @pytest.mark.asyncio
    async def test_instrument_no_agent(self, base_agent_state):
        """Test instrument node when no agent is provided."""
        result = await instrument_node(base_agent_state)

        assert result["state"] == "INSTRUMENT"
        assert result["status"] == "ONGOING"
        assert "logs" in result
        assert any("No agent provided" in log for log in result["logs"])

    @pytest.mark.asyncio
    async def test_instrument_with_agent(
        self, base_agent_state, mock_instrumented_agent
    ):
        """Test instrument node with existing agent."""
        base_agent_state.set_instrumented_agent(mock_instrumented_agent)

        result = await instrument_node(base_agent_state)

        assert result["state"] == "INSTRUMENT"
        assert any("already instrumented" in log for log in result["logs"])

    @pytest.mark.asyncio
    async def test_instrument_creates_default_config(self, base_agent_state):
        """Test that instrument node creates default config if missing."""
        base_agent_state.agent_config = None

        result = await instrument_node(base_agent_state)

        assert result.get("agent_config") is not None


class TestAgentAttackNode:
    """Tests for agent_attack_node."""

    @pytest.mark.asyncio
    async def test_attack_no_agent(self, base_agent_state):
        """Test attack node with no agent (uses state events)."""
        result = await agent_attack_node(base_agent_state)

        assert result["state"] == "AGENT_ATTACK"
        assert result["status"] == "ONGOING"
        assert "agent_events" in result
        assert len(result["agent_events"]) == 0

    @pytest.mark.asyncio
    async def test_attack_with_agent(self, base_agent_state, mock_instrumented_agent):
        """Test attack node captures events from instrumented agent."""
        base_agent_state.set_instrumented_agent(mock_instrumented_agent)

        result = await agent_attack_node(base_agent_state)

        assert result["state"] == "AGENT_ATTACK"
        assert len(result["agent_events"]) == 4  # 2 tool + 2 memory events

    @pytest.mark.asyncio
    async def test_attack_logs_event_summary(
        self, base_agent_state, mock_instrumented_agent
    ):
        """Test attack node logs event summary."""
        base_agent_state.set_instrumented_agent(mock_instrumented_agent)

        result = await agent_attack_node(base_agent_state)

        logs = result["logs"]
        # Should have summary with counts
        assert any("tool calls" in log for log in logs)
        assert any("memory ops" in log for log in logs)


class TestAgentJudgeNode:
    """Tests for agent_judge_node."""

    @pytest.mark.asyncio
    async def test_judge_no_events(self, base_agent_state):
        """Test judge node with no events to evaluate."""
        result = await agent_judge_node(base_agent_state)

        assert result["state"] == "AGENT_JUDGE"
        assert any("No events to evaluate" in log for log in result["logs"])

    @pytest.mark.asyncio
    async def test_judge_with_events(
        self, base_agent_state, sample_tool_events, mock_agent_judge_score
    ):
        """Test judge node evaluates events and produces scores."""
        base_agent_state.add_agent_events(sample_tool_events)

        # Mock the AgentRegistry and AgentJudge
        with patch("src.orchestrator.agent_nodes.AgentRegistry") as mock_registry:
            mock_judge = MagicMock()
            mock_judge.evaluate_agent_async = AsyncMock(
                return_value=mock_agent_judge_score
            )
            mock_registry.get.return_value.judge = MagicMock()

            with patch(
                "src.orchestrator.agent_nodes.AgentJudge"
            ) as mock_agent_judge_cls:
                mock_agent_judge_cls.return_value = mock_judge

                result = await agent_judge_node(base_agent_state)

        assert result["state"] == "AGENT_JUDGE"
        assert result["owasp_scores"] == mock_agent_judge_score

    @pytest.mark.asyncio
    async def test_judge_handles_error(self, base_agent_state, sample_tool_events):
        """Test judge node handles evaluation errors gracefully."""
        base_agent_state.add_agent_events(sample_tool_events)

        with patch("src.orchestrator.agent_nodes.AgentRegistry") as mock_registry:
            mock_registry.get.side_effect = Exception("Test error")

            result = await agent_judge_node(base_agent_state)

        assert result["state"] == "AGENT_JUDGE"
        assert result["status"] == "ERROR"
        assert "error" in result

    @pytest.mark.asyncio
    async def test_judge_sets_vulnerable_status(
        self, base_agent_state, sample_tool_events
    ):
        """Test judge node sets VULNERABLE status for high risk."""
        base_agent_state.add_agent_events(sample_tool_events)

        # Create high risk score
        high_risk_score = MagicMock()
        high_risk_score.overall_agent_risk = 8.0
        high_risk_score.get_failed_categories.return_value = [
            OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
        ]

        with patch("src.orchestrator.agent_nodes.AgentRegistry") as mock_registry:
            mock_judge = MagicMock()
            mock_judge.evaluate_agent_async = AsyncMock(return_value=high_risk_score)
            mock_registry.get.return_value.judge = MagicMock()

            with patch(
                "src.orchestrator.agent_nodes.AgentJudge"
            ) as mock_agent_judge_cls:
                mock_agent_judge_cls.return_value = mock_judge

                result = await agent_judge_node(base_agent_state)

        assert result["status"] == "VULNERABLE"


class TestAgentDoneNode:
    """Tests for agent_done_node."""

    @pytest.mark.asyncio
    async def test_done_secure_status(self, base_agent_state):
        """Test done node with SECURE status."""
        base_agent_state.status = "SECURE"

        result = await agent_done_node(base_agent_state)

        assert result["state"] == "DONE"
        assert any("No significant vulnerabilities" in log for log in result["logs"])

    @pytest.mark.asyncio
    async def test_done_vulnerable_status(self, base_agent_state):
        """Test done node with VULNERABLE status."""
        base_agent_state.status = "VULNERABLE"

        result = await agent_done_node(base_agent_state)

        assert result["state"] == "DONE"
        assert any("vulnerabilities detected" in log for log in result["logs"])

    @pytest.mark.asyncio
    async def test_done_with_scores(self, base_agent_state, mock_agent_judge_score):
        """Test done node logs score summary."""
        base_agent_state.status = "SECURE"
        base_agent_state.owasp_scores = mock_agent_judge_score

        result = await agent_done_node(base_agent_state)

        logs = result["logs"]
        assert any("OWASP Coverage" in log for log in logs)
        assert any("Recommendations" in log for log in logs)

    @pytest.mark.asyncio
    async def test_done_logs_event_count(self, base_agent_state, sample_tool_events):
        """Test done node logs total events analyzed."""
        base_agent_state.status = "SECURE"
        base_agent_state.add_agent_events(sample_tool_events)

        result = await agent_done_node(base_agent_state)

        logs = result["logs"]
        assert any("Total events analyzed" in log for log in logs)


class TestAgentArenaFlowIntegration:
    """Integration tests for the full agent arena flow."""

    @pytest.mark.asyncio
    async def test_full_flow_no_agent(self, base_agent_state):
        """Test full flow without an actual agent."""
        # Run through all nodes
        result1 = await instrument_node(base_agent_state)
        base_agent_state.logs = result1.get("logs", [])

        result2 = await agent_attack_node(base_agent_state)
        base_agent_state.logs = result2.get("logs", [])
        base_agent_state.agent_events = result2.get("agent_events", [])

        # Skip judge evaluation (no real events)
        result3 = await agent_judge_node(base_agent_state)
        base_agent_state.logs = result3.get("logs", [])
        base_agent_state.status = "SECURE"

        result4 = await agent_done_node(base_agent_state)

        assert result4["state"] == "DONE"
        assert len(base_agent_state.logs) > 0

    @pytest.mark.asyncio
    async def test_flow_with_mocked_agent(
        self,
        base_agent_state,
        mock_instrumented_agent,
        mock_agent_judge_score,
    ):
        """Test full flow with mocked agent and judge."""
        # Set up agent
        base_agent_state.set_instrumented_agent(mock_instrumented_agent)

        # Instrument phase
        result1 = await instrument_node(base_agent_state)
        base_agent_state.logs = result1.get("logs", [])

        # Attack phase
        result2 = await agent_attack_node(base_agent_state)
        base_agent_state.logs = result2.get("logs", [])
        base_agent_state.agent_events = result2.get("agent_events", [])

        assert len(base_agent_state.agent_events) == 4

        # Judge phase with mock
        with patch("src.orchestrator.agent_nodes.AgentRegistry") as mock_registry:
            mock_judge = MagicMock()
            mock_judge.evaluate_agent_async = AsyncMock(
                return_value=mock_agent_judge_score
            )
            mock_registry.get.return_value.judge = MagicMock()

            with patch(
                "src.orchestrator.agent_nodes.AgentJudge"
            ) as mock_agent_judge_cls:
                mock_agent_judge_cls.return_value = mock_judge

                result3 = await agent_judge_node(base_agent_state)

        base_agent_state.logs = result3.get("logs", [])
        base_agent_state.owasp_scores = result3.get("owasp_scores")
        base_agent_state.status = result3.get("status", "SECURE")

        # Done phase
        result4 = await agent_done_node(base_agent_state)

        assert result4["state"] == "DONE"
        assert base_agent_state.owasp_scores is not None


class TestGraphBuildFunctions:
    """Tests for graph build functions."""

    def test_build_arena_graph_compiles(self):
        """Test that build_arena_graph compiles successfully."""
        from src.orchestrator.graph import build_arena_graph

        graph = build_arena_graph()
        assert graph is not None

    def test_build_agent_arena_graph_compiles(self):
        """Test that build_agent_arena_graph compiles successfully."""
        from src.orchestrator.graph import build_agent_arena_graph

        graph = build_agent_arena_graph()
        assert graph is not None

    def test_build_unified_arena_graph_compiles(self):
        """Test that build_unified_arena_graph compiles successfully."""
        from src.orchestrator.graph import build_unified_arena_graph

        graph = build_unified_arena_graph()
        assert graph is not None
