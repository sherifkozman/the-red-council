# src/config/defaults.py

from src.config.models import ArenaConfig, ModelConfig, ProviderConfig

DEFAULT_ARENA_CONFIG = ArenaConfig(
    providers={
        "vertex_llama_default": ProviderConfig(
            kind="vertex_llama",
            model="meta/llama-3.1-405b-instruct-maas",  # HIGH-002: Updated to 405B
            project_id="dummy-project-id",  # Override via RC_PROVIDERS__VERTEX_LLAMA_DEFAULT__PROJECT_ID
            location="us-central1",
            timeout=120,
        ),
        "gemini_default": ProviderConfig(
            kind="gemini",
            model="gemini-3-pro-preview",
            project_id="dummy-project-id",  # Override via RC_PROVIDERS__GEMINI_DEFAULT__PROJECT_ID
            location="global",
            timeout=60,
        ),
    },
    attacker=ModelConfig(
        provider="gemini_default",  # Changed from vertex_llama_default
        model_id=None,
        temperature=0.9,
        max_tokens=2048,
    ),
    target=ModelConfig(
        provider="gemini_default",  # Uses Gemini 3 as the target (victim) model
        model_id=None,
        temperature=0.7,
        max_tokens=1024,
    ),
    judge=ModelConfig(
        provider="gemini_default",
        model_id=None,
        temperature=0.3,
        max_tokens=1024,
    ),
    defender=ModelConfig(
        provider="gemini_default",
        model_id=None,
        temperature=0.5,
        max_tokens=2048,
    ),
)
