import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from unittest.mock import MagicMock, patch
import json

from src.core.agent_schemas import (
    ToolCallEvent,
    MemoryAccessEvent,
    ActionRecord,
    SpeechRecord,
    DivergenceEvent,
    MemoryAccessOperation,
    DivergenceSeverity,
)
from src.ui.components.agent_timeline import (
    render_agent_timeline,
    _render_event_card,
    _render_export_section,
)


# Fixtures for events
@pytest.fixture
def session_id():
    return uuid4()


@pytest.fixture
def base_time():
    return datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def tool_event(session_id, base_time):
    return ToolCallEvent(
        session_id=session_id,
        timestamp=base_time,
        tool_name="read_file",
        arguments={"path": "/etc/passwd"},
        result="root:x:0:0...",
        duration_ms=150.5,
        success=True,
    )


@pytest.fixture
def memory_event(session_id, base_time):
    return MemoryAccessEvent(
        session_id=session_id,
        timestamp=base_time + timedelta(seconds=1),
        operation=MemoryAccessOperation.READ,
        key="api_key",
        value_preview="sk-...",
        sensitive_detected=True,
    )


@pytest.fixture
def speech_event(session_id, base_time):
    return SpeechRecord(
        session_id=session_id,
        timestamp=base_time + timedelta(seconds=2),
        content="I will read the file now.",
        is_response_to_user=True,
    )


@pytest.fixture
def divergence_event(session_id, base_time):
    return DivergenceEvent(
        session_id=session_id,
        timestamp=base_time + timedelta(seconds=3),
        speech_intent="read file",
        actual_action="delete file",
        severity=DivergenceSeverity.HIGH,
        explanation="Agent deleted file instead of reading",
        confidence_score=0.95,
    )


@patch("src.ui.components.agent_timeline.st")
def test_render_timeline_empty(mock_st):
    """Test rendering with no events."""
    render_agent_timeline([])
    mock_st.info.assert_called_with("No events to display.")


@patch("src.ui.components.agent_timeline.st")
def test_render_timeline_filtering(mock_st, tool_event, memory_event):
    """Test that filtering logic works (mocking st.multiselect)."""
    # Mock return value of multiselect to only return 'tool_call'
    mock_st.multiselect.return_value = ["tool_call"]
    # Mock number_input for pagination
    mock_st.number_input.return_value = 1
    # Mock columns
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    events = [tool_event, memory_event]
    render_agent_timeline(events)

    # Verify expander was called only once (for the tool call)
    # This indirectly verifies filtering logic
    assert mock_st.expander.call_count == 1
    args, _ = mock_st.expander.call_args
    assert "Tool Call" in args[0]


@patch("src.ui.components.agent_timeline.st")
def test_render_timeline_pagination(mock_st, tool_event):
    """Test pagination logic."""
    # Create 60 events
    events = [tool_event.model_copy(update={"id": uuid4()}) for _ in range(60)]

    # Mock multiselect to return all types
    mock_st.multiselect.return_value = ["tool_call"]

    # Page 1
    mock_st.number_input.return_value = 1
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    render_agent_timeline(events)
    assert mock_st.expander.call_count == 50  # Default page size

    # Reset mocks
    mock_st.expander.reset_mock()

    # Page 2
    mock_st.number_input.return_value = 2
    render_agent_timeline(events)
    assert mock_st.expander.call_count == 10  # Remaining events


@patch("src.ui.components.agent_timeline.st")
def test_render_event_card_tool(mock_st, tool_event, base_time):
    """Test rendering of tool call card details."""
    # Mock context manager for expander
    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_expander

    _render_event_card(tool_event, base_time)

    # Verify headers and content
    # Check that arguments are displayed
    json_args = False
    for call in mock_st.code.call_args_list:
        if "path" in call[0][0]:
            json_args = True
    assert json_args

    # Check result
    result_shown = False
    for call in mock_st.code.call_args_list:
        if "root:x:0:0" in call[0][0]:
            result_shown = True
    assert result_shown


@patch("src.ui.components.agent_timeline.st")
def test_render_event_card_divergence(mock_st, divergence_event, base_time):
    """Test rendering of divergence event."""
    # Mock context manager
    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_expander

    # Mock columns for divergence details
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    _render_event_card(divergence_event, base_time)

    # Check that it's expanded by default (logic in _render_event_card)
    args, kwargs = mock_st.expander.call_args
    assert "DIVERGENCE DETECTED" in args[0]
    assert kwargs["expanded"] is True

    # Check content
    mock_st.error.assert_called_with("Severity: HIGH")
    mock_st.info.assert_called_with("Agent deleted file instead of reading")


@patch("src.ui.components.agent_timeline.st")
def test_export_timeline(mock_st, tool_event):
    """Test JSON export functionality."""
    # Mock multiselect and page inputs to reach the button
    mock_st.multiselect.return_value = ["tool_call"]
    mock_st.number_input.return_value = 1
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    # Mock button to be True
    mock_st.button.return_value = True

    render_agent_timeline([tool_event])

    # Verify download button called
    mock_st.download_button.assert_called_once()
    args, kwargs = mock_st.download_button.call_args

    # Verify JSON content
    data = json.loads(kwargs["data"])
    assert len(data) == 1
    assert data[0]["tool_name"] == "read_file"


@patch("src.ui.components.agent_timeline.st")
def test_render_event_card_action(mock_st, session_id, base_time):
    """Test rendering of action record."""
    action_event = ActionRecord(
        session_id=session_id,
        timestamp=base_time,
        action_type="file_write",
        description="Writing config",
        target="/tmp/config.json",
        related_tool_calls=(uuid4(),),
    )

    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_expander

    _render_event_card(action_event, base_time)

    # Check headers
    args, _ = mock_st.expander.call_args
    assert "Action: file_write" in args[0]

    # Check details - description is rendered via st.text for XSS safety
    found_desc = False
    for call in mock_st.text.call_args_list:
        if "Writing config" in str(call):
            found_desc = True
    assert found_desc


@patch("src.ui.components.agent_timeline.st")
def test_render_event_card_speech(mock_st, speech_event, base_time):
    """Test rendering of speech record."""
    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_expander

    _render_event_card(speech_event, base_time)

    # Check headers
    args, _ = mock_st.expander.call_args
    assert "Speech (To User)" in args[0]

    # Check content
    mock_st.text.assert_called_with("I will read the file now.")


@patch("src.ui.components.agent_timeline.st")
def test_render_event_card_memory(mock_st, memory_event, base_time):
    """Test rendering of memory event."""
    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_expander

    _render_event_card(memory_event, base_time)

    # Check details
    found_op = False
    for call in mock_st.markdown.call_args_list:
        if "Operation" in call[0][0] and "read" in call[0][0]:
            found_op = True
    assert found_op

    # Check sensitive warning
    mock_st.warning.assert_called_with(
        "Sensitive data pattern detected in memory access."
    )


@patch("src.ui.components.agent_timeline.st")
def test_render_event_card_tool_failure(mock_st, session_id, base_time):
    """Test rendering of failed tool call."""
    failed_tool = ToolCallEvent(
        session_id=session_id,
        timestamp=base_time,
        tool_name="fail_tool",
        arguments={},
        result=None,
        duration_ms=10.0,
        success=False,
        exception_type="ValueError",
    )
    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__.return_value = mock_expander

    _render_event_card(failed_tool, base_time)

    mock_st.error.assert_called_with("Exception: ValueError")


@patch("src.ui.components.agent_timeline.st")
def test_export_error_handling(mock_st, tool_event):
    """Test JSON export error handling shows generic message."""
    # We test the private function directly to ensure we hit the exception handler
    # Mock json.dumps to raise exception
    with patch(
        "src.ui.components.agent_timeline.json.dumps",
        side_effect=ValueError("Serialization error"),
    ):
        _render_export_section([tool_event])

    # New implementation logs full error but shows generic message to user
    mock_st.error.assert_called_with("Failed to generate export file.")
