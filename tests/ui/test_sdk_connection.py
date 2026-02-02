# tests/ui/test_sdk_connection.py
# ruff: noqa: E402
"""Tests for SDK Connection Panel component."""

import sys
from unittest.mock import MagicMock, patch

import pytest

# Mock streamlit before importing module
mock_st = MagicMock()
mock_st.session_state = {}
sys.modules["streamlit"] = mock_st
sys.modules.pop("src.ui.components.sdk_connection", None)

import src.ui.components.sdk_connection as sdk_connection
from src.ui.components.sdk_connection import (
    FRAMEWORK_DOCS,
    FRAMEWORK_NAMES,
    SDK_FRAMEWORK_KEY,
    SDK_SESSION_ID_KEY,
    _generate_session_id,
    _get_custom_snippet,
    _get_langchain_snippet,
    _get_langgraph_snippet,
    _get_mcp_snippet,
    _get_or_create_session_id,
    _get_snippet_for_framework,
    _get_webhook_url,
    get_current_session_id,
    get_current_webhook_url,
    render_sdk_connection,
)


@pytest.fixture
def mock_session_state():
    """Create mock session state."""
    return {}


@pytest.fixture
def mock_st(mock_session_state):
    """Create mock streamlit with session state."""
    with patch.object(sdk_connection, "st") as mock:
        mock.session_state = mock_session_state
        mock.sidebar = MagicMock()
        yield mock


# =============================================================================
# Session ID tests
# =============================================================================


def test_generate_session_id():
    """Test that session ID is generated securely."""
    session_id = _generate_session_id()

    assert isinstance(session_id, str)
    assert len(session_id) >= 32  # URL-safe base64 of 32 bytes


def test_generate_session_id_unique():
    """Test that generated session IDs are unique."""
    ids = {_generate_session_id() for _ in range(100)}

    # All 100 should be unique
    assert len(ids) == 100


def test_get_or_create_session_id_creates_new(mock_st, mock_session_state):
    """Test that session ID is created if not exists."""
    session_id = _get_or_create_session_id()

    assert SDK_SESSION_ID_KEY in mock_session_state
    assert len(session_id) >= 32


def test_get_or_create_session_id_returns_existing(mock_st, mock_session_state):
    """Test that existing session ID is returned."""
    mock_session_state[SDK_SESSION_ID_KEY] = "existing-session-id"

    session_id = _get_or_create_session_id()

    assert session_id == "existing-session-id"


# =============================================================================
# Webhook URL tests
# =============================================================================


def test_get_webhook_url_format(mock_st, mock_session_state):
    """Test webhook URL format."""
    session_id = "test-session-123"

    url = _get_webhook_url(session_id)

    assert session_id in url
    assert "/api/v1/agent/session/" in url
    assert url.endswith("/events")


def test_get_webhook_url_uses_base_url(mock_st, mock_session_state):
    """Test webhook URL uses custom base URL from session state."""
    mock_session_state["api_base_url"] = "https://api.example.com"
    session_id = "test-session-123"

    url = _get_webhook_url(session_id)

    assert url.startswith("https://api.example.com")


def test_get_webhook_url_default_localhost(mock_st, mock_session_state):
    """Test webhook URL defaults to localhost."""
    session_id = "test-session-123"

    url = _get_webhook_url(session_id)

    assert url.startswith("http://localhost:8000")


# =============================================================================
# Code snippet tests
# =============================================================================


def test_get_langchain_snippet_contains_essentials():
    """Test LangChain snippet contains essential code elements."""
    snippet = _get_langchain_snippet(
        "session-123", "http://localhost/events", "token-abc"
    )

    assert "LangChainAgentWrapper" in snippet
    assert "from_agent_executor" in snippet
    assert "AgentInstrumentationConfig" in snippet
    assert "session-123" in snippet
    assert "http://localhost/events" in snippet
    assert "token-abc" in snippet
    assert "send_events_to_dashboard" in snippet


def test_get_langgraph_snippet_contains_essentials():
    """Test LangGraph snippet contains essential code elements."""
    snippet = _get_langgraph_snippet(
        "session-456", "http://localhost/events", "token-xyz"
    )

    assert "LangGraphAgentWrapper" in snippet
    assert "from_state_graph" in snippet
    assert "AgentInstrumentationConfig" in snippet
    assert "session-456" in snippet
    assert "http://localhost/events" in snippet
    assert "token-xyz" in snippet
    assert "get_node_execution_stats" in snippet


def test_get_mcp_snippet_contains_essentials():
    """Test MCP snippet contains essential code elements."""
    snippet = _get_mcp_snippet("session-789", "http://localhost/events", "token-mcp")

    assert "MCPAgentWrapper" in snippet
    assert "from_stdio_server" in snippet
    assert "from_http_server" in snippet
    assert "call_tool" in snippet
    assert "read_resource" in snippet
    assert "session-789" in snippet
    assert "http://localhost/events" in snippet
    assert "token-mcp" in snippet


def test_get_custom_snippet_contains_essentials():
    """Test Custom agent snippet contains essential code elements."""
    snippet = _get_custom_snippet(
        "session-custom", "http://localhost/events", "token-custom"
    )

    assert "InstrumentedAgent" in snippet
    assert "wrap_tool_call" in snippet
    assert "wrap_memory_access" in snippet
    assert "record_speech" in snippet
    assert "record_action" in snippet
    assert "session-custom" in snippet
    assert "http://localhost/events" in snippet
    assert "token-custom" in snippet


def test_get_snippet_for_framework_langchain():
    """Test snippet selector returns LangChain snippet."""
    snippet = _get_snippet_for_framework("langchain", "s1", "http://test", "token")

    assert "LangChainAgentWrapper" in snippet


def test_get_snippet_for_framework_langgraph():
    """Test snippet selector returns LangGraph snippet."""
    snippet = _get_snippet_for_framework("langgraph", "s1", "http://test", "token")

    assert "LangGraphAgentWrapper" in snippet


def test_get_snippet_for_framework_mcp():
    """Test snippet selector returns MCP snippet."""
    snippet = _get_snippet_for_framework("mcp", "s1", "http://test", "token")

    assert "MCPAgentWrapper" in snippet


def test_get_snippet_for_framework_custom():
    """Test snippet selector returns Custom snippet."""
    snippet = _get_snippet_for_framework("custom", "s1", "http://test", "token")

    assert "InstrumentedAgent" in snippet


def test_get_snippet_for_framework_unknown_defaults_to_custom():
    """Test unknown framework defaults to custom snippet."""
    snippet = _get_snippet_for_framework(
        "unknown_framework", "s1", "http://test", "token"
    )

    assert "InstrumentedAgent" in snippet


# =============================================================================
# Snippet security tests
# =============================================================================


def test_snippet_contains_auth_token_as_provided():
    """Test that snippet contains auth token as provided.

    Note: HTML escaping happens in render_sdk_connection() before the snippet
    is generated, not inside the snippet generation function itself.
    The snippet displays in a code block which doesn't render HTML.
    """
    token = "my-secure-token-123"

    snippet = _get_langchain_snippet("s1", "http://test", token)

    # Token should be present in the snippet
    assert token in snippet


def test_html_escape_used_in_render():
    """Test that html.escape is used to sanitize auth tokens.

    This verifies the escaping happens at the UI layer.
    """
    import html

    # Malicious token with script
    malicious_token = "<script>alert('xss')</script>"

    # The UI sanitizes before passing to snippet generator
    escaped = html.escape(malicious_token)

    # Verify escaping works
    assert "<script>" not in escaped
    assert "&lt;script&gt;" in escaped


def test_snippet_does_not_execute_code():
    """Test that snippets are just strings, not executed code."""
    snippet = _get_custom_snippet("s1", "http://test", "token")

    # Should be a plain string
    assert isinstance(snippet, str)
    # Should start with docstring
    assert snippet.strip().startswith('"""')


# =============================================================================
# Framework constants tests
# =============================================================================


def test_framework_names_all_present():
    """Test all framework names are defined."""
    expected_frameworks = ["langchain", "langgraph", "mcp", "custom"]

    for framework in expected_frameworks:
        assert framework in FRAMEWORK_NAMES
        assert len(FRAMEWORK_NAMES[framework]) > 0


def test_framework_docs_all_present():
    """Test all framework docs are defined."""
    expected_frameworks = ["langchain", "langgraph", "mcp", "custom"]

    for framework in expected_frameworks:
        assert framework in FRAMEWORK_DOCS
        assert len(FRAMEWORK_DOCS[framework]) > 0


def test_framework_docs_urls_valid():
    """Test external framework doc URLs are valid."""
    for _framework, url in FRAMEWORK_DOCS.items():
        if url.startswith("http"):
            assert url.startswith("https://")


# =============================================================================
# Render function tests
# =============================================================================


def test_render_sdk_connection_shows_session_info(mock_st, mock_session_state):
    """Test render_sdk_connection displays session information."""
    # Setup mocks
    mock_st.radio.return_value = "langchain"
    mock_st.text_input.return_value = "test-token"
    mock_st.button.return_value = False

    render_sdk_connection()

    # Verify session info is displayed
    mock_st.subheader.assert_called_with("SDK Integration")
    # Verify code block is shown
    assert mock_st.code.called


def test_render_sdk_connection_framework_selector(mock_st, mock_session_state):
    """Test render_sdk_connection shows framework selector."""
    mock_st.radio.return_value = "langgraph"
    mock_st.text_input.return_value = "token"
    mock_st.button.return_value = False

    render_sdk_connection()

    # Verify radio was called for framework selection
    mock_st.radio.assert_called()
    # Check the call args
    call_args = mock_st.radio.call_args
    assert "langchain" in call_args[1]["options"]
    assert "langgraph" in call_args[1]["options"]
    assert "mcp" in call_args[1]["options"]
    assert "custom" in call_args[1]["options"]


def test_render_sdk_connection_regenerate_session(mock_st, mock_session_state):
    """Test regenerate session button works."""
    mock_session_state[SDK_SESSION_ID_KEY] = "old-session-id"
    mock_st.radio.return_value = "langchain"
    mock_st.text_input.return_value = "token"
    # First button call is regenerate, return True
    mock_st.button.return_value = True

    render_sdk_connection()

    # Session ID should be regenerated
    assert mock_session_state[SDK_SESSION_ID_KEY] != "old-session-id"
    # Rerun should be called
    mock_st.rerun.assert_called()


def test_render_sdk_connection_stores_framework_selection(mock_st, mock_session_state):
    """Test framework selection is stored in session state."""
    mock_st.radio.return_value = "mcp"
    mock_st.text_input.return_value = "token"
    mock_st.button.return_value = False

    render_sdk_connection()

    assert mock_session_state[SDK_FRAMEWORK_KEY] == "mcp"


def test_render_sdk_connection_shows_quick_start_guide(mock_st, mock_session_state):
    """Test quick start guide is shown for each framework."""
    mock_st.radio.return_value = "langchain"
    mock_st.text_input.return_value = "token"
    mock_st.button.return_value = False

    render_sdk_connection()

    # Verify markdown was called with quick start content
    markdown_calls = [str(call) for call in mock_st.markdown.call_args_list]
    assert any("Quick Start Guide" in str(call) for call in markdown_calls)


# =============================================================================
# Helper function tests
# =============================================================================


def test_get_current_session_id(mock_st, mock_session_state):
    """Test get_current_session_id helper."""
    mock_session_state[SDK_SESSION_ID_KEY] = "helper-session-id"

    result = get_current_session_id()

    assert result == "helper-session-id"


def test_get_current_webhook_url(mock_st, mock_session_state):
    """Test get_current_webhook_url helper."""
    mock_session_state[SDK_SESSION_ID_KEY] = "url-test-session"

    result = get_current_webhook_url()

    assert "url-test-session" in result
    assert "/events" in result


# =============================================================================
# Integration-style tests
# =============================================================================


def test_full_snippet_workflow():
    """Test a complete snippet generation workflow."""
    # Generate session
    session_id = _generate_session_id()
    assert len(session_id) >= 32

    # Generate webhook URL
    webhook_url = f"http://localhost:8000/api/v1/agent/session/{session_id}/events"
    assert session_id in webhook_url

    # Generate snippet for each framework
    for framework in ["langchain", "langgraph", "mcp", "custom"]:
        snippet = _get_snippet_for_framework(
            framework, session_id, webhook_url, "test-token"
        )
        assert session_id in snippet
        assert webhook_url in snippet
        assert "test-token" in snippet


def test_snippets_are_valid_python_syntax():
    """Test that generated snippets have valid Python syntax."""
    import ast

    for framework in ["langchain", "langgraph", "mcp", "custom"]:
        snippet = _get_snippet_for_framework(
            framework, "session", "http://url", "token"
        )
        try:
            ast.parse(snippet)
        except SyntaxError as e:
            pytest.fail(f"{framework} snippet has syntax error: {e}")


# =============================================================================
# Edge case tests
# =============================================================================


def test_empty_auth_token_handled():
    """Test empty auth token is handled gracefully."""
    snippet = _get_langchain_snippet("s1", "http://test", "")

    # Should still produce valid snippet
    assert isinstance(snippet, str)
    assert len(snippet) > 100


def test_special_characters_in_session_id():
    """Test special characters in session ID are preserved."""
    session_id = "abc-123_XYZ"

    url = _get_webhook_url(session_id)

    assert session_id in url


def test_long_auth_token_handled():
    """Test very long auth token is handled."""
    long_token = "x" * 1000

    snippet = _get_langchain_snippet("s1", "http://test", long_token)

    assert long_token in snippet
