import sys
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def clean_imports():
    modules_to_remove = [
        "src.ui.components.event_stream",
        "streamlit",
    ]
    for m in modules_to_remove:
        if m in sys.modules:
            del sys.modules[m]
    yield


@pytest.fixture
def mock_streamlit():
    mock_st = MagicMock()
    mock_st.session_state = {}
    mock_st.columns.side_effect = lambda n: [MagicMock() for _ in range(n)]
    mock_st.button.return_value = False
    mock_st.rerun = MagicMock()
    with patch.dict(sys.modules, {"streamlit": mock_st}):
        yield mock_st


@pytest.fixture
def event_stream_module(mock_streamlit):
    import src.ui.components.event_stream as es
    return es


def test_polling_adds_events(mock_streamlit, event_stream_module):
    es = event_stream_module

    # Setup session id and auth token
    mock_streamlit.session_state["sdk_session_id"] = "token-123"
    mock_streamlit.session_state["api_base_url"] = "http://localhost:8000"
    mock_streamlit.session_state["sdk_auth_token"] = "token"

    # Mock polling to return two events
    events = [
        {"event_type": "tool_call", "tool_name": "t", "arguments": {}, "duration_ms": 1, "success": True},
        {"event_type": "speech", "content": "hello", "intent": "chat"},
    ]

    with patch.object(es, "poll_events_from_api_sync", return_value=(events, 2)):
        with patch.object(es.time, "sleep", return_value=None):
            es.render_event_stream()

    state = es.get_stream_state()
    assert len(state.events) == 2
    assert state.poll_offset == 2
    assert state.connection_status.value in ("connected", "connecting")


def test_polling_handles_error(mock_streamlit, event_stream_module):
    es = event_stream_module

    mock_streamlit.session_state["sdk_session_id"] = "token-123"

    with patch.object(es, "poll_events_from_api_sync", side_effect=es.EventPollingError("boom")):
        with patch.object(es.time, "sleep", return_value=None):
            es.render_event_stream()

    state = es.get_stream_state()
    assert state.connection_status.value == "error"
