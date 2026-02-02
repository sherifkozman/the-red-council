import pytest
from uuid import uuid4
from datetime import datetime, timezone
from src.core.agent_schemas import (
    ToolCallEvent,
    MemoryAccessEvent,
    ActionRecord,
    SpeechRecord,
    DivergenceEvent,
    AgentEvent,
    AgentInstrumentationConfig,
    MemoryAccessOperation,
    DivergenceSeverity
)
from pydantic import TypeAdapter, ValidationError

class TestAgentSchemas:

    def test_tool_call_event(self):
        session_id = uuid4()
        event = ToolCallEvent(
            session_id=session_id,
            tool_name="test_tool",
            arguments={"arg": 1},
            result="success",
            duration_ms=100.5,
            success=True
        )
        assert event.tool_name == "test_tool"
        assert event.arguments["arg"] == 1
        assert event.event_type == "tool_call"
        assert event.session_id == session_id
        assert isinstance(event.timestamp, datetime)

    def test_tool_call_validation(self):
        session_id = uuid4()
        # Should fail: success=False but exception_type=None
        with pytest.raises(ValidationError) as excinfo:
            ToolCallEvent(
                session_id=session_id,
                tool_name="tool",
                arguments={},
                duration_ms=10,
                success=False,
                exception_type=None
            )
        assert "exception_type required when success=False" in str(excinfo.value)

        # Should pass: success=False with exception_type
        event = ToolCallEvent(
            session_id=session_id,
            tool_name="tool",
            arguments={},
            duration_ms=10,
            success=False,
            exception_type="ValueError"
        )
        assert event.exception_type == "ValueError"

        # Should fail: success=True with exception_type
        with pytest.raises(ValidationError) as excinfo:
            ToolCallEvent(
                session_id=session_id,
                tool_name="tool",
                arguments={},
                duration_ms=10,
                success=True,
                exception_type="ValueError"
            )
        assert "exception_type must be None when success=True" in str(excinfo.value)

    def test_memory_access_event_redaction(self):
        session_id = uuid4()
        event = MemoryAccessEvent(
            session_id=session_id,
            operation=MemoryAccessOperation.READ,
            key="api_key",
            value_preview="sk-1234567890",
            sensitive_detected=True
        )
        assert event.value_preview == "<SENSITIVE_DATA_REDACTED>"

    def test_memory_access_event_truncation(self):
        session_id = uuid4()
        long_value = "a" * 150
        event = MemoryAccessEvent(
            session_id=session_id,
            operation=MemoryAccessOperation.READ,
            key="test_key",
            value_preview=long_value,
            sensitive_detected=False
        )
        assert len(event.value_preview) <= 100
        assert event.value_preview.endswith("...")

    def test_max_length_constraints(self):
        session_id = uuid4()
        with pytest.raises(ValidationError):
            SpeechRecord(
                session_id=session_id,
                content="a" * 10001,  # > 10000
                is_response_to_user=True
            )
        
        with pytest.raises(ValidationError):
            ToolCallEvent(
                session_id=session_id,
                tool_name="a" * 65, # > 64
                arguments={},
                duration_ms=1,
                success=True
            )

    def test_action_record(self):
        session_id = uuid4()
        tool_id = uuid4()
        event = ActionRecord(
            session_id=session_id,
            action_type="file_write",
            description="wrote file",
            target="/tmp/test",
            related_tool_calls=[tool_id]
        )
        assert event.action_type == "file_write"
        assert tool_id in event.related_tool_calls

    def test_speech_record(self):
        session_id = uuid4()
        event = SpeechRecord(
            session_id=session_id,
            content="Hello world",
            is_response_to_user=True
        )
        assert event.content == "Hello world"
        assert event.is_response_to_user is True

    def test_divergence_event(self):
        session_id = uuid4()
        event = DivergenceEvent(
            session_id=session_id,
            speech_intent="I will not delete files",
            actual_action="delete_file",
            severity=DivergenceSeverity.HIGH,
            explanation="Said no delete, did delete",
            confidence_score=0.9
        )
        assert event.severity == DivergenceSeverity.HIGH
        assert event.confidence_score == 0.9

    def test_agent_event_union(self):
        adapter = TypeAdapter(AgentEvent)
        
        # Test ToolCallEvent as AgentEvent
        data = {
            "event_type": "tool_call",
            "session_id": str(uuid4()),
            "tool_name": "tool",
            "arguments": {},
            "duration_ms": 10,
            "success": True
        }
        event = adapter.validate_python(data)
        assert isinstance(event, ToolCallEvent)

        # Test MemoryAccessEvent as AgentEvent
        data = {
            "event_type": "memory_access",
            "session_id": str(uuid4()),
            "operation": "read",
            "key": "k"
        }
        event = adapter.validate_python(data)
        assert isinstance(event, MemoryAccessEvent)

    def test_instrumentation_config_defaults(self):
        config = AgentInstrumentationConfig()
        assert config.enable_tool_interception is True
        assert config.enable_memory_monitoring is True
        assert config.divergence_threshold == 0.5
        assert config.sampling_rate == 1.0
        assert config.max_events == 1000

    def test_instrumentation_config_validation(self):
        with pytest.raises(ValidationError):
            AgentInstrumentationConfig(sampling_rate=1.5)  # Should be <= 1.0
        
        with pytest.raises(ValidationError):
            AgentInstrumentationConfig(divergence_threshold=-0.1) # Should be >= 0.0

    def test_event_immutability(self):
        session_id = uuid4()
        event = ToolCallEvent(
            session_id=session_id,
            tool_name="test",
            arguments={},
            duration_ms=1,
            success=True
        )
        # Pydantic v2 frozen models raise ValidationError on assignment
        with pytest.raises(ValidationError):
            event.tool_name = "changed"

    def test_extra_fields_forbidden(self):
        session_id = uuid4()
        with pytest.raises(ValidationError) as excinfo:
            ToolCallEvent(
                session_id=session_id,
                tool_name="test",
                arguments={},
                duration_ms=1,
                success=True,
                extra_field="fail"
            )
        assert "extra_field" in str(excinfo.value)