# src/ui/components/event_stream.py
"""
Real-time event streaming display component for SDK mode.

Displays events as they arrive from instrumented agents, with controls
for auto-scroll, pause/resume, and connection status indicators.
"""

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

import streamlit as st

from src.core.agent_schemas import AgentEvent

logger = logging.getLogger(__name__)

# Session state keys
EVENT_STREAM_KEY = "event_stream_state"
STREAM_EVENTS_KEY = "stream_events"
STREAM_PAUSED_KEY = "stream_paused"
STREAM_AUTO_SCROLL_KEY = "stream_auto_scroll"
STREAM_LAST_UPDATE_KEY = "stream_last_update"
STREAM_EVENT_RATE_KEY = "stream_event_rate"
STREAM_BUFFER_KEY = "stream_buffer"
STREAM_NEW_COUNT_KEY = "stream_new_event_count"

# Constants
MAX_DISPLAYED_EVENTS = 200
MAX_BUFFER_SIZE = 500
RATE_WINDOW_SECONDS = 5.0
CONNECTION_TIMEOUT_SECONDS = 30.0


class ConnectionStatus(str, Enum):
    """Connection status for the event stream."""

    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    ERROR = "error"


@dataclass
class EventStreamState:
    """State container for the event stream display."""

    events: list[dict[str, Any]] = field(default_factory=list)
    paused: bool = False
    auto_scroll: bool = True
    last_update: float = 0.0
    event_rate: float = 0.0
    buffer_count: int = 0
    new_event_count: int = 0
    connection_status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    rate_timestamps: list[float] = field(default_factory=list)


def get_stream_state() -> EventStreamState:
    """Get or create the event stream state from session."""
    if EVENT_STREAM_KEY not in st.session_state:
        st.session_state[EVENT_STREAM_KEY] = EventStreamState()
    state = st.session_state[EVENT_STREAM_KEY]
    if not isinstance(state, EventStreamState):
        st.session_state[EVENT_STREAM_KEY] = EventStreamState()
        new_state: EventStreamState = st.session_state[EVENT_STREAM_KEY]
        return new_state
    return state


def save_stream_state(state: EventStreamState) -> None:
    """Save the event stream state to session."""
    st.session_state[EVENT_STREAM_KEY] = state


def clear_stream_state() -> None:
    """Clear all stream state."""
    st.session_state[EVENT_STREAM_KEY] = EventStreamState()


def _calculate_event_rate(state: EventStreamState) -> float:
    """Calculate events per second based on recent timestamps.

    Args:
        state: Current stream state.

    Returns:
        Events per second rate.
    """
    now = time.time()
    # Filter timestamps within rate window
    recent = [t for t in state.rate_timestamps if now - t <= RATE_WINDOW_SECONDS]
    state.rate_timestamps = recent

    if len(recent) < 2:
        return 0.0

    # Calculate rate over the window
    time_span = recent[-1] - recent[0]
    if time_span <= 0:
        return 0.0

    return (len(recent) - 1) / time_span


def _get_connection_status(state: EventStreamState) -> ConnectionStatus:
    """Determine connection status based on last update time.

    Args:
        state: Current stream state.

    Returns:
        Current connection status.
    """
    if state.last_update == 0.0:
        return ConnectionStatus.DISCONNECTED

    elapsed = time.time() - state.last_update
    if elapsed > CONNECTION_TIMEOUT_SECONDS:
        return ConnectionStatus.DISCONNECTED
    elif elapsed > CONNECTION_TIMEOUT_SECONDS / 2:
        return ConnectionStatus.CONNECTING  # Stale, may be reconnecting
    else:
        return ConnectionStatus.CONNECTED


def add_events(events: list[AgentEvent]) -> int:
    """Add new events to the stream.

    Args:
        events: List of AgentEvent objects to add.

    Returns:
        Number of events added.
    """
    if not events:
        return 0

    state = get_stream_state()

    # If paused, count skipped events (not actually buffered)
    if state.paused:
        state.buffer_count += len(events)
        # Still track timestamps for rate calculation
        now = time.time()
        state.rate_timestamps.extend([now] * len(events))
        # Trim rate timestamps even when paused to prevent memory growth
        if len(state.rate_timestamps) > MAX_BUFFER_SIZE:
            state.rate_timestamps = state.rate_timestamps[-MAX_BUFFER_SIZE:]
        state.last_update = now
        save_stream_state(state)
        return 0

    added_count = 0
    now = time.time()

    for event in events:
        # Convert AgentEvent to dict for serialization
        try:
            if hasattr(event, "model_dump"):
                event_dict = event.model_dump(mode="json")
            elif hasattr(event, "keys"):  # dict-like object
                event_dict = dict(event)
            else:
                logger.warning(f"Unknown event type: {type(event).__name__}")
                continue
        except Exception as e:
            logger.warning(f"Failed to serialize event: {e}")
            continue

        state.events.append(event_dict)
        state.rate_timestamps.append(now)
        added_count += 1

    # Trim to max size
    if len(state.events) > MAX_DISPLAYED_EVENTS:
        state.events = state.events[-MAX_DISPLAYED_EVENTS:]

    # Trim rate timestamps
    if len(state.rate_timestamps) > MAX_BUFFER_SIZE:
        state.rate_timestamps = state.rate_timestamps[-MAX_BUFFER_SIZE:]

    state.last_update = now
    state.new_event_count += added_count
    state.event_rate = _calculate_event_rate(state)
    state.connection_status = ConnectionStatus.CONNECTED

    save_stream_state(state)
    return added_count


def add_events_from_dicts(events: list[dict[str, Any]]) -> int:
    """Add events from dictionary format.

    Args:
        events: List of event dictionaries.

    Returns:
        Number of events added.
    """
    if not events:
        return 0

    state = get_stream_state()

    if state.paused:
        state.buffer_count += len(events)
        now = time.time()
        state.rate_timestamps.extend([now] * len(events))
        # Trim rate timestamps even when paused to prevent memory growth
        if len(state.rate_timestamps) > MAX_BUFFER_SIZE:
            state.rate_timestamps = state.rate_timestamps[-MAX_BUFFER_SIZE:]
        state.last_update = now
        save_stream_state(state)
        return 0

    added_count = 0
    now = time.time()

    for event_dict in events:
        if not isinstance(event_dict, dict):
            logger.warning(f"Skipping non-dict event: {type(event_dict)}")
            continue

        state.events.append(event_dict)
        state.rate_timestamps.append(now)
        added_count += 1

    # Trim to max size
    if len(state.events) > MAX_DISPLAYED_EVENTS:
        state.events = state.events[-MAX_DISPLAYED_EVENTS:]

    if len(state.rate_timestamps) > MAX_BUFFER_SIZE:
        state.rate_timestamps = state.rate_timestamps[-MAX_BUFFER_SIZE:]

    state.last_update = now
    state.new_event_count += added_count
    state.event_rate = _calculate_event_rate(state)
    state.connection_status = ConnectionStatus.CONNECTED

    save_stream_state(state)
    return added_count


def pause_stream() -> None:
    """Pause the event stream (new events go to buffer)."""
    state = get_stream_state()
    state.paused = True
    save_stream_state(state)


def resume_stream() -> None:
    """Resume the event stream and flush buffer."""
    state = get_stream_state()
    state.paused = False
    state.buffer_count = 0  # Clear buffer count after resume
    save_stream_state(state)


def toggle_auto_scroll() -> None:
    """Toggle auto-scroll setting."""
    state = get_stream_state()
    state.auto_scroll = not state.auto_scroll
    save_stream_state(state)


def clear_new_event_indicator() -> None:
    """Clear the new event count indicator."""
    state = get_stream_state()
    state.new_event_count = 0
    save_stream_state(state)


def get_event_count() -> int:
    """Get the current number of events in the stream."""
    state = get_stream_state()
    return len(state.events)


def get_new_event_count() -> int:
    """Get the count of new events since last check."""
    state = get_stream_state()
    return state.new_event_count


def is_paused() -> bool:
    """Check if the stream is paused."""
    state = get_stream_state()
    return state.paused


def get_buffer_count() -> int:
    """Get the number of events in buffer (while paused)."""
    state = get_stream_state()
    return state.buffer_count


def get_event_rate() -> float:
    """Get the current events per second rate."""
    state = get_stream_state()
    return state.event_rate


def get_connection_status() -> ConnectionStatus:
    """Get the current connection status."""
    state = get_stream_state()
    return _get_connection_status(state)


def _render_connection_indicator(status: ConnectionStatus) -> None:
    """Render connection status indicator.

    Args:
        status: Current connection status.
    """
    status_config = {
        ConnectionStatus.CONNECTED: ("🟢", "Connected", "success"),
        ConnectionStatus.CONNECTING: ("🟡", "Connecting...", "warning"),
        ConnectionStatus.DISCONNECTED: ("🔴", "Disconnected", "error"),
        ConnectionStatus.ERROR: ("⚠️", "Error", "error"),
    }

    icon, label, _ = status_config.get(status, ("❓", "Unknown", "info"))

    st.markdown(f"**Status:** {icon} {label}")


def _render_metrics(state: EventStreamState) -> None:
    """Render stream metrics.

    Args:
        state: Current stream state.
    """
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Total Events", len(state.events))

    with col2:
        rate_display = f"{state.event_rate:.1f}/s"
        st.metric("Event Rate", rate_display)

    with col3:
        if state.paused and state.buffer_count > 0:
            st.metric("Buffered", state.buffer_count, delta=state.buffer_count)
        else:
            st.metric("Buffered", 0)

    with col4:
        if state.new_event_count > 0:
            st.metric("New Events", state.new_event_count, delta=state.new_event_count)
        else:
            st.metric("New Events", 0)


def _render_controls(state: EventStreamState) -> None:
    """Render stream controls.

    Args:
        state: Current stream state.
    """
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        if state.paused:
            if st.button("▶️ Resume", key="stream_resume_btn"):
                resume_stream()
                st.rerun()
        else:
            if st.button("⏸️ Pause", key="stream_pause_btn"):
                pause_stream()
                st.rerun()

    with col2:
        auto_scroll_label = "✅ Auto-scroll" if state.auto_scroll else "⬜ Auto-scroll"
        if st.button(auto_scroll_label, key="stream_autoscroll_btn"):
            toggle_auto_scroll()
            st.rerun()

    with col3:
        if st.button("🗑️ Clear Events", key="stream_clear_btn"):
            clear_stream_state()
            st.rerun()

    with col4:
        if state.new_event_count > 0:
            if st.button(
                f"✓ Mark Read ({state.new_event_count})", key="stream_mark_read_btn"
            ):
                clear_new_event_indicator()
                st.rerun()


def _render_event_list(state: EventStreamState) -> None:
    """Render the list of events.

    Args:
        state: Current stream state.
    """
    if not state.events:
        st.info(
            "No events received yet. "
            "Connect your instrumented agent to see events here."
        )
        return

    # Reverse for most recent first if auto-scroll is on
    events_to_show = state.events[::-1] if state.auto_scroll else state.events

    # Show event count
    st.caption(f"Showing {len(events_to_show)} events (most recent first)")

    # Render events in a container for scrolling
    with st.container():
        for i, event in enumerate(events_to_show[:50]):  # Limit display for performance
            event_type = event.get("event_type", "unknown")
            timestamp = event.get("timestamp", "")

            # Format timestamp if present
            if timestamp:
                try:
                    if isinstance(timestamp, str):
                        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                        timestamp_str = dt.strftime("%H:%M:%S.%f")[:-3]
                    else:
                        timestamp_str = str(timestamp)
                except Exception:
                    timestamp_str = str(timestamp)
            else:
                timestamp_str = "N/A"

            # Event type icons
            type_icons = {
                "tool_call": "🔧",
                "memory_access": "💾",
                "action": "⚡",
                "speech": "💬",
                "divergence": "⚠️",
            }
            icon = type_icons.get(event_type, "📋")

            # Create expandable event card
            with st.expander(
                f"{icon} [{timestamp_str}] {event_type}",
                expanded=(i == 0 and state.auto_scroll),
            ):
                # Show key details based on event type
                if event_type == "tool_call":
                    st.text(f"Tool: {event.get('tool_name', 'unknown')}")
                    if event.get("arguments"):
                        st.json(event["arguments"])
                    if event.get("result"):
                        st.text(f"Result: {str(event['result'])[:200]}")
                elif event_type == "memory_access":
                    op = event.get("operation", "unknown")
                    key = event.get("key", "unknown")
                    st.text(f"Operation: {op} | Key: {key}")
                elif event_type == "speech":
                    content = event.get("content", "")
                    st.text(f"Content: {content[:300]}")
                elif event_type == "action":
                    action_type = event.get("action_type", "unknown")
                    description = event.get("description", "")
                    st.text(f"Type: {action_type}")
                    st.text(f"Description: {description[:200]}")
                elif event_type == "divergence":
                    severity = event.get("severity", "unknown")
                    st.warning(f"Severity: {severity}")
                    st.text(f"Speech: {event.get('speech_intent', '')[:100]}")
                    st.text(f"Action: {event.get('actual_action', '')[:100]}")
                else:
                    st.json(event)


def render_event_stream() -> None:
    """Render the complete event stream component."""
    st.subheader("Real-time Event Stream")

    state = get_stream_state()

    # Update connection status
    state.connection_status = _get_connection_status(state)

    # Connection indicator
    _render_connection_indicator(state.connection_status)

    st.divider()

    # Metrics row
    _render_metrics(state)

    st.divider()

    # Controls row
    _render_controls(state)

    st.divider()

    # Paused indicator
    if state.paused:
        st.warning(
            f"⏸️ Stream paused. {state.buffer_count} events skipped. "
            "Click Resume to continue receiving events."
        )

    # Event list
    _render_event_list(state)


# Public API for external use
__all__ = [
    "ConnectionStatus",
    "EventStreamState",
    "add_events",
    "add_events_from_dicts",
    "clear_new_event_indicator",
    "clear_stream_state",
    "get_buffer_count",
    "get_connection_status",
    "get_event_count",
    "get_event_rate",
    "get_new_event_count",
    "get_stream_state",
    "is_paused",
    "pause_stream",
    "render_event_stream",
    "resume_stream",
    "save_stream_state",
    "toggle_auto_scroll",
]
