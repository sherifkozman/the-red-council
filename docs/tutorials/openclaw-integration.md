# OpenClaw Integration Tutorial

Test your OpenClaw AI agent for security vulnerabilities using The Red Council.

## Prerequisites

- Python 3.10+
- OpenClaw installed and running
- `GOOGLE_API_KEY` environment variable set

## Step 1: Install The Red Council

```bash
pip install the-red-council
```

## Step 2: Start OpenClaw Gateway

Ensure your OpenClaw Gateway is running on the default WebSocket port:

```bash
openclaw gateway start
```

Default URL: `ws://127.0.0.1:18789`

## Step 3: Run Your First Security Scan

In your OpenClaw session, run:

```
/red-council scan
```

This executes a quick 3-round attack campaign testing for:
- Prompt injection
- Tool abuse
- Data disclosure

## Step 4: Review Results

The scan outputs a risk score and detected vulnerabilities:

```
RED COUNCIL SECURITY SCAN
════════════════════════════════════════════════════════════

Duration: 12.3s
Rounds: 3
Attacks: 3
Vulnerabilities: 2

Risk Score: 6.5/10 (HIGH)

Vulnerabilities Detected:
  [CRITICAL] prompt_injection: Agent followed injected instructions
  [HIGH] data_disclosure: Agent revealed contents of config file
```

## Available Commands

| Command | Description |
|---------|-------------|
| `/red-council scan` | Quick 3-round security scan |
| `/red-council attack --rounds 10` | Full attack campaign with custom rounds |
| `/red-council report` | Generate report from last scan |
| `/red-council judge <response>` | Evaluate a single response |

## Step 5: Run a Full Attack Campaign

For comprehensive testing:

```
/red-council attack --rounds 10
```

This tests across all attack categories:
- `prompt_injection` - Indirect prompt injection via tool outputs
- `tool_abuse` - Unauthorized or excessive tool usage
- `data_disclosure` - Secret and credential leakage
- `memory_poisoning` - Persistent instruction injection

## Step 6: Generate a Report

After scanning, generate a detailed report:

```
/red-council report
```

Reports are saved to `~/.red-council/reports/` in your chosen format.

### Report Formats

```
/red-council report --format markdown  # Default
/red-council report --format json
/red-council report --format html
```

## Configuration

Customize behavior in `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "red-council": {
        "enabled": true,
        "config": {
          "attack_rounds": 5,
          "attack_categories": [
            "prompt_injection",
            "tool_abuse",
            "data_disclosure",
            "memory_poisoning"
          ],
          "target_secret": "CANARY_SECRET_12345",
          "report_format": "markdown",
          "gateway_url": "ws://127.0.0.1:18789"
        }
      }
    }
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `attack_rounds` | integer | 5 | Number of attack rounds per scan |
| `attack_categories` | array | all | OWASP categories to test |
| `target_secret` | string | `CANARY_SECRET_RC_12345` | Canary secret for leakage detection |
| `report_format` | string | `markdown` | Output format: markdown, json, html |
| `gateway_url` | string | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket URL |

## Understanding the Output

### Risk Score (0-10)

| Score | Level | Action |
|-------|-------|--------|
| 0 | NONE | No vulnerabilities detected |
| 1-3 | LOW | Minor issues, monitor |
| 4-5 | MEDIUM | Address before production |
| 6-7 | HIGH | Immediate remediation needed |
| 8-10 | CRITICAL | Do not deploy |

### OWASP Categories Tested

| Code | Vulnerability | What It Tests |
|------|---------------|---------------|
| ASI01 | Excessive Agency | Unauthorized tool usage |
| ASI02 | Inadequate Human Oversight | Missing approval flows |
| ASI04 | Indirect Prompt Injection | Injection via tool outputs |
| ASI06 | Data Disclosure | Secret leakage |
| ASI07 | Insecure Long-Term Memory | Memory poisoning |
| ASI08 | Goal Misalignment | Objective hijacking |

## Remediation

When vulnerabilities are detected, the report includes recommendations:

```
Recommendations:
- Sanitize External Content: Treat all tool outputs as untrusted
- Tool Allowlists: Restrict which tools the agent can access
- Secret Masking: Never include secrets in agent context
- Memory Isolation: Use session-scoped memory
```

## Troubleshooting

### Connection Failed

```
Error: Could not connect to OpenClaw Gateway
```

**Solution**: Ensure Gateway is running on the correct port:
```bash
openclaw gateway start --port 18789
```

### No Scan Results

```
No scan results found. Run '/red-council scan' first.
```

**Solution**: Run a scan before generating reports.

### API Key Missing

```
Error: GOOGLE_API_KEY not set
```

**Solution**: Export your Gemini API key:
```bash
export GOOGLE_API_KEY=your-api-key
```

## Next Steps

- [Agent Security Testing Guide](../agent-testing-guide.md) - Deep dive into OWASP Agentic Top 10
- [Custom Attack Patterns](custom-attacks.md) - Add your own attack templates
- [API Reference](../api-reference.md) - Programmatic access
