# tests/integrations/test_langgraph.py
"""
Tests for LangGraph integration adapter.

These tests use mock objects to simulate LangGraph behavior without
requiring langgraph as a dependency.
"""

import asyncio
import pytest
from typing import Any, Dict, List, Optional

from src.integrations.langgraph_adapter import LangGraphAgentWrapper
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ActionRecord,
)
from src.agents.instrumented import InstrumentedAgent


# =============================================================================
# Mock LangGraph Classes
# =============================================================================


class MockStateGraph:
    """Mock LangGraph StateGraph for testing."""

    def __init__(self, state_schema: type = dict):
        self.state_schema = state_schema
        self.nodes: Dict[str, Any] = {}
        self.edges: List[tuple] = []
        self._compiled = False

    def add_node(self, name: str, func: Any) -> "MockStateGraph":
        """Add a node to the graph."""
        self.nodes[name] = func
        return self

    def add_edge(self, source: str, target: str) -> "MockStateGraph":
        """Add an edge between nodes."""
        self.edges.append((source, target))
        return self

    def set_entry_point(self, node: str) -> "MockStateGraph":
        """Set the entry point."""
        self._entry_point = node
        return self

    def compile(self, **kwargs: Any) -> "MockCompiledGraph":
        """Compile the graph."""
        self._compiled = True
        return MockCompiledGraph(self.nodes, self.edges)


class MockCompiledGraph:
    """Mock LangGraph CompiledGraph for testing."""

    def __init__(
        self,
        nodes: Optional[Dict[str, Any]] = None,
        edges: Optional[List[tuple]] = None,
    ):
        self.nodes = nodes or {}
        self.edges = edges or []
        self._invoke_result: Dict[str, Any] = {"output": "Mock result"}
        self._stream_results: List[Dict[str, Any]] = []

    def set_invoke_result(self, result: Dict[str, Any]) -> None:
        """Set the result that invoke will return."""
        self._invoke_result = result

    def set_stream_results(self, results: List[Dict[str, Any]]) -> None:
        """Set the results that stream will yield."""
        self._stream_results = results

    def invoke(
        self,
        input: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Sync invoke method."""
        # Execute nodes if any
        state = input.copy()
        for node_name, node_func in self.nodes.items():
            result = node_func(state)
            if result:
                state.update(result)
        return self._invoke_result

    async def ainvoke(
        self,
        input: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Async invoke method."""
        await asyncio.sleep(0.01)
        return self.invoke(input, config, **kwargs)

    def stream(
        self,
        input: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """Stream method that yields intermediate states."""
        if self._stream_results:
            for result in self._stream_results:
                yield result
        else:
            # Default: yield input and output
            yield {"step": "start", **input}
            yield {"step": "end", **self._invoke_result}

    async def astream(
        self,
        input: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """Async stream method."""
        for chunk in self.stream(input, config, **kwargs):
            await asyncio.sleep(0.001)
            yield chunk


# =============================================================================
# LangGraphAgentWrapper Tests
# =============================================================================


class TestLangGraphAgentWrapperInit:
    """Tests for LangGraphAgentWrapper initialization."""

    def test_init_requires_graph(self):
        """Test that wrapper requires a graph."""
        with pytest.raises(ValueError, match="cannot be None"):
            LangGraphAgentWrapper(None)

    def test_init_validates_interface(self):
        """Test that wrapper validates graph interface."""
        bad_graph = object()  # No add_node, compile, invoke, or stream
        with pytest.raises(TypeError, match="must be a LangGraph"):
            LangGraphAgentWrapper(bad_graph)

    def test_init_with_state_graph(self):
        """Test initialization with StateGraph."""
        graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(graph)
        assert wrapper.agent is graph
        assert "langgraph:" in wrapper.name

    def test_init_with_compiled_graph(self):
        """Test initialization with CompiledGraph."""
        graph = MockCompiledGraph()
        wrapper = LangGraphAgentWrapper(graph)
        assert wrapper.agent is graph
        assert wrapper._is_compiled is True

    def test_init_with_default_config(self):
        """Test that wrapper uses default config if none provided."""
        graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(graph)
        assert wrapper.config is not None
        assert wrapper.config.enable_tool_interception is True

    def test_init_with_custom_config(self):
        """Test that wrapper uses provided config."""
        graph = MockStateGraph()
        config = AgentInstrumentationConfig(
            enable_tool_interception=False,
            sampling_rate=0.5,
        )
        wrapper = LangGraphAgentWrapper(graph, config)
        assert wrapper.config.enable_tool_interception is False
        assert wrapper.config.sampling_rate == 0.5

    def test_from_state_graph_factory(self):
        """Test factory method."""
        graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper.from_state_graph(graph)
        assert wrapper.agent is graph
        assert isinstance(wrapper, LangGraphAgentWrapper)


class TestLangGraphAgentWrapperNodeWrapping:
    """Tests for node wrapping functionality."""

    @pytest.fixture
    def wrapper(self):
        """Create a wrapper with StateGraph."""
        return LangGraphAgentWrapper(MockStateGraph())

    def test_wrap_node_sync(self, wrapper):
        """Test wrapping a synchronous node."""

        def my_node(state: Dict[str, Any]) -> Dict[str, Any]:
            return {"output": state.get("input", "").upper()}

        wrapped = wrapper.wrap_node("my_node", my_node)
        assert wrapped is not my_node
        assert "my_node" in wrapper._wrapped_nodes

    def test_wrap_node_async(self, wrapper):
        """Test wrapping an asynchronous node."""

        async def my_async_node(state: Dict[str, Any]) -> Dict[str, Any]:
            await asyncio.sleep(0.01)
            return {"output": state.get("input", "").upper()}

        wrapped = wrapper.wrap_node("async_node", my_async_node)
        assert wrapped is not my_async_node
        assert "async_node" in wrapper._wrapped_nodes

    def test_wrap_node_prevents_double_wrap(self, wrapper, caplog):
        """Test that double wrapping is prevented."""

        def my_node(state):
            return {"result": "ok"}

        wrapper.wrap_node("my_node", my_node)  # First wrap
        wrapped2 = wrapper.wrap_node("my_node", my_node)

        # Should return original function on second wrap
        assert wrapped2 is my_node
        assert "already wrapped" in caplog.text

    def test_wrapped_node_records_events(self, wrapper):
        """Test that wrapped node records tool call events."""

        def my_node(state: Dict[str, Any]) -> Dict[str, Any]:
            return {"output": "result"}

        wrapped = wrapper.wrap_node("test_node", my_node)
        result = wrapped({"input": "test"})

        assert result == {"output": "result"}

        # Check events were recorded
        tool_calls = wrapper.tool_calls
        assert len(tool_calls) >= 1

        # Find the node execution event
        node_calls = [tc for tc in tool_calls if tc.tool_name == "node:test_node"]
        assert len(node_calls) == 1
        assert node_calls[0].success is True

    def test_wrapped_node_records_errors(self, wrapper):
        """Test that wrapped node records errors."""

        def failing_node(state: Dict[str, Any]) -> Dict[str, Any]:
            raise ValueError("Node failed")

        wrapped = wrapper.wrap_node("failing_node", failing_node)

        with pytest.raises(ValueError, match="Node failed"):
            wrapped({"input": "test"})

        # Check error was recorded
        tool_calls = wrapper.tool_calls
        node_calls = [tc for tc in tool_calls if tc.tool_name == "node:failing_node"]
        assert len(node_calls) == 1
        assert node_calls[0].success is False
        assert node_calls[0].exception_type == "ValueError"

    @pytest.mark.asyncio
    async def test_wrapped_async_node_records_events(self, wrapper):
        """Test that wrapped async node records events."""

        async def async_node(state: Dict[str, Any]) -> Dict[str, Any]:
            await asyncio.sleep(0.01)
            return {"output": "async result"}

        wrapped = wrapper.wrap_node("async_node", async_node)
        result = await wrapped({"input": "test"})

        assert result == {"output": "async result"}

        # Check events were recorded
        tool_calls = wrapper.tool_calls
        node_calls = [tc for tc in tool_calls if tc.tool_name == "node:async_node"]
        assert len(node_calls) == 1
        assert node_calls[0].success is True


class TestLangGraphAgentWrapperInvoke:
    """Tests for invoke methods."""

    @pytest.fixture
    def compiled_wrapper(self):
        """Create a wrapper with compiled graph."""
        graph = MockCompiledGraph()
        graph.set_invoke_result({"output": "test result"})
        return LangGraphAgentWrapper(graph)

    def test_invoke_sync(self, compiled_wrapper):
        """Test synchronous invoke."""
        result = compiled_wrapper.invoke_sync({"input": "hello"})
        assert result == {"output": "test result"}

    def test_invoke_sync_records_events(self, compiled_wrapper):
        """Test that invoke_sync records events."""
        compiled_wrapper.invoke_sync({"input": "hello"})

        # Should have events
        events = compiled_wrapper.events
        assert len(events) > 0

        # Check for graph invoke tool call
        tool_calls = compiled_wrapper.tool_calls
        invoke_calls = [tc for tc in tool_calls if "graph:invoke" in tc.tool_name]
        assert len(invoke_calls) >= 1

    @pytest.mark.asyncio
    async def test_invoke_async(self, compiled_wrapper):
        """Test asynchronous invoke."""
        result = await compiled_wrapper.invoke({"input": "hello"})
        assert result == {"output": "test result"}

    @pytest.mark.asyncio
    async def test_invoke_async_records_events(self, compiled_wrapper):
        """Test that async invoke records events."""
        await compiled_wrapper.invoke({"input": "hello"})

        events = compiled_wrapper.events
        assert len(events) > 0

    def test_invoke_with_state_graph_compiles(self):
        """Test that invoke compiles StateGraph if needed."""
        state_graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(state_graph)

        result = wrapper.invoke_sync({"input": "test"})
        assert result is not None


class TestLangGraphAgentWrapperStream:
    """Tests for stream methods."""

    @pytest.fixture
    def streaming_wrapper(self):
        """Create a wrapper with streaming results."""
        graph = MockCompiledGraph()
        graph.set_stream_results(
            [
                {"step": 1, "data": "first"},
                {"step": 2, "data": "second"},
                {"step": 3, "data": "third"},
            ]
        )
        return LangGraphAgentWrapper(graph)

    def test_stream_yields_chunks(self, streaming_wrapper):
        """Test that stream yields intermediate chunks."""
        chunks = list(streaming_wrapper.stream({"input": "test"}))
        assert len(chunks) == 3
        assert chunks[0]["step"] == 1
        assert chunks[2]["step"] == 3

    def test_stream_records_events(self, streaming_wrapper):
        """Test that stream records events."""
        # Consume the stream
        list(streaming_wrapper.stream({"input": "test"}))

        # Check for stream completion action
        actions = [e for e in streaming_wrapper.events if isinstance(e, ActionRecord)]
        stream_actions = [a for a in actions if a.action_type == "graph_stream"]
        assert len(stream_actions) >= 1

    @pytest.mark.asyncio
    async def test_astream_yields_chunks(self, streaming_wrapper):
        """Test that async stream yields chunks."""
        chunks = []
        async for chunk in streaming_wrapper.astream({"input": "test"}):
            chunks.append(chunk)

        assert len(chunks) == 3

    @pytest.mark.asyncio
    async def test_astream_records_events(self, streaming_wrapper):
        """Test that async stream records events."""
        # Consume the stream
        async for _ in streaming_wrapper.astream({"input": "test"}):
            pass

        # Check for astream completion action
        actions = [e for e in streaming_wrapper.events if isinstance(e, ActionRecord)]
        astream_actions = [a for a in actions if a.action_type == "graph_astream"]
        assert len(astream_actions) >= 1


class TestLangGraphAgentWrapperStateMonitoring:
    """Tests for state monitoring functionality."""

    @pytest.fixture
    def wrapper(self):
        """Create a wrapper."""
        return LangGraphAgentWrapper(MockCompiledGraph())

    def test_state_access_recorded_as_memory(self, wrapper):
        """Test that state access is recorded as memory events."""
        wrapper.invoke_sync({"input": "test", "data": "value"})

        # Check memory access events
        memory_events = wrapper.memory_accesses
        assert len(memory_events) > 0

        # Check state keys are recorded
        keys = [e.key for e in memory_events]
        assert any("state.input" in k for k in keys)

    def test_sensitive_state_keys_redacted(self, wrapper):
        """Test that sensitive state keys are redacted."""
        wrapper.invoke_sync(
            {
                "input": "test",
                "password": "secret123",
                "api_key": "key123",
            }
        )

        # Check memory events for sensitive keys
        memory_events = wrapper.memory_accesses
        password_events = [e for e in memory_events if "password" in e.key]
        api_key_events = [e for e in memory_events if "api_key" in e.key]

        # Values should be masked (either ****** or <SENSITIVE_DATA_REDACTED>)
        for event in password_events + api_key_events:
            assert event.value_preview in ("******", "<SENSITIVE_DATA_REDACTED>")

    def test_get_state_history(self, wrapper):
        """Test getting state history."""

        # First, we need a wrapper that records state changes
        def node_func(state):
            return {"output": "result", "step": 1}

        state_graph = MockStateGraph()
        state_graph.add_node("processor", node_func)
        w = LangGraphAgentWrapper(state_graph)

        # Wrap and execute a node manually to generate state history
        wrapped = w.wrap_node("test", node_func)
        wrapped({"input": "hello"})

        # Get state history
        history = w.get_state_history()
        assert isinstance(history, list)


class TestLangGraphAgentWrapperCompilation:
    """Tests for graph compilation."""

    def test_compile_state_graph(self):
        """Test compiling a StateGraph through wrapper."""
        state_graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(state_graph)

        compiled = wrapper.compile()
        assert compiled is not None
        assert wrapper._is_compiled is True

    def test_compile_already_compiled_warns(self, caplog):
        """Test that compiling already compiled graph warns."""
        compiled_graph = MockCompiledGraph()
        wrapper = LangGraphAgentWrapper(compiled_graph)

        wrapper.compile()
        assert "already compiled" in caplog.text

    def test_add_node_wraps_automatically(self):
        """Test that add_node wraps the node function."""
        state_graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(state_graph)

        def my_node(state):
            return {"result": "ok"}

        wrapper.add_node("my_node", my_node)

        assert "my_node" in wrapper._wrapped_nodes
        assert "my_node" in state_graph.nodes

    def test_add_node_returns_self(self):
        """Test that add_node returns self for chaining."""
        state_graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(state_graph)

        result = wrapper.add_node("n1", lambda s: s).add_node("n2", lambda s: s)
        assert result is wrapper

    def test_add_node_to_compiled_raises(self):
        """Test that adding node to compiled graph raises."""
        compiled_graph = MockCompiledGraph()
        wrapper = LangGraphAgentWrapper(compiled_graph)

        with pytest.raises(RuntimeError, match="Cannot add nodes"):
            wrapper.add_node("node", lambda s: s)


class TestLangGraphAgentWrapperStats:
    """Tests for statistics methods."""

    def test_get_node_execution_stats(self):
        """Test getting node execution statistics."""
        state_graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(state_graph)

        def node1(state):
            return {"step": 1}

        def node2(state):
            return {"step": 2}

        wrapped1 = wrapper.wrap_node("node1", node1)
        wrapped2 = wrapper.wrap_node("node2", node2)

        # Execute nodes
        wrapped1({"input": "test"})
        wrapped1({"input": "test2"})
        wrapped2({"input": "test"})

        stats = wrapper.get_node_execution_stats()

        assert "node1" in stats
        assert stats["node1"]["count"] == 2
        assert "node2" in stats
        assert stats["node2"]["count"] == 1
        assert "avg_duration_ms" in stats["node1"]
        assert "error_rate" in stats["node1"]


class TestLangGraphAgentWrapperInheritance:
    """Tests for InstrumentedAgent inheritance."""

    def test_inherits_from_instrumented_agent(self):
        """Test that wrapper inherits InstrumentedAgent functionality."""
        graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(graph)

        assert isinstance(wrapper, InstrumentedAgent)
        assert hasattr(wrapper, "events")
        assert hasattr(wrapper, "tool_calls")
        assert hasattr(wrapper, "memory_accesses")

    def test_context_manager(self):
        """Test wrapper can be used as context manager."""
        graph = MockCompiledGraph()

        with LangGraphAgentWrapper(graph) as wrapper:
            wrapper.invoke_sync({"input": "test"})
            events = wrapper.events

        # Events should still be accessible after exit
        assert len(events) > 0

    def test_clear_events(self):
        """Test clearing events."""
        graph = MockCompiledGraph()
        wrapper = LangGraphAgentWrapper(graph)

        wrapper.invoke_sync({"input": "test"})
        assert len(wrapper.events) > 0

        wrapper.clear_events()
        assert len(wrapper.events) == 0


class TestLangGraphIntegration:
    """Integration tests for full workflow."""

    def test_full_sync_flow(self):
        """Test complete synchronous flow."""
        # Create a mock workflow
        state_graph = MockStateGraph()

        def agent_node(state: Dict[str, Any]) -> Dict[str, Any]:
            return {"response": f"Processed: {state.get('input', '')}"}

        def tool_node(state: Dict[str, Any]) -> Dict[str, Any]:
            return {"tool_result": "tool executed"}

        # Wrap the graph
        wrapper = LangGraphAgentWrapper.from_state_graph(state_graph)

        # Add nodes with automatic wrapping
        wrapper.add_node("agent", agent_node)
        wrapper.add_node("tool", tool_node)

        # Compile
        wrapper.compile()

        # Invoke
        wrapper.invoke_sync({"input": "hello world"})

        # Verify events captured
        events = wrapper.events
        assert len(events) > 0

        # Verify tool calls captured
        tool_calls = wrapper.tool_calls
        assert len(tool_calls) >= 1

    @pytest.mark.asyncio
    async def test_full_async_flow(self):
        """Test complete asynchronous flow."""
        # Use compiled graph directly for async test to avoid mock limitations
        compiled_graph = MockCompiledGraph()
        compiled_graph.set_invoke_result({"response": "async processed"})

        wrapper = LangGraphAgentWrapper(compiled_graph)
        result = await wrapper.invoke({"input": "test"})

        assert result == {"response": "async processed"}
        assert len(wrapper.events) > 0

    def test_error_handling_in_nodes(self):
        """Test that node errors are properly captured."""
        state_graph = MockStateGraph()

        def failing_node(state: Dict[str, Any]) -> Dict[str, Any]:
            raise RuntimeError("Node execution failed")

        wrapper = LangGraphAgentWrapper.from_state_graph(state_graph)
        wrapped = wrapper.wrap_node("failing", failing_node)

        with pytest.raises(RuntimeError):
            wrapped({"input": "test"})

        # Error should be captured
        tool_calls = wrapper.tool_calls
        failing_calls = [tc for tc in tool_calls if "failing" in tc.tool_name]
        assert len(failing_calls) == 1
        assert failing_calls[0].success is False
        assert failing_calls[0].exception_type == "RuntimeError"

    def test_sampling_rate_affects_events(self):
        """Test that sampling rate affects event recording."""
        state_graph = MockStateGraph()

        def my_node(state):
            return {"result": "ok"}

        # 0% sampling - should record nothing
        config = AgentInstrumentationConfig(sampling_rate=0.0)
        wrapper = LangGraphAgentWrapper(state_graph, config)

        wrapped = wrapper.wrap_node("node", my_node)
        wrapped({"input": "test"})

        # With 0% sampling, no events should be recorded
        assert len(wrapper.events) == 0


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_state(self):
        """Test handling of empty state."""
        graph = MockCompiledGraph()
        wrapper = LangGraphAgentWrapper(graph)

        result = wrapper.invoke_sync({})
        assert result is not None

    def test_non_dict_input(self):
        """Test handling of non-dict input in state recording."""
        graph = MockCompiledGraph()
        wrapper = LangGraphAgentWrapper(graph)

        # The wrapper records state access but the actual invoke passes through
        # For non-dict input, state recording is skipped gracefully
        # We test with dict input that has non-dict values
        result = wrapper.invoke_sync({"input": "string input", "raw": 12345})
        assert result is not None

    def test_large_state(self):
        """Test handling of large state objects."""
        graph = MockCompiledGraph()
        wrapper = LangGraphAgentWrapper(graph)

        large_state = {f"key_{i}": f"value_{i}" for i in range(100)}
        result = wrapper.invoke_sync(large_state)

        # Should not crash, state keys should be limited in events
        assert result is not None
        events = wrapper.events
        assert len(events) > 0

    def test_nested_state_values(self):
        """Test handling of nested state values."""
        graph = MockCompiledGraph()
        wrapper = LangGraphAgentWrapper(graph)

        nested_state = {
            "input": "test",
            "nested": {"level1": {"level2": "deep value"}},
            "list": [1, 2, 3, {"nested": True}],
        }

        result = wrapper.invoke_sync(nested_state)
        assert result is not None

    def test_special_characters_in_node_name(self):
        """Test handling of special characters in node names."""
        state_graph = MockStateGraph()
        wrapper = LangGraphAgentWrapper(state_graph)

        def my_node(state):
            return {"result": "ok"}

        # Node name with special chars (valid for LangGraph)
        wrapped = wrapper.wrap_node("agent-v2.1", my_node)
        wrapped({"input": "test"})

        tool_calls = wrapper.tool_calls
        assert any("agent-v2.1" in tc.tool_name for tc in tool_calls)

    def test_graph_without_invoke_method(self):
        """Test handling of graph without invoke method."""

        class MinimalGraph:
            def add_node(self, name, func):
                pass

            def compile(self):
                return self

        graph = MinimalGraph()
        wrapper = LangGraphAgentWrapper(graph)

        with pytest.raises(NotImplementedError, match="no invoke"):
            wrapper.invoke_sync({"input": "test"})
