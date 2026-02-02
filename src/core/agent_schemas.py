import enum
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union, Literal, Annotated, Tuple
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, model_validator, AwareDatetime
from src.core.schemas import JudgeScore
from src.core.owasp_agentic import OWASPAgenticRisk

# Constants
# Limits based on typical log constraints and DoS prevention
MAX_TOOL_NAME_LENGTH = 64
MAX_ACTION_TYPE_LENGTH = 64
MAX_ACTION_DESC_LENGTH = 1000
MAX_TARGET_LENGTH = 500
MAX_SPEECH_CONTENT_LENGTH = 10000
MAX_SPEECH_INTENT_LENGTH = 500
MAX_EVIDENCE_LENGTH = 2000
MAX_RECOMMENDATION_LENGTH = 1000
MAX_DETAILS_LENGTH = 1000
MAX_MEMORY_KEY_LENGTH = 256
MAX_VALUE_PREVIEW_LENGTH = 256
MAX_ACTUAL_ACTION_LENGTH = 1000
MAX_EXPLANATION_LENGTH = 2000

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def validate_exception_consistency(obj: Any, context: str) -> None:
    """Helper to validate consistency between success and exception_type."""
    if not obj.success and obj.exception_type is None:
        raise ValueError(f"exception_type required when success=False ({context})")
    if obj.success and obj.exception_type is not None:
        raise ValueError(f"exception_type must be None when success=True ({context})")

class BaseAgentEvent(BaseModel):
    """Base model for all agent events."""
    model_config = {
        "frozen": True,
        "extra": "forbid"
    }
    
    id: UUID = Field(default_factory=uuid4, description="Unique event ID")
    session_id: UUID = Field(..., description="Session ID for correlation")
    timestamp: AwareDatetime = Field(
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
        validate_exception_consistency(self, f"tool={self.tool_name}")
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
    key: str = Field(..., max_length=MAX_MEMORY_KEY_LENGTH, description="Memory key accessed")
    value_preview: Optional[str] = Field(None, max_length=MAX_VALUE_PREVIEW_LENGTH, description="Preview of value (sanitized)")
    sensitive_detected: bool = Field(False, description="Whether sensitive data was detected")
    success: bool = Field(True, description="Whether the operation succeeded")
    exception_type: Optional[str] = Field(None, description="Type of exception if failed")

    @model_validator(mode='before')
    @classmethod
    def sanitize_value(cls, data: Any) -> Any:
        # Prevent validation bypass by enforcing dict input
        if not isinstance(data, dict):
            raise TypeError(f"MemoryAccessEvent input must be a dict, got {type(data)}")
            
        # Create a copy to avoid mutating the original input dictionary
        data = data.copy()
        
        sensitive = bool(data.get('sensitive_detected', False))
        value = data.get('value_preview')
        
        # Always redact if sensitive flag is set
        if sensitive:
            data['value_preview'] = "<SENSITIVE_DATA_REDACTED>"
        else:
            try:
                # Simplification: Try stringifying everything but catch errors
                str_val = str(value) if value is not None else None
            except Exception:
                str_val = "<ERROR_STRINGIFYING_VALUE>"

            if str_val is not None:
                if len(str_val) > MAX_VALUE_PREVIEW_LENGTH:
                    data['value_preview'] = str_val[:MAX_VALUE_PREVIEW_LENGTH - 3] + "..."
                else:
                    data['value_preview'] = str_val
                
        return data

    @model_validator(mode='after')
    def validate_exception(self) -> 'MemoryAccessEvent':
        validate_exception_consistency(self, f"key={self.key}")
        return self

class ActionRecord(BaseAgentEvent):
    """Record of a distinct action taken by the agent.
    
    WARNING: 'description' and 'target' contain untrusted input.
    """
    event_type: Literal["action"] = "action"
    action_type: str = Field(..., min_length=1, max_length=MAX_ACTION_TYPE_LENGTH, description="Type of action (e.g., 'file_write', 'api_call')")
    description: str = Field(..., max_length=MAX_ACTION_DESC_LENGTH, description="Human-readable description of the action")
    target: str = Field(..., max_length=MAX_TARGET_LENGTH, description="Target of the action (e.g., filename, URL)")
    related_tool_calls: Tuple[UUID, ...] = Field(default_factory=tuple, description="IDs of related tool calls")

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
    speech_intent: str = Field(..., max_length=MAX_SPEECH_INTENT_LENGTH, description="What the agent said it would do")
    actual_action: str = Field(..., max_length=MAX_ACTUAL_ACTION_LENGTH, description="What the agent actually did")
    severity: DivergenceSeverity = Field(..., description="Severity of the divergence")
    explanation: str = Field(..., max_length=MAX_EXPLANATION_LENGTH, description="Explanation of why this is a divergence")
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

class ViolationResult(BaseModel):
    """Result of an OWASP Agentic check."""
    model_config = {
        "frozen": True,
        "extra": "forbid"
    }
    detected: bool = Field(..., description="Whether a violation was detected")
    severity: int = Field(..., ge=1, le=10, description="Severity score (1-10)")
    evidence: str = Field(..., max_length=MAX_EVIDENCE_LENGTH, description="Evidence supporting the finding")
    recommendation: str = Field(..., max_length=MAX_RECOMMENDATION_LENGTH, description="Remediation recommendation")
    owasp_category: OWASPAgenticRisk = Field(..., description="The specific OWASP category")

class AgentJudgeScore(BaseModel):
    """Comprehensive score for agent security evaluation."""
    model_config = {
        "frozen": True,
        "extra": "forbid"
    }
    
    base_score: JudgeScore = Field(..., description="Base LLM evaluation score")
    owasp_violations: Tuple[ViolationResult, ...] = Field(default_factory=tuple, description="Detected OWASP violations")
    
    tool_abuse_score: float = Field(..., ge=0.0, le=10.0, description="Score for tool usage safety (10=Safe)")
    tool_abuse_details: str = Field(..., max_length=MAX_DETAILS_LENGTH, description="Details on tool abuse findings")
    
    memory_safety_score: float = Field(..., ge=0.0, le=10.0, description="Score for memory usage safety (10=Safe)")
    memory_safety_details: str = Field(..., max_length=MAX_DETAILS_LENGTH, description="Details on memory safety findings")
    
    divergence_count: int = Field(..., ge=0, description="Number of detected divergences")
    divergence_examples: Tuple[DivergenceEvent, ...] = Field(default_factory=tuple, max_length=5, description="Examples of detected divergence")
    
    overall_agent_risk: float = Field(..., ge=0.0, le=10.0, description="Overall risk score (0=Safe, 10=Risky)")
    recommendations: Tuple[str, ...] = Field(default_factory=tuple, description="Prioritized recommendations")

    @model_validator(mode='after')
    def validate_divergence_consistency(self) -> 'AgentJudgeScore':
        if self.divergence_count < len(self.divergence_examples):
            raise ValueError(f"divergence_count ({self.divergence_count}) cannot be less than number of examples ({len(self.divergence_examples)})")
        return self

    def get_failed_categories(self) -> List[OWASPAgenticRisk]:
        """Return list of OWASP categories where violations were detected."""
        return sorted(list({v.owasp_category for v in self.owasp_violations if v.detected}), key=lambda x: x.value)

    def to_summary_dict(self) -> Dict[str, Any]:
        """Return a summary dictionary suitable for API responses."""
        return {
            "overall_risk": self.overall_agent_risk,
            "base_score": self.base_score.score,
            "violations_count": len([v for v in self.owasp_violations if v.detected]),
            "tool_safety": self.tool_abuse_score,
            "memory_safety": self.memory_safety_score,
            "divergences": self.divergence_count,
            "failed_categories": [c.value for c in self.get_failed_categories()]
        }