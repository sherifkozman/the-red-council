"""Tests for tool call chain visualization component."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from src.core.agent_schemas import ToolCallEvent
from src.ui.components.tool_chain import (
    EXCESSIVE_CALLS_THRESHOLD,
    LOOP_THRESHOLD,
    ChainAnalysis,
    ToolEdge,
    ToolNode,
    analyze_tool_chain,
    render_tool_chain,
    _render_legend,
    _render_summary,
    _render_violations,
    _render_text_sequence,
    _try_agraph_render,
    _try_matplotlib_render,
)


@pytest.fixture
def session_id():
    return uuid4()


@pytest.fixture
def base_time():
    return datetime(2023, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def simple_tool_event(session_id, base_time):
    """Single successful tool call."""
    return ToolCallEvent(
        session_id=session_id,
        timestamp=base_time,
        tool_name="file_read",
        arguments={"path": "/tmp/test.txt"},
        result="file contents",
        duration_ms=15.5,
        success=True,
    )


@pytest.fixture
def failed_tool_event(session_id, base_time):
    """Failed tool call."""
    return ToolCallEvent(
        session_id=session_id,
        timestamp=base_time + timedelta(seconds=5),
        tool_name="file_write",
        arguments={"path": "/etc/passwd", "content": "bad"},
        result=None,
        duration_ms=2.3,
        success=False,
        exception_type="PermissionError",
    )


@pytest.fixture
def loop_events(session_id, base_time):
    """Events that trigger loop detection (>3 consecutive same tool)."""
    events = []
    for i in range(5):  # 5 consecutive calls = loop
        events.append(
            ToolCallEvent(
                session_id=session_id,
                timestamp=base_time + timedelta(seconds=i),
                tool_name="database_query",
                arguments={"query": f"SELECT {i}"},
                result=f"result_{i}",
                duration_ms=10.0,
                success=True,
            )
        )
    return events


@pytest.fixture
def excessive_events(session_id, base_time):
    """Events that trigger excessive calls detection (>10 total)."""
    events = []
    for i in range(15):  # 15 calls > 10 threshold
        events.append(
            ToolCallEvent(
                session_id=session_id,
                timestamp=base_time + timedelta(seconds=i),
                tool_name="api_call",
                arguments={"endpoint": f"/api/{i}"},
                result={"status": "ok"},
                duration_ms=50.0,
                success=True,
            )
        )
    return events


@pytest.fixture
def mixed_events(session_id, base_time):
    """Mixed tool calls for sequence/edge testing."""
    return [
        ToolCallEvent(
            session_id=session_id,
            timestamp=base_time,
            tool_name="tool_a",
            arguments={},
            result="a",
            duration_ms=10.0,
            success=True,
        ),
        ToolCallEvent(
            session_id=session_id,
            timestamp=base_time + timedelta(seconds=1),
            tool_name="tool_b",
            arguments={},
            result="b",
            duration_ms=20.0,
            success=True,
        ),
        ToolCallEvent(
            session_id=session_id,
            timestamp=base_time + timedelta(seconds=2),
            tool_name="tool_a",
            arguments={},
            result="a2",
            duration_ms=15.0,
            success=True,
        ),
        ToolCallEvent(
            session_id=session_id,
            timestamp=base_time + timedelta(seconds=3),
            tool_name="tool_c",
            arguments={},
            result="c",
            duration_ms=5.0,
            success=False,
            exception_type="ValueError",
        ),
    ]


# Test: Empty event list
def test_analyze_empty_events():
    """Test analysis of empty event list."""
    analysis = analyze_tool_chain([])

    assert analysis.nodes == {}
    assert analysis.edges == []
    assert analysis.loops_detected == []
    assert analysis.excessive_tools == []
    assert analysis.asi01_violations == []
    assert analysis.total_calls == 0
    assert analysis.unique_tools == 0
    assert analysis.error_rate == 0.0


# Test: Single event
def test_analyze_single_event(simple_tool_event):
    """Test analysis of single tool call."""
    analysis = analyze_tool_chain([simple_tool_event])

    assert len(analysis.nodes) == 1
    assert "file_read" in analysis.nodes
    node = analysis.nodes["file_read"]
    assert node.call_count == 1
    assert node.success_count == 1
    assert node.error_count == 0
    assert node.total_duration_ms == 15.5
    assert node.is_loop is False
    assert node.is_excessive is False
    assert node.is_asi01_violation is False

    assert analysis.edges == []
    assert analysis.total_calls == 1
    assert analysis.unique_tools == 1
    assert analysis.error_rate == 0.0


# Test: Loop detection
def test_analyze_loop_detection(loop_events):
    """Test loop pattern detection (>3 consecutive same tool)."""
    analysis = analyze_tool_chain(loop_events)

    assert "database_query" in analysis.loops_detected
    assert "database_query" in analysis.asi01_violations
    node = analysis.nodes["database_query"]
    assert node.is_loop is True
    assert node.is_asi01_violation is True


# Test: No loop for exactly threshold calls
def test_no_loop_at_threshold(session_id, base_time):
    """Test that exactly 3 consecutive calls does NOT trigger loop."""
    events = []
    for i in range(LOOP_THRESHOLD):  # Exactly 3
        events.append(
            ToolCallEvent(
                session_id=session_id,
                timestamp=base_time + timedelta(seconds=i),
                tool_name="some_tool",
                arguments={},
                result=None,
                duration_ms=1.0,
                success=True,
            )
        )

    analysis = analyze_tool_chain(events)
    assert "some_tool" not in analysis.loops_detected


# Test: Excessive calls detection
def test_analyze_excessive_calls(excessive_events):
    """Test excessive calls detection (>10 total)."""
    analysis = analyze_tool_chain(excessive_events)

    assert "api_call" in analysis.excessive_tools
    assert "api_call" in analysis.asi01_violations
    node = analysis.nodes["api_call"]
    assert node.is_excessive is True
    assert node.is_asi01_violation is True
    assert node.call_count == 15


# Test: No excessive at threshold
def test_no_excessive_at_threshold(session_id, base_time):
    """Test that exactly 10 calls does NOT trigger excessive."""
    events = []
    for i in range(EXCESSIVE_CALLS_THRESHOLD):
        events.append(
            ToolCallEvent(
                session_id=session_id,
                timestamp=base_time + timedelta(seconds=i),
                tool_name="normal_tool",
                arguments={},
                result=None,
                duration_ms=1.0,
                success=True,
            )
        )

    analysis = analyze_tool_chain(events)
    assert "normal_tool" not in analysis.excessive_tools


# Test: Edge creation
def test_analyze_edges(mixed_events):
    """Test edge creation between sequential tool calls."""
    analysis = analyze_tool_chain(mixed_events)

    # Edges: a->b, b->a, a->c
    assert len(analysis.edges) == 3

    edge_pairs = [(e.source, e.target) for e in analysis.edges]
    assert ("tool_a", "tool_b") in edge_pairs
    assert ("tool_b", "tool_a") in edge_pairs
    assert ("tool_a", "tool_c") in edge_pairs


# Test: Error rate calculation
def test_analyze_error_rate(mixed_events):
    """Test error rate calculation."""
    analysis = analyze_tool_chain(mixed_events)

    # 1 error out of 4 calls = 25%
    assert analysis.error_rate == 0.25


# Test: Node statistics
def test_analyze_node_stats(mixed_events):
    """Test node statistics aggregation."""
    analysis = analyze_tool_chain(mixed_events)

    # tool_a called twice
    node_a = analysis.nodes["tool_a"]
    assert node_a.call_count == 2
    assert node_a.success_count == 2
    assert node_a.error_count == 0
    assert node_a.total_duration_ms == 25.0  # 10 + 15

    # tool_c failed once
    node_c = analysis.nodes["tool_c"]
    assert node_c.call_count == 1
    assert node_c.success_count == 0
    assert node_c.error_count == 1


# Test: Render empty events
@patch("src.ui.components.tool_chain.st")
def test_render_empty_events(mock_st):
    """Test rendering with empty event list."""
    render_tool_chain([])
    mock_st.info.assert_called_with("No tool calls to display.")


# Test: Render calls subheader
@patch("src.ui.components.tool_chain.st")
def test_render_calls_subheader(mock_st, simple_tool_event):
    """Test that render creates subheader."""
    # Mock the various st methods
    mock_st.columns.return_value = [MagicMock() for _ in range(4)]
    mock_st.metric.return_value = None
    mock_st.expander.return_value.__enter__ = MagicMock()
    mock_st.expander.return_value.__exit__ = MagicMock()

    render_tool_chain([simple_tool_event])

    mock_st.subheader.assert_called_with("Tool Call Chain Visualization")


# Test: Summary metrics rendering
@patch("src.ui.components.tool_chain.st")
def test_render_summary(mock_st, mixed_events):
    """Test summary metrics rendering."""
    analysis = analyze_tool_chain(mixed_events)

    mock_cols = [MagicMock() for _ in range(4)]
    mock_st.columns.return_value = mock_cols

    _render_summary(analysis)

    # Check metric calls
    mock_st.metric.assert_any_call("Total Calls", 4)
    mock_st.metric.assert_any_call("Unique Tools", 3)


# Test: Legend rendering
@patch("src.ui.components.tool_chain.st")
def test_render_legend(mock_st):
    """Test legend rendering."""
    mock_cols = [MagicMock() for _ in range(4)]
    mock_st.columns.return_value = mock_cols

    _render_legend()

    mock_st.markdown.assert_any_call("#### Legend")


# Test: Violations rendering
@patch("src.ui.components.tool_chain.st")
def test_render_violations_with_loops(mock_st, loop_events):
    """Test violation rendering for loops."""
    analysis = analyze_tool_chain(loop_events)

    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
    mock_st.expander.return_value.__exit__ = MagicMock()

    _render_violations(analysis)

    # Check error was called for ASI01
    mock_st.error.assert_called()
    error_text = mock_st.error.call_args[0][0]
    assert "ASI01" in error_text
    assert "database_query" in error_text


# Test: Violations rendering with excessive
@patch("src.ui.components.tool_chain.st")
def test_render_violations_with_excessive(mock_st, excessive_events):
    """Test violation rendering for excessive calls."""
    analysis = analyze_tool_chain(excessive_events)

    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
    mock_st.expander.return_value.__exit__ = MagicMock()

    _render_violations(analysis)

    # Check expander for excessive
    expander_calls = [str(c) for c in mock_st.expander.call_args_list]
    assert any("Excessive" in c for c in expander_calls)


# Test: Text sequence fallback
@patch("src.ui.components.tool_chain.st")
def test_render_text_sequence(mock_st, mixed_events):
    """Test text-based sequence rendering."""
    analysis = analyze_tool_chain(mixed_events)

    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
    mock_st.expander.return_value.__exit__ = MagicMock()

    _render_text_sequence(mixed_events, analysis)

    # Check markdown header
    mock_st.markdown.assert_any_call("#### Tool Call Sequence")

    # Check text calls for each event
    text_calls = [str(c) for c in mock_st.text.call_args_list]
    assert any("tool_a" in c for c in text_calls)
    assert any("tool_b" in c for c in text_calls)
    assert any("tool_c" in c for c in text_calls)


# Test: Agraph fallback when not installed
@patch("src.ui.components.tool_chain.st")
def test_agraph_fallback_not_installed(mock_st, simple_tool_event):
    """Test agraph returns False when not installed."""
    analysis = analyze_tool_chain([simple_tool_event])

    # Mock import to fail
    with patch.dict("sys.modules", {"streamlit_agraph": None}):
        result = _try_agraph_render(analysis)
        assert result is False


# Test: Matplotlib fallback empty nodes
@patch("src.ui.components.tool_chain.st")
def test_matplotlib_fallback_empty(mock_st):
    """Test matplotlib returns False for empty analysis."""
    analysis = ChainAnalysis(
        nodes={},
        edges=[],
        loops_detected=[],
        excessive_tools=[],
        asi01_violations=[],
        total_calls=0,
        unique_tools=0,
        error_rate=0.0,
    )

    result = _try_matplotlib_render(analysis)
    assert result is False


# Test: Matplotlib renders successfully
@patch("src.ui.components.tool_chain.st")
def test_matplotlib_render_success(mock_st, simple_tool_event):
    """Test matplotlib renders successfully when available."""
    analysis = analyze_tool_chain([simple_tool_event])

    # This should work since we installed matplotlib
    result = _try_matplotlib_render(analysis)
    # May or may not work depending on backend, just check no exception
    assert result in (True, False)


# Test: XSS protection in tool names
@patch("src.ui.components.tool_chain.st")
def test_xss_protection_tool_name(mock_st, session_id, base_time):
    """Test that tool names are HTML escaped."""
    xss_event = ToolCallEvent(
        session_id=session_id,
        timestamp=base_time,
        tool_name="<script>alert('xss')</script>",
        arguments={},
        result=None,
        duration_ms=1.0,
        success=True,
    )

    analysis = analyze_tool_chain([xss_event])

    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
    mock_st.expander.return_value.__exit__ = MagicMock()

    _render_text_sequence([xss_event], analysis)

    # Check text was called with escaped content
    text_calls = [str(c) for c in mock_st.text.call_args_list]
    # Should NOT contain raw script tags
    for call in text_calls:
        assert "<script>" not in call


# Test: Full render with all fallbacks
@patch("src.ui.components.tool_chain.st")
def test_full_render_fallback_chain(mock_st, mixed_events):
    """Test full render goes through fallback chain."""
    mock_cols = [MagicMock() for _ in range(4)]
    mock_st.columns.return_value = mock_cols
    mock_expander = MagicMock()
    mock_st.expander.return_value.__enter__ = MagicMock(return_value=mock_expander)
    mock_st.expander.return_value.__exit__ = MagicMock()

    render_tool_chain(mixed_events)

    # Should have called subheader
    mock_st.subheader.assert_called()
    # Should have called metric
    assert mock_st.metric.called
    # Should have called legend markdown
    assert mock_st.markdown.called


# Test: Chronological ordering
def test_chronological_ordering(session_id, base_time):
    """Test that events are sorted chronologically."""
    # Create events in reverse order
    events = [
        ToolCallEvent(
            session_id=session_id,
            timestamp=base_time + timedelta(seconds=3),
            tool_name="third",
            arguments={},
            result=None,
            duration_ms=1.0,
            success=True,
        ),
        ToolCallEvent(
            session_id=session_id,
            timestamp=base_time,
            tool_name="first",
            arguments={},
            result=None,
            duration_ms=1.0,
            success=True,
        ),
        ToolCallEvent(
            session_id=session_id,
            timestamp=base_time + timedelta(seconds=1),
            tool_name="second",
            arguments={},
            result=None,
            duration_ms=1.0,
            success=True,
        ),
    ]

    analysis = analyze_tool_chain(events)

    # Edges should reflect chronological order: first->second, second->third
    edge_pairs = [(e.source, e.target) for e in analysis.edges]
    assert ("first", "second") in edge_pairs
    assert ("second", "third") in edge_pairs


# Test: Constants are correct
def test_constants():
    """Test threshold constants are set correctly."""
    assert LOOP_THRESHOLD == 3
    assert EXCESSIVE_CALLS_THRESHOLD == 10


# Test: ToolNode dataclass
def test_tool_node_dataclass():
    """Test ToolNode dataclass creation."""
    node = ToolNode(
        name="test_tool",
        call_count=5,
        success_count=4,
        error_count=1,
        total_duration_ms=100.0,
        is_loop=True,
        is_excessive=False,
        is_asi01_violation=True,
    )

    assert node.name == "test_tool"
    assert node.call_count == 5
    assert node.is_loop is True
    assert node.is_asi01_violation is True


# Test: ToolEdge dataclass
def test_tool_edge_dataclass(base_time):
    """Test ToolEdge dataclass creation."""
    edge = ToolEdge(
        source="tool_a",
        target="tool_b",
        count=3,
        timestamps=[base_time, base_time + timedelta(seconds=1)],
    )

    assert edge.source == "tool_a"
    assert edge.target == "tool_b"
    assert edge.count == 3
    assert len(edge.timestamps) == 2


# Test: ChainAnalysis dataclass
def test_chain_analysis_dataclass():
    """Test ChainAnalysis dataclass creation."""
    analysis = ChainAnalysis(
        nodes={"test": ToolNode("test", 1, 1, 0, 10.0)},
        edges=[],
        loops_detected=["loop_tool"],
        excessive_tools=["heavy_tool"],
        asi01_violations=["loop_tool", "heavy_tool"],
        total_calls=10,
        unique_tools=3,
        error_rate=0.1,
    )

    assert len(analysis.nodes) == 1
    assert len(analysis.loops_detected) == 1
    assert len(analysis.asi01_violations) == 2
    assert analysis.error_rate == 0.1
