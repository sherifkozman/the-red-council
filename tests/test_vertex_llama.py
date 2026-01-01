# tests/test_vertex_llama.py

import pytest
from unittest.mock import MagicMock, patch
from src.providers.vertex_llama import VertexAILlamaClient
from src.providers.errors import GeminiClientError, RateLimitError, ConfigurationError


@pytest.fixture
def mock_google_auth():
    with patch("src.providers.vertex_llama.google.auth.default") as mock:
        mock_creds = MagicMock()
        mock_creds.token = "fake-token"
        mock_creds.valid = True
        mock.return_value = (mock_creds, "fake-project")
        yield mock


@pytest.fixture
def mock_requests():
    with patch("src.providers.vertex_llama.requests.post") as mock:
        yield mock


@pytest.fixture
def client(mock_google_auth):
    return VertexAILlamaClient(project_id="test-proj")


def test_init_fails_without_creds():
    with patch(
        "src.providers.vertex_llama.google.auth.default",
        side_effect=Exception("No creds"),
    ):
        with pytest.raises(ConfigurationError):
            VertexAILlamaClient()


def test_generate_success(client, mock_requests):
    # Setup mock response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "Adversarial Prompt"}}]
    }
    mock_requests.return_value = mock_response

    response = client.generate([{"role": "user", "content": "Attack!"}])

    assert response == "Adversarial Prompt"

    # Verify safety settings were disabled in the payload
    call_kwargs = mock_requests.call_args[1]
    payload = call_kwargs["json"]
    assert payload["extra_body"]["google"]["model_safety_settings"]["enabled"] is False


def test_rate_limit_error(client, mock_requests):
    mock_response = MagicMock()
    mock_response.status_code = 429
    mock_response.text = "Quota exceeded"
    mock_requests.return_value = mock_response

    with pytest.raises(RateLimitError):
        client.generate([{"role": "user", "content": "Hi"}])


def test_api_error(client, mock_requests):
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"
    mock_requests.return_value = mock_response

    with pytest.raises(GeminiClientError):
        client.generate([{"role": "user", "content": "Hi"}])
