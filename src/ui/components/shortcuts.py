"""
Keyboard shortcuts and power user features for the Streamlit dashboard.
Injects JavaScript to handle key events and provides a visual reference.
"""

import streamlit as st
import streamlit.components.v1 as components


def render_keyboard_shortcuts():
    """
    Render keyboard shortcuts handler and help panel.
    Injects JS to listen for key combinations and trigger button clicks.
    """
    # JavaScript to handle keyboard shortcuts
    # We use window.parent.document to access the main Streamlit DOM
    js_code = """
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

            // Ctrl+Shift+D: Load Demo (Shift to avoid Bookmark collision)
            if ((e.key === 'd' || e.key === 'D') && e.shiftKey) {
                e.preventDefault();
                clickButton('Load Demo Data');
            }

            // Ctrl+Shift+N: New Session (Shift to avoid New Window collision)
            if ((e.key === 'n' || e.key === 'N') && e.shiftKey) {
                e.preventDefault();
                clickButton('New Session');
            }

             // Ctrl+Shift+C: Clear Events
            if ((e.key === 'c' || e.key === 'C') && e.shiftKey) {
                e.preventDefault();
                clickButton('Clear Events');
            }
        }
    });
    </script>
    """

    # Inject the JS (height=0 to be invisible)
    components.html(js_code, height=0, width=0)

    # Render the Shortcuts Help Panel in Sidebar
    # We use an expander so it doesn't clutter the view
    with st.sidebar.expander("⌨️ Keyboard Shortcuts", expanded=False):
        st.markdown("""
        ### Power User Controls

        **Actions**
        *   `Ctrl + E`: Run Evaluation
        *   `Ctrl + R`: Generate Report
        *   `Ctrl + Shift + D`: Load Demo Data
        *   `Ctrl + Shift + N`: New Session
        *   `Ctrl + Shift + C`: Clear Events

        **Navigation**
        *   `Tab`: Move focus
        *   `Esc`: Close modals

        _Note: Click in the main window area for shortcuts to active._
        """)

# render_command_palette removed/commented out as it is currently unused
# def render_command_palette(): ...
