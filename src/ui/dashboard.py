# src/ui/dashboard.py

import asyncio
import uuid
import streamlit as st
from src.ui.components.header import render_header
from src.ui.components.chat import render_chat
from src.ui.components.metrics import render_metrics
from src.ui.providers.polling import run_arena_stream
from src.core.security import check_rate_limit, validate_input

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


def main():
    render_header()

    # Sidebar
    render_metrics(st.session_state.arena_state)

    chat_container = st.empty()

    with chat_container.container():
        render_chat(
            st.session_state.arena_state,
            on_start=lambda s, p: start_campaign(s, p, chat_container),
            is_running=st.session_state.is_running,
        )


if __name__ == "__main__":
    main()
