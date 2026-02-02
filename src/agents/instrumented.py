import asyncio
import inspect
import time
import random
import threading
import logging
from collections import deque
from datetime import datetime
from typing import Any, Callable, List, Optional, TypeVar, Dict, Union, Awaitable
from uuid import uuid4, UUID

from src.core.agent_schemas import (
    AgentEvent,
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessEvent,
    ActionRecord,
    SpeechRecord,
    DivergenceEvent,
    MemoryAccessOperation,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")

class InstrumentedAgent:
    """
    Wrapper class to instrument any agent with security monitoring.
    Records tool calls, memory access, speech, and actions.
    
    Usage:
        config = AgentInstrumentationConfig(...)
        agent = InstrumentedAgent(my_agent, "my-agent", config)
        
        # Wrapping tool calls
        result = agent.wrap_tool_call("tool_name", tool_func, arg1, kw=val)
        if inspect.iscoroutine(result):
            result = await result
            
        # Recording events
        agent.record_speech("Hello world")
    """

    def __init__(
        self,
        agent: Any,
        name: str,
        config: AgentInstrumentationConfig
    ):
        if config.max_events <= 0:
            raise ValueError("max_events must be positive")

        self.agent = agent
        self.name = name
        self.config = config
        # Use deque for O(1) appends and automatic maxlen enforcement
        self._events: deque[AgentEvent] = deque(maxlen=config.max_events)
        self._session_id = uuid4()
        self._lock = threading.Lock()
        self._rng = random.Random()
        
        # Determine if wrapped agent is async
        self.is_async = (
            inspect.iscoroutinefunction(getattr(agent, "run", None)) or 
            inspect.iscoroutinefunction(getattr(agent, "__call__", None)) or
            inspect.iscoroutinefunction(getattr(agent, "arun", None))
        )

    @property
    def events(self) -> List[AgentEvent]:
        """Get all recorded events in order."""
        with self._lock:
            return list(self._events)

    @property
    def tool_calls(self) -> List[ToolCallEvent]:
        """Get all tool call events."""
        with self._lock:
            return [e for e in self._events if isinstance(e, ToolCallEvent)]

    @property
    def memory_accesses(self) -> List[MemoryAccessEvent]:
        """Get all memory access events."""
        with self._lock:
            return [e for e in self._events if isinstance(e, MemoryAccessEvent)]

    @property
    def divergences(self) -> List[DivergenceEvent]:
        """Get all divergence events."""
        with self._lock:
            return [e for e in self._events if isinstance(e, DivergenceEvent)]

    def clear_events(self) -> None:
        """Clear the event buffer."""
        with self._lock:
            self._events.clear()

    def get_events_since(self, timestamp: datetime) -> List[AgentEvent]:
        """Get events that occurred after the given timestamp."""
        with self._lock:
            return [e for e in self._events if e.timestamp > timestamp]

    def _add_event(self, event: AgentEvent) -> None:
        """Add event to buffer, respecting sampling."""
        # Lock entire operation to prevent race conditions in sampling or buffer mutation
        with self._lock:
            if self._rng.random() >= self.config.sampling_rate:
                return
            self._events.append(event)

    def _safe_repr(self, obj: Any, max_len: int = 1000) -> str:
        """Safely represent an object as a string with truncation."""
        try:
            s = str(obj)
            if len(s) > max_len:
                return s[:max_len] + "..."
            return s
        except Exception:
            return "<unrepresentable>"

    def record_speech(
        self,
        content: str,
        intent: Optional[str] = None,
        is_response_to_user: bool = True
    ) -> None:
        """Record an agent speech event."""
        event = SpeechRecord(
            session_id=self._session_id,
            content=content,
            intent=intent,
            is_response_to_user=is_response_to_user
        )
        self._add_event(event)

    def record_action(
        self,
        action_type: str,
        description: str,
        target: str,
        related_tool_calls: Optional[List[UUID]] = None
    ) -> None:
        """Record an agent action event."""
        event = ActionRecord(
            session_id=self._session_id,
            action_type=action_type,
            description=description,
            target=target,
            related_tool_calls=related_tool_calls if related_tool_calls else []
        )
        self._add_event(event)

    def wrap_tool_call(
        self,
        tool_name: str,
        func: Callable[..., Any],
        *args: Any,
        **kwargs: Any
    ) -> Union[Any, Awaitable[Any]]:
        """
        Execute a tool function and record the event.
        Handles both sync and async functions.
        
        WARNING: If func is async, this returns a coroutine that MUST be awaited.
        """
        if inspect.iscoroutinefunction(func):
            return self._wrap_async_tool_call(tool_name, func, *args, **kwargs)
        else:
            return self._wrap_sync_tool_call(tool_name, func, *args, **kwargs)

    def _wrap_sync_tool_call(
        self,
        tool_name: str,
        func: Callable[..., T],
        *args: Any,
        **kwargs: Any
    ) -> T:
        start_time = time.perf_counter()
        success = True
        exception_type = None
        result = None
        
        try:
            result = func(*args, **kwargs)
            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise e
        finally:
            try:
                if self.config.enable_tool_interception:
                    duration_ms = (time.perf_counter() - start_time) * 1000
                    # Capture args safely
                    full_args = {
                        "positional": [self._safe_repr(a) for a in args],
                        "keyword": {k: self._safe_repr(v) for k, v in kwargs.items()}
                    }
                        
                    event = ToolCallEvent(
                        session_id=self._session_id,
                        tool_name=tool_name,
                        arguments=full_args,
                        result=self._safe_repr(result) if success else None,
                        duration_ms=duration_ms,
                        success=success,
                        exception_type=exception_type
                    )
                    self._add_event(event)
            except Exception as e:
                # Log error but don't fail the tool call
                logger.error(f"Failed to record tool call event: {e}")

    async def _wrap_async_tool_call(
        self,
        tool_name: str,
        func: Callable[..., Any],
        *args: Any,
        **kwargs: Any
    ) -> Any:
        start_time = time.perf_counter()
        success = True
        exception_type = None
        result = None
        
        try:
            result = await func(*args, **kwargs)
            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise e
        finally:
            try:
                if self.config.enable_tool_interception:
                    duration_ms = (time.perf_counter() - start_time) * 1000
                    # Capture args safely
                    full_args = {
                        "positional": [self._safe_repr(a) for a in args],
                        "keyword": {k: self._safe_repr(v) for k, v in kwargs.items()}
                    }

                    event = ToolCallEvent(
                        session_id=self._session_id,
                        tool_name=tool_name,
                        arguments=full_args,
                        result=self._safe_repr(result) if success else None,
                        duration_ms=duration_ms,
                        success=success,
                        exception_type=exception_type
                    )
                    self._add_event(event)
            except Exception as e:
                 logger.error(f"Failed to record async tool call event: {e}")

    def wrap_memory_access(
        self,
        operation: MemoryAccessOperation,
        key: str,
        value: Any = None
    ) -> None:
        """
        Record a memory access event. 
        Does not execute the operation, just records it.
        """
        if not self.config.enable_memory_monitoring:
            return
            
        # Determine if sensitive (placeholder logic, expanded in TRC-005)
        sensitive = False 
        
        event = MemoryAccessEvent(
            session_id=self._session_id,
            operation=operation,
            key=key,
            value_preview=self._safe_repr(value) if value is not None else None,
            sensitive_detected=sensitive
        )
        self._add_event(event)

    def detect_divergence(
        self,
        speech: str,
        actions: List[ActionRecord]
    ) -> Optional[DivergenceEvent]:
        """
        Detect divergence between speech and actions.
        Implementation deferred to TRC-006.
        """
        # TODO: Implement with DivergenceDetector in TRC-006
        return None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # Do not automatically clear events to allow post-mortem analysis
        pass