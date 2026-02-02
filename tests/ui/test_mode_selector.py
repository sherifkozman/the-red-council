"""Tests for mode selector component."""

from unittest.mock import MagicMock, patch

import pytest

from src.core.agent_schemas import AgentInstrumentationConfig
from src.ui.components.mode_selector import (
    AGENT_CONFIG_KEY,
    AGENT_EVENTS_KEY,
    AGENT_SCORE_KEY,
    DEFAULT_AGENT_CONFIG,
    MODE_KEY,
    TestingMode,
    _clear_agent_state,
    _init_session_state,
    _on_mode_change,
    get_agent_config,
    get_current_mode,
    is_agent_mode,
    render_agent_config_panel,
    render_memory_config,
    render_mode_selector,
    render_tool_registration_form,
)


@pytest.fixture
def mock_session_state():
    """Create mock session state."""
    return {}


@pytest.fixture
def mock_st(mock_session_state):
    """Create mock streamlit with session state."""
    with patch("src.ui.components.mode_selector.st") as mock:
        mock.session_state = mock_session_state
        mock.sidebar = MagicMock()
        yield mock


# Test: Init session state
def test_init_session_state(mock_st, mock_session_state):
    """Test session state initialization."""
    _init_session_state()

    assert MODE_KEY in mock_session_state
    assert mock_session_state[MODE_KEY] == "llm"
    assert AGENT_CONFIG_KEY in mock_session_state
    assert AGENT_EVENTS_KEY in mock_session_state
    assert mock_session_state[AGENT_EVENTS_KEY] == []
    assert AGENT_SCORE_KEY in mock_session_state
    assert mock_session_state[AGENT_SCORE_KEY] is None


# Test: Init does not overwrite existing state
def test_init_session_state_preserves_existing(mock_st, mock_session_state):
    """Test that init doesn't overwrite existing state."""
    mock_session_state[MODE_KEY] = "agent"
    mock_session_state[AGENT_EVENTS_KEY] = ["event1"]

    _init_session_state()

    assert mock_session_state[MODE_KEY] == "agent"
    assert mock_session_state[AGENT_EVENTS_KEY] == ["event1"]


# Test: Clear agent state
def test_clear_agent_state(mock_st, mock_session_state):
    """Test clearing agent-specific state."""
    mock_session_state[AGENT_EVENTS_KEY] = ["event1", "event2"]
    mock_session_state[AGENT_SCORE_KEY] = {"score": 5}
    mock_session_state[AGENT_CONFIG_KEY] = AgentInstrumentationConfig(
        enable_tool_interception=False,
        enable_memory_monitoring=False,
        divergence_threshold=0.8,
        sampling_rate=0.5,
        max_events=100,
    )

    _clear_agent_state()

    assert mock_session_state[AGENT_EVENTS_KEY] == []
    assert mock_session_state[AGENT_SCORE_KEY] is None
    assert mock_session_state[AGENT_CONFIG_KEY] == DEFAULT_AGENT_CONFIG


# Test: On mode change from LLM to Agent
def test_on_mode_change_llm_to_agent(mock_st, mock_session_state):
    """Test mode change from LLM to Agent."""
    mock_session_state[MODE_KEY] = "llm"
    mock_session_state["mode_radio"] = "agent"

    _on_mode_change()

    assert mock_session_state[MODE_KEY] == "agent"


# Test: On mode change from Agent to LLM clears agent state
def test_on_mode_change_agent_to_llm_clears_state(mock_st, mock_session_state):
    """Test that switching from agent to LLM clears agent state."""
    mock_session_state[MODE_KEY] = "agent"
    mock_session_state["mode_radio"] = "llm"
    mock_session_state[AGENT_EVENTS_KEY] = ["event1"]
    mock_session_state[AGENT_SCORE_KEY] = {"score": 5}
    mock_session_state[AGENT_CONFIG_KEY] = DEFAULT_AGENT_CONFIG

    _on_mode_change()

    assert mock_session_state[MODE_KEY] == "llm"
    assert mock_session_state[AGENT_EVENTS_KEY] == []
    assert mock_session_state[AGENT_SCORE_KEY] is None


# Test: On mode change same mode does nothing
def test_on_mode_change_same_mode(mock_st, mock_session_state):
    """Test that same mode change is a no-op."""
    mock_session_state[MODE_KEY] = "llm"
    mock_session_state["mode_radio"] = "llm"
    mock_session_state[AGENT_EVENTS_KEY] = ["event1"]

    _on_mode_change()

    # Events should not be cleared
    assert mock_session_state[AGENT_EVENTS_KEY] == ["event1"]


# Test: Render mode selector
def test_render_mode_selector(mock_st, mock_session_state):
    """Test mode selector rendering."""
    mock_st.sidebar.radio.return_value = "llm"

    result = render_mode_selector()

    assert result == "llm"
    mock_st.sidebar.subheader.assert_called_with("Testing Mode")
    mock_st.sidebar.radio.assert_called_once()
    mock_st.sidebar.info.assert_called()


# Test: Render mode selector returns agent mode
def test_render_mode_selector_agent_mode(mock_st, mock_session_state):
    """Test mode selector returns agent mode."""
    mock_session_state[MODE_KEY] = "agent"
    mock_st.sidebar.radio.return_value = "agent"

    result = render_mode_selector()

    assert result == "agent"


# Test: Render agent config panel
def test_render_agent_config_panel(mock_st, mock_session_state):
    """Test agent config panel rendering."""
    mock_session_state[AGENT_CONFIG_KEY] = DEFAULT_AGENT_CONFIG
    mock_st.sidebar.checkbox.side_effect = [True, True]  # Two checkboxes
    mock_st.sidebar.slider.side_effect = [0.5, 1.0]  # Two sliders
    mock_st.sidebar.number_input.return_value = 5000

    result = render_agent_config_panel()

    assert isinstance(result, AgentInstrumentationConfig)
    mock_st.sidebar.subheader.assert_called_with("Agent Configuration")
    assert mock_st.sidebar.checkbox.call_count == 2
    assert mock_st.sidebar.slider.call_count == 2


# Test: Render agent config panel updates session state
def test_render_agent_config_panel_updates_state(mock_st, mock_session_state):
    """Test that config panel updates session state."""
    mock_session_state[AGENT_CONFIG_KEY] = DEFAULT_AGENT_CONFIG
    mock_st.sidebar.checkbox.side_effect = [False, True]  # Disable tools, enable memory
    mock_st.sidebar.slider.side_effect = [0.7, 0.8]  # New thresholds
    mock_st.sidebar.number_input.return_value = 2000

    render_agent_config_panel()

    config = mock_session_state[AGENT_CONFIG_KEY]
    assert config.enable_tool_interception is False
    assert config.enable_memory_monitoring is True
    assert config.divergence_threshold == 0.7
    assert config.sampling_rate == 0.8
    assert config.max_events == 2000


# Test: Render tool registration form
def test_render_tool_registration_form(mock_st, mock_session_state):
    """Test tool registration form rendering."""
    # Mock expander as context manager
    mock_expander_ctx = MagicMock()
    mock_st.sidebar.expander.return_value = mock_expander_ctx
    mock_expander_ctx.__enter__ = MagicMock(return_value=mock_expander_ctx)
    mock_expander_ctx.__exit__ = MagicMock(return_value=False)

    # Mock the inputs called inside the expander
    mock_st.text_input.return_value = ""
    mock_st.text_area.return_value = ""
    mock_st.button.return_value = False

    render_tool_registration_form()

    mock_st.sidebar.subheader.assert_called_with("Tool Registration")
    mock_st.sidebar.expander.assert_called()


# Test: Render tool registration form with button click (no tool name)
def test_render_tool_registration_form_empty_name(mock_st, mock_session_state):
    """Test tool registration warning when no name provided."""
    mock_expander_ctx = MagicMock()
    mock_st.sidebar.expander.return_value = mock_expander_ctx
    mock_expander_ctx.__enter__ = MagicMock(return_value=mock_expander_ctx)
    mock_expander_ctx.__exit__ = MagicMock(return_value=False)

    # Empty tool name
    mock_st.text_input.side_effect = ["", ""]
    mock_st.text_area.return_value = ""
    mock_st.button.return_value = True
    mock_st.warning = MagicMock()

    render_tool_registration_form()

    # Verify warning was shown
    mock_st.warning.assert_called_with("Please provide tool name and description.")


# Test: Render memory config
def test_render_memory_config(mock_st, mock_session_state):
    """Test memory config rendering."""
    mock_expander_ctx = MagicMock()
    mock_st.sidebar.expander.return_value = mock_expander_ctx
    mock_expander_ctx.__enter__ = MagicMock(return_value=mock_expander_ctx)
    mock_expander_ctx.__exit__ = MagicMock(return_value=False)

    # Mock the inputs inside the expander
    mock_st.text_input.return_value = ".*"
    mock_st.number_input.return_value = 10000

    render_memory_config()

    mock_st.sidebar.subheader.assert_called_with("Memory Configuration")
    mock_st.sidebar.expander.assert_called()


# Test: Get current mode
def test_get_current_mode(mock_st, mock_session_state):
    """Test getting current mode."""
    mock_session_state[MODE_KEY] = "agent"

    result = get_current_mode()

    assert result == "agent"


# Test: Get current mode default
def test_get_current_mode_default(mock_st, mock_session_state):
    """Test getting current mode returns default."""
    result = get_current_mode()

    assert result == "llm"


# Test: Get agent config
def test_get_agent_config(mock_st, mock_session_state):
    """Test getting agent config."""
    custom_config = AgentInstrumentationConfig(
        enable_tool_interception=False,
        enable_memory_monitoring=True,
        divergence_threshold=0.3,
        sampling_rate=0.9,
        max_events=1000,
    )
    mock_session_state[AGENT_CONFIG_KEY] = custom_config

    result = get_agent_config()

    assert result == custom_config


# Test: Get agent config default
def test_get_agent_config_default(mock_st, mock_session_state):
    """Test getting agent config returns default."""
    result = get_agent_config()

    assert result == DEFAULT_AGENT_CONFIG


# Test: Is agent mode
def test_is_agent_mode_true(mock_st, mock_session_state):
    """Test is_agent_mode returns True in agent mode."""
    mock_session_state[MODE_KEY] = "agent"

    assert is_agent_mode() is True


# Test: Is agent mode false
def test_is_agent_mode_false(mock_st, mock_session_state):
    """Test is_agent_mode returns False in LLM mode."""
    mock_session_state[MODE_KEY] = "llm"

    assert is_agent_mode() is False


# Test: Default agent config values
def test_default_agent_config():
    """Test default agent config values."""
    assert DEFAULT_AGENT_CONFIG.enable_tool_interception is True
    assert DEFAULT_AGENT_CONFIG.enable_memory_monitoring is True
    assert DEFAULT_AGENT_CONFIG.divergence_threshold == 0.5
    assert DEFAULT_AGENT_CONFIG.sampling_rate == 1.0
    assert DEFAULT_AGENT_CONFIG.max_events == 5000


# Test: TestingMode type alias
def test_testing_mode_type():
    """Test TestingMode type alias values."""
    llm_mode: TestingMode = "llm"
    agent_mode: TestingMode = "agent"

    assert llm_mode == "llm"
    assert agent_mode == "agent"


# Test: Mode help text exists
def test_mode_help_text():
    """Test that mode help text is defined."""
    from src.ui.components.mode_selector import MODE_HELP

    assert "llm" in MODE_HELP
    assert "agent" in MODE_HELP
    assert len(MODE_HELP["llm"]) > 0
    assert len(MODE_HELP["agent"]) > 0


# Test: XSS protection in html.escape function
def test_xss_protection_html_escape():
    """Test that html.escape correctly escapes XSS payloads."""
    import html

    malicious_name = "<script>alert('xss')</script>"
    escaped = html.escape(malicious_name)

    assert "<script>" not in escaped
    assert "&lt;script&gt;" in escaped
    assert "alert" in escaped  # Content preserved but escaped
