"""
Keyboard shortcuts and power user features for the Streamlit dashboard.
Injects JavaScript to handle key events and provides a visual reference.
"""

import streamlit as st
import streamlit.components.v1 as components

# Session state keys
SHORTCUTS_PANEL_KEY = "show_shortcuts_panel"
COMMAND_PALETTE_KEY = "show_command_palette"
COMMAND_ACTION_KEY = "command_action"
UI_DARK_MODE_KEY = "ui_dark_mode"
UI_DENSITY_KEY = "ui_density"

# Command palette actions mapped to button labels
COMMAND_ACTIONS = {
    "Run Evaluation": "Run Evaluation",
    "Generate Report": "Generate Report",
    "Load Demo Data": "Load Demo Data",
    "New Session": "New Session (Clear)",
    "Clear Events": "Clear Events",
}


def _apply_appearance() -> None:
    """Apply dark mode and density preferences."""
    dark_mode = bool(st.session_state.get(UI_DARK_MODE_KEY, False))
    density = st.session_state.get(UI_DENSITY_KEY, "comfortable")

    padding = "1rem" if density == "comfortable" else "0.5rem"
    font_size = "1rem" if density == "comfortable" else "0.9rem"

    if dark_mode:
        bg = "#0f1115"
        fg = "#e6e6e6"
        panel = "#161b22"
    else:
        bg = "#ffffff"
        fg = "#111111"
        panel = "#f6f8fa"

    st.markdown(
        f\"\"\"
        <style>
        .stApp {{
            background-color: {bg};
            color: {fg};
        }}
        .block-container {{
            padding: {padding};
            font-size: {font_size};
        }}
        .stSidebar {{
            background-color: {panel};
        }}
        </style>
        \"\"\",
        unsafe_allow_html=True,
    )


def _render_command_palette() -> None:
    \"\"\"Render command palette for quick actions.\"\"\"
    if COMMAND_PALETTE_KEY not in st.session_state:
        st.session_state[COMMAND_PALETTE_KEY] = False

    if not st.session_state[COMMAND_PALETTE_KEY]:
        return

    with st.sidebar.expander(\"⌨️ Command Palette\", expanded=True):
        action = st.selectbox(
            \"Action\",
            options=list(COMMAND_ACTIONS.keys()),
            key=\"command_palette_action\",
        )
        if st.button(\"Run\", key=\"command_palette_run\", use_container_width=True):
            st.session_state[COMMAND_ACTION_KEY] = action
            st.session_state[COMMAND_PALETTE_KEY] = False
            st.rerun()


def render_keyboard_shortcuts():
    """
    Render keyboard shortcuts handler and help panel.
    Injects JS to listen for key combinations and trigger button clicks.
    """
    # JavaScript to handle keyboard shortcuts
    # We use window.parent.document to access the main Streamlit DOM
    action_label = st.session_state.pop(COMMAND_ACTION_KEY, None)
    trigger_action_js = ""
    if action_label:
        target = COMMAND_ACTIONS.get(action_label, action_label)
        trigger_action_js = f\"clickButton('{target}', false);\"\n+
    js_code = f"""
    <script>
    let shortcutLock = false;
    
    document.addEventListener('keydown', function(e) {
        // Only trigger if not in an input field (unless it's a command shortcut)
        const activeTag = document.activeElement.tagName;
        const isTextInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement.isContentEditable;
        
        if (isTextInput && !e.ctrlKey && !e.metaKey) {
            return;
        }

        // Debounce lock
        if (shortcutLock) return;

        // Helper to click button by text
        function clickButton(text, exact = false) {
            const buttons = window.parent.document.querySelectorAll('button');
            for (const btn of buttons) {
                // Skip disabled buttons
                if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
                    continue;
                }
                
                const btnText = btn.innerText.trim();
                const match = exact ? btnText === text : btnText.includes(text);
                
                if (match) {
                    btn.click();
                    shortcutLock = true;
                    setTimeout(() => { shortcutLock = false; }, 500); // 500ms debounce
                    return true;
                }
            }
            return false;
        }

        // Check for Ctrl/Cmd key combinations
        if (e.ctrlKey || e.metaKey) {
            // Ctrl+E: Run Evaluation
            if (e.key === 'e' || e.key === 'E') {
                e.preventDefault();
                clickButton('Run Evaluation');
            }

            // Ctrl+R: Generate Report
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                clickButton('Generate Report');
            }

            // Ctrl+D: Load Demo
            if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                clickButton('Load Demo Data');
            }

            // Ctrl+N: New Session
            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                clickButton('New Session (Clear)');
            }

            // Ctrl+C: Clear Events
            if (e.key === 'c' || e.key === 'C') {
                e.preventDefault();
                clickButton('Clear Events');
            }

            // Ctrl+K: Command Palette
            if (e.key === 'k' || e.key === 'K') {
                e.preventDefault();
                clickButton('Open Command Palette', true);
            }
        }

        // ?: Toggle shortcuts panel
        if (!e.ctrlKey && !e.metaKey && e.key === '?') {
            e.preventDefault();
            clickButton('Toggle Shortcuts Panel', true);
        }
    });

    // Trigger command palette action (if any)
    {trigger_action_js}
    </script>
    """

    # Inject the JS (height=0 to be invisible)
    components.html(js_code, height=0, width=0)

    _apply_appearance()

    if SHORTCUTS_PANEL_KEY not in st.session_state:
        st.session_state[SHORTCUTS_PANEL_KEY] = False

    # Hidden action buttons for keyboard triggers
    if st.sidebar.button("Open Command Palette", key="open_command_palette_btn"):
        st.session_state[COMMAND_PALETTE_KEY] = True
        st.rerun()

    if st.sidebar.button("Toggle Shortcuts Panel", key="toggle_shortcuts_btn"):
        st.session_state[SHORTCUTS_PANEL_KEY] = not st.session_state[SHORTCUTS_PANEL_KEY]
        st.rerun()

    _render_command_palette()

    # Appearance toggles
    with st.sidebar.expander("🎨 Appearance", expanded=False):
        st.toggle("Dark Mode", key=UI_DARK_MODE_KEY)
        density = st.radio(
            "Density",
            options=["comfortable", "compact"],
            index=0 if st.session_state.get(UI_DENSITY_KEY, "comfortable") == "comfortable" else 1,
            key=UI_DENSITY_KEY,
            horizontal=True,
        )
        st.session_state[UI_DENSITY_KEY] = density

    # Render the Shortcuts Help Panel in Sidebar
    if st.session_state.get(SHORTCUTS_PANEL_KEY, False):
        with st.sidebar.expander("⌨️ Keyboard Shortcuts", expanded=True):
            st.markdown("""
        ### Power User Controls

        **Actions**
        *   `Ctrl + E`: Run Evaluation
        *   `Ctrl + R`: Generate Report
        *   `Ctrl + D`: Load Demo Data
        *   `Ctrl + N`: New Session
        *   `Ctrl + C`: Clear Events
        *   `Ctrl + K`: Command Palette
        *   `?`: Toggle Shortcuts Panel

        **Navigation**
        *   `Tab`: Move focus
        *   `Esc`: Close modals

        _Note: Click in the main window area for shortcuts to active._
        """)

# render_command_palette removed/commented out as it is currently unused
# def render_command_palette(): ...
