from unittest.mock import MagicMock, patch

from src.ui.components.shortcuts import render_keyboard_shortcuts


@patch("src.ui.components.shortcuts.st")
@patch("src.ui.components.shortcuts.components")
def test_render_keyboard_shortcuts(mock_components, mock_st):
    """Test that keyboard shortcuts component renders correctly."""
    # Setup mocks
    mock_expander = MagicMock()
    mock_st.sidebar.expander.return_value.__enter__.return_value = mock_expander
    
    # Run function
    render_keyboard_shortcuts()
    
    # Verify JS injection
    mock_components.html.assert_called_once()
    args, kwargs = mock_components.html.call_args
    js_code = args[0]
    
    # Verify JS content contains critical logic
    assert "<script>" in js_code
    assert "document.addEventListener('keydown'" in js_code
    assert "shortcutLock" in js_code  # Check for debounce
    assert "btn.disabled" in js_code  # Check for disabled check
    
    # Check updated shortcuts
    assert "Run Evaluation" in js_code
    assert "Generate Report" in js_code
    assert "Load Demo Data" in js_code
    assert "New Session" in js_code
    assert "Clear Events" in js_code
    assert "e.shiftKey" in js_code  # Check for Shift modifier usage
    
    # Verify visual help panel
    mock_st.sidebar.expander.assert_called_with("⌨️ Keyboard Shortcuts", expanded=False)
    mock_st.markdown.assert_called_once()
    markdown_content = mock_st.markdown.call_args[0][0]
    assert "Power User Controls" in markdown_content
    assert "Ctrl + Shift + N" in markdown_content  # Check updated help text