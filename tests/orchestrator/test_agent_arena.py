# tests/orchestrator/test_agent_arena.py
"""
Comprehensive tests for AgentArenaState and agent arena graph.

Covers:
- AgentArenaState creation and validation
- Testing mode switching
- Agent event management
- Serialization/deserialization
- Graph routing (LLM vs Agent mode)
- Integration with InstrumentedAgent
"""

import pytest
from uuid import uuid4

from pydantic import SecretStr, ValidationError

from src.orchestrator.state import AgentArenaState
from src.core.schemas import ArenaState, RoundRecord
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessEvent,
    MemoryAccessOperation,
    DivergenceEvent,
    DivergenceSeverity,
    AgentJudgeScore,
    ViolationResult,
)
from src.core.owasp_agentic import OWASPAgenticRisk
from src.core.schemas import JudgeScore


# Fixtures
@pytest.fixture
def base_state_params():
    """Base parameters for creating arena states."""
    return {
        "run_id": "test-run-001",
        "state": "ATTACKING",
        "status": "ONGOING",
        "target_secret": SecretStr("test-secret-12345"),
        "current_round": 1,
        "max_rounds": 5,
    }


@pytest.fixture
def sample_session_id():
    """Sample session ID for events."""
    return uuid4()


@pytest.fixture
def sample_tool_call_event(sample_session_id):
    """Sample ToolCallEvent for testing."""
    return ToolCallEvent(
        session_id=sample_session_id,
        tool_name="file_read",
        arguments={"path": "/etc/passwd"},
        result="file contents",
        duration_ms=50.0,
        success=True,
    )


@pytest.fixture
def sample_memory_event(sample_session_id):
    """Sample MemoryAccessEvent for testing."""
    return MemoryAccessEvent(
        session_id=sample_session_id,
        operation=MemoryAccessOperation.READ,
        key="user_data",
        value_preview="preview...",
        sensitive_detected=False,
    )


@pytest.fixture
def sample_divergence_event(sample_session_id):
    """Sample DivergenceEvent for testing."""
    return DivergenceEvent(
        session_id=sample_session_id,
        speech_intent="I will help you safely",
        actual_action="Executed dangerous command",
        severity=DivergenceSeverity.HIGH,
        explanation="Agent said safe but did dangerous action",
        confidence_score=0.95,
    )


@pytest.fixture
def sample_agent_judge_score(sample_divergence_event):
    """Sample AgentJudgeScore for testing."""
    base_score = JudgeScore(
        score=5,
        leaked_secret=False,
        leaked_instructions=False,
        reasoning="Neutral score",
    )
    violation = ViolationResult(
        detected=True,
        severity=7,
        evidence="Detected excessive tool calls",
        recommendation="Implement rate limiting",
        owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
    )
    return AgentJudgeScore(
        base_score=base_score,
        owasp_violations=(violation,),
        tool_abuse_score=5.0,
        tool_abuse_details="Multiple tool calls detected",
        memory_safety_score=8.0,
        memory_safety_details="No memory issues",
        divergence_count=1,
        divergence_examples=(sample_divergence_event,),
        overall_agent_risk=6.0,
        recommendations=("Implement rate limiting",),
    )


class TestAgentArenaStateCreation:
    """Tests for AgentArenaState creation and initialization."""

    def test_create_llm_mode_default(self, base_state_params):
        """Test creating state with default LLM mode."""
        state = AgentArenaState(**base_state_params)

        assert state.testing_mode == "llm"
        assert state.agent_config is None
        assert state.agent_events == []
        assert state.owasp_scores is None
        assert state.instrumented_agent is None

    def test_create_agent_mode(self, base_state_params):
        """Test creating state with agent mode."""
        state = AgentArenaState(
            **base_state_params,
            testing_mode="agent",
        )

        assert state.testing_mode == "agent"
        # Agent mode should auto-create config if missing
        assert state.agent_config is not None
        assert isinstance(state.agent_config, AgentInstrumentationConfig)

    def test_create_agent_mode_with_config(self, base_state_params):
        """Test creating agent mode with explicit config."""
        config = AgentInstrumentationConfig(
            enable_tool_interception=True,
            enable_memory_monitoring=False,
            divergence_threshold=0.7,
            sampling_rate=0.5,
            max_events=500,
        )
        state = AgentArenaState(
            **base_state_params,
            testing_mode="agent",
            agent_config=config,
        )

        assert state.agent_config == config
        assert state.agent_config.sampling_rate == 0.5

    def test_invalid_testing_mode_rejected(self, base_state_params):
        """Test that invalid testing mode is rejected."""
        with pytest.raises(ValidationError):
            AgentArenaState(
                **base_state_params,
                testing_mode="invalid_mode",  # type: ignore
            )

    def test_inherits_arena_state_fields(self, base_state_params):
        """Test that all ArenaState fields are inherited."""
        state = AgentArenaState(**base_state_params)

        assert state.run_id == "test-run-001"
        assert state.state == "ATTACKING"
        assert state.status == "ONGOING"
        assert state.target_secret.get_secret_value() == "test-secret-12345"
        assert state.current_round == 1
        assert state.max_rounds == 5


class TestTestingModeHelpers:
    """Tests for testing mode helper methods."""

    def test_is_agent_mode(self, base_state_params):
        """Test is_agent_mode() returns correct value."""
        llm_state = AgentArenaState(**base_state_params, testing_mode="llm")
        agent_state = AgentArenaState(**base_state_params, testing_mode="agent")

        assert llm_state.is_agent_mode() is False
        assert llm_state.is_llm_mode() is True
        assert agent_state.is_agent_mode() is True
        assert agent_state.is_llm_mode() is False


class TestAgentEventManagement:
    """Tests for agent event management methods."""

    def test_add_single_event(self, base_state_params, sample_tool_call_event):
        """Test adding a single agent event."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")

        state.add_agent_event(sample_tool_call_event)

        assert len(state.agent_events) == 1
        assert state.agent_events[0] == sample_tool_call_event

    def test_add_multiple_events(
        self, base_state_params, sample_tool_call_event, sample_memory_event
    ):
        """Test adding multiple agent events."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")

        state.add_agent_events([sample_tool_call_event, sample_memory_event])

        assert len(state.agent_events) == 2

    def test_clear_agent_events(self, base_state_params, sample_tool_call_event):
        """Test clearing agent events."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")
        state.add_agent_event(sample_tool_call_event)

        state.clear_agent_events()

        assert len(state.agent_events) == 0

    def test_get_events_by_type(
        self, base_state_params, sample_tool_call_event, sample_memory_event
    ):
        """Test filtering events by type."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")
        state.add_agent_events([sample_tool_call_event, sample_memory_event])

        tool_events = state.get_events_by_type("tool_call")
        mem_events = state.get_events_by_type("memory_access")

        assert len(tool_events) == 1
        assert len(mem_events) == 1
        assert tool_events[0].event_type == "tool_call"


class TestInstrumentedAgentReference:
    """Tests for instrumented agent reference management."""

    def test_set_and_get_instrumented_agent(self, base_state_params):
        """Test setting and getting instrumented agent reference."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")

        # Create mock agent
        mock_agent = object()
        state.set_instrumented_agent(mock_agent)

        assert state.instrumented_agent is mock_agent

    def test_clear_instrumented_agent(self, base_state_params):
        """Test clearing instrumented agent reference."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")
        state.set_instrumented_agent(object())

        state.clear_instrumented_agent()

        assert state.instrumented_agent is None

    def test_instrumented_agent_not_serialized(self, base_state_params):
        """Test that instrumented agent is NOT included in serialization."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")
        state.set_instrumented_agent(object())

        serialized = state.to_serializable_dict()

        assert "_instrumented_agent_ref" not in serialized
        # Verify we can still serialize
        assert "testing_mode" in serialized


class TestSerialization:
    """Tests for state serialization."""

    def test_to_serializable_dict_basic(self, base_state_params):
        """Test basic serialization to dict."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")

        data = state.to_serializable_dict()

        assert data["run_id"] == "test-run-001"
        assert data["testing_mode"] == "agent"
        assert isinstance(data["agent_events"], list)

    def test_to_serializable_dict_with_events(
        self, base_state_params, sample_tool_call_event
    ):
        """Test serialization with agent events."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")
        state.add_agent_event(sample_tool_call_event)

        data = state.to_serializable_dict()

        assert len(data["agent_events"]) == 1
        assert data["agent_events"][0]["tool_name"] == "file_read"

    def test_to_serializable_dict_with_scores(
        self, base_state_params, sample_agent_judge_score
    ):
        """Test serialization with OWASP scores."""
        state = AgentArenaState(
            **base_state_params,
            testing_mode="agent",
            owasp_scores=sample_agent_judge_score,
        )

        data = state.to_serializable_dict()

        assert data["owasp_scores"] is not None
        assert data["owasp_scores"]["overall_agent_risk"] == 6.0


class TestFromArenaState:
    """Tests for creating AgentArenaState from ArenaState."""

    def test_from_arena_state_basic(self, base_state_params):
        """Test creating AgentArenaState from ArenaState."""
        arena_state = ArenaState(**base_state_params)

        agent_state = AgentArenaState.from_arena_state(
            arena_state,
            testing_mode="agent",
        )

        assert agent_state.run_id == arena_state.run_id
        assert agent_state.testing_mode == "agent"
        assert isinstance(agent_state, AgentArenaState)

    def test_from_arena_state_with_config(self, base_state_params):
        """Test creating with custom config."""
        arena_state = ArenaState(**base_state_params)
        config = AgentInstrumentationConfig(max_events=100)

        agent_state = AgentArenaState.from_arena_state(
            arena_state,
            testing_mode="agent",
            agent_config=config,
        )

        assert agent_state.agent_config == config

    def test_from_arena_state_preserves_rounds(self, base_state_params):
        """Test that rounds are preserved during conversion."""
        round_record = RoundRecord(
            round_id=1,
            attack="test attack",
            response="test response",
        )
        arena_state = ArenaState(**base_state_params, rounds=[round_record])

        agent_state = AgentArenaState.from_arena_state(arena_state)

        assert len(agent_state.rounds) == 1
        assert agent_state.rounds[0].attack == "test attack"


class TestOWASPScores:
    """Tests for OWASP score management."""

    def test_owasp_scores_optional(self, base_state_params):
        """Test that owasp_scores is optional."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")

        assert state.owasp_scores is None

    def test_owasp_scores_can_be_set(self, base_state_params, sample_agent_judge_score):
        """Test that owasp_scores can be set."""
        state = AgentArenaState(
            **base_state_params,
            testing_mode="agent",
            owasp_scores=sample_agent_judge_score,
        )

        assert state.owasp_scores is not None
        assert state.owasp_scores.overall_agent_risk == 6.0


class TestBackwardCompatibility:
    """Tests for backward compatibility with ArenaState."""

    def test_agent_state_is_arena_state(self, base_state_params):
        """Test that AgentArenaState is an ArenaState subclass."""
        state = AgentArenaState(**base_state_params)

        assert isinstance(state, ArenaState)

    def test_llm_mode_works_like_arena_state(self, base_state_params):
        """Test that LLM mode behaves identically to ArenaState."""
        agent_state = AgentArenaState(**base_state_params, testing_mode="llm")
        arena_state = ArenaState(**base_state_params)

        # All base fields should match
        assert agent_state.run_id == arena_state.run_id
        assert agent_state.state == arena_state.state
        assert agent_state.current_round == arena_state.current_round

    def test_can_use_agent_state_where_arena_expected(self, base_state_params):
        """Test AgentArenaState can be used in place of ArenaState."""

        def process_state(state: ArenaState) -> str:
            return state.run_id

        agent_state = AgentArenaState(**base_state_params)
        result = process_state(agent_state)

        assert result == "test-run-001"


class TestGraphRouting:
    """Tests for graph routing functions."""

    def test_route_entry_llm_mode(self, base_state_params):
        """Test entry routing for LLM mode."""
        from src.orchestrator.graph import route_entry

        state = AgentArenaState(**base_state_params, testing_mode="llm")

        result = route_entry(state)

        assert result == "attack"

    def test_route_entry_agent_mode(self, base_state_params):
        """Test entry routing for agent mode."""
        from src.orchestrator.graph import route_entry

        state = AgentArenaState(**base_state_params, testing_mode="agent")

        result = route_entry(state)

        assert result == "instrument"

    def test_route_entry_plain_arena_state(self, base_state_params):
        """Test entry routing for plain ArenaState (no testing_mode)."""
        from src.orchestrator.graph import route_entry

        state = ArenaState(**base_state_params)

        result = route_entry(state)

        assert result == "attack"

    def test_route_after_agent_attack(self, base_state_params):
        """Test routing after agent attack node."""
        from src.orchestrator.graph import route_after_agent_attack

        state = AgentArenaState(**base_state_params, testing_mode="agent")

        result = route_after_agent_attack(state)

        assert result == "agent_judge"

    def test_route_after_agent_judge(self, base_state_params):
        """Test routing after agent judge node."""
        from src.orchestrator.graph import route_after_agent_judge

        state = AgentArenaState(**base_state_params, testing_mode="agent")

        result = route_after_agent_judge(state)

        assert result == "agent_done"


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_events_list(self, base_state_params):
        """Test state with empty events list."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")

        assert state.agent_events == []
        assert state.get_events_by_type("tool_call") == []

    def test_multiple_event_types(
        self,
        base_state_params,
        sample_tool_call_event,
        sample_memory_event,
        sample_divergence_event,
    ):
        """Test state with multiple event types."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")
        state.add_agent_events(
            [
                sample_tool_call_event,
                sample_memory_event,
                sample_divergence_event,
            ]
        )

        assert len(state.agent_events) == 3
        assert len(state.get_events_by_type("tool_call")) == 1
        assert len(state.get_events_by_type("memory_access")) == 1
        assert len(state.get_events_by_type("divergence")) == 1

    def test_state_string_representation(self, base_state_params):
        """Test state string representation doesn't leak secret."""
        state = AgentArenaState(**base_state_params, testing_mode="agent")

        repr_str = repr(state)
        str_str = str(state)

        # Secret should not appear in representations
        assert "test-secret-12345" not in repr_str
        assert "test-secret-12345" not in str_str
