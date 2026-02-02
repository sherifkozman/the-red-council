import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Mock streamlit before importing dashboard
mock_st = MagicMock()
sys.modules["streamlit"] = mock_st
sys.modules["streamlit.components"] = MagicMock()
sys.modules["streamlit.components.v1"] = MagicMock()
if "src.ui.dashboard" in sys.modules:
    del sys.modules["src.ui.dashboard"]

# Mock other dependencies that might cause issues
sys.modules["src.core.security"] = MagicMock()
sys.modules["src.ui.components.chat"] = MagicMock()
sys.modules["src.ui.components.header"] = MagicMock()
sys.modules["src.ui.components.metrics"] = MagicMock()
sys.modules["src.ui.components.mode_selector"] = MagicMock()
sys.modules["src.ui.providers.polling"] = MagicMock()
sys.modules["src.ui.components.demo_loader"] = MagicMock()  # Mock the new dependency
sys.modules["src.ui.components.sdk_connection"] = MagicMock()  # Mock SDK connection
sys.modules["src.ui.components.remote_agent_config"] = MagicMock()  # Mock remote config
sys.modules["src.ui.components.attack_selector"] = MagicMock()  # Mock attack selector
sys.modules["src.ui.components.campaign_runner"] = MagicMock()  # Mock campaign runner
sys.modules["src.ui.components.event_stream"] = MagicMock()  # Mock event stream

from src.ui.dashboard import (  # noqa: E402
    AGENT_EVENTS_KEY,
    AGENT_SCORE_KEY,
    main,
    render_agent_mode,
    run_agent_evaluation,
)


@pytest.fixture
def mock_session_state():
    class SessionState(dict):
        def __getattr__(self, key):
            try:
                return self[key]
            except KeyError:
                raise AttributeError(key) from None

        def __setattr__(self, key, value):
            self[key] = value

    state = SessionState()
    mock_st.session_state = state
    mock_st.get = state.get  # helper
    sys.modules["src.ui.components.event_stream"] = MagicMock()
    sys.modules["src.ui.components.remote_agent_config"] = MagicMock()
    sys.modules["src.ui.components.campaign_runner"] = MagicMock()
    return state


@pytest.mark.asyncio
async def test_run_agent_evaluation_no_events(mock_session_state):
    """Test evaluation aborts when no events are present."""
    mock_session_state[AGENT_EVENTS_KEY] = []

    await run_agent_evaluation()

    mock_st.warning.assert_called_with("No events to evaluate.")
    assert (
        AGENT_SCORE_KEY not in mock_session_state
        or mock_session_state[AGENT_SCORE_KEY] is None
    )


@pytest.mark.asyncio
async def test_run_agent_evaluation_success(mock_session_state):
    """Test successful evaluation flow."""
    mock_events = [MagicMock(event_type="tool_call")]
    mock_session_state[AGENT_EVENTS_KEY] = mock_events

    mock_score = MagicMock()

    # Mock dependencies
    with (
        patch("src.ui.dashboard.GeminiClient") as MockClient,
        patch("src.ui.dashboard.JudgeAgent") as MockJudgeAgent,
        patch("src.ui.dashboard.AgentJudge") as MockAgentJudge,
        patch("src.ui.dashboard.AgentJudgeConfig"),
    ):
        # Setup async mock for evaluate_agent_async
        mock_agent_judge_instance = MockAgentJudge.return_value
        mock_agent_judge_instance.evaluate_agent_async = AsyncMock(
            return_value=mock_score
        )

        await run_agent_evaluation()

        # Verify calls
        MockClient.assert_called_once()
        MockJudgeAgent.assert_called_once()
        MockAgentJudge.assert_called_once()
        mock_agent_judge_instance.evaluate_agent_async.assert_called_once_with(
            mock_events
        )

        # Verify result stored
        assert mock_session_state[AGENT_SCORE_KEY] == mock_score
        mock_st.success.assert_called_with("Evaluation complete!")


async def test_run_agent_evaluation_failure(mock_session_state):
    """Test evaluation failure handling."""
    mock_events = [MagicMock()]
    mock_session_state[AGENT_EVENTS_KEY] = mock_events

    with patch("src.ui.dashboard.GeminiClient") as MockClient:
        MockClient.side_effect = Exception("Connection error")

        await run_agent_evaluation()

        # Updated expectation to match actual error handling in dashboard.py
        mock_st.error.assert_called_with(
            "Failed to initialize Gemini Client. Check API credentials."
        )
        assert (
            AGENT_SCORE_KEY not in mock_session_state
            or mock_session_state[AGENT_SCORE_KEY] is None
        )


def test_render_agent_mode(mock_session_state):
    """Test rendering of agent mode UI and button interactions."""
    # Setup tabs return value (mocking st.tabs) - 9 tabs including Event Stream
    mock_st.tabs.return_value = [
        MagicMock(),
        MagicMock(),
        MagicMock(),
        MagicMock(),
        MagicMock(),
        MagicMock(),
        MagicMock(),
        MagicMock(),
        MagicMock(),
    ]

    # Mock st.columns to return different lengths based on input
    def columns_side_effect(spec, **kwargs):
        if isinstance(spec, int):
            return [MagicMock() for _ in range(spec)]
        if isinstance(spec, list) and len(spec) == 2:
            return [MagicMock(), MagicMock()]
        return [MagicMock(), MagicMock(), MagicMock()]  # Default to 3

    mock_st.columns.side_effect = columns_side_effect

    # Mock button to return True for Run Evaluation
    def button_side_effect(label, **_kwargs):
        if label == "Run Evaluation":
            return True
        return False

    mock_st.button.side_effect = button_side_effect

    def _close_coro(coro):
        coro.close()

    with (
        patch("src.ui.dashboard.safe_run_async", side_effect=_close_coro) as mock_run_async,
        patch("src.ui.dashboard.render_demo_loader"),
        patch("src.ui.dashboard.render_session_manager"),
    ):  # Mock new component
        render_agent_mode()

        # Verify headers and sections
        mock_st.header.assert_called_with("Agent Security Testing")
        mock_st.subheader.assert_any_call("Agent Behavior Timeline")
        mock_st.subheader.assert_any_call("Tool Call Chain")
        mock_st.subheader.assert_any_call("OWASP Agentic Coverage")

        # Verify button triggered evaluation
        mock_st.button.assert_any_call(
            "Run Evaluation",
            key="run_eval_btn",
            disabled=True,  # default events empty
            help="Run OWASP evaluation on captured events",
        )

        # Verify run_agent_evaluation was called
        mock_run_async.assert_called_once()

        # Verify rerun called
        mock_st.rerun.assert_called()


def test_render_agent_mode_with_events(mock_session_state):
    """Test rendering when events exist."""
    mock_events = [
        MagicMock(event_type="tool_call"),
        MagicMock(event_type="memory_access"),
    ]
    mock_session_state[AGENT_EVENTS_KEY] = mock_events
    mock_session_state[AGENT_SCORE_KEY] = MagicMock()
    mock_st.button.side_effect = None
    mock_st.button.return_value = False

    # Setup tabs - 9 tabs including Event Stream
    tabs = [MagicMock() for _ in range(9)]
    mock_st.tabs.return_value = tabs
    for t in tabs:
        t.__enter__.return_value = t
        t.__exit__.return_value = None

    # Mock st.columns
    def columns_side_effect(spec, **kwargs):
        if isinstance(spec, int):
            return [MagicMock() for _ in range(spec)]
        if isinstance(spec, list) and len(spec) == 2:
            return [MagicMock(), MagicMock()]
        return [MagicMock(), MagicMock(), MagicMock()]

    mock_st.columns.side_effect = columns_side_effect

    # Run
    with (
        patch("src.ui.dashboard.render_agent_config_panel"),
        patch("src.ui.dashboard.render_tool_registration_form"),
        patch("src.ui.dashboard.render_memory_config"),
        patch("src.ui.dashboard.render_demo_loader"),
        patch("src.ui.dashboard.render_session_manager"),
        patch(
            "src.ui.components.agent_timeline.render_agent_timeline"
        ) as mock_timeline,
        patch("src.ui.components.tool_chain.render_tool_chain") as mock_tool_chain,
        patch(
            "src.ui.components.owasp_coverage.render_owasp_coverage"
        ) as mock_coverage,
    ):
        # Tabs are context managers; MagicMock.__enter__ returns self,
        # so code inside with blocks executes with our mocks.
        render_agent_mode()

        mock_timeline.assert_called_once()
        mock_tool_chain.assert_called_once()
        mock_coverage.assert_called_once()

        # Check raw events rendering (tab 4)
        # st.expander is called for each event
        assert mock_st.expander.call_count >= len(mock_events)


def test_clear_events(mock_session_state):
    """Test Clear Events button."""
    mock_session_state[AGENT_EVENTS_KEY] = ["event1"]
    mock_session_state[AGENT_SCORE_KEY] = "score"

    # Mock button side effect
    def button_side_effect(label, **_kwargs):
        if label == "Clear Events":
            return True
        return False

    mock_st.button.side_effect = button_side_effect

    # Mock tabs/columns - 9 tabs including Event Stream
    mock_st.tabs.return_value = [MagicMock()] * 9
    def columns_side_effect(spec, **kwargs):
        if isinstance(spec, int):
            return [MagicMock() for _ in range(spec)]
        return [MagicMock(), MagicMock(), MagicMock()]

    mock_st.columns.side_effect = columns_side_effect

    with (
        patch("src.ui.dashboard.render_agent_config_panel"),
        patch("src.ui.dashboard.render_tool_registration_form"),
        patch("src.ui.dashboard.render_memory_config"),
        patch("src.ui.dashboard.render_demo_loader"),
        patch("src.ui.dashboard.render_session_manager"),
        patch("src.ui.components.agent_timeline.render_agent_timeline"),
        patch("src.ui.components.tool_chain.render_tool_chain"),
        patch("src.ui.components.owasp_coverage.render_owasp_coverage"),
        patch("src.ui.dashboard.reset_agent_state") as mock_reset,
    ):
        def reset_side_effect(full_reset=False):
            mock_session_state[AGENT_EVENTS_KEY] = []
            mock_session_state[AGENT_SCORE_KEY] = None

        mock_reset.side_effect = reset_side_effect
        render_agent_mode()

    assert mock_session_state[AGENT_EVENTS_KEY] == []
    assert mock_session_state[AGENT_SCORE_KEY] is None
    mock_st.rerun.assert_called()


def test_start_campaign_validation(mock_session_state):
    """Test validation in start_campaign."""
    from src.ui.dashboard import start_campaign

    mock_session_state["session_id"] = "test_session"
    container = MagicMock()
    def _close_coro(coro):
        coro.close()

    # Mock security checks
    with (
        patch("src.ui.dashboard.check_rate_limit", return_value=True),
        patch("src.ui.dashboard.validate_input") as mock_validate,
    ):
        # Test validation error
        mock_validate.side_effect = ValueError("Invalid input")
        start_campaign("secret", "prompt", container)
        mock_st.error.assert_called_with("Invalid input: Invalid input")

        # Test success path
        mock_validate.side_effect = lambda x: x
        with patch("src.ui.dashboard.safe_run_async", side_effect=_close_coro) as mock_run_async:
            start_campaign("secret", "prompt", container)
            mock_run_async.assert_called()
            assert mock_session_state["is_running"] is True

    # Test rate limit failure
    with patch("src.ui.dashboard.check_rate_limit", return_value=False):
        start_campaign("secret", "prompt", container)
        mock_st.error.assert_called_with("Rate limit exceeded. Please wait.")


def test_start_campaign_failure(mock_session_state):
    """Test exception handling in start_campaign."""
    from src.ui.dashboard import start_campaign

    mock_session_state["session_id"] = "test_session"
    container = MagicMock()
    def _raise_after_close(coro):
        coro.close()
        raise Exception("Async loop error")

    with (
        patch("src.ui.dashboard.check_rate_limit", return_value=True),
        patch("src.ui.dashboard.validate_input", side_effect=lambda x: x),
        patch("src.ui.dashboard.safe_run_async", side_effect=_raise_after_close),
    ):
        start_campaign("secret", "prompt", container)

        mock_st.error.assert_called_with("Campaign failed. Please check server logs.")
        assert mock_session_state["is_running"] is False


def test_main_agent_mode(mock_session_state):
    """Test main function dispatching to agent mode."""
    with (
        patch("src.ui.dashboard.render_mode_selector", return_value="agent"),
        patch("src.ui.dashboard.is_first_time_user", return_value=False),
        patch("src.ui.dashboard.render_agent_mode") as mock_render_agent,
    ):
        main()

        mock_render_agent.assert_called_once()


def test_main_llm_mode(mock_session_state):
    """Test main function dispatching to llm mode."""
    with (
        patch("src.ui.dashboard.render_mode_selector", return_value="llm"),
        patch("src.ui.dashboard.is_first_time_user", return_value=False),
        patch("src.ui.dashboard.render_llm_mode") as mock_render_llm,
    ):
        main()

        mock_render_llm.assert_called_once()


def test_render_llm_mode(mock_session_state):
    """Test rendering of LLM mode UI."""
    mock_session_state["arena_state"] = MagicMock()
    mock_session_state["is_running"] = False

    with (
        patch("src.ui.dashboard.render_metrics") as mock_metrics,
        patch("src.ui.dashboard.render_chat") as mock_chat,
    ):
        # Mock container
        mock_container = MagicMock()
        mock_st.empty.return_value = mock_container
        mock_container.container.return_value.__enter__.return_value = MagicMock()
        mock_container.container.return_value.__exit__.return_value = None

        # Helper to invoke start_campaign callback
        def chat_side_effect(state, on_start, is_running):
            # Verify callback is callable
            assert callable(on_start)
            # We don't invoke it here to avoid testing start_campaign complexity yet
            return None

        mock_chat.side_effect = chat_side_effect

        from src.ui.dashboard import render_llm_mode

        render_llm_mode()

        mock_metrics.assert_called_once()
        mock_chat.assert_called_once()
        mock_st.empty.assert_called()
