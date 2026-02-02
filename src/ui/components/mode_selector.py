"""Mode selector component for switching between LLM and Agent testing modes.

This component provides a sidebar radio button to switch testing modes and
manages session state for mode-specific configurations.
"""

import html
import logging
from typing import Literal

import streamlit as st

from src.core.agent_schemas import AgentInstrumentationConfig

logger = logging.getLogger(__name__)

# Type alias for testing modes
TestingMode = Literal["llm", "agent"]

# Session state keys
MODE_KEY = "testing_mode"
AGENT_CONFIG_KEY = "agent_config"
AGENT_EVENTS_KEY = "agent_events"
AGENT_SCORE_KEY = "agent_score"

# Help text for each mode
MODE_HELP = {
    "llm": (
        "Test LLM endpoints for jailbreaks, prompt injection, and adversarial inputs. "
        "Uses the existing Red Council attack/judge/defend loop."
    ),
    "agent": (
        "Test AI agents for OWASP Agentic Top 10 vulnerabilities including excessive agency, "
        "tool abuse, memory injection, and action/speech divergence. "
        "Requires agent instrumentation."
    ),
}

# Default agent config
DEFAULT_AGENT_CONFIG = AgentInstrumentationConfig(
    enable_tool_interception=True,
    enable_memory_monitoring=True,
    divergence_threshold=0.5,
    sampling_rate=1.0,
    max_events=5000,
)


def _init_session_state() -> None:
    """Initialize mode-related session state if not present."""
    if MODE_KEY not in st.session_state:
        st.session_state[MODE_KEY] = "llm"
    if AGENT_CONFIG_KEY not in st.session_state:
        st.session_state[AGENT_CONFIG_KEY] = DEFAULT_AGENT_CONFIG
    if AGENT_EVENTS_KEY not in st.session_state:
        st.session_state[AGENT_EVENTS_KEY] = []
    if AGENT_SCORE_KEY not in st.session_state:
        st.session_state[AGENT_SCORE_KEY] = None


def _clear_agent_state() -> None:
    """Clear agent-specific state when switching modes."""
    st.session_state[AGENT_EVENTS_KEY] = []
    st.session_state[AGENT_SCORE_KEY] = None
    st.session_state[AGENT_CONFIG_KEY] = DEFAULT_AGENT_CONFIG


def _on_mode_change() -> None:
    """Handle mode change callback."""
    new_mode = st.session_state.get("mode_radio", "llm")
    old_mode = st.session_state.get(MODE_KEY, "llm")

    if new_mode != old_mode:
        st.session_state[MODE_KEY] = new_mode
        if old_mode == "agent":
            _clear_agent_state()
        logger.info(f"Testing mode changed from {old_mode} to {new_mode}")


def render_mode_selector() -> TestingMode:
    """Render mode selector in sidebar and return current mode.

    Returns:
        Current testing mode ('llm' or 'agent').
    """
    _init_session_state()

    current_mode = st.session_state[MODE_KEY]

    st.sidebar.subheader("Testing Mode")

    # Radio button for mode selection
    selected = st.sidebar.radio(
        label="Select testing mode",
        options=["llm", "agent"],
        index=0 if current_mode == "llm" else 1,
        format_func=lambda x: "LLM Testing" if x == "llm" else "Agent Testing",
        key="mode_radio",
        on_change=_on_mode_change,
        help="Switch between LLM endpoint testing and AI agent security testing",
    )

    # Display mode-specific help
    st.sidebar.info(MODE_HELP.get(selected, ""))

    return st.session_state[MODE_KEY]


def render_agent_config_panel() -> AgentInstrumentationConfig:
    """Render agent configuration panel in sidebar.

    Only shown when in agent testing mode.

    Returns:
        Current AgentInstrumentationConfig.
    """
    _init_session_state()

    st.sidebar.subheader("Agent Configuration")

    config = st.session_state[AGENT_CONFIG_KEY]

    # Tool interception toggle
    enable_tools = st.sidebar.checkbox(
        "Enable Tool Interception",
        value=config.enable_tool_interception,
        help="Capture and analyze all tool calls made by the agent",
    )

    # Memory monitoring toggle
    enable_memory = st.sidebar.checkbox(
        "Enable Memory Monitoring",
        value=config.enable_memory_monitoring,
        help="Monitor agent memory reads/writes for sensitive data access",
    )

    # Divergence threshold slider
    divergence_threshold = st.sidebar.slider(
        "Divergence Threshold",
        min_value=0.0,
        max_value=1.0,
        value=config.divergence_threshold,
        step=0.05,
        help="Similarity threshold below which speech/action is flagged as divergent",
    )

    # Sampling rate slider
    sampling_rate = st.sidebar.slider(
        "Event Sampling Rate",
        min_value=0.1,
        max_value=1.0,
        value=config.sampling_rate,
        step=0.1,
        help="Fraction of events to capture (1.0 = all events)",
    )

    # Max events input
    max_events = st.sidebar.number_input(
        "Max Events",
        min_value=100,
        max_value=10000,
        value=config.max_events,
        step=100,
        help="Maximum number of events to capture before dropping oldest",
    )

    # Update config in session state
    new_config = AgentInstrumentationConfig(
        enable_tool_interception=enable_tools,
        enable_memory_monitoring=enable_memory,
        divergence_threshold=divergence_threshold,
        sampling_rate=sampling_rate,
        max_events=max_events,
    )
    st.session_state[AGENT_CONFIG_KEY] = new_config

    return new_config


def render_tool_registration_form() -> None:
    """Render tool registration form for agent testing.

    Allows users to define custom tools for the instrumented agent.
    """
    st.sidebar.subheader("Tool Registration")

    with st.sidebar.expander("Register Custom Tool", expanded=False):
        tool_name = st.text_input(
            "Tool Name",
            placeholder="e.g., file_read",
            key="tool_reg_name",
        )
        tool_description = st.text_area(
            "Description",
            placeholder="Describe what this tool does",
            key="tool_reg_desc",
            height=80,
        )
        sensitive_args = st.text_input(
            "Sensitive Arguments (comma-separated)",
            placeholder="e.g., password, api_key",
            key="tool_reg_sensitive",
        )

        if st.button("Register Tool", key="tool_reg_btn"):
            if tool_name and tool_description:
                # Store in session state for later use
                if "registered_tools" not in st.session_state:
                    st.session_state.registered_tools = {}

                # Sanitize inputs
                safe_name = html.escape(tool_name.strip())
                safe_desc = html.escape(tool_description.strip())
                sensitive_list = [
                    html.escape(s.strip())
                    for s in sensitive_args.split(",")
                    if s.strip()
                ]

                st.session_state.registered_tools[safe_name] = {
                    "description": safe_desc,
                    "sensitive_args": sensitive_list,
                }
                st.success(f"Tool '{safe_name}' registered.")
            else:
                st.warning("Please provide tool name and description.")

    # Show registered tools
    if st.session_state.get("registered_tools"):
        st.sidebar.markdown("**Registered Tools:**")
        for name, info in st.session_state.registered_tools.items():
            st.sidebar.text(f"- {name}")


def render_memory_config() -> None:
    """Render memory configuration panel for agent testing."""
    st.sidebar.subheader("Memory Configuration")

    with st.sidebar.expander("Memory Settings", expanded=False):
        st.text_input(
            "Allowed Keys Pattern",
            value=".*",
            placeholder="Regex pattern for allowed keys",
            key="memory_allowed_pattern",
            help="Regex pattern for keys the agent can access",
        )
        st.text_input(
            "Denied Keys Pattern",
            value="^(__.*|system_.*)",
            placeholder="Regex pattern for denied keys",
            key="memory_denied_pattern",
            help="Regex pattern for keys the agent cannot access",
        )
        st.number_input(
            "Max Value Size (bytes)",
            min_value=100,
            max_value=100000,
            value=10000,
            step=1000,
            key="memory_max_size",
            help="Maximum size of values stored in memory",
        )


def get_current_mode() -> TestingMode:
    """Get current testing mode from session state.

    Returns:
        Current testing mode ('llm' or 'agent').
    """
    _init_session_state()
    return st.session_state[MODE_KEY]


def get_agent_config() -> AgentInstrumentationConfig:
    """Get current agent configuration from session state.

    Returns:
        Current AgentInstrumentationConfig.
    """
    _init_session_state()
    return st.session_state[AGENT_CONFIG_KEY]


def is_agent_mode() -> bool:
    """Check if currently in agent testing mode.

    Returns:
        True if in agent mode, False otherwise.
    """
    return get_current_mode() == "agent"
