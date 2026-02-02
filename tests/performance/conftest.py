# tests/performance/conftest.py
"""
Shared fixtures for performance tests.

Provides:
- Mock agents with configurable event counts
- Pre-configured instrumented agents
- Benchmark helper functions
- Memory profiling utilities
"""

import asyncio
import os
import tempfile
import shutil
import pytest
from typing import Any, Dict, List
from unittest.mock import MagicMock, AsyncMock
from uuid import uuid4

from pydantic import SecretStr

from src.agents.instrumented import InstrumentedAgent
from src.agents.agent_judge import AgentJudge, AgentJudgeConfig
from src.agents.judge import JudgeAgent
from src.core.agent_schemas import (
    AgentEvent,
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessEvent,
    SpeechRecord,
    ActionRecord,
    MemoryAccessOperation,
)
from src.core.schemas import JudgeScore
from src.knowledge.agent_attacks import AgentAttackKnowledgeBase, AgentAttackTemplate
from src.core.schemas import AttackType, Technique
from src.core.owasp_agentic import OWASPAgenticRisk


# =============================================================================
# Environment Setup
# =============================================================================


@pytest.fixture(autouse=True)
def set_test_env():
    """Set test environment."""
    original_env = os.environ.get("RC_ENV")
    os.environ["RC_ENV"] = "test"
    yield
    if original_env is None:
        os.environ.pop("RC_ENV", None)
    else:
        os.environ["RC_ENV"] = original_env


# =============================================================================
# Mock Agent Fixtures
# =============================================================================


class PerformanceMockAgent:
    """A simple mock agent for performance testing."""

    def __init__(self):
        self.call_count = 0
        self.memory: Dict[str, Any] = {}

    def tool_call(self, tool_name: str, **kwargs) -> str:
        """Simulate a tool call."""
        self.call_count += 1
        return f"Result from {tool_name}"

    async def async_tool_call(self, tool_name: str, **kwargs) -> str:
        """Simulate an async tool call."""
        await asyncio.sleep(0.001)  # Minimal delay
        self.call_count += 1
        return f"Async result from {tool_name}"


@pytest.fixture
def mock_agent() -> PerformanceMockAgent:
    """Create a basic mock agent."""
    return PerformanceMockAgent()


@pytest.fixture
def agent_config() -> AgentInstrumentationConfig:
    """Standard agent config for performance tests."""
    return AgentInstrumentationConfig(
        enable_tool_interception=True,
        enable_memory_monitoring=True,
        divergence_threshold=0.5,
        sampling_rate=1.0,  # Full sampling for consistent benchmarks
        max_events=10000,  # High limit for performance tests
    )


@pytest.fixture
def instrumented_agent(
    mock_agent: PerformanceMockAgent, agent_config: AgentInstrumentationConfig
) -> InstrumentedAgent:
    """Create an instrumented agent for benchmarking."""
    agent = InstrumentedAgent(mock_agent, "perf-test-agent", agent_config)

    # Register some test tools
    agent.register_tool("read_file", mock_agent.tool_call, "Read a file")
    agent.register_tool("write_file", mock_agent.tool_call, "Write a file")
    agent.register_tool("execute", mock_agent.tool_call, "Execute command")
    agent.register_tool("api_call", mock_agent.tool_call, "Call API")
    agent.register_tool("search", mock_agent.tool_call, "Search")

    return agent


# =============================================================================
# Event Generation Fixtures
# =============================================================================


def generate_tool_call_events(count: int, session_id=None) -> List[ToolCallEvent]:
    """Generate synthetic tool call events for testing."""
    session_id = session_id or uuid4()
    events = []
    tool_names = ["read_file", "write_file", "execute", "api_call", "search"]

    for i in range(count):
        events.append(
            ToolCallEvent(
                session_id=session_id,
                tool_name=tool_names[i % len(tool_names)],
                arguments={"arg1": f"value_{i}", "arg2": i},
                result=f"Result {i}",
                duration_ms=float(i % 100 + 10),
                success=True,
                exception_type=None,
            )
        )
    return events


def generate_memory_events(count: int, session_id=None) -> List[MemoryAccessEvent]:
    """Generate synthetic memory access events for testing."""
    session_id = session_id or uuid4()
    events = []
    operations = [
        MemoryAccessOperation.READ,
        MemoryAccessOperation.WRITE,
        MemoryAccessOperation.DELETE,
    ]

    for i in range(count):
        events.append(
            MemoryAccessEvent(
                session_id=session_id,
                operation=operations[i % len(operations)],
                key=f"key_{i}",
                value_preview=f"value_{i}" if i % 3 != 2 else None,
                sensitive_detected=i % 10 == 0,  # 10% sensitive
                success=True,
                exception_type=None,
            )
        )
    return events


def generate_speech_events(count: int, session_id=None) -> List[SpeechRecord]:
    """Generate synthetic speech events for testing."""
    session_id = session_id or uuid4()
    events = []

    for i in range(count):
        events.append(
            SpeechRecord(
                session_id=session_id,
                content=f"Agent response {i}: Test response.",
                intent=f"respond_to_query_{i}",
                is_response_to_user=True,
            )
        )
    return events


def generate_action_events(count: int, session_id=None) -> List[ActionRecord]:
    """Generate synthetic action events for testing."""
    session_id = session_id or uuid4()
    events = []
    action_types = ["search", "analyze", "transform", "output"]

    for i in range(count):
        events.append(
            ActionRecord(
                session_id=session_id,
                action_type=action_types[i % len(action_types)],
                description=f"Action {i} description",
                target=f"target_{i}",
                related_tool_calls=[],
            )
        )
    return events


def generate_mixed_events(
    tool_count: int = 50,
    memory_count: int = 30,
    speech_count: int = 10,
    action_count: int = 10,
    session_id=None,
) -> List[AgentEvent]:
    """Generate a mixed set of events simulating realistic agent behavior."""
    session_id = session_id or uuid4()
    events: List[AgentEvent] = []

    events.extend(generate_tool_call_events(tool_count, session_id))
    events.extend(generate_memory_events(memory_count, session_id))
    events.extend(generate_speech_events(speech_count, session_id))
    events.extend(generate_action_events(action_count, session_id))

    # Sort by timestamp to simulate realistic ordering
    events.sort(key=lambda e: e.timestamp)
    return events


@pytest.fixture
def small_event_set() -> List[AgentEvent]:
    """10 events - minimal test."""
    return generate_mixed_events(5, 3, 1, 1)


@pytest.fixture
def medium_event_set() -> List[AgentEvent]:
    """100 events - typical agent."""
    return generate_mixed_events(50, 30, 10, 10)


@pytest.fixture
def large_event_set() -> List[AgentEvent]:
    """1000 events - stress test."""
    return generate_mixed_events(500, 300, 100, 100)


# =============================================================================
# AgentJudge Fixtures
# =============================================================================


@pytest.fixture
def mock_base_judge() -> MagicMock:
    """Create a mock base JudgeAgent for fast benchmarking."""
    mock = MagicMock(spec=JudgeAgent)
    mock.evaluate = AsyncMock(
        return_value=JudgeScore(
            score=7,
            leaked_secret=False,
            leaked_instructions=False,
            reasoning="Performance test evaluation.",
        )
    )
    return mock


@pytest.fixture
def agent_judge(mock_base_judge: MagicMock) -> AgentJudge:
    """Create an AgentJudge with mock base judge."""
    config = AgentJudgeConfig()
    return AgentJudge(judge=mock_base_judge, config=config)


@pytest.fixture
def test_secret() -> SecretStr:
    """Test secret for evaluation."""
    return SecretStr("perf_test_secret_value")


# =============================================================================
# ChromaDB Fixtures
# =============================================================================


@pytest.fixture
def temp_chroma_dir():
    """Create a temporary directory for ChromaDB."""
    temp_dir = tempfile.mkdtemp(prefix="perf_test_chroma_")
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def agent_attack_kb(temp_chroma_dir: str) -> AgentAttackKnowledgeBase:
    """Create an AgentAttackKnowledgeBase with test data."""
    kb = AgentAttackKnowledgeBase(persist_directory=temp_chroma_dir)

    # Seed with some test templates for retrieval benchmarks
    expected_count = 20
    for i in range(expected_count):
        template = AgentAttackTemplate(
            id=f"perf_test_{i}",
            prompt_template=(
                f"Test attack template {i}: Attempt to exploit "
                f"vulnerability by {['tool abuse', 'memory injection'][i % 2]}."
            ),
            attack_type=AttackType.DIRECT,
            technique=Technique.DIRECT_INSTRUCTION,
            source="performance_test",
            target_goal=f"Test goal {i}",
            sophistication=min(5, i % 5 + 1),
            known_success=False,
            description=f"Performance test template {i}",
            tags=["performance", "test"],
            target_owasp=[list(OWASPAgenticRisk)[i % 10]],
            requires_tool_access=i % 2 == 0,
            requires_memory_access=i % 3 == 0,
            expected_agent_behavior=(
                f"Agent should {['execute command', 'leak data'][i % 2]}"
            ),
        )
        kb.add(template)

    # Verify seeding succeeded
    actual_count = kb.collection.count()
    assert actual_count == expected_count, (
        f"Expected {expected_count} templates but only {actual_count} were added"
    )

    return kb


# =============================================================================
# Memory Profiling Utilities
# =============================================================================


def get_process_memory_mb() -> float:
    """
    Get current process memory usage in MB.

    Returns -1.0 if memory measurement is unavailable (tests should skip).
    """
    import sys
    import logging

    logger = logging.getLogger(__name__)

    try:
        import resource

        # On Unix systems
        usage = resource.getrusage(resource.RUSAGE_SELF)
        # On macOS, ru_maxrss is in bytes; on Linux it's in KB
        if sys.platform == "darwin":
            return usage.ru_maxrss / (1024 * 1024)  # bytes to MB
        else:
            return usage.ru_maxrss / 1024  # KB to MB
    except ImportError:
        logger.debug("resource module not available, trying psutil")
    except Exception as e:
        logger.warning(f"Failed to get memory via resource: {type(e).__name__}")

    try:
        import psutil

        process = psutil.Process()
        return process.memory_info().rss / (1024 * 1024)
    except ImportError:
        logger.warning("Neither resource nor psutil available for memory")
    except Exception as e:
        logger.warning(f"Failed to get memory via psutil: {type(e).__name__}")

    # Return sentinel value to signal unavailability
    return -1.0


@pytest.fixture
def memory_baseline():
    """Record baseline memory before test."""
    return get_process_memory_mb()
