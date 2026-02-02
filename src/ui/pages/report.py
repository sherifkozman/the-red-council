# src/ui/pages/report.py
"""
Dedicated report page for viewing Agent Security Reports.

This page provides a full-screen view of a security report with all
sections expanded and optimized for reading and sharing.
"""

import json
import logging

import streamlit as st

from src.core.agent_report import AgentSecurityReport, sanitize_markdown
from src.ui.components.report_viewer import (
    REPORT_HISTORY_KEY,
    ReportHistoryEntry,
    render_export_options,
    render_report_sections,
)

logger = logging.getLogger(__name__)

# Page configuration
st.set_page_config(
    page_title="Security Report - The Red Council",
    page_icon="📋",
    layout="wide",
    initial_sidebar_state="collapsed",
)


def _get_report_from_history(report_id: str) -> ReportHistoryEntry | None:
    """Get a report from history by ID."""
    if REPORT_HISTORY_KEY not in st.session_state:
        return None

    history = st.session_state[REPORT_HISTORY_KEY]
    if not isinstance(history, list):
        return None

    for entry in history:
        if isinstance(entry, ReportHistoryEntry) and entry.report_id == report_id:
            return entry

    return None


def _get_current_report() -> tuple[str, str, str] | None:
    """
    Get the current report data from session state.

    Returns:
        Tuple of (markdown_content, json_content, report_id) or None
    """
    # Check for view_historical_report first
    historical_id = st.session_state.get("view_historical_report")
    if historical_id:
        entry = _get_report_from_history(historical_id)
        if entry:
            return (entry.markdown_content, entry.json_content, entry.report_id)

    # Check for current report
    report = st.session_state.get("agent_report")
    if report:
        md = st.session_state.get("report_markdown", "")
        js = st.session_state.get("report_json", "{}")
        report_id = str(report.id) if hasattr(report, "id") else "unknown"
        return (md, js, report_id)

    return None


def render_report_page() -> None:
    """Render the full report page."""
    st.title("📋 Agent Security Report")

    # Navigation
    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("← Back to Dashboard"):
            # Clear historical view flag
            if "view_historical_report" in st.session_state:
                del st.session_state["view_historical_report"]
            st.switch_page("src/ui/dashboard.py")

    # Get report data
    report_data = _get_current_report()

    if not report_data:
        st.warning("No report available. Generate a report from the dashboard first.")
        st.info("Go to Agent Testing mode → Run Evaluation → Generate Report")
        return

    markdown_content, json_content, report_id = report_data

    # Try to parse the report
    try:
        report = AgentSecurityReport.model_validate_json(json_content)
    except Exception as e:
        logger.error(f"Failed to parse report: {e}")
        st.error("Failed to load report. The report data may be corrupted.")

        # Show raw content as fallback
        with st.expander("Raw Markdown"):
            st.markdown(sanitize_markdown(markdown_content))
        with st.expander("Raw JSON"):
            try:
                st.json(json.loads(json_content))
            except json.JSONDecodeError:
                st.code(json_content)
        return

    # Report header
    st.markdown("---")
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Risk Score", f"{report.risk_score}/10")
    with col2:
        detected = sum(1 for v in report.vulnerability_findings if v.detected)
        st.metric("Vulnerabilities", detected)
    with col3:
        st.metric("Generated", report.generated_at.strftime("%Y-%m-%d %H:%M"))

    st.markdown("---")

    # Export options
    render_export_options(markdown_content, json_content, report_id)

    st.markdown("---")

    # Full report sections
    render_report_sections(report, markdown_content, json_content, report_id)

    # Footer
    st.markdown("---")
    st.caption(f"Report ID: {report_id}")


# Run the page
if __name__ == "__main__":
    render_report_page()
