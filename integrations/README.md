# Integrations

Third-party integrations for The Red Council.

## Available Integrations

### OpenClaw

Test OpenClaw AI agents for security vulnerabilities.

- **Location**: [`openclaw/`](openclaw/)
- **Documentation**: [OpenClaw Integration Tutorial](../docs/tutorials/openclaw-integration.md)
- **Skill Reference**: [`SKILL.md`](openclaw/SKILL.md)

#### Quick Start

```bash
# Install
pip install the-red-council

# In OpenClaw, run:
/red-council scan
```

## Adding New Integrations

To add a new integration:

1. Create a folder under `integrations/`
2. Add a `SKILL.md` or `README.md` with usage instructions
3. Add any scripts or configuration files
4. Update this README

See the [OpenClaw integration](openclaw/) as a reference implementation.
