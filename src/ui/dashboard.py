# src/ui/dashboard.py

import asyncio
import logging
import secrets

import streamlit as st

from src.agents.agent_judge import AgentJudge, AgentJudgeConfig
from src.agents.judge import JudgeAgent
from src.core.security import check_rate_limit, validate_input
from src.providers.gemini_client import GeminiClient
from src.ui.components.chat import render_chat
from src.ui.components.demo_loader import render_demo_loader
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
from src.ui.state_utils import reset_agent_state

logger = logging.getLogger(__name__)


async def run_agent_evaluation():
    """Run OWASP evaluation on captured agent events."""
    events = st.session_state.get(AGENT_EVENTS_KEY, [])
    if not events:
        st.warning("No events to evaluate.")
        return

    if not isinstance(events, list):
        st.error("Invalid events data.")
        return

    # Initialize components
    try:
        # Using defaults for GeminiClient - relies on env vars or default project
        try:
            client = GeminiClient()
        except Exception as e:
            st.error("Failed to initialize Gemini Client. Check API credentials.")
            logger.error(f"GeminiClient init failed: {e}", exc_info=True)
            return

        judge_agent = JudgeAgent(client=client)

        # Use default configuration for now
        # Future: Load from UI if we add configuration panel for weights
        judge_config = AgentJudgeConfig()

        agent_judge = AgentJudge(judge=judge_agent, config=judge_config)

        with st.spinner("Running OWASP Agentic Security Evaluation..."):
            # Context/target_secret not tracked in UI session yet
            score = await agent_judge.evaluate_agent_async(events)
            st.session_state[AGENT_SCORE_KEY] = score
            st.success("Evaluation complete!")

    except Exception as e:
        logger.error(f"Evaluation failed: {str(e)}", exc_info=True)
        st.session_state[AGENT_SCORE_KEY] = None
        st.error("Evaluation failed. Please check server logs.")


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
    st.session_state.session_id = secrets.token_urlsafe(32)


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
        st.session_state.is_running = False  # Reset state on validation failure
        st.session_state.arena_state = None
        return

    st.session_state.is_running = True
    st.session_state.arena_state = None  # Reset

    try:
        asyncio.run(run_loop(secret, prompt, container))
    except Exception as e:
        logger.error(f"Campaign failed: {e}", exc_info=True)
        st.error("Campaign failed. Please check server logs.")
        st.session_state.is_running = False
        st.session_state.arena_state = None


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
    render_demo_loader()
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
    tab1, tab2, tab3, tab4, tab5, tab6, tab7 = st.tabs(
        [
            "Timeline",
            "Tool Chain",
            "OWASP Coverage",
            "Events",
            "SDK Integration",
            "Remote Agent",
            "Attack Templates",
        ]
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
        # Filter for tool call events with safety check
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
        if score is not None:
            from src.ui.components.owasp_coverage import render_owasp_coverage

            render_owasp_coverage(score)
        else:
            st.info(
                "No OWASP evaluation results yet. Run agent evaluation to see coverage."
            )

    with tab4:
        st.subheader("Raw Events")
        if events:
            # Limit display to last 50 to avoid lag
            display_events = events[-50:]
            st.caption(f"Showing last {len(display_events)} of {len(events)} events")
            for i, event in enumerate(display_events):
                # Calculate correct index for expander label
                actual_index = len(events) - len(display_events) + i + 1
                label = getattr(event, "event_type", "unknown")
                with st.expander(f"Event {actual_index}: {label}"):
                    if hasattr(event, "model_dump"):
                        st.json(event.model_dump(mode="json"))
                    else:
                        # Fallback for non-model objects - show type only
                        st.text(f"<Non-Pydantic Object: {type(event).__name__}>")
        else:
            st.info("No events to display.")

    with tab5:
        # SDK Integration tab
        from src.ui.components.sdk_connection import render_sdk_connection

        render_sdk_connection()

    with tab6:
        # Remote Agent Configuration tab
        from src.ui.components.remote_agent_config import render_remote_agent_config

        render_remote_agent_config()

    with tab7:
        # Attack Templates tab
        from src.ui.components.attack_selector import render_attack_selector

        render_attack_selector()

    # Agent testing actions
    st.divider()
    col1, col2, col3 = st.columns(3)

    with col1:
        if st.button("Clear Events", key="clear_events_btn"):
            # Clear all agent-related state
            reset_agent_state(full_reset=False)
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
        if st.button(
            "Generate Report",
            key="gen_report_btn",
            disabled=score is None,
            help="Generate security report from evaluation",
        ):
            from src.reports.agent_report_generator import AgentReportGenerator

            try:
                with st.spinner("Generating report..."):
                    generator = AgentReportGenerator()
                    report = generator.generate(score, events)

                    # Pre-render content to decouple viewer from generator
                    markdown_content = generator.render(report)
                    json_content = report.model_dump_json(indent=2)

                    st.session_state["agent_report"] = report
                    st.session_state["report_markdown"] = markdown_content
                    st.session_state["report_json"] = json_content
            except Exception as e:
                st.session_state["agent_report"] = None
                st.session_state["report_markdown"] = None
                st.session_state["report_json"] = None
                st.error(f"Failed to generate report: {e}")

    # Render report viewer if report exists
    if "agent_report" in st.session_state and st.session_state["agent_report"]:
        from src.ui.components.report_viewer import render_report_viewer

        report = st.session_state["agent_report"]
        md = st.session_state.get("report_markdown", "")
        js = st.session_state.get("report_json", "{}")

        render_report_viewer(md, js, str(report.id))


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
