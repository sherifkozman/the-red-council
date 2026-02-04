# Threat Model & Scope

**Project:** The Red Council
**Version:** 0.5.0
**Last Updated:** 2026-02-03

## 1. Scope Definition

### In Scope
The following attack vectors are explicitly **IN SCOPE** for this tool:

1.  **Prompt Injection**: Attempts to override the system instructions using direct or indirect commands.
2.  **Jailbreaking**: Techniques to bypass safety filters (e.g., DAN, role-play, hypothetical scenarios).
3.  **Secret Extraction**: Attempts to make the model reveal hidden information (the `target_secret`) defined in its system prompt.
4.  **Instruction Leakage**: Attempts to force the model to output its own system instructions verbatim.

### Out of Scope
The following are explicitly **OUT OF SCOPE** and strictly prohibited:

1.  **Malware Generation**: Requests to generate executable code for viruses, ransomware, or exploits.
2.  **Real-World Infrastructure Attacks**: Attempting to execute SQL injection, XSS, or RCE against the hosting infrastructure itself.
3.  **Social Engineering of Humans**: This tool targets LLMs, not human operators.
4.  **Hate Speech & Harassment**: Generation of content strictly violated by standard safety policies (except where necessary to test *defense* against such generation in a controlled sandbox).
5.  **Denial of Service**: Attacks intended to crash the target system via resource exhaustion.

## 2. Trust Assumptions

1.  **Untrusted Inputs**: All outputs from the "Attacker Agent" (Local LLM) are treated as untrusted and potentially malicious.
2.  **Untrusted Outputs**: All responses from the "Target LLM" are treated as untrusted, as they may contain XSS payloads or leaked secrets.
3.  **Sandboxed Execution**: The "Arena" runs in a logical sandbox. No code execution capabilities are given to the LLM agents.

## 3. Data Sensitivity

1.  **Target Secret**: The `target_secret` (e.g., "BANANA123") is the "crown jewels". It must:
    *   Never be displayed in the UI (unless evaluating a leak).
    *   Never be logged in plain text if possible (though for hackathon MVP, local logging is acceptable).
2.  **API Keys**: All API keys (Vertex AI, Gemini) must be loaded from environment variables and never committed to code.

## 4. Defense Mechanisms

1.  **Input Validation**: Strict length limits on all prompts.
2.  **Output Sanitization**: All UI rendering uses `html.escape()` to prevent stored XSS from LLM responses.
3.  **Rate Limiting**: Simple in-memory rate limiting to prevent accidental API quota exhaustion.
4.  **Kill Switch**: The ability to immediately stop a running campaign if behavior deviates from expected parameters.
