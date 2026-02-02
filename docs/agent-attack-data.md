# Agent Attack Data Sources

This document describes the research datasets used to seed The Red Council's
agent attack knowledge base for security testing.

## Overview

The agent attack knowledge base contains 500+ attack templates derived from
documented research datasets. These templates target the OWASP Agentic Top 10
vulnerabilities and cover all layers of agent architecture.

## Research Dataset Sources

### Priority 0 (Core Benchmarks)

#### AgentDojo

- **Repository**: https://github.com/ethz-spylab/agentdojo
- **Paper**: https://arxiv.org/abs/2406.13352
- **Templates**: ~100
- **Focus**: Multi-agent injection attacks and tool manipulation

AgentDojo provides attack patterns for:
- Tool output injection
- Goal hijacking via external data
- Data exfiltration through tools
- Multi-agent communication manipulation

#### Agent Security Benchmark (ASB)

- **Repository**: https://github.com/agentic-security/ASB
- **Templates**: ~150
- **Focus**: Comprehensive agent vulnerability coverage

ASB provides attack patterns for:
- Privilege escalation via social engineering
- Human oversight bypass
- Third-party integration abuse
- Audit log evasion
- Sensitive data disclosure

#### InjecAgent

- **Repository**: https://github.com/uiuc-kang-lab/InjecAgent
- **Paper**: https://arxiv.org/abs/2403.02691
- **Templates**: ~100
- **Focus**: Indirect prompt injection via tool outputs

InjecAgent provides attack patterns for:
- Search result injection
- Document content injection
- API response manipulation
- Memory/context poisoning

#### HarmBench

- **Repository**: https://github.com/centerforaisafety/HarmBench
- **Paper**: https://arxiv.org/abs/2402.04249
- **Templates**: ~100
- **Focus**: Jailbreak and safety bypass patterns

HarmBench provides attack patterns for:
- Jailbreak attempts (DAN, roleplay, encoding)
- Safety guideline bypass
- Hallucination exploitation

### Priority 1 (Specialized Sources)

| Source | Focus | Estimated Templates |
|--------|-------|---------------------|
| ToolEmu | Tool use safety evaluation | ~50 |
| R-Judge | Reasoning-based safety | ~50 |
| MCPTox | MCP protocol attacks | ~30 |
| garak | LLM vulnerability probes | ~50 |

### Priority 2

| Source | Focus | Estimated Templates |
|--------|-------|---------------------|
| Custom | Manually created templates | ~30 |

## OWASP Agentic Top 10 Mapping

Each attack template is mapped to one or more OWASP categories:

| Category | Description | Primary Sources |
|----------|-------------|-----------------|
| ASI01 | Excessive Agency | AgentDojo, ASB |
| ASI02 | Inadequate Human Oversight | ASB |
| ASI03 | Vulnerable Third-Party Integrations | ASB |
| ASI04 | Indirect Prompt Injection | AgentDojo, InjecAgent |
| ASI05 | Improper Authorization | ASB, AgentDojo |
| ASI06 | Data Disclosure | AgentDojo, ASB |
| ASI07 | Insecure Long-Term Memory | InjecAgent |
| ASI08 | Goal/Instruction Misalignment | AgentDojo |
| ASI09 | Weak Guardrails | HarmBench |
| ASI10 | Over-Trust in LLM Outputs | HarmBench, AgentDojo |

## Agent Architecture Layers

Templates target specific layers of agent architecture:

| Layer | Description | Example Attacks |
|-------|-------------|-----------------|
| Input | Prompt/message processing | Jailbreaks, privilege claims |
| Reasoning | Decision-making process | Safety bypass, goal manipulation |
| Planning | Multi-step action planning | Goal hijacking, checkpoint attacks |
| Tool Selection | Tool choice logic | Unauthorized tool access |
| Tool Execution | Tool call handling | Output injection, API abuse |
| Memory | Persistent storage | Memory poisoning, context injection |
| Output | Response generation | Data exfiltration, audit evasion |
| Orchestration | Multi-agent coordination | Inter-agent impersonation |

## Usage

### Seeding the Knowledge Base

```bash
# Seed all Priority 0 sources
python -m src.knowledge.seed_agents --source all --priority 0

# Seed a specific source
python -m src.knowledge.seed_agents --source agentdojo

# Dry run to see what would be added
python -m src.knowledge.seed_agents --source all --dry-run

# With verbose logging
python -m src.knowledge.seed_agents --source all -v
```

### Seeding from Local Dataset Files

Seed from JSON or JSONL files using the `--path` flag:

```bash
python -m src.knowledge.seed_agents --source agentdojo --path ./data/agentdojo.jsonl
python -m src.knowledge.seed_agents --source asb --path ./data/asb.json
```

Supported formats:
- JSONL: one JSON object per line
- JSON: array of objects, or `{ "records": [...] }`

### Environment Requirements

Seeding is blocked by default in production environments. Set one of:

```bash
export RC_ENV=test   # or dev, ci, development
```

Or use the `--allow-production` flag (requires additional safeguards).

### Programmatic Access

```python
from src.knowledge.agent_attacks import AgentAttackKnowledgeBase
from src.knowledge.seed_agents import seed_all_sources, seed_from_source
from src.knowledge.agent_attack_sources import AgentAttackSource

# Initialize knowledge base
kb = AgentAttackKnowledgeBase()

# Seed from a specific source
from src.knowledge.seed_agents import seed_from_source
stats = seed_from_source(kb, AgentAttackSource.AGENTDOJO)
print(f"Added {stats.added} templates")

# Seed all sources
from src.knowledge.seed_agents import seed_all_sources
result = seed_all_sources(kb, priority=0)
print(f"Total: {result.total_added} added, {result.total_skipped} skipped")
```

## Template Schema

Each template includes:

```python
AgentAttackTemplate(
    id="ADOJO-TI-001",                    # Unique identifier
    prompt_template="...",                 # Attack prompt
    attack_type=AttackType.INDIRECT,       # DIRECT or INDIRECT
    technique=Technique.TOOL_OUTPUT_INJECTION,
    target_owasp=[OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION],
    requires_tool_access=True,
    requires_memory_access=False,
    expected_agent_behavior="Agent should sanitize...",
    source="agentdojo",
    source_dataset=AgentAttackSource.AGENTDOJO,
    source_id="agentdojo-ti-1",
    agent_layer=AgentLayer.TOOL_EXECUTION,
    real_world_tested=True,
    description="API response injection",
    target_goal="Tool Output Exploitation",
)
```

### Dataset Record Format

Minimal JSON/JSONL record fields:

```json
{
  "id": "ADOJO-001",
  "prompt": "Attack prompt text",
  "description": "Short description",
  "target_goal": "Goal name",
  "pattern_type": "tool_injection",
  "owasp": ["ASI04"],
  "attack_type": "direct",
  "technique": "instruction_override",
  "requires_tool_access": true,
  "requires_memory_access": false,
  "expected_agent_behavior": "Agent should refuse or sanitize.",
  "agent_layer": "tool_execution",
  "real_world_tested": true,
  "sophistication": 5,
  "tags": ["injection", "tool"]
}
```

Fields are optional except `prompt`; missing fields are filled with safe defaults.

## Security Considerations

These templates contain adversarial patterns for security testing:

1. **Environment**: Only run in test/dev/CI environments
2. **Authorization**: Ensure proper authorization before seeding
3. **Isolation**: Use sandboxed test environments
4. **Audit**: All seeding operations are logged

## Contributing New Templates

To add custom templates:

1. Add to `src/knowledge/agent_seed_data.py` for manual templates
2. Use the `AgentAttackSource.CUSTOM` source
3. Follow the existing template schema
4. Run tests to validate

## References

- [OWASP Agentic AI Security](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [AgentDojo Paper](https://arxiv.org/abs/2406.13352)
- [InjecAgent Paper](https://arxiv.org/abs/2403.02691)
- [HarmBench Paper](https://arxiv.org/abs/2402.04249)
- [ToolEmu Paper](https://arxiv.org/abs/2309.15817)
- [R-Judge Paper](https://arxiv.org/abs/2401.10019)
