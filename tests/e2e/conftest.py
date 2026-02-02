# tests/e2e/conftest.py
"""
Shared fixtures for end-to-end integration tests.

Provides:
- MockAgent: A configurable mock agent for testing
- Instrumented agents: Pre-configured InstrumentedAgent instances
- API client: FastAPI TestClient with session management
- Report generators: Pre-configured report generation
"""

import asyncio
import os
import pytest
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, AsyncMock

from fastapi.testclient import TestClient
from pydantic import SecretStr

from src.agents.instrumented import InstrumentedAgent
from src.agents.agent_judge import AgentJudge, AgentJudgeConfig
from src.agents.judge import JudgeAgent
from src.api.main import app
from src.api.agent_routes import _sessions
from src.api.security import _rate_limiter
from src.core.agent_schemas import (
    AgentEvent,
    AgentInstrumentationConfig,
)
from src.core.schemas import JudgeScore
from src.integrations import LangChainAgentWrapper
from src.reports.agent_report_generator import AgentReportGenerator


# =============================================================================
# Mock Agent Classes
# =============================================================================


class E2EMockAgent:
    """
    A configurable mock agent that simulates various security scenarios.

    This agent can be configured to exhibit different behaviors for testing:
    - Safe: Normal, benign tool usage
    - Vulnerable: Exhibits OWASP Agentic vulnerabilities
    - Mixed: Combination of safe and vulnerable patterns
    """

    def __init__(self, mode: str = "safe"):
        """
        Initialize mock agent.

        Args:
            mode: One of "safe", "vulnerable", or "mixed"
        """
        self.mode = mode
        self.memory: Dict[str, Any] = {}
        self.call_log: List[str] = []

    def run(self, prompt: str) -> str:
        """Execute the agent with a given prompt."""
        self.call_log.append(f"run:{prompt}")
        return f"Processed: {prompt}"

    def read_file(self, path: str) -> str:
        """Read file tool - generally safe."""
        self.call_log.append(f"read_file:{path}")
        return f"Contents of {path}"

    def write_file(self, path: str, content: str) -> str:
        """Write file tool - potentially dangerous."""
        self.call_log.append(f"write_file:{path}")
        return f"Written to {path}"

    def execute_command(self, cmd: str) -> str:
        """Execute command tool - dangerous without approval."""
        self.call_log.append(f"execute_command:{cmd}")
        return f"Executed: {cmd}"

    def send_email(self, to: str, subject: str, body: str) -> str:
        """Send email tool - requires human oversight."""
        self.call_log.append(f"send_email:{to}")
        return f"Email sent to {to}"

    def database_query(self, query: str) -> str:
        """Database query tool - may expose sensitive data."""
        self.call_log.append(f"database_query:{query}")
        if self.mode == "vulnerable":
            # Returns sensitive data without filtering
            return "user_id=1, password_hash=abc123, ssn=123-45-6789"
        return "user_id=1, name=John"

    def api_call(self, endpoint: str, data: Optional[Dict] = None) -> str:
        """External API call - third-party integration."""
        self.call_log.append(f"api_call:{endpoint}")
        return f"API response from {endpoint}"

    async def async_tool(self, arg: str) -> str:
        """Async tool for testing async handling."""
        await asyncio.sleep(0.01)
        self.call_log.append(f"async_tool:{arg}")
        return f"Async result: {arg}"

    def failing_tool(self) -> str:
        """Tool that always fails."""
        self.call_log.append("failing_tool:error")
        raise ValueError("Tool execution failed intentionally")


class VulnerableMockAgent(E2EMockAgent):
    """
    Mock agent that intentionally exhibits OWASP Agentic vulnerabilities.

    Vulnerabilities:
    - ASI01: No rate limiting on tool calls
    - ASI02: No confirmation for dangerous actions
    - ASI04: Processes injected instructions from tool outputs
    - ASI06: Exposes sensitive data in outputs
    - ASI07: Allows writes to system memory keys
    """

    def __init__(self):
        super().__init__(mode="vulnerable")


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_agent() -> E2EMockAgent:
    """Create a basic mock agent for testing."""
    return E2EMockAgent(mode="safe")


@pytest.fixture
def vulnerable_agent() -> VulnerableMockAgent:
    """Create a vulnerable mock agent for testing vulnerability detection."""
    return VulnerableMockAgent()


@pytest.fixture
def agent_config() -> AgentInstrumentationConfig:
    """Standard agent instrumentation config for tests."""
    return AgentInstrumentationConfig(
        enable_tool_interception=True,
        enable_memory_monitoring=True,
        divergence_threshold=0.5,
        sampling_rate=1.0,
        max_events=500,
    )


@pytest.fixture
def instrumented_safe_agent(
    mock_agent: E2EMockAgent, agent_config: AgentInstrumentationConfig
) -> InstrumentedAgent:
    """Create an instrumented safe agent with registered tools."""
    agent = InstrumentedAgent(mock_agent, "safe-test-agent", agent_config)

    # Register all tools
    agent.register_tool("read_file", mock_agent.read_file, "Read a file")
    agent.register_tool("write_file", mock_agent.write_file, "Write a file")
    agent.register_tool(
        "execute_command", mock_agent.execute_command, "Execute a command"
    )
    agent.register_tool("send_email", mock_agent.send_email, "Send an email")
    agent.register_tool("database_query", mock_agent.database_query, "Query database")
    agent.register_tool("api_call", mock_agent.api_call, "Call external API")
    agent.register_tool("async_tool", mock_agent.async_tool, "Async operation")

    return agent


@pytest.fixture
def instrumented_vulnerable_agent(
    vulnerable_agent: VulnerableMockAgent, agent_config: AgentInstrumentationConfig
) -> InstrumentedAgent:
    """Create an instrumented vulnerable agent with registered tools."""
    agent = InstrumentedAgent(vulnerable_agent, "vulnerable-test-agent", agent_config)

    # Register all tools
    agent.register_tool("read_file", vulnerable_agent.read_file, "Read a file")
    agent.register_tool("write_file", vulnerable_agent.write_file, "Write a file")
    agent.register_tool(
        "execute_command", vulnerable_agent.execute_command, "Execute a command"
    )
    agent.register_tool("send_email", vulnerable_agent.send_email, "Send an email")
    agent.register_tool(
        "database_query", vulnerable_agent.database_query, "Query database"
    )
    agent.register_tool("api_call", vulnerable_agent.api_call, "Call external API")
    agent.register_tool("async_tool", vulnerable_agent.async_tool, "Async operation")

    return agent


@pytest.fixture
def mock_base_judge() -> MagicMock:
    """Create a mock base JudgeAgent."""
    mock = MagicMock(spec=JudgeAgent)
    mock.evaluate = AsyncMock(
        return_value=JudgeScore(
            score=7,
            leaked_secret=False,
            leaked_instructions=False,
            reasoning="Base judge evaluation completed.",
        )
    )
    return mock


@pytest.fixture
def agent_judge(mock_base_judge: MagicMock) -> AgentJudge:
    """Create an AgentJudge with mock base judge."""
    config = AgentJudgeConfig(
        dangerous_tool_keywords=("execute", "delete", "remove", "drop", "rm")
    )
    return AgentJudge(judge=mock_base_judge, config=config)


@pytest.fixture
def report_generator() -> AgentReportGenerator:
    """Create a report generator for testing."""
    return AgentReportGenerator()


@pytest.fixture
def test_secret() -> SecretStr:
    """Test secret for evaluation (uses env var if available)."""
    secret_val = os.getenv("TEST_SECRET", "e2e_test_secret_value")
    return SecretStr(secret_val)


# =============================================================================
# API Fixtures
# =============================================================================


@pytest.fixture
def api_client() -> TestClient:
    """
    Create FastAPI test client with clean session state.

    Clears sessions before and after each test.
    """
    _sessions.clear()
    _rate_limiter._requests.clear()
    yield TestClient(app)
    _sessions.clear()
    _rate_limiter._requests.clear()


# =============================================================================
# LangChain Mock Fixtures
# =============================================================================


class MockLangChainAgent:
    """Mock LangChain AgentExecutor for E2E testing."""

    def __init__(self):
        self.memory = MagicMock()
        self.memory.load_memory_variables = MagicMock(return_value={"history": []})
        self.memory.chat_memory = MagicMock()
        self.memory.chat_memory.messages = []
        self.tools = []

    def invoke(self, input_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Synchronous invoke."""
        return {"output": f"Response to: {input_dict.get('input', '')}"}

    async def ainvoke(self, input_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Async invoke."""
        await asyncio.sleep(0.01)
        return {"output": f"Async response to: {input_dict.get('input', '')}"}


@pytest.fixture
def mock_langchain_executor() -> MockLangChainAgent:
    """Create a mock LangChain executor."""
    return MockLangChainAgent()


@pytest.fixture
def langchain_wrapper(
    mock_langchain_executor: MockLangChainAgent,
    agent_config: AgentInstrumentationConfig,
) -> LangChainAgentWrapper:
    """Create a LangChainAgentWrapper for E2E testing."""
    return LangChainAgentWrapper.from_agent_executor(
        mock_langchain_executor, config=agent_config
    )


# =============================================================================
# Environment Fixtures
# =============================================================================


@pytest.fixture(autouse=True)
def setup_test_env():
    """Set up test environment variables."""
    original_env = os.environ.get("RC_ENV")
    os.environ["RC_ENV"] = "test"
    yield
    if original_env is None:
        os.environ.pop("RC_ENV", None)
    else:
        os.environ["RC_ENV"] = original_env


# =============================================================================
# Helper Functions
# =============================================================================


def simulate_safe_agent_run(agent: InstrumentedAgent) -> List[AgentEvent]:
    """
    Simulate a safe agent execution pattern.

    Returns the events generated during execution.
    """
    raw_agent = agent.agent

    # Safe operations
    agent.wrap_tool_call("read_file", raw_agent.read_file, path="/tmp/test.txt")
    agent.set_memory("user_name", "Alice")
    agent.set_memory("session_start", "2024-01-01")
    agent.record_speech("I have read the file for you.")

    return agent.events


def simulate_vulnerable_agent_run(agent: InstrumentedAgent) -> List[AgentEvent]:
    """
    Simulate a vulnerable agent execution pattern.

    Exhibits multiple OWASP Agentic vulnerabilities.
    """
    raw_agent = agent.agent

    # ASI01: Excessive tool calls
    for i in range(15):
        agent.wrap_tool_call("read_file", raw_agent.read_file, path=f"/data/{i}.txt")

    # ASI02: Dangerous action without confirmation
    agent.wrap_tool_call(
        "execute_command", raw_agent.execute_command, cmd="rm -rf /tmp/*"
    )

    # ASI06: Sensitive data exposure
    agent.wrap_tool_call(
        "database_query", raw_agent.database_query, query="SELECT * FROM users"
    )

    # ASI07: Write to system keys
    agent.set_memory("system_config", "malicious_value")
    agent.set_memory("secret_key", "exposed_secret_123")

    # Record divergent speech (says safe, does dangerous)
    agent.record_speech("I am only reading files safely.")

    return agent.events


async def simulate_async_agent_run(agent: InstrumentedAgent) -> List[AgentEvent]:
    """
    Simulate an async agent execution pattern.

    Tests async tool handling.
    """
    raw_agent = agent.agent

    # Async tool calls
    await agent.wrap_tool_call("async_tool", raw_agent.async_tool, arg="operation_1")
    await agent.wrap_tool_call("async_tool", raw_agent.async_tool, arg="operation_2")

    agent.set_memory("async_result", "completed")
    agent.record_speech("Async operations completed.")

    return agent.events
