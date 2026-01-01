# tests/test_registry.py

import pytest
from unittest.mock import MagicMock, patch
from src.orchestrator.registry import AgentRegistry
from src.config.models import ArenaConfig, ModelConfig, ProviderConfig
from src.providers.types import AgentRole
from src.providers.vertex_llama import VertexAILlamaClient
from src.providers.gemini_client import GeminiClient

@pytest.fixture
def mock_config():
    return ArenaConfig(
        providers={
            "mock_provider": ProviderConfig(
                kind="openai",
                model="gpt-mock",
                api_key="sk-mock"
            )
        },
        attacker=ModelConfig(provider="mock_provider", temperature=0.9),
        target=ModelConfig(provider="mock_provider", temperature=0.7),
        judge=ModelConfig(provider="mock_provider", temperature=0.1),
        defender=ModelConfig(provider="mock_provider", temperature=0.5),
    )

def test_registry_initialization(mock_config):
    """Test that registry initializes all agents correctly."""
    with patch("src.orchestrator.registry.load_config", return_value=mock_config), \
         patch("src.orchestrator.registry.create_client") as mock_create_client, \
         patch("src.orchestrator.registry.AttackKnowledgeBase") as MockKB:
        
        # Setup mock clients to satisfy isinstance checks
        mock_llama = MagicMock(spec=VertexAILlamaClient)
        mock_gemini = MagicMock(spec=GeminiClient)
        
        # Side effect to return different mocks for attacker vs judge calls
        # create_client is called twice: once for attacker (Vertex), once for judge (Gemini)
        mock_create_client.side_effect = [mock_llama, mock_gemini]
        
        registry = AgentRegistry()
        
        # Check clients created
        assert mock_create_client.call_count == 2
        
        # Check agents are properties
        assert registry.attacker is not None
        assert registry.judge is not None
        assert registry.defender is not None
        
        # Check config loaded
        assert registry.config == mock_config

def test_registry_singleton(mock_config):
    """Test singleton behavior."""
    # Reset singleton
    AgentRegistry._instance = None
    
    with patch("src.orchestrator.registry.load_config", return_value=mock_config), \
         patch("src.orchestrator.registry.create_client") as mock_create_client, \
         patch("src.orchestrator.registry.AttackKnowledgeBase"):
         
        mock_llama = MagicMock(spec=VertexAILlamaClient)
        mock_gemini = MagicMock(spec=GeminiClient)
        mock_create_client.side_effect = [mock_llama, mock_gemini]
        
        reg1 = AgentRegistry.get()
        reg2 = AgentRegistry.get()
        
        assert reg1 is reg2
        assert AgentRegistry._instance is not None