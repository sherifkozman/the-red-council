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
    DivergenceSeverity,
    MAX_VALUE_PREVIEW_LENGTH
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
        assert event.timestamp.tzinfo is not None

    def test_timestamp_validation(self):
        session_id = uuid4()
        # Naive datetime should fail
        naive_dt = datetime(2025, 1, 1, 12, 0, 0)
        with pytest.raises(ValidationError):
            ToolCallEvent(
                session_id=session_id,
                tool_name="test",
                arguments={},
                duration_ms=1,
                success=True,
                timestamp=naive_dt
            )
        
        # Aware datetime should pass
        aware_dt = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        event = ToolCallEvent(
            session_id=session_id,
            tool_name="test",
            arguments={},
            duration_ms=1,
            success=True,
            timestamp=aware_dt
        )
        assert event.timestamp == aware_dt

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
        long_value = "a" * (MAX_VALUE_PREVIEW_LENGTH + 50)
        event = MemoryAccessEvent(
            session_id=session_id,
            operation=MemoryAccessOperation.READ,
            key="test_key",
            value_preview=long_value,
            sensitive_detected=False
        )
        assert len(event.value_preview) <= MAX_VALUE_PREVIEW_LENGTH
        assert event.value_preview.endswith("...")

    def test_memory_access_non_string_sanitization(self):
        session_id = uuid4()
        # Pass a dict as value_preview - should be stringified and truncated
        huge_dict = {"key": "a" * (MAX_VALUE_PREVIEW_LENGTH + 50)}
        event = MemoryAccessEvent(
            session_id=session_id,
            operation=MemoryAccessOperation.READ,
            key="test_key",
            value_preview=huge_dict, # type: ignore - testing validator behavior
            sensitive_detected=False
        )
        assert isinstance(event.value_preview, str)
        assert len(event.value_preview) <= MAX_VALUE_PREVIEW_LENGTH
        assert event.value_preview.endswith("...")
        assert event.value_preview.startswith("{'key':")

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
        assert isinstance(event.related_tool_calls, tuple)

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

    def test_violation_result(self):
        from src.core.agent_schemas import ViolationResult
        from src.core.owasp_agentic import OWASPAgenticRisk

        result = ViolationResult(
            detected=True,
            severity=8,
            evidence="Agent abused tool",
            recommendation="Limit tool access",
            owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
        )
        assert result.detected is True
        assert result.severity == 8
        assert result.owasp_category == OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY

    def test_agent_judge_score(self):
        from src.core.agent_schemas import AgentJudgeScore, ViolationResult
        from src.core.schemas import JudgeScore
        from src.core.owasp_agentic import OWASPAgenticRisk

        base = JudgeScore(
            score=5,
            leaked_secret=False,
            leaked_instructions=False,
            reasoning="Base reasoning"
        )
        
        violation = ViolationResult(
            detected=True,
            severity=9,
            evidence="Evidence",
            recommendation="Fix it",
            owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
        )

        score = AgentJudgeScore(
            base_score=base,
            owasp_violations=[violation],
            tool_abuse_score=2.0,
            tool_abuse_details="Abused",
            memory_safety_score=8.0,
            memory_safety_details="Safe",
            divergence_count=0,
            divergence_examples=[],
            overall_agent_risk=7.5,
            recommendations=["Fix the agent"]
        )

        assert score.base_score.score == 5
        assert len(score.owasp_violations) == 1
        assert isinstance(score.owasp_violations, tuple)
        assert score.overall_agent_risk == 7.5
        
        # Test methods
        failed = score.get_failed_categories()
        assert len(failed) == 1
        assert failed[0] == OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY

        summary = score.to_summary_dict()
        assert summary["overall_risk"] == 7.5
        assert summary["violations_count"] == 1
        assert summary["failed_categories"] == ["ASI01"]

    def test_agent_judge_score_validation(self):
        from src.core.agent_schemas import AgentJudgeScore
        from src.core.schemas import JudgeScore
        
        base = JudgeScore(
            score=10, 
            leaked_secret=False, 
            leaked_instructions=False, 
            reasoning="OK"
        )

        # Fail: divergence_count < len(examples)
        with pytest.raises(ValidationError) as excinfo:
            AgentJudgeScore(
                base_score=base,
                owasp_violations=[],
                tool_abuse_score=10.0,
                tool_abuse_details="",
                memory_safety_score=10.0,
                memory_safety_details="",
                divergence_count=0,
                divergence_examples=[
                    DivergenceEvent(
                        session_id=uuid4(),
                        speech_intent="a",
                        actual_action="b",
                        severity=DivergenceSeverity.HIGH,
                        explanation="e",
                        confidence_score=1.0
                    )
                ],
                overall_agent_risk=0.0
            )
        assert "divergence_count" in str(excinfo.value)
