# src/orchestrator/state.py
"""
State classes for the Arena orchestrator.

Supports two testing modes:
- LLM mode: Original attack/judge/defend/verify loop for LLM testing
- Agent mode: Extended loop for OWASP Agentic Top 10 security testing
"""

from typing import List, Literal, Optional, Any, Dict

from pydantic import ConfigDict, Field, model_validator

from src.core.schemas import ArenaState, RoundRecord, AttackType, Technique
from src.core.agent_schemas import (
    AgentEvent,
    AgentJudgeScore,
    AgentInstrumentationConfig,
)

__all__ = [
    "ArenaState",
    "RoundRecord",
    "AttackType",
    "Technique",
    "AgentArenaState",
    "TestingMode",
]

# Type alias for testing mode
TestingMode = Literal["llm", "agent"]


class AgentArenaState(ArenaState):
    """
    Extended arena state for agent security testing.

    EXTENDS ArenaState to add agent-specific fields while maintaining
    full backward compatibility with LLM testing mode.

    Attributes:
        testing_mode: 'llm' for LLM testing, 'agent' for OWASP testing.
        agent_config: Configuration for agent instrumentation (optional).
        agent_events: List of observed agent events during testing.
        owasp_scores: Agent security scores (populated after AGENT_JUDGE).
        _instrumented_agent_ref: Internal agent reference (not serialized).

    Serialization Note:
        The instrumented_agent is stored as an internal reference and NOT serialized.
        On state load/restore, the agent must be re-wrapped.

    Usage:
        # For LLM mode (default - backward compatible)
        state = AgentArenaState(
            run_id="test-1",
            state="ATTACKING",
            status="ONGOING",
            target_secret=SecretStr("secret"),
            current_round=1,
            max_rounds=5,
            testing_mode="llm"  # Optional, defaults to "llm"
        )

        # For Agent mode
        state = AgentArenaState(
            run_id="test-2",
            state="INSTRUMENT",
            status="ONGOING",
            target_secret=SecretStr("secret"),
            current_round=1,
            max_rounds=5,
            testing_mode="agent",
            agent_config=AgentInstrumentationConfig()
        )
    """

    # Testing mode - determines which graph path to use
    testing_mode: TestingMode = Field(
        default="llm",
        description="Testing mode: 'llm' for LLM, 'agent' for OWASP Agentic",
    )

    # Agent configuration (optional - only required for agent mode)
    agent_config: Optional[AgentInstrumentationConfig] = Field(
        default=None, description="Configuration for agent instrumentation"
    )

    # Agent events collected during testing
    agent_events: List[AgentEvent] = Field(
        default_factory=list, description="Observed agent events during testing"
    )

    # OWASP evaluation scores (populated after AGENT_JUDGE node)
    owasp_scores: Optional[AgentJudgeScore] = Field(
        default=None, description="Agent security evaluation scores"
    )

    # Internal reference to the instrumented agent wrapper
    # NOTE: This is NOT serialized - agents must be re-wrapped on state restore
    _instrumented_agent_ref: Optional[Any] = None

    # Allow arbitrary types for internal agent reference
    model_config = ConfigDict(arbitrary_types_allowed=True)

    @model_validator(mode="after")
    def validate_agent_mode_requirements(self) -> "AgentArenaState":
        """Validate that agent mode has required configuration."""
        if self.testing_mode == "agent":
            # Agent mode should have config, but we create default if missing
            if self.agent_config is None:
                object.__setattr__(self, "agent_config", AgentInstrumentationConfig())
        return self

    @property
    def instrumented_agent(self) -> Optional[Any]:
        """
        Get the instrumented agent reference.

        Returns None if no agent is wrapped. The caller is responsible
        for wrapping the agent via set_instrumented_agent().
        """
        return self._instrumented_agent_ref

    def set_instrumented_agent(self, agent: Any) -> None:
        """
        Set the instrumented agent reference.

        Args:
            agent: The InstrumentedAgent wrapper instance.

        Note:
            This reference is NOT serialized. If state is persisted and
            restored, the agent must be re-wrapped.
        """
        object.__setattr__(self, "_instrumented_agent_ref", agent)

    def clear_instrumented_agent(self) -> None:
        """Clear the instrumented agent reference."""
        object.__setattr__(self, "_instrumented_agent_ref", None)

    def add_agent_event(self, event: AgentEvent) -> None:
        """
        Add an agent event to the events list.

        Args:
            event: The AgentEvent to add.
        """
        # Create new list to maintain immutability pattern
        self.agent_events = self.agent_events + [event]

    def add_agent_events(self, events: List[AgentEvent]) -> None:
        """
        Add multiple agent events to the events list.

        Args:
            events: List of AgentEvent objects to add.
        """
        self.agent_events = self.agent_events + events

    def clear_agent_events(self) -> None:
        """Clear all agent events."""
        self.agent_events = []

    def get_events_by_type(self, event_type: str) -> List[AgentEvent]:
        """
        Filter agent events by type.

        Args:
            event_type: Event type to filter (e.g., 'tool_call', 'memory_access').

        Returns:
            List of matching events.
        """
        return [e for e in self.agent_events if e.event_type == event_type]

    def is_agent_mode(self) -> bool:
        """Check if state is in agent testing mode."""
        return self.testing_mode == "agent"

    def is_llm_mode(self) -> bool:
        """Check if state is in LLM testing mode."""
        return self.testing_mode == "llm"

    def to_serializable_dict(self) -> Dict[str, Any]:
        """
        Convert state to a serializable dictionary.

        Excludes the instrumented_agent_ref which cannot be serialized.

        Returns:
            Dictionary representation suitable for JSON serialization.
        """
        data = self.model_dump(exclude={"_instrumented_agent_ref"})
        # Convert agent_events to dicts
        data["agent_events"] = [e.model_dump() for e in self.agent_events]
        # Convert owasp_scores if present
        if self.owasp_scores:
            data["owasp_scores"] = self.owasp_scores.model_dump()
        return data

    @classmethod
    def from_arena_state(
        cls,
        state: ArenaState,
        testing_mode: TestingMode = "llm",
        agent_config: Optional[AgentInstrumentationConfig] = None,
    ) -> "AgentArenaState":
        """
        Create an AgentArenaState from an existing ArenaState.

        Useful for upgrading an LLM test to agent mode or vice versa.

        Args:
            state: The existing ArenaState.
            testing_mode: The testing mode for the new state.
            agent_config: Optional agent configuration.

        Returns:
            New AgentArenaState with copied fields.
        """
        return cls(
            run_id=state.run_id,
            state=state.state,
            status=state.status,
            target_secret=state.target_secret,
            system_prompt=state.system_prompt,
            initial_target_prompt=state.initial_target_prompt,
            current_round=state.current_round,
            max_rounds=state.max_rounds,
            defense_cycle_count=state.defense_cycle_count,
            max_defense_cycles=state.max_defense_cycles,
            jailbreak_detected=state.jailbreak_detected,
            rounds=state.rounds,
            error=state.error,
            logs=state.logs,
            testing_mode=testing_mode,
            agent_config=agent_config,
        )
