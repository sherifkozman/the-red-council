import unittest
from unittest.mock import MagicMock, patch
import sys

# Mock streamlit globally
mock_st = MagicMock()
sys.modules["streamlit"] = mock_st
if "src.ui.components.demo_loader" in sys.modules:
    del sys.modules["src.ui.components.demo_loader"]

from src.ui.components.demo_loader import (
    DEMO_CONFIRM_KEY,
    DEMO_MODE_KEY,
    clear_demo_data,
    load_demo_data,
    render_demo_loader,
)
from src.ui.components.mode_selector import AGENT_EVENTS_KEY, AGENT_SCORE_KEY
import src.ui.components.demo_loader as demo_loader


class TestDemoLoader(unittest.TestCase):
    def setUp(self):
        # Reset mock_st
        mock_st.reset_mock()
        
        # Setup session state as a dict for easier testing
        self.session_state = {}
        mock_st.session_state = self.session_state
        mock_st.sidebar = MagicMock()
        mock_st.columns.return_value = [MagicMock(), MagicMock()]
        mock_st.sidebar.columns.return_value = [MagicMock(), MagicMock()]
        mock_st.button.side_effect = None
        mock_st.sidebar.button.side_effect = None
        demo_loader.st = mock_st

    @patch("src.ui.components.demo_loader.VulnerableTestAgent")
    def test_load_demo_data(self, MockAgent):
        # Setup mock agent
        mock_agent_instance = MockAgent.return_value
        mock_agent_instance.get_events.return_value = ["event1", "event2"]

        # Run function
        load_demo_data()
        
        # Debugging: Check if error was called
        if mock_st.error.called:
            print(f"DEBUG: st.error called with: {mock_st.error.call_args}")

        # Verify agent was used
        mock_agent_instance.run.assert_called()
        mock_agent_instance.set_memory.assert_called()
        
        # Verify session state updates
        self.assertEqual(self.session_state[AGENT_EVENTS_KEY], ["event1", "event2"])
        self.assertTrue(self.session_state[DEMO_MODE_KEY])
        self.assertIsNone(self.session_state[AGENT_SCORE_KEY])
        
        # Verify success message and rerun
        mock_st.success.assert_called_once()
        mock_st.rerun.assert_called_once()

    def test_clear_demo_data(self):
        # Setup initial state
        self.session_state[AGENT_EVENTS_KEY] = ["old_event"]
        self.session_state[DEMO_MODE_KEY] = True
        self.session_state[AGENT_SCORE_KEY] = "old_score"
        self.session_state["agent_report"] = "old_report"
        self.session_state[DEMO_CONFIRM_KEY] = True

        def reset_side_effect(full_reset=False):
            self.session_state[AGENT_EVENTS_KEY] = []
            self.session_state[AGENT_SCORE_KEY] = None
            if full_reset:
                self.session_state.pop(DEMO_MODE_KEY, None)
            self.session_state.pop("agent_report", None)
            self.session_state.pop(DEMO_CONFIRM_KEY, None)

        with patch("src.ui.components.demo_loader.reset_agent_state") as mock_reset:
            mock_reset.side_effect = reset_side_effect
            # Run function
            clear_demo_data()

        # Verify session state cleared
        self.assertEqual(self.session_state[AGENT_EVENTS_KEY], [])
        self.assertFalse(DEMO_MODE_KEY in self.session_state)
        self.assertIsNone(self.session_state[AGENT_SCORE_KEY])
        self.assertFalse("agent_report" in self.session_state)
        self.assertFalse(DEMO_CONFIRM_KEY in self.session_state)

        # Verify rerun
        mock_st.rerun.assert_called_once()

    def test_render_demo_loader_not_active_no_data(self):
        # Setup: Demo mode NOT active, no existing data
        if DEMO_MODE_KEY in self.session_state:
            del self.session_state[DEMO_MODE_KEY]
        self.session_state[AGENT_EVENTS_KEY] = []
        
        mock_st.sidebar.button.return_value = False
        
        # Run function
        render_demo_loader()

        # Verify "Load Demo" button shown
        mock_st.sidebar.button.assert_called_with(
            "Load Demo Data", key="load_demo_btn", use_container_width=True
        )

    def test_render_demo_loader_not_active_with_data_no_confirm(self):
        # Setup: Demo mode NOT active, but existing data, no confirm key
        self.session_state[DEMO_MODE_KEY] = False
        self.session_state[AGENT_EVENTS_KEY] = ["existing"]
        self.session_state[DEMO_CONFIRM_KEY] = False
        
        mock_st.sidebar.button.return_value = True # Click load
        mock_st.button.return_value = False

        render_demo_loader()
        
        # Should set confirm key and rerun
        self.assertTrue(self.session_state[DEMO_CONFIRM_KEY])
        mock_st.rerun.assert_called_once()

    def test_render_demo_loader_confirm_flow(self):
        # Setup: Existing data and confirm key present
        self.session_state[DEMO_MODE_KEY] = False
        self.session_state[AGENT_EVENTS_KEY] = ["existing"]
        self.session_state[DEMO_CONFIRM_KEY] = True
        
        # Setup buttons
        col1 = MagicMock()
        col2 = MagicMock()
        mock_st.sidebar.columns.return_value = [col1, col2]
        
        # Mock st.button to return True only for Confirm
        def button_side_effect(label, **kwargs):
            return label == "Confirm"
        mock_st.button.side_effect = button_side_effect
        
        with patch("src.ui.components.demo_loader.load_demo_data") as mock_load:
            render_demo_loader()
            mock_load.assert_called_once()
            
        # Verify warning shown
        mock_st.sidebar.warning.assert_called_with("Overwrite existing events?")

    def test_render_demo_loader_active(self):
        # Setup: Demo mode active
        self.session_state[DEMO_MODE_KEY] = True
        mock_st.sidebar.button.return_value = False

        # Run function
        render_demo_loader()

        # Verify "Clear Demo" button shown
        mock_st.sidebar.button.assert_called_with(
            "Clear Demo", key="clear_demo_btn", use_container_width=True
        )
