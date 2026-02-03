# tests/providers/test_universal.py

import os
from unittest.mock import MagicMock, patch
import pytest
from pydantic import SecretStr

from src.config.models import ArenaConfig, ProviderConfig, ModelConfig
from src.providers.universal import create_client, ProviderError
from src.providers.gemini_client import GeminiClient
from src.providers.vertex_llama import VertexAILlamaClient
from src.providers.openai_client import OpenAIClient

@pytest.fixture
def mock_env():
    with patch.dict(os.environ, {"RC_USE_VERTEX_AI": "false"}):
        yield

def test_create_gemini_client(mock_env):
    config = ArenaConfig(
        providers={
            "gemini_test": ProviderConfig(
                kind="gemini",
                model="gemini-pro",
                api_key=SecretStr("test-key")
            )
        },
        attacker=ModelConfig(provider="gemini_test"),
        target=ModelConfig(provider="gemini_test"),
        judge=ModelConfig(provider="gemini_test"),
        defender=ModelConfig(provider="gemini_test")
    )
    
    client = create_client("judge", config)
    assert isinstance(client, GeminiClient)
    assert client.api_key == "test-key"
    assert client._use_vertexai is False

def test_create_vertex_llama_client():
    config = ArenaConfig(
        providers={
            "llama_test": ProviderConfig(
                kind="vertex_llama",
                model="meta/llama-3",
                project_id="test-proj",
                location="us-central1"
            )
        },
        attacker=ModelConfig(provider="llama_test"),
        target=ModelConfig(provider="llama_test"),
        judge=ModelConfig(provider="llama_test"),
        defender=ModelConfig(provider="llama_test")
    )
    
    with patch("src.providers.vertex_llama.google.auth.default", return_value=(MagicMock(), "test-proj")):
        client = create_client("attacker", config)
        assert isinstance(client, VertexAILlamaClient)
        assert client.project_id == "test-proj"

def test_create_openai_client():
    config = ArenaConfig(
        providers={
            "openai_test": ProviderConfig(
                kind="openai",
                model="gpt-4",
                api_key=SecretStr("sk-test"),
                api_base="http://localhost:11434"
            )
        },
        attacker=ModelConfig(provider="openai_test"),
        target=ModelConfig(provider="openai_test"),
        judge=ModelConfig(provider="openai_test"),
        defender=ModelConfig(provider="openai_test")
    )
    
    client = create_client("attacker", config)
    assert isinstance(client, OpenAIClient)
    assert client.api_key == "sk-test"
    assert client.base_url == "http://localhost:11434"
    assert client.default_model == "gpt-4"

def test_create_client_missing_config():
    # Use model_construct to bypass validation that checks provider existence
    config = ArenaConfig.model_construct(
        providers={},
        attacker=ModelConfig(provider="missing"),
        target=ModelConfig(provider="missing"),
        judge=ModelConfig(provider="missing"),
        defender=ModelConfig(provider="missing")
    )
    
    with pytest.raises(ProviderError):
        create_client("attacker", config)

def test_create_client_unsupported_kind():
    config = ArenaConfig(
        providers={
            "bad": ProviderConfig.model_construct(kind="bad_kind", model="m") # Bypass Literal check
        },
        attacker=ModelConfig(provider="bad"),
        target=ModelConfig(provider="bad"),
        judge=ModelConfig(provider="bad"),
        defender=ModelConfig(provider="bad")
    )
    
    with pytest.raises(ProviderError, match="Unsupported provider kind"):
        create_client("attacker", config)