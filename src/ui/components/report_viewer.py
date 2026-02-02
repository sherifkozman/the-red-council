import json
import logging
import re

import streamlit as st

from src.core.agent_report import AgentSecurityReport, sanitize_markdown

logger = logging.getLogger(__name__)

def render_report_viewer(markdown_content: str, json_content: str, report_id: str):
    """
    Render the report viewer component with preview and download options.
    
    Args:
        markdown_content: Rendered markdown string
        json_content: Serialized JSON string
        report_id: ID of the report for filename generation
    """
    st.divider()
    st.subheader("Security Report")

    # Sanitize Report ID for filename
    safe_report_id = re.sub(r'[^a-zA-Z0-9_-]', '', report_id or "unknown")

    # Download Buttons
    col1, col2 = st.columns(2)
    with col1:
        st.download_button(
            label="Download Markdown Report",
            data=markdown_content,
            file_name=f"agent_security_report_{safe_report_id}.md",
            mime="text/markdown",
            key="download_md_btn"
        )

    with col2:
        st.download_button(
            label="Download JSON Data",
            data=json_content,
            file_name=f"agent_security_report_{safe_report_id}.json",
            mime="application/json",
            key="download_json_btn"
        )

    # Preview
    with st.expander("Report Preview", expanded=True):
        # Double sanitization to be safe (generator does it, but UI layer should too)
        safe_markdown = sanitize_markdown(markdown_content)
        st.markdown(safe_markdown, unsafe_allow_html=False)

    # Detailed JSON View (Optional)
    with st.expander("Raw JSON Data"):
        try:
            # Validate structure against schema before displaying
            # This ensures we don't display arbitrary JSON that might be confusing or malicious
            AgentSecurityReport.model_validate_json(json_content)
            st.json(json.loads(json_content))
        except Exception as e:
            logger.error(f"Failed to parse/validate report JSON for report {safe_report_id}: {e}", exc_info=True)
            st.error("Invalid or corrupted JSON content")
