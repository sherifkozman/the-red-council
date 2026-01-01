# Security & Threat Model

The Red Council is a security tool, and its own security is paramount.

## Security Controls

### 1. Secret Masking
The `target_secret` provided by the user is treated as a sensitive credential. It is stored using Pydantic's `SecretStr` and is recursively stripped from all event logs and SSE streams sent to the frontend.

### 2. Output Sanitization
All LLM-generated content is sanitized before being rendered in the UI to prevent Cross-Site Scripting (XSS).
- **Backend**: Uses `nh3` for HTML sanitization (legacy UI).
- **Frontend**: Uses standard React escaping and DOMPurify where necessary.

### 3. API Hardening
- **Input Validation**: Strict Pydantic schemas enforce length and type constraints on all endpoints.
- **Bounded Queues**: SSE connections use bounded queues to prevent Memory-based DoS attacks.
- **CORS**: Configured to only allow trusted origins (localhost:3000 by default).

### 4. LLM Safety
- **Attacker Agent**: Uses Vertex AI Llama 3.1 with safety filters disabled to ensure it can generate adversarial prompts for testing purposes.
- **Judge/Defender**: Use Gemini 3 Pro with default safety filters to ensure they remain impartial and ethical.

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Prompt Injection against Red Council | Input validation and sanitization of all user-provided strings. |
| Denial of Service (LLM Costs) | Session timeouts (30 mins) and max round limits (default 3). |
| Secret Leakage to UI | Recursive `sanitize_event` utility removes secrets from all traffic. |
| RCE via Model Deserialization | Hardcoded embedding models and safe serialization formats. |

## Responsible Disclosure
If you find a security vulnerability in The Red Council, please report it via [GitHub Issues](https://github.com/sherifkozman/the-red-council/issues) or contact the owner directly.
