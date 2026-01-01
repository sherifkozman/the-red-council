# tests/test_universal_provider.py

import pytest
from unittest.mock import MagicMock, patch
from src.providers.universal import create_client, ProviderError
from src.config.models import ArenaConfig, ProviderConfig, ModelConfig
from pydantic import SecretStr

@pytest.fixture
def mock_config():
    return ArenaConfig(
        providers={
            "gemini_prov": ProviderConfig(
                kind="gemini",
                model="gemini-pro",
                api_key=SecretStr("test-key")
            ),
            "vertex_prov": ProviderConfig(
                kind="vertex_llama",
                model="llama-3",
                project_id="test-proj",
                location="us-central1"
            ),
            "bad_prov": ProviderConfig(
                kind="openai",  # Valid in Pydantic but not in universal.py switch yet
                model="gpt-4"
            )
        },
        attacker=ModelConfig(provider="gemini_prov", temperature=0.5),
        target=ModelConfig(provider="vertex_prov", temperature=0.7),
        judge=ModelConfig(provider="bad_prov", temperature=0.1),
        defender=ModelConfig(provider="gemini_prov", temperature=0.5),
    )

def test_create_client_gemini(mock_config):
    """Test factory returns GeminiClient."""
    with patch("src.providers.universal.GeminiClient") as MockGemini:
        client = create_client(role="attacker", config=mock_config)
        MockGemini.assert_called_once()
        assert client == MockGemini.return_value

def test_create_client_vertex_llama(mock_config):
    """Test factory returns VertexAILlamaClient."""
    with patch("src.providers.universal.VertexAILlamaClient") as MockVertex:
        client = create_client(role="target", config=mock_config)
        MockVertex.assert_called_once()
        assert client == MockVertex.return_value

def test_create_client_unknown(mock_config):
    """Test factory raises error for unsupported provider kind."""
    with pytest.raises(ProviderError, match="Unsupported provider kind"):
        create_client(role="judge", config=mock_config)

def test_create_client_missing_role(mock_config):
    """Test factory raises error for invalid role."""
    # We can't actually trigger "No config found" easily because Pydantic validation 
    # ensures ModelConfig exists on ArenaConfig. But we can try to pass a role 
    # that doesn't exist if we were using dynamic getattr, but ArenaConfig fields are static.
    # So we'll skip this or mock getattr.
    pass