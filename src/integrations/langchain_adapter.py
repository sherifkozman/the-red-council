# src/integrations/langchain_adapter.py
"""
LangChain integration adapter for The Red Council Agent Security Testing.

This module provides LangChainAgentWrapper which wraps LangChain AgentExecutor
instances for security monitoring. It uses LangChain's callback system to
capture tool calls, memory access, and agent actions.

Usage:
    from langchain.agents import AgentExecutor
    from src.integrations.langchain_adapter import LangChainAgentWrapper
    from src.core.agent_schemas import AgentInstrumentationConfig

    # Wrap an existing agent
    config = AgentInstrumentationConfig()
    wrapper = LangChainAgentWrapper.from_agent_executor(executor, config)

    # Run the agent (async)
    result = await wrapper.invoke("What is the weather?")

    # Get events for analysis
    events = wrapper.events

Note: langchain is an optional dependency. This module uses runtime type checking
to work with or without langchain installed.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from src.agents.instrumented import InstrumentedAgent
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ToolCallEvent,
    ActionRecord,
    MemoryAccessOperation,
)

logger = logging.getLogger(__name__)


class RedCouncilCallbackHandler:
    """
    LangChain callback handler that captures agent events for security analysis.

    This handler implements the LangChain BaseCallbackHandler interface to capture:
    - on_tool_start: When a tool begins execution
    - on_tool_end: When a tool completes successfully
    - on_tool_error: When a tool raises an exception
    - on_agent_action: When the agent decides to take an action
    - on_agent_finish: When the agent completes its task

    Events are forwarded to the InstrumentedAgent for recording.

    Note: This class does not inherit from BaseCallbackHandler at import time
    to avoid requiring langchain as a dependency. It implements the same interface.

    Usage:
        handler = RedCouncilCallbackHandler(instrumented_agent)
        result = agent.invoke(input, config={"callbacks": [handler]})
    """

    def __init__(self, instrumented_agent: InstrumentedAgent):
        """
        Initialize the callback handler.

        Args:
            instrumented_agent: The InstrumentedAgent instance to record events to.
        """
        if instrumented_agent is None:
            raise ValueError("instrumented_agent cannot be None")
        self._agent = instrumented_agent
        self._tool_start_times: Dict[str, float] = {}
        self._pending_actions: Dict[str, Dict[str, Any]] = {}

    @property
    def raise_error(self) -> bool:
        """Whether to raise errors from callbacks."""
        return False

    @property
    def run_inline(self) -> bool:
        """Whether to run callbacks inline (synchronously)."""
        return True

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        inputs: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        """
        Called when a tool starts execution.

        Args:
            serialized: Serialized tool information including 'name'.
            input_str: String representation of tool input.
            run_id: Unique ID for this run.
            parent_run_id: ID of parent run if nested.
            tags: Tags associated with this run.
            metadata: Additional metadata.
            inputs: Structured inputs if available.
            **kwargs: Additional arguments.
        """
        tool_name = serialized.get("name", "unknown_tool")
        run_id_str = str(run_id) if run_id else "unknown"

        # Store start time for duration calculation
        self._tool_start_times[run_id_str] = time.perf_counter()

        # Store pending action info
        self._pending_actions[run_id_str] = {
            "tool_name": tool_name,
            "input_str": input_str,
            "inputs": inputs,
            "start_time": time.perf_counter(),
        }

        logger.debug(f"Tool started: {tool_name} (run_id={run_id_str})")

    def on_tool_end(
        self,
        output: Any,
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """
        Called when a tool completes successfully.

        Args:
            output: The tool's output.
            run_id: Unique ID for this run.
            parent_run_id: ID of parent run if nested.
            tags: Tags associated with this run.
            **kwargs: Additional arguments.
        """
        run_id_str = str(run_id) if run_id else "unknown"
        pending = self._pending_actions.pop(run_id_str, None)
        start_time = self._tool_start_times.pop(run_id_str, None)

        if pending is None:
            logger.warning(
                "on_tool_end called without matching on_tool_start "
                f"(run_id={run_id_str})"
            )
            return

        tool_name = pending["tool_name"]
        duration_ms = (time.perf_counter() - start_time) * 1000 if start_time else 0.0

        # Build arguments dict from input string or structured inputs
        arguments: Dict[str, Any] = {"positional": [], "keyword": {}}
        if pending.get("inputs"):
            arguments["keyword"] = {
                k: self._safe_repr(v) for k, v in pending["inputs"].items()
            }
        elif pending.get("input_str"):
            arguments["positional"] = [pending["input_str"]]

        # Create and record the tool call event
        event = ToolCallEvent(
            session_id=self._agent._session_id,
            tool_name=tool_name,
            arguments=arguments,
            result=self._safe_repr(output),
            duration_ms=duration_ms,
            success=True,
            exception_type=None,
        )
        self._agent._add_event(event)

        logger.debug(f"Tool completed: {tool_name} in {duration_ms:.2f}ms")

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """
        Called when a tool raises an exception.

        Args:
            error: The exception that was raised.
            run_id: Unique ID for this run.
            parent_run_id: ID of parent run if nested.
            tags: Tags associated with this run.
            **kwargs: Additional arguments.
        """
        run_id_str = str(run_id) if run_id else "unknown"
        pending = self._pending_actions.pop(run_id_str, None)
        start_time = self._tool_start_times.pop(run_id_str, None)

        if pending is None:
            logger.warning(
                "on_tool_error called without matching on_tool_start "
                f"(run_id={run_id_str})"
            )
            return

        tool_name = pending["tool_name"]
        duration_ms = (time.perf_counter() - start_time) * 1000 if start_time else 0.0

        # Build arguments dict
        arguments: Dict[str, Any] = {"positional": [], "keyword": {}}
        if pending.get("inputs"):
            arguments["keyword"] = {
                k: self._safe_repr(v) for k, v in pending["inputs"].items()
            }
        elif pending.get("input_str"):
            arguments["positional"] = [pending["input_str"]]

        # Create and record the failed tool call event
        event = ToolCallEvent(
            session_id=self._agent._session_id,
            tool_name=tool_name,
            arguments=arguments,
            result=None,
            duration_ms=duration_ms,
            success=False,
            exception_type=type(error).__name__,
        )
        self._agent._add_event(event)

        logger.debug(f"Tool failed: {tool_name} with {type(error).__name__}")

    def on_agent_action(
        self,
        action: Any,  # AgentAction
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """
        Called when the agent decides to take an action.

        Args:
            action: The AgentAction being taken.
            run_id: Unique ID for this run.
            parent_run_id: ID of parent run if nested.
            tags: Tags associated with this run.
            **kwargs: Additional arguments.
        """
        # Extract action details safely
        tool_name = getattr(action, "tool", "unknown")
        action_log = getattr(action, "log", "")

        # Record as an ActionRecord
        event = ActionRecord(
            session_id=self._agent._session_id,
            action_type="tool_invocation",
            description=f"Agent decided to use tool: {tool_name}",
            target=tool_name,
            related_tool_calls=(),
        )
        self._agent._add_event(event)

        # If there's reasoning in the log, record it as speech
        if action_log and action_log.strip():
            self._agent.record_speech(
                content=action_log.strip(),
                intent=f"reasoning_for_{tool_name}",
                is_response_to_user=False,
            )

    def on_agent_finish(
        self,
        finish: Any,  # AgentFinish
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """
        Called when the agent completes its task.

        Args:
            finish: The AgentFinish result.
            run_id: Unique ID for this run.
            parent_run_id: ID of parent run if nested.
            tags: Tags associated with this run.
            **kwargs: Additional arguments.
        """
        # Extract output safely
        return_values = getattr(finish, "return_values", {})
        output = return_values.get("output", str(return_values))

        # Record final output as speech
        self._agent.record_speech(
            content=str(output)[:10000],  # Respect MAX_SPEECH_CONTENT_LENGTH
            intent="final_response",
            is_response_to_user=True,
        )

        logger.debug("Agent finished execution")

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        """Called when LLM starts. Not recorded as primary event."""
        pass

    def on_llm_end(
        self,
        response: Any,  # LLMResult
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """Called when LLM ends. Not recorded as primary event."""
        pass

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """Called when LLM errors. Not recorded as primary event."""
        pass

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        """Called when chain starts. Not recorded as primary event."""
        pass

    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """Called when chain ends. Not recorded as primary event."""
        pass

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """Called when chain errors. Not recorded as primary event."""
        pass

    def on_text(
        self,
        text: str,
        *,
        run_id: Optional[UUID] = None,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> None:
        """Called on generic text output. Not recorded."""
        pass

    def _safe_repr(self, obj: Any, max_len: int = 1000) -> str:
        """Safely represent an object as a string with truncation."""
        try:
            s = repr(obj)
            if len(s) > max_len:
                return s[:max_len] + "..."
            return s
        except Exception:
            return "<unrepresentable>"


class LangChainAgentWrapper(InstrumentedAgent):
    """
    Wrapper for LangChain AgentExecutor that provides security instrumentation.

    This class extends InstrumentedAgent to automatically intercept and record
    all tool calls, memory access, and agent actions from a LangChain agent.

    Features:
    - Automatic tool call interception via LangChain callbacks
    - Memory monitoring via agent.memory if present
    - Support for both sync and async agent execution
    - Compatible with any AgentExecutor instance

    Usage:
        from langchain.agents import AgentExecutor
        from src.integrations.langchain_adapter import LangChainAgentWrapper

        # Method 1: Factory method (recommended)
        wrapper = LangChainAgentWrapper.from_agent_executor(executor)

        # Method 2: Direct instantiation
        config = AgentInstrumentationConfig()
        wrapper = LangChainAgentWrapper(executor, config)

        # Run the agent
        result = await wrapper.invoke("What is the weather?")

        # Sync alternative
        result = wrapper.invoke_sync("What is the weather?")

        # Get recorded events for analysis
        events = wrapper.events
        tool_calls = wrapper.tool_calls
    """

    def __init__(
        self,
        agent: Any,  # AgentExecutor
        config: Optional[AgentInstrumentationConfig] = None,
    ):
        """
        Initialize the LangChain wrapper.

        Args:
            agent: A LangChain AgentExecutor instance.
            config: Optional instrumentation configuration. Defaults to standard config.

        Raises:
            ValueError: If agent is None.
            TypeError: If agent doesn't have expected AgentExecutor interface.
        """
        if agent is None:
            raise ValueError("agent cannot be None")

        # Validate agent has expected interface
        if not hasattr(agent, "invoke") and not hasattr(agent, "run"):
            raise TypeError(
                "agent must have 'invoke' or 'run' method. "
                "Expected LangChain AgentExecutor or compatible interface."
            )

        if config is None:
            config = AgentInstrumentationConfig()

        # Determine agent name
        agent_name = getattr(agent, "name", None) or type(agent).__name__

        # Initialize parent
        super().__init__(
            agent=agent,
            name=f"langchain:{agent_name}",
            config=config,
        )

        # Create callback handler
        self._callback_handler = RedCouncilCallbackHandler(self)

        # Monitor memory if available
        self._setup_memory_monitoring()

    def _setup_memory_monitoring(self) -> None:
        """Set up monitoring for agent memory if present."""
        memory = getattr(self.agent, "memory", None)
        if memory is None:
            logger.debug("Agent has no memory to monitor")
            return

        # Check for common memory interfaces
        if hasattr(memory, "chat_memory"):
            # ConversationBufferMemory and similar
            logger.debug("Detected chat memory interface")
        elif hasattr(memory, "load_memory_variables"):
            # BaseMemory interface
            logger.debug("Detected base memory interface")
        else:
            logger.debug("Unknown memory interface")

    @classmethod
    def from_agent_executor(
        cls,
        executor: Any,  # AgentExecutor
        config: Optional[AgentInstrumentationConfig] = None,
    ) -> "LangChainAgentWrapper":
        """
        Create a LangChainAgentWrapper from an AgentExecutor.

        This is the recommended way to create a wrapper as it handles
        all setup automatically.

        Args:
            executor: A LangChain AgentExecutor instance.
            config: Optional instrumentation configuration.

        Returns:
            A configured LangChainAgentWrapper instance.

        Example:
            from langchain.agents import AgentExecutor

            executor = AgentExecutor(agent=agent, tools=tools)
            wrapper = LangChainAgentWrapper.from_agent_executor(executor)
            result = await wrapper.invoke("Hello!")
        """
        return cls(agent=executor, config=config)

    def _get_callbacks(
        self, existing_callbacks: Optional[List[Any]] = None
    ) -> List[Any]:
        """
        Get callback list including the Red Council handler.

        Args:
            existing_callbacks: Existing callbacks to preserve.

        Returns:
            List of callbacks including Red Council handler.
        """
        callbacks = [self._callback_handler]
        if existing_callbacks:
            callbacks.extend(existing_callbacks)
        return callbacks

    async def invoke(
        self,
        input: Union[str, Dict[str, Any]],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Invoke the LangChain agent asynchronously with instrumentation.

        Args:
            input: The input to the agent (string or dict).
            config: Optional LangChain config dict.
            **kwargs: Additional arguments passed to the agent.

        Returns:
            The agent's response.

        Example:
            result = await wrapper.invoke("What is the weather in London?")
            print(result)
        """
        # Prepare config with callbacks
        if config is None:
            config = {}

        existing_callbacks = config.get("callbacks", [])
        config["callbacks"] = self._get_callbacks(existing_callbacks)

        # Check for async invoke
        if hasattr(self.agent, "ainvoke"):
            return await self.agent.ainvoke(input, config=config, **kwargs)
        elif hasattr(self.agent, "invoke"):
            # Run sync invoke in executor to avoid blocking
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None, lambda: self.agent.invoke(input, config=config, **kwargs)
            )
        else:
            raise NotImplementedError("Agent has no invoke or ainvoke method")

    def invoke_sync(
        self,
        input: Union[str, Dict[str, Any]],
        config: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Invoke the LangChain agent synchronously with instrumentation.

        Args:
            input: The input to the agent (string or dict).
            config: Optional LangChain config dict.
            **kwargs: Additional arguments passed to the agent.

        Returns:
            The agent's response.

        Example:
            result = wrapper.invoke_sync("What is the weather in London?")
            print(result)
        """
        # Prepare config with callbacks
        if config is None:
            config = {}

        existing_callbacks = config.get("callbacks", [])
        config["callbacks"] = self._get_callbacks(existing_callbacks)

        # Use sync invoke
        if hasattr(self.agent, "invoke"):
            return self.agent.invoke(input, config=config, **kwargs)
        elif hasattr(self.agent, "run"):
            # Legacy run method (deprecated in newer LangChain)
            return self.agent.run(input, callbacks=config.get("callbacks"), **kwargs)
        else:
            raise NotImplementedError("Agent has no invoke or run method")

    def run(
        self,
        input: Union[str, Dict[str, Any]],
        callbacks: Optional[List[Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Run the LangChain agent (legacy interface).

        This method is provided for backward compatibility with older
        LangChain versions that use agent.run() instead of agent.invoke().

        Args:
            input: The input to the agent.
            callbacks: Optional additional callbacks.
            **kwargs: Additional arguments.

        Returns:
            The agent's response.
        """
        all_callbacks = self._get_callbacks(callbacks)

        if hasattr(self.agent, "run"):
            return self.agent.run(input, callbacks=all_callbacks, **kwargs)
        else:
            return self.invoke_sync(
                input, config={"callbacks": all_callbacks}, **kwargs
            )

    async def arun(
        self,
        input: Union[str, Dict[str, Any]],
        callbacks: Optional[List[Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Run the LangChain agent asynchronously (legacy interface).

        Args:
            input: The input to the agent.
            callbacks: Optional additional callbacks.
            **kwargs: Additional arguments.

        Returns:
            The agent's response.
        """
        return await self.invoke(input, config={"callbacks": callbacks}, **kwargs)

    def get_memory_state(self) -> Dict[str, Any]:
        """
        Get the current state of the agent's memory.

        Returns:
            Dictionary containing memory state, or empty dict if no memory.
        """
        memory = getattr(self.agent, "memory", None)
        if memory is None:
            return {}

        # Try to load memory variables
        if hasattr(memory, "load_memory_variables"):
            try:
                return memory.load_memory_variables({})
            except Exception as e:
                logger.warning(f"Failed to load memory variables: {e}")
                # Fall through to try chat_memory

        # Try chat_memory for conversation memory
        if hasattr(memory, "chat_memory"):
            chat_memory = memory.chat_memory
            if hasattr(chat_memory, "messages"):
                return {
                    "messages": [
                        {
                            "type": type(m).__name__,
                            "content": getattr(m, "content", str(m)),
                        }
                        for m in chat_memory.messages
                    ]
                }

        return {}

    def record_memory_access(self, operation: str, key: str, value: Any = None) -> None:
        """
        Manually record a memory access event.

        This can be used to track memory operations that aren't automatically
        captured by the callback handler.

        Args:
            operation: One of "read", "write", "delete".
            key: The memory key being accessed.
            value: The value (for write operations).
        """
        op_map = {
            "read": MemoryAccessOperation.READ,
            "write": MemoryAccessOperation.WRITE,
            "delete": MemoryAccessOperation.DELETE,
        }

        if operation not in op_map:
            raise ValueError(
                f"Invalid operation: {operation}. Must be one of {list(op_map.keys())}"
            )

        self.wrap_memory_access(op_map[operation], key, value)
