# tests/providers/test_openai_client.py

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from src.providers.openai_client import OpenAIClient, ProviderClientError, ConfigurationError
from src.providers.types import AgentRole
from pydantic import BaseModel

class MockSchema(BaseModel):
    score: int

@pytest.fixture
def mock_openai():
    with patch("src.providers.openai_client.OpenAI") as MockOpenAI:
        with patch("src.providers.openai_client.AsyncOpenAI") as MockAsyncOpenAI:
            yield MockOpenAI, MockAsyncOpenAI

def test_openai_client_init(mock_openai):
    MockOpenAI, MockAsyncOpenAI = mock_openai
    client = OpenAIClient(api_key="sk-test", base_url="http://local")
    
    MockOpenAI.assert_called_with(api_key="sk-test", base_url="http://local")
    MockAsyncOpenAI.assert_called_with(api_key="sk-test", base_url="http://local")

def test_openai_sync_generate(mock_openai):
    MockOpenAI, _ = mock_openai
    instance = MockOpenAI.return_value
    
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = "generated text"
    instance.chat.completions.create.return_value = mock_resp
    
    client = OpenAIClient(api_key="k")
    resp = client.generate([{"role": "user", "content": "hi"}])
    assert resp == "generated text"

@pytest.mark.asyncio
async def test_openai_async_structured(mock_openai):
    _, MockAsyncOpenAI = mock_openai
    instance = MockAsyncOpenAI.return_value
    
    mock_create = AsyncMock()
    instance.chat.completions.create = mock_create
    
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = '{"score": 5}'
    mock_create.return_value = mock_resp
    
    client = OpenAIClient(api_key="k")
    resp = await client.generate_structured_evaluation("prompt", MockSchema, AgentRole.JUDGE)
    
    # It returns dict dumped from model
    assert resp == {"score": 5}
    
    # Check JSON mode was used
    call_kwargs = mock_create.call_args[1]
    assert call_kwargs["response_format"] == {"type": "json_object"}

@pytest.mark.asyncio
async def test_openai_async_structured_invalid_schema(mock_openai):
    _, MockAsyncOpenAI = mock_openai
    instance = MockAsyncOpenAI.return_value
    
    mock_create = AsyncMock()
    instance.chat.completions.create = mock_create
    
    mock_resp = MagicMock()
    mock_resp.choices[0].message.content = '{"score": 5}'
    mock_create.return_value = mock_resp
    
    client = OpenAIClient(api_key="k")
    with pytest.raises(ConfigurationError):
        # Pass a dict instead of Pydantic class
        await client.generate_structured_evaluation("prompt", {}, AgentRole.JUDGE)

@pytest.mark.asyncio
async def test_openai_stream(mock_openai):
    _, MockAsyncOpenAI = mock_openai
    instance = MockAsyncOpenAI.return_value
    
    async def mock_stream_gen():
        chunk1 = MagicMock()
        chunk1.choices[0].delta.content = "Hello"
        yield chunk1
        chunk2 = MagicMock()
        chunk2.choices[0].delta.content = " World"
        yield chunk2
    
    mock_create = AsyncMock()
    instance.chat.completions.create = mock_create
    mock_create.return_value = mock_stream_gen()
    
    client = OpenAIClient(api_key="k")
    chunks = []
    async for chunk in client.stream_campaign_content("prompt"):
        chunks.append(chunk)
        
    assert "".join(chunks) == "Hello World"

@pytest.mark.asyncio
async def test_openai_stream_error(mock_openai):
    _, MockAsyncOpenAI = mock_openai
    instance = MockAsyncOpenAI.return_value
    
    mock_create = AsyncMock()
    instance.chat.completions.create = mock_create
    mock_create.side_effect = Exception("API Fail")
    
    client = OpenAIClient(api_key="k")
    with pytest.raises(ProviderClientError, match="Stream interrupted"):
        async for _ in client.stream_campaign_content("prompt"):
            pass