# src/ui/components/sdk_connection.py
"""
SDK Connection Panel component for integrating agents with The Red Council.

This component provides framework-specific code snippets for instrumenting
agents to send events to the dashboard's webhook endpoint.

Supports:
- LangChain integration
- LangGraph integration
- MCP (Model Context Protocol) integration
- Custom agent integration
"""

import html
import logging
import secrets
from typing import Literal

import streamlit as st

logger = logging.getLogger(__name__)

# Session state keys
SDK_SESSION_ID_KEY = "sdk_session_id"
SDK_FRAMEWORK_KEY = "sdk_selected_framework"

# Framework type
FrameworkType = Literal["langchain", "langgraph", "mcp", "custom"]

# Framework display names
FRAMEWORK_NAMES = {
    "langchain": "LangChain",
    "langgraph": "LangGraph",
    "mcp": "MCP (Model Context Protocol)",
    "custom": "Custom Agent",
}

# Framework documentation links
FRAMEWORK_DOCS = {
    "langchain": "https://python.langchain.com/docs/",
    "langgraph": "https://langchain-ai.github.io/langgraph/",
    "mcp": "https://modelcontextprotocol.io/",
    "custom": "/docs/agent-testing-guide.md",
}


def _generate_session_id() -> str:
    """Generate a secure session ID for webhook authentication."""
    return secrets.token_urlsafe(32)


def _get_or_create_session_id() -> str:
    """Get existing session ID or create a new one."""
    if SDK_SESSION_ID_KEY not in st.session_state:
        st.session_state[SDK_SESSION_ID_KEY] = _generate_session_id()
    return str(st.session_state[SDK_SESSION_ID_KEY])


def _get_webhook_url(session_id: str) -> str:
    """Generate the webhook URL for submitting events.

    Args:
        session_id: The session ID to include in the URL.

    Returns:
        Full webhook URL for the events endpoint.
    """
    # In production, this would be the deployed API URL
    # For local development, use localhost
    base_url = st.session_state.get("api_base_url", "http://localhost:8000")
    return f"{base_url}/api/v1/agent/session/{session_id}/events"


def _get_langchain_snippet(session_id: str, webhook_url: str, auth_token: str) -> str:
    """Generate LangChain integration code snippet.

    Args:
        session_id: The session ID.
        webhook_url: The webhook URL for events.
        auth_token: Authentication token for the API.

    Returns:
        Python code snippet for LangChain integration.
    """
    return f'''"""
LangChain integration with The Red Council Agent Security Testing.

This snippet wraps your LangChain AgentExecutor for security monitoring.
"""

from langchain.agents import AgentExecutor
import httpx

from src.integrations.langchain_adapter import LangChainAgentWrapper
from src.core.agent_schemas import AgentInstrumentationConfig

# Configuration
SESSION_ID = "{session_id}"
WEBHOOK_URL = "{webhook_url}"
AUTH_TOKEN = "{auth_token}"  # Replace with your API token

# Your existing LangChain agent
# executor = AgentExecutor(agent=your_agent, tools=your_tools)

# Wrap with security instrumentation
config = AgentInstrumentationConfig(
    enable_tool_interception=True,
    enable_memory_monitoring=True,
    divergence_threshold=0.5,
    sampling_rate=1.0,
    max_events=5000,
)

wrapper = LangChainAgentWrapper.from_agent_executor(executor, config)

# Run your agent as usual
result = await wrapper.invoke("Your prompt here")

# Get captured events
events = wrapper.events

# Send events to The Red Council dashboard
def send_events_to_dashboard(events):
    """Post events to the webhook endpoint."""
    headers = {{"Authorization": f"Bearer {{AUTH_TOKEN}}"}}
    data = {{
        "events": [e.model_dump(mode="json") for e in events]
    }}
    response = httpx.post(WEBHOOK_URL, json=data, headers=headers)
    response.raise_for_status()
    return response.json()

# Submit events for analysis
send_events_to_dashboard(wrapper.events)
'''


def _get_langgraph_snippet(session_id: str, webhook_url: str, auth_token: str) -> str:
    """Generate LangGraph integration code snippet.

    Args:
        session_id: The session ID.
        webhook_url: The webhook URL for events.
        auth_token: Authentication token for the API.

    Returns:
        Python code snippet for LangGraph integration.
    """
    return f'''"""
LangGraph integration with The Red Council Agent Security Testing.

This snippet wraps your LangGraph StateGraph for security monitoring.
"""

from langgraph.graph import StateGraph
import httpx

from src.integrations.langgraph_adapter import LangGraphAgentWrapper
from src.core.agent_schemas import AgentInstrumentationConfig

# Configuration
SESSION_ID = "{session_id}"
WEBHOOK_URL = "{webhook_url}"
AUTH_TOKEN = "{auth_token}"  # Replace with your API token

# Your existing LangGraph
# builder = StateGraph(YourStateType)
# builder.add_node("agent", agent_node)
# builder.add_node("tools", tool_node)
# graph = builder.compile()

# Wrap with security instrumentation
config = AgentInstrumentationConfig(
    enable_tool_interception=True,
    enable_memory_monitoring=True,
    divergence_threshold=0.5,
    sampling_rate=1.0,
    max_events=5000,
)

wrapper = LangGraphAgentWrapper.from_state_graph(graph, config)

# Run your graph as usual
result = await wrapper.invoke({{"input": "Your input here"}})

# Get captured events
events = wrapper.events

# Send events to The Red Council dashboard
def send_events_to_dashboard(events):
    """Post events to the webhook endpoint."""
    headers = {{"Authorization": f"Bearer {{AUTH_TOKEN}}"}}
    data = {{
        "events": [e.model_dump(mode="json") for e in events]
    }}
    response = httpx.post(WEBHOOK_URL, json=data, headers=headers)
    response.raise_for_status()
    return response.json()

# Submit events for analysis
send_events_to_dashboard(wrapper.events)

# Get node execution stats
stats = wrapper.get_node_execution_stats()
print(f"Node stats: {{stats}}")
'''


def _get_mcp_snippet(session_id: str, webhook_url: str, auth_token: str) -> str:
    """Generate MCP integration code snippet.

    Args:
        session_id: The session ID.
        webhook_url: The webhook URL for events.
        auth_token: Authentication token for the API.

    Returns:
        Python code snippet for MCP integration.
    """
    return f'''"""
MCP (Model Context Protocol) integration with The Red Council.

This snippet wraps your MCP client for security monitoring.
"""

import asyncio
import httpx

from src.integrations.mcp_adapter import MCPAgentWrapper
from src.core.agent_schemas import AgentInstrumentationConfig

# Configuration
SESSION_ID = "{session_id}"
WEBHOOK_URL = "{webhook_url}"
AUTH_TOKEN = "{auth_token}"  # Replace with your API token

async def main():
    config = AgentInstrumentationConfig(
        enable_tool_interception=True,
        enable_memory_monitoring=True,
        divergence_threshold=0.5,
        sampling_rate=1.0,
        max_events=5000,
    )

    # Option 1: Wrap an MCP stdio server
    wrapper = await MCPAgentWrapper.from_stdio_server(
        command=["python", "-m", "your_mcp_server"],
        config=config,
    )

    # Option 2: Wrap an MCP HTTP server
    # wrapper = await MCPAgentWrapper.from_http_server(
    #     url="http://localhost:8080/mcp",
    #     headers={{"Authorization": "Bearer your-mcp-token"}},
    #     config=config,
    # )

    async with wrapper:
        # List available tools
        tools = await wrapper.list_tools()
        print(f"Available tools: {{[t['name'] for t in tools]}}")

        # Call a tool
        result = await wrapper.call_tool(
            "your_tool_name",
            {{"arg1": "value1"}}
        )

        # Read a resource
        content = await wrapper.read_resource("file:///path/to/resource")

    # Get captured events
    events = wrapper.events

    # Send events to The Red Council dashboard
    def send_events_to_dashboard(events):
        """Post events to the webhook endpoint."""
        headers = {{"Authorization": f"Bearer {{AUTH_TOKEN}}"}}
        data = {{
            "events": [e.model_dump(mode="json") for e in events]
        }}
        response = httpx.post(WEBHOOK_URL, json=data, headers=headers)
        response.raise_for_status()
        return response.json()

    # Submit events for analysis
    send_events_to_dashboard(events)

if __name__ == "__main__":
    asyncio.run(main())
'''


def _get_custom_snippet(session_id: str, webhook_url: str, auth_token: str) -> str:
    """Generate custom agent integration code snippet.

    Args:
        session_id: The session ID.
        webhook_url: The webhook URL for events.
        auth_token: Authentication token for the API.

    Returns:
        Python code snippet for custom agent integration.
    """
    return f'''"""
Custom agent integration with The Red Council Agent Security Testing.

This snippet shows how to manually instrument any custom agent.
"""

import httpx
from datetime import datetime
from uuid import uuid4

from src.agents.instrumented import InstrumentedAgent
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessEvent,
    MemoryAccessOperation,
    SpeechRecord,
    ActionRecord,
)

# Configuration
SESSION_ID = "{session_id}"
WEBHOOK_URL = "{webhook_url}"
AUTH_TOKEN = "{auth_token}"  # Replace with your API token

# Create instrumentation config
config = AgentInstrumentationConfig(
    enable_tool_interception=True,
    enable_memory_monitoring=True,
    divergence_threshold=0.5,
    sampling_rate=1.0,
    max_events=5000,
)

# Wrap your custom agent
class MyCustomAgent:
    def run(self, prompt: str) -> str:
        # Your agent logic here
        return "Agent response"

agent = MyCustomAgent()
wrapper = InstrumentedAgent(agent=agent, name="my-custom-agent", config=config)

# Option 1: Use wrapper methods to record events
# Record tool calls
wrapper.wrap_tool_call(
    tool_name="my_tool",
    result="tool result",
    arguments={{"arg1": "value1"}},
    duration_ms=150.0,
    success=True,
)

# Record memory access
wrapper.wrap_memory_access(
    operation=MemoryAccessOperation.WRITE,
    key="user_preference",
    value="dark_mode",
)

# Record speech/responses
wrapper.record_speech(
    content="I'll help you with that request.",
    intent="acknowledge_request",
    is_response_to_user=True,
)

# Record actions
wrapper.record_action(
    action_type="api_call",
    description="Called external weather API",
    target="weather-service",
)

# Get all captured events
events = wrapper.events

# Send events to The Red Council dashboard
def send_events_to_dashboard(events):
    """Post events to the webhook endpoint."""
    headers = {{"Authorization": f"Bearer {{AUTH_TOKEN}}"}}
    data = {{
        "events": [e.model_dump(mode="json") for e in events]
    }}
    response = httpx.post(WEBHOOK_URL, json=data, headers=headers)
    response.raise_for_status()
    return response.json()

# Submit events for analysis
result = send_events_to_dashboard(events)
print(f"Submitted {{result['events_accepted']}} events")
'''


def _get_snippet_for_framework(
    framework: FrameworkType, session_id: str, webhook_url: str, auth_token: str
) -> str:
    """Get the appropriate code snippet for the selected framework.

    Args:
        framework: The framework type.
        session_id: The session ID.
        webhook_url: The webhook URL.
        auth_token: The authentication token.

    Returns:
        Python code snippet for the framework.
    """
    snippet_funcs = {
        "langchain": _get_langchain_snippet,
        "langgraph": _get_langgraph_snippet,
        "mcp": _get_mcp_snippet,
        "custom": _get_custom_snippet,
    }
    func = snippet_funcs.get(framework, _get_custom_snippet)
    return func(session_id, webhook_url, auth_token)


def render_sdk_connection() -> None:
    """Render the SDK Connection Panel in the Agent Testing mode.

    This component displays:
    - Framework selector (LangChain, LangGraph, MCP, Custom)
    - Framework-specific code snippet with syntax highlighting
    - Copy-to-clipboard button
    - Session webhook URL
    - Auto-generated session ID
    - Link to full documentation
    """
    st.subheader("SDK Integration")

    # Get or create session ID
    session_id = _get_or_create_session_id()
    webhook_url = _get_webhook_url(session_id)

    # Display session info
    st.markdown("**Your Session Webhook URL:**")
    st.code(webhook_url, language=None)

    st.caption(f"Session ID: `{session_id[:16]}...` (auto-generated)")

    # Regenerate session button
    if st.button("🔄 Generate New Session", key="regen_session_btn"):
        st.session_state[SDK_SESSION_ID_KEY] = _generate_session_id()
        st.rerun()

    st.divider()

    # Framework selector
    st.markdown("**Select Your Framework:**")

    # Get current selection from session state
    current_framework = st.session_state.get(SDK_FRAMEWORK_KEY, "langchain")

    # Radio buttons for framework selection
    selected_framework_str = st.radio(
        label="Framework",
        options=["langchain", "langgraph", "mcp", "custom"],
        index=["langchain", "langgraph", "mcp", "custom"].index(current_framework),
        format_func=lambda x: FRAMEWORK_NAMES.get(x, x),
        key="framework_radio",
        horizontal=True,
        label_visibility="collapsed",
    )

    # Cast to FrameworkType (validated by radio options)
    selected_framework: FrameworkType = (
        selected_framework_str  # type: ignore[assignment]
        if selected_framework_str in ("langchain", "langgraph", "mcp", "custom")
        else "custom"
    )

    # Update session state
    st.session_state[SDK_FRAMEWORK_KEY] = selected_framework

    # Authentication token input
    st.markdown("**Authentication:**")
    auth_token = st.text_input(
        "API Token",
        value="your-api-token-here",
        type="password",
        key="sdk_auth_token",
        help="Your API token for authenticating with The Red Council API",
    )

    # Sanitize auth_token for display in code (escape special chars)
    safe_auth_token = html.escape(auth_token) if auth_token else "your-api-token-here"

    st.divider()

    # Generate and display code snippet
    framework_name = FRAMEWORK_NAMES.get(selected_framework, selected_framework)
    st.markdown(f"**{framework_name} Integration Code:**")

    snippet = _get_snippet_for_framework(
        selected_framework, session_id, webhook_url, safe_auth_token
    )

    # Display code with syntax highlighting
    st.code(snippet, language="python", line_numbers=True)

    # Copy button - Streamlit shows copy icon on code blocks
    st.caption(
        "💡 Tip: Click on the code block and use Ctrl+A then Ctrl+C "
        "to copy, or hover over the code block and click the copy icon."
    )

    # Documentation link
    doc_url = FRAMEWORK_DOCS.get(selected_framework, "")
    if doc_url:
        if doc_url.startswith("http"):
            doc_link = f"📚 [Full {framework_name} Documentation]({doc_url})"
            st.markdown(doc_link)
        else:
            st.markdown(f"📚 Full documentation: `{doc_url}`")

    # Additional info for the selected framework
    st.divider()
    st.markdown("**Quick Start Guide:**")

    if selected_framework == "langchain":
        st.markdown("""
1. Install the LangChain adapter: `pip install the-red-council[langchain]`
2. Wrap your `AgentExecutor` with `LangChainAgentWrapper`
3. Run your agent normally - events are captured automatically
4. Send events to the webhook URL shown above
5. Click "Run Evaluation" in the dashboard to analyze
        """)
    elif selected_framework == "langgraph":
        st.markdown("""
1. Install the LangGraph adapter: `pip install the-red-council[langgraph]`
2. Wrap your `StateGraph` with `LangGraphAgentWrapper`
3. Run your graph normally - node executions and state transitions are captured
4. Send events to the webhook URL shown above
5. Click "Run Evaluation" in the dashboard to analyze
        """)
    elif selected_framework == "mcp":
        st.markdown("""
1. Install the MCP adapter: `pip install the-red-council[mcp]`
2. Create a wrapper using `from_stdio_server()` or `from_http_server()`
3. Use `call_tool()`, `read_resource()`, etc. - all operations are captured
4. Send events to the webhook URL shown above
5. Click "Run Evaluation" in the dashboard to analyze
        """)
    else:  # custom
        st.markdown("""
1. Install The Red Council: `pip install the-red-council`
2. Create an `InstrumentedAgent` wrapper for your agent
3. Use `wrap_tool_call()`, `wrap_memory_access()`, etc. to record events
4. Send events to the webhook URL shown above
5. Click "Run Evaluation" in the dashboard to analyze
        """)


def get_current_session_id() -> str:
    """Get the current SDK session ID.

    Returns:
        The current session ID string.
    """
    return _get_or_create_session_id()


def get_current_webhook_url() -> str:
    """Get the current webhook URL.

    Returns:
        The webhook URL for the current session.
    """
    session_id = _get_or_create_session_id()
    return _get_webhook_url(session_id)
