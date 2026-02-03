# src/ui/components/remote_agent_config.py
"""
Remote Agent Configuration panel for testing external HTTP agents.

This component allows users to configure a remote agent endpoint
for security testing without requiring code changes to the agent.

Supports:
- OpenAI-compatible API endpoints
- Custom JSON request/response templates
- Multiple authentication methods
"""

import html
import json
import logging
import os
import re
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import streamlit as st

logger = logging.getLogger(__name__)

# Session state keys
REMOTE_AGENT_CONFIG_KEY = "remote_agent_config"
REMOTE_AGENT_TEST_RESULT_KEY = "remote_agent_test_result"

# Persistence settings
REMOTE_AGENT_CONFIG_PATH_ENV = "RC_REMOTE_AGENT_CONFIG_PATH"
REMOTE_AGENT_CONFIG_DIR = Path("data")
REMOTE_AGENT_CONFIG_FILENAME = "remote_agent_config.json"

# Type aliases
AuthType = Literal["none", "bearer", "api_key_header"]
RequestFormat = Literal["openai_compatible", "custom"]
ResponseFormat = Literal["text", "json_path"]

# Auth type display names
AUTH_TYPE_NAMES = {
    "none": "No Authentication",
    "bearer": "Bearer Token",
    "api_key_header": "API Key Header",
}

# Request format display names
REQUEST_FORMAT_NAMES = {
    "openai_compatible": "OpenAI-Compatible",
    "custom": "Custom JSON Template",
}

# Response format display names
RESPONSE_FORMAT_NAMES = {
    "text": "Plain Text",
    "json_path": "JSON Path Extraction",
}


@dataclass
class RemoteAgentConfig:
    """Configuration for a remote HTTP agent endpoint."""

    # Endpoint configuration
    endpoint_url: str = ""
    timeout_seconds: int = 30

    # Authentication
    auth_type: AuthType = "none"
    auth_token: str = ""
    api_key_header_name: str = "X-API-Key"

    # Request format
    request_format: RequestFormat = "openai_compatible"
    custom_request_template: str = '{"prompt": "{{prompt}}"}'

    # Response format
    response_format: ResponseFormat = "text"
    json_path: str = "$.response"

    def to_dict(self) -> dict[str, Any]:
        """Serialize configuration to dictionary."""
        return {
            "endpoint_url": self.endpoint_url,
            "timeout_seconds": self.timeout_seconds,
            "auth_type": self.auth_type,
            "auth_token": self.auth_token,
            "api_key_header_name": self.api_key_header_name,
            "request_format": self.request_format,
            "custom_request_template": self.custom_request_template,
            "response_format": self.response_format,
            "json_path": self.json_path,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RemoteAgentConfig":
        """Deserialize configuration from dictionary."""
        return cls(
            endpoint_url=data.get("endpoint_url", ""),
            timeout_seconds=data.get("timeout_seconds", 30),
            auth_type=data.get("auth_type", "none"),
            auth_token=data.get("auth_token", ""),
            api_key_header_name=data.get("api_key_header_name", "X-API-Key"),
            request_format=data.get("request_format", "openai_compatible"),
            custom_request_template=data.get(
                "custom_request_template", '{"prompt": "{{prompt}}"}'
            ),
            response_format=data.get("response_format", "text"),
            json_path=data.get("json_path", "$.response"),
        )


def _validate_url(url: str) -> tuple[bool, str]:
    """Validate an HTTP/HTTPS URL.

    Args:
        url: The URL to validate.

    Returns:
        Tuple of (is_valid, error_message).
    """
    if not url:
        return False, "URL is required"

    # Basic URL pattern validation
    url_pattern = re.compile(
        r"^https?://"  # http:// or https://
        r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+"  # domain
        r"[A-Z]{2,6}\.?|"  # domain extension
        r"localhost|"  # localhost
        r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"  # IP address
        r"(?::\d+)?"  # optional port
        r"(?:/?|[/?]\S+)$",  # path
        re.IGNORECASE,
    )

    if not url_pattern.match(url):
        return False, "Invalid URL format. Must start with http:// or https://"

    return True, ""


def _validate_json_template(template: str) -> tuple[bool, str]:
    """Validate a JSON template contains required placeholder.

    Args:
        template: The JSON template string.

    Returns:
        Tuple of (is_valid, error_message).
    """
    if not template:
        return False, "Template is required"

    # Check for placeholder
    if "{{prompt}}" not in template:
        return False, "Template must contain {{prompt}} placeholder"

    # Try to parse as JSON (with placeholder replaced)
    test_template = template.replace("{{prompt}}", "test")
    try:
        json.loads(test_template)
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON format: {e}"

    return True, ""


def _validate_json_path(json_path: str) -> tuple[bool, str]:
    """Validate a JSON path expression.

    Args:
        json_path: The JSON path expression.

    Returns:
        Tuple of (is_valid, error_message).
    """
    if not json_path:
        return False, "JSON path is required"

    # Basic JSONPath validation (must start with $ or $.)
    if not json_path.startswith("$"):
        return False, "JSON path must start with $"

    # Check for basic valid characters
    valid_pattern = re.compile(r"^[\$\.\[\]a-zA-Z0-9_*@?'\"]+$")
    if not valid_pattern.match(json_path):
        return False, "JSON path contains invalid characters"

    return True, ""


def _get_or_create_config() -> RemoteAgentConfig:
    """Get existing config from session state or create default."""
    if REMOTE_AGENT_CONFIG_KEY not in st.session_state:
        loaded = _load_config_from_disk()
        st.session_state[REMOTE_AGENT_CONFIG_KEY] = loaded or RemoteAgentConfig()
    # session_state returns Any; cast for mypy
    config: RemoteAgentConfig = st.session_state[REMOTE_AGENT_CONFIG_KEY]
    return config


def _save_config(config: RemoteAgentConfig) -> None:
    """Save configuration to session state."""
    st.session_state[REMOTE_AGENT_CONFIG_KEY] = config
    try:
        _persist_config_to_disk(config)
    except Exception as exc:
        logger.warning(f"Failed to persist remote agent config: {exc}")


def _get_config_path() -> Path:
    """Resolve the storage path for the remote agent config."""
    env_path = os.getenv(REMOTE_AGENT_CONFIG_PATH_ENV)
    if env_path:
        return Path(env_path).expanduser()
    return REMOTE_AGENT_CONFIG_DIR / REMOTE_AGENT_CONFIG_FILENAME


def _load_config_from_disk() -> RemoteAgentConfig | None:
    """Load configuration from disk if present."""
    path = _get_config_path()
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return RemoteAgentConfig.from_dict(data)
    except Exception as exc:
        logger.warning(f"Failed to load remote agent config: {exc}")
        return None


def _persist_config_to_disk(config: RemoteAgentConfig) -> None:
    """Persist configuration to disk with atomic write."""
    path = _get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(config.to_dict(), handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                logger.warning("Failed to remove temporary config file.")


def _build_request_headers(config: RemoteAgentConfig) -> dict[str, str]:
    """Build HTTP headers based on authentication configuration.

    Args:
        config: The remote agent configuration.

    Returns:
        Dictionary of HTTP headers.
    """
    headers: dict[str, str] = {
        "Content-Type": "application/json",
    }

    if config.auth_type == "bearer" and config.auth_token:
        headers["Authorization"] = f"Bearer {config.auth_token}"
    elif config.auth_type == "api_key_header" and config.auth_token:
        # Use the configured header name
        header_name = config.api_key_header_name or "X-API-Key"
        headers[header_name] = config.auth_token

    return headers


def _build_request_body(config: RemoteAgentConfig, prompt: str) -> dict[str, Any]:
    """Build request body based on format configuration.

    Args:
        config: The remote agent configuration.
        prompt: The prompt to send.

    Returns:
        Request body as dictionary.
    """
    if config.request_format == "openai_compatible":
        return {
            "model": "default",
            "messages": [{"role": "user", "content": prompt}],
        }
    else:
        # Custom template - replace placeholder
        template = config.custom_request_template.replace("{{prompt}}", prompt)
        result: dict[str, Any] = json.loads(template)
        return result


def _extract_response(
    config: RemoteAgentConfig, response_data: Any
) -> tuple[str, str | None]:
    """Extract response content based on format configuration.

    Args:
        config: The remote agent configuration.
        response_data: The raw response data.

    Returns:
        Tuple of (extracted_content, error_message).
    """
    if config.response_format == "text":
        if isinstance(response_data, str):
            return response_data, None
        elif isinstance(response_data, dict):
            # Try common response patterns
            for key in ["response", "content", "text", "output", "message"]:
                if key in response_data:
                    val = response_data[key]
                    if isinstance(val, str):
                        return val, None
                    elif isinstance(val, dict) and "content" in val:
                        return str(val["content"]), None
            # Try OpenAI-compatible format
            if "choices" in response_data:
                choices = response_data["choices"]
                if choices and isinstance(choices, list):
                    first_choice = choices[0]
                    if "message" in first_choice:
                        return str(first_choice["message"].get("content", "")), None
                    elif "text" in first_choice:
                        return str(first_choice["text"]), None
            # Fallback to JSON string
            return json.dumps(response_data), None
        else:
            return str(response_data), None
    else:
        # JSON path extraction
        try:
            # Simple JSONPath implementation for common patterns
            path = config.json_path
            if path == "$":
                return json.dumps(response_data), None

            # Handle basic path like $.response or $.choices[0].message.content
            if isinstance(response_data, dict):
                result = _simple_jsonpath_extract(response_data, path)
                if result is not None:
                    return str(result), None
                return "", f"Path '{path}' not found in response"
            return "", "Response is not a JSON object"
        except Exception as e:
            return "", f"JSON path extraction failed: {e}"


def _simple_jsonpath_extract(data: dict[str, Any], path: str) -> Any:
    """Simple JSONPath extraction for common patterns.

    Supports: $.key, $.key.subkey, $.key[0], $.key[0].subkey

    Args:
        data: The data dictionary.
        path: The JSONPath expression.

    Returns:
        Extracted value or None if not found.
    """
    if not path.startswith("$."):
        if path == "$":
            return data
        return None

    # Remove $. prefix
    path = path[2:]

    current = data
    # Split by . but handle array indices
    parts = re.split(r"\.(?![^\[]*\])", path)

    for part in parts:
        if not part:
            continue

        # Check for array index
        match = re.match(r"^(\w+)\[(\d+)\]$", part)
        if match:
            key, index = match.groups()
            if isinstance(current, dict) and key in current:
                current = current[key]
                if isinstance(current, list) and int(index) < len(current):
                    current = current[int(index)]
                else:
                    return None
            else:
                return None
        else:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None

    return current


async def check_connection_async(config: RemoteAgentConfig) -> tuple[bool, str]:
    """Test connection to the remote agent endpoint.

    Args:
        config: The remote agent configuration.

    Returns:
        Tuple of (success, message).
    """
    import httpx

    if not config.endpoint_url:
        return False, "No endpoint URL configured"

    is_valid, error = _validate_url(config.endpoint_url)
    if not is_valid:
        return False, error

    try:
        headers = _build_request_headers(config)
        body = _build_request_body(config, "Hello, this is a connection test.")

        async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
            response = await client.post(
                config.endpoint_url,
                json=body,
                headers=headers,
            )

            if response.status_code == 200:
                try:
                    response_data = response.json()
                    content, extract_error = _extract_response(config, response_data)
                    if extract_error:
                        return True, f"Connected (warning: {extract_error})"
                    preview = content[:100] + "..." if len(content) > 100 else content
                    return True, f"Connected successfully. Response preview: {preview}"
                except json.JSONDecodeError:
                    return True, f"Connected (non-JSON response: {response.text[:100]})"
            elif response.status_code == 401:
                return False, "Authentication failed (401 Unauthorized)"
            elif response.status_code == 403:
                return False, "Access forbidden (403 Forbidden)"
            elif response.status_code == 404:
                return False, "Endpoint not found (404 Not Found)"
            else:
                return False, f"HTTP {response.status_code}: {response.text[:100]}"

    except httpx.ConnectError:
        return False, "Connection failed. Check URL and network."
    except httpx.TimeoutException:
        return False, f"Connection timed out after {config.timeout_seconds}s"
    except Exception as e:
        logger.error(f"Connection test failed: {e}", exc_info=True)
        return False, f"Error: {str(e)}"


def render_remote_agent_config() -> None:
    """Render the Remote Agent Configuration panel.

    This component displays:
    - Endpoint URL input with validation
    - Authentication configuration
    - Request format settings
    - Response format settings
    - Test connection button
    """
    st.subheader("Remote Agent Configuration")

    # Get or create config
    config = _get_or_create_config()

    # Endpoint URL
    st.markdown("**Agent Endpoint:**")
    endpoint_url = st.text_input(
        "Endpoint URL",
        value=config.endpoint_url,
        placeholder="https://api.example.com/agent/chat",
        key="remote_endpoint_url",
        help="The HTTP(S) endpoint URL for your agent's chat/completion API",
    )

    # Validate URL on change
    url_valid = True
    if endpoint_url:
        url_valid, url_error = _validate_url(endpoint_url)
        if not url_valid:
            st.error(url_error)

    # Timeout
    timeout = st.number_input(
        "Request Timeout (seconds)",
        min_value=5,
        max_value=120,
        value=config.timeout_seconds,
        step=5,
        key="remote_timeout",
        help="Maximum time to wait for agent response",
    )

    st.divider()

    # Authentication Section
    st.markdown("**Authentication:**")

    auth_options = ["none", "bearer", "api_key_header"]
    try:
        auth_index = auth_options.index(config.auth_type)
    except ValueError:
        auth_index = 0  # Default to "none"

    auth_type_str = st.radio(
        "Authentication Method",
        options=auth_options,
        index=auth_index,
        format_func=lambda x: AUTH_TYPE_NAMES.get(x, x),
        key="remote_auth_type",
        horizontal=True,
    )
    auth_type: AuthType = auth_type_str  # type: ignore[assignment]

    auth_token = ""
    api_key_header_name = config.api_key_header_name

    if auth_type == "bearer":
        auth_token = st.text_input(
            "Bearer Token",
            value=config.auth_token,
            type="password",
            key="remote_bearer_token",
            help="Bearer token for Authorization header",
        )
    elif auth_type == "api_key_header":
        col1, col2 = st.columns([1, 2])
        with col1:
            api_key_header_name = st.text_input(
                "Header Name",
                value=config.api_key_header_name,
                key="remote_api_key_header_name",
                help="Name of the API key header (e.g., X-API-Key)",
            )
        with col2:
            auth_token = st.text_input(
                "API Key",
                value=config.auth_token,
                type="password",
                key="remote_api_key_value",
                help="API key value",
            )

    st.divider()

    # Request Format Section
    st.markdown("**Request Format:**")

    request_options = ["openai_compatible", "custom"]
    try:
        request_index = request_options.index(config.request_format)
    except ValueError:
        request_index = 0  # Default to "openai_compatible"

    request_format_str = st.radio(
        "Request Format",
        options=request_options,
        index=request_index,
        format_func=lambda x: REQUEST_FORMAT_NAMES.get(x, x),
        key="remote_request_format",
        horizontal=True,
    )
    request_format: RequestFormat = request_format_str  # type: ignore[assignment]

    custom_template = config.custom_request_template

    if request_format == "openai_compatible":
        st.info(
            "Requests will be sent in OpenAI-compatible format:\n"
            "```json\n"
            '{"model": "default", "messages": [{"role": "user", "content": "..."}]}'
            "\n```"
        )
    else:
        custom_template = st.text_area(
            "Custom JSON Template",
            value=config.custom_request_template,
            height=100,
            key="remote_custom_template",
            help="Use {{prompt}} as placeholder for the attack prompt",
        )

        # Validate template
        if custom_template:
            template_valid, template_error = _validate_json_template(custom_template)
            if not template_valid:
                st.error(template_error)

    st.divider()

    # Response Format Section
    st.markdown("**Response Format:**")

    response_options = ["text", "json_path"]
    try:
        response_index = response_options.index(config.response_format)
    except ValueError:
        response_index = 0  # Default to "text"

    response_format_str = st.radio(
        "Response Extraction",
        options=response_options,
        index=response_index,
        format_func=lambda x: RESPONSE_FORMAT_NAMES.get(x, x),
        key="remote_response_format",
        horizontal=True,
    )
    response_format: ResponseFormat = response_format_str  # type: ignore[assignment]

    json_path = config.json_path

    if response_format == "text":
        st.info(
            "Response will be extracted automatically from common patterns "
            "(OpenAI format, text fields, etc.)"
        )
    else:
        json_path = st.text_input(
            "JSON Path",
            value=config.json_path,
            placeholder="$.choices[0].message.content",
            key="remote_json_path",
            help="JSONPath expression to extract response "
            "(e.g., $.response, $.data.text)",
        )

        # Validate JSON path
        if json_path:
            path_valid, path_error = _validate_json_path(json_path)
            if not path_valid:
                st.error(path_error)

    st.divider()

    # Build updated config
    # Sanitize inputs for storage (not for display - that's done separately)
    safe_endpoint = html.escape(endpoint_url.strip()) if endpoint_url else ""
    safe_api_key_header = (
        html.escape(api_key_header_name.strip()) if api_key_header_name else "X-API-Key"
    )

    new_config = RemoteAgentConfig(
        endpoint_url=safe_endpoint,
        timeout_seconds=timeout,
        auth_type=auth_type,
        auth_token=auth_token,  # Token stored as-is (password field)
        api_key_header_name=safe_api_key_header,
        request_format=request_format,
        custom_request_template=custom_template,
        response_format=response_format,
        json_path=json_path,
    )

    # Save configuration
    _save_config(new_config)

    # Action buttons
    col1, col2 = st.columns(2)

    with col1:
        test_disabled = not endpoint_url or not url_valid
        if st.button(
            "Test Connection",
            key="test_remote_connection_btn",
            disabled=test_disabled,
            help="Test connection to the remote agent endpoint",
        ):
            import asyncio

            with st.spinner("Testing connection..."):
                success, message = asyncio.run(check_connection_async(new_config))
                st.session_state[REMOTE_AGENT_TEST_RESULT_KEY] = (success, message)

    with col2:
        if st.button(
            "Clear Configuration",
            key="clear_remote_config_btn",
            help="Reset all configuration to defaults",
        ):
            _save_config(RemoteAgentConfig())
            st.session_state.pop(REMOTE_AGENT_TEST_RESULT_KEY, None)
            st.rerun()

    # Show test result
    test_result = st.session_state.get(REMOTE_AGENT_TEST_RESULT_KEY)
    if test_result:
        success, message = test_result
        if success:
            st.success(message)
        else:
            st.error(message)

    # Configuration summary
    if new_config.endpoint_url:
        st.divider()
        st.markdown("**Configuration Summary:**")
        summary_cols = st.columns(3)
        with summary_cols[0]:
            st.metric("Endpoint", new_config.endpoint_url[:30] + "...")
        with summary_cols[1]:
            st.metric("Auth", AUTH_TYPE_NAMES.get(new_config.auth_type, "Unknown"))
        with summary_cols[2]:
            st.metric(
                "Format",
                REQUEST_FORMAT_NAMES.get(new_config.request_format, "Unknown"),
            )


def get_remote_agent_config() -> RemoteAgentConfig:
    """Get the current remote agent configuration.

    Returns:
        The current RemoteAgentConfig from session state.
    """
    return _get_or_create_config()


def is_remote_agent_configured() -> bool:
    """Check if a remote agent endpoint is properly configured.

    Returns:
        True if endpoint URL is configured and valid.
    """
    config = _get_or_create_config()
    if not config.endpoint_url:
        return False
    is_valid, _ = _validate_url(config.endpoint_url)
    return is_valid
