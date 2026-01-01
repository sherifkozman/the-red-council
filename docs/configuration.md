# Configuration Guide

The Red Council uses a hierarchical configuration system:
1.  **Defaults** (Hardcoded in `src/config/defaults.py`)
2.  **YAML Config** (Loaded from `~/.red-council/config.yaml`)
3.  **Environment Variables** (RC_ prefix)
4.  **UI Overrides** (Runtime parameters)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | API Key for Gemini (if not using ADC) | - |
| `GOOGLE_CLOUD_PROJECT` | GCP Project ID | `the-jarvis-brain` |
| `RC_ATTACKER__PROVIDER` | Provider key for Red Team | `vertex_llama_default` |
| `RC_TARGET__PROVIDER` | Provider key for Target | `vertex_llama_default` |
| `RC_JUDGE__PROVIDER` | Provider key for Judge | `gemini_default` |
| `RC_DEFENDER__PROVIDER` | Provider key for Defender | `gemini_default` |

## Model Configuration

The default Red Team setup uses:
- **Attacker**: Llama 3.1 405B (Vertex AI) - Uncensored.
- **Judge**: Gemini 3 Pro (Vertex AI) - Highly capable reasoning.
- **Defender**: Gemini 3 Pro (Vertex AI) - Expert prompt engineering.
- **Target**: Llama 3.1 405B (Default victim).

### Adding a Custom Provider

Create or edit `~/.red-council/config.yaml`:

```yaml
providers:
  my_openai:
    kind: openai
    model: gpt-4o
    api_key: "sk-..."
  
  local_target:
    kind: openai_compatible
    model: custom-model
    base_url: "http://localhost:11434/v1"

# Assign agents to providers
target:
  provider: local_target
```

## Security Settings

### Target Secret
The `target_secret` is masked throughout the system. It is automatically stripped from logs and SSE streams via the recursive `sanitize_event` utility to prevent leakage to the frontend.

### Bounded Queues
SSE streams are backed by bounded `asyncio.Queue` (maxsize=100) to prevent memory exhaustion from slow consumers.
