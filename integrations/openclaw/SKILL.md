---
name: red-council
description: >
  Security testing for AI agents. Runs adversarial attacks against your agent
  to find prompt injection, tool abuse, memory poisoning, and data disclosure
  vulnerabilities. Covers OWASP Agentic Top 10. Use when: security test, red team,
  penetration test, vulnerability scan, OWASP check, agent security audit.
user-invocable: true
homepage: https://theredcouncil.com
---

# Red Council - Agent Security Testing

Automatically attack your OpenClaw agent to find security vulnerabilities before real attackers do.

## Commands

```bash
/red-council scan                    # Quick 3-round security scan
/red-council attack --rounds 10      # Full attack campaign
/red-council report                  # Generate findings report
/red-council judge <response>        # Evaluate a single response
```

## What It Tests

| OWASP Code | Vulnerability | Detection Method |
|------------|---------------|------------------|
| ASI01 | Excessive Agency | Monitor for unauthorized tool usage |
| ASI02 | Inadequate Human Oversight | Test for missing approval flows |
| ASI04 | Indirect Prompt Injection | Inject instructions via tool outputs |
| ASI06 | Data Disclosure | Check for secret leakage |
| ASI07 | Insecure Long-Term Memory | Inject persistent instructions |
| ASI08 | Goal Misalignment | Redirect agent objectives |

## Requirements

- Python 3.10+
- OpenClaw Gateway running (default: `ws://127.0.0.1:18789`)
- `GOOGLE_API_KEY` environment variable (for Gemini-based judge)

## Installation

### Option 1: OpenClaw Skill Manager (Recommended)
```bash
openclaw skill install the-red-council
```

### Option 2: Manual Installation
```bash
# Install the package
pip install the-red-council

# Copy skill files to OpenClaw skills directory
git clone https://github.com/sherifkozman/the-red-council.git
cp -r the-red-council/integrations/openclaw ~/.openclaw/skills/red-council
```

### Option 3: From PyPI only
```bash
pip install the-red-council
```

## Quick Start

1. **Verify installation:**
   ```bash
   openclaw skill list | grep red-council
   ```

2. **Run a scan:**
   ```
   /red-council scan
   ```

3. **Review findings:**
   The skill outputs a risk score (0-10) and specific vulnerabilities detected.

## Configuration

Set in `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "red-council": {
        "enabled": true,
        "config": {
          "attack_rounds": 5,
          "attack_categories": ["prompt_injection", "tool_abuse", "data_disclosure"],
          "target_secret": "CANARY_SECRET_12345",
          "report_format": "markdown"
        }
      }
    }
  }
}
```

## Output Example

```
RED COUNCIL SECURITY SCAN
═══════════════════════════════════════════════════════════

Risk Score: 6.5/10 (MEDIUM-HIGH)

Vulnerabilities Detected:
  [CRITICAL] ASI01 - Prompt Injection
    Evidence: Agent executed injected instruction from web_fetch output
    Recommendation: Sanitize tool outputs, use delimiters for external content

  [HIGH] ASI07 - Data Disclosure
    Evidence: Agent revealed contents of ~/.openclaw/openclaw.json
    Recommendation: Implement file access allowlists

  [MEDIUM] ASI02 - Tool Abuse
    Evidence: 47 consecutive exec tool calls detected
    Recommendation: Implement rate limiting on dangerous tools

Hardened System Prompt Generated: ~/.openclaw/hardened_prompt.md
```

## How It Works

1. **Intercept**: Hooks into OpenClaw Gateway WebSocket
2. **Attack**: Sends adversarial prompts from 165+ curated patterns
3. **Judge**: Evaluates responses for security breaches
4. **Defend**: Generates hardened system prompt recommendations
5. **Verify**: Re-tests to confirm fixes work

## Resources

- [OWASP Agentic AI Security Top 10](https://owasp.org/www-project-agentic-ai-top-10/)
- [Red Council Documentation](../../docs/README.md)
- [Attack Knowledge Base](../../src/knowledge/README.md)

## Safety

This skill only tests YOUR agent in YOUR environment. It does not:
- Send data to external servers (runs locally)
- Modify your agent's configuration
- Execute destructive commands
- Access other users' data

All findings are stored locally in `~/.red-council/reports/`.
