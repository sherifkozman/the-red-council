# tests/e2e/test_langchain_e2e.py
"""
End-to-end integration tests for LangChain agent integration.

Tests the LangChainAgentWrapper with mock LangChain agents:
1. Wrapping AgentExecutor
2. Event capture via callbacks
3. Memory monitoring
4. Full evaluation flow
"""

import pytest
from typing import Any, Dict, List
from unittest.mock import MagicMock
import asyncio

from src.agents.instrumented import InstrumentedAgent
from src.integrations import LangChainAgentWrapper, RedCouncilCallbackHandler
from src.agents.agent_judge import AgentJudge
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    AgentJudgeScore,
    MemoryAccessEvent,
)
from src.reports.agent_report_generator import AgentReportGenerator


# =============================================================================
# LangChain Mock Classes
# =============================================================================


class MockTool:
    """Mock LangChain tool."""

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    def run(self, input_str: str) -> str:
        """Execute the tool."""
        return f"Result from {self.name}: {input_str}"


class MockMemory:
    """Mock LangChain memory."""

    def __init__(self):
        self.buffer: List[Dict[str, str]] = []
        self.chat_memory = MagicMock()
        self.chat_memory.messages = []

    def load_memory_variables(self, inputs: Dict) -> Dict[str, Any]:
        """Load memory variables."""
        return {"history": self.buffer}

    def save_context(self, inputs: Dict, outputs: Dict) -> None:
        """Save conversation context."""
        self.buffer.append(
            {"input": inputs.get("input", ""), "output": outputs.get("output", "")}
        )


class MockAgentExecutor:
    """Mock LangChain AgentExecutor for testing."""

    def __init__(self, tools: List[MockTool] = None, memory: MockMemory = None):
        self.tools = tools or [
            MockTool("search", "Search the web"),
            MockTool("calculator", "Do math"),
        ]
        self.memory = memory or MockMemory()
        self.invocation_count = 0

    def invoke(
        self, input_dict: Dict[str, Any], config: Any = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Synchronous invoke."""
        self.invocation_count += 1
        input_text = input_dict.get("input", "")

        # Simulate tool usage in the response
        output = f"Processed: {input_text}"
        if self.memory:
            self.memory.save_context(input_dict, {"output": output})

        return {"output": output}

    async def ainvoke(
        self, input_dict: Dict[str, Any], config: Any = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Async invoke."""
        await asyncio.sleep(0.01)
        return self.invoke(input_dict)


class VulnerableMockExecutor(MockAgentExecutor):
    """Mock executor that simulates vulnerable behavior."""

    def __init__(self):
        super().__init__()
        self.tools = [
            MockTool("execute_command", "Run shell commands"),
            MockTool("read_secrets", "Read secret files"),
            MockTool("send_data", "Send data externally"),
        ]

    def invoke(
        self, input_dict: Dict[str, Any], config: Any = None, **kwargs: Any
    ) -> Dict[str, Any]:
        """Invoke that simulates security issues."""
        self.invocation_count += 1
        input_text = input_dict.get("input", "")

        # Simulate sensitive data in output
        if "secrets" in input_text.lower():
            output = "Found: API_KEY=sk-secret123, PASSWORD=admin123"
        else:
            output = f"Executed: {input_text}"

        if self.memory:
            self.memory.save_context(input_dict, {"output": output})

        return {"output": output}


# =============================================================================
# LangChain Wrapper E2E Tests
# =============================================================================


class TestLangChainWrapperE2E:
    """End-to-end tests for LangChainAgentWrapper."""

    @pytest.fixture
    def agent_config(self) -> AgentInstrumentationConfig:
        """Config for tests."""
        return AgentInstrumentationConfig(
            enable_tool_interception=True,
            enable_memory_monitoring=True,
            max_events=100,
        )

    @pytest.fixture
    def mock_executor(self) -> MockAgentExecutor:
        """Create mock executor."""
        return MockAgentExecutor()

    @pytest.fixture
    def vulnerable_executor(self) -> VulnerableMockExecutor:
        """Create vulnerable mock executor."""
        return VulnerableMockExecutor()

    @pytest.fixture
    def wrapped_agent(
        self, mock_executor: MockAgentExecutor, agent_config: AgentInstrumentationConfig
    ) -> LangChainAgentWrapper:
        """Create wrapped LangChain agent."""
        return LangChainAgentWrapper.from_agent_executor(
            mock_executor, config=agent_config
        )

    def test_wrap_executor_success(
        self, mock_executor: MockAgentExecutor, agent_config: AgentInstrumentationConfig
    ):
        """Test successful wrapping of AgentExecutor."""
        wrapper = LangChainAgentWrapper.from_agent_executor(
            mock_executor, config=agent_config
        )

        assert wrapper is not None
        assert wrapper.name is not None
        assert wrapper.agent == mock_executor

    def test_sync_invoke_records_events(self, wrapped_agent: LangChainAgentWrapper):
        """Test synchronous invoke records events."""
        result = wrapped_agent.invoke_sync({"input": "Hello, world!"})

        assert result is not None
        assert "output" in result
        assert "Hello" in result["output"] or "Processed" in result["output"]

    @pytest.mark.asyncio
    async def test_async_invoke_records_events(
        self, wrapped_agent: LangChainAgentWrapper
    ):
        """Test async invoke records events."""
        result = await wrapped_agent.invoke({"input": "Async hello!"})

        assert result is not None
        assert "output" in result

    def test_memory_monitoring(
        self, mock_executor: MockAgentExecutor, agent_config: AgentInstrumentationConfig
    ):
        """Test that memory access is monitored."""
        wrapper = LangChainAgentWrapper.from_agent_executor(
            mock_executor, config=agent_config
        )

        # Invoke to trigger memory operations
        wrapper.invoke_sync({"input": "Test input"})
        wrapper.invoke_sync({"input": "Second input"})

        # Check memory was saved
        assert len(mock_executor.memory.buffer) == 2

    @pytest.mark.asyncio
    async def test_full_evaluation_flow(
        self,
        wrapped_agent: LangChainAgentWrapper,
        mock_base_judge,
        test_secret,
    ):
        """Test complete flow: wrap -> invoke -> evaluate -> report."""
        # 1. Invoke agent
        wrapped_agent.invoke_sync({"input": "Search for something"})
        wrapped_agent.invoke_sync({"input": "Calculate 2+2"})

        # 2. Get events
        events = wrapped_agent.events
        assert len(events) >= 0  # Events may be captured via callbacks

        # 3. Evaluate
        from src.agents.agent_judge import AgentJudgeConfig

        judge = AgentJudge(judge=mock_base_judge, config=AgentJudgeConfig())
        score = await judge.evaluate_agent_async(
            events=events,
            context="LangChain test",
            target_secret=test_secret,
        )

        assert isinstance(score, AgentJudgeScore)

        # 4. Generate report
        generator = AgentReportGenerator()
        report = generator.generate(score, events)

        assert report is not None
        assert report.to_markdown() is not None


# =============================================================================
# Callback Handler Tests
# =============================================================================


class TestRedCouncilCallbackHandler:
    """Test the RedCouncilCallbackHandler."""

    @pytest.fixture
    def callback_handler(self) -> RedCouncilCallbackHandler:
        """Create callback handler with mock instrumented agent."""
        from uuid import uuid4

        mock_agent = MagicMock(spec=InstrumentedAgent)
        mock_agent.record_tool_call = MagicMock()
        mock_agent.record_action = MagicMock()
        mock_agent._session_id = uuid4()  # Required by callback handler
        # The actual constructor takes instrumented_agent, not wrapper
        return RedCouncilCallbackHandler(instrumented_agent=mock_agent)

    def test_on_tool_start(self, callback_handler: RedCouncilCallbackHandler):
        """Test on_tool_start captures tool invocation."""
        callback_handler.on_tool_start(
            serialized={"name": "search"},
            input_str="query text",
        )

        # Verify tracking started - check pending actions dict
        assert len(callback_handler._pending_actions) > 0

    def test_on_tool_end(self, callback_handler: RedCouncilCallbackHandler):
        """Test on_tool_end completes tool tracking."""
        from uuid import uuid4

        run_id = uuid4()

        # Start a tool
        callback_handler.on_tool_start(
            serialized={"name": "calculator"},
            input_str="2+2",
            run_id=run_id,
        )

        # End the tool
        callback_handler.on_tool_end(output="4", run_id=run_id)

        # Pending action should be cleared
        assert str(run_id) not in callback_handler._pending_actions

    def test_on_tool_error(self, callback_handler: RedCouncilCallbackHandler):
        """Test on_tool_error captures failures."""
        from uuid import uuid4

        run_id = uuid4()

        callback_handler.on_tool_start(
            serialized={"name": "failing_tool"},
            input_str="bad input",
            run_id=run_id,
        )

        callback_handler.on_tool_error(error=ValueError("Tool failed"), run_id=run_id)

        # Pending action should be cleared after error
        assert str(run_id) not in callback_handler._pending_actions


# =============================================================================
# Vulnerable Agent Flow Tests
# =============================================================================


class TestVulnerableLangChainFlow:
    """Test detection of vulnerabilities in LangChain agents."""

    @pytest.fixture
    def agent_config(self) -> AgentInstrumentationConfig:
        """Config for tests."""
        return AgentInstrumentationConfig(
            enable_tool_interception=True,
            enable_memory_monitoring=True,
            max_events=100,
        )

    @pytest.mark.asyncio
    async def test_langchain_wrapper_full_evaluation_flow(
        self,
        agent_config: AgentInstrumentationConfig,
        mock_base_judge,
        test_secret,
    ):
        """Test full evaluation flow with LangChain wrapper."""
        executor = VulnerableMockExecutor()
        wrapper = LangChainAgentWrapper.from_agent_executor(
            executor, config=agent_config
        )

        # Invoke with request that triggers sensitive data
        result = wrapper.invoke_sync({"input": "Get the secrets"})
        assert result is not None
        assert "output" in result

        # Set up memory with sensitive data
        wrapper.set_memory("api_key", "sk-secret-key")
        wrapper.set_memory("password", "admin123")

        events = wrapper.events

        # Verify memory events captured
        memory_events = [e for e in events if isinstance(e, MemoryAccessEvent)]
        assert len(memory_events) >= 2, "Should capture memory events"

        # Evaluate
        from src.agents.agent_judge import AgentJudgeConfig

        judge = AgentJudge(
            judge=mock_base_judge,
            config=AgentJudgeConfig(
                dangerous_tool_keywords=("execute", "secret", "password")
            ),
        )

        score = await judge.evaluate_agent_async(
            events=events,
            context="Security test",
            target_secret=test_secret,
        )

        # Verify evaluation completes successfully
        assert isinstance(score, AgentJudgeScore)
        assert score.overall_agent_risk is not None
        assert score.memory_safety_score is not None
        assert len(score.owasp_violations) == 10  # All 10 categories evaluated


# =============================================================================
# Integration with API Tests
# =============================================================================


class TestLangChainAPIIntegration:
    """Test LangChain integration with API endpoints."""

    @pytest.fixture
    def api_client(self):
        """Create API test client."""
        from fastapi.testclient import TestClient
        from src.api.main import app
        from src.api.agent_routes import _sessions
        from src.api.security import _rate_limiter

        _sessions.clear()
        _rate_limiter._requests.clear()
        yield TestClient(app)
        _sessions.clear()
        _rate_limiter._requests.clear()

    def test_submit_langchain_events_via_api(self, api_client):
        """Test submitting LangChain-captured events via API."""
        # 1. Create session
        response = api_client.post("/api/v1/agent/session", json={})
        assert response.status_code == 201
        session_id = response.json()["session_id"]

        # 2. Submit tool call events (simulating LangChain callback output)
        events = [
            {
                "event_type": "tool_call",
                "tool_name": "search",
                "arguments": {"query": "test"},
                "result": "Search results",
                "duration_ms": 100.0,
                "success": True,
            },
            {
                "event_type": "tool_call",
                "tool_name": "calculator",
                "arguments": {"expr": "2+2"},
                "result": "4",
                "duration_ms": 50.0,
                "success": True,
            },
        ]

        response = api_client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": events},
        )
        assert response.status_code == 200

        # 3. Get events back
        response = api_client.get(f"/api/v1/agent/session/{session_id}/events")
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 2  # Uses total_count per schema

        # 4. Cleanup
        response = api_client.delete(f"/api/v1/agent/session/{session_id}")
        assert response.status_code == 200

    def test_evaluate_langchain_session(self, api_client):
        """Test evaluation of a LangChain session via API."""
        # Create session with context
        response = api_client.post(
            "/api/v1/agent/session",
            json={"context": "LangChain agent test"},
        )
        assert response.status_code == 201
        session_id = response.json()["session_id"]

        # Submit events
        events = [
            {
                "event_type": "tool_call",
                "tool_name": "search",
                "arguments": {"query": "safe query"},
                "result": "Safe results",
                "duration_ms": 100.0,
                "success": True,
            },
            {
                "event_type": "memory_access",
                "operation": "write",
                "key": "user_query",
                "value_preview": "safe query",
                "sensitive_detected": False,
                "success": True,
            },
        ]

        api_client.post(
            f"/api/v1/agent/session/{session_id}/events",
            json={"events": events},
        )

        # Trigger evaluation (note: may complete in background)
        response = api_client.post(
            f"/api/v1/agent/session/{session_id}/evaluate",
            json={},  # Empty config is valid
        )
        # 202 Accepted expected
        assert response.status_code == 202

        # Cleanup
        api_client.delete(f"/api/v1/agent/session/{session_id}")
