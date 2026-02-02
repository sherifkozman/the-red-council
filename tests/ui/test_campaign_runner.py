# tests/ui/test_campaign_runner.py
"""
Tests for the Campaign Runner UI component.

Tests cover:
- Session state management
- UI rendering functions
- Campaign control logic
- Progress display
"""
# ruff: noqa: E402

import sys
import asyncio
from unittest.mock import MagicMock, patch

# Mock streamlit before importing the module
mock_st = MagicMock()
mock_st.session_state = {}
sys.modules["streamlit"] = mock_st

from src.orchestrator.agent_campaign import (
    AttackResult,
    CampaignProgress,
    CampaignStatus,
)
from src.ui.components.campaign_runner import (
    CAMPAIGN_KEY,
    CAMPAIGN_PROGRESS_KEY,
    CAMPAIGN_RESULTS_KEY,
    CAMPAIGN_RUNNING_KEY,
    STATUS_COLORS,
    STATUS_LABELS,
    CampaignUIState,
    _clear_campaign_state,
    _get_campaign_state,
    _render_campaign_controls,
    _render_campaign_status,
    _render_prerequisites_check,
    _render_results_summary,
    _save_campaign_progress,
    _save_campaign_results,
    _start_campaign,
    get_campaign_progress,
    get_campaign_results,
    is_campaign_running,
)

# ============================================================================
# Constants Tests
# ============================================================================


class TestConstants:
    """Tests for module constants."""

    def test_status_colors_all_statuses(self) -> None:
        """Test all campaign statuses have colors."""
        for status in CampaignStatus:
            assert status in STATUS_COLORS
            assert isinstance(STATUS_COLORS[status], str)

    def test_status_labels_all_statuses(self) -> None:
        """Test all campaign statuses have labels."""
        for status in CampaignStatus:
            assert status in STATUS_LABELS
            assert isinstance(STATUS_LABELS[status], str)


# ============================================================================
# CampaignUIState Tests
# ============================================================================


class TestCampaignUIState:
    """Tests for CampaignUIState dataclass."""

    def test_default_initialization(self) -> None:
        """Test default state initialization."""
        state = CampaignUIState()

        assert state.progress is None
        assert state.results is None
        assert state.error_message is None

    def test_with_progress(self) -> None:
        """Test state with progress."""
        progress = CampaignProgress(total_attacks=5, completed_attacks=3)
        state = CampaignUIState(progress=progress)

        assert state.progress == progress
        assert state.progress.total_attacks == 5

    def test_with_results(self) -> None:
        """Test state with results."""
        results = [
            AttackResult(template_id="t1", prompt="p1", success=True),
            AttackResult(template_id="t2", prompt="p2", success=False),
        ]
        state = CampaignUIState(results=results)

        assert state.results == results
        assert len(state.results) == 2


# ============================================================================
# Session State Management Tests
# ============================================================================


class TestSessionStateManagement:
    """Tests for session state management functions."""

    def setup_method(self) -> None:
        """Reset session state before each test."""
        mock_st.session_state = {}

    def test_get_campaign_state_empty(self) -> None:
        """Test getting state when session is empty."""
        state = _get_campaign_state()

        assert state.progress is None
        assert state.results is None

    def test_get_campaign_state_with_progress(self) -> None:
        """Test getting state with existing progress."""
        progress = CampaignProgress(total_attacks=10)
        mock_st.session_state[CAMPAIGN_PROGRESS_KEY] = progress

        state = _get_campaign_state()

        assert state.progress == progress

    def test_get_campaign_state_with_results(self) -> None:
        """Test getting state with existing results."""
        results = [AttackResult(template_id="t1", prompt="p1")]
        mock_st.session_state[CAMPAIGN_RESULTS_KEY] = results

        state = _get_campaign_state()

        assert state.results == results

    def test_save_campaign_progress(self) -> None:
        """Test saving progress to session state."""
        progress = CampaignProgress(total_attacks=5, completed_attacks=2)

        _save_campaign_progress(progress)

        assert mock_st.session_state[CAMPAIGN_PROGRESS_KEY] == progress

    def test_save_campaign_results(self) -> None:
        """Test saving results to session state."""
        results = [AttackResult(template_id="t1", prompt="p1")]

        _save_campaign_results(results)

        assert mock_st.session_state[CAMPAIGN_RESULTS_KEY] == results

    def test_clear_campaign_state(self) -> None:
        """Test clearing all campaign state."""
        mock_st.session_state[CAMPAIGN_KEY] = MagicMock()
        mock_st.session_state[CAMPAIGN_PROGRESS_KEY] = CampaignProgress()
        mock_st.session_state[CAMPAIGN_RESULTS_KEY] = []
        mock_st.session_state[CAMPAIGN_RUNNING_KEY] = True

        _clear_campaign_state()

        assert CAMPAIGN_KEY not in mock_st.session_state
        assert CAMPAIGN_PROGRESS_KEY not in mock_st.session_state
        assert CAMPAIGN_RESULTS_KEY not in mock_st.session_state
        assert CAMPAIGN_RUNNING_KEY not in mock_st.session_state


# ============================================================================
# Public API Tests
# ============================================================================


class TestPublicAPI:
    """Tests for public API functions."""

    def setup_method(self) -> None:
        """Reset session state before each test."""
        mock_st.session_state = {}

    def test_get_campaign_progress_none(self) -> None:
        """Test getting progress when none exists."""
        result = get_campaign_progress()

        assert result is None

    def test_get_campaign_progress_exists(self) -> None:
        """Test getting progress when it exists."""
        progress = CampaignProgress(total_attacks=5)
        mock_st.session_state[CAMPAIGN_PROGRESS_KEY] = progress

        result = get_campaign_progress()

        assert result == progress

    def test_get_campaign_results_none(self) -> None:
        """Test getting results when none exist."""
        result = get_campaign_results()

        assert result is None

    def test_get_campaign_results_exists(self) -> None:
        """Test getting results when they exist."""
        results = [AttackResult(template_id="t1", prompt="p1")]
        mock_st.session_state[CAMPAIGN_RESULTS_KEY] = results

        result = get_campaign_results()

        assert result == results

    def test_is_campaign_running_false(self) -> None:
        """Test is_campaign_running when not running."""
        result = is_campaign_running()

        assert result is False

    def test_is_campaign_running_true(self) -> None:
        """Test is_campaign_running when running."""
        mock_st.session_state[CAMPAIGN_RUNNING_KEY] = True

        result = is_campaign_running()

        assert result is True


# ============================================================================
# Render Function Tests
# ============================================================================


class TestRenderFunctions:
    """Tests for render functions."""

    def setup_method(self) -> None:
        """Reset mocks before each test."""
        mock_st.session_state = {}
        mock_st.reset_mock()

        # Setup column mock
        col_mock = MagicMock()
        col_mock.__enter__ = MagicMock(return_value=col_mock)
        col_mock.__exit__ = MagicMock(return_value=None)

        def columns_side_effect(n):
            return [col_mock for _ in range(n)]

        mock_st.columns.side_effect = columns_side_effect

    def test_render_campaign_status_no_progress(self) -> None:
        """Test status rendering with no progress."""
        state = CampaignUIState()

        _render_campaign_status(state)

        mock_st.info.assert_called_once()

    def test_render_campaign_status_with_progress(self) -> None:
        """Test status rendering with progress."""
        progress = CampaignProgress(
            total_attacks=10,
            completed_attacks=5,
            successful_attacks=4,
            failed_attacks=1,
            status=CampaignStatus.RUNNING,
        )
        state = CampaignUIState(progress=progress)

        _render_campaign_status(state)

        # Should call metric and progress
        assert mock_st.metric.call_count >= 4
        mock_st.progress.assert_called_once()

    def test_render_campaign_status_with_current_attack(self) -> None:
        """Test status shows current attack."""
        progress = CampaignProgress(
            total_attacks=10,
            completed_attacks=5,
            current_attack="attack-001",
            status=CampaignStatus.RUNNING,
        )
        state = CampaignUIState(progress=progress)

        _render_campaign_status(state)

        mock_st.caption.assert_called()

    def test_render_prerequisites_check_both_missing(self) -> None:
        """Test prerequisites check when both are missing."""
        with (
            patch(
                "src.ui.components.campaign_runner.is_remote_agent_configured",
                return_value=False,
            ),
            patch(
                "src.ui.components.campaign_runner.is_templates_selected",
                return_value=False,
            ),
        ):
            _render_prerequisites_check()

        mock_st.warning.assert_called_once()
        assert mock_st.markdown.call_count >= 2

    def test_render_prerequisites_check_all_met(self) -> None:
        """Test prerequisites check when all are met."""
        with (
            patch(
                "src.ui.components.campaign_runner.is_remote_agent_configured",
                return_value=True,
            ),
            patch(
                "src.ui.components.campaign_runner.is_templates_selected",
                return_value=True,
            ),
        ):
            _render_prerequisites_check()

        mock_st.warning.assert_not_called()

    def test_render_campaign_controls_start_disabled(self) -> None:
        """Test controls when start should be disabled."""
        mock_st.button.return_value = False

        with (
            patch(
                "src.ui.components.campaign_runner.is_remote_agent_configured",
                return_value=False,
            ),
            patch(
                "src.ui.components.campaign_runner.is_templates_selected",
                return_value=False,
            ),
        ):
            _render_campaign_controls()

        # Button should be called with disabled=True
        start_call = mock_st.button.call_args_list[0]
        assert start_call.kwargs.get("disabled") is True

    def test_render_campaign_controls_start_enabled(self) -> None:
        """Test controls when start should be enabled."""
        mock_st.button.return_value = False

        with (
            patch(
                "src.ui.components.campaign_runner.is_remote_agent_configured",
                return_value=True,
            ),
            patch(
                "src.ui.components.campaign_runner.is_templates_selected",
                return_value=True,
            ),
        ):
            _render_campaign_controls()

        # Button should be called with disabled=False
        start_call = mock_st.button.call_args_list[0]
        assert start_call.kwargs.get("disabled") is False

    def test_render_results_summary_empty(self) -> None:
        """Test results summary with no results."""
        state = CampaignUIState(results=None)

        _render_results_summary(state)

        # Should not render anything
        mock_st.subheader.assert_not_called()

    def test_render_results_summary_with_results(self) -> None:
        """Test results summary with results."""
        results = [
            AttackResult(template_id="t1", prompt="p1", success=True, duration_ms=100),
            AttackResult(template_id="t2", prompt="p2", success=False, duration_ms=200),
        ]
        state = CampaignUIState(results=results)

        # Setup expander mock
        expander_mock = MagicMock()
        expander_mock.__enter__ = MagicMock(return_value=expander_mock)
        expander_mock.__exit__ = MagicMock(return_value=None)
        mock_st.expander.return_value = expander_mock

        _render_results_summary(state)

        mock_st.subheader.assert_called_once_with("Campaign Results")
        assert mock_st.metric.call_count >= 4


# ============================================================================
# Integration Tests
# ============================================================================


class TestIntegration:
    """Integration tests for campaign runner."""

    def setup_method(self) -> None:
        """Reset mocks before each test."""
        mock_st.session_state = {}
        mock_st.reset_mock()

    def test_full_state_lifecycle(self) -> None:
        """Test full state lifecycle from start to clear."""
        # Start with empty state
        state = _get_campaign_state()
        assert state.progress is None

        # Add progress
        progress = CampaignProgress(
            total_attacks=3,
            completed_attacks=3,
            status=CampaignStatus.COMPLETED,
        )
        _save_campaign_progress(progress)

        # Add results
        results = [
            AttackResult(template_id="t1", prompt="p1", success=True),
            AttackResult(template_id="t2", prompt="p2", success=True),
            AttackResult(template_id="t3", prompt="p3", success=True),
        ]
        _save_campaign_results(results)

        # Verify state
        state = _get_campaign_state()
        assert state.progress is not None
        assert state.progress.completed_attacks == 3
        assert state.results is not None
        assert len(state.results) == 3

        # Clear state
        _clear_campaign_state()

        # Verify cleared
        state = _get_campaign_state()
        assert state.progress is None
        assert state.results is None

    def test_progress_to_results_flow(self) -> None:
        """Test progress updates correctly flow to results."""
        # Simulate campaign execution
        progress = CampaignProgress(
            total_attacks=2,
            completed_attacks=0,
            status=CampaignStatus.RUNNING,
        )
        _save_campaign_progress(progress)

        # First attack completes
        progress.completed_attacks = 1
        progress.successful_attacks = 1
        _save_campaign_progress(progress)

        results = [
            AttackResult(template_id="t1", prompt="p1", success=True),
        ]
        _save_campaign_results(results)

        # Second attack completes
        progress.completed_attacks = 2
        progress.successful_attacks = 2
        progress.status = CampaignStatus.COMPLETED
        _save_campaign_progress(progress)

        results.append(AttackResult(template_id="t2", prompt="p2", success=True))
        _save_campaign_results(results)

        # Verify final state
        state = _get_campaign_state()
        assert state.progress.completed_attacks == 2
        assert state.progress.status == CampaignStatus.COMPLETED
        assert len(state.results) == 2

    def test_start_campaign_background(self) -> None:
        """Test background campaign start returns early."""
        future = asyncio.Future()

        with (
            patch(
                "src.ui.components.campaign_runner.is_remote_agent_configured",
                return_value=True,
            ),
            patch(
                "src.ui.components.campaign_runner.is_templates_selected",
                return_value=True,
            ),
            patch(
                "src.ui.components.campaign_runner._get_template_data_for_campaign",
                return_value=[{"id": "t1", "prompt_template": "p"}],
            ),
            patch(
                "src.ui.components.campaign_runner.safe_run_async",
                return_value=future,
            ),
        ):
            mock_st.session_state = {"session_id": "s1"}
            _start_campaign()

        mock_st.info.assert_called_once()
