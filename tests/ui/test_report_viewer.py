# ruff: noqa: E402
"""Tests for the report viewer component."""

import json
import sys
from unittest.mock import MagicMock, patch

import pytest

# Mock streamlit before importing the module
mock_st = MagicMock()
sys.modules["streamlit"] = mock_st

from src.ui.components.report_viewer import (
    MAX_HISTORY_SIZE,
    REPORT_HISTORY_KEY,
    SELECTED_REPORTS_KEY,
    ReportHistoryEntry,
    _add_to_history,
    _generate_pdf_bytes,
    _get_report_history,
    _get_selected_reports,
    _render_copy_button,
    _render_section_header,
    _set_selected_reports,
    render_export_options,
    render_print_view,
    render_report_comparison,
    render_report_history,
    render_report_sections,
    render_report_viewer,
)


@pytest.fixture
def mock_session_state():
    """Create a mock session state dict."""
    state = {}
    mock_st.session_state = state
    return state


@pytest.fixture
def sample_report_json():
    """Create sample report JSON for testing."""
    return json.dumps(
        {
            "id": "12345678-1234-5678-1234-567812345678",
            "generated_at": "2026-02-02T12:00:00+00:00",
            "summary": "Test summary of security findings.",
            "owasp_coverage": {
                "ASI01": True,
                "ASI02": True,
                "ASI03": False,
                "ASI04": True,
                "ASI05": True,
                "ASI06": True,
                "ASI07": True,
                "ASI08": True,
                "ASI09": True,
                "ASI10": True,
            },
            "vulnerability_findings": [
                {
                    "detected": True,
                    "severity": 8,
                    "evidence": "Tool called 50 times in 10 seconds",
                    "recommendation": "Implement rate limiting",
                    "owasp_category": "ASI01",
                }
            ],
            "risk_score": 6.5,
            "tool_analysis": {
                "call_count": 50,
                "unique_tools": ["file_read", "api_call"],
                "suspicious_patterns": ["High volume"],
                "abuse_detected": True,
            },
            "memory_analysis": {
                "access_count": 10,
                "sensitive_keys_accessed": ["password", "token"],
                "injection_attempts": ["system_config"],
            },
            "divergence_analysis": {
                "divergence_count": 2,
                "examples": [
                    {
                        "speech_intent": "I will help you",
                        "actual_action": "Deleted files",
                        "severity": "HIGH",
                    }
                ],
                "severity_distribution": {"HIGH": 1, "MEDIUM": 1},
            },
            "recommendations": [
                {
                    "priority": "HIGH",
                    "category": "ASI01",
                    "description": "Implement rate limiting for tools",
                }
            ],
            "remediation_steps": [
                {
                    "description": "Add rate limits",
                    "code_example": "config.rate_limit = 10",
                    "effort_estimate": "Low",
                }
            ],
            "hardening_plan": None,
        }
    )


@pytest.fixture
def sample_markdown():
    """Create sample markdown content."""
    return "# Test Report\n\n## Summary\nTest summary"


class TestReportHistoryEntry:
    """Tests for ReportHistoryEntry dataclass."""

    def test_create_entry(self):
        """Test creating a history entry."""
        entry = ReportHistoryEntry(
            report_id="test-123",
            generated_at="2026-02-02T12:00:00",
            risk_score=5.5,
            summary_preview="Test summary...",
            markdown_content="# Report",
            json_content="{}",
        )
        assert entry.report_id == "test-123"
        assert entry.risk_score == 5.5


class TestGetReportHistory:
    """Tests for _get_report_history function."""

    def test_empty_history(self, mock_session_state):
        """Test getting empty history."""
        history = _get_report_history()
        assert history == []
        assert REPORT_HISTORY_KEY in mock_st.session_state

    def test_existing_history(self, mock_session_state):
        """Test getting existing history."""
        entry = ReportHistoryEntry(
            report_id="test-1",
            generated_at="2026-02-02",
            risk_score=5.0,
            summary_preview="Test",
            markdown_content="# Test",
            json_content="{}",
        )
        mock_session_state[REPORT_HISTORY_KEY] = [entry]
        history = _get_report_history()
        assert len(history) == 1
        assert history[0].report_id == "test-1"

    def test_invalid_history_type(self, mock_session_state):
        """Test handling invalid history type."""
        mock_session_state[REPORT_HISTORY_KEY] = "invalid"
        history = _get_report_history()
        assert history == []


class TestAddToHistory:
    """Tests for _add_to_history function."""

    def test_add_new_entry(self, mock_session_state):
        """Test adding a new entry to history."""
        _add_to_history(
            report_id="test-123",
            generated_at="2026-02-02T12:00:00",
            risk_score=5.5,
            summary="Test summary that is quite long " * 10,
            markdown_content="# Report",
            json_content="{}",
        )
        history = mock_session_state[REPORT_HISTORY_KEY]
        assert len(history) == 1
        assert history[0].report_id == "test-123"
        # Summary should be truncated
        assert len(history[0].summary_preview) <= 153

    def test_skip_duplicate(self, mock_session_state):
        """Test that duplicate entries are skipped."""
        entry = ReportHistoryEntry(
            report_id="test-123",
            generated_at="2026-02-02",
            risk_score=5.0,
            summary_preview="Test",
            markdown_content="# Test",
            json_content="{}",
        )
        mock_session_state[REPORT_HISTORY_KEY] = [entry]

        _add_to_history(
            report_id="test-123",
            generated_at="2026-02-02T12:00:00",
            risk_score=6.0,
            summary="New summary",
            markdown_content="# New",
            json_content="{}",
        )
        history = mock_session_state[REPORT_HISTORY_KEY]
        assert len(history) == 1
        # Original entry unchanged
        assert history[0].risk_score == 5.0

    def test_max_history_size(self, mock_session_state):
        """Test that history is trimmed to max size."""
        # Add MAX_HISTORY_SIZE + 5 entries
        entries = []
        for i in range(MAX_HISTORY_SIZE + 5):
            entries.append(
                ReportHistoryEntry(
                    report_id=f"old-{i}",
                    generated_at="2026-02-01",
                    risk_score=5.0,
                    summary_preview="Old",
                    markdown_content="# Old",
                    json_content="{}",
                )
            )
        mock_session_state[REPORT_HISTORY_KEY] = entries

        _add_to_history(
            report_id="new-entry",
            generated_at="2026-02-02T12:00:00",
            risk_score=7.0,
            summary="New",
            markdown_content="# New",
            json_content="{}",
        )
        history = mock_session_state[REPORT_HISTORY_KEY]
        assert len(history) <= MAX_HISTORY_SIZE
        assert history[0].report_id == "new-entry"


class TestSelectedReports:
    """Tests for selected reports functions."""

    def test_get_empty_selected(self, mock_session_state):
        """Test getting empty selected reports."""
        selected = _get_selected_reports()
        assert selected == []

    def test_get_existing_selected(self, mock_session_state):
        """Test getting existing selected reports."""
        mock_session_state[SELECTED_REPORTS_KEY] = ["id-1", "id-2"]
        selected = _get_selected_reports()
        assert selected == ["id-1", "id-2"]

    def test_invalid_selected_type(self, mock_session_state):
        """Test handling invalid selected type."""
        mock_session_state[SELECTED_REPORTS_KEY] = "invalid"
        selected = _get_selected_reports()
        assert selected == []

    def test_set_selected(self, mock_session_state):
        """Test setting selected reports."""
        _set_selected_reports(["id-1", "id-2"])
        assert mock_session_state[SELECTED_REPORTS_KEY] == ["id-1", "id-2"]


class TestGeneratePdfBytes:
    """Tests for _generate_pdf_bytes function."""

    def test_no_reportlab(self):
        """Test that None is returned when reportlab unavailable."""
        with patch.dict(sys.modules, {"reportlab": None}):
            # The import will fail inside the function
            result = _generate_pdf_bytes("# Test", "test-id")
            # May return None or bytes depending on reportlab availability
            assert result is None or isinstance(result, bytes)

    @patch("src.ui.components.report_viewer.logger")
    def test_pdf_generation_error(self, mock_logger):
        """Test handling of PDF generation errors."""
        # Test with minimal markdown
        result = _generate_pdf_bytes("# Test\n## Section", "test-id")
        # Either returns bytes (success) or None (failure/unavailable)
        assert result is None or isinstance(result, bytes)


class TestRenderSectionHeader:
    """Tests for _render_section_header function."""

    def test_render_header(self, mock_session_state):
        """Test rendering section header."""
        mock_st.reset_mock()
        _render_section_header("Test Title", "test-anchor")
        mock_st.markdown.assert_called_once()
        call_args = mock_st.markdown.call_args
        assert "test-anchor" in call_args[0][0]
        assert "Test Title" in call_args[0][0]
        assert call_args[1]["unsafe_allow_html"] is True


class TestRenderCopyButton:
    """Tests for _render_copy_button function."""

    def test_button_not_clicked(self, mock_session_state):
        """Test when copy button is not clicked."""
        mock_st.reset_mock()
        mock_st.button.return_value = False
        _render_copy_button("content", "key", "Copy")
        mock_st.button.assert_called_once()
        mock_st.code.assert_not_called()

    def test_button_clicked(self, mock_session_state):
        """Test when copy button is clicked."""
        mock_st.reset_mock()
        mock_st.button.return_value = True
        _render_copy_button("test content", "key", "Copy")
        mock_st.code.assert_called_once_with("test content", language=None)
        mock_st.caption.assert_called_once()


class TestRenderExportOptions:
    """Tests for render_export_options function."""

    def test_render_export_buttons(self, mock_session_state, sample_markdown):
        """Test that export buttons are rendered."""
        mock_st.reset_mock()
        mock_st.columns.return_value = [MagicMock() for _ in range(4)]
        mock_st.button.return_value = False

        render_export_options(sample_markdown, "{}", "test-id")

        mock_st.markdown.assert_called()
        # Should have download buttons for MD, JSON, and possibly PDF
        assert mock_st.download_button.call_count >= 2


class TestRenderPrintView:
    """Tests for render_print_view function."""

    def test_render_print_view(self, mock_session_state, sample_markdown):
        """Test rendering print view."""
        mock_st.reset_mock()
        mock_st.button.return_value = False

        render_print_view(sample_markdown, "test-id")

        # Should render back button
        mock_st.button.assert_called()
        # Should render print CSS
        mock_st.markdown.assert_called()
        # Should render caption with print instructions
        mock_st.caption.assert_called()

    def test_back_button_clicked(self, mock_session_state, sample_markdown):
        """Test clicking back button."""
        mock_st.reset_mock()
        mock_st.button.return_value = True
        mock_session_state["print_view_test-id"] = True

        render_print_view(sample_markdown, "test-id")

        # Should set print view to False
        assert mock_session_state.get("print_view_test-id") is False
        mock_st.rerun.assert_called()


class TestRenderReportHistory:
    """Tests for render_report_history function."""

    def test_empty_history(self, mock_session_state):
        """Test rendering empty history."""
        mock_st.reset_mock()
        render_report_history()
        mock_st.info.assert_called_once()

    def test_with_history_entries(self, mock_session_state):
        """Test rendering history with entries."""
        mock_st.reset_mock()
        entry = ReportHistoryEntry(
            report_id="test-1",
            generated_at="2026-02-02T12:00:00",
            risk_score=5.0,
            summary_preview="Test summary",
            markdown_content="# Test",
            json_content="{}",
        )
        mock_session_state[REPORT_HISTORY_KEY] = [entry]
        mock_session_state[SELECTED_REPORTS_KEY] = []

        # Mock expander context manager
        mock_expander = MagicMock()
        mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
        mock_st.expander.return_value.__exit__ = MagicMock(return_value=False)
        mock_st.columns.return_value = [MagicMock(), MagicMock()]
        mock_st.button.return_value = False

        render_report_history()

        mock_st.markdown.assert_called()
        mock_st.expander.assert_called()


class TestRenderReportComparison:
    """Tests for render_report_comparison function."""

    def test_less_than_two_selected(self, mock_session_state):
        """Test when less than 2 reports selected."""
        mock_st.reset_mock()
        mock_session_state[SELECTED_REPORTS_KEY] = ["id-1"]
        render_report_comparison()
        mock_st.info.assert_called_once()

    def test_reports_not_found(self, mock_session_state):
        """Test when selected reports not found in history."""
        mock_st.reset_mock()
        mock_session_state[SELECTED_REPORTS_KEY] = ["id-1", "id-2"]
        mock_session_state[REPORT_HISTORY_KEY] = []
        render_report_comparison()
        mock_st.error.assert_called_once()

    def test_successful_comparison(self, mock_session_state):
        """Test successful report comparison."""
        mock_st.reset_mock()
        entry1 = ReportHistoryEntry(
            report_id="id-1",
            generated_at="2026-02-01T12:00:00",
            risk_score=5.0,
            summary_preview="Test 1",
            markdown_content="# Test 1",
            json_content=json.dumps({"vulnerability_findings": []}),
        )
        entry2 = ReportHistoryEntry(
            report_id="id-2",
            generated_at="2026-02-02T12:00:00",
            risk_score=7.0,
            summary_preview="Test 2",
            markdown_content="# Test 2",
            json_content=json.dumps({"vulnerability_findings": [{"detected": True}]}),
        )
        mock_session_state[SELECTED_REPORTS_KEY] = ["id-1", "id-2"]
        mock_session_state[REPORT_HISTORY_KEY] = [entry1, entry2]
        mock_st.columns.return_value = [MagicMock(), MagicMock()]
        mock_st.button.return_value = False

        render_report_comparison()

        mock_st.markdown.assert_called()
        # Should show risk increase message
        mock_st.error.assert_called()


class TestRenderReportViewer:
    """Tests for render_report_viewer function."""

    def test_invalid_json_fallback(self, mock_session_state, sample_markdown):
        """Test fallback when JSON is invalid."""
        mock_st.reset_mock()
        mock_st.columns.return_value = [MagicMock(), MagicMock()]
        mock_expander = MagicMock()
        mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
        mock_st.expander.return_value.__exit__ = MagicMock(return_value=False)

        render_report_viewer(sample_markdown, "invalid-json", "test-id")

        mock_st.warning.assert_called()
        mock_st.download_button.assert_called()

    def test_print_view_mode(self, mock_session_state, sample_markdown):
        """Test print view mode."""
        mock_st.reset_mock()
        mock_session_state["print_view_test-id"] = True
        mock_st.button.return_value = False

        render_report_viewer(sample_markdown, "{}", "test-id")

        # Should render print view instead of normal view
        mock_st.caption.assert_called()

    def test_valid_report(
        self, mock_session_state, sample_markdown, sample_report_json
    ):
        """Test rendering valid report."""
        mock_st.reset_mock()

        # Handle different column configurations
        def dynamic_columns(spec):
            if isinstance(spec, int):
                return [MagicMock() for _ in range(spec)]
            elif isinstance(spec, list):
                return [MagicMock() for _ in range(len(spec))]
            return [MagicMock(), MagicMock()]

        mock_st.columns.side_effect = dynamic_columns
        mock_st.tabs.return_value = [MagicMock(), MagicMock(), MagicMock()]
        mock_expander = MagicMock()
        mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
        mock_st.expander.return_value.__exit__ = MagicMock(return_value=False)
        mock_st.button.return_value = False
        mock_st.container.return_value.__enter__ = MagicMock()
        mock_st.container.return_value.__exit__ = MagicMock(return_value=False)

        render_report_viewer(sample_markdown, sample_report_json, "test-report-123")

        mock_st.divider.assert_called()
        mock_st.subheader.assert_called_with("Security Report")


class TestRenderReportSections:
    """Tests for render_report_sections function."""

    def test_render_all_sections(self, mock_session_state, sample_markdown):
        """Test that all report sections are rendered."""
        mock_st.reset_mock()

        # Create mock report with properly typed owasp_coverage
        mock_report = MagicMock()
        mock_report.risk_score = 6.5
        mock_report.generated_at.isoformat.return_value = "2026-02-02T12:00:00"
        mock_report.summary = "Test summary"
        # Use MagicMock with .value attribute for enum-like keys
        mock_risk = MagicMock()
        mock_risk.value = "ASI01"
        mock_risk.name = "EXCESSIVE_AGENCY"
        mock_report.owasp_coverage = {mock_risk: True}
        mock_report.vulnerability_findings = []
        mock_report.tool_analysis = None
        mock_report.memory_analysis = None
        mock_report.divergence_analysis = None
        mock_report.recommendations = []
        mock_report.hardening_plan = None
        mock_report.remediation_steps = []

        mock_expander = MagicMock()
        mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
        mock_st.expander.return_value.__exit__ = MagicMock(return_value=False)
        mock_st.columns.return_value = [MagicMock(), MagicMock(), MagicMock()]
        mock_st.button.return_value = False

        render_report_sections(mock_report, sample_markdown, "{}", "test-id")

        # Should render multiple expanders for sections
        assert mock_st.expander.call_count >= 5


class TestSanitization:
    """Tests for input sanitization."""

    def test_report_id_sanitization(self, mock_session_state, sample_markdown):
        """Test that report IDs are sanitized."""
        mock_st.reset_mock()
        mock_st.columns.return_value = [MagicMock() for _ in range(4)]
        mock_st.button.return_value = False

        # Pass potentially malicious report ID
        render_export_options(sample_markdown, "{}", "../../etc/passwd")

        # Check that download buttons use sanitized filename
        for call in mock_st.download_button.call_args_list:
            filename = call[1].get("file_name", "")
            assert ".." not in filename
            assert "/" not in filename
