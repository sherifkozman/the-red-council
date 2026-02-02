"""Onboarding components for first-time users.

Provides welcome modal, quick start guides, and progress tracking
to help new users understand and navigate the platform.
"""

import html
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import streamlit as st

logger = logging.getLogger(__name__)

# Session state keys
ONBOARDING_SHOWN_KEY = "onboarding_shown"
ONBOARDING_CHECKLIST_KEY = "onboarding_checklist"
SELECTED_QUICK_START_KEY = "selected_quick_start"

# Testing mode type
TestingMode = Literal["demo", "sdk", "remote"]

# Quick start guide content
QUICK_START_GUIDES = {
    "demo": {
        "title": "Demo Mode",
        "description": "Explore the platform with pre-loaded sample data.",
        "steps": [
            "Click 'Load Demo' in the sidebar",
            "Explore the Timeline tab to see agent events",
            "Check the Tool Chain tab for tool call visualization",
            "Click 'Run Evaluation' to assess security",
            "Generate a report to see detailed findings",
        ],
        "icon": "play_circle",
    },
    "sdk": {
        "title": "SDK Integration",
        "description": "Instrument your agent to send events in real-time.",
        "steps": [
            "Go to the 'SDK Integration' tab",
            "Select your framework (LangChain, LangGraph, MCP)",
            "Copy the integration code snippet",
            "Add the code to your agent",
            "Run your agent to see events appear in real-time",
        ],
        "icon": "code",
    },
    "remote": {
        "title": "Remote Agent Testing",
        "description": "Test any HTTP-accessible agent endpoint.",
        "steps": [
            "Go to the 'Remote Agent' tab",
            "Enter your agent's endpoint URL",
            "Configure authentication if needed",
            "Go to 'Attack Templates' to select tests",
            "Start a campaign to run attacks against your agent",
        ],
        "icon": "cloud",
    },
}


@dataclass
class ChecklistItem:
    """Represents a checklist item for onboarding progress."""

    id: str
    label: str
    completed: bool = False


def _get_default_checklist() -> list[ChecklistItem]:
    """Get default onboarding checklist items."""
    return [
        ChecklistItem(id="mode_selected", label="Select a testing mode"),
        ChecklistItem(id="events_captured", label="Capture agent events"),
        ChecklistItem(id="evaluation_run", label="Run OWASP evaluation"),
        ChecklistItem(id="report_generated", label="Generate security report"),
    ]


def _get_checklist() -> list[ChecklistItem]:
    """Get current checklist from session state."""
    if ONBOARDING_CHECKLIST_KEY not in st.session_state:
        st.session_state[ONBOARDING_CHECKLIST_KEY] = _get_default_checklist()
    checklist = st.session_state[ONBOARDING_CHECKLIST_KEY]
    # Validate it's a list
    if not isinstance(checklist, list):
        st.session_state[ONBOARDING_CHECKLIST_KEY] = _get_default_checklist()
        result: list[ChecklistItem] = st.session_state[ONBOARDING_CHECKLIST_KEY]
        return result
    return checklist


def _update_checklist(item_id: str, completed: bool = True) -> None:
    """Update a checklist item's completion status."""
    checklist = _get_checklist()
    for item in checklist:
        if isinstance(item, ChecklistItem) and item.id == item_id:
            item.completed = completed
            break
    st.session_state[ONBOARDING_CHECKLIST_KEY] = checklist


def mark_mode_selected() -> None:
    """Mark 'Select a testing mode' as completed."""
    _update_checklist("mode_selected", True)


def mark_events_captured() -> None:
    """Mark 'Capture agent events' as completed."""
    _update_checklist("events_captured", True)


def mark_evaluation_run() -> None:
    """Mark 'Run OWASP evaluation' as completed."""
    _update_checklist("evaluation_run", True)


def mark_report_generated() -> None:
    """Mark 'Generate security report' as completed."""
    _update_checklist("report_generated", True)


def reset_onboarding() -> None:
    """Reset onboarding state for testing or re-onboarding."""
    st.session_state[ONBOARDING_SHOWN_KEY] = False
    st.session_state[ONBOARDING_CHECKLIST_KEY] = _get_default_checklist()
    if SELECTED_QUICK_START_KEY in st.session_state:
        del st.session_state[SELECTED_QUICK_START_KEY]


def is_first_time_user() -> bool:
    """Check if this is the user's first time using the platform."""
    return not st.session_state.get(ONBOARDING_SHOWN_KEY, False)


def render_welcome_modal(
    on_mode_select: Callable[[TestingMode], None] | None = None,
) -> TestingMode | None:
    """Render the first-time user welcome modal.

    Args:
        on_mode_select: Optional callback when a mode is selected.

    Returns:
        Selected mode if user made a selection, None otherwise.
    """
    selected_mode: TestingMode | None = None

    # Check if already shown
    if st.session_state.get(ONBOARDING_SHOWN_KEY, False):
        return None

    st.markdown("## Welcome to The Red Council")
    st.markdown(
        "An adversarial security testing platform for AI agents. "
        "Test your agents against the **OWASP Agentic Top 10** vulnerabilities."
    )

    st.markdown("---")
    st.markdown("### Choose how to get started:")

    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("#### :play_circle: Demo Mode")
        st.markdown("Explore with sample data")
        if st.button("Start Demo", key="welcome_demo_btn", use_container_width=True):
            selected_mode = "demo"

    with col2:
        st.markdown("#### :code: SDK Integration")
        st.markdown("Instrument your agent")
        if st.button("Connect SDK", key="welcome_sdk_btn", use_container_width=True):
            selected_mode = "sdk"

    with col3:
        st.markdown("#### :cloud: Remote Testing")
        st.markdown("Test any HTTP endpoint")
        if st.button(
            "Configure Remote", key="welcome_remote_btn", use_container_width=True
        ):
            selected_mode = "remote"

    st.markdown("---")

    # Skip button
    if st.button("Skip Introduction", key="welcome_skip_btn"):
        st.session_state[ONBOARDING_SHOWN_KEY] = True
        st.rerun()

    if selected_mode:
        st.session_state[ONBOARDING_SHOWN_KEY] = True
        st.session_state[SELECTED_QUICK_START_KEY] = selected_mode
        mark_mode_selected()
        if on_mode_select:
            on_mode_select(selected_mode)
        st.rerun()

    return selected_mode


def render_quick_start_guide(mode: TestingMode) -> None:
    """Render quick start guide for a specific mode.

    Args:
        mode: The testing mode to show guide for.
    """
    guide = QUICK_START_GUIDES.get(mode)
    if not guide:
        logger.warning(f"Unknown quick start mode: {mode}")
        return

    title = html.escape(str(guide["title"]))
    description = html.escape(str(guide["description"]))
    icon = guide.get("icon", "info")

    st.markdown(f"### :{icon}: Quick Start: {title}")
    st.markdown(description)

    st.markdown("**Steps:**")
    for i, step in enumerate(guide["steps"], 1):
        safe_step = html.escape(step)
        st.markdown(f"{i}. {safe_step}")

    # Close button
    if st.button("Got it!", key=f"quick_start_close_{mode}"):
        if SELECTED_QUICK_START_KEY in st.session_state:
            del st.session_state[SELECTED_QUICK_START_KEY]
        st.rerun()


def render_progress_indicator() -> None:
    """Render the getting started checklist progress indicator."""
    checklist = _get_checklist()

    completed_count = sum(
        1 for item in checklist if isinstance(item, ChecklistItem) and item.completed
    )
    total_count = len(checklist)
    progress = completed_count / total_count if total_count > 0 else 0.0

    with st.sidebar.expander("Getting Started", expanded=completed_count < total_count):
        st.progress(progress, text=f"{completed_count}/{total_count} completed")

        for item in checklist:
            if not isinstance(item, ChecklistItem):
                continue
            safe_label = html.escape(item.label)
            if item.completed:
                st.markdown(f":white_check_mark: ~~{safe_label}~~")
            else:
                st.markdown(f":black_square_button: {safe_label}")

        # Reset button
        if completed_count > 0:
            if st.button("Reset Progress", key="reset_progress_btn"):
                st.session_state[ONBOARDING_CHECKLIST_KEY] = _get_default_checklist()
                st.rerun()


def render_contextual_tooltip(key: str, text: str) -> None:
    """Render a contextual help tooltip.

    Args:
        key: Unique key for the tooltip element.
        text: Help text to display.
    """
    safe_text = html.escape(text)
    st.caption(f":grey_question: {safe_text}")


def should_show_quick_start() -> bool:
    """Check if a quick start guide should be shown."""
    return SELECTED_QUICK_START_KEY in st.session_state


def get_selected_quick_start() -> TestingMode | None:
    """Get the currently selected quick start mode."""
    mode = st.session_state.get(SELECTED_QUICK_START_KEY)
    if mode == "demo":
        return "demo"
    elif mode == "sdk":
        return "sdk"
    elif mode == "remote":
        return "remote"
    return None
