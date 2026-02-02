# src/ui/dashboard.py

import asyncio
import logging
import uuid

import streamlit as st

from src.agents.agent_judge import AgentJudge, AgentJudgeConfig
from src.agents.judge import JudgeAgent
from src.core.security import check_rate_limit, validate_input
from src.providers.gemini_client import GeminiClient
from src.ui.components.chat import render_chat
from src.ui.components.header import render_header
from src.ui.components.metrics import render_metrics
from src.ui.components.mode_selector import (
    AGENT_EVENTS_KEY,
    AGENT_SCORE_KEY,
    get_agent_config,
    render_agent_config_panel,
    render_memory_config,
    render_mode_selector,
    render_tool_registration_form,
)
from src.ui.providers.polling import run_arena_stream


async def run_agent_evaluation():
    """Run OWASP evaluation on captured agent events."""
    events = st.session_state.get(AGENT_EVENTS_KEY, [])
    if not events:
        st.warning("No events to evaluate.")
        return

    # Initialize components
    try:
        # Using defaults for GeminiClient - relies on env vars or default project
        client = GeminiClient()
        judge_agent = JudgeAgent(client=client)

        # Use default configuration for now
        # Future: Load from UI if we add configuration panel for weights
        judge_config = AgentJudgeConfig()

        agent_judge = AgentJudge(judge=judge_agent, config=judge_config)

        with st.spinner("Running OWASP Agentic Security Evaluation..."):
            # Passing None for context/target_secret as they are not currently tracked in UI session
            score = await agent_judge.evaluate_agent_async(events)
            st.session_state[AGENT_SCORE_KEY] = score
            st.success("Evaluation complete!")

    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Evaluation failed: {str(e)}", exc_info=True)
        st.error(f"Evaluation failed: {str(e)}")


# Page Config
st.set_page_config(
    page_title="The Red Council",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Session State Init
if "arena_state" not in st.session_state:
    st.session_state.arena_state = None
if "is_running" not in st.session_state:
    st.session_state.is_running = False
if "session_id" not in st.session_state:
    st.session_state.session_id = str(uuid.uuid4())


def start_campaign(secret: str, prompt: str, container):
    # Security Checks
    if not check_rate_limit(st.session_state.session_id):
        st.error("Rate limit exceeded. Please wait.")
        return

    try:
        secret = validate_input(secret)
        prompt = validate_input(prompt)
    except ValueError as e:
        st.error(f"Invalid input: {e}")
        return

    st.session_state.is_running = True
    st.session_state.arena_state = None  # Reset

    try:
        asyncio.run(run_loop(secret, prompt, container))
    except Exception as e:
        st.error(f"Campaign failed: {e}")
        st.session_state.is_running = False


async def run_loop(secret: str, prompt: str, container):
    async for state in run_arena_stream(secret, prompt):
        st.session_state.arena_state = state

        # Redraw Chat Area Live
        container.empty()
        with container.container():
            render_chat(
                state,
                on_start=lambda s, p: None,  # Disable button during run
                is_running=True,
            )

    st.session_state.is_running = False
    st.rerun()


def render_llm_mode():
    """Render LLM testing mode UI."""
    # Sidebar metrics
    render_metrics(st.session_state.arena_state)

    chat_container = st.empty()

    with chat_container.container():
        render_chat(
            st.session_state.arena_state,
            on_start=lambda s, p: start_campaign(s, p, chat_container),
            is_running=st.session_state.is_running,
        )


def render_agent_mode():
    """Render Agent testing mode UI."""
    # Agent-specific sidebar panels
    render_agent_config_panel()
    render_tool_registration_form()
    render_memory_config()

    # Main content area
    st.header("Agent Security Testing")

    # Show current config
    config = get_agent_config()
    with st.expander("Current Agent Configuration", expanded=False):
        st.json(config.model_dump())

    # Agent events section
    events = st.session_state.get(AGENT_EVENTS_KEY, [])
    score = st.session_state.get(AGENT_SCORE_KEY)

    # Tabs for different views
    tab1, tab2, tab3, tab4 = st.tabs(
        ["Timeline", "Tool Chain", "OWASP Coverage", "Events"]
    )

    with tab1:
        st.subheader("Agent Behavior Timeline")
        if events:
            # Lazy import to avoid circular dependencies
            from src.ui.components.agent_timeline import render_agent_timeline

            render_agent_timeline(events)
        else:
            st.info(
                "No agent events captured yet. "
                "Submit events via the API or connect an instrumented agent."
            )

    with tab2:
        st.subheader("Tool Call Chain")
        # Filter for tool call events
        tool_calls = [
            e for e in events if getattr(e, "event_type", None) == "tool_call"
        ]
        if tool_calls:
            from src.ui.components.tool_chain import render_tool_chain

            render_tool_chain(tool_calls)
        else:
            st.info("No tool calls captured yet.")

    with tab3:
        st.subheader("OWASP Agentic Coverage")
        if score:
            from src.ui.components.owasp_coverage import render_owasp_coverage

            render_owasp_coverage(score)
        else:
            st.info(
                "No OWASP evaluation results yet. Run agent evaluation to see coverage."
            )

    with tab4:
        st.subheader("Raw Events")
        if events:
            st.caption(f"Showing {len(events)} events")
            for i, event in enumerate(events[-50:]):  # Last 50 events
                with st.expander(
                    f"Event {i + 1}: {getattr(event, 'event_type', 'unknown')}"
                ):
                    if hasattr(event, "model_dump"):
                        st.json(event.model_dump(mode="json"))
                    else:
                        st.text(str(event))
        else:
            st.info("No events to display.")

    # Agent testing actions
    st.divider()
    col1, col2, col3 = st.columns(3)

    with col1:
        if st.button("Clear Events", key="clear_events_btn"):
            st.session_state[AGENT_EVENTS_KEY] = []
            st.session_state[AGENT_SCORE_KEY] = None
            st.rerun()

    with col2:
        if st.button(
            "Run Evaluation",
            key="run_eval_btn",
            disabled=len(events) == 0,
            help="Run OWASP evaluation on captured events",
        ):
            asyncio.run(run_agent_evaluation())
            st.rerun()

    with col3:
        st.button(
            "Generate Report",
            key="gen_report_btn",
            disabled=score is None,
            help="Generate security report from evaluation",
        )


def main():
    render_header()

    # Mode selector in sidebar (always visible)
    current_mode = render_mode_selector()

    # Render mode-specific UI
    if current_mode == "agent":
        render_agent_mode()
    else:
        render_llm_mode()


if __name__ == "__main__":
    main()
