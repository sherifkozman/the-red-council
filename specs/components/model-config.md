# Component: Model Configuration

## Purpose

The Model Configuration component provides a unified interface for configuring LLM providers and agent model assignments. It enables The Red Council to test **any LLM with an HTTP endpoint**, transforming the tool from a Gemini-focused demo into a general-purpose LLM security testing platform.

## Interfaces

### Input

- **YAML Configuration File**: `~/.red-council/config.yaml` or `./config.yaml`
- **Environment Variables**: `RC_*` prefix with `__` for nested paths
- **Dashboard UI**: Runtime configuration via Streamlit session state

### Output

- **ArenaConfig**: Validated Pydantic model containing all provider and agent configurations
- **UniversalLLMClient instances**: Configured clients ready for agent use

### API Contract

```python
from src.config.models import ArenaConfig, load_config
from src.providers.universal import create_client

# Load configuration (YAML + env vars merged)
config: ArenaConfig = load_config()

# Create configured clients for each agent role
attacker_client = create_client(config, role="attacker")
target_client = create_client(config, role="target")
judge_client = create_client(config, role="judge")
defender_client = create_client(config, role="defender")
```

## Pydantic Schemas

### ProviderType Enum

```python
from enum import Enum

class ProviderType(str, Enum):
    """Supported LLM provider types."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GEMINI = "gemini"
    VERTEX_LLAMA = "vertex_llama"
    AZURE_OPENAI = "azure_openai"
    OPENAI_COMPATIBLE = "openai_compatible"
    CUSTOM_HTTP = "custom_http"
```

### ProviderConfig

```python
from typing import Dict, Optional
from pydantic import BaseModel, SecretStr, Field, field_validator

class ProviderConfig(BaseModel):
    """Configuration for a single LLM provider."""
    name: str = Field(..., description="Human-readable provider name")
    kind: ProviderType = Field(..., description="Provider type")
    model: str = Field(..., description="Model identifier")
    api_key: Optional[SecretStr] = Field(None, description="API key if required")
    base_url: Optional[str] = Field(None, description="Custom endpoint URL")
    project_id: Optional[str] = Field(None, description="GCP project for Vertex AI")
    location: Optional[str] = Field(None, description="GCP location for Vertex AI")
    extra_headers: Optional[Dict[str, str]] = Field(None, description="Custom headers")
    timeout_seconds: int = Field(120, ge=1, le=600, description="Request timeout")
    max_retries: int = Field(3, ge=0, le=10, description="Max retry attempts")

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("base_url must start with http:// or https://")
        return v
```

### ModelConfig

```python
class ModelConfig(BaseModel):
    """Configuration for an agent's model assignment."""
    provider: str = Field(..., description="Key into providers map")
    model: Optional[str] = Field(None, description="Override provider's default model")
    temperature: float = Field(0.7, ge=0, le=2, description="Sampling temperature")
    max_tokens: int = Field(4096, ge=1, le=128000, description="Max output tokens")
    system_prompt_prefix: Optional[str] = Field(None, description="Prepend to system prompt")
```

### ArenaConfig

```python
class ArenaConfig(BaseModel):
    """Complete arena configuration."""
    providers: Dict[str, ProviderConfig] = Field(..., description="Available providers")
    attacker: ModelConfig = Field(..., description="Attacker agent config")
    target: ModelConfig = Field(..., description="Target LLM config")
    judge: ModelConfig = Field(..., description="Judge agent config")
    defender: ModelConfig = Field(..., description="Defender agent config")

    @field_validator("attacker", "target", "judge", "defender")
    @classmethod
    def validate_provider_exists(cls, v: ModelConfig, info) -> ModelConfig:
        # Validation happens in model_validator to access providers
        return v

    @model_validator(mode="after")
    def validate_all_providers_exist(self) -> "ArenaConfig":
        for role in ["attacker", "target", "judge", "defender"]:
            config = getattr(self, role)
            if config.provider not in self.providers:
                raise ValueError(f"{role}.provider '{config.provider}' not found in providers")
        return self
```

## Default Configuration

```python
DEFAULT_ARENA_CONFIG = ArenaConfig(
    providers={
        "vertex_llama_default": ProviderConfig(
            name="Vertex AI Llama 3.1",
            kind=ProviderType.VERTEX_LLAMA,
            model="llama-3.1-405b-instruct-maas",
            project_id="the-jarvis-brain",
            location="us-central1",
            timeout_seconds=120,
        ),
        "gemini_default": ProviderConfig(
            name="Gemini 3 Pro Preview",
            kind=ProviderType.GEMINI,
            model="gemini-3-pro-preview",
            project_id="the-jarvis-brain",
            location="global",
            timeout_seconds=60,
        ),
    },
    attacker=ModelConfig(
        provider="vertex_llama_default",
        temperature=0.9,  # Higher for creative attacks
        max_tokens=2048,
    ),
    target=ModelConfig(
        provider="vertex_llama_default",
        temperature=0.7,
        max_tokens=1024,
    ),
    judge=ModelConfig(
        provider="gemini_default",
        temperature=0.3,  # Lower for consistent scoring
        max_tokens=1024,
    ),
    defender=ModelConfig(
        provider="gemini_default",
        temperature=0.5,
        max_tokens=2048,
    ),
)
```

## Configuration Loading

### Priority Order (lowest to highest)

1. **Hardcoded defaults** (`DEFAULT_ARENA_CONFIG`)
2. **YAML file** (`~/.red-council/config.yaml` or `./config.yaml`)
3. **Environment variables** (`RC_*` prefix)
4. **Dashboard UI** (runtime session state)

### Environment Variable Convention

```bash
# Provider configuration
RC_PROVIDERS__<PROVIDER_KEY>__<FIELD>=value

# Examples:
RC_PROVIDERS__VERTEX_LLAMA_DEFAULT__PROJECT_ID=my-project
RC_PROVIDERS__OPENAI_CUSTOM__API_KEY=sk-xxx
RC_PROVIDERS__OPENAI_CUSTOM__MODEL=gpt-4o
RC_PROVIDERS__OPENAI_CUSTOM__KIND=openai

# Agent configuration
RC_<ROLE>__<FIELD>=value

# Examples:
RC_ATTACKER__PROVIDER=openai_custom
RC_TARGET__PROVIDER=vertex_llama_default
RC_JUDGE__TEMPERATURE=0.2
RC_DEFENDER__MAX_TOKENS=4096
```

### Config Loader Implementation

```python
import os
import yaml
from pathlib import Path
from typing import Any, Dict

def load_config(
    yaml_path: Optional[Path] = None,
    use_env: bool = True,
    ui_overrides: Optional[Dict[str, Any]] = None,
) -> ArenaConfig:
    """
    Load configuration with priority:
    1. Hardcoded defaults
    2. YAML file
    3. Environment variables
    4. UI overrides
    """
    config_dict = DEFAULT_ARENA_CONFIG.model_dump()

    # Layer 2: YAML file
    yaml_path = yaml_path or _find_yaml_config()
    if yaml_path and yaml_path.exists():
        with open(yaml_path) as f:
            yaml_config = yaml.safe_load(f)
        config_dict = _deep_merge(config_dict, yaml_config)

    # Layer 3: Environment variables
    if use_env:
        env_config = _parse_env_vars()
        config_dict = _deep_merge(config_dict, env_config)

    # Layer 4: UI overrides
    if ui_overrides:
        config_dict = _deep_merge(config_dict, ui_overrides)

    return ArenaConfig.model_validate(config_dict)

def _find_yaml_config() -> Optional[Path]:
    """Search for config file in standard locations."""
    candidates = [
        Path("./config.yaml"),
        Path("./red-council.yaml"),
        Path.home() / ".red-council" / "config.yaml",
    ]
    for path in candidates:
        if path.exists():
            return path
    return None

def _parse_env_vars() -> Dict[str, Any]:
    """Parse RC_* environment variables into nested dict."""
    result = {}
    for key, value in os.environ.items():
        if not key.startswith("RC_"):
            continue
        parts = key[3:].lower().split("__")  # Remove RC_ prefix
        current = result
        for part in parts[:-1]:
            current = current.setdefault(part, {})
        current[parts[-1]] = _parse_value(value)
    return result

def _parse_value(value: str) -> Any:
    """Parse string value to appropriate type."""
    if value.lower() in ("true", "false"):
        return value.lower() == "true"
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        pass
    return value
```

## UniversalLLMClient Factory

```python
from abc import ABC, abstractmethod
from typing import List, Protocol

class LLMClient(Protocol):
    """Protocol for all LLM clients."""
    async def generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        ...

def create_client(config: ArenaConfig, role: str) -> LLMClient:
    """
    Factory to create appropriate LLM client for a role.

    Args:
        config: The arena configuration
        role: One of "attacker", "target", "judge", "defender"

    Returns:
        Configured LLM client instance
    """
    model_config = getattr(config, role)
    provider_config = config.providers[model_config.provider]

    # Override model if specified in ModelConfig
    model = model_config.model or provider_config.model

    match provider_config.kind:
        case ProviderType.GEMINI:
            from src.providers.gemini_client import GeminiClient
            return GeminiClient(
                model=model,
                project_id=provider_config.project_id,
                location=provider_config.location,
            )

        case ProviderType.VERTEX_LLAMA:
            from src.providers.vertex_llama import VertexAILlamaClient
            return VertexAILlamaClient(
                model=model,
                project_id=provider_config.project_id,
                location=provider_config.location,
                llama_guard_enabled=False,  # Always disabled for attacks
            )

        case ProviderType.OPENAI:
            from src.providers.openai_client import OpenAIClient
            return OpenAIClient(
                model=model,
                api_key=provider_config.api_key.get_secret_value() if provider_config.api_key else None,
            )

        case ProviderType.ANTHROPIC:
            from src.providers.anthropic_client import AnthropicClient
            return AnthropicClient(
                model=model,
                api_key=provider_config.api_key.get_secret_value() if provider_config.api_key else None,
            )

        case ProviderType.OPENAI_COMPATIBLE | ProviderType.CUSTOM_HTTP:
            from src.providers.openai_client import OpenAIClient
            return OpenAIClient(
                model=model,
                api_key=provider_config.api_key.get_secret_value() if provider_config.api_key else None,
                base_url=provider_config.base_url,
                extra_headers=provider_config.extra_headers,
            )

        case ProviderType.AZURE_OPENAI:
            from src.providers.azure_openai_client import AzureOpenAIClient
            return AzureOpenAIClient(
                model=model,
                api_key=provider_config.api_key.get_secret_value() if provider_config.api_key else None,
                base_url=provider_config.base_url,
            )

        case _:
            raise ValueError(f"Unknown provider type: {provider_config.kind}")
```

## Behavior

### Configuration Validation

1. All provider keys referenced by agents must exist in `providers` map
2. API keys are required for OpenAI, Anthropic, Azure (unless using env vars)
3. GCP providers (Gemini, Vertex Llama) use Application Default Credentials
4. Temperature must be 0-2, max_tokens must be positive
5. URLs must be valid HTTP/HTTPS

### Runtime Updates

1. Dashboard UI can update configuration via session state
2. Changes take effect on next arena run
3. Provider credentials are never logged or displayed (SecretStr)

### Error Handling

```python
class ConfigError(Exception):
    """Base configuration error."""
    pass

class ProviderNotFoundError(ConfigError):
    """Referenced provider doesn't exist."""
    pass

class InvalidCredentialsError(ConfigError):
    """API key missing or invalid."""
    pass

class ConnectionError(ConfigError):
    """Cannot connect to provider endpoint."""
    pass
```

## Constraints

### Security

- **API keys**: Always use `SecretStr`, never log, redact in UI
- **Untrusted endpoints**: Warn user, require explicit confirmation
- **File paths**: Validate YAML path is within expected directories

### Performance

- Config loading should complete in <100ms
- Client creation should be lazy (on first use)
- Cache parsed YAML to avoid repeated disk reads

### Compatibility

- YAML format must be human-readable and editable
- Environment variables work in Docker, Kubernetes, CI/CD
- Backward compatible with existing GeminiClient/VertexAILlamaClient

## Acceptance Criteria

- [ ] `ArenaConfig` schema validates all fields correctly
- [ ] `load_config()` merges YAML + env vars correctly
- [ ] `create_client()` returns working client for each provider type
- [ ] Environment variable parsing handles nested keys
- [ ] API keys are never logged or displayed in plaintext
- [ ] Invalid configurations raise descriptive errors
- [ ] Dashboard UI can override configuration at runtime
- [ ] Default configuration works out-of-the-box with GCP ADC

## Dependencies

- **pydantic** >= 2.0 (for schemas)
- **pyyaml** (for YAML parsing)
- **src/providers/gemini_client.py** (existing)
- **src/providers/vertex_llama.py** (existing)
- **openai** (optional, for OpenAI/Azure providers)
- **anthropic** (optional, for Anthropic provider)

## Non-Goals

- **Secrets management**: External secrets managers (Vault, AWS Secrets Manager) are out of scope
- **Hot reloading**: Config changes require arena restart
- **Multi-tenant**: Single user/project configuration only
- **Provider health checks**: Validation happens on first API call, not at config load

## File Structure

```
src/
├── config/
│   ├── __init__.py
│   ├── models.py          # Pydantic schemas
│   ├── loader.py          # Config loading logic
│   └── defaults.py        # DEFAULT_ARENA_CONFIG
├── providers/
│   ├── universal.py       # create_client() factory
│   ├── gemini_client.py   # (existing)
│   ├── vertex_llama.py    # (existing)
│   ├── openai_client.py   # (new)
│   ├── anthropic_client.py # (new)
│   └── azure_openai_client.py # (new)
```

## Example YAML Configurations

### Default (Vertex AI Only)

```yaml
# ~/.red-council/config.yaml
providers:
  vertex_llama:
    name: "Vertex AI Llama 3.1"
    kind: vertex_llama
    model: llama-3.1-405b-instruct-maas
    project_id: the-jarvis-brain
    location: us-central1

  gemini:
    name: "Gemini 3 Pro"
    kind: gemini
    model: gemini-3-pro-preview
    project_id: the-jarvis-brain
    location: global

attacker:
  provider: vertex_llama
  temperature: 0.9

target:
  provider: vertex_llama

judge:
  provider: gemini
  temperature: 0.3

defender:
  provider: gemini
```

### Testing External Production LLM

```yaml
providers:
  vertex_llama:
    name: "Vertex AI Llama 3.1"
    kind: vertex_llama
    model: llama-3.1-405b-instruct-maas
    project_id: the-jarvis-brain
    location: us-central1

  gemini:
    name: "Gemini 3 Pro"
    kind: gemini
    model: gemini-3-pro-preview
    project_id: the-jarvis-brain
    location: global

  company_prod:
    name: "Company Production LLM"
    kind: openai_compatible
    model: company-llm-v2
    base_url: https://api.company.com/v1
    api_key: ${COMPANY_API_KEY}
    timeout_seconds: 30

attacker:
  provider: vertex_llama

target:
  provider: company_prod  # Test external LLM

judge:
  provider: gemini

defender:
  provider: gemini
```

### Multi-Model Comparison

```yaml
providers:
  gpt4o:
    name: "OpenAI GPT-4o"
    kind: openai
    model: gpt-4o
    api_key: ${OPENAI_API_KEY}

  claude:
    name: "Anthropic Claude Sonnet"
    kind: anthropic
    model: claude-sonnet-4-20250514
    api_key: ${ANTHROPIC_API_KEY}

  gemini:
    name: "Gemini 3 Pro"
    kind: gemini
    model: gemini-3-pro-preview
    project_id: the-jarvis-brain

attacker:
  provider: gpt4o  # Use GPT-4o as attacker

target:
  provider: claude  # Test Claude's defenses

judge:
  provider: gemini

defender:
  provider: gemini
```
