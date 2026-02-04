# Tutorial: Configuring External LLM Targets

The Red Council is model-agnostic. You can use it to test models from OpenAI, Anthropic, Azure, or even local models running via Ollama.

## 1. Supported Providers

- `openai`: GPT-4o, GPT-4-turbo, or any OpenAI-compatible API (Ollama, vLLM)
- `anthropic`: Claude 3.5 Sonnet, Claude 3 Opus, etc.
- `gemini`: Gemini 3 Pro, Gemini 1.5 Flash.
- `vertex_llama`: Llama 3.1 models on Google Cloud.
- `openrouter`: Access multiple models via OpenRouter API.

## 2. Global Configuration File

Create or edit the configuration file at `~/.red-council/config.yaml`:

```yaml
# Define your providers
providers:
  my_claude:
    kind: anthropic
    model: claude-3-5-sonnet-20240620
    api_key: "your-anthropic-key"

  local_ollama:
    kind: openai
    model: llama3
    api_base: "http://localhost:11434/v1"

# Assign the target agent to your preferred provider
target:
  provider: my_claude
  temperature: 0.7
```

## 3. Environment Variables

You can also override configuration using environment variables:

```bash
export RC_TARGET__PROVIDER=local_ollama
export RC_PROVIDERS__LOCAL_OLLAMA__MODEL=mistral
```

## 4. Testing Local Models (Ollama)

1.  Start Ollama: `ollama serve`
2.  Pull your model: `ollama pull llama3`
3.  Set your `config.yaml` as shown above.
4.  Launch a campaign! The Red Council will now send all target queries to your local Ollama instance.

## 5. Security Note

Never commit your `config.yaml` to version control if it contains API keys. The Red Council also respects `GOOGLE_APPLICATION_CREDENTIALS` for Vertex AI and Gemini access.
