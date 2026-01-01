# src/providers/universal.py

from typing import Union
from src.config.models import ArenaConfig
from src.providers.gemini_client import GeminiClient
from src.providers.vertex_llama import VertexAILlamaClient


class ProviderError(Exception):
    pass


def create_client(
    role: str, config: ArenaConfig
) -> Union[GeminiClient, VertexAILlamaClient]:
    """
    Factory to create appropriate LLM client for a role.
    """
    model_cfg = getattr(config, role)  # e.g. config.attacker
    if not model_cfg:
        raise ProviderError(f"No config found for role: {role}")

    provider_cfg = config.providers[model_cfg.provider]

    # Determine which client class to use based on provider kind
    if provider_cfg.kind == "gemini":
        return GeminiClient(
            api_key=provider_cfg.api_key.get_secret_value() if provider_cfg.api_key else None,
            project_id=provider_cfg.project_id or "",
            location=provider_cfg.location or ""
        )
        
    elif provider_cfg.kind == "vertex_llama":
        return VertexAILlamaClient(
            project_id=provider_cfg.project_id or "",
            location=provider_cfg.location or "",
            model_id=model_cfg.model_id or provider_cfg.model,
            llama_guard_enabled=False # Always false for Red Team
        )

    else:
        raise ProviderError(f"Unsupported provider kind: {provider_cfg.kind}")
