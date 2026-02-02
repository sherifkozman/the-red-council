# src/ui/components/campaign_runner.py
"""
Attack Campaign Runner UI component for Streamlit dashboard.

Provides UI for launching, monitoring, and controlling attack campaigns
against a configured remote agent using selected attack templates.

Features:
- Start Campaign button with validation
- Progress bar and real-time status updates
- Pause/Resume/Cancel controls
- Results summary and error display
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

import streamlit as st

from src.orchestrator.agent_campaign import (
    AgentCampaign,
    AttackResult,
    CampaignConfig,
    CampaignProgress,
    CampaignStatus,
)
from src.ui.components.attack_selector import (
    get_selected_templates,
    is_templates_selected,
)
from src.ui.components.mode_selector import AGENT_EVENTS_KEY
from src.ui.components.remote_agent_config import (
    get_remote_agent_config,
    is_remote_agent_configured,
)
from src.ui.async_utils import safe_run_async

logger = logging.getLogger(__name__)

# Session state keys
CAMPAIGN_KEY = "attack_campaign"
CAMPAIGN_PROGRESS_KEY = "campaign_progress"
CAMPAIGN_RESULTS_KEY = "campaign_results"
CAMPAIGN_RUNNING_KEY = "campaign_is_running"

# Display constants
STATUS_COLORS = {
    CampaignStatus.IDLE: "gray",
    CampaignStatus.RUNNING: "blue",
    CampaignStatus.PAUSED: "orange",
    CampaignStatus.COMPLETED: "green",
    CampaignStatus.CANCELLED: "orange",
    CampaignStatus.FAILED: "red",
}

STATUS_LABELS = {
    CampaignStatus.IDLE: "Ready",
    CampaignStatus.RUNNING: "Running",
    CampaignStatus.PAUSED: "Paused",
    CampaignStatus.COMPLETED: "Completed",
    CampaignStatus.CANCELLED: "Cancelled",
    CampaignStatus.FAILED: "Failed",
}


@dataclass
class CampaignUIState:
    """UI state for campaign display."""

    progress: CampaignProgress | None = None
    results: list[AttackResult] | None = None
    error_message: str | None = None


def _get_campaign_state() -> CampaignUIState:
    """Get current campaign UI state from session."""
    progress = st.session_state.get(CAMPAIGN_PROGRESS_KEY)
    results = st.session_state.get(CAMPAIGN_RESULTS_KEY)

    return CampaignUIState(
        progress=progress,
        results=results,
    )


def _save_campaign_progress(progress: CampaignProgress) -> None:
    """Save campaign progress to session state."""
    st.session_state[CAMPAIGN_PROGRESS_KEY] = progress


def _save_campaign_results(results: list[AttackResult]) -> None:
    """Save campaign results to session state."""
    st.session_state[CAMPAIGN_RESULTS_KEY] = results


def _clear_campaign_state() -> None:
    """Clear all campaign-related state."""
    keys = [
        CAMPAIGN_KEY,
        CAMPAIGN_PROGRESS_KEY,
        CAMPAIGN_RESULTS_KEY,
        CAMPAIGN_RUNNING_KEY,
    ]
    for key in keys:
        if key in st.session_state:
            del st.session_state[key]


def _get_template_data_for_campaign() -> list[dict[str, Any]]:
    """
    Get selected attack templates in format needed for campaign.

    Returns:
        List of template dictionaries with id, prompt_template, etc.
    """
    from src.knowledge.agent_attacks import AgentAttackKnowledgeBase

    selected_ids = get_selected_templates()
    if not selected_ids:
        return []

    # Load templates from knowledge base
    try:
        kb = AgentAttackKnowledgeBase()
        templates = []

        for template_id in selected_ids:
            # Retrieve template by ID
            result = kb.collection.get(ids=[template_id])
            if result["documents"]:
                # Decode metadata

                metadata = result["metadatas"][0] if result["metadatas"] else {}
                prompt = result["documents"][0]

                templates.append(
                    {
                        "id": template_id,
                        "prompt_template": prompt,
                        "severity": metadata.get("sophistication", 5),
                        "expected_behavior": metadata.get(
                            "expected_agent_behavior", ""
                        ),
                    }
                )

        return templates

    except Exception as e:
        logger.error(f"Failed to load templates: {e}", exc_info=True)
        return []


async def _run_campaign_async(
    templates: list[dict[str, Any]],
    session_id: str,
) -> tuple[CampaignProgress, list[AttackResult], list[Any]]:
    """
    Run attack campaign asynchronously.

    Args:
        templates: Attack templates to execute.
        session_id: Session ID for event correlation.

    Returns:
        Tuple of (progress, results, events).
    """
    agent_config = get_remote_agent_config()

    campaign_config = CampaignConfig(
        max_concurrent=1,
        timeout_per_attack=agent_config.timeout_seconds,
        retry_failed=False,
        delay_between_attacks=0.5,
    )

    campaign = AgentCampaign(
        campaign_config=campaign_config,
        attack_templates=templates,
        agent_config=agent_config,
        session_id=session_id,
    )

    # Store campaign for control
    st.session_state[CAMPAIGN_KEY] = campaign

    progress = await campaign.start()
    results = campaign.get_results()
    events = campaign.get_agent_events()

    return progress, results, events


def _render_campaign_status(state: CampaignUIState) -> None:
    """Render campaign status section."""
    progress = state.progress

    if progress is None:
        st.info(
            "No campaign running. Configure remote agent and select templates to start."
        )
        return

    # Status badge
    status = progress.status
    status_label = STATUS_LABELS.get(status, str(status.value))

    # Status indicators using metrics
    status_cols = st.columns(4)

    with status_cols[0]:
        st.metric("Status", status_label)

    with status_cols[1]:
        st.metric(
            "Progress",
            f"{progress.completed_attacks}/{progress.total_attacks}",
        )

    with status_cols[2]:
        st.metric(
            "Success Rate",
            f"{progress.successful_attacks}/{progress.completed_attacks or 1}",
        )

    with status_cols[3]:
        elapsed = f"{progress.elapsed_seconds:.1f}s"
        st.metric("Elapsed", elapsed)

    # Progress bar
    if progress.total_attacks > 0:
        st.progress(
            progress.progress_percent / 100,
            text=f"Attack {progress.completed_attacks} of {progress.total_attacks}",
        )

    # Current attack
    if progress.current_attack:
        st.caption(f"Current: {progress.current_attack}")


def _render_campaign_controls() -> None:
    """Render campaign control buttons."""
    campaign: AgentCampaign | None = st.session_state.get(CAMPAIGN_KEY)
    progress: CampaignProgress | None = st.session_state.get(CAMPAIGN_PROGRESS_KEY)

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        # Start button - enabled when ready
        can_start = (
            is_remote_agent_configured()
            and is_templates_selected()
            and (
                progress is None
                or progress.status
                not in (CampaignStatus.RUNNING, CampaignStatus.PAUSED)
            )
        )

        if st.button(
            "Start Campaign",
            key="start_campaign_btn",
            disabled=not can_start,
            type="primary",
            help="Start attack campaign with selected templates",
        ):
            _start_campaign()

    with col2:
        # Pause button
        can_pause = progress is not None and progress.status == CampaignStatus.RUNNING
        if st.button(
            "Pause",
            key="pause_campaign_btn",
            disabled=not can_pause,
            help="Pause the running campaign",
        ):
            if campaign:
                campaign.pause()
                st.rerun()

    with col3:
        # Resume button
        can_resume = progress is not None and progress.status == CampaignStatus.PAUSED
        if st.button(
            "Resume",
            key="resume_campaign_btn",
            disabled=not can_resume,
            help="Resume paused campaign",
        ):
            if campaign:
                campaign.resume()
                st.rerun()

    with col4:
        # Cancel button
        can_cancel = campaign is not None and campaign.is_running()
        if st.button(
            "Cancel",
            key="cancel_campaign_btn",
            disabled=not can_cancel,
            help="Cancel the running campaign",
        ):
            if campaign:
                campaign.cancel()
                st.rerun()


def _start_campaign() -> None:
    """Start a new attack campaign."""
    # Validate prerequisites
    if not is_remote_agent_configured():
        st.error("Remote agent not configured. Please configure endpoint first.")
        return

    if not is_templates_selected():
        st.error("No attack templates selected. Please select templates first.")
        return

    # Get templates
    templates = _get_template_data_for_campaign()
    if not templates:
        st.error("Failed to load selected attack templates.")
        return

    # Get session ID - generate unique one if missing
    session_id = st.session_state.get("session_id")
    if not session_id:
        from uuid import uuid4

        session_id = str(uuid4())
        logger.warning(f"No session_id in state. Generated new: {session_id}")
        st.session_state["session_id"] = session_id

    st.session_state[CAMPAIGN_RUNNING_KEY] = True

    try:
        with st.spinner(f"Running campaign with {len(templates)} attacks..."):
            result = safe_run_async(_run_campaign_async(templates, session_id))
            if isinstance(result, asyncio.Task) or asyncio.isfuture(result):
                st.info("Campaign started in background. Refresh to see progress.")
                return

            progress, results, events = result

            # Save results
            _save_campaign_progress(progress)
            _save_campaign_results(results)

            # Append events to agent events
            existing_events = st.session_state.get(AGENT_EVENTS_KEY, [])
            if not isinstance(existing_events, list):
                logger.warning(
                    f"AGENT_EVENTS_KEY was {type(existing_events).__name__}, "
                    "resetting to empty list"
                )
                existing_events = []
            st.session_state[AGENT_EVENTS_KEY] = existing_events + events

            # Show completion notification
            if progress.status == CampaignStatus.COMPLETED:
                success_count = progress.successful_attacks
                total_count = progress.total_attacks
                st.success(
                    f"Campaign completed! {success_count}/{total_count} successful."
                )
            elif progress.status == CampaignStatus.CANCELLED:
                st.warning("Campaign was cancelled.")
            elif progress.status == CampaignStatus.FAILED:
                st.error("Campaign failed. Check errors below.")

    except Exception as e:
        logger.error(f"Campaign execution failed: {e}", exc_info=True)
        st.error(f"Campaign failed: {str(e)}")

    finally:
        st.session_state[CAMPAIGN_RUNNING_KEY] = False


def _render_results_summary(state: CampaignUIState) -> None:
    """Render campaign results summary."""
    results = state.results
    progress = state.progress

    if not results:
        return

    st.subheader("Campaign Results")

    # Summary metrics
    cols = st.columns(4)

    with cols[0]:
        st.metric("Total Attacks", len(results))

    with cols[1]:
        successful = sum(1 for r in results if r.success)
        st.metric("Successful", successful)

    with cols[2]:
        failed = sum(1 for r in results if not r.success)
        st.metric("Failed", failed)

    with cols[3]:
        avg_duration = (
            sum(r.duration_ms for r in results) / len(results) if results else 0
        )
        st.metric("Avg Duration", f"{avg_duration:.0f}ms")

    # Results table
    with st.expander("Attack Results Details", expanded=False):
        for result in results:
            status_icon = "✅" if result.success else "❌"
            label = f"{status_icon} {result.template_id} ({result.duration_ms}ms)"

            with st.expander(label, expanded=False):
                st.markdown(f"**Prompt:** {result.prompt[:200]}...")

                if result.response:
                    st.markdown("**Response:**")
                    st.code(result.response[:500], language=None)

                if result.error:
                    st.error(f"Error: {result.error}")

    # Errors
    if progress and progress.errors:
        with st.expander("Errors", expanded=True):
            for error in progress.errors:
                st.error(error)


def _render_prerequisites_check() -> None:
    """Render prerequisites check section."""
    remote_ok = is_remote_agent_configured()
    templates_ok = is_templates_selected()

    if not remote_ok or not templates_ok:
        st.warning("Prerequisites not met:")

        if not remote_ok:
            st.markdown("- Configure Remote Agent endpoint in the **Remote Agent** tab")

        if not templates_ok:
            st.markdown("- Select attack templates in the **Attack Templates** tab")


def render_campaign_runner() -> None:
    """
    Render the Campaign Runner panel.

    This component displays:
    - Prerequisites check
    - Campaign controls (Start/Pause/Resume/Cancel)
    - Progress bar and status
    - Results summary
    """
    st.subheader("Attack Campaign")

    # Get current state
    state = _get_campaign_state()

    # Prerequisites check
    _render_prerequisites_check()

    st.divider()

    # Controls
    _render_campaign_controls()

    st.divider()

    # Status
    _render_campaign_status(state)

    # Results
    if state.results:
        st.divider()
        _render_results_summary(state)

    # Clear results button
    if state.progress is not None:
        st.divider()
        if st.button(
            "Clear Campaign Results",
            key="clear_campaign_btn",
            help="Clear campaign results and start fresh",
        ):
            _clear_campaign_state()
            st.rerun()


def get_campaign_progress() -> CampaignProgress | None:
    """Get current campaign progress."""
    return st.session_state.get(CAMPAIGN_PROGRESS_KEY)


def get_campaign_results() -> list[AttackResult] | None:
    """Get current campaign results."""
    return st.session_state.get(CAMPAIGN_RESULTS_KEY)


def is_campaign_running() -> bool:
    """Check if a campaign is currently running."""
    return bool(st.session_state.get(CAMPAIGN_RUNNING_KEY, False))
