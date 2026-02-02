# src/ui/components/report_viewer.py
"""
Full-featured report viewer component for Agent Security Reports.

Features:
- Section-based display (Summary, OWASP Coverage, Analysis, Recommendations)
- Export formats: Markdown, JSON, PDF
- Print-friendly view
- Copy individual sections to clipboard
- URL anchors for deep linking to findings
- Historical reports list
- Compare reports feature
"""

import io
import json
import logging
import re
from dataclasses import dataclass

import streamlit as st

from src.core.agent_report import AgentSecurityReport, sanitize_markdown

logger = logging.getLogger(__name__)

# Session state keys
REPORT_HISTORY_KEY = "report_history"
SELECTED_REPORTS_KEY = "selected_reports_for_compare"
ACTIVE_SECTION_KEY = "report_active_section"

# Maximum reports to keep in history
MAX_HISTORY_SIZE = 20


@dataclass
class ReportHistoryEntry:
    """Entry in the report history."""

    report_id: str
    generated_at: str
    risk_score: float
    summary_preview: str
    markdown_content: str
    json_content: str


def _get_report_history() -> list[ReportHistoryEntry]:
    """Get report history from session state."""
    if REPORT_HISTORY_KEY not in st.session_state:
        st.session_state[REPORT_HISTORY_KEY] = []
    history = st.session_state[REPORT_HISTORY_KEY]
    if not isinstance(history, list):
        st.session_state[REPORT_HISTORY_KEY] = []
        return []
    return history


def _add_to_history(
    report_id: str,
    generated_at: str,
    risk_score: float,
    summary: str,
    markdown_content: str,
    json_content: str,
) -> None:
    """Add a report to history, maintaining max size."""
    history = _get_report_history()

    # Check if already in history
    existing_ids = {
        entry.report_id for entry in history if isinstance(entry, ReportHistoryEntry)
    }
    if report_id in existing_ids:
        return

    entry = ReportHistoryEntry(
        report_id=report_id,
        generated_at=generated_at,
        risk_score=risk_score,
        summary_preview=summary[:150] + "..." if len(summary) > 150 else summary,
        markdown_content=markdown_content,
        json_content=json_content,
    )

    history.insert(0, entry)  # Most recent first

    # Trim to max size
    if len(history) > MAX_HISTORY_SIZE:
        history = history[:MAX_HISTORY_SIZE]

    st.session_state[REPORT_HISTORY_KEY] = history


def _get_selected_reports() -> list[str]:
    """Get selected report IDs for comparison."""
    if SELECTED_REPORTS_KEY not in st.session_state:
        st.session_state[SELECTED_REPORTS_KEY] = []
    selected = st.session_state[SELECTED_REPORTS_KEY]
    if not isinstance(selected, list):
        st.session_state[SELECTED_REPORTS_KEY] = []
        return []
    return selected


def _set_selected_reports(report_ids: list[str]) -> None:
    """Set selected report IDs for comparison."""
    st.session_state[SELECTED_REPORTS_KEY] = report_ids


def _generate_pdf_bytes(markdown_content: str, report_id: str) -> bytes | None:
    """
    Generate PDF from markdown content.

    Returns None if reportlab is not available.
    """
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    except ImportError:
        logger.debug("reportlab not available for PDF generation")
        return None

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch
    )
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=16,
        spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        "CustomHeading",
        parent=styles["Heading2"],
        fontSize=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "CustomBody",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=6,
    )

    story = []

    # Parse markdown and convert to reportlab elements
    lines = markdown_content.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            story.append(Spacer(1, 6))
            continue

        if line.startswith("# "):
            story.append(Paragraph(sanitize_markdown(line[2:]), title_style))
        elif line.startswith("## "):
            story.append(Paragraph(sanitize_markdown(line[3:]), heading_style))
        elif line.startswith("### "):
            story.append(Paragraph(f"<b>{sanitize_markdown(line[4:])}</b>", body_style))
        elif line.startswith("- "):
            story.append(Paragraph(f"• {sanitize_markdown(line[2:])}", body_style))
        elif line.startswith("|"):
            # Skip table rows for simplicity, or try to parse
            continue
        elif line.startswith("**"):
            # Bold text
            clean = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", line)
            story.append(Paragraph(sanitize_markdown(clean), body_style))
        else:
            story.append(Paragraph(sanitize_markdown(line), body_style))

    try:
        doc.build(story)
        return buffer.getvalue()
    except Exception as e:
        logger.error(f"PDF generation failed: {e}")
        return None


def _render_section_header(title: str, anchor_id: str) -> None:
    """Render a section header with anchor."""
    # Sanitize anchor_id to prevent XSS - only allow alphanumeric, hyphens, underscores
    safe_anchor_id = re.sub(r"[^a-zA-Z0-9_-]", "", anchor_id)
    st.markdown(
        f'<h3 id="{safe_anchor_id}">{sanitize_markdown(title)}</h3>',
        unsafe_allow_html=True,
    )


def _render_copy_button(content: str, key: str, label: str = "Copy") -> None:
    """Render a copy-to-clipboard button using Streamlit's built-in functionality."""
    # Streamlit doesn't have native clipboard support, so we use a workaround
    # with a text area that can be easily copied
    if st.button(f"📋 {label}", key=key):
        st.code(content, language=None)
        st.caption("Select and copy the text above (Ctrl+C / Cmd+C)")


def render_report_sections(
    report: AgentSecurityReport,
    markdown_content: str,
    json_content: str,
    report_id: str,
) -> None:
    """
    Render the report with expandable sections.

    Args:
        report: The AgentSecurityReport object
        markdown_content: Pre-rendered markdown
        json_content: Pre-serialized JSON
        report_id: Report ID for anchors and filenames
    """
    safe_report_id = re.sub(r"[^a-zA-Z0-9_-]", "", report_id or "unknown")

    # Summary section
    with st.expander("📊 Executive Summary", expanded=True):
        _render_section_header("Executive Summary", "summary")
        st.markdown(f"**Risk Score**: {report.risk_score}/10.0")
        st.markdown(f"**Generated**: {report.generated_at.isoformat()}")
        st.divider()
        st.markdown(sanitize_markdown(report.summary))
        _render_copy_button(
            report.summary, f"copy_summary_{safe_report_id}", "Copy Summary"
        )

    # OWASP Coverage section
    with st.expander("🛡️ OWASP Agentic Coverage", expanded=False):
        _render_section_header("OWASP Agentic Top 10 Coverage", "owasp-coverage")

        # Build coverage table data
        detected_categories = {
            v.owasp_category for v in report.vulnerability_findings if v.detected
        }

        coverage_data = []
        for risk, tested in sorted(
            report.owasp_coverage.items(), key=lambda x: x[0].value
        ):
            if not tested:
                status = "⚪ Not Tested"
            elif risk in detected_categories:
                status = "🔴 Detected"
            else:
                status = "🟢 No Issues Detected"

            coverage_data.append(
                {
                    "Category": f"{risk.value}",
                    "Name": risk.name.replace("_", " "),
                    "Status": status,
                }
            )

        # Display as table
        st.table(coverage_data)

        # Copy as text
        coverage_text = "\n".join(
            f"{d['Category']}: {d['Name']} - {d['Status']}" for d in coverage_data
        )
        _render_copy_button(
            coverage_text, f"copy_owasp_{safe_report_id}", "Copy Coverage"
        )

    # Vulnerability Findings section
    with st.expander("⚠️ Vulnerability Findings", expanded=False):
        _render_section_header("Vulnerability Findings", "findings")

        detected = [v for v in report.vulnerability_findings if v.detected]
        if detected:
            for i, finding in enumerate(detected):
                st.markdown(
                    f"### {finding.owasp_category.value}: {finding.owasp_category.name}"
                )
                col1, col2 = st.columns([1, 3])
                with col1:
                    st.metric("Severity", f"{finding.severity}/10")
                with col2:
                    evidence = sanitize_markdown(finding.evidence)
                    st.markdown(f"**Evidence**: {evidence}")
                    rec_text = sanitize_markdown(finding.recommendation)
                    st.markdown(f"**Recommendation**: {rec_text}")
                if i < len(detected) - 1:
                    st.divider()

            findings_text = "\n\n".join(
                f"{v.owasp_category.value}: Severity {v.severity}/10\n"
                f"Evidence: {v.evidence}\nRecommendation: {v.recommendation}"
                for v in detected
            )
            _render_copy_button(
                findings_text, f"copy_findings_{safe_report_id}", "Copy Findings"
            )
        else:
            st.success("No vulnerabilities detected.")

    # Tool Analysis section
    with st.expander("🔧 Tool Analysis", expanded=False):
        _render_section_header("Tool Analysis", "tool-analysis")

        if report.tool_analysis:
            ta = report.tool_analysis
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Total Calls", ta.call_count)
            with col2:
                st.metric("Unique Tools", len(ta.unique_tools))
            with col3:
                abuse_label = "Yes ⚠️" if ta.abuse_detected else "No ✅"
                st.metric("Abuse Detected", abuse_label)

            if ta.unique_tools:
                st.markdown("**Tools Used**: " + ", ".join(ta.unique_tools))

            if ta.suspicious_patterns:
                st.warning(
                    "**Suspicious Patterns**: " + ", ".join(ta.suspicious_patterns)
                )

            tool_text = (
                f"Total Calls: {ta.call_count}\n"
                f"Unique Tools: {', '.join(ta.unique_tools)}\n"
                f"Abuse Detected: {ta.abuse_detected}\n"
                f"Suspicious Patterns: {', '.join(ta.suspicious_patterns)}"
            )
            _render_copy_button(
                tool_text, f"copy_tools_{safe_report_id}", "Copy Tool Analysis"
            )
        else:
            st.info("No tool analysis data available.")

    # Memory Analysis section
    with st.expander("💾 Memory Analysis", expanded=False):
        _render_section_header("Memory Analysis", "memory-analysis")

        if report.memory_analysis:
            ma = report.memory_analysis
            st.metric("Access Count", ma.access_count)

            if ma.sensitive_keys_accessed:
                st.warning(
                    "**Sensitive Keys Accessed**: "
                    + ", ".join(ma.sensitive_keys_accessed)
                )

            if ma.injection_attempts:
                st.error("**Injection Attempts**: " + ", ".join(ma.injection_attempts))

            memory_text = (
                f"Access Count: {ma.access_count}\n"
                f"Sensitive Keys: {', '.join(ma.sensitive_keys_accessed)}\n"
                f"Injection Attempts: {', '.join(ma.injection_attempts)}"
            )
            _render_copy_button(
                memory_text, f"copy_memory_{safe_report_id}", "Copy Memory Analysis"
            )
        else:
            st.info("No memory analysis data available.")

    # Divergence Analysis section
    with st.expander("🎭 Divergence Analysis (Deception Detection)", expanded=False):
        _render_section_header("Divergence Analysis", "divergence-analysis")

        if report.divergence_analysis:
            da = report.divergence_analysis
            st.metric("Total Divergences", da.divergence_count)

            if da.severity_distribution:
                st.markdown("**Severity Distribution**:")
                for sev, count in da.severity_distribution.items():
                    st.markdown(f"- {sev}: {count}")

            if da.examples:
                st.markdown("**Examples**:")
                for ex in da.examples[:3]:  # Show max 3 examples
                    with st.container():
                        speech = str(ex.get("speech_intent", ""))[:100]
                        action = str(ex.get("actual_action", ""))[:100]
                        sev = ex.get("severity", "unknown")
                        st.markdown(f"- Speech: *{sanitize_markdown(speech)}*")
                        st.markdown(f"  Action: *{sanitize_markdown(action)}*")
                        st.markdown(f"  Severity: {sev}")

            div_text = (
                f"Divergence Count: {da.divergence_count}\n"
                f"Severity Distribution: {da.severity_distribution}"
            )
            _render_copy_button(
                div_text, f"copy_divergence_{safe_report_id}", "Copy Divergence"
            )
        else:
            st.info("No divergence analysis data available.")

    # Recommendations section
    with st.expander("💡 Recommendations", expanded=False):
        _render_section_header("Recommendations", "recommendations")

        if report.recommendations:
            # Sort by priority
            priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
            sorted_recs = sorted(
                report.recommendations,
                key=lambda r: priority_order.get(r.priority.value, 99),
            )

            for rec in sorted_recs:
                priority_color = {"HIGH": "🔴", "MEDIUM": "🟡", "LOW": "🟢"}.get(
                    rec.priority.value, "⚪"
                )
                st.markdown(
                    f"{priority_color} **[{rec.priority.value}] {rec.category.value}**"
                )
                st.markdown(sanitize_markdown(rec.description))
                st.divider()

            recs_text = "\n\n".join(
                f"[{r.priority.value}] {r.category.value}: {r.description}"
                for r in sorted_recs
            )
            _render_copy_button(
                recs_text, f"copy_recs_{safe_report_id}", "Copy Recommendations"
            )
        else:
            st.info("No recommendations.")

    # Hardening Plan section
    if report.hardening_plan:
        with st.expander("🔒 Hardening Plan", expanded=False):
            _render_section_header("Hardening Plan", "hardening-plan")
            hp = report.hardening_plan

            if hp.tool_controls:
                st.markdown("### Tool Controls")
                for tc in hp.tool_controls:
                    extras = []
                    if tc.requires_approval:
                        extras.append("Requires Approval")
                    if tc.rate_limit:
                        extras.append(f"Limit: {tc.rate_limit}/min")
                    extra_str = f" ({', '.join(extras)})" if extras else ""
                    st.markdown(f"- **{sanitize_markdown(tc.tool_name)}**{extra_str}")

            if hp.guardrails:
                st.markdown("### Guardrails")
                for g in hp.guardrails:
                    name = sanitize_markdown(g.name)
                    msg = sanitize_markdown(g.message)
                    st.markdown(f"- **{name}** ({g.action.value}): {msg}")

            if hp.memory_isolation:
                st.markdown("### Memory Policy")
                mp = hp.memory_isolation
                if mp.allowed_keys_pattern:
                    allowed = sanitize_markdown(mp.allowed_keys_pattern)
                    st.markdown(f"- Allowed Keys: `{allowed}`")
                if mp.denied_keys_pattern:
                    denied = sanitize_markdown(mp.denied_keys_pattern)
                    st.markdown(f"- Denied Keys: `{denied}`")
                st.markdown(f"- Max Value Size: {mp.max_value_size} bytes")
                enc = "Required" if mp.encryption_required else "Optional"
                st.markdown(f"- Encryption: {enc}")

    # Remediation Steps section
    if report.remediation_steps:
        with st.expander("🛠️ Remediation Steps", expanded=False):
            _render_section_header("Remediation Steps", "remediation-steps")

            for step in report.remediation_steps:
                desc = sanitize_markdown(step.description)
                effort = sanitize_markdown(step.effort_estimate)
                st.markdown(f"**{desc}** (Effort: {effort})")
                if step.code_example:
                    st.code(step.code_example, language="python")


def render_export_options(
    markdown_content: str, json_content: str, report_id: str
) -> None:
    """
    Render export options for the report.

    Args:
        markdown_content: Pre-rendered markdown
        json_content: Pre-serialized JSON
        report_id: Report ID for filenames
    """
    safe_report_id = re.sub(r"[^a-zA-Z0-9_-]", "", report_id or "unknown")

    st.markdown("### Export Options")
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.download_button(
            label="📄 Markdown",
            data=markdown_content,
            file_name=f"agent_security_report_{safe_report_id}.md",
            mime="text/markdown",
            key=f"download_md_{safe_report_id}",
        )

    with col2:
        st.download_button(
            label="📊 JSON",
            data=json_content,
            file_name=f"agent_security_report_{safe_report_id}.json",
            mime="application/json",
            key=f"download_json_{safe_report_id}",
        )

    with col3:
        # PDF export (if reportlab available)
        pdf_bytes = _generate_pdf_bytes(markdown_content, safe_report_id)
        if pdf_bytes:
            st.download_button(
                label="📑 PDF",
                data=pdf_bytes,
                file_name=f"agent_security_report_{safe_report_id}.pdf",
                mime="application/pdf",
                key=f"download_pdf_{safe_report_id}",
            )
        else:
            st.button(
                "📑 PDF (N/A)",
                key=f"pdf_na_{safe_report_id}",
                disabled=True,
                help="Install reportlab for PDF export",
            )

    with col4:
        # Print-friendly view button
        if st.button("🖨️ Print View", key=f"print_{safe_report_id}"):
            st.session_state[f"print_view_{safe_report_id}"] = True
            st.rerun()


def render_print_view(markdown_content: str, report_id: str) -> None:
    """Render a print-friendly view of the report."""
    safe_report_id = re.sub(r"[^a-zA-Z0-9_-]", "", report_id or "unknown")

    if st.button("← Back to Normal View", key=f"back_from_print_{safe_report_id}"):
        st.session_state[f"print_view_{safe_report_id}"] = False
        st.rerun()

    st.markdown(
        """
        <style>
        @media print {
            .stButton, .stSidebar, header, footer { display: none !important; }
            .main .block-container { padding: 0 !important; max-width: 100%; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(markdown_content)
    st.caption(
        "Use your browser's print function (Ctrl+P / Cmd+P) to print this report."
    )


def render_report_history() -> None:
    """Render the historical reports list."""
    history = _get_report_history()

    if not history:
        st.info("No previous reports. Generate a report to see it here.")
        return

    st.markdown("### Report History")
    st.caption(f"Showing {len(history)} most recent reports")

    for entry in history:
        if not isinstance(entry, ReportHistoryEntry):
            continue

        with st.expander(
            f"📋 {entry.generated_at[:10]} - Risk: {entry.risk_score}/10",
            expanded=False,
        ):
            st.markdown(f"**ID**: {entry.report_id}")
            st.markdown(f"**Summary**: {sanitize_markdown(entry.summary_preview)}")

            col1, col2 = st.columns(2)
            with col1:
                if st.button("View", key=f"view_{entry.report_id}"):
                    st.session_state["view_historical_report"] = entry.report_id
                    st.rerun()
            with col2:
                # Add to comparison selection
                selected = _get_selected_reports()
                is_selected = entry.report_id in selected

                if is_selected:
                    if st.button(
                        "Remove from Compare", key=f"unselect_{entry.report_id}"
                    ):
                        selected.remove(entry.report_id)
                        _set_selected_reports(selected)
                        st.rerun()
                else:
                    if st.button("Add to Compare", key=f"select_{entry.report_id}"):
                        if len(selected) < 2:
                            selected.append(entry.report_id)
                            _set_selected_reports(selected)
                            st.rerun()
                        else:
                            st.warning("Maximum 2 reports for comparison.")


def render_report_comparison() -> None:
    """Render comparison view for two selected reports."""
    selected = _get_selected_reports()
    history = _get_report_history()

    if len(selected) < 2:
        st.info("Select 2 reports from history to compare.")
        return

    # Find the selected reports
    report_map = {
        entry.report_id: entry
        for entry in history
        if isinstance(entry, ReportHistoryEntry)
    }

    report_a = report_map.get(selected[0])
    report_b = report_map.get(selected[1])

    if not report_a or not report_b:
        st.error("Selected reports not found in history.")
        return

    st.markdown("### Report Comparison")

    col1, col2 = st.columns(2)

    with col1:
        st.markdown(f"**Report A**: {report_a.generated_at[:10]}")
        st.metric("Risk Score", f"{report_a.risk_score}/10")

        try:
            data_a = json.loads(report_a.json_content)
            findings_a = sum(
                1 for v in data_a.get("vulnerability_findings", []) if v.get("detected")
            )
            st.metric("Vulnerabilities", findings_a)
        except (json.JSONDecodeError, TypeError):
            st.metric("Vulnerabilities", "N/A")

    with col2:
        st.markdown(f"**Report B**: {report_b.generated_at[:10]}")
        st.metric("Risk Score", f"{report_b.risk_score}/10")

        try:
            data_b = json.loads(report_b.json_content)
            findings_b = sum(
                1 for v in data_b.get("vulnerability_findings", []) if v.get("detected")
            )
            st.metric("Vulnerabilities", findings_b)
        except (json.JSONDecodeError, TypeError):
            st.metric("Vulnerabilities", "N/A")

    # Risk score diff
    diff = report_b.risk_score - report_a.risk_score
    if diff > 0:
        st.error(f"Risk increased by {diff:.1f} points")
    elif diff < 0:
        st.success(f"Risk decreased by {abs(diff):.1f} points")
    else:
        st.info("Risk score unchanged")

    if st.button("Clear Comparison", key="clear_compare"):
        _set_selected_reports([])
        st.rerun()


def render_report_viewer(
    markdown_content: str, json_content: str, report_id: str
) -> None:
    """
    Render the full-featured report viewer component.

    Args:
        markdown_content: Rendered markdown string
        json_content: Serialized JSON string
        report_id: ID of the report for filename generation
    """
    safe_report_id = re.sub(r"[^a-zA-Z0-9_-]", "", report_id or "unknown")

    # Check for print view mode
    if st.session_state.get(f"print_view_{safe_report_id}"):
        render_print_view(markdown_content, report_id)
        return

    st.divider()
    st.subheader("Security Report")

    # Try to parse the report for section-based view
    try:
        report = AgentSecurityReport.model_validate_json(json_content)

        # Add to history
        _add_to_history(
            report_id=report_id,
            generated_at=report.generated_at.isoformat(),
            risk_score=report.risk_score,
            summary=report.summary,
            markdown_content=markdown_content,
            json_content=json_content,
        )

        # Export options
        render_export_options(markdown_content, json_content, report_id)

        st.divider()

        # Tabs for different views
        view_tab, history_tab, compare_tab = st.tabs(
            ["📋 Current Report", "📚 History", "🔄 Compare"]
        )

        with view_tab:
            render_report_sections(report, markdown_content, json_content, report_id)

        with history_tab:
            render_report_history()

        with compare_tab:
            render_report_comparison()

    except Exception as e:
        logger.error(f"Failed to parse report JSON: {e}")
        # Fallback to basic markdown view
        st.warning("Report structure invalid. Showing raw markdown.")

        col1, col2 = st.columns(2)
        with col1:
            st.download_button(
                label="Download Markdown Report",
                data=markdown_content,
                file_name=f"agent_security_report_{safe_report_id}.md",
                mime="text/markdown",
                key="download_md_btn",
            )

        with col2:
            st.download_button(
                label="Download JSON Data",
                data=json_content,
                file_name=f"agent_security_report_{safe_report_id}.json",
                mime="application/json",
                key="download_json_btn",
            )

        with st.expander("Report Preview", expanded=True):
            safe_markdown = sanitize_markdown(markdown_content)
            st.markdown(safe_markdown, unsafe_allow_html=False)

        with st.expander("Raw JSON Data"):
            try:
                st.json(json.loads(json_content))
            except json.JSONDecodeError:
                st.error("Invalid JSON content")


# Public API
__all__ = [
    "ReportHistoryEntry",
    "render_export_options",
    "render_print_view",
    "render_report_comparison",
    "render_report_history",
    "render_report_sections",
    "render_report_viewer",
]
