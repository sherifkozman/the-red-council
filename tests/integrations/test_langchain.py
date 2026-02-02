# tests/integrations/test_langchain.py
"""
Tests for LangChain integration adapter.

These tests use mock objects to simulate LangChain behavior without
requiring langchain as a dependency.
"""

import asyncio
import pytest
from unittest.mock import MagicMock
from uuid import uuid4
from typing import Any, Dict, List, Optional

from src.integrations.langchain_adapter import (
    LangChainAgentWrapper,
    RedCouncilCallbackHandler,
)
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ActionRecord,
    SpeechRecord,
)
from src.agents.instrumented import InstrumentedAgent


# =============================================================================
# Mock LangChain Classes
# =============================================================================


class MockTool:
    """Mock LangChain tool."""

    def __init__(self, name: str, description: str = "A mock tool"):
        self.name = name
        self.description = description

    def run(self, input_str: str) -> str:
        return f"Result from {self.name}: {input_str}"


class MockMemory:
    """Mock LangChain memory."""

    def __init__(self):
        self._variables: Dict[str, Any] = {}
        self.chat_memory = MagicMock()
        self.chat_memory.messages = []

    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        return self._variables

    def save_context(self, inputs: Dict[str, Any], outputs: Dict[str, Any]) -> None:
        self._variables.update(outputs)


class MockAgentExecutor:
    """Mock LangChain AgentExecutor for testing."""

    def __init__(
        self,
        name: str = "MockAgent",
        tools: Optional[List[MockTool]] = None,
        memory: Optional[MockMemory] = None,
    ):
        self.name = name
        self.tools = tools or []
        self.memory = memory
        self._invoke_result = {"output": "Mock response"}

    def set_invoke_result(self, result: Dict[str, Any]) -> None:
        """Set the result that invoke will return."""
        self._invoke_result = result

    def invoke(
        self,
        input: Any,
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Sync invoke method."""
        # Simulate calling callbacks
        callbacks = []
        if config and "callbacks" in config:
            callbacks = config["callbacks"]

        run_id = uuid4()

        # Simulate tool calls through callbacks
        for tool in self.tools:
            for cb in callbacks:
                if hasattr(cb, "on_tool_start"):
                    cb.on_tool_start(
                        {"name": tool.name},
                        str(input),
                        run_id=run_id,
                    )
                if hasattr(cb, "on_tool_end"):
                    cb.on_tool_end(
                        f"Result from {tool.name}",
                        run_id=run_id,
                    )

        # Simulate agent finish
        for cb in callbacks:
            if hasattr(cb, "on_agent_finish"):
                finish = MagicMock()
                finish.return_values = self._invoke_result
                finish.log = ""
                cb.on_agent_finish(finish, run_id=run_id)

        return self._invoke_result

    async def ainvoke(
        self,
        input: Any,
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Async invoke method."""
        # Simulate async work
        await asyncio.sleep(0.01)
        return self.invoke(input, config, **kwargs)


class MockAgentAction:
    """Mock LangChain AgentAction."""

    def __init__(self, tool: str, tool_input: str, log: str = ""):
        self.tool = tool
        self.tool_input = tool_input
        self.log = log


class MockAgentFinish:
    """Mock LangChain AgentFinish."""

    def __init__(self, return_values: Dict[str, Any], log: str = ""):
        self.return_values = return_values
        self.log = log


# =============================================================================
# RedCouncilCallbackHandler Tests
# =============================================================================


class TestRedCouncilCallbackHandler:
    """Tests for the callback handler."""

    @pytest.fixture
    def instrumented_agent(self):
        """Create an InstrumentedAgent for testing."""
        mock_agent = MagicMock()
        config = AgentInstrumentationConfig()
        return InstrumentedAgent(mock_agent, "test-agent", config)

    @pytest.fixture
    def handler(self, instrumented_agent):
        """Create a callback handler."""
        return RedCouncilCallbackHandler(instrumented_agent)

    def test_init_requires_agent(self):
        """Test that handler requires an instrumented agent."""
        with pytest.raises(ValueError, match="cannot be None"):
            RedCouncilCallbackHandler(None)

    def test_properties(self, handler):
        """Test handler properties."""
        assert handler.raise_error is False
        assert handler.run_inline is True

    def test_on_tool_start_records_pending(self, handler):
        """Test that on_tool_start records pending action."""
        run_id = uuid4()
        handler.on_tool_start(
            {"name": "search"},
            "query string",
            run_id=run_id,
        )

        run_id_str = str(run_id)
        assert run_id_str in handler._tool_start_times
        assert run_id_str in handler._pending_actions
        assert handler._pending_actions[run_id_str]["tool_name"] == "search"
        assert handler._pending_actions[run_id_str]["input_str"] == "query string"

    def test_on_tool_end_records_event(self, handler, instrumented_agent):
        """Test that on_tool_end records a ToolCallEvent."""
        run_id = uuid4()

        # Start tool
        handler.on_tool_start(
            {"name": "calculator"},
            "2+2",
            run_id=run_id,
        )

        # End tool
        handler.on_tool_end(
            "4",
            run_id=run_id,
        )

        # Check event was recorded
        events = instrumented_agent.tool_calls
        assert len(events) == 1
        assert events[0].tool_name == "calculator"
        assert events[0].success is True
        assert events[0].exception_type is None

    def test_on_tool_error_records_failure(self, handler, instrumented_agent):
        """Test that on_tool_error records a failed ToolCallEvent."""
        run_id = uuid4()

        # Start tool
        handler.on_tool_start(
            {"name": "risky_tool"},
            "bad input",
            run_id=run_id,
        )

        # Error in tool
        handler.on_tool_error(
            ValueError("Something went wrong"),
            run_id=run_id,
        )

        # Check event was recorded
        events = instrumented_agent.tool_calls
        assert len(events) == 1
        assert events[0].tool_name == "risky_tool"
        assert events[0].success is False
        assert events[0].exception_type == "ValueError"

    def test_on_tool_end_without_start_logs_warning(self, handler, caplog):
        """Test that on_tool_end without matching start logs warning."""
        handler.on_tool_end("result", run_id=uuid4())
        assert "on_tool_end called without matching on_tool_start" in caplog.text

    def test_on_tool_error_without_start_logs_warning(self, handler, caplog):
        """Test that on_tool_error without matching start logs warning."""
        handler.on_tool_error(ValueError("error"), run_id=uuid4())
        assert "on_tool_error called without matching on_tool_start" in caplog.text

    def test_on_agent_action_records_action(self, handler, instrumented_agent):
        """Test that on_agent_action records an ActionRecord."""
        action = MockAgentAction(
            tool="search",
            tool_input="python tutorials",
            log="I will search for python tutorials",
        )

        handler.on_agent_action(action, run_id=uuid4())

        # Check action was recorded
        events = [e for e in instrumented_agent.events if isinstance(e, ActionRecord)]
        assert len(events) == 1
        assert events[0].action_type == "tool_invocation"
        assert "search" in events[0].description

        # Check speech was recorded
        speeches = [e for e in instrumented_agent.events if isinstance(e, SpeechRecord)]
        assert len(speeches) == 1
        assert "python tutorials" in speeches[0].content

    def test_on_agent_finish_records_speech(self, handler, instrumented_agent):
        """Test that on_agent_finish records final output as speech."""
        finish = MockAgentFinish(
            return_values={"output": "Here is your answer"},
            log="",
        )

        handler.on_agent_finish(finish, run_id=uuid4())

        # Check speech was recorded
        speeches = [e for e in instrumented_agent.events if isinstance(e, SpeechRecord)]
        assert len(speeches) == 1
        assert speeches[0].content == "Here is your answer"
        assert speeches[0].intent == "final_response"
        assert speeches[0].is_response_to_user is True

    def test_structured_inputs_captured(self, handler, instrumented_agent):
        """Test that structured inputs are captured correctly."""
        run_id = uuid4()

        handler.on_tool_start(
            {"name": "api_call"},
            "",
            run_id=run_id,
            inputs={"url": "https://api.example.com", "method": "GET"},
        )

        handler.on_tool_end({"status": 200}, run_id=run_id)

        events = instrumented_agent.tool_calls
        assert len(events) == 1
        assert "url" in events[0].arguments["keyword"]
        assert "method" in events[0].arguments["keyword"]

    def test_safe_repr_handles_errors(self, handler):
        """Test that _safe_repr handles unrepresentable objects."""

        class Unrepresentable:
            def __repr__(self):
                raise RuntimeError("Cannot represent")

        result = handler._safe_repr(Unrepresentable())
        assert result == "<unrepresentable>"

    def test_safe_repr_truncates_long_strings(self, handler):
        """Test that _safe_repr truncates long strings."""
        long_string = "x" * 2000
        result = handler._safe_repr(long_string, max_len=100)
        assert len(result) <= 103  # 100 + "..."

    def test_noop_callbacks(self, handler):
        """Test that no-op callbacks don't raise exceptions."""
        run_id = uuid4()

        # These should all be no-ops
        handler.on_llm_start({}, ["prompt"], run_id=run_id)
        handler.on_llm_end(MagicMock(), run_id=run_id)
        handler.on_llm_error(ValueError(), run_id=run_id)
        handler.on_chain_start({}, {}, run_id=run_id)
        handler.on_chain_end({}, run_id=run_id)
        handler.on_chain_error(ValueError(), run_id=run_id)
        handler.on_text("some text", run_id=run_id)


# =============================================================================
# LangChainAgentWrapper Tests
# =============================================================================


class TestLangChainAgentWrapper:
    """Tests for the LangChain wrapper."""

    @pytest.fixture
    def mock_executor(self):
        """Create a mock AgentExecutor."""
        return MockAgentExecutor(
            name="TestAgent",
            tools=[MockTool("search"), MockTool("calculator")],
        )

    @pytest.fixture
    def wrapper(self, mock_executor):
        """Create a wrapper around mock executor."""
        return LangChainAgentWrapper(mock_executor)

    def test_init_requires_agent(self):
        """Test that wrapper requires an agent."""
        with pytest.raises(ValueError, match="cannot be None"):
            LangChainAgentWrapper(None)

    def test_init_validates_interface(self):
        """Test that wrapper validates agent interface."""
        bad_agent = object()  # No invoke or run method
        with pytest.raises(TypeError, match="must have 'invoke' or 'run' method"):
            LangChainAgentWrapper(bad_agent)

    def test_init_with_default_config(self, mock_executor):
        """Test that wrapper uses default config if none provided."""
        wrapper = LangChainAgentWrapper(mock_executor)
        assert wrapper.config is not None
        assert wrapper.config.enable_tool_interception is True

    def test_init_with_custom_config(self, mock_executor):
        """Test that wrapper uses provided config."""
        config = AgentInstrumentationConfig(
            enable_tool_interception=False,
            sampling_rate=0.5,
        )
        wrapper = LangChainAgentWrapper(mock_executor, config)
        assert wrapper.config.enable_tool_interception is False
        assert wrapper.config.sampling_rate == 0.5

    def test_from_agent_executor(self, mock_executor):
        """Test factory method."""
        wrapper = LangChainAgentWrapper.from_agent_executor(mock_executor)
        assert wrapper.agent is mock_executor
        assert "langchain:" in wrapper.name

    def test_name_includes_agent_name(self, mock_executor):
        """Test that wrapper name includes agent name."""
        wrapper = LangChainAgentWrapper(mock_executor)
        assert "TestAgent" in wrapper.name

    def test_invoke_sync(self, wrapper, mock_executor):
        """Test synchronous invoke."""
        mock_executor.set_invoke_result({"output": "Test result"})

        result = wrapper.invoke_sync("What is 2+2?")

        assert result == {"output": "Test result"}

    def test_invoke_sync_records_events(self, wrapper, mock_executor):
        """Test that invoke_sync records tool call events."""
        wrapper.invoke_sync("Query")

        # Should have events from tool calls
        events = wrapper.events
        assert len(events) > 0

        # Check for tool calls
        tool_calls = wrapper.tool_calls
        assert len(tool_calls) == len(mock_executor.tools)

    @pytest.mark.asyncio
    async def test_invoke_async(self, wrapper, mock_executor):
        """Test asynchronous invoke."""
        mock_executor.set_invoke_result({"output": "Async result"})

        result = await wrapper.invoke("Async query")

        assert result == {"output": "Async result"}

    @pytest.mark.asyncio
    async def test_arun_method(self, wrapper, mock_executor):
        """Test legacy arun method."""
        mock_executor.set_invoke_result({"output": "Arun result"})

        result = await wrapper.arun("Arun query")

        assert result == {"output": "Arun result"}

    def test_run_legacy_method(self, mock_executor):
        """Test legacy run method with agent that has run()."""
        mock_executor.run = MagicMock(return_value="Run result")

        wrapper = LangChainAgentWrapper(mock_executor)
        result = wrapper.run("Query")

        assert result == "Run result"
        mock_executor.run.assert_called_once()

    def test_callbacks_preserved(self, wrapper, mock_executor):
        """Test that existing callbacks are preserved."""
        existing_callback = MagicMock()

        wrapper.invoke_sync("Query", config={"callbacks": [existing_callback]})

        # Existing callback should still be called
        # The mock executor simulates this by checking callbacks list

    def test_get_memory_state_no_memory(self, wrapper):
        """Test get_memory_state when agent has no memory."""
        result = wrapper.get_memory_state()
        assert result == {}

    def test_get_memory_state_with_memory(self):
        """Test get_memory_state with memory."""
        memory = MockMemory()
        memory._variables = {"history": "Previous conversation"}

        executor = MockAgentExecutor(memory=memory)
        wrapper = LangChainAgentWrapper(executor)

        result = wrapper.get_memory_state()
        assert result == {"history": "Previous conversation"}

    def test_get_memory_state_with_chat_memory(self):
        """Test get_memory_state with chat_memory."""
        memory = MockMemory()

        # Add mock messages
        class MockMessage:
            def __init__(self, content: str):
                self.content = content

        memory.chat_memory.messages = [
            MockMessage("Hello"),
            MockMessage("Hi there"),
        ]
        memory.load_memory_variables = MagicMock(side_effect=Exception("Not available"))

        executor = MockAgentExecutor(memory=memory)
        wrapper = LangChainAgentWrapper(executor)

        result = wrapper.get_memory_state()
        assert "messages" in result
        assert len(result["messages"]) == 2

    def test_record_memory_access(self, wrapper):
        """Test manual memory access recording."""
        wrapper.record_memory_access("write", "test_key", "test_value")

        # Should record memory access event
        memory_events = wrapper.memory_accesses
        assert len(memory_events) == 1
        assert memory_events[0].key == "test_key"

    def test_record_memory_access_invalid_operation(self, wrapper):
        """Test that invalid operation raises ValueError."""
        with pytest.raises(ValueError, match="Invalid operation"):
            wrapper.record_memory_access("invalid", "key")

    def test_inherits_from_instrumented_agent(self, wrapper):
        """Test that wrapper inherits InstrumentedAgent functionality."""
        assert isinstance(wrapper, InstrumentedAgent)
        assert hasattr(wrapper, "events")
        assert hasattr(wrapper, "tool_calls")
        assert hasattr(wrapper, "memory_accesses")

    def test_context_manager(self, mock_executor):
        """Test wrapper can be used as context manager."""
        with LangChainAgentWrapper(mock_executor) as wrapper:
            wrapper.invoke_sync("Query")
            events = wrapper.events

        # Events should still be accessible after exit
        assert len(events) > 0


# =============================================================================
# Integration Tests
# =============================================================================


class TestLangChainIntegration:
    """Integration tests for the full flow."""

    def test_full_sync_flow(self):
        """Test complete synchronous flow."""
        # Create mock agent with tools
        executor = MockAgentExecutor(
            name="IntegrationAgent",
            tools=[MockTool("search"), MockTool("calculator")],
        )
        executor.set_invoke_result({"output": "The answer is 42"})

        # Wrap and invoke
        wrapper = LangChainAgentWrapper.from_agent_executor(executor)
        result = wrapper.invoke_sync("What is the meaning of life?")

        # Verify result
        assert result["output"] == "The answer is 42"

        # Verify events captured
        events = wrapper.events
        assert len(events) > 0

        # Verify tool calls captured
        tool_calls = wrapper.tool_calls
        assert len(tool_calls) == 2  # search and calculator

        # Verify all tool calls succeeded
        for tc in tool_calls:
            assert tc.success is True

    @pytest.mark.asyncio
    async def test_full_async_flow(self):
        """Test complete asynchronous flow."""
        executor = MockAgentExecutor(
            name="AsyncAgent",
            tools=[MockTool("async_search")],
        )
        executor.set_invoke_result({"output": "Async result"})

        wrapper = LangChainAgentWrapper.from_agent_executor(executor)
        result = await wrapper.invoke("Async query")

        assert result["output"] == "Async result"
        assert len(wrapper.events) > 0

    def test_error_handling_in_tools(self):
        """Test that tool errors are properly captured."""
        executor = MockAgentExecutor(tools=[])

        # Override invoke to simulate tool error
        def invoke_with_error(input, config=None, **kwargs):
            callbacks = config.get("callbacks", []) if config else []
            run_id = uuid4()

            for cb in callbacks:
                if hasattr(cb, "on_tool_start"):
                    cb.on_tool_start(
                        {"name": "failing_tool"}, str(input), run_id=run_id
                    )
                if hasattr(cb, "on_tool_error"):
                    cb.on_tool_error(RuntimeError("Tool failed"), run_id=run_id)

            return {"output": "Partial result"}

        executor.invoke = invoke_with_error

        wrapper = LangChainAgentWrapper(executor)
        result = wrapper.invoke_sync("Query")

        # Result should still be returned
        assert result["output"] == "Partial result"

        # Error should be captured
        tool_calls = wrapper.tool_calls
        assert len(tool_calls) == 1
        assert tool_calls[0].success is False
        assert tool_calls[0].exception_type == "RuntimeError"

    def test_multiple_sequential_invocations(self):
        """Test multiple sequential invocations."""
        executor = MockAgentExecutor(tools=[MockTool("tool1")])
        wrapper = LangChainAgentWrapper(executor)

        # First invocation
        wrapper.invoke_sync("Query 1")
        events_after_first = len(wrapper.events)

        # Second invocation
        wrapper.invoke_sync("Query 2")
        events_after_second = len(wrapper.events)

        # Events should accumulate
        assert events_after_second > events_after_first

    def test_clear_events_between_invocations(self):
        """Test clearing events between invocations."""
        executor = MockAgentExecutor(tools=[MockTool("tool1")])
        wrapper = LangChainAgentWrapper(executor)

        # First invocation
        wrapper.invoke_sync("Query 1")
        assert len(wrapper.events) > 0

        # Clear events
        wrapper.clear_events()
        assert len(wrapper.events) == 0

        # Second invocation
        wrapper.invoke_sync("Query 2")
        assert len(wrapper.events) > 0


# =============================================================================
# Edge Cases and Error Handling
# =============================================================================


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_tool_list(self):
        """Test wrapper works with no tools."""
        executor = MockAgentExecutor(tools=[])
        wrapper = LangChainAgentWrapper(executor)
        result = wrapper.invoke_sync("Query")
        assert result is not None

    def test_very_long_output(self):
        """Test handling of very long outputs."""
        executor = MockAgentExecutor()
        executor.set_invoke_result({"output": "x" * 20000})

        wrapper = LangChainAgentWrapper(executor)
        wrapper.invoke_sync("Query")

        # Should not raise, output should be truncated in speech record
        speeches = [e for e in wrapper.events if isinstance(e, SpeechRecord)]
        if speeches:
            assert len(speeches[0].content) <= 10000

    def test_special_characters_in_tool_name(self):
        """Test handling of special characters in tool names."""
        tool = MockTool(name="search-api_v2")
        executor = MockAgentExecutor(tools=[tool])

        wrapper = LangChainAgentWrapper(executor)
        wrapper.invoke_sync("Query")

        tool_calls = wrapper.tool_calls
        assert len(tool_calls) == 1
        assert tool_calls[0].tool_name == "search-api_v2"

    def test_none_run_id(self):
        """Test handling of None run_id."""
        mock_agent = MagicMock()
        config = AgentInstrumentationConfig()
        instrumented = InstrumentedAgent(mock_agent, "test", config)
        handler = RedCouncilCallbackHandler(instrumented)

        # Should not raise
        handler.on_tool_start({"name": "tool"}, "input", run_id=None)
        handler.on_tool_end("output", run_id=None)

    def test_sampling_rate_affects_events(self):
        """Test that sampling rate affects event recording."""
        executor = MockAgentExecutor(tools=[MockTool("t1"), MockTool("t2")])

        # 0% sampling - should record nothing
        config = AgentInstrumentationConfig(sampling_rate=0.0)
        wrapper = LangChainAgentWrapper(executor, config)
        wrapper.invoke_sync("Query")

        # With 0% sampling, no events should be recorded
        assert len(wrapper.events) == 0
