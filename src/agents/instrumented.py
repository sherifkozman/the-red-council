import inspect
import time
import random
import threading
import logging
from collections import deque
from dataclasses import dataclass, field
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
from src.agents.errors import ToolInterceptionError

logger = logging.getLogger(__name__)

T = TypeVar("T")

@dataclass
class ToolRegistration:
    func: Callable[..., Any]
    description: str
    sensitive_args: List[str] = field(default_factory=list)

@dataclass
class ToolCallStats:
    count: int = 0
    avg_duration_ms: float = 0.0
    error_rate: float = 0.0
    total_duration_ms: float = 0.0
    error_count: int = 0

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
        self.tool_registry: Dict[str, ToolRegistration] = {}
        self._recording_failures = 0
        
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

    def register_tool(
        self,
        name: str,
        func: Callable[..., Any],
        description: str,
        sensitive_args: Optional[List[str]] = None
    ) -> None:
        """Register a tool for interception."""
        if sensitive_args is None:
            sensitive_args = []
        with self._lock:
            self.tool_registry[name] = ToolRegistration(
                func=func,
                description=description,
                sensitive_args=sensitive_args
            )

    def intercept_tool_call(self, tool_name: str, *args: Any, **kwargs: Any) -> Any:
        """
        Intercept a call to a registered tool.
        Looks up the function and executes it with monitoring.
        """
        if tool_name not in self.tool_registry:
            raise ToolInterceptionError(f"Tool '{tool_name}' not registered")
            
        registration = self.tool_registry[tool_name]
        return self.wrap_tool_call(tool_name, registration.func, *args, **kwargs)

    def get_tool_call_stats(self) -> Dict[str, ToolCallStats]:
        """Get usage statistics for all tools."""
        stats: Dict[str, ToolCallStats] = {}
        
        with self._lock:
            # Initialize with registered tools
            for name in self.tool_registry:
                stats[name] = ToolCallStats(0, 0.0, 0.0)
            
            # Aggregate events
            for event in self._events:
                if isinstance(event, ToolCallEvent):
                    name = event.tool_name
                    # Only track stats for registered tools to prevent unbounded growth
                    if name not in stats:
                        continue
                    
                    s = stats[name]
                    s.count += 1
                    s.total_duration_ms += event.duration_ms
                    if not event.success:
                        s.error_count += 1
            
            # Compute averages
            for s in stats.values():
                if s.count > 0:
                    s.avg_duration_ms = s.total_duration_ms / s.count
                    s.error_rate = s.error_count / s.count
                    
        return stats

    def _get_masked_arguments(
        self,
        tool_name: str,
        args: tuple,
        kwargs: dict
    ) -> Dict[str, Any]:
        """Prepare arguments for logging, masking sensitive values."""
        # Default representation
        full_args = {
            "positional": [self._safe_repr(a) for a in args],
            "keyword": {k: self._safe_repr(v) for k, v in kwargs.items()}
        }
        
        if tool_name not in self.tool_registry:
            return full_args
            
        registration = self.tool_registry[tool_name]
        if not registration.sensitive_args:
            return full_args
            
        try:
            # Bind arguments to parameter names
            sig = inspect.signature(registration.func)
            # Check binding to detect mismatch
            sig.bind_partial(*args, **kwargs)
            
            masked_pos = []
            masked_kw = {}
            
            # Mask positional args
            params = list(sig.parameters.keys())
            for i, arg in enumerate(args):
                if i < len(params):
                    param_name = params[i]
                    if param_name in registration.sensitive_args:
                        masked_pos.append("******")
                    else:
                        masked_pos.append(self._safe_repr(arg))
                else:
                    masked_pos.append(self._safe_repr(arg))
            
            # Mask keyword args
            for k, v in kwargs.items():
                if k in registration.sensitive_args:
                    masked_kw[k] = "******"
                else:
                    masked_kw[k] = self._safe_repr(v)
                    
            return {
                "positional": masked_pos,
                "keyword": masked_kw
            }

        except Exception as e:
            logger.warning(f"Failed to bind arguments for masking; masking all: {e}")
            return {
                "positional": ["******"] * len(args),
                "keyword": {k: "******" for k in kwargs}
            }

    def _record_tool_call_event(
        self,
        tool_name: str,
        start_time: float,
        args: tuple,
        kwargs: dict,
        result: Any,
        success: bool,
        exception_type: Optional[str]
    ) -> None:
        """Helper to record tool call event with error handling."""
        try:
            if self.config.enable_tool_interception:
                duration_ms = (time.perf_counter() - start_time) * 1000
                full_args = self._get_masked_arguments(tool_name, args, kwargs)

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
            with self._lock:
                self._recording_failures += 1
            logger.error(f"Failed to record tool call event (failures: {self._recording_failures}): {e}")

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
            self._record_tool_call_event(
                tool_name,
                start_time,
                args,
                kwargs,
                result,
                success,
                exception_type
            )

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
            self._record_tool_call_event(
                tool_name,
                start_time,
                args,
                kwargs,
                result,
                success,
                exception_type
            )

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