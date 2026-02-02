import enum
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union, Literal, Annotated
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator, ValidationError

# Constants
MAX_TOOL_NAME_LENGTH = 64
MAX_ACTION_TYPE_LENGTH = 64
MAX_ACTION_DESC_LENGTH = 1000
MAX_TARGET_LENGTH = 500
MAX_SPEECH_CONTENT_LENGTH = 10000
MAX_SPEECH_INTENT_LENGTH = 500

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class BaseAgentEvent(BaseModel):
    """Base model for all agent events."""
    model_config = {
        "frozen": True,
        "extra": "forbid"
    }
    
    id: UUID = Field(default_factory=uuid4, description="Unique event ID")
    session_id: UUID = Field(..., description="Session ID for correlation")
    timestamp: datetime = Field(
        default_factory=utc_now,
        description="Event timestamp (UTC)"
    )

class ToolCallEvent(BaseAgentEvent):
    """Event representing a tool execution by the agent.
    
    WARNING: 'arguments' and 'result' contain untrusted input.
    Do not use in shell commands or SQL queries without sanitization.
    """
    event_type: Literal["tool_call"] = "tool_call"
    tool_name: str = Field(..., min_length=1, max_length=MAX_TOOL_NAME_LENGTH, description="Name of the tool called")
    arguments: Dict[str, Any] = Field(..., description="Arguments passed to the tool")
    result: Optional[Any] = Field(None, description="Result returned by the tool")
    duration_ms: float = Field(..., ge=0.0, description="Duration of the call in milliseconds")
    success: bool = Field(..., description="Whether the tool call succeeded")
    exception_type: Optional[str] = Field(None, description="Type of exception if failed")

    @model_validator(mode='after')
    def validate_exception(self) -> 'ToolCallEvent':
        if not self.success and self.exception_type is None:
            raise ValueError("exception_type required when success=False")
        if self.success and self.exception_type is not None:
            raise ValueError("exception_type must be None when success=True")
        return self

class MemoryAccessOperation(str, enum.Enum):
    READ = "read"
    WRITE = "write"
    DELETE = "delete"

class MemoryAccessEvent(BaseAgentEvent):
    """Event representing access to the agent's memory.
    
    WARNING: Fields 'key' and 'value_preview' contain untrusted input.
    Do not use in shell commands or SQL queries without sanitization.
    """
    event_type: Literal["memory_access"] = "memory_access"
    operation: MemoryAccessOperation = Field(..., description="Type of memory operation")
    key: str = Field(..., description="Memory key accessed")
    value_preview: Optional[str] = Field(None, description="Preview of value (sanitized)")
    sensitive_detected: bool = Field(False, description="Whether sensitive data was detected")

    @model_validator(mode='before')
    @classmethod
    def sanitize_value(cls, data: Any) -> Any:
        if isinstance(data, dict):
            sensitive = data.get('sensitive_detected', False)
            value = data.get('value_preview')
            
            if sensitive and value:
                data['value_preview'] = "<SENSITIVE_DATA_REDACTED>"
            elif value and isinstance(value, str) and len(value) > 100:
                data['value_preview'] = value[:97] + "..."
        return data

class ActionRecord(BaseAgentEvent):
    """Record of a distinct action taken by the agent.
    
    WARNING: 'description' and 'target' contain untrusted input.
    """
    event_type: Literal["action"] = "action"
    action_type: str = Field(..., min_length=1, max_length=MAX_ACTION_TYPE_LENGTH, description="Type of action (e.g., 'file_write', 'api_call')")
    description: str = Field(..., max_length=MAX_ACTION_DESC_LENGTH, description="Human-readable description of the action")
    target: str = Field(..., max_length=MAX_TARGET_LENGTH, description="Target of the action (e.g., filename, URL)")
    related_tool_calls: List[UUID] = Field(default_factory=list, description="IDs of related tool calls")

class SpeechRecord(BaseAgentEvent):
    """Record of agent speech/communication.
    
    WARNING: 'content' contains untrusted LLM output.
    """
    event_type: Literal["speech"] = "speech"
    content: str = Field(..., max_length=MAX_SPEECH_CONTENT_LENGTH, description="The text content spoken by the agent")
    intent: Optional[str] = Field(None, max_length=MAX_SPEECH_INTENT_LENGTH, description="Inferred intent of the speech")
    is_response_to_user: bool = Field(True, description="Whether this is a direct response to user")

class DivergenceSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"

class DivergenceEvent(BaseAgentEvent):
    """Event detected when agent speech contradicts actions (deception)."""
    event_type: Literal["divergence"] = "divergence"
    speech_intent: str = Field(..., description="What the agent said it would do")
    actual_action: str = Field(..., description="What the agent actually did")
    severity: DivergenceSeverity = Field(..., description="Severity of the divergence")
    explanation: str = Field(..., description="Explanation of why this is a divergence")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Confidence in detection (0-1)")

# Discriminated Union type for all agent events
AgentEvent = Annotated[
    Union[
        ToolCallEvent, 
        MemoryAccessEvent, 
        ActionRecord, 
        SpeechRecord, 
        DivergenceEvent
    ],
    Field(discriminator="event_type")
]

class AgentInstrumentationConfig(BaseModel):
    """Configuration for agent instrumentation."""
    model_config = {
        "extra": "forbid"
    }
    enable_tool_interception: bool = Field(True, description="Whether to intercept tool calls")
    enable_memory_monitoring: bool = Field(True, description="Whether to monitor memory access")
    divergence_threshold: float = Field(0.5, ge=0.0, le=1.0, description="Threshold for divergence detection")
    sampling_rate: float = Field(1.0, ge=0.0, le=1.0, description="Event sampling rate (0-1)")
    max_events: int = Field(1000, gt=0, description="Maximum events to keep in buffer")
