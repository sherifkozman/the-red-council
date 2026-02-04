"""Empty state components for UI sections with no data.

Provides consistent empty state displays with helpful guidance and action buttons
for users who have not yet captured events, run evaluations, etc.
"""

import html
import logging
from collections.abc import Callable

import streamlit as st

logger = logging.getLogger(__name__)

# Constants for documentation links
DOCS_BASE_URL = "https://github.com/YOUR_ORG/the-red-council"
DOCS_AGENT_TESTING = f"{DOCS_BASE_URL}/blob/main/docs/agent-testing-guide.md"
DOCS_API_REFERENCE = f"{DOCS_BASE_URL}/blob/main/README.md#api-endpoints"

# Empty state messages
EMPTY_STATE_MESSAGES = {
    "timeline": {
        "title": "No Events Yet",
        "description": (
            "Agent events will appear here as your instrumented agent runs. "
            "Events include tool calls, memory access, and detected anomalies."
        ),
        "icon": "hourglass_not_done",
    },
    "tool_chain": {
        "title": "No Tool Calls Captured",
        "description": (
            "Tool call sequences will be visualized here. "
            "Connect an instrumented agent or run a demo to see analysis."
        ),
        "icon": "build",
    },
    "owasp_coverage": {
        "title": "Run Evaluation to See Results",
        "description": (
            "OWASP Agentic Top 10 coverage will be displayed after evaluation. "
            "Capture some events first, then click 'Run Evaluation'."
        ),
        "icon": "security",
    },
    "events": {
        "title": "No Events to Display",
        "description": (
            "Raw event data will appear here when you connect an instrumented agent."
        ),
        "icon": "list",
    },
}


def _sanitize_text(text: str) -> str:
    """Sanitize text for safe display."""
    return html.escape(str(text))


def render_empty_state(
    state_type: str,
    on_demo_click: Callable[[], None] | None = None,
    on_sdk_click: Callable[[], None] | None = None,
    on_remote_click: Callable[[], None] | None = None,
    show_actions: bool = True,
) -> None:
    """Render an empty state with guidance and action buttons.

    Args:
        state_type: Type of empty state (timeline, tool_chain, owasp_coverage, events)
        on_demo_click: Optional callback when 'Load Demo' is clicked
        on_sdk_click: Optional callback when 'Connect SDK' is clicked
        on_remote_click: Optional callback when 'Configure Remote' is clicked
        show_actions: Whether to show action buttons
    """
    config = EMPTY_STATE_MESSAGES.get(state_type)
    if not config:
        logger.warning(f"Unknown empty state type: {state_type}")
        st.info("No data available.")
        return

    # Create centered container
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        # Icon and title
        icon = config.get("icon", "info")
        title = _sanitize_text(config["title"])
        description = _sanitize_text(config["description"])

        st.markdown(f"### :{icon}: {title}")
        st.markdown(description)

        if show_actions:
            st.markdown("---")
            st.markdown("**Get Started:**")

            # Action buttons based on state type
            btn_col1, btn_col2, btn_col3 = st.columns(3)

            with btn_col1:
                demo_disabled = on_demo_click is None
                if st.button(
                    "Load Demo",
                    key=f"empty_{state_type}_demo_btn",
                    disabled=demo_disabled,
                    help="Load sample data to explore the platform",
                ):
                    if on_demo_click:
                        on_demo_click()

            with btn_col2:
                sdk_disabled = on_sdk_click is None
                if st.button(
                    "Connect SDK",
                    key=f"empty_{state_type}_sdk_btn",
                    disabled=sdk_disabled,
                    help="Get code to instrument your agent",
                ):
                    if on_sdk_click:
                        on_sdk_click()

            with btn_col3:
                remote_disabled = on_remote_click is None
                if st.button(
                    "Configure Remote",
                    key=f"empty_{state_type}_remote_btn",
                    disabled=remote_disabled,
                    help="Test a remote agent endpoint",
                ):
                    if on_remote_click:
                        on_remote_click()

            # Documentation link
            st.markdown("---")
            doc_url = DOCS_AGENT_TESTING
            st.markdown(
                f"[View Documentation]({doc_url}) | "
                f"[API Reference]({DOCS_API_REFERENCE})"
            )


def render_timeline_empty_state(
    on_demo_click: Callable[[], None] | None = None,
    on_sdk_click: Callable[[], None] | None = None,
    on_remote_click: Callable[[], None] | None = None,
) -> None:
    """Render empty state for Timeline tab."""
    render_empty_state(
        state_type="timeline",
        on_demo_click=on_demo_click,
        on_sdk_click=on_sdk_click,
        on_remote_click=on_remote_click,
    )


def render_tool_chain_empty_state(
    on_demo_click: Callable[[], None] | None = None,
    on_sdk_click: Callable[[], None] | None = None,
    on_remote_click: Callable[[], None] | None = None,
) -> None:
    """Render empty state for Tool Chain tab."""
    render_empty_state(
        state_type="tool_chain",
        on_demo_click=on_demo_click,
        on_sdk_click=on_sdk_click,
        on_remote_click=on_remote_click,
    )


def render_owasp_empty_state() -> None:
    """Render empty state for OWASP Coverage tab."""
    render_empty_state(
        state_type="owasp_coverage",
        show_actions=False,  # No direct actions - user needs events first
    )


def render_events_empty_state(
    on_demo_click: Callable[[], None] | None = None,
    on_sdk_click: Callable[[], None] | None = None,
    on_remote_click: Callable[[], None] | None = None,
) -> None:
    """Render empty state for Events tab."""
    render_empty_state(
        state_type="events",
        on_demo_click=on_demo_click,
        on_sdk_click=on_sdk_click,
        on_remote_click=on_remote_click,
    )
