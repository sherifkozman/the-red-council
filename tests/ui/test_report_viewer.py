from unittest.mock import MagicMock, patch

from src.ui.components.report_viewer import render_report_viewer


@patch("src.ui.components.report_viewer.st")
@patch("src.ui.components.report_viewer.sanitize_markdown")
@patch("src.ui.components.report_viewer.AgentSecurityReport")
def test_render_report_viewer(MockReportClass, mock_sanitize, mock_st):
    """Test that report viewer renders content and buttons."""
    # Configure st.columns to return 2 mocks
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    # Mock sanitize
    mock_sanitize.return_value = "Sanitized Markdown"

    markdown_content = "# Report Markdown"
    json_content = '{"key": "value"}'
    report_id = "test-id"

    # Run function
    render_report_viewer(markdown_content, json_content, report_id)

    # Verify sanitize called
    mock_sanitize.assert_called_with(markdown_content)

    # Verify validation called
    MockReportClass.model_validate_json.assert_called_with(json_content)

    # Verify streamlit calls
    mock_st.divider.assert_called_once()
    mock_st.subheader.assert_called_once_with("Security Report")

    # Verify download buttons
    assert mock_st.download_button.call_count == 2

    # Check Markdown download button
    call_args_md = mock_st.download_button.call_args_list[0]
    assert call_args_md[1]["label"] == "Download Markdown Report"
    assert call_args_md[1]["data"] == markdown_content
    assert call_args_md[1]["mime"] == "text/markdown"
    assert "test-id.md" in call_args_md[1]["file_name"]

    # Check JSON download button
    call_args_json = mock_st.download_button.call_args_list[1]
    assert call_args_json[1]["label"] == "Download JSON Data"
    assert call_args_json[1]["data"] == json_content
    assert call_args_json[1]["mime"] == "application/json"

    # Verify preview expander
    mock_st.expander.assert_any_call("Report Preview", expanded=True)
    # Check unsafe_allow_html=False and sanitized content used
    mock_st.markdown.assert_called_with("Sanitized Markdown", unsafe_allow_html=False)

@patch("src.ui.components.report_viewer.st")
@patch("src.ui.components.report_viewer.AgentSecurityReport")
def test_render_report_viewer_invalid_json(MockReportClass, mock_st):
    """Test handling of invalid JSON content."""
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    # Mock validation failure
    MockReportClass.model_validate_json.side_effect = Exception("Validation Error")

    markdown_content = "# Report"
    json_content = "invalid-json"
    report_id = "id"

    render_report_viewer(markdown_content, json_content, report_id)

    # Verify error displayed in JSON expander
    mock_st.expander.assert_any_call("Raw JSON Data")
    mock_st.error.assert_called_with("Invalid or corrupted JSON content")
