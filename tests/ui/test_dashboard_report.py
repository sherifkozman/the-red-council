from unittest.mock import MagicMock, patch

import pytest

from src.ui.components.mode_selector import AGENT_EVENTS_KEY, AGENT_SCORE_KEY
from src.ui.dashboard import render_agent_mode


@pytest.fixture
def mock_session_state():
    return {
        AGENT_EVENTS_KEY: ["event1", "event2"],
        AGENT_SCORE_KEY: MagicMock()
    }

@patch("src.ui.dashboard.st")
@patch("src.ui.dashboard.get_agent_config")
@patch("src.ui.dashboard.render_agent_config_panel")
@patch("src.ui.dashboard.render_tool_registration_form")
@patch("src.ui.dashboard.render_memory_config")
@patch("src.reports.agent_report_generator.AgentReportGenerator")
@patch("src.ui.components.report_viewer.render_report_viewer")
@patch("src.ui.components.owasp_coverage.render_owasp_coverage")
def test_generate_report_button(
    mock_render_owasp,
    mock_render_viewer,
    MockGenerator,
    mock_render_memory,
    mock_render_tool,
    mock_render_config,
    mock_get_config,
    mock_st,
    mock_session_state
):
    """Test that Generate Report button triggers report generation."""
    # Connect mock_st.session_state to our fixture
    mock_st.session_state = mock_session_state

    # Setup mocks
    mock_st.button.side_effect = [False, False, True]
    mock_col = MagicMock()
    mock_st.columns.return_value = [mock_col, mock_col, mock_col]
    mock_st.tabs.return_value = [MagicMock(), MagicMock(), MagicMock(), MagicMock()]

    # Setup Generator
    mock_gen_instance = MockGenerator.return_value
    mock_report = MagicMock()
    mock_report.id = "report-123"
    mock_report.model_dump_json.return_value = '{"id": "123"}'
    mock_gen_instance.generate.return_value = mock_report
    mock_gen_instance.render.return_value = "# MD"

    # Execute
    render_agent_mode()

    # Verify generator called
    mock_gen_instance.generate.assert_called_once()
    mock_gen_instance.render.assert_called_once_with(mock_report)

    # Verify report stored in session state
    assert mock_session_state["agent_report"] == mock_report
    assert mock_session_state["report_markdown"] == "# MD"
    assert mock_session_state["report_json"] == '{"id": "123"}'

    # Verify report viewer rendered with correct args
    mock_render_viewer.assert_called_once_with("# MD", '{"id": "123"}', "report-123")

@patch("src.ui.dashboard.st")
@patch("src.ui.dashboard.get_agent_config")
@patch("src.ui.dashboard.render_agent_config_panel")
@patch("src.ui.dashboard.render_tool_registration_form")
@patch("src.ui.dashboard.render_memory_config")
@patch("src.reports.agent_report_generator.AgentReportGenerator")
@patch("src.ui.components.owasp_coverage.render_owasp_coverage")
def test_generate_report_error(
    mock_render_owasp,
    MockGenerator,
    mock_render_memory,
    mock_render_tool,
    mock_render_config,
    mock_get_config,
    mock_st,
    mock_session_state
):
    """Test error handling during report generation."""
    mock_st.session_state = mock_session_state
    # Remove one event to make it different
    mock_session_state[AGENT_EVENTS_KEY] = ["event1"]

    # Setup mocks to fail
    mock_st.button.side_effect = [False, False, True]
    mock_col = MagicMock()
    mock_st.columns.return_value = [mock_col, mock_col, mock_col]
    mock_st.tabs.return_value = [MagicMock(), MagicMock(), MagicMock(), MagicMock()]

    mock_gen_instance = MockGenerator.return_value
    mock_gen_instance.generate.side_effect = Exception("Gen error")

    # Execute
    render_agent_mode()

    # Verify error shown
    mock_st.error.assert_called_with("Failed to generate report: Gen error")

    # Verify report NOT stored
    assert "agent_report" not in mock_session_state
