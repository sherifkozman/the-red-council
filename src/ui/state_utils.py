import streamlit as st
from src.ui.components.mode_selector import AGENT_EVENTS_KEY, AGENT_SCORE_KEY

# Session State Keys
DEMO_MODE_KEY = "is_demo_mode"
DEMO_CONFIRM_KEY = "demo_overwrite_confirm"
AGENT_REPORT_KEY = "agent_report"
REPORT_MARKDOWN_KEY = "report_markdown"
REPORT_JSON_KEY = "report_json"

def reset_agent_state(full_reset: bool = False):
    """
    Reset all agent-related session state.
    
    Args:
        full_reset: If True, also clears demo mode flags.
    """
    keys_to_clear = [
        AGENT_REPORT_KEY,
        REPORT_MARKDOWN_KEY,
        REPORT_JSON_KEY,
        DEMO_CONFIRM_KEY
    ]
    
    if full_reset:
        keys_to_clear.append(DEMO_MODE_KEY)
        
    for key in keys_to_clear:
        if key in st.session_state:
            del st.session_state[key]
            
    # Reset core data keys (preserve existence, clear content)
    st.session_state[AGENT_EVENTS_KEY] = []
    st.session_state[AGENT_SCORE_KEY] = None
