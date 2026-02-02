# tests/ui/test_remote_agent_config.py
"""Tests for Remote Agent Configuration component."""

import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.modules.pop("src.ui.components.remote_agent_config", None)

from src.ui.components.remote_agent_config import (
    AUTH_TYPE_NAMES,
    REMOTE_AGENT_CONFIG_KEY,
    REMOTE_AGENT_TEST_RESULT_KEY,
    REQUEST_FORMAT_NAMES,
    RESPONSE_FORMAT_NAMES,
    RemoteAgentConfig,
    _build_request_body,
    _build_request_headers,
    _extract_response,
    _get_or_create_config,
    _save_config,
    _simple_jsonpath_extract,
    _validate_json_path,
    _validate_json_template,
    _validate_url,
    get_remote_agent_config,
    is_remote_agent_configured,
    render_remote_agent_config,
    check_connection_async,
)
import src.ui.components.remote_agent_config as remote_agent_config


@pytest.fixture
def mock_session_state():
    """Create mock session state."""
    return {}


@pytest.fixture
def mock_st(mock_session_state):
    """Create mock streamlit with session state."""
    with patch.object(remote_agent_config, "st") as mock:
        mock.session_state = mock_session_state
        mock.sidebar = MagicMock()
        yield mock


@pytest.fixture
def default_config():
    """Create default RemoteAgentConfig."""
    return RemoteAgentConfig()


@pytest.fixture
def configured_config():
    """Create a fully configured RemoteAgentConfig."""
    return RemoteAgentConfig(
        endpoint_url="https://api.example.com/chat",
        timeout_seconds=60,
        auth_type="bearer",
        auth_token="test-token-123",
        api_key_header_name="X-API-Key",
        request_format="openai_compatible",
        custom_request_template='{"prompt": "{{prompt}}"}',
        response_format="text",
        json_path="$.response",
    )


# =============================================================================
# RemoteAgentConfig dataclass tests
# =============================================================================


def test_remote_agent_config_defaults():
    """Test RemoteAgentConfig default values."""
    config = RemoteAgentConfig()

    assert config.endpoint_url == ""
    assert config.timeout_seconds == 30
    assert config.auth_type == "none"
    assert config.auth_token == ""
    assert config.api_key_header_name == "X-API-Key"
    assert config.request_format == "openai_compatible"
    assert config.response_format == "text"
    assert config.json_path == "$.response"


def test_remote_agent_config_to_dict(configured_config):
    """Test RemoteAgentConfig serialization to dict."""
    data = configured_config.to_dict()

    assert data["endpoint_url"] == "https://api.example.com/chat"
    assert data["timeout_seconds"] == 60
    assert data["auth_type"] == "bearer"
    assert data["auth_token"] == "test-token-123"


def test_remote_agent_config_from_dict():
    """Test RemoteAgentConfig deserialization from dict."""
    data = {
        "endpoint_url": "https://test.com/api",
        "timeout_seconds": 45,
        "auth_type": "api_key_header",
        "auth_token": "my-key",
        "api_key_header_name": "Authorization",
        "request_format": "custom",
        "custom_request_template": '{"q": "{{prompt}}"}',
        "response_format": "json_path",
        "json_path": "$.data.text",
    }

    config = RemoteAgentConfig.from_dict(data)

    assert config.endpoint_url == "https://test.com/api"
    assert config.timeout_seconds == 45
    assert config.auth_type == "api_key_header"
    assert config.request_format == "custom"


def test_remote_agent_config_from_dict_missing_keys():
    """Test RemoteAgentConfig from_dict handles missing keys."""
    data = {"endpoint_url": "https://example.com"}

    config = RemoteAgentConfig.from_dict(data)

    assert config.endpoint_url == "https://example.com"
    assert config.timeout_seconds == 30  # Default
    assert config.auth_type == "none"  # Default


def test_remote_agent_config_roundtrip(configured_config):
    """Test config survives serialization roundtrip."""
    data = configured_config.to_dict()
    restored = RemoteAgentConfig.from_dict(data)

    assert restored.endpoint_url == configured_config.endpoint_url
    assert restored.auth_type == configured_config.auth_type
    assert restored.request_format == configured_config.request_format


# =============================================================================
# URL validation tests
# =============================================================================


def test_validate_url_empty():
    """Test URL validation with empty string."""
    is_valid, error = _validate_url("")

    assert is_valid is False
    assert "required" in error.lower()


def test_validate_url_http():
    """Test URL validation with http URL."""
    is_valid, error = _validate_url("http://localhost:8080/api")

    assert is_valid is True
    assert error == ""


def test_validate_url_https():
    """Test URL validation with https URL."""
    is_valid, error = _validate_url("https://api.example.com/chat")

    assert is_valid is True
    assert error == ""


def test_validate_url_localhost():
    """Test URL validation with localhost."""
    is_valid, error = _validate_url("http://localhost/api")

    assert is_valid is True


def test_validate_url_ip_address():
    """Test URL validation with IP address."""
    is_valid, error = _validate_url("http://192.168.1.100:3000/api")

    assert is_valid is True


def test_validate_url_invalid_no_protocol():
    """Test URL validation rejects missing protocol."""
    is_valid, error = _validate_url("example.com/api")

    assert is_valid is False
    assert "http://" in error.lower() or "https://" in error.lower()


def test_validate_url_invalid_protocol():
    """Test URL validation rejects non-http protocols."""
    is_valid, error = _validate_url("ftp://example.com/file")

    assert is_valid is False


def test_validate_url_with_path():
    """Test URL validation with path segments."""
    is_valid, _ = _validate_url("https://api.example.com/v1/chat/completions")

    assert is_valid is True


def test_validate_url_with_port():
    """Test URL validation with port number."""
    is_valid, _ = _validate_url("http://localhost:8080")

    assert is_valid is True


# =============================================================================
# JSON template validation tests
# =============================================================================


def test_validate_json_template_empty():
    """Test JSON template validation with empty string."""
    is_valid, error = _validate_json_template("")

    assert is_valid is False
    assert "required" in error.lower()


def test_validate_json_template_valid():
    """Test JSON template validation with valid template."""
    template = '{"prompt": "{{prompt}}", "model": "gpt-4"}'

    is_valid, error = _validate_json_template(template)

    assert is_valid is True
    assert error == ""


def test_validate_json_template_missing_placeholder():
    """Test JSON template validation without placeholder."""
    template = '{"prompt": "hello"}'

    is_valid, error = _validate_json_template(template)

    assert is_valid is False
    assert "{{prompt}}" in error


def test_validate_json_template_invalid_json():
    """Test JSON template validation with invalid JSON."""
    template = '{"prompt": {{prompt}}'  # Missing quotes around placeholder

    is_valid, error = _validate_json_template(template)

    assert is_valid is False
    assert "json" in error.lower()


def test_validate_json_template_nested():
    """Test JSON template validation with nested structure."""
    template = '{"messages": [{"role": "user", "content": "{{prompt}}"}]}'

    is_valid, error = _validate_json_template(template)

    assert is_valid is True


# =============================================================================
# JSON path validation tests
# =============================================================================


def test_validate_json_path_empty():
    """Test JSON path validation with empty string."""
    is_valid, error = _validate_json_path("")

    assert is_valid is False
    assert "required" in error.lower()


def test_validate_json_path_root():
    """Test JSON path validation with root path."""
    is_valid, error = _validate_json_path("$")

    assert is_valid is True


def test_validate_json_path_simple():
    """Test JSON path validation with simple path."""
    is_valid, error = _validate_json_path("$.response")

    assert is_valid is True


def test_validate_json_path_nested():
    """Test JSON path validation with nested path."""
    is_valid, error = _validate_json_path("$.data.text")

    assert is_valid is True


def test_validate_json_path_array():
    """Test JSON path validation with array access."""
    is_valid, error = _validate_json_path("$.choices[0].message.content")

    assert is_valid is True


def test_validate_json_path_invalid_start():
    """Test JSON path validation without $ prefix."""
    is_valid, error = _validate_json_path("response")

    assert is_valid is False
    assert "$" in error


def test_validate_json_path_invalid_chars():
    """Test JSON path validation with invalid characters."""
    is_valid, error = _validate_json_path("$.response;drop table")

    assert is_valid is False
    assert "invalid" in error.lower()


# =============================================================================
# Request headers builder tests
# =============================================================================


def test_build_request_headers_no_auth(default_config):
    """Test headers with no authentication."""
    headers = _build_request_headers(default_config)

    assert "Content-Type" in headers
    assert headers["Content-Type"] == "application/json"
    assert "Authorization" not in headers


def test_build_request_headers_bearer(configured_config):
    """Test headers with bearer token."""
    configured_config.auth_type = "bearer"
    configured_config.auth_token = "my-token"

    headers = _build_request_headers(configured_config)

    assert "Authorization" in headers
    assert headers["Authorization"] == "Bearer my-token"


def test_build_request_headers_api_key():
    """Test headers with API key header."""
    config = RemoteAgentConfig(
        auth_type="api_key_header",
        auth_token="my-api-key",
        api_key_header_name="X-Custom-Key",
    )

    headers = _build_request_headers(config)

    assert "X-Custom-Key" in headers
    assert headers["X-Custom-Key"] == "my-api-key"


def test_build_request_headers_empty_token():
    """Test headers with empty auth token."""
    config = RemoteAgentConfig(auth_type="bearer", auth_token="")

    headers = _build_request_headers(config)

    assert "Authorization" not in headers


# =============================================================================
# Request body builder tests
# =============================================================================


def test_build_request_body_openai_compatible(default_config):
    """Test OpenAI-compatible request body."""
    body = _build_request_body(default_config, "Hello, world!")

    assert "model" in body
    assert "messages" in body
    assert body["messages"][0]["role"] == "user"
    assert body["messages"][0]["content"] == "Hello, world!"


def test_build_request_body_custom_template():
    """Test custom template request body."""
    config = RemoteAgentConfig(
        request_format="custom",
        custom_request_template='{"query": "{{prompt}}", "max_tokens": 100}',
    )

    body = _build_request_body(config, "Test prompt")

    assert body["query"] == "Test prompt"
    assert body["max_tokens"] == 100


def test_build_request_body_custom_nested_template():
    """Test custom nested template request body."""
    config = RemoteAgentConfig(
        request_format="custom",
        custom_request_template='{"input": {"text": "{{prompt}}"}}',
    )

    body = _build_request_body(config, "Nested test")

    assert body["input"]["text"] == "Nested test"


# =============================================================================
# Response extraction tests
# =============================================================================


def test_extract_response_text_string():
    """Test text extraction from string response."""
    config = RemoteAgentConfig(response_format="text")

    content, error = _extract_response(config, "Hello response")

    assert content == "Hello response"
    assert error is None


def test_extract_response_text_dict_response():
    """Test text extraction from dict with response key."""
    config = RemoteAgentConfig(response_format="text")

    content, error = _extract_response(config, {"response": "Dict response"})

    assert content == "Dict response"
    assert error is None


def test_extract_response_text_dict_content():
    """Test text extraction from dict with content key."""
    config = RemoteAgentConfig(response_format="text")

    content, error = _extract_response(config, {"content": "Content value"})

    assert content == "Content value"


def test_extract_response_text_openai_format():
    """Test text extraction from OpenAI format response."""
    config = RemoteAgentConfig(response_format="text")
    response_data = {
        "choices": [{"message": {"content": "OpenAI response"}}],
    }

    content, error = _extract_response(config, response_data)

    assert content == "OpenAI response"


def test_extract_response_text_openai_text_format():
    """Test text extraction from OpenAI completion format."""
    config = RemoteAgentConfig(response_format="text")
    response_data = {
        "choices": [{"text": "Completion text"}],
    }

    content, error = _extract_response(config, response_data)

    assert content == "Completion text"


def test_extract_response_json_path_simple():
    """Test JSON path extraction with simple path."""
    config = RemoteAgentConfig(response_format="json_path", json_path="$.data")
    response_data = {"data": "Extracted value"}

    content, error = _extract_response(config, response_data)

    assert content == "Extracted value"
    assert error is None


def test_extract_response_json_path_nested():
    """Test JSON path extraction with nested path."""
    config = RemoteAgentConfig(response_format="json_path", json_path="$.data.text")
    response_data = {"data": {"text": "Nested value"}}

    content, error = _extract_response(config, response_data)

    assert content == "Nested value"


def test_extract_response_json_path_array():
    """Test JSON path extraction with array index."""
    config = RemoteAgentConfig(
        response_format="json_path", json_path="$.choices[0].content"
    )
    response_data = {"choices": [{"content": "First choice"}]}

    content, error = _extract_response(config, response_data)

    assert content == "First choice"


def test_extract_response_json_path_not_found():
    """Test JSON path extraction with missing path."""
    config = RemoteAgentConfig(response_format="json_path", json_path="$.missing")
    response_data = {"data": "value"}

    content, error = _extract_response(config, response_data)

    assert error is not None
    assert "not found" in error.lower()


def test_extract_response_json_path_root():
    """Test JSON path extraction with root path."""
    config = RemoteAgentConfig(response_format="json_path", json_path="$")
    response_data = {"key": "value"}

    content, error = _extract_response(config, response_data)

    assert "key" in content
    assert error is None


# =============================================================================
# Simple JSONPath extraction tests
# =============================================================================


def test_simple_jsonpath_extract_simple_key():
    """Test simple JSONPath extraction with single key."""
    data = {"name": "test"}

    result = _simple_jsonpath_extract(data, "$.name")

    assert result == "test"


def test_simple_jsonpath_extract_nested():
    """Test simple JSONPath extraction with nested keys."""
    data = {"outer": {"inner": "value"}}

    result = _simple_jsonpath_extract(data, "$.outer.inner")

    assert result == "value"


def test_simple_jsonpath_extract_array():
    """Test simple JSONPath extraction with array index."""
    data = {"items": ["first", "second", "third"]}

    result = _simple_jsonpath_extract(data, "$.items[1]")

    assert result == "second"


def test_simple_jsonpath_extract_array_object():
    """Test simple JSONPath extraction with array of objects."""
    data = {"items": [{"name": "a"}, {"name": "b"}]}

    result = _simple_jsonpath_extract(data, "$.items[0].name")

    assert result == "a"


def test_simple_jsonpath_extract_missing_key():
    """Test simple JSONPath extraction with missing key."""
    data = {"name": "test"}

    result = _simple_jsonpath_extract(data, "$.missing")

    assert result is None


def test_simple_jsonpath_extract_out_of_bounds():
    """Test simple JSONPath extraction with out of bounds index."""
    data = {"items": ["only"]}

    result = _simple_jsonpath_extract(data, "$.items[5]")

    assert result is None


def test_simple_jsonpath_extract_root():
    """Test simple JSONPath extraction with root path."""
    data = {"key": "value"}

    result = _simple_jsonpath_extract(data, "$")

    assert result == data


# =============================================================================
# Session state management tests
# =============================================================================


def test_get_or_create_config_creates_default(mock_st, mock_session_state):
    """Test that get_or_create_config creates default config."""
    config = _get_or_create_config()

    assert REMOTE_AGENT_CONFIG_KEY in mock_session_state
    assert isinstance(config, RemoteAgentConfig)
    assert config.endpoint_url == ""


def test_get_or_create_config_returns_existing(mock_st, mock_session_state):
    """Test that get_or_create_config returns existing config."""
    existing_config = RemoteAgentConfig(endpoint_url="https://existing.com")
    mock_session_state[REMOTE_AGENT_CONFIG_KEY] = existing_config

    config = _get_or_create_config()

    assert config.endpoint_url == "https://existing.com"


def test_save_config(mock_st, mock_session_state):
    """Test that save_config stores config in session state."""
    config = RemoteAgentConfig(endpoint_url="https://saved.com")

    _save_config(config)

    assert (
        mock_session_state[REMOTE_AGENT_CONFIG_KEY].endpoint_url == "https://saved.com"
    )


# =============================================================================
# Connection test tests
# =============================================================================


@pytest.mark.asyncio
async def test_check_connection_async_no_url():
    """Test connection test with no URL configured."""
    config = RemoteAgentConfig(endpoint_url="")

    success, message = await check_connection_async(config)

    assert success is False
    assert "no endpoint" in message.lower()


@pytest.mark.asyncio
async def test_check_connection_async_invalid_url():
    """Test connection test with invalid URL."""
    config = RemoteAgentConfig(endpoint_url="not-a-url")

    success, message = await check_connection_async(config)

    assert success is False
    assert "invalid" in message.lower()


@pytest.mark.asyncio
async def test_check_connection_async_success():
    """Test connection test with successful response."""
    config = RemoteAgentConfig(endpoint_url="https://api.example.com/chat")

    with patch.dict("sys.modules", {"httpx": MagicMock()}):
        import importlib

        # Reload module to pick up mocked httpx
        import src.ui.components.remote_agent_config as module

        import sys
        sys.modules["src.ui.components.remote_agent_config"] = module
        importlib.reload(module)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"response": "Hello test"}

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_async_client = MagicMock()
        mock_async_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_async_client.__aexit__ = AsyncMock(return_value=None)

        with patch("httpx.AsyncClient", return_value=mock_async_client):
            success, message = await module.check_connection_async(config)

        assert success is True
        assert "connected" in message.lower()


@pytest.mark.asyncio
async def test_check_connection_async_auth_failure():
    """Test connection test with authentication failure."""
    config = RemoteAgentConfig(endpoint_url="https://api.example.com/chat")

    with patch.dict("sys.modules", {"httpx": MagicMock()}):
        import importlib

        import src.ui.components.remote_agent_config as module

        import sys
        sys.modules["src.ui.components.remote_agent_config"] = module
        importlib.reload(module)

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_async_client = MagicMock()
        mock_async_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_async_client.__aexit__ = AsyncMock(return_value=None)

        with patch("httpx.AsyncClient", return_value=mock_async_client):
            success, message = await module.check_connection_async(config)

        assert success is False
        assert "401" in message


@pytest.mark.asyncio
async def test_check_connection_async_forbidden():
    """Test connection test with forbidden response."""
    config = RemoteAgentConfig(endpoint_url="https://api.example.com/chat")

    with patch.dict("sys.modules", {"httpx": MagicMock()}):
        import importlib

        import src.ui.components.remote_agent_config as module

        import sys
        sys.modules["src.ui.components.remote_agent_config"] = module
        importlib.reload(module)

        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_async_client = MagicMock()
        mock_async_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_async_client.__aexit__ = AsyncMock(return_value=None)

        with patch("httpx.AsyncClient", return_value=mock_async_client):
            success, message = await module.check_connection_async(config)

        assert success is False
        assert "403" in message


@pytest.mark.asyncio
async def test_check_connection_async_not_found():
    """Test connection test with not found response."""
    config = RemoteAgentConfig(endpoint_url="https://api.example.com/chat")

    with patch.dict("sys.modules", {"httpx": MagicMock()}):
        import importlib

        import src.ui.components.remote_agent_config as module

        import sys
        sys.modules["src.ui.components.remote_agent_config"] = module
        importlib.reload(module)

        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        mock_async_client = MagicMock()
        mock_async_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_async_client.__aexit__ = AsyncMock(return_value=None)

        with patch("httpx.AsyncClient", return_value=mock_async_client):
            success, message = await module.check_connection_async(config)

        assert success is False
        assert "404" in message


@pytest.mark.asyncio
async def test_check_connection_async_connect_error():
    """Test connection test with connection error."""
    import httpx

    config = RemoteAgentConfig(endpoint_url="https://api.example.com/chat")

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.ConnectError("Connection failed"))

    mock_async_client = MagicMock()
    mock_async_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_async_client.__aexit__ = AsyncMock(return_value=None)

    with patch("httpx.AsyncClient", return_value=mock_async_client):
        success, message = await check_connection_async(config)

    assert success is False
    assert "connection failed" in message.lower()


@pytest.mark.asyncio
async def test_check_connection_async_timeout():
    """Test connection test with timeout."""
    import httpx

    config = RemoteAgentConfig(endpoint_url="https://api.example.com/chat")

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))

    mock_async_client = MagicMock()
    mock_async_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_async_client.__aexit__ = AsyncMock(return_value=None)

    with patch("httpx.AsyncClient", return_value=mock_async_client):
        success, message = await check_connection_async(config)

        assert success is False
        assert "timed out" in message.lower()


# =============================================================================
# Render function tests
# =============================================================================


def test_render_remote_agent_config_shows_subheader(mock_st, mock_session_state):
    """Test render shows subheader."""
    # Setup mocks
    mock_st.radio.return_value = "none"
    mock_st.text_input.return_value = ""
    mock_st.number_input.return_value = 30
    mock_st.text_area.return_value = '{"prompt": "{{prompt}}"}'
    mock_st.button.return_value = False
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    render_remote_agent_config()

    mock_st.subheader.assert_called_with("Remote Agent Configuration")


def test_render_remote_agent_config_shows_endpoint_input(mock_st, mock_session_state):
    """Test render shows endpoint URL input."""
    mock_st.radio.return_value = "none"
    mock_st.text_input.return_value = ""
    mock_st.number_input.return_value = 30
    mock_st.text_area.return_value = '{"prompt": "{{prompt}}"}'
    mock_st.button.return_value = False
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    render_remote_agent_config()

    # Verify text_input was called for endpoint URL
    text_input_calls = mock_st.text_input.call_args_list
    assert any("endpoint" in str(call).lower() for call in text_input_calls)


def test_render_remote_agent_config_auth_selector(mock_st, mock_session_state):
    """Test render shows authentication selector."""
    # 3 radio calls: auth_type, request_format, response_format
    mock_st.radio.side_effect = ["bearer", "openai_compatible", "text"]
    mock_st.text_input.return_value = ""  # empty endpoint - no summary
    mock_st.number_input.return_value = 30
    mock_st.text_area.return_value = '{"prompt": "{{prompt}}"}'
    mock_st.button.return_value = False
    # bearer auth without endpoint: only button columns (no summary)
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    render_remote_agent_config()

    # Verify radio was called for auth selection
    radio_calls = mock_st.radio.call_args_list
    assert any("none" in str(call) and "bearer" in str(call) for call in radio_calls)


def test_render_remote_agent_config_request_format_selector(
    mock_st, mock_session_state
):
    """Test render shows request format selector."""
    mock_st.radio.side_effect = ["none", "openai_compatible", "text"]
    mock_st.text_input.return_value = ""
    mock_st.number_input.return_value = 30
    mock_st.text_area.return_value = '{"prompt": "{{prompt}}"}'
    mock_st.button.return_value = False
    mock_st.columns.side_effect = [
        [MagicMock(), MagicMock()],
        [MagicMock(), MagicMock()],
        [MagicMock(), MagicMock(), MagicMock()],
    ]

    render_remote_agent_config()

    # Verify radio was called for request format
    radio_calls = mock_st.radio.call_args_list
    assert any("openai_compatible" in str(call) for call in radio_calls)


def test_render_remote_agent_config_saves_config(mock_st, mock_session_state):
    """Test render saves configuration to session state."""
    mock_st.radio.side_effect = ["bearer", "custom", "json_path"]
    mock_st.text_input.side_effect = [
        "https://api.test.com",
        "my-token",
        "$.output",
    ]
    mock_st.number_input.return_value = 45
    mock_st.text_area.return_value = '{"q": "{{prompt}}"}'
    mock_st.button.return_value = False
    # bearer auth doesn't use 2-col for header, just buttons + summary
    mock_st.columns.side_effect = [
        [MagicMock(), MagicMock()],  # button columns
        [MagicMock(), MagicMock(), MagicMock()],  # summary columns
    ]

    render_remote_agent_config()

    assert REMOTE_AGENT_CONFIG_KEY in mock_session_state
    config = mock_session_state[REMOTE_AGENT_CONFIG_KEY]
    assert config.timeout_seconds == 45


def test_render_remote_agent_config_test_button(mock_st, mock_session_state):
    """Test render shows test connection button."""
    mock_st.radio.return_value = "none"
    mock_st.text_input.return_value = "https://api.test.com"
    mock_st.number_input.return_value = 30
    mock_st.text_area.return_value = '{"prompt": "{{prompt}}"}'
    mock_st.button.return_value = False
    # none auth: just buttons + summary (endpoint configured)
    mock_st.columns.side_effect = [
        [MagicMock(), MagicMock()],  # button columns
        [MagicMock(), MagicMock(), MagicMock()],  # summary columns
    ]

    render_remote_agent_config()

    # Verify button was called
    button_calls = mock_st.button.call_args_list
    assert any("test" in str(call).lower() for call in button_calls)


def test_render_remote_agent_config_clear_button(mock_st, mock_session_state):
    """Test clear configuration button works."""
    mock_session_state[REMOTE_AGENT_CONFIG_KEY] = RemoteAgentConfig(
        endpoint_url="https://existing.com"
    )
    mock_session_state[REMOTE_AGENT_TEST_RESULT_KEY] = (True, "OK")

    mock_st.radio.return_value = "none"
    mock_st.text_input.return_value = "https://existing.com"
    mock_st.number_input.return_value = 30
    mock_st.text_area.return_value = '{"prompt": "{{prompt}}"}'
    # Test button False, Clear button True
    mock_st.button.side_effect = [False, True]
    # none auth with endpoint: buttons + summary
    mock_st.columns.side_effect = [
        [MagicMock(), MagicMock()],  # button columns
        [MagicMock(), MagicMock(), MagicMock()],  # summary columns
    ]

    render_remote_agent_config()

    # Config should be reset
    mock_st.rerun.assert_called()


def test_render_remote_agent_config_shows_test_result(mock_st, mock_session_state):
    """Test render shows test result if available."""
    mock_session_state[REMOTE_AGENT_TEST_RESULT_KEY] = (True, "Connection successful")

    mock_st.radio.return_value = "none"
    mock_st.text_input.return_value = ""
    mock_st.number_input.return_value = 30
    mock_st.text_area.return_value = '{"prompt": "{{prompt}}"}'
    mock_st.button.return_value = False
    # no endpoint: only button columns (no summary)
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    render_remote_agent_config()

    mock_st.success.assert_called_with("Connection successful")


def test_render_remote_agent_config_shows_error_result(mock_st, mock_session_state):
    """Test render shows error result if test failed."""
    mock_session_state[REMOTE_AGENT_TEST_RESULT_KEY] = (False, "Connection failed")

    mock_st.radio.return_value = "none"
    mock_st.text_input.return_value = ""
    mock_st.number_input.return_value = 30
    mock_st.text_area.return_value = '{"prompt": "{{prompt}}"}'
    mock_st.button.return_value = False
    mock_st.columns.return_value = [MagicMock(), MagicMock()]

    render_remote_agent_config()

    mock_st.error.assert_called()


# =============================================================================
# Helper function tests
# =============================================================================


def test_get_remote_agent_config(mock_st, mock_session_state):
    """Test get_remote_agent_config helper."""
    expected_config = RemoteAgentConfig(endpoint_url="https://helper.test.com")
    mock_session_state[REMOTE_AGENT_CONFIG_KEY] = expected_config

    config = get_remote_agent_config()

    assert config.endpoint_url == "https://helper.test.com"


def test_is_remote_agent_configured_false_empty(mock_st, mock_session_state):
    """Test is_remote_agent_configured returns False for empty URL."""
    mock_session_state[REMOTE_AGENT_CONFIG_KEY] = RemoteAgentConfig()

    result = is_remote_agent_configured()

    assert result is False


def test_is_remote_agent_configured_false_invalid(mock_st, mock_session_state):
    """Test is_remote_agent_configured returns False for invalid URL."""
    mock_session_state[REMOTE_AGENT_CONFIG_KEY] = RemoteAgentConfig(
        endpoint_url="not-a-url"
    )

    result = is_remote_agent_configured()

    assert result is False


def test_is_remote_agent_configured_true(mock_st, mock_session_state):
    """Test is_remote_agent_configured returns True for valid config."""
    mock_session_state[REMOTE_AGENT_CONFIG_KEY] = RemoteAgentConfig(
        endpoint_url="https://api.example.com/chat"
    )

    result = is_remote_agent_configured()

    assert result is True


# =============================================================================
# Constants tests
# =============================================================================


def test_auth_type_names_complete():
    """Test all auth types have display names."""
    expected_types = ["none", "bearer", "api_key_header"]

    for auth_type in expected_types:
        assert auth_type in AUTH_TYPE_NAMES
        assert len(AUTH_TYPE_NAMES[auth_type]) > 0


def test_request_format_names_complete():
    """Test all request formats have display names."""
    expected_formats = ["openai_compatible", "custom"]

    for fmt in expected_formats:
        assert fmt in REQUEST_FORMAT_NAMES
        assert len(REQUEST_FORMAT_NAMES[fmt]) > 0


def test_response_format_names_complete():
    """Test all response formats have display names."""
    expected_formats = ["text", "json_path"]

    for fmt in expected_formats:
        assert fmt in RESPONSE_FORMAT_NAMES
        assert len(RESPONSE_FORMAT_NAMES[fmt]) > 0


# =============================================================================
# Edge case tests
# =============================================================================


def test_extract_response_fallback_to_json_string():
    """Test text extraction falls back to JSON string for unknown format."""
    config = RemoteAgentConfig(response_format="text")
    response_data = {"unknown_key": {"nested": "data"}}

    content, error = _extract_response(config, response_data)

    # Should return JSON string
    assert "unknown_key" in content


def test_build_request_body_special_characters_in_prompt():
    """Test request body handles special characters in prompt."""
    config = RemoteAgentConfig()
    prompt = 'Test with "quotes" and \n newlines'

    body = _build_request_body(config, prompt)

    assert body["messages"][0]["content"] == prompt


def test_validate_url_with_query_params():
    """Test URL validation with query parameters."""
    is_valid, _ = _validate_url("https://api.example.com/chat?key=value")

    assert is_valid is True


def test_html_escape_in_config_storage():
    """Test that endpoint URL is HTML escaped when stored."""
    import html

    malicious_url = "<script>alert('xss')</script>"
    escaped = html.escape(malicious_url)

    assert "<script>" not in escaped
    assert "&lt;script&gt;" in escaped
