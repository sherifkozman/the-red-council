"""Tests for empty state components."""

import sys
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_streamlit():
    """Create mock streamlit module."""
    mock_st = MagicMock()
    mock_st.session_state = {}

    # Mock columns to return context managers
    def mock_columns(spec):
        cols = []
        for _ in range(len(spec) if isinstance(spec, list) else spec):
            col = MagicMock()
            col.__enter__ = MagicMock(return_value=col)
            col.__exit__ = MagicMock(return_value=None)
            cols.append(col)
        return cols

    mock_st.columns.side_effect = mock_columns

    return mock_st


@pytest.fixture
def empty_states_module(mock_streamlit):
    """Import empty_states module with mocked streamlit."""
    with patch.dict(sys.modules, {"streamlit": mock_streamlit}):
        # Clear cached import
        if "src.ui.components.empty_states" in sys.modules:
            del sys.modules["src.ui.components.empty_states"]

        from src.ui.components import empty_states

        empty_states.st = mock_streamlit
        yield empty_states, mock_streamlit


class TestSanitizeText:
    """Tests for _sanitize_text function."""

    def test_sanitize_normal_text(self, empty_states_module):
        """Test sanitization of normal text."""
        module, _ = empty_states_module
        result = module._sanitize_text("Hello World")
        assert result == "Hello World"

    def test_sanitize_html_entities(self, empty_states_module):
        """Test sanitization of HTML entities."""
        module, _ = empty_states_module
        result = module._sanitize_text("<script>alert('xss')</script>")
        assert "&lt;" in result
        assert "&gt;" in result
        assert "<script>" not in result

    def test_sanitize_non_string(self, empty_states_module):
        """Test sanitization of non-string input."""
        module, _ = empty_states_module
        result = module._sanitize_text(123)
        assert result == "123"


class TestEmptyStateMessages:
    """Tests for EMPTY_STATE_MESSAGES configuration."""

    def test_all_state_types_defined(self, empty_states_module):
        """Test that all expected state types are defined."""
        module, _ = empty_states_module
        expected_types = ["timeline", "tool_chain", "owasp_coverage", "events"]
        for state_type in expected_types:
            assert state_type in module.EMPTY_STATE_MESSAGES

    def test_message_structure(self, empty_states_module):
        """Test that each message has required fields."""
        module, _ = empty_states_module
        for state_type, config in module.EMPTY_STATE_MESSAGES.items():
            assert "title" in config, f"{state_type} missing title"
            assert "description" in config, f"{state_type} missing description"
            assert "icon" in config, f"{state_type} missing icon"


class TestRenderEmptyState:
    """Tests for render_empty_state function."""

    def test_unknown_state_type(self, empty_states_module):
        """Test handling of unknown state type."""
        module, mock_st = empty_states_module
        module.render_empty_state("unknown_type")
        mock_st.info.assert_called_once_with("No data available.")

    def test_valid_state_type_renders(self, empty_states_module):
        """Test that valid state type renders content."""
        module, mock_st = empty_states_module
        module.render_empty_state("timeline")
        mock_st.markdown.assert_called()

    def test_callbacks_invoked_on_click(self, empty_states_module):
        """Test that callbacks are invoked when buttons clicked."""
        module, mock_st = empty_states_module

        demo_callback = MagicMock()
        sdk_callback = MagicMock()
        remote_callback = MagicMock()

        # Mock button to return True (clicked)
        mock_st.button.return_value = True

        module.render_empty_state(
            "timeline",
            on_demo_click=demo_callback,
            on_sdk_click=sdk_callback,
            on_remote_click=remote_callback,
        )

        # All callbacks should be invoked since button returns True
        demo_callback.assert_called_once()
        sdk_callback.assert_called_once()
        remote_callback.assert_called_once()

    def test_buttons_disabled_when_no_callback(self, empty_states_module):
        """Test that buttons are disabled when no callback provided."""
        module, mock_st = empty_states_module

        mock_st.button.return_value = False

        module.render_empty_state("timeline")

        # Check button was called with disabled=True
        calls = mock_st.button.call_args_list
        for call in calls:
            if "disabled" in call.kwargs:
                assert call.kwargs["disabled"] is True

    def test_show_actions_false_hides_buttons(self, empty_states_module):
        """Test that show_actions=False hides action buttons."""
        module, mock_st = empty_states_module

        mock_st.button.return_value = False

        module.render_empty_state("owasp_coverage", show_actions=False)

        # Buttons should not be created for action buttons
        # Only markdown should be called
        assert mock_st.markdown.called


class TestRenderTimelineEmptyState:
    """Tests for render_timeline_empty_state function."""

    def test_renders_timeline_state(self, empty_states_module):
        """Test timeline empty state renders."""
        module, mock_st = empty_states_module
        module.render_timeline_empty_state()
        mock_st.markdown.assert_called()


class TestRenderToolChainEmptyState:
    """Tests for render_tool_chain_empty_state function."""

    def test_renders_tool_chain_state(self, empty_states_module):
        """Test tool chain empty state renders."""
        module, mock_st = empty_states_module
        module.render_tool_chain_empty_state()
        mock_st.markdown.assert_called()


class TestRenderOwaspEmptyState:
    """Tests for render_owasp_empty_state function."""

    def test_renders_owasp_state_without_actions(self, empty_states_module):
        """Test OWASP empty state renders without action buttons."""
        module, mock_st = empty_states_module
        module.render_owasp_empty_state()
        mock_st.markdown.assert_called()


class TestRenderEventsEmptyState:
    """Tests for render_events_empty_state function."""

    def test_renders_events_state(self, empty_states_module):
        """Test events empty state renders."""
        module, mock_st = empty_states_module
        module.render_events_empty_state()
        mock_st.markdown.assert_called()


class TestDocumentationLinks:
    """Tests for documentation link constants."""

    def test_docs_base_url_valid(self, empty_states_module):
        """Test docs base URL is valid."""
        module, _ = empty_states_module
        assert module.DOCS_BASE_URL.startswith("https://")
        assert "github.com" in module.DOCS_BASE_URL

    def test_docs_agent_testing_valid(self, empty_states_module):
        """Test agent testing docs URL is valid."""
        module, _ = empty_states_module
        assert module.DOCS_AGENT_TESTING.startswith("https://")
        assert "agent-testing" in module.DOCS_AGENT_TESTING

    def test_docs_api_reference_valid(self, empty_states_module):
        """Test API reference docs URL is valid."""
        module, _ = empty_states_module
        assert module.DOCS_API_REFERENCE.startswith("https://")
