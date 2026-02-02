"""Tests for onboarding components."""

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
        count = len(spec) if isinstance(spec, list) else spec
        for _ in range(count):
            col = MagicMock()
            col.__enter__ = MagicMock(return_value=col)
            col.__exit__ = MagicMock(return_value=None)
            cols.append(col)
        return cols

    mock_st.columns.side_effect = mock_columns

    # Mock container
    mock_st.container.return_value.__enter__ = MagicMock()
    mock_st.container.return_value.__exit__ = MagicMock()

    # Mock expander
    mock_st.sidebar.expander.return_value.__enter__ = MagicMock()
    mock_st.sidebar.expander.return_value.__exit__ = MagicMock()

    return mock_st


@pytest.fixture
def onboarding_module(mock_streamlit):
    """Import onboarding module with mocked streamlit."""
    with patch.dict(sys.modules, {"streamlit": mock_streamlit}):
        # Clear cached import
        if "src.ui.components.onboarding" in sys.modules:
            del sys.modules["src.ui.components.onboarding"]

        from src.ui.components import onboarding

        onboarding.st = mock_streamlit
        yield onboarding, mock_streamlit


class TestChecklistItem:
    """Tests for ChecklistItem dataclass."""

    def test_create_checklist_item(self, onboarding_module):
        """Test creating a ChecklistItem."""
        module, _ = onboarding_module
        item = module.ChecklistItem(id="test", label="Test Label")
        assert item.id == "test"
        assert item.label == "Test Label"
        assert item.completed is False

    def test_checklist_item_with_completed(self, onboarding_module):
        """Test creating a completed ChecklistItem."""
        module, _ = onboarding_module
        item = module.ChecklistItem(id="test", label="Test", completed=True)
        assert item.completed is True


class TestGetDefaultChecklist:
    """Tests for _get_default_checklist function."""

    def test_returns_list(self, onboarding_module):
        """Test that default checklist returns a list."""
        module, _ = onboarding_module
        checklist = module._get_default_checklist()
        assert isinstance(checklist, list)

    def test_has_expected_items(self, onboarding_module):
        """Test that default checklist has expected items."""
        module, _ = onboarding_module
        checklist = module._get_default_checklist()
        ids = [item.id for item in checklist]
        assert "mode_selected" in ids
        assert "events_captured" in ids
        assert "evaluation_run" in ids
        assert "report_generated" in ids

    def test_all_items_uncompleted(self, onboarding_module):
        """Test that all default items are uncompleted."""
        module, _ = onboarding_module
        checklist = module._get_default_checklist()
        for item in checklist:
            assert item.completed is False


class TestGetChecklist:
    """Tests for _get_checklist function."""

    def test_creates_default_if_not_exists(self, onboarding_module):
        """Test that default checklist is created if not in session."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}
        checklist = module._get_checklist()
        assert isinstance(checklist, list)
        assert module.ONBOARDING_CHECKLIST_KEY in mock_st.session_state

    def test_returns_existing_checklist(self, onboarding_module):
        """Test that existing checklist is returned."""
        module, mock_st = onboarding_module
        existing = module._get_default_checklist()
        existing[0].completed = True
        mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY] = existing

        checklist = module._get_checklist()
        assert checklist[0].completed is True

    def test_resets_invalid_checklist(self, onboarding_module):
        """Test that invalid checklist type is reset."""
        module, mock_st = onboarding_module
        mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY] = "invalid"

        checklist = module._get_checklist()
        assert isinstance(checklist, list)


class TestUpdateChecklist:
    """Tests for _update_checklist function."""

    def test_marks_item_completed(self, onboarding_module):
        """Test marking an item as completed."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        module._update_checklist("mode_selected", True)

        checklist = mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY]
        mode_item = next(i for i in checklist if i.id == "mode_selected")
        assert mode_item.completed is True

    def test_marks_item_uncompleted(self, onboarding_module):
        """Test marking an item as uncompleted."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        # First mark as completed
        module._update_checklist("mode_selected", True)
        # Then mark as uncompleted
        module._update_checklist("mode_selected", False)

        checklist = mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY]
        mode_item = next(i for i in checklist if i.id == "mode_selected")
        assert mode_item.completed is False

    def test_unknown_item_no_error(self, onboarding_module):
        """Test that unknown item ID doesn't raise error."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        # Should not raise
        module._update_checklist("unknown_item", True)


class TestMarkFunctions:
    """Tests for mark_* helper functions."""

    def test_mark_mode_selected(self, onboarding_module):
        """Test mark_mode_selected function."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        module.mark_mode_selected()

        checklist = mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY]
        item = next(i for i in checklist if i.id == "mode_selected")
        assert item.completed is True

    def test_mark_events_captured(self, onboarding_module):
        """Test mark_events_captured function."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        module.mark_events_captured()

        checklist = mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY]
        item = next(i for i in checklist if i.id == "events_captured")
        assert item.completed is True

    def test_mark_evaluation_run(self, onboarding_module):
        """Test mark_evaluation_run function."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        module.mark_evaluation_run()

        checklist = mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY]
        item = next(i for i in checklist if i.id == "evaluation_run")
        assert item.completed is True

    def test_mark_report_generated(self, onboarding_module):
        """Test mark_report_generated function."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        module.mark_report_generated()

        checklist = mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY]
        item = next(i for i in checklist if i.id == "report_generated")
        assert item.completed is True


class TestResetOnboarding:
    """Tests for reset_onboarding function."""

    def test_resets_shown_flag(self, onboarding_module):
        """Test that shown flag is reset."""
        module, mock_st = onboarding_module
        mock_st.session_state[module.ONBOARDING_SHOWN_KEY] = True

        module.reset_onboarding()

        assert mock_st.session_state[module.ONBOARDING_SHOWN_KEY] is False

    def test_resets_checklist(self, onboarding_module):
        """Test that checklist is reset."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}
        module.mark_mode_selected()

        module.reset_onboarding()

        checklist = mock_st.session_state[module.ONBOARDING_CHECKLIST_KEY]
        for item in checklist:
            assert item.completed is False

    def test_clears_quick_start_selection(self, onboarding_module):
        """Test that quick start selection is cleared."""
        module, mock_st = onboarding_module
        mock_st.session_state[module.SELECTED_QUICK_START_KEY] = "demo"

        module.reset_onboarding()

        assert module.SELECTED_QUICK_START_KEY not in mock_st.session_state


class TestIsFirstTimeUser:
    """Tests for is_first_time_user function."""

    def test_true_when_not_shown(self, onboarding_module):
        """Test returns True when onboarding not shown."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        assert module.is_first_time_user() is True

    def test_false_when_shown(self, onboarding_module):
        """Test returns False when onboarding already shown."""
        module, mock_st = onboarding_module
        mock_st.session_state[module.ONBOARDING_SHOWN_KEY] = True

        assert module.is_first_time_user() is False


class TestRenderWelcomeModal:
    """Tests for render_welcome_modal function."""

    def test_returns_none_if_already_shown(self, onboarding_module):
        """Test returns None if onboarding already shown."""
        module, mock_st = onboarding_module
        mock_st.session_state[module.ONBOARDING_SHOWN_KEY] = True

        result = module.render_welcome_modal()

        assert result is None

    def test_renders_content_if_not_shown(self, onboarding_module):
        """Test renders content if not shown."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}
        mock_st.button.return_value = False

        module.render_welcome_modal()

        mock_st.markdown.assert_called()

    def test_skip_button_marks_shown(self, onboarding_module):
        """Test skip button marks onboarding as shown."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        # Make skip button return True
        def button_side_effect(label, **kwargs):
            return "Skip" in label

        mock_st.button.side_effect = button_side_effect

        module.render_welcome_modal()

        # Would have set shown and called rerun
        mock_st.rerun.assert_called_once()


class TestQuickStartGuides:
    """Tests for QUICK_START_GUIDES configuration."""

    def test_all_modes_defined(self, onboarding_module):
        """Test all modes have guides defined."""
        module, _ = onboarding_module
        assert "demo" in module.QUICK_START_GUIDES
        assert "sdk" in module.QUICK_START_GUIDES
        assert "remote" in module.QUICK_START_GUIDES

    def test_guide_structure(self, onboarding_module):
        """Test guide structure is correct."""
        module, _ = onboarding_module
        for mode, guide in module.QUICK_START_GUIDES.items():
            assert "title" in guide, f"{mode} missing title"
            assert "description" in guide, f"{mode} missing description"
            assert "steps" in guide, f"{mode} missing steps"
            assert isinstance(guide["steps"], list)
            assert len(guide["steps"]) > 0


class TestRenderQuickStartGuide:
    """Tests for render_quick_start_guide function."""

    def test_renders_demo_guide(self, onboarding_module):
        """Test rendering demo quick start guide."""
        module, mock_st = onboarding_module
        mock_st.button.return_value = False

        module.render_quick_start_guide("demo")

        mock_st.markdown.assert_called()

    def test_renders_sdk_guide(self, onboarding_module):
        """Test rendering SDK quick start guide."""
        module, mock_st = onboarding_module
        mock_st.button.return_value = False

        module.render_quick_start_guide("sdk")

        mock_st.markdown.assert_called()

    def test_renders_remote_guide(self, onboarding_module):
        """Test rendering remote quick start guide."""
        module, mock_st = onboarding_module
        mock_st.button.return_value = False

        module.render_quick_start_guide("remote")

        mock_st.markdown.assert_called()

    def test_unknown_mode_no_error(self, onboarding_module):
        """Test unknown mode doesn't raise error."""
        module, mock_st = onboarding_module
        mock_st.button.return_value = False

        # Should not raise
        module.render_quick_start_guide("unknown")


class TestRenderProgressIndicator:
    """Tests for render_progress_indicator function."""

    def test_renders_progress_bar(self, onboarding_module):
        """Test progress bar is rendered."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}
        mock_st.sidebar.button.return_value = False

        module.render_progress_indicator()

        mock_st.progress.assert_called()

    def test_shows_correct_progress(self, onboarding_module):
        """Test correct progress is calculated."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}
        mock_st.sidebar.button.return_value = False

        # Mark 2 of 4 items complete
        module.mark_mode_selected()
        module.mark_events_captured()

        module.render_progress_indicator()

        # Should show 2/4 = 0.5 progress
        call_args = mock_st.progress.call_args
        assert call_args[0][0] == 0.5


class TestShouldShowQuickStart:
    """Tests for should_show_quick_start function."""

    def test_false_when_not_selected(self, onboarding_module):
        """Test returns False when no quick start selected."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        assert module.should_show_quick_start() is False

    def test_true_when_selected(self, onboarding_module):
        """Test returns True when quick start selected."""
        module, mock_st = onboarding_module
        mock_st.session_state[module.SELECTED_QUICK_START_KEY] = "demo"

        assert module.should_show_quick_start() is True


class TestGetSelectedQuickStart:
    """Tests for get_selected_quick_start function."""

    def test_returns_none_when_not_selected(self, onboarding_module):
        """Test returns None when not selected."""
        module, mock_st = onboarding_module
        mock_st.session_state = {}

        assert module.get_selected_quick_start() is None

    def test_returns_mode_when_selected(self, onboarding_module):
        """Test returns mode when selected."""
        module, mock_st = onboarding_module
        mock_st.session_state[module.SELECTED_QUICK_START_KEY] = "sdk"

        assert module.get_selected_quick_start() == "sdk"

    def test_returns_none_for_invalid_mode(self, onboarding_module):
        """Test returns None for invalid mode."""
        module, mock_st = onboarding_module
        mock_st.session_state[module.SELECTED_QUICK_START_KEY] = "invalid"

        assert module.get_selected_quick_start() is None


class TestRenderContextualTooltip:
    """Tests for render_contextual_tooltip function."""

    def test_renders_tooltip(self, onboarding_module):
        """Test tooltip is rendered."""
        module, mock_st = onboarding_module

        module.render_contextual_tooltip("test_key", "Test help text")

        mock_st.caption.assert_called()

    def test_sanitizes_text(self, onboarding_module):
        """Test text is sanitized."""
        module, mock_st = onboarding_module

        module.render_contextual_tooltip("test", "<script>alert('xss')</script>")

        call_args = mock_st.caption.call_args[0][0]
        assert "<script>" not in call_args
