# src/ui/components/header.py

import streamlit as st


def render_header() -> None:
    """
    Renders the header of the application.
    Uses native Streamlit components for safety.
    """
    st.title("The Red Council")
    st.markdown("**Automated Adversarial Testing Arena for LLMs**")
    st.divider()
