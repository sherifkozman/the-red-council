# src/config/models.py

from typing import Any, Literal, Dict, Optional
from pydantic import BaseModel, Field, field_validator, model_validator, SecretStr


class ModelConfig(BaseModel):
    """Configuration for an agent's model assignment."""

    provider: str = Field(..., description="Key into providers map")
    model_id: Optional[str] = Field(
        None, description="Override provider's default model"
    )
    temperature: float = Field(0.7, ge=0, le=2)
    max_tokens: int = Field(4096, ge=1, le=128000)
    extra: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("model_id")
    @classmethod
    def validate_model_id(cls, v: str) -> str:
        if v is not None and not v.strip():
            raise ValueError("model_id cannot be empty or whitespace")
        return v


class ProviderConfig(BaseModel):
    """Configuration for a provider."""

    kind: Literal["openai", "anthropic", "openrouter", "vertex_llama", "gemini"]
    model: str = Field(..., description="Default model ID")
    api_key: Optional[SecretStr] = None  # Added for CRIT-002
    api_base: Optional[str] = None
    timeout: float = Field(default=60.0, gt=0)
    max_retries: int = Field(default=3, ge=0, le=10)
    project_id: Optional[str] = None  # For Vertex/Gemini
    location: Optional[str] = None  # For Vertex/Gemini


class ArenaConfig(BaseModel):
    """Top-level arena configuration."""

    providers: Dict[str, ProviderConfig] = Field(default_factory=dict)
    attacker: ModelConfig
    target: ModelConfig
    judge: ModelConfig
    defender: ModelConfig
    default_model: Optional[str] = None

    @model_validator(mode="after")
    def validate_all_providers_exist(self) -> "ArenaConfig":
        for role in ["attacker", "target", "judge", "defender"]:
            config = getattr(self, role)
            if config.provider not in self.providers:
                raise ValueError(
                    f"{role}.provider '{config.provider}' not found in providers"
                )
        return self
