# tests/providers/test_gemini_client.py

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from src.providers.gemini_client import GeminiClient, SafetyBlockedError, GeminiClientError
from src.providers.types import AgentRole
from pydantic import BaseModel

class MockSchema(BaseModel):
    score: int

@pytest.mark.asyncio
async def test_gemini_client_vertex_mode():
    with patch("src.providers.gemini_client.genai.Client") as MockClient:
        client = GeminiClient(project_id="p", location="l", use_vertex_ai=True)
        assert client._use_vertexai is True
        
        mock_genai_client = MockClient.return_value
        mock_aio = MagicMock()
        mock_genai_client.aio = mock_aio
        
        # Mock async context manager
        mock_aclient = AsyncMock()
        mock_aio.__aenter__.return_value = mock_aclient
        
        mock_response = MagicMock()
        mock_response.text = "response text"
        mock_response.prompt_feedback = None
        mock_aclient.models.generate_content.return_value = mock_response
        
        resp = await client.generate_agent_response(
            role=AgentRole.ATTACKER,
            messages=[{"role": "user", "content": "hello"}]
        )
        assert resp == "response text"
        
        MockClient.assert_called_with(vertexai=True, project="p", location="l")

@pytest.mark.asyncio
async def test_gemini_client_studio_mode():
    with patch("src.providers.gemini_client.genai.Client") as MockClient:
        client = GeminiClient(api_key="k", use_vertex_ai=False)
        assert client._use_vertexai is False
        assert client.api_key == "k"
        
        client._create_client()
        MockClient.assert_called_with(api_key="k")

@pytest.mark.asyncio
async def test_gemini_client_env_fallback():
    with patch.dict("os.environ", {"GOOGLE_API_KEY": "env-key"}):
        with patch("src.providers.gemini_client.genai.Client") as MockClient:
            client = GeminiClient(use_vertex_ai=False)
            assert client.api_key == "env-key"

@pytest.mark.asyncio
async def test_gemini_structured_evaluation():
    with patch("src.providers.gemini_client.genai.Client") as MockClient:
        client = GeminiClient(use_vertex_ai=True)
        mock_aclient = AsyncMock()
        MockClient.return_value.aio.__aenter__.return_value = mock_aclient
        
        mock_resp = MagicMock()
        mock_resp.text = '{"score": 10}'
        mock_aclient.models.generate_content.return_value = mock_resp
        
        result = await client.generate_structured_evaluation("prompt", MockSchema)
        assert result == {"score": 10}

@pytest.mark.asyncio
async def test_gemini_stream():
    with patch("src.providers.gemini_client.genai.Client") as MockClient:
        client = GeminiClient(use_vertex_ai=True)
        mock_aclient = AsyncMock()
        MockClient.return_value.aio.__aenter__.return_value = mock_aclient
        
        # Mock stream iterator
        async def mock_iter():
            chunk = MagicMock()
            chunk.text = "chunk"
            yield chunk
            
        # Implementation calls aclient.models.generate_content_stream (not awaited)
        mock_aclient.models.generate_content_stream.return_value = mock_iter()
        
        chunks = []
        async for c in client.stream_campaign_content("prompt"):
            chunks.append(c)
        assert chunks == ["chunk"]

@pytest.mark.asyncio
async def test_gemini_safety_block():
    with patch("src.providers.gemini_client.genai.Client") as MockClient:
        client = GeminiClient(use_vertex_ai=True)
        mock_aclient = AsyncMock()
        MockClient.return_value.aio.__aenter__.return_value = mock_aclient
        
        mock_resp = MagicMock()
        mock_resp.prompt_feedback.block_reason = "SAFETY"
        mock_aclient.models.generate_content.return_value = mock_resp
        
        with pytest.raises(SafetyBlockedError):
            await client.generate_agent_response(AgentRole.ATTACKER, [])

@pytest.mark.asyncio
async def test_gemini_stream_error():
    with patch("src.providers.gemini_client.genai.Client") as MockClient:
        client = GeminiClient(use_vertex_ai=True)
        mock_aclient = AsyncMock()
        MockClient.return_value.aio.__aenter__.return_value = mock_aclient
        
        mock_aclient.models.generate_content_stream.side_effect = Exception("API Fail")
        
        with pytest.raises(GeminiClientError, match="Stream generation failed"):
            async for _ in client.stream_campaign_content("prompt"):
                pass
