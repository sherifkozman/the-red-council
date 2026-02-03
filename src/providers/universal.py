# src/providers/universal.py

import os
from typing import Union
from src.config.models import ArenaConfig
from src.providers.gemini_client import GeminiClient
from src.providers.vertex_llama import VertexAILlamaClient
from src.providers.openai_client import OpenAIClient
from src.providers.types import AgentRole


class ProviderError(Exception):
    pass


def create_client(
    role: Union[str, AgentRole], config: ArenaConfig
) -> Union[GeminiClient, VertexAILlamaClient, OpenAIClient]:
    """
    Factory to create appropriate LLM client for a role.
    """
    role_str = role.value if isinstance(role, AgentRole) else role
    model_cfg = getattr(config, role_str, None)
    
    if not model_cfg:
        raise ProviderError(f"No config found for role: {role_str}")

    if model_cfg.provider not in config.providers:
        raise ProviderError(f"Provider '{model_cfg.provider}' not defined in config")

    provider_cfg = config.providers[model_cfg.provider]

    # Determine which client class to use based on provider kind
    if provider_cfg.kind == "gemini":
        use_vertex = os.getenv("RC_USE_VERTEX_AI", "true").lower() == "true"
        return GeminiClient(
            api_key=provider_cfg.api_key.get_secret_value() if provider_cfg.api_key else None,
            project_id=provider_cfg.project_id or "",
            location=provider_cfg.location or "",
            use_vertex_ai=use_vertex
        )
        
    elif provider_cfg.kind == "vertex_llama":
        return VertexAILlamaClient(
            project_id=provider_cfg.project_id or "",
            location=provider_cfg.location or "",
            model_id=model_cfg.model_id or provider_cfg.model,
            llama_guard_enabled=False # Always false for Red Team
        )

    elif provider_cfg.kind == "openai":
        return OpenAIClient(
            api_key=provider_cfg.api_key.get_secret_value() if provider_cfg.api_key else None,
            base_url=provider_cfg.api_base,
            model_id=model_cfg.model_id or provider_cfg.model
        )

    else:
        raise ProviderError(f"Unsupported provider kind: {provider_cfg.kind}")
