# src/integrations/mcp_adapter.py
"""
MCP (Model Context Protocol) integration adapter for The Red Council.

This adapter provides security testing capabilities for MCP-based agents.

This module provides MCPAgentWrapper which wraps MCP clients for security monitoring.
It captures tool calls, resource access, and prompts as instrumented events.

The Model Context Protocol (MCP) is a protocol for connecting AI models to external
tools and data sources. This adapter allows security testing of MCP-based agents.

Usage:
    from src.integrations.mcp_adapter import MCPAgentWrapper
    from src.core.agent_schemas import AgentInstrumentationConfig

    # Method 1: Wrap an existing MCP client
    config = AgentInstrumentationConfig()
    wrapper = MCPAgentWrapper(client, config)

    # Method 2: Create from stdio server
    wrapper = await MCPAgentWrapper.from_stdio_server(
        ["python", "-m", "my_mcp_server"]
    )

    # Method 3: Create from HTTP server
    wrapper = await MCPAgentWrapper.from_http_server(
        "http://localhost:8080/mcp"
    )

    # Call tools and capture events
    result = await wrapper.call_tool("my_tool", {"arg": "value"})

    # Get events for analysis
    events = wrapper.events

Note: mcp is an optional dependency. This module uses runtime type checking
to work with or without mcp installed.
"""

import asyncio
import json
import logging
import subprocess
import time
from typing import Any, Dict, List, Optional

from src.agents.instrumented import InstrumentedAgent
from src.core.agent_schemas import (
    AgentInstrumentationConfig,
    ToolCallEvent,
    MemoryAccessOperation,
)

logger = logging.getLogger(__name__)

# Maximum lengths for safety
MAX_TOOL_RESULT_LENGTH = 10000
MAX_RESOURCE_CONTENT_LENGTH = 10000
MAX_PROMPT_CONTENT_LENGTH = 10000


class MCPAgentWrapper(InstrumentedAgent):
    """
    Wrapper for MCP (Model Context Protocol) clients for security instrumentation.

    This class extends InstrumentedAgent to automatically intercept and record
    all MCP operations including tool calls, resource access, and prompt retrieval.

    Features:
    - Tool call interception via MCP protocol
    - Resource access monitoring (resources/read, resources/list)
    - Prompt tracking as memory operations
    - Support for MCP-over-stdio and MCP-over-HTTP transports
    - Compatible with any MCP client implementation

    Supported MCP Operations:
    - tools/list: List available tools
    - tools/call: Execute a tool
    - resources/list: List available resources
    - resources/read: Read a resource
    - prompts/list: List available prompts
    - prompts/get: Get a prompt template

    Usage:
        # Direct client wrapping
        wrapper = MCPAgentWrapper(mcp_client)

        # From stdio server (recommended for local servers)
        wrapper = await MCPAgentWrapper.from_stdio_server(
            ["python", "-m", "my_server"]
        )

        # From HTTP server
        wrapper = await MCPAgentWrapper.from_http_server(
            "http://localhost:8080/mcp"
        )

        # Execute operations with instrumentation
        tools = await wrapper.list_tools()
        result = await wrapper.call_tool("search", {"query": "test"})

        # Get recorded events for security analysis
        events = wrapper.events
        tool_calls = wrapper.tool_calls
    """

    def __init__(
        self,
        client: Any,  # MCP Client
        config: Optional[AgentInstrumentationConfig] = None,
    ):
        """
        Initialize the MCP wrapper.

        Args:
            client: An MCP client instance with call/request methods.
            config: Optional instrumentation configuration. Defaults to standard config.

        Raises:
            ValueError: If client is None.
            TypeError: If client doesn't have expected MCP client interface.
        """
        if client is None:
            raise ValueError("client cannot be None")

        # Validate client has expected interface
        # MCP clients have call_tool, read_resource, or a generic request method
        has_tool_method = hasattr(client, "call_tool")
        has_request_method = hasattr(client, "request") or hasattr(client, "send")
        has_invoke_method = hasattr(client, "invoke")

        if not (has_tool_method or has_request_method or has_invoke_method):
            raise TypeError(
                "client must have 'call_tool', 'request', 'send', or 'invoke' method. "
                "Expected MCP client or compatible interface."
            )

        if config is None:
            config = AgentInstrumentationConfig()

        # Determine client name
        client_name = getattr(client, "name", None) or type(client).__name__

        # Initialize parent
        super().__init__(
            agent=client,
            name=f"mcp:{client_name}",
            config=config,
        )

        # Store original client
        self._client = client

        # Track subprocess for stdio transport
        self._process: Optional[subprocess.Popen] = None

        # Track HTTP endpoint for HTTP transport
        self._http_url: Optional[str] = None

        # Cache for tool/resource metadata
        self._tools_cache: Optional[List[Dict[str, Any]]] = None
        self._resources_cache: Optional[List[Dict[str, Any]]] = None
        self._prompts_cache: Optional[List[Dict[str, Any]]] = None

    @classmethod
    async def from_stdio_server(
        cls,
        command: List[str],
        config: Optional[AgentInstrumentationConfig] = None,
        env: Optional[Dict[str, str]] = None,
        cwd: Optional[str] = None,
    ) -> "MCPAgentWrapper":
        """
        Create an MCPAgentWrapper from an MCP stdio server.

        This method launches an MCP server as a subprocess and communicates
        with it via stdin/stdout using JSON-RPC.

        Args:
            command: Command to launch the MCP server
                (e.g., ["python", "-m", "server"]).
            config: Optional instrumentation configuration.
            env: Optional environment variables for the subprocess.
            cwd: Optional working directory for the subprocess.

        Returns:
            A configured MCPAgentWrapper instance.

        Raises:
            ValueError: If command is empty.
            RuntimeError: If server fails to start.

        Example:
            wrapper = await MCPAgentWrapper.from_stdio_server(
                ["uvx", "mcp-server-filesystem", "/tmp"],
                config=AgentInstrumentationConfig()
            )
            result = await wrapper.call_tool("read_file", {"path": "/tmp/test.txt"})

        Security Note:
            The command is executed as a subprocess. Ensure command arguments
            are validated and not constructed from untrusted user input.
        """
        if not command:
            raise ValueError("command cannot be empty")

        # Create a stdio MCP client wrapper
        client = _StdioMCPClient(command=command, env=env, cwd=cwd)
        await client.start()

        wrapper = cls(client=client, config=config)
        wrapper._process = client._process
        return wrapper

    @classmethod
    async def from_http_server(
        cls,
        url: str,
        config: Optional[AgentInstrumentationConfig] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 30.0,
    ) -> "MCPAgentWrapper":
        """
        Create an MCPAgentWrapper from an MCP HTTP server.

        This method connects to an MCP server via HTTP/HTTPS using JSON-RPC.

        Args:
            url: URL of the MCP server endpoint.
            config: Optional instrumentation configuration.
            headers: Optional HTTP headers (e.g., for authentication).
            timeout: Request timeout in seconds.

        Returns:
            A configured MCPAgentWrapper instance.

        Raises:
            ValueError: If url is empty or invalid.

        Example:
            wrapper = await MCPAgentWrapper.from_http_server(
                "http://localhost:8080/mcp",
                headers={"Authorization": "Bearer token123"}
            )
            result = await wrapper.call_tool("search", {"query": "test"})

        Security Note:
            - Use HTTPS for production deployments.
            - Validate the server URL before connecting.
            - Store authentication tokens securely.
        """
        if not url:
            raise ValueError("url cannot be empty")

        # Basic URL validation
        if not url.startswith(("http://", "https://")):
            raise ValueError("url must start with http:// or https://")

        # Create an HTTP MCP client wrapper
        client = _HttpMCPClient(url=url, headers=headers, timeout=timeout)
        await client.connect()

        wrapper = cls(client=client, config=config)
        wrapper._http_url = url
        return wrapper

    async def call_tool(
        self,
        tool_name: str,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Call an MCP tool with instrumentation.

        Args:
            tool_name: Name of the tool to call.
            arguments: Optional arguments to pass to the tool.

        Returns:
            The tool's result.

        Raises:
            Exception: If the tool call fails.

        Example:
            result = await wrapper.call_tool(
                "read_file",
                {"path": "/tmp/test.txt"}
            )
        """
        if arguments is None:
            arguments = {}

        start_time = time.perf_counter()
        success = True
        exception_type = None
        result = None

        try:
            # Call the underlying client
            if hasattr(self._client, "call_tool"):
                result = await self._client.call_tool(tool_name, arguments)
            elif hasattr(self._client, "request"):
                result = await self._client.request(
                    "tools/call",
                    {"name": tool_name, "arguments": arguments},
                )
            elif hasattr(self._client, "invoke"):
                result = await self._client.invoke(
                    "tools/call",
                    {"name": tool_name, "arguments": arguments},
                )
            else:
                raise NotImplementedError("Client has no tool call method")

            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000
            self._record_tool_call(
                tool_name=tool_name,
                arguments=arguments,
                result=result,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )

    async def list_tools(self) -> List[Dict[str, Any]]:
        """
        List available MCP tools with instrumentation.

        Returns:
            List of tool definitions.

        Example:
            tools = await wrapper.list_tools()
            for tool in tools:
                desc = tool.get('description', 'No description')
                print(f"Tool: {tool['name']} - {desc}")
        """
        start_time = time.perf_counter()
        success = True
        exception_type = None
        result: List[Dict[str, Any]] = []

        try:
            if hasattr(self._client, "list_tools"):
                result = await self._client.list_tools()
            elif hasattr(self._client, "request"):
                response = await self._client.request("tools/list", {})
                result = response.get("tools", []) if isinstance(response, dict) else []
            else:
                raise NotImplementedError("Client has no list_tools method")

            self._tools_cache = result
            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000
            self._record_tool_call(
                tool_name="mcp:tools/list",
                arguments={},
                result=f"[{len(result)} tools]" if success else None,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )

    async def read_resource(
        self,
        uri: str,
    ) -> Any:
        """
        Read an MCP resource with instrumentation.

        Resources in MCP provide access to data like files, database records,
        or API responses.

        Args:
            uri: URI of the resource to read.

        Returns:
            The resource content.

        Example:
            content = await wrapper.read_resource("file:///tmp/test.txt")
        """
        start_time = time.perf_counter()
        success = True
        exception_type = None
        result = None

        try:
            if hasattr(self._client, "read_resource"):
                result = await self._client.read_resource(uri)
            elif hasattr(self._client, "request"):
                result = await self._client.request(
                    "resources/read",
                    {"uri": uri},
                )
            else:
                raise NotImplementedError("Client has no read_resource method")

            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Record as tool call and memory access (resource read = memory read)
            self._record_tool_call(
                tool_name="mcp:resources/read",
                arguments={"uri": uri},
                result=self._safe_content_repr(result) if success else None,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )

            # Also record as memory access for security analysis
            if self.config.enable_memory_monitoring:
                self.wrap_memory_access(
                    operation=MemoryAccessOperation.READ,
                    key=f"resource:{uri}",
                    value=self._safe_content_repr(result) if success else None,
                    success=success,
                    exception_type=exception_type,
                )

    async def list_resources(self) -> List[Dict[str, Any]]:
        """
        List available MCP resources with instrumentation.

        Returns:
            List of resource definitions.

        Example:
            resources = await wrapper.list_resources()
            for resource in resources:
                print(f"Resource: {resource['uri']}")
        """
        start_time = time.perf_counter()
        success = True
        exception_type = None
        result: List[Dict[str, Any]] = []

        try:
            if hasattr(self._client, "list_resources"):
                result = await self._client.list_resources()
            elif hasattr(self._client, "request"):
                response = await self._client.request("resources/list", {})
                result = (
                    response.get("resources", []) if isinstance(response, dict) else []
                )
            else:
                raise NotImplementedError("Client has no list_resources method")

            self._resources_cache = result
            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000
            self._record_tool_call(
                tool_name="mcp:resources/list",
                arguments={},
                result=f"[{len(result)} resources]" if success else None,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )

    async def get_prompt(
        self,
        prompt_name: str,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Get an MCP prompt template with instrumentation.

        Prompts in MCP are reusable templates that can be parameterized.

        Args:
            prompt_name: Name of the prompt to retrieve.
            arguments: Optional arguments for the prompt template.

        Returns:
            The prompt content.

        Example:
            prompt = await wrapper.get_prompt(
                "summarize",
                {"text": "Long text to summarize..."}
            )
        """
        if arguments is None:
            arguments = {}

        start_time = time.perf_counter()
        success = True
        exception_type = None
        result = None

        try:
            if hasattr(self._client, "get_prompt"):
                result = await self._client.get_prompt(prompt_name, arguments)
            elif hasattr(self._client, "request"):
                result = await self._client.request(
                    "prompts/get",
                    {"name": prompt_name, "arguments": arguments},
                )
            else:
                raise NotImplementedError("Client has no get_prompt method")

            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000

            # Record as tool call
            self._record_tool_call(
                tool_name="mcp:prompts/get",
                arguments={"name": prompt_name, **arguments},
                result=self._safe_content_repr(result) if success else None,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )

            # Also record as memory access (prompt retrieval is like memory read)
            if self.config.enable_memory_monitoring:
                self.wrap_memory_access(
                    operation=MemoryAccessOperation.READ,
                    key=f"prompt:{prompt_name}",
                    value=self._safe_content_repr(result) if success else None,
                    success=success,
                    exception_type=exception_type,
                )

    async def list_prompts(self) -> List[Dict[str, Any]]:
        """
        List available MCP prompts with instrumentation.

        Returns:
            List of prompt definitions.

        Example:
            prompts = await wrapper.list_prompts()
            for prompt in prompts:
                print(f"Prompt: {prompt['name']}")
        """
        start_time = time.perf_counter()
        success = True
        exception_type = None
        result: List[Dict[str, Any]] = []

        try:
            if hasattr(self._client, "list_prompts"):
                result = await self._client.list_prompts()
            elif hasattr(self._client, "request"):
                response = await self._client.request("prompts/list", {})
                result = (
                    response.get("prompts", []) if isinstance(response, dict) else []
                )
            else:
                raise NotImplementedError("Client has no list_prompts method")

            self._prompts_cache = result
            return result
        except Exception as e:
            success = False
            exception_type = type(e).__name__
            raise
        finally:
            duration_ms = (time.perf_counter() - start_time) * 1000
            self._record_tool_call(
                tool_name="mcp:prompts/list",
                arguments={},
                result=f"[{len(result)} prompts]" if success else None,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )

    def _record_tool_call(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        result: Any,
        duration_ms: float,
        success: bool,
        exception_type: Optional[str],
    ) -> None:
        """Record an MCP operation as a tool call event."""
        if not self.config.enable_tool_interception:
            return

        try:
            # Prepare arguments for logging
            args_repr = {
                "positional": [],
                "keyword": {k: self._safe_repr(v) for k, v in arguments.items()},
            }

            event = ToolCallEvent(
                session_id=self._session_id,
                tool_name=tool_name,
                arguments=args_repr,
                result=self._safe_content_repr(result) if success else None,
                duration_ms=duration_ms,
                success=success,
                exception_type=exception_type,
            )
            self._add_event(event)
        except Exception as e:
            logger.error(f"Failed to record MCP tool call event: {type(e).__name__}")

    def _safe_content_repr(
        self,
        content: Any,
        max_len: int = MAX_TOOL_RESULT_LENGTH,
    ) -> str:
        """Safely represent MCP content as a string with truncation."""
        try:
            if content is None:
                return "null"
            if isinstance(content, str):
                if len(content) > max_len:
                    return content[: max_len - 3] + "..."
                return content
            if isinstance(content, (dict, list)):
                s = json.dumps(content, default=str)
                if len(s) > max_len:
                    return s[: max_len - 3] + "..."
                return s
            s = repr(content)
            if len(s) > max_len:
                return s[: max_len - 3] + "..."
            return s
        except Exception:
            return "<unrepresentable>"

    def _safe_repr(self, obj: Any, max_len: int = 1000) -> str:
        """Safely represent an object as a string with truncation."""
        try:
            s = repr(obj)
            if len(s) > max_len:
                return s[:max_len] + "..."
            return s
        except Exception:
            return "<unrepresentable>"

    async def close(self) -> None:
        """
        Close the MCP connection and cleanup resources.

        This should be called when done with the wrapper to ensure
        subprocess and network connections are properly closed.
        """
        if hasattr(self._client, "close"):
            try:
                result = self._client.close()
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.warning(f"Error closing MCP client: {type(e).__name__}")

        if self._process is not None:
            try:
                self._process.terminate()
                self._process.wait(timeout=5)
            except Exception as e:
                logger.warning(f"Error terminating MCP process: {type(e).__name__}")
                try:
                    self._process.kill()
                except Exception:
                    pass
            finally:
                self._process = None

    async def __aenter__(self) -> "MCPAgentWrapper":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit - cleanup resources."""
        await self.close()

    def get_cached_tools(self) -> Optional[List[Dict[str, Any]]]:
        """Get cached tool definitions from previous list_tools call."""
        return self._tools_cache

    def get_cached_resources(self) -> Optional[List[Dict[str, Any]]]:
        """Get cached resource definitions from previous list_resources call."""
        return self._resources_cache

    def get_cached_prompts(self) -> Optional[List[Dict[str, Any]]]:
        """Get cached prompt definitions from previous list_prompts call."""
        return self._prompts_cache


class _StdioMCPClient:
    """
    Internal MCP client for stdio transport.

    This class manages a subprocess running an MCP server and communicates
    with it via stdin/stdout using JSON-RPC.

    Security Note:
        - Command arguments should be validated before use.
        - The subprocess runs with the same permissions as the parent process.
    """

    def __init__(
        self,
        command: List[str],
        env: Optional[Dict[str, str]] = None,
        cwd: Optional[str] = None,
    ):
        self._command = command
        self._env = env
        self._cwd = cwd
        self._process: Optional[subprocess.Popen] = None
        self._request_id = 0
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        """Start the MCP server subprocess."""
        try:
            self._process = subprocess.Popen(
                self._command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=self._env,
                cwd=self._cwd,
                text=True,
            )
            logger.debug(f"Started MCP server: {self._command[0]}")
        except Exception as e:
            raise RuntimeError(f"Failed to start MCP server: {e}") from e

    async def request(
        self,
        method: str,
        params: Dict[str, Any],
    ) -> Any:
        """Send a JSON-RPC request to the MCP server."""
        if self._process is None:
            raise RuntimeError("MCP server not started")

        async with self._lock:
            self._request_id += 1
            request_id = self._request_id

            request = {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params,
            }

            try:
                # Write request
                request_line = json.dumps(request) + "\n"
                if self._process.stdin is None:
                    raise RuntimeError("MCP server stdin is not available")
                self._process.stdin.write(request_line)
                self._process.stdin.flush()

                # Read response
                if self._process.stdout is None:
                    raise RuntimeError("MCP server stdout is not available")

                # Use asyncio for non-blocking read
                loop = asyncio.get_event_loop()
                response_line = await loop.run_in_executor(
                    None, self._process.stdout.readline
                )

                if not response_line:
                    raise RuntimeError("MCP server closed connection")

                response = json.loads(response_line)

                if "error" in response:
                    error = response["error"]
                    raise RuntimeError(
                        f"MCP error {error.get('code', 'unknown')}: "
                        f"{error.get('message', 'Unknown error')}"
                    )

                return response.get("result")

            except json.JSONDecodeError as e:
                raise RuntimeError(f"Invalid JSON from MCP server: {e}") from e

    async def call_tool(
        self,
        name: str,
        arguments: Dict[str, Any],
    ) -> Any:
        """Call an MCP tool."""
        return await self.request("tools/call", {"name": name, "arguments": arguments})

    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        result = await self.request("tools/list", {})
        return result.get("tools", []) if isinstance(result, dict) else []

    async def read_resource(self, uri: str) -> Any:
        """Read a resource."""
        return await self.request("resources/read", {"uri": uri})

    async def list_resources(self) -> List[Dict[str, Any]]:
        """List available resources."""
        result = await self.request("resources/list", {})
        return result.get("resources", []) if isinstance(result, dict) else []

    async def get_prompt(
        self,
        name: str,
        arguments: Dict[str, Any],
    ) -> Any:
        """Get a prompt."""
        return await self.request("prompts/get", {"name": name, "arguments": arguments})

    async def list_prompts(self) -> List[Dict[str, Any]]:
        """List available prompts."""
        result = await self.request("prompts/list", {})
        return result.get("prompts", []) if isinstance(result, dict) else []

    def close(self) -> None:
        """Close the subprocess."""
        if self._process is not None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None


class _HttpMCPClient:
    """
    Internal MCP client for HTTP transport.

    This class communicates with an MCP server via HTTP/HTTPS using JSON-RPC.

    Security Note:
        - Use HTTPS for production deployments.
        - Validate server certificates.
        - Store credentials securely.
    """

    def __init__(
        self,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        timeout: float = 30.0,
    ):
        self._url = url
        self._headers = headers or {}
        self._timeout = timeout
        self._request_id = 0
        self._session: Optional[Any] = None  # aiohttp.ClientSession

    async def connect(self) -> None:
        """Initialize the HTTP client session."""
        try:
            import aiohttp

            self._session = aiohttp.ClientSession(
                headers=self._headers,
                timeout=aiohttp.ClientTimeout(total=self._timeout),
            )
            logger.debug(f"Connected to MCP server: {self._url}")
        except ImportError:
            # Fallback: use httpx if aiohttp not available
            try:
                import httpx

                self._session = httpx.AsyncClient(
                    headers=self._headers,
                    timeout=self._timeout,
                )
                logger.debug(f"Connected to MCP server (httpx): {self._url}")
            except ImportError:
                raise RuntimeError(
                    "No HTTP client available. Install aiohttp or httpx: "
                    "pip install aiohttp or pip install httpx"
                )

    async def request(
        self,
        method: str,
        params: Dict[str, Any],
    ) -> Any:
        """Send a JSON-RPC request to the MCP server."""
        if self._session is None:
            raise RuntimeError("HTTP client not connected")

        self._request_id += 1
        request_id = self._request_id

        request_body = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        }

        try:
            # Detect session type and make request accordingly
            if hasattr(self._session, "post"):
                # aiohttp or httpx style
                if hasattr(self._session, "request"):
                    # httpx
                    response = await self._session.post(self._url, json=request_body)
                    response_data = response.json()
                else:
                    # aiohttp
                    async with self._session.post(
                        self._url, json=request_body
                    ) as response:
                        response_data = await response.json()
            else:
                raise RuntimeError("Unknown HTTP client type")

            if "error" in response_data:
                error = response_data["error"]
                raise RuntimeError(
                    f"MCP error {error.get('code', 'unknown')}: "
                    f"{error.get('message', 'Unknown error')}"
                )

            return response_data.get("result")

        except Exception as e:
            if "MCP error" in str(e):
                raise
            raise RuntimeError(f"HTTP request failed: {e}") from e

    async def call_tool(
        self,
        name: str,
        arguments: Dict[str, Any],
    ) -> Any:
        """Call an MCP tool."""
        return await self.request("tools/call", {"name": name, "arguments": arguments})

    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools."""
        result = await self.request("tools/list", {})
        return result.get("tools", []) if isinstance(result, dict) else []

    async def read_resource(self, uri: str) -> Any:
        """Read a resource."""
        return await self.request("resources/read", {"uri": uri})

    async def list_resources(self) -> List[Dict[str, Any]]:
        """List available resources."""
        result = await self.request("resources/list", {})
        return result.get("resources", []) if isinstance(result, dict) else []

    async def get_prompt(
        self,
        name: str,
        arguments: Dict[str, Any],
    ) -> Any:
        """Get a prompt."""
        return await self.request("prompts/get", {"name": name, "arguments": arguments})

    async def list_prompts(self) -> List[Dict[str, Any]]:
        """List available prompts."""
        result = await self.request("prompts/list", {})
        return result.get("prompts", []) if isinstance(result, dict) else []

    async def close(self) -> None:
        """Close the HTTP session."""
        if self._session is not None:
            await self._session.close()
            self._session = None
