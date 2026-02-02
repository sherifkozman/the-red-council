# tests/integrations/test_mcp.py
"""
Tests for MCP (Model Context Protocol) integration adapter.

These tests use mock objects to simulate MCP client behavior without
requiring mcp as a dependency.
"""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from typing import Any, Dict, List, Optional

from src.integrations.mcp_adapter import (
    MCPAgentWrapper,
    _StdioMCPClient,
    _HttpMCPClient,
)
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    MemoryAccessOperation,
)
from src.agents.instrumented import InstrumentedAgent


# =============================================================================
# Mock MCP Classes
# =============================================================================


class MockMCPClient:
    """Mock MCP client for testing."""

    def __init__(
        self,
        name: str = "MockMCPClient",
        tools: Optional[List[Dict[str, Any]]] = None,
        resources: Optional[List[Dict[str, Any]]] = None,
        prompts: Optional[List[Dict[str, Any]]] = None,
    ):
        self.name = name
        self._tools = tools or [
            {"name": "search", "description": "Search the web"},
            {"name": "read_file", "description": "Read a file"},
        ]
        self._resources = resources or [
            {"uri": "file:///tmp/test.txt", "name": "Test File"},
        ]
        self._prompts = prompts or [
            {"name": "summarize", "description": "Summarize text"},
        ]
        self._tool_results: Dict[str, Any] = {}

    def set_tool_result(self, tool_name: str, result: Any) -> None:
        """Set the result that a tool call will return."""
        self._tool_results[tool_name] = result

    async def call_tool(
        self,
        name: str,
        arguments: Dict[str, Any],
    ) -> Any:
        """Mock tool call."""
        await asyncio.sleep(0.01)  # Simulate async work
        if name in self._tool_results:
            return self._tool_results[name]
        return {"result": f"Result from {name}", "arguments": arguments}

    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        return self._tools

    async def read_resource(self, uri: str) -> Dict[str, Any]:
        """Read a resource."""
        await asyncio.sleep(0.01)
        return {"contents": [{"text": f"Content of {uri}"}]}

    async def list_resources(self) -> List[Dict[str, Any]]:
        """List available resources."""
        return self._resources

    async def get_prompt(
        self,
        name: str,
        arguments: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Get a prompt."""
        await asyncio.sleep(0.01)
        return {"messages": [{"role": "user", "content": f"Prompt: {name}"}]}

    async def list_prompts(self) -> List[Dict[str, Any]]:
        """List available prompts."""
        return self._prompts


class MockMCPClientWithRequest:
    """Mock MCP client that uses request() method instead of specific methods."""

    def __init__(self, name: str = "RequestClient"):
        self.name = name
        self._responses: Dict[str, Any] = {
            "tools/list": {"tools": [{"name": "tool1"}]},
            "tools/call": {"result": "success"},
            "resources/list": {"resources": [{"uri": "file:///test"}]},
            "resources/read": {"contents": [{"text": "content"}]},
            "prompts/list": {"prompts": [{"name": "prompt1"}]},
            "prompts/get": {"messages": [{"content": "prompt text"}]},
        }

    def set_response(self, method: str, response: Any) -> None:
        """Set response for a specific method."""
        self._responses[method] = response

    async def request(
        self,
        method: str,
        params: Dict[str, Any],
    ) -> Any:
        """Generic request method."""
        await asyncio.sleep(0.01)
        return self._responses.get(method, {})


class MockFailingClient:
    """Mock client that raises errors."""

    def __init__(self, error_type: type = RuntimeError, error_msg: str = "Error"):
        self._error_type = error_type
        self._error_msg = error_msg

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        raise self._error_type(self._error_msg)

    async def read_resource(self, uri: str) -> Any:
        raise self._error_type(self._error_msg)

    async def get_prompt(self, name: str, arguments: Dict[str, Any]) -> Any:
        raise self._error_type(self._error_msg)


# =============================================================================
# MCPAgentWrapper Tests
# =============================================================================


class TestMCPAgentWrapperInit:
    """Tests for MCPAgentWrapper initialization."""

    def test_init_requires_client(self):
        """Test that wrapper requires a client."""
        with pytest.raises(ValueError, match="cannot be None"):
            MCPAgentWrapper(None)

    def test_init_validates_interface(self):
        """Test that wrapper validates client interface."""

        class BadClient:
            pass

        with pytest.raises(TypeError, match="must have"):
            MCPAgentWrapper(BadClient())

    def test_init_with_default_config(self):
        """Test that wrapper uses default config if none provided."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)
        assert wrapper.config is not None
        assert wrapper.config.enable_tool_interception is True

    def test_init_with_custom_config(self):
        """Test that wrapper uses provided config."""
        client = MockMCPClient()
        config = AgentInstrumentationConfig(
            enable_tool_interception=False,
            sampling_rate=0.5,
        )
        wrapper = MCPAgentWrapper(client, config)
        assert wrapper.config.enable_tool_interception is False
        assert wrapper.config.sampling_rate == 0.5

    def test_name_includes_mcp_prefix(self):
        """Test that wrapper name includes mcp prefix."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)
        assert "mcp:" in wrapper.name

    def test_inherits_from_instrumented_agent(self):
        """Test that wrapper inherits InstrumentedAgent functionality."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)
        assert isinstance(wrapper, InstrumentedAgent)
        assert hasattr(wrapper, "events")
        assert hasattr(wrapper, "tool_calls")
        assert hasattr(wrapper, "memory_accesses")

    def test_accepts_client_with_request_method(self):
        """Test that wrapper accepts client with request() method."""
        client = MockMCPClientWithRequest()
        wrapper = MCPAgentWrapper(client)
        assert wrapper is not None


# =============================================================================
# Tool Call Tests
# =============================================================================


class TestMCPToolCalls:
    """Tests for MCP tool call instrumentation."""

    @pytest.fixture
    def client(self):
        """Create a mock MCP client."""
        return MockMCPClient()

    @pytest.fixture
    def wrapper(self, client):
        """Create a wrapper around mock client."""
        return MCPAgentWrapper(client)

    @pytest.mark.asyncio
    async def test_call_tool_success(self, wrapper, client):
        """Test successful tool call."""
        client.set_tool_result("search", {"results": ["result1", "result2"]})

        result = await wrapper.call_tool("search", {"query": "test"})

        assert result == {"results": ["result1", "result2"]}

    @pytest.mark.asyncio
    async def test_call_tool_records_event(self, wrapper):
        """Test that tool call records a ToolCallEvent."""
        await wrapper.call_tool("search", {"query": "python"})

        events = wrapper.tool_calls
        assert len(events) == 1
        assert events[0].tool_name == "search"
        assert events[0].success is True
        assert events[0].exception_type is None
        assert events[0].duration_ms > 0

    @pytest.mark.asyncio
    async def test_call_tool_records_arguments(self, wrapper):
        """Test that tool call records arguments."""
        await wrapper.call_tool("search", {"query": "test", "limit": 10})

        events = wrapper.tool_calls
        assert len(events) == 1
        assert "query" in events[0].arguments["keyword"]
        assert "limit" in events[0].arguments["keyword"]

    @pytest.mark.asyncio
    async def test_call_tool_error_records_failure(self):
        """Test that tool call error records failure."""
        client = MockFailingClient(RuntimeError, "Search failed")
        wrapper = MCPAgentWrapper(client)

        with pytest.raises(RuntimeError, match="Search failed"):
            await wrapper.call_tool("search", {"query": "test"})

        events = wrapper.tool_calls
        assert len(events) == 1
        assert events[0].success is False
        assert events[0].exception_type == "RuntimeError"

    @pytest.mark.asyncio
    async def test_list_tools(self, wrapper, client):
        """Test list_tools method."""
        tools = await wrapper.list_tools()

        assert len(tools) == 2
        assert tools[0]["name"] == "search"

    @pytest.mark.asyncio
    async def test_list_tools_records_event(self, wrapper):
        """Test that list_tools records an event."""
        await wrapper.list_tools()

        events = wrapper.tool_calls
        assert len(events) == 1
        assert events[0].tool_name == "mcp:tools/list"
        assert events[0].success is True

    @pytest.mark.asyncio
    async def test_list_tools_caches_result(self, wrapper):
        """Test that list_tools caches the result."""
        await wrapper.list_tools()

        cached = wrapper.get_cached_tools()
        assert cached is not None
        assert len(cached) == 2

    @pytest.mark.asyncio
    async def test_call_tool_with_request_client(self):
        """Test tool call with client that uses request() method."""
        client = MockMCPClientWithRequest()
        wrapper = MCPAgentWrapper(client)

        result = await wrapper.call_tool("test_tool", {"arg": "value"})

        assert result == {"result": "success"}

        events = wrapper.tool_calls
        assert len(events) == 1
        assert events[0].tool_name == "test_tool"


# =============================================================================
# Resource Access Tests
# =============================================================================


class TestMCPResources:
    """Tests for MCP resource access instrumentation."""

    @pytest.fixture
    def wrapper(self):
        """Create a wrapper with mock client."""
        client = MockMCPClient()
        return MCPAgentWrapper(client)

    @pytest.mark.asyncio
    async def test_read_resource_success(self, wrapper):
        """Test successful resource read."""
        result = await wrapper.read_resource("file:///tmp/test.txt")

        assert "contents" in result

    @pytest.mark.asyncio
    async def test_read_resource_records_tool_event(self, wrapper):
        """Test that read_resource records a tool call event."""
        await wrapper.read_resource("file:///tmp/test.txt")

        tool_events = wrapper.tool_calls
        assert len(tool_events) == 1
        assert tool_events[0].tool_name == "mcp:resources/read"
        assert tool_events[0].success is True

    @pytest.mark.asyncio
    async def test_read_resource_records_memory_event(self, wrapper):
        """Test that read_resource records a memory access event."""
        await wrapper.read_resource("file:///tmp/test.txt")

        memory_events = wrapper.memory_accesses
        assert len(memory_events) == 1
        assert memory_events[0].operation == MemoryAccessOperation.READ
        assert "resource:file:///tmp/test.txt" in memory_events[0].key

    @pytest.mark.asyncio
    async def test_list_resources(self, wrapper):
        """Test list_resources method."""
        resources = await wrapper.list_resources()

        assert len(resources) == 1
        assert resources[0]["uri"] == "file:///tmp/test.txt"

    @pytest.mark.asyncio
    async def test_list_resources_records_event(self, wrapper):
        """Test that list_resources records an event."""
        await wrapper.list_resources()

        events = wrapper.tool_calls
        assert len(events) == 1
        assert events[0].tool_name == "mcp:resources/list"

    @pytest.mark.asyncio
    async def test_list_resources_caches_result(self, wrapper):
        """Test that list_resources caches the result."""
        await wrapper.list_resources()

        cached = wrapper.get_cached_resources()
        assert cached is not None
        assert len(cached) == 1

    @pytest.mark.asyncio
    async def test_read_resource_error_records_failure(self):
        """Test that resource read error records failure."""
        # Use OSError as IOError is an alias for OSError in Python 3
        client = MockFailingClient(OSError, "File not found")
        wrapper = MCPAgentWrapper(client)

        with pytest.raises(OSError, match="File not found"):
            await wrapper.read_resource("file:///nonexistent")

        tool_events = wrapper.tool_calls
        assert len(tool_events) == 1
        assert tool_events[0].success is False
        assert tool_events[0].exception_type == "OSError"


# =============================================================================
# Prompt Access Tests
# =============================================================================


class TestMCPPrompts:
    """Tests for MCP prompt access instrumentation."""

    @pytest.fixture
    def wrapper(self):
        """Create a wrapper with mock client."""
        client = MockMCPClient()
        return MCPAgentWrapper(client)

    @pytest.mark.asyncio
    async def test_get_prompt_success(self, wrapper):
        """Test successful prompt retrieval."""
        result = await wrapper.get_prompt("summarize", {"text": "Long text..."})

        assert "messages" in result

    @pytest.mark.asyncio
    async def test_get_prompt_records_tool_event(self, wrapper):
        """Test that get_prompt records a tool call event."""
        await wrapper.get_prompt("summarize", {})

        tool_events = wrapper.tool_calls
        assert len(tool_events) == 1
        assert tool_events[0].tool_name == "mcp:prompts/get"
        assert tool_events[0].success is True

    @pytest.mark.asyncio
    async def test_get_prompt_records_memory_event(self, wrapper):
        """Test that get_prompt records a memory access event."""
        await wrapper.get_prompt("summarize", {})

        memory_events = wrapper.memory_accesses
        assert len(memory_events) == 1
        assert memory_events[0].operation == MemoryAccessOperation.READ
        assert "prompt:summarize" in memory_events[0].key

    @pytest.mark.asyncio
    async def test_list_prompts(self, wrapper):
        """Test list_prompts method."""
        prompts = await wrapper.list_prompts()

        assert len(prompts) == 1
        assert prompts[0]["name"] == "summarize"

    @pytest.mark.asyncio
    async def test_list_prompts_records_event(self, wrapper):
        """Test that list_prompts records an event."""
        await wrapper.list_prompts()

        events = wrapper.tool_calls
        assert len(events) == 1
        assert events[0].tool_name == "mcp:prompts/list"

    @pytest.mark.asyncio
    async def test_list_prompts_caches_result(self, wrapper):
        """Test that list_prompts caches the result."""
        await wrapper.list_prompts()

        cached = wrapper.get_cached_prompts()
        assert cached is not None
        assert len(cached) == 1


# =============================================================================
# Factory Method Tests
# =============================================================================


class TestFactoryMethods:
    """Tests for factory methods."""

    @pytest.mark.asyncio
    async def test_from_stdio_server_requires_command(self):
        """Test that from_stdio_server requires a command."""
        with pytest.raises(ValueError, match="cannot be empty"):
            await MCPAgentWrapper.from_stdio_server([])

    @pytest.mark.asyncio
    async def test_from_http_server_requires_url(self):
        """Test that from_http_server requires a URL."""
        with pytest.raises(ValueError, match="cannot be empty"):
            await MCPAgentWrapper.from_http_server("")

    @pytest.mark.asyncio
    async def test_from_http_server_validates_url_scheme(self):
        """Test that from_http_server validates URL scheme."""
        with pytest.raises(ValueError, match="must start with http"):
            await MCPAgentWrapper.from_http_server("ftp://example.com")

    @pytest.mark.asyncio
    async def test_from_stdio_server_creates_wrapper(self):
        """Test that from_stdio_server creates a wrapper."""
        # Mock subprocess
        with patch("subprocess.Popen") as mock_popen:
            mock_process = MagicMock()
            mock_process.stdin = MagicMock()
            mock_process.stdout = MagicMock()
            mock_process.stderr = MagicMock()
            mock_popen.return_value = mock_process

            wrapper = await MCPAgentWrapper.from_stdio_server(
                ["python", "-m", "test_server"]
            )

            assert wrapper is not None
            assert wrapper._process is not None

    @pytest.mark.asyncio
    async def test_from_http_server_with_custom_config(self):
        """Test from_http_server with custom config."""
        with patch.object(_HttpMCPClient, "connect", new_callable=AsyncMock):
            config = AgentInstrumentationConfig(sampling_rate=0.5)
            wrapper = await MCPAgentWrapper.from_http_server(
                "http://localhost:8080",
                config=config,
            )

            assert wrapper.config.sampling_rate == 0.5


# =============================================================================
# Stdio Client Tests
# =============================================================================


class TestStdioMCPClient:
    """Tests for _StdioMCPClient."""

    @pytest.mark.asyncio
    async def test_start_creates_process(self):
        """Test that start creates a subprocess."""
        with patch("subprocess.Popen") as mock_popen:
            mock_process = MagicMock()
            mock_process.stdin = MagicMock()
            mock_process.stdout = MagicMock()
            mock_popen.return_value = mock_process

            client = _StdioMCPClient(["python", "-m", "server"])
            await client.start()

            mock_popen.assert_called_once()
            assert client._process is not None

    @pytest.mark.asyncio
    async def test_request_sends_jsonrpc(self):
        """Test that request sends JSON-RPC."""
        client = _StdioMCPClient(["python", "-m", "server"])

        # Mock process
        client._process = MagicMock()
        client._process.stdin = MagicMock()
        client._process.stdout = MagicMock()

        # Setup mock response
        response = '{"jsonrpc": "2.0", "id": 1, "result": {"success": true}}\n'
        client._process.stdout.readline = MagicMock(return_value=response)

        result = await client.request("test/method", {"arg": "value"})

        assert result == {"success": True}
        client._process.stdin.write.assert_called_once()
        client._process.stdin.flush.assert_called_once()

    @pytest.mark.asyncio
    async def test_request_handles_error_response(self):
        """Test that request handles error responses."""
        client = _StdioMCPClient(["python", "-m", "server"])
        client._process = MagicMock()
        client._process.stdin = MagicMock()
        client._process.stdout = MagicMock()

        error_response = (
            '{"jsonrpc": "2.0", "id": 1, '
            '"error": {"code": -32600, "message": "Invalid request"}}\n'
        )
        client._process.stdout.readline = MagicMock(return_value=error_response)

        with pytest.raises(RuntimeError, match="MCP error"):
            await client.request("test/method", {})

    @pytest.mark.asyncio
    async def test_request_raises_on_closed_connection(self):
        """Test that request raises on closed connection."""
        client = _StdioMCPClient(["python", "-m", "server"])
        client._process = MagicMock()
        client._process.stdin = MagicMock()
        client._process.stdout = MagicMock()
        client._process.stdout.readline = MagicMock(return_value="")

        with pytest.raises(RuntimeError, match="closed connection"):
            await client.request("test/method", {})

    def test_close_terminates_process(self):
        """Test that close terminates the subprocess."""
        client = _StdioMCPClient(["python", "-m", "server"])
        mock_process = MagicMock()
        client._process = mock_process

        client.close()

        # Process should have been terminated and then set to None
        mock_process.terminate.assert_called_once()
        assert client._process is None

    @pytest.mark.asyncio
    async def test_convenience_methods(self):
        """Test convenience methods (call_tool, list_tools, etc.)."""
        client = _StdioMCPClient(["python", "-m", "server"])
        client._process = MagicMock()
        client._process.stdin = MagicMock()
        client._process.stdout = MagicMock()

        # Mock response for tools/list
        list_response = (
            '{"jsonrpc": "2.0", "id": 1, "result": {"tools": [{"name": "test"}]}}\n'
        )
        client._process.stdout.readline = MagicMock(return_value=list_response)

        tools = await client.list_tools()
        assert tools == [{"name": "test"}]


# =============================================================================
# HTTP Client Tests
# =============================================================================


class TestHttpMCPClient:
    """Tests for _HttpMCPClient."""

    @pytest.mark.asyncio
    async def test_connect_creates_session(self):
        """Test that connect creates an HTTP session."""
        with patch.dict("sys.modules", {"aiohttp": MagicMock()}):
            import sys

            mock_aiohttp = sys.modules["aiohttp"]
            mock_session = MagicMock()
            mock_aiohttp.ClientSession.return_value = mock_session
            mock_aiohttp.ClientTimeout = MagicMock()

            client = _HttpMCPClient("http://localhost:8080")
            await client.connect()

            assert client._session is not None

    @pytest.mark.asyncio
    async def test_close_closes_session(self):
        """Test that close closes the HTTP session."""
        client = _HttpMCPClient("http://localhost:8080")
        mock_session = AsyncMock()
        client._session = mock_session

        await client.close()

        mock_session.close.assert_called_once()
        assert client._session is None


# =============================================================================
# Context Manager Tests
# =============================================================================


class TestContextManager:
    """Tests for async context manager support."""

    @pytest.mark.asyncio
    async def test_async_context_manager(self):
        """Test wrapper can be used as async context manager."""
        client = MockMCPClient()

        async with MCPAgentWrapper(client) as wrapper:
            await wrapper.call_tool("search", {"query": "test"})
            events = wrapper.events

        assert len(events) > 0


# =============================================================================
# Edge Cases and Error Handling
# =============================================================================


class TestEdgeCases:
    """Test edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_empty_arguments(self):
        """Test tool call with no arguments."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = await wrapper.call_tool("list_all", None)

        assert result is not None

    @pytest.mark.asyncio
    async def test_very_long_result(self):
        """Test handling of very long results."""
        client = MockMCPClient()
        client.set_tool_result("big_result", {"data": "x" * 20000})
        wrapper = MCPAgentWrapper(client)

        await wrapper.call_tool("big_result", {})

        events = wrapper.tool_calls
        assert len(events) == 1
        # Result should be truncated
        assert len(events[0].result) <= 10003  # MAX + "..."

    @pytest.mark.asyncio
    async def test_special_characters_in_uri(self):
        """Test handling of special characters in resource URI."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        await wrapper.read_resource("file:///path/with spaces/test.txt")

        memory_events = wrapper.memory_accesses
        assert len(memory_events) == 1
        assert "spaces" in memory_events[0].key

    @pytest.mark.asyncio
    async def test_sampling_rate_affects_events(self):
        """Test that sampling rate affects event recording."""
        client = MockMCPClient()
        config = AgentInstrumentationConfig(sampling_rate=0.0)
        wrapper = MCPAgentWrapper(client, config)

        await wrapper.call_tool("search", {"query": "test"})

        # With 0% sampling, no events should be recorded
        assert len(wrapper.events) == 0

    @pytest.mark.asyncio
    async def test_tool_interception_disabled(self):
        """Test that tool interception can be disabled."""
        client = MockMCPClient()
        config = AgentInstrumentationConfig(enable_tool_interception=False)
        wrapper = MCPAgentWrapper(client, config)

        await wrapper.call_tool("search", {"query": "test"})

        # Tool events should not be recorded
        assert len(wrapper.tool_calls) == 0

    @pytest.mark.asyncio
    async def test_memory_monitoring_disabled(self):
        """Test that memory monitoring can be disabled."""
        client = MockMCPClient()
        config = AgentInstrumentationConfig(enable_memory_monitoring=False)
        wrapper = MCPAgentWrapper(client, config)

        await wrapper.read_resource("file:///test.txt")

        # Memory events should not be recorded
        assert len(wrapper.memory_accesses) == 0

    @pytest.mark.asyncio
    async def test_multiple_sequential_operations(self):
        """Test multiple sequential operations."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        # Multiple operations
        await wrapper.call_tool("search", {"query": "test1"})
        await wrapper.list_tools()
        await wrapper.read_resource("file:///test.txt")
        await wrapper.get_prompt("summarize", {})

        # All events should be recorded
        events = wrapper.events
        assert len(events) >= 4


# =============================================================================
# Integration Tests
# =============================================================================


class TestInvokeClient:
    """Tests for clients that use invoke() method."""

    @pytest.mark.asyncio
    async def test_call_tool_with_invoke_client(self):
        """Test tool call with client that uses invoke() method."""

        class InvokeClient:
            async def invoke(self, method: str, params: Dict[str, Any]) -> Any:
                return {"method": method, "result": "invoked"}

        wrapper = MCPAgentWrapper(InvokeClient())
        result = await wrapper.call_tool("test_tool", {"arg": "value"})

        assert result == {"method": "tools/call", "result": "invoked"}


class TestListMethodFallbacks:
    """Tests for list method fallbacks to request()."""

    @pytest.mark.asyncio
    async def test_list_tools_with_request_fallback(self):
        """Test list_tools falls back to request() method."""
        client = MockMCPClientWithRequest()
        wrapper = MCPAgentWrapper(client)

        tools = await wrapper.list_tools()
        assert tools == [{"name": "tool1"}]

    @pytest.mark.asyncio
    async def test_list_resources_with_request_fallback(self):
        """Test list_resources falls back to request() method."""
        client = MockMCPClientWithRequest()
        wrapper = MCPAgentWrapper(client)

        resources = await wrapper.list_resources()
        assert resources == [{"uri": "file:///test"}]

    @pytest.mark.asyncio
    async def test_list_prompts_with_request_fallback(self):
        """Test list_prompts falls back to request() method."""
        client = MockMCPClientWithRequest()
        wrapper = MCPAgentWrapper(client)

        prompts = await wrapper.list_prompts()
        assert prompts == [{"name": "prompt1"}]

    @pytest.mark.asyncio
    async def test_read_resource_with_request_fallback(self):
        """Test read_resource falls back to request() method."""
        client = MockMCPClientWithRequest()
        wrapper = MCPAgentWrapper(client)

        result = await wrapper.read_resource("file:///test")
        assert result == {"contents": [{"text": "content"}]}

    @pytest.mark.asyncio
    async def test_get_prompt_with_request_fallback(self):
        """Test get_prompt falls back to request() method."""
        client = MockMCPClientWithRequest()
        wrapper = MCPAgentWrapper(client)

        result = await wrapper.get_prompt("prompt1", {"arg": "value"})
        assert result == {"messages": [{"content": "prompt text"}]}


class TestErrorCases:
    """Tests for error handling in various methods."""

    @pytest.mark.asyncio
    async def test_list_tools_error(self):
        """Test error handling in list_tools."""
        client = MockFailingClient(RuntimeError, "List failed")
        # Add list_tools method that raises
        client.list_tools = AsyncMock(side_effect=RuntimeError("List failed"))
        wrapper = MCPAgentWrapper(client)

        with pytest.raises(RuntimeError, match="List failed"):
            await wrapper.list_tools()

        events = wrapper.tool_calls
        assert len(events) == 1
        assert events[0].success is False

    @pytest.mark.asyncio
    async def test_list_resources_error(self):
        """Test error handling in list_resources."""

        class FailingResourceClient:
            def __init__(self):
                pass

            async def call_tool(self, name: str, args: Dict[str, Any]) -> Any:
                return {}

            async def list_resources(self) -> List[Dict[str, Any]]:
                raise RuntimeError("Resources list failed")

        wrapper = MCPAgentWrapper(FailingResourceClient())

        with pytest.raises(RuntimeError, match="Resources list failed"):
            await wrapper.list_resources()

    @pytest.mark.asyncio
    async def test_list_prompts_error(self):
        """Test error handling in list_prompts."""

        class FailingPromptClient:
            def __init__(self):
                pass

            async def call_tool(self, name: str, args: Dict[str, Any]) -> Any:
                return {}

            async def list_prompts(self) -> List[Dict[str, Any]]:
                raise RuntimeError("Prompts list failed")

        wrapper = MCPAgentWrapper(FailingPromptClient())

        with pytest.raises(RuntimeError, match="Prompts list failed"):
            await wrapper.list_prompts()

    @pytest.mark.asyncio
    async def test_get_prompt_error(self):
        """Test error handling in get_prompt."""
        client = MockFailingClient(ValueError, "Prompt error")
        wrapper = MCPAgentWrapper(client)

        with pytest.raises(ValueError, match="Prompt error"):
            await wrapper.get_prompt("test_prompt", {})

        events = wrapper.tool_calls
        assert len(events) == 1
        assert events[0].success is False


class TestCloseBehavior:
    """Tests for close() method behavior."""

    @pytest.mark.asyncio
    async def test_close_with_async_client(self):
        """Test close() with async client close method."""

        class AsyncCloseClient:
            closed = False

            async def call_tool(self, name: str, args: Dict[str, Any]) -> Any:
                return {}

            async def close(self):
                self.closed = True

        client = AsyncCloseClient()
        wrapper = MCPAgentWrapper(client)

        await wrapper.close()
        assert client.closed

    @pytest.mark.asyncio
    async def test_close_with_sync_client(self):
        """Test close() with sync client close method."""

        class SyncCloseClient:
            closed = False

            def call_tool(self, name: str, args: Dict[str, Any]) -> Any:
                return {}

            def close(self):
                self.closed = True

        client = SyncCloseClient()
        wrapper = MCPAgentWrapper(client)

        await wrapper.close()
        assert client.closed

    @pytest.mark.asyncio
    async def test_close_with_no_close_method(self):
        """Test close() with client that has no close method."""
        client = MockMCPClient()
        # Remove close method if it exists
        if hasattr(client, "close"):
            delattr(client, "close")
        wrapper = MCPAgentWrapper(client)

        # Should not raise
        await wrapper.close()

    @pytest.mark.asyncio
    async def test_close_handles_client_error(self):
        """Test close() handles client close error gracefully."""

        class ErrorCloseClient:
            def call_tool(self, name: str, args: Dict[str, Any]) -> Any:
                return {}

            def close(self):
                raise RuntimeError("Close failed")

        wrapper = MCPAgentWrapper(ErrorCloseClient())

        # Should not raise, just log warning
        await wrapper.close()

    @pytest.mark.asyncio
    async def test_close_terminates_subprocess(self):
        """Test close() terminates subprocess."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        # Set up mock process
        mock_process = MagicMock()
        wrapper._process = mock_process

        await wrapper.close()

        mock_process.terminate.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_kills_stuck_subprocess(self):
        """Test close() kills subprocess that doesn't terminate."""
        import subprocess

        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        mock_process = MagicMock()
        mock_process.wait.side_effect = subprocess.TimeoutExpired("cmd", 5)
        wrapper._process = mock_process

        await wrapper.close()

        mock_process.terminate.assert_called_once()
        mock_process.kill.assert_called_once()


class TestSafeReprMethods:
    """Tests for _safe_content_repr and _safe_repr methods."""

    def test_safe_content_repr_none(self):
        """Test _safe_content_repr with None."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_content_repr(None)
        assert result == "null"

    def test_safe_content_repr_short_string(self):
        """Test _safe_content_repr with short string."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_content_repr("hello")
        assert result == "hello"

    def test_safe_content_repr_long_string(self):
        """Test _safe_content_repr with long string that gets truncated."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        long_string = "x" * 15000
        result = wrapper._safe_content_repr(long_string)
        assert len(result) <= 10003  # MAX_TOOL_RESULT_LENGTH + "..."
        assert result.endswith("...")

    def test_safe_content_repr_dict(self):
        """Test _safe_content_repr with dict."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_content_repr({"key": "value"})
        assert "key" in result
        assert "value" in result

    def test_safe_content_repr_list(self):
        """Test _safe_content_repr with list."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_content_repr([1, 2, 3])
        assert "[1, 2, 3]" in result

    def test_safe_content_repr_other_type(self):
        """Test _safe_content_repr with other type (uses repr)."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_content_repr(42)
        assert result == "42"

    def test_safe_content_repr_long_dict(self):
        """Test _safe_content_repr with very long dict."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        big_dict = {"key": "x" * 15000}
        result = wrapper._safe_content_repr(big_dict)
        assert len(result) <= 10003
        assert result.endswith("...")

    def test_safe_content_repr_unrepresentable(self):
        """Test _safe_content_repr with object that fails to serialize."""

        class Unserializable:
            def __repr__(self):
                raise RuntimeError("Cannot repr")

        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_content_repr(Unserializable())
        assert result == "<unrepresentable>"

    def test_safe_repr_short_object(self):
        """Test _safe_repr with short object."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_repr("hello")
        assert "hello" in result

    def test_safe_repr_long_object(self):
        """Test _safe_repr with long object."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_repr("x" * 2000)
        assert len(result) <= 1003
        assert result.endswith("...")

    def test_safe_repr_unrepresentable(self):
        """Test _safe_repr with object that fails to repr."""

        class Unrepresentable:
            def __repr__(self):
                raise RuntimeError("Cannot repr")

        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        result = wrapper._safe_repr(Unrepresentable())
        assert result == "<unrepresentable>"


class TestNotImplementedPaths:
    """Tests for paths that raise NotImplementedError."""

    @pytest.mark.asyncio
    async def test_call_tool_no_method(self):
        """Test call_tool with client that has no supported method."""

        class MinimalClient:
            # Has call_tool to pass validation, but we'll delete it
            pass

        # Create wrapper with minimal client
        client = MinimalClient()
        # Add dummy method for validation
        client.call_tool = lambda n, a: None

        wrapper = MCPAgentWrapper(client)
        # Now remove the method
        del client.call_tool

        with pytest.raises(NotImplementedError, match="no tool call method"):
            await wrapper.call_tool("test", {})

    @pytest.mark.asyncio
    async def test_list_tools_no_method(self):
        """Test list_tools with client that has no supported method."""

        class MinimalClient:
            async def call_tool(self, n: str, a: Dict[str, Any]) -> Any:
                return {}

        wrapper = MCPAgentWrapper(MinimalClient())

        with pytest.raises(NotImplementedError, match="no list_tools method"):
            await wrapper.list_tools()

    @pytest.mark.asyncio
    async def test_list_resources_no_method(self):
        """Test list_resources with client that has no supported method."""

        class MinimalClient:
            async def call_tool(self, n: str, a: Dict[str, Any]) -> Any:
                return {}

        wrapper = MCPAgentWrapper(MinimalClient())

        with pytest.raises(NotImplementedError, match="no list_resources method"):
            await wrapper.list_resources()

    @pytest.mark.asyncio
    async def test_list_prompts_no_method(self):
        """Test list_prompts with client that has no supported method."""

        class MinimalClient:
            async def call_tool(self, n: str, a: Dict[str, Any]) -> Any:
                return {}

        wrapper = MCPAgentWrapper(MinimalClient())

        with pytest.raises(NotImplementedError, match="no list_prompts method"):
            await wrapper.list_prompts()

    @pytest.mark.asyncio
    async def test_read_resource_no_method(self):
        """Test read_resource with client that has no supported method."""

        class MinimalClient:
            async def call_tool(self, n: str, a: Dict[str, Any]) -> Any:
                return {}

        wrapper = MCPAgentWrapper(MinimalClient())

        with pytest.raises(NotImplementedError, match="no read_resource method"):
            await wrapper.read_resource("file:///test")

    @pytest.mark.asyncio
    async def test_get_prompt_no_method(self):
        """Test get_prompt with client that has no supported method."""

        class MinimalClient:
            async def call_tool(self, n: str, a: Dict[str, Any]) -> Any:
                return {}

        wrapper = MCPAgentWrapper(MinimalClient())

        with pytest.raises(NotImplementedError, match="no get_prompt method"):
            await wrapper.get_prompt("test", {})


class TestMCPIntegration:
    """Integration tests for the full MCP flow."""

    @pytest.mark.asyncio
    async def test_full_workflow(self):
        """Test complete workflow: list tools, call tool, read resource."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        # List available tools
        tools = await wrapper.list_tools()
        assert len(tools) > 0

        # Call a tool
        result = await wrapper.call_tool("search", {"query": "python"})
        assert result is not None

        # Read a resource
        content = await wrapper.read_resource("file:///tmp/test.txt")
        assert content is not None

        # Check all events were captured
        events = wrapper.events
        assert len(events) >= 3

        # Verify event types
        tool_calls = wrapper.tool_calls
        memory_accesses = wrapper.memory_accesses

        assert len(tool_calls) >= 2  # list_tools + call_tool + read_resource
        assert len(memory_accesses) >= 1  # read_resource

    @pytest.mark.asyncio
    async def test_clear_events_between_operations(self):
        """Test clearing events between operations."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        # First operation
        await wrapper.call_tool("search", {"query": "test1"})
        assert len(wrapper.events) > 0

        # Clear events
        wrapper.clear_events()
        assert len(wrapper.events) == 0

        # Second operation
        await wrapper.call_tool("search", {"query": "test2"})
        assert len(wrapper.events) > 0

    @pytest.mark.asyncio
    async def test_events_contain_correct_session_id(self):
        """Test that all events have the same session ID."""
        client = MockMCPClient()
        wrapper = MCPAgentWrapper(client)

        await wrapper.call_tool("search", {"query": "test"})
        await wrapper.read_resource("file:///test.txt")

        events = wrapper.events
        session_ids = {e.session_id for e in events}

        # All events should have the same session ID
        assert len(session_ids) == 1
