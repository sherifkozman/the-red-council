# src/ui/components/metrics.py

import streamlit as st
from src.core.schemas import ArenaState


def render_metrics(state: ArenaState) -> None:
    """
    Renders sidebar metrics.
    """
    if not state:
        return

    st.sidebar.header("Campaign Stats")

    # Status
    status_color = {
        "ONGOING": "blue",
        "SECURE": "green",
        "FIXED": "green",
        "VULNERABLE": "red",
        "ERROR": "red",
    }.get(state.status, "grey")

    st.sidebar.markdown(f"Status: **:{status_color}[{state.status}]**")

    col1, col2 = st.sidebar.columns(2)
    col1.metric("Round", f"{state.current_round}/{state.max_rounds}")

    # Calculate Jailbreak Rate
    total = len(state.rounds)
    if total > 0:
        jailbreaks = sum(1 for r in state.rounds if r.score is not None and r.score < 5)
        col2.metric("Jailbreaks", f"{jailbreaks}")

    st.sidebar.divider()

    st.sidebar.subheader("Defense Status")
    st.sidebar.write(
        f"Defense Cycles: {state.defense_cycle_count}/{state.max_defense_cycles}"
    )

    if state.system_prompt:
        with st.sidebar.expander("Current System Prompt"):
            # Redact secret
            secret_val = state.target_secret.get_secret_value()
            safe_prompt = state.system_prompt.replace(secret_val, "[REDACTED]")
            st.code(safe_prompt, language="text")
