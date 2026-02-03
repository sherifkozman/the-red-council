import streamlit as st
import json
import html
import logging
from datetime import datetime
from typing import List, Optional, Any, Dict, cast
from src.core.agent_schemas import (
    AgentEvent,
    ToolCallEvent,
    MemoryAccessEvent,
    ActionRecord,
    SpeechRecord,
    DivergenceEvent,
)

logger = logging.getLogger(__name__)

# Constants
EVENTS_PER_PAGE = 50
MAX_EVENTS_LIMIT = 5000  # Prevent OOM on massive lists
MAX_EXPORT_SIZE_BYTES = 10 * 1024 * 1024  # 10MB limit

# Custom CSS for timeline events - kept static and safe
TIMELINE_CSS = """
<style>
.agent-event {
    border-left: 4px solid #ddd;
    padding: 10px;
    margin-bottom: 10px;
    background-color: #f9f9f9;
    border-radius: 4px;
}
</style>
"""


def render_agent_timeline(events: List[AgentEvent]) -> None:
    """
    Render a chronological timeline of agent events.

    Args:
        events: List of AgentEvent objects to display.
    """
    if not events:
        st.info("No events to display.")
        return

    # 1. Safety Limit
    if len(events) > MAX_EVENTS_LIMIT:
        st.warning(
            f"Event list truncated: showing newest {MAX_EVENTS_LIMIT} "
            f"of {len(events)} events for performance."
        )
        # Slice end (newest usually) assuming append-only log
        events = events[-MAX_EVENTS_LIMIT:]

    # Inject CSS
    st.markdown(TIMELINE_CSS, unsafe_allow_html=True)

    st.subheader("Agent Behavior Timeline")

    # 2. Controls (Filter & Pagination)
    col1, col2 = st.columns([2, 1])

    with col1:
        event_types = {
            "tool_call": "Tool Calls",
            "memory_access": "Memory Access",
            "speech": "Speech",
            "action": "Actions",
            "divergence": "Divergences",
        }

        selected_types = st.multiselect(
            "Filter by Event Type",
            options=list(event_types.keys()),
            format_func=lambda x: event_types.get(x, x),
            default=list(event_types.keys()),
        )

    # Filter events
    # Ensure we handle potentially malformed events gracefully during filter
    filtered_events = []
    for e in events:
        if getattr(e, "event_type", None) in selected_types:
            filtered_events.append(e)

    # Sort events by timestamp (ensure chronological)
    # Handle missing timestamps gracefully
    try:
        filtered_events.sort(key=lambda x: getattr(x, "timestamp", datetime.min))
    except Exception as e:
        logger.warning(f"Sorting failed: {e}")

    # Calculate pagination
    total_events = len(filtered_events)
    total_pages = max(1, (total_events + EVENTS_PER_PAGE - 1) // EVENTS_PER_PAGE)

    with col2:
        # Handle case where page might be out of range after filter change
        if "timeline_page" not in st.session_state:
            st.session_state.timeline_page = 1

        # Clamp session state page
        if st.session_state.timeline_page > total_pages:
            st.session_state.timeline_page = 1

        current_page = st.number_input(
            "Page",
            min_value=1,
            max_value=total_pages,
            value=st.session_state.timeline_page,
            step=1,
            key="timeline_page_input",
        )
        # Sync input back to session state (implicit via streamlit key)

    # Slice events for current page
    start_idx = (current_page - 1) * EVENTS_PER_PAGE
    end_idx = min(start_idx + EVENTS_PER_PAGE, total_events)
    page_events = filtered_events[start_idx:end_idx]

    st.caption(f"Showing {start_idx + 1}-{end_idx} of {total_events} events")

    # Export Section
    _render_export_section(filtered_events)

    # 3. Render Loop
    if not page_events:
        if total_events > 0:
            st.info("No events on this page.")
        else:
            st.warning("No events match the selected filters.")
        return

    session_start = filtered_events[0].timestamp if filtered_events else datetime.now()

    for event in page_events:
        _render_event_card(event, session_start)


def _render_export_section(events: List[AgentEvent]) -> None:
    """Render export button directly without double-click workflow."""
    if not events:
        return

    try:
        # Efficient serialization
        # Use model_dump if available (Pydantic v2), else dict
        events_data = []
        for e in events:
            if hasattr(e, "model_dump"):
                events_data.append(e.model_dump(mode="json"))
            elif hasattr(e, "dict"):
                events_data.append(e.dict())
            else:
                events_data.append(str(e))

        json_str = json.dumps(events_data, indent=2, default=str)

        # Size Check
        if len(json_str.encode("utf-8")) > MAX_EXPORT_SIZE_BYTES:
            st.warning(f"Export too large (>10MB). Download disabled.")
            return

        st.download_button(
            label="Download JSON Export",
            data=json_str,
            file_name=f"agent_timeline_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            mime="application/json",
        )
    except Exception as e:
        # Log full error but show generic message to user
        logger.error(f"Export generation failed: {e}")
        st.error("Failed to generate export file.")


def _render_event_card(event: AgentEvent, session_start: datetime) -> None:
    """Render a single event card using st.expander and custom styling."""

    # Robust relative time
    try:
        ts = getattr(event, "timestamp", datetime.now())
        rel_time = ts - session_start
        rel_str = str(rel_time).split(".")[0]  # HH:MM:SS
        if rel_time.days > 0:
            rel_str = f"+{rel_time.days}d {rel_str}"
    except Exception:
        rel_str = "0:00:00"

    # Determine icon and header
    icon = "🔹"
    title = "Event"
    header_suffix = ""

    # Safe attribute access helper
    def safe_get(obj, attr, default=None):
        return getattr(obj, attr, default)

    etype = safe_get(event, "event_type")

    if etype == "tool_call":
        # Narrow type manually
        tool_name = safe_get(event, "tool_name", "unknown")
        success = safe_get(event, "success", False)
        duration = safe_get(event, "duration_ms", 0)

        status_icon = "+" if success else "x"
        icon = "[T]"  # Tool - using ASCII to avoid encoding issues
        title = f"Tool Call: {tool_name}"  # Sanitized below
        if isinstance(duration, (int, float)):
            header_suffix = f"{status_icon} ({duration:.1f}ms)"
        else:
            header_suffix = f"{status_icon}"

    elif etype == "memory_access":
        op_enum = safe_get(event, "operation")
        op = getattr(op_enum, "value", str(op_enum)).upper()
        key = safe_get(event, "key", "unknown")
        sensitive = safe_get(event, "sensitive_detected", False)

        icon = "[M]"  # Memory - using ASCII
        title = f"Memory {op}: {key}"
        header_suffix = "! Sensitive" if sensitive else ""

    elif etype == "action":
        action_type = safe_get(event, "action_type", "unknown")
        icon = "[A]"  # Action - using ASCII
        title = f"Action: {action_type}"

    elif etype == "speech":
        is_response = safe_get(event, "is_response_to_user", True)
        icon = "[S]"  # Speech - using ASCII
        direction = "To User" if is_response else "Internal Monologue"
        title = f"Speech ({direction})"

    elif etype == "divergence":
        severity_enum = safe_get(event, "severity")
        severity = getattr(severity_enum, "value", str(severity_enum))
        icon = "[!]"  # Divergence alert - using ASCII
        title = "DIVERGENCE DETECTED"
        header_suffix = f"Severity: {severity}"

    else:
        title = f"Unknown Event: {etype}"

    # Sanitization for Header
    # st.expander label interprets Markdown. We must escape special characters
    # to prevent injection or broken formatting.
    # We replace markdown special chars with safe versions or escape them.
    # Simple strategy: remove newlines, escape markdown chars.
    # Note: Streamlit markdown support is basic.
    def sanitize_for_header(s: str) -> str:
        # Basic sanitization: strip newlines, escape brackets
        # Also remove surrogate characters that can't be encoded to UTF-8
        sanitized = s.replace("\n", " ").replace("[", "\\[").replace("]", "\\]")
        # Remove surrogate characters (U+D800 to U+DFFF) that cause encoding errors
        return sanitized.encode("utf-8", errors="surrogateescape").decode(
            "utf-8", errors="replace"
        )

    safe_icon = sanitize_for_header(icon)
    safe_title = sanitize_for_header(title)
    safe_suffix = sanitize_for_header(header_suffix)
    expander_label = f"{safe_icon} [{rel_str}] {safe_title} {safe_suffix}"

    with st.expander(expander_label, expanded=(etype == "divergence")):
        _render_event_details(event)


def _render_event_details(event: AgentEvent) -> None:
    """Render details based on event type."""

    ts = getattr(event, "timestamp", datetime.now()).isoformat()
    uid = getattr(event, "id", "unknown")
    st.caption(f"ID: {uid} | Timestamp: {ts}")

    etype = getattr(event, "event_type", None)

    if etype == "tool_call":
        args = getattr(event, "arguments", {})
        st.markdown("**Arguments:**")
        st.code(json.dumps(args, indent=2, default=str), language="json")

        st.markdown("**Result:**")
        result_str = str(getattr(event, "result", ""))
        if len(result_str) > 1000:
            result_str = result_str[:1000] + "... (truncated)"
        st.code(result_str, language="text")

        if not getattr(event, "success", False):
            exc = getattr(event, "exception_type", "Unknown Error")
            st.error(f"Exception: {exc}")

    elif etype == "memory_access":
        op_enum = getattr(event, "operation", None)
        op = getattr(op_enum, "value", str(op_enum))
        st.markdown(f"**Operation:** {op}")

        # Use text for key to be safe
        st.markdown("**Key:**")
        st.text(getattr(event, "key", ""))

        val = getattr(event, "value_preview", None)
        if val:
            st.markdown("**Value Preview:**")
            st.code(val, language="text")

        if getattr(event, "sensitive_detected", False):
            st.warning("Sensitive data pattern detected in memory access.")

    elif etype == "action":
        st.markdown("**Description:**")
        st.text(getattr(event, "description", ""))

        st.markdown("**Target:**")
        st.text(getattr(event, "target", ""))

        related = getattr(event, "related_tool_calls", [])
        if related:
            st.markdown(
                f"**Related Tool Calls:** {', '.join(str(uid) for uid in related)}"
            )

    elif etype == "speech":
        intent = getattr(event, "intent", None)
        if intent:
            st.markdown("**Inferred Intent:**")
            st.text(intent)

        st.markdown("**Content:**")
        content = getattr(event, "content", "")
        st.text(content)

    elif etype == "divergence":
        severity_enum = getattr(event, "severity", None)
        severity = getattr(severity_enum, "value", str(severity_enum))

        st.error(f"Severity: {severity}")

        conf = getattr(event, "confidence_score", 0.0)
        if isinstance(conf, (int, float)):
            st.markdown(f"**Confidence:** {conf:.2f}")

        st.markdown("**Explanation:**")
        st.info(getattr(event, "explanation", ""))

        col_d1, col_d2 = st.columns(2)
        with col_d1:
            st.markdown("**Stated Intent:**")
            st.text(getattr(event, "speech_intent", ""))
        with col_d2:
            st.markdown("**Actual Action:**")
            st.text(getattr(event, "actual_action", ""))
