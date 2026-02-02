# src/integrations/langgraph_adapter.py
"""
LangGraph integration adapter for The Red Council Agent Security Testing.

This module provides LangGraphAgentWrapper which wraps LangGraph StateGraph
and CompiledGraph instances for security monitoring. It captures node executions
as tool calls, state transitions as memory operations, and action sequences.

Usage:
    from langgraph.graph import StateGraph
    from src.integrations.langgraph_adapter import LangGraphAgentWrapper
    from src.core.agent_schemas import AgentInstrumentationConfig

    # Wrap an existing graph
    config = AgentInstrumentationConfig()
    wrapper = LangGraphAgentWrapper.from_state_graph(graph, config)

    # Run the graph
    result = await wrapper.invoke({"input": "Hello"})

    # Get events for analysis
    events = wrapper.events

Note: langgraph is an optional dependency. This module uses runtime type checking
to work with or without langgraph installed.
"""

import asyncio
import inspect
import logging
import time
from typing import Any, Callable, Dict, List, Optional, Set, TypeVar, Union
from src.agents.instrumented import InstrumentedAgent
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessOperation,
)

logger = logging.getLogger(__name__)

# Type variable for graph state
StateT = TypeVar("StateT", bound=Dict[str, Any])

# Maximum length for state preview in memory events
MAX_STATE_PREVIEW_LENGTH = 256


class LangGraphAgentWrapper(InstrumentedAgent):
    """
    Wrapper for LangGraph StateGraph/CompiledGraph for security instrumentation.

    This class extends InstrumentedAgent to automatically intercept and record
    all node executions, state transitions, and graph actions from a LangGraph workflow.

    Features:
    - Node execution interception as tool calls
    - State monitoring as memory access events
    - State transitions recorded as ActionRecords
    - Support for both StateGraph and CompiledGraph
    - Manual node wrapping via wrap_node()

    Usage:
        from langgraph.graph import StateGraph
        from src.integrations.langgraph_adapter import LangGraphAgentWrapper

        # Method 1: Factory method (recommended)
        wrapper = LangGraphAgentWrapper.from_state_graph(graph)

        # Method 2: Direct instantiation
        config = AgentInstrumentationConfig()
        wrapper = LangGraphAgentWrapper(compiled_graph, config)

        # Run the graph
        result = await wrapper.invoke({"input": "Hello"})

        # Get recorded events for analysis
        events = wrapper.events
        tool_calls = wrapper.tool_calls
    """

    def __init__(
        self,
        graph: Any,  # StateGraph or CompiledGraph
        config: Optional[AgentInstrumentationConfig] = None,
    ):
        """
        Initialize the LangGraph wrapper.

        Args:
            graph: A LangGraph StateGraph or CompiledGraph instance.
            config: Optional instrumentation configuration. Defaults to standard config.

        Raises:
            ValueError: If graph is None.
            TypeError: If graph doesn't have expected LangGraph interface.
        """
        if graph is None:
            raise ValueError("graph cannot be None")

        # Validate graph has expected interface
        is_state_graph = hasattr(graph, "add_node") and hasattr(graph, "compile")
        is_compiled = hasattr(graph, "invoke") or hasattr(graph, "stream")

        if not (is_state_graph or is_compiled):
            raise TypeError(
                "graph must be a LangGraph StateGraph or CompiledGraph. "
                "Expected 'add_node'/'compile' (StateGraph) or "
                "'invoke'/'stream' (CompiledGraph)."
            )

        if config is None:
            config = AgentInstrumentationConfig()

        # Store original graph
        self._original_graph = graph

        # Track if this is a compiled graph
        self._is_compiled = is_compiled and not is_state_graph

        # Determine graph name
        graph_name = getattr(graph, "name", None) or type(graph).__name__

        # Initialize parent
        super().__init__(
            agent=graph,
            name=f"langgraph:{graph_name}",
            config=config,
        )

        # Track wrapped nodes
        self._wrapped_nodes: Set[str] = set()

        # Track state history for memory monitoring
        self._previous_state: Optional[Dict[str, Any]] = None

        # Node execution tracking
        self._node_start_times: Dict[str, float] = {}

    @classmethod
    def from_state_graph(
        cls,
        graph: Any,  # StateGraph
        config: Optional[AgentInstrumentationConfig] = None,
    ) -> "LangGraphAgentWrapper":
        """
        Create a LangGraphAgentWrapper from a StateGraph.

        This is the recommended way to create a wrapper as it handles
        all setup automatically.

        Args:
            graph: A LangGraph StateGraph instance.
            config: Optional instrumentation configuration.

        Returns:
            A configured LangGraphAgentWrapper instance.

        Example:
            from langgraph.graph import StateGraph

            builder = StateGraph(dict)
            builder.add_node("agent", agent_node)
            wrapper = LangGraphAgentWrapper.from_state_graph(builder)
            compiled = wrapper.compile()  # Compile after wrapping
            result = compiled.invoke({"input": "Hello"})
        """
        return cls(graph=graph, config=config)

    def wrap_node(
        self,
        node_name: str,
        node_func: Callable[..., Any],
    ) -> Callable[..., Any]:
        """
        Wrap a node function for instrumentation.

        This method creates a wrapper around a node function that records
        execution as a tool call event. Use this for manual node wrapping
        when adding nodes to a graph.

        Args:
            node_name: Name of the node (used as tool_name in events).
            node_func: The node function to wrap.

        Returns:
            A wrapped function that records events.

        Example:
            def my_node(state):
                return {"output": state["input"].upper()}

            wrapped = wrapper.wrap_node("my_node", my_node)
            graph.add_node("my_node", wrapped)
        """
        if node_name in self._wrapped_nodes:
            logger.warning(f"Node '{node_name}' is already wrapped, returning original")
            return node_func

        self._wrapped_nodes.add(node_name)

        if inspect.iscoroutinefunction(node_func):
            return self._wrap_async_node(node_name, node_func)
        else:
            return self._wrap_sync_node(node_name, node_func)

    def _wrap_sync_node(
        self,
        node_name: str,
        node_func: Callable[..., Any],
    ) -> Callable[..., Any]:
        """Wrap a synchronous node function."""

        def wrapped_node(state: Dict[str, Any], *args: Any, **kwargs: Any) -> Any:
            start_time = time.perf_counter()
            success = True
            exception_type = None
            result = None

            # Record state before execution
            self._record_state_access(state, f"node:{node_name}:input")

            try:
                result = node_func(state, *args, **kwargs)
                return result
            except Exception as e:
                success = False
                exception_type = type(e).__name__
                raise
            finally:
                duration_ms = (time.perf_counter() - start_time) * 1000

                # Record tool call event for node execution
                self._record_node_execution(
                    node_name=node_name,
                    state=state,
                    result=result,
                    duration_ms=duration_ms,
                    success=success,
                    exception_type=exception_type,
                )

                # Record state after execution if successful
                if success and result is not None:
                    self._record_state_access(result, f"node:{node_name}:output")
                    self._record_state_transition(node_name, state, result)

        return wrapped_node

    def _wrap_async_node(
        self,
        node_name: str,
        node_func: Callable[..., Any],
    ) -> Callable[..., Any]:
        """Wrap an asynchronous node function."""

        async def wrapped_node(state: Dict[str, Any], *args: Any, **kwargs: Any) -> Any:
            start_time = time.perf_counter()
            success = True
            exception_type = None
            result = None

            # Record state before execution
            self._record_state_access(state, f"node:{node_name}:input")

            try:
                result = await node_func(state, *args, **kwargs)
                return result
            except Exception as e:
                success = False
                exception_type = type(e).__name__
                raise
            finally:
                duration_ms = (time.perf_counter() - start_time) * 1000

                # Record tool call event for node execution
                self._record_node_execution(
                    node_name=node_name,
                    state=state,
                    result=result,
                    duration_ms=duration_ms,
                    success=success,
                    exception_type=exception_type,
                )

                # Record state after execution if successful
                if success and result is not None:
                    self._record_state_access(result, f"node:{node_name}:output")
                    self._record_state_transition(node_name, state, result)

        return wrapped_node

    def _record_node_execution(
        self,
        node_name: str,
        state: Dict[str, Any],
        result: Any,
        duration_ms: float,
        success: bool,
        exception_type: Optional[str],
    ) -> None:
        """Record a node execution as a tool call event."""
        if not self.config.enable_tool_interception:
            return

        try:
            # Prepare arguments (state keys as preview)
            state_keys = list(state.keys()) if isinstance(state, dict) else []
            arguments = {
                "positional": [],
                "keyword": {"state_keys": state_keys[:10]},  # Limit for safety
            }

            # Prepare result preview
            result_preview = None
            if success and result is not None:
                result_preview = self._safe_state_repr(result)

            event = ToolCallEvent(
                session_id=self._session_id,
                tool_name=f"node:{node_name}",
                arguments=arguments,
                result=result_preview,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )
            self._add_event(event)
        except Exception as e:
            logger.error(f"Failed to record node execution event: {type(e).__name__}")

    def _record_state_access(
        self,
        state: Dict[str, Any],
        context: str,
    ) -> None:
        """Record state access as memory access events."""
        if not self.config.enable_memory_monitoring:
            return

        if not isinstance(state, dict):
            return

        try:
            # Record each key as a memory access
            for key, value in state.items():
                is_read = ":input" in context
                operation = (
                    MemoryAccessOperation.READ
                    if is_read
                    else MemoryAccessOperation.WRITE
                )

                # Detect sensitive keys
                lower_key = key.lower()
                sensitive = any(
                    p in lower_key
                    for p in ["password", "secret", "api_key", "token", "credential"]
                )

                value_preview = "******" if sensitive else self._safe_state_repr(value)

                self.wrap_memory_access(
                    operation=operation,
                    key=f"state.{key}",
                    value=value_preview,
                )
        except Exception as e:
            logger.error(f"Failed to record state access: {type(e).__name__}")

    def _record_state_transition(
        self,
        node_name: str,
        input_state: Dict[str, Any],
        output_state: Any,
    ) -> None:
        """Record a state transition as an ActionRecord."""
        try:
            # Determine what changed
            changes: List[str] = []
            if isinstance(output_state, dict) and isinstance(input_state, dict):
                for key in output_state:
                    if key not in input_state:
                        changes.append(f"+{key}")
                    elif output_state[key] != input_state.get(key):
                        changes.append(f"~{key}")

            changes_summary = ", ".join(changes[:5])
            if len(changes) > 5:
                changes_summary += f" (+{len(changes) - 5} more)"

            desc = (
                f"Node '{node_name}' modified state: {changes_summary or 'no changes'}"
            )
            self.record_action(
                action_type="state_transition",
                description=desc,
                target=node_name,
            )
        except Exception as e:
            logger.error(f"Failed to record state transition: {type(e).__name__}")

    def _safe_state_repr(
        self, obj: Any, max_len: int = MAX_STATE_PREVIEW_LENGTH
    ) -> str:
        """Safely represent state object as a string with truncation."""
        try:
            if isinstance(obj, dict):
                # Show keys only for dict
                keys = list(obj.keys())
                if len(keys) > 5:
                    s = f"{{keys: {keys[:5]}... (+{len(keys) - 5})}}"
                else:
                    s = f"{{keys: {keys}}}"
            elif isinstance(obj, (list, tuple)):
                s = f"[{len(obj)} items]"
            else:
                s = repr(obj)

            if len(s) > max_len:
                return s[: max_len - 3] + "..."
            return s
        except Exception:
            return "<unrepresentable>"

    async def invoke(
        self,
        input: Union[Dict[str, Any], Any],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Invoke the LangGraph graph asynchronously with instrumentation.

        Args:
            input: The input to the graph (typically a state dict).
            config: Optional LangGraph config dict.
            **kwargs: Additional arguments passed to the graph.

        Returns:
            The graph's final state/output.

        Example:
            result = await wrapper.invoke({"input": "Hello, world!"})
            print(result)
        """
        # Get the compiled graph
        graph = self._get_compiled_graph()

        # Record initial state
        if isinstance(input, dict):
            self._record_state_access(input, "graph:invoke:input")

        start_time = time.perf_counter()
        success = True
        exception_type = None
        result = None

        try:
            # Check for async invoke
            if hasattr(graph, "ainvoke"):
                result = await graph.ainvoke(input, config=config, **kwargs)
            elif hasattr(graph, "invoke"):
                # Run sync invoke in executor to avoid blocking
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None, lambda: graph.invoke(input, config=config, **kwargs)
                )
            else:
                raise NotImplementedError("Graph has no invoke or ainvoke method")

            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Record graph execution as a tool call
            self._record_node_execution(
                node_name="graph:invoke",
                state=input if isinstance(input, dict) else {"input": input},
                result=result,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )

            # Record final state
            if success and isinstance(result, dict):
                self._record_state_access(result, "graph:invoke:output")

    def invoke_sync(
        self,
        input: Union[Dict[str, Any], Any],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Invoke the LangGraph graph synchronously with instrumentation.

        Args:
            input: The input to the graph (typically a state dict).
            config: Optional LangGraph config dict.
            **kwargs: Additional arguments passed to the graph.

        Returns:
            The graph's final state/output.

        Example:
            result = wrapper.invoke_sync({"input": "Hello, world!"})
            print(result)
        """
        # Get the compiled graph
        graph = self._get_compiled_graph()

        # Record initial state
        if isinstance(input, dict):
            self._record_state_access(input, "graph:invoke:input")

        start_time = time.perf_counter()
        success = True
        exception_type = None
        result = None

        try:
            if hasattr(graph, "invoke"):
                result = graph.invoke(input, config=config, **kwargs)
            else:
                raise NotImplementedError("Graph has no invoke method")

            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Record graph execution as a tool call
            self._record_node_execution(
                node_name="graph:invoke",
                state=input if isinstance(input, dict) else {"input": input},
                result=result,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )

            # Record final state
            if success and isinstance(result, dict):
                self._record_state_access(result, "graph:invoke:output")

    def stream(
        self,
        input: Union[Dict[str, Any], Any],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Stream the LangGraph graph execution with instrumentation.

        This method wraps the graph's stream method to capture
        intermediate states as memory access events.

        Args:
            input: The input to the graph.
            config: Optional LangGraph config dict.
            **kwargs: Additional arguments.

        Yields:
            Intermediate states from the graph.
        """
        graph = self._get_compiled_graph()

        # Record initial state
        if isinstance(input, dict):
            self._record_state_access(input, "graph:stream:input")

        start_time = time.perf_counter()
        step_count = 0

        try:
            if hasattr(graph, "stream"):
                for chunk in graph.stream(input, config=config, **kwargs):
                    step_count += 1

                    # Record intermediate state
                    if isinstance(chunk, dict):
                        self._record_state_access(
                            chunk, f"graph:stream:step:{step_count}"
                        )

                    yield chunk
            else:
                raise NotImplementedError("Graph has no stream method")
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Record stream completion
            desc = f"Graph stream completed: {step_count} steps, {duration_ms:.2f}ms"
            self.record_action(
                action_type="graph_stream",
                description=desc,
                target="graph:stream",
            )

    async def astream(
        self,
        input: Union[Dict[str, Any], Any],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Async stream the LangGraph graph execution with instrumentation.

        Args:
            input: The input to the graph.
            config: Optional LangGraph config dict.
            **kwargs: Additional arguments.

        Yields:
            Intermediate states from the graph.
        """
        graph = self._get_compiled_graph()

        # Record initial state
        if isinstance(input, dict):
            self._record_state_access(input, "graph:astream:input")

        start_time = time.perf_counter()
        step_count = 0

        try:
            if hasattr(graph, "astream"):
                async for chunk in graph.astream(input, config=config, **kwargs):
                    step_count += 1

                    # Record intermediate state
                    if isinstance(chunk, dict):
                        self._record_state_access(
                            chunk, f"graph:astream:step:{step_count}"
                        )

                    yield chunk
            elif hasattr(graph, "stream"):
                # Fallback to sync stream in executor
                for chunk in graph.stream(input, config=config, **kwargs):
                    step_count += 1
                    if isinstance(chunk, dict):
                        self._record_state_access(
                            chunk, f"graph:astream:step:{step_count}"
                        )
                    yield chunk
            else:
                raise NotImplementedError("Graph has no stream or astream method")
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Record stream completion
            desc = (
                f"Graph async stream completed: {step_count} steps, {duration_ms:.2f}ms"
            )
            self.record_action(
                action_type="graph_astream",
                description=desc,
                target="graph:astream",
            )

    def _get_compiled_graph(self) -> Any:
        """Get the compiled graph, compiling if necessary."""
        if self._is_compiled:
            return self._original_graph

        # StateGraph needs to be compiled
        if hasattr(self._original_graph, "compile"):
            return self._original_graph.compile()

        return self._original_graph

    def compile(self, **kwargs: Any) -> Any:
        """
        Compile the underlying StateGraph if not already compiled.

        This method allows using the wrapper like a StateGraph builder,
        calling compile() after adding all nodes.

        Args:
            **kwargs: Arguments passed to the graph's compile method.

        Returns:
            The compiled graph (wrapper maintains reference).

        Example:
            wrapper = LangGraphAgentWrapper.from_state_graph(builder)
            # ... add wrapped nodes ...
            compiled = wrapper.compile()
            result = compiled.invoke({"input": "Hello"})
        """
        if self._is_compiled:
            logger.warning("Graph is already compiled")
            return self._original_graph

        if hasattr(self._original_graph, "compile"):
            compiled = self._original_graph.compile(**kwargs)
            # Update internal state
            self._original_graph = compiled
            self._is_compiled = True
            return compiled

        raise TypeError("Graph does not support compilation")

    def add_node(
        self,
        node_name: str,
        node_func: Callable[..., Any],
    ) -> "LangGraphAgentWrapper":
        """
        Add a node to the graph with automatic instrumentation.

        This is a convenience method that wraps the node and adds it
        to the underlying StateGraph.

        Args:
            node_name: Name of the node.
            node_func: The node function.

        Returns:
            Self for chaining.

        Example:
            wrapper = LangGraphAgentWrapper.from_state_graph(builder)
            wrapper.add_node("agent", agent_func)
            wrapper.add_node("tool", tool_func)
        """
        if self._is_compiled:
            raise RuntimeError("Cannot add nodes to a compiled graph")

        if not hasattr(self._original_graph, "add_node"):
            raise TypeError("Graph does not support add_node")

        # Wrap the node function
        wrapped = self.wrap_node(node_name, node_func)

        # Add to underlying graph
        self._original_graph.add_node(node_name, wrapped)

        return self

    def get_state_history(self) -> List[Dict[str, Any]]:
        """
        Get the history of state transitions from memory access events.

        Returns:
            List of state snapshots in chronological order.
        """
        states: List[Dict[str, Any]] = []

        for event in self.memory_accesses:
            if (
                event.key.startswith("state.")
                and event.operation == MemoryAccessOperation.WRITE
            ):
                # Extract state from key
                key = event.key[6:]  # Remove "state." prefix
                if states and key in states[-1]:
                    # Update existing state
                    states[-1][key] = event.value_preview
                else:
                    # New state entry
                    states.append({key: event.value_preview})

        return states

    def get_node_execution_stats(self) -> Dict[str, Dict[str, Any]]:
        """
        Get execution statistics for each node.

        Returns:
            Dictionary mapping node names to their stats.
        """
        stats: Dict[str, Dict[str, Any]] = {}

        for event in self.tool_calls:
            if event.tool_name.startswith("node:"):
                node_name = event.tool_name[5:]  # Remove "node:" prefix

                if node_name not in stats:
                    stats[node_name] = {
                        "count": 0,
                        "total_duration_ms": 0.0,
                        "errors": 0,
                    }

                stats[node_name]["count"] += 1
                stats[node_name]["total_duration_ms"] += event.duration_ms
                if not event.success:
                    stats[node_name]["errors"] += 1

        # Calculate averages
        for node_stats in stats.values():
            if node_stats["count"] > 0:
                node_stats["avg_duration_ms"] = (
                    node_stats["total_duration_ms"] / node_stats["count"]
                )
                node_stats["error_rate"] = node_stats["errors"] / node_stats["count"]

        return stats
