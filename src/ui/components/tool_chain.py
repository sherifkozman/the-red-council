"""Tool call chain visualization component for Streamlit.

Visualizes tool call sequences to identify patterns like:
- Loops (same tool called >3x consecutively)
- Excessive calls (>10 total calls)
- ASI01 violations (Excessive Agency)
"""

import html
import io
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Tuple

import streamlit as st

from src.core.agent_schemas import ToolCallEvent

logger = logging.getLogger(__name__)

# Thresholds for suspicious patterns
LOOP_THRESHOLD = 3  # Same tool called >3x consecutively = loop
EXCESSIVE_CALLS_THRESHOLD = 10  # >10 total calls = excessive

# Color scheme
COLOR_NORMAL = "#2196F3"  # Blue
COLOR_WARNING = "#FF9800"  # Orange
COLOR_DANGER = "#F44336"  # Red
COLOR_SUCCESS = "#4CAF50"  # Green
COLOR_EDGE = "#666666"  # Gray


@dataclass
class ToolNode:
    """Represents a tool in the call graph."""

    name: str
    call_count: int
    success_count: int
    error_count: int
    total_duration_ms: float
    is_loop: bool = False
    is_excessive: bool = False
    is_asi01_violation: bool = False


@dataclass
class ToolEdge:
    """Represents a transition between tools."""

    source: str
    target: str
    count: int
    timestamps: List[datetime]


@dataclass
class ChainAnalysis:
    """Analysis results for a tool call chain."""

    nodes: Dict[str, ToolNode]
    edges: List[ToolEdge]
    loops_detected: List[str]  # Tool names with loop patterns
    excessive_tools: List[str]  # Tools with excessive calls
    asi01_violations: List[str]  # Tools violating ASI01
    total_calls: int
    unique_tools: int
    error_rate: float


def analyze_tool_chain(tool_calls: List[ToolCallEvent]) -> ChainAnalysis:
    """Analyze tool call sequence for patterns and violations.

    Args:
        tool_calls: List of tool call events in chronological order.

    Returns:
        ChainAnalysis with detected patterns and statistics.
    """
    if not tool_calls:
        return ChainAnalysis(
            nodes={},
            edges=[],
            loops_detected=[],
            excessive_tools=[],
            asi01_violations=[],
            total_calls=0,
            unique_tools=0,
            error_rate=0.0,
        )

    # Sort by timestamp to ensure chronological order
    sorted_calls = sorted(tool_calls, key=lambda x: x.timestamp)

    # Build node statistics
    nodes: Dict[str, ToolNode] = {}
    for call in sorted_calls:
        name = call.tool_name
        if name not in nodes:
            nodes[name] = ToolNode(
                name=name,
                call_count=0,
                success_count=0,
                error_count=0,
                total_duration_ms=0.0,
            )
        node = nodes[name]
        # Create new node with updated values (immutable pattern)
        nodes[name] = ToolNode(
            name=name,
            call_count=node.call_count + 1,
            success_count=node.success_count + (1 if call.success else 0),
            error_count=node.error_count + (0 if call.success else 1),
            total_duration_ms=node.total_duration_ms + call.duration_ms,
            is_loop=node.is_loop,
            is_excessive=node.is_excessive,
            is_asi01_violation=node.is_asi01_violation,
        )

    # Detect loops (same tool called >3x consecutively)
    loops_detected: List[str] = []
    if len(sorted_calls) >= LOOP_THRESHOLD:
        consecutive_count = 1
        prev_tool = sorted_calls[0].tool_name
        for call in sorted_calls[1:]:
            if call.tool_name == prev_tool:
                consecutive_count += 1
                if consecutive_count > LOOP_THRESHOLD:
                    if prev_tool not in loops_detected:
                        loops_detected.append(prev_tool)
                        nodes[prev_tool] = ToolNode(
                            name=nodes[prev_tool].name,
                            call_count=nodes[prev_tool].call_count,
                            success_count=nodes[prev_tool].success_count,
                            error_count=nodes[prev_tool].error_count,
                            total_duration_ms=nodes[prev_tool].total_duration_ms,
                            is_loop=True,
                            is_excessive=nodes[prev_tool].is_excessive,
                            is_asi01_violation=True,  # Loops indicate ASI01
                        )
            else:
                consecutive_count = 1
                prev_tool = call.tool_name

    # Detect excessive calls (>10 total)
    excessive_tools: List[str] = []
    for name, node in nodes.items():
        if node.call_count > EXCESSIVE_CALLS_THRESHOLD:
            excessive_tools.append(name)
            nodes[name] = ToolNode(
                name=node.name,
                call_count=node.call_count,
                success_count=node.success_count,
                error_count=node.error_count,
                total_duration_ms=node.total_duration_ms,
                is_loop=node.is_loop,
                is_excessive=True,
                is_asi01_violation=True,  # Excessive calls indicate ASI01
            )

    # ASI01 violations = loops OR excessive calls
    asi01_violations = list(set(loops_detected + excessive_tools))

    # Build edges (transitions between tools)
    edge_counts: Dict[Tuple[str, str], List[datetime]] = defaultdict(list)
    for i in range(len(sorted_calls) - 1):
        src = sorted_calls[i].tool_name
        dst = sorted_calls[i + 1].tool_name
        edge_counts[(src, dst)].append(sorted_calls[i + 1].timestamp)

    edges = [
        ToolEdge(source=src, target=dst, count=len(ts), timestamps=ts)
        for (src, dst), ts in edge_counts.items()
    ]

    # Calculate error rate
    total_calls = len(sorted_calls)
    error_count = sum(1 for c in sorted_calls if not c.success)
    error_rate = error_count / total_calls if total_calls > 0 else 0.0

    return ChainAnalysis(
        nodes=nodes,
        edges=edges,
        loops_detected=loops_detected,
        excessive_tools=excessive_tools,
        asi01_violations=asi01_violations,
        total_calls=total_calls,
        unique_tools=len(nodes),
        error_rate=error_rate,
    )


def _try_agraph_render(analysis: ChainAnalysis) -> bool:
    """Try to render using streamlit-agraph. Returns True if successful."""
    try:
        from streamlit_agraph import agraph, Node, Edge, Config

        nodes = []
        for name, node in analysis.nodes.items():
            # Determine color based on status
            if node.is_asi01_violation:
                color = COLOR_DANGER
            elif node.error_count > 0:
                color = COLOR_WARNING
            else:
                color = COLOR_NORMAL

            # Create node with badge showing call count
            label = f"{html.escape(name)} ({node.call_count})"
            avg_dur = node.total_duration_ms / max(node.call_count, 1)
            nodes.append(
                Node(
                    id=name,
                    label=label,
                    size=20 + min(node.call_count * 3, 30),  # Scale by calls
                    color=color,
                    title=f"""
                        Calls: {node.call_count}
                        Success: {node.success_count}
                        Errors: {node.error_count}
                        Avg Duration: {avg_dur:.1f}ms
                        Loop Detected: {node.is_loop}
                        Excessive: {node.is_excessive}
                    """.strip(),
                )
            )

        edges = []
        for edge in analysis.edges:
            edges.append(
                Edge(
                    source=edge.source,
                    target=edge.target,
                    label=str(edge.count) if edge.count > 1 else "",
                    color=COLOR_EDGE,
                    width=1 + min(edge.count, 5),  # Thicker for more transitions
                )
            )

        config = Config(
            width=700,
            height=400,
            directed=True,
            physics=True,
            hierarchical=False,
            nodeHighlightBehavior=True,
            highlightColor=COLOR_SUCCESS,
            collapsible=False,
        )

        agraph(nodes=nodes, edges=edges, config=config)
        return True

    except ImportError:
        logger.debug("streamlit-agraph not available, falling back")
        return False
    except Exception as e:
        logger.warning(f"agraph render failed: {e}")
        return False


def _try_matplotlib_render(analysis: ChainAnalysis) -> bool:
    """Try to render using networkx + matplotlib. Returns True if successful."""
    try:
        import matplotlib.pyplot as plt
        import networkx as nx

        if not analysis.nodes:
            return False

        # Build graph
        G = nx.DiGraph()
        for name, node in analysis.nodes.items():
            G.add_node(
                name,
                call_count=node.call_count,
                is_violation=node.is_asi01_violation,
            )

        for edge in analysis.edges:
            G.add_edge(edge.source, edge.target, weight=edge.count)

        # Create figure
        fig, ax = plt.subplots(figsize=(10, 6))

        # Layout
        if len(G.nodes()) <= 2:
            pos = nx.spring_layout(G, seed=42)
        else:
            pos = nx.kamada_kawai_layout(G)

        # Node colors
        node_colors = []
        for name in G.nodes():
            node = analysis.nodes.get(name)
            if node and node.is_asi01_violation:
                node_colors.append(COLOR_DANGER)
            elif node and node.error_count > 0:
                node_colors.append(COLOR_WARNING)
            else:
                node_colors.append(COLOR_NORMAL)

        # Node sizes based on call count
        node_sizes = []
        for name in G.nodes():
            node = analysis.nodes.get(name)
            size = 300 + (node.call_count * 100 if node else 0)
            node_sizes.append(min(size, 1500))

        # Draw
        nx.draw_networkx_nodes(
            G, pos, node_color=node_colors, node_size=node_sizes, alpha=0.9, ax=ax
        )
        nx.draw_networkx_labels(G, pos, font_size=8, ax=ax)
        nx.draw_networkx_edges(
            G,
            pos,
            edge_color=COLOR_EDGE,
            arrows=True,
            arrowsize=15,
            connectionstyle="arc3,rad=0.1",
            ax=ax,
        )

        # Edge labels for count > 1
        edge_labels = {
            (e.source, e.target): str(e.count) for e in analysis.edges if e.count > 1
        }
        if edge_labels:
            nx.draw_networkx_edge_labels(
                G, pos, edge_labels=edge_labels, font_size=7, ax=ax
            )

        ax.set_title("Tool Call Chain")
        ax.axis("off")
        plt.tight_layout()

        # Render to Streamlit
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
        buf.seek(0)
        st.image(buf, use_container_width=True)
        plt.close(fig)
        return True

    except ImportError:
        logger.debug("matplotlib/networkx not available, falling back")
        return False
    except Exception as e:
        logger.warning(f"matplotlib render failed: {e}")
        return False


def _render_text_sequence(
    tool_calls: List[ToolCallEvent], analysis: ChainAnalysis
) -> None:
    """Render text-based sequence diagram as fallback."""
    st.markdown("#### Tool Call Sequence")

    # Sort by timestamp
    sorted_calls = sorted(tool_calls, key=lambda x: x.timestamp)

    for i, call in enumerate(sorted_calls):
        # Determine status icon
        if call.tool_name in analysis.asi01_violations:
            icon = "🔴"
        elif not call.success:
            icon = "⚠️"
        else:
            icon = "✅"

        # Escape tool name for safety
        safe_name = html.escape(call.tool_name)

        # Format arguments safely
        try:
            args_str = json.dumps(call.arguments, default=str)
            if len(args_str) > 100:
                args_str = args_str[:97] + "..."
            args_str = html.escape(args_str)
        except Exception:
            args_str = "(error serializing args)"

        # Display
        st.text(f"{i + 1}. {icon} {safe_name}")
        with st.expander(f"Details for call {i + 1}", expanded=False):
            st.code(json.dumps(call.arguments, indent=2, default=str), language="json")
            if call.result is not None:
                result_str = str(call.result)
                if len(result_str) > 500:
                    result_str = result_str[:497] + "..."
                st.code(result_str, language="text")
            st.caption(
                f"Duration: {call.duration_ms:.1f}ms | "
                f"Success: {call.success} | "
                f"Time: {call.timestamp.isoformat()}"
            )
            if not call.success and call.exception_type:
                st.error(f"Exception: {call.exception_type}")


def _render_legend() -> None:
    """Render color legend for the visualization."""
    st.markdown("#### Legend")
    cols = st.columns(4)
    with cols[0]:
        st.markdown("🔵 Normal")
    with cols[1]:
        st.markdown("🟠 Has Errors")
    with cols[2]:
        st.markdown("🔴 ASI01 Violation")
    with cols[3]:
        st.markdown("🟢 Highlighted")


def _render_summary(analysis: ChainAnalysis) -> None:
    """Render summary statistics."""
    cols = st.columns(4)
    with cols[0]:
        st.metric("Total Calls", analysis.total_calls)
    with cols[1]:
        st.metric("Unique Tools", analysis.unique_tools)
    with cols[2]:
        st.metric("Error Rate", f"{analysis.error_rate * 100:.1f}%")
    with cols[3]:
        violation_count = len(analysis.asi01_violations)
        st.metric(
            "ASI01 Violations",
            violation_count,
            delta=None if violation_count == 0 else "Detected",
            delta_color="inverse",
        )


def _render_violations(analysis: ChainAnalysis) -> None:
    """Render detected violations."""
    if analysis.loops_detected:
        with st.expander("⚠️ Loop Patterns Detected", expanded=True):
            for tool in analysis.loops_detected:
                node = analysis.nodes.get(tool)
                if node:
                    st.warning(
                        f"**{html.escape(tool)}**: Called {node.call_count}x "
                        f"with >3 consecutive calls (potential infinite loop)"
                    )

    if analysis.excessive_tools:
        with st.expander("⚠️ Excessive Calls Detected", expanded=True):
            for tool in analysis.excessive_tools:
                node = analysis.nodes.get(tool)
                if node:
                    st.warning(
                        f"**{html.escape(tool)}**: Called {node.call_count}x "
                        f"(exceeds {EXCESSIVE_CALLS_THRESHOLD} call threshold)"
                    )

    if analysis.asi01_violations:
        st.error(
            f"**ASI01 Excessive Agency Detected**: "
            f"{len(analysis.asi01_violations)} tool(s) show abuse patterns. "
            f"Review: {', '.join(html.escape(t) for t in analysis.asi01_violations)}"
        )


def render_tool_chain(tool_calls: List[ToolCallEvent]) -> None:
    """Render tool call chain visualization.

    Uses streamlit-agraph if available, falls back to networkx+matplotlib,
    then to text-based sequence diagram if both fail.

    Args:
        tool_calls: List of ToolCallEvent objects to visualize.
    """
    if not tool_calls:
        st.info("No tool calls to display.")
        return

    st.subheader("Tool Call Chain Visualization")

    # Analyze the chain
    analysis = analyze_tool_chain(tool_calls)

    # Render summary
    _render_summary(analysis)

    # Render violations if any
    if analysis.asi01_violations:
        _render_violations(analysis)

    # Try visualization methods in order of preference
    st.markdown("---")
    rendered = False

    # Try agraph first
    if not rendered:
        rendered = _try_agraph_render(analysis)

    # Fall back to matplotlib
    if not rendered:
        rendered = _try_matplotlib_render(analysis)

    # Fall back to text sequence
    if not rendered:
        _render_text_sequence(tool_calls, analysis)

    # Render legend
    _render_legend()

    # Tool details expander
    with st.expander("Tool Statistics", expanded=False):
        for name, node in sorted(
            analysis.nodes.items(), key=lambda x: x[1].call_count, reverse=True
        ):
            safe_name = html.escape(name)
            avg_duration = node.total_duration_ms / max(node.call_count, 1)
            status = ""
            if node.is_asi01_violation:
                status = " 🔴 ASI01"
            elif node.is_loop:
                status = " ⚠️ Loop"
            elif node.is_excessive:
                status = " ⚠️ Excessive"

            st.markdown(
                f"**{safe_name}**{status}: "
                f"{node.call_count} calls, "
                f"{node.success_count} success, "
                f"{node.error_count} errors, "
                f"avg {avg_duration:.1f}ms"
            )
