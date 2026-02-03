# tests/test_gemini_client.py

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from src.providers.gemini_client import GeminiClient, AgentRole
from src.providers.errors import SafetyBlockedError
from src.core.schemas import JudgeScore


class MockAsyncContextManager:
    """Mock async context manager for the client.aio interface."""

    def __init__(self, mock_response):
        self.mock_response = mock_response
        self.models = MagicMock()
        self.models.generate_content = AsyncMock(return_value=mock_response)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


@pytest.fixture
def mock_genai():
    with patch("src.providers.gemini_client.genai") as mock:
        yield mock


def test_init_with_defaults():
    """Test GeminiClient initializes with default project and location."""
    with patch("src.providers.gemini_client.genai"):
        client = GeminiClient()
        assert client.project_id == "dummy-project-id"
        assert client.location == "global"


@pytest.mark.asyncio
async def test_generate_agent_response_success(mock_genai):
    # Setup mock response
    mock_response = MagicMock()
    mock_response.text = "Hello, world!"
    mock_response.prompt_feedback = None

    # Create mock client with async context manager
    mock_acm = MockAsyncContextManager(mock_response)
    mock_client_instance = MagicMock()
    mock_client_instance.aio = mock_acm
    mock_genai.Client.return_value = mock_client_instance

    client = GeminiClient()

    messages = [{"role": "user", "content": "Hi"}]
    response = await client.generate_agent_response(AgentRole.ATTACKER, messages)

    assert response == "Hello, world!"


@pytest.mark.asyncio
async def test_generate_structured_evaluation(mock_genai):
    # Setup mock response
    mock_response = MagicMock()
    mock_response.text = (
        '{"score": 10, "leaked_secret": false, '
        '"leaked_instructions": false, "reasoning": "Safe"}'
    )

    mock_acm = MockAsyncContextManager(mock_response)
    mock_client_instance = MagicMock()
    mock_client_instance.aio = mock_acm
    mock_genai.Client.return_value = mock_client_instance

    client = GeminiClient()

    result = await client.generate_structured_evaluation("Judge this", JudgeScore)

    assert result["score"] == 10
    assert result["leaked_secret"] is False
    assert result["reasoning"] == "Safe"


@pytest.mark.asyncio
async def test_safety_block_raises_error(mock_genai):
    # Setup mock response with safety block
    mock_response = MagicMock()
    mock_response.text = None  # Blocked responses have no text
    mock_prompt_feedback = MagicMock()
    mock_prompt_feedback.block_reason = "SAFETY"
    mock_response.prompt_feedback = mock_prompt_feedback

    mock_acm = MockAsyncContextManager(mock_response)
    mock_client_instance = MagicMock()
    mock_client_instance.aio = mock_acm
    mock_genai.Client.return_value = mock_client_instance

    client = GeminiClient()

    messages = [{"role": "user", "content": "Unsafe prompt"}]
    with pytest.raises(SafetyBlockedError):
        await client.generate_agent_response(AgentRole.ATTACKER, messages)


@pytest.mark.asyncio
async def test_empty_response_raises_error(mock_genai):
    # Setup mock response with empty text
    mock_response = MagicMock()
    mock_response.text = None
    mock_response.prompt_feedback = None

    mock_acm = MockAsyncContextManager(mock_response)
    mock_client_instance = MagicMock()
    mock_client_instance.aio = mock_acm
    mock_genai.Client.return_value = mock_client_instance

    client = GeminiClient()

    messages = [{"role": "user", "content": "Hello"}]
    with pytest.raises(SafetyBlockedError):
        await client.generate_agent_response(AgentRole.ATTACKER, messages)
