# Agent Security Testing Guide

This guide covers The Red Council's agent security testing capabilities, introduced in v0.5.0. Agent testing extends beyond pure LLM evaluation to analyze AI agents that use tools, access memory, and take actions.

## Table of Contents

1. [Overview](#overview)
2. [OWASP Agentic Top 10](#owasp-agentic-top-10)
3. [Core Concepts](#core-concepts)
4. [InstrumentedAgent SDK](#instrumentedagent-sdk)
5. [Framework Integrations](#framework-integrations)
6. [Agent Judge](#agent-judge)
7. [Security Reports](#security-reports)
8. [API Endpoints](#api-endpoints)
9. [Best Practices](#best-practices)

---

## Overview

AI agents introduce unique security risks beyond traditional LLMs:

- **Tool Abuse**: Agents can call tools excessively or with malicious arguments
- **Memory Poisoning**: Persistent memory can be corrupted with injected instructions
- **Deceptive Behavior**: Agents may say one thing but do another
- **Privilege Escalation**: Agents may attempt unauthorized actions

The Red Council provides automated detection for these vulnerabilities using the OWASP Agentic Top 10 framework.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR AGENT APPLICATION                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │ InstrumentedAgent │  ← Wraps your agent
                    │   (SDK)           │
                    └───────┬───────┘
                            │ Records events
                    ┌───────▼───────┐
                    │  AgentJudge   │  ← Evaluates events
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
                    │ AgentSecurityReport │  ← Findings + remediation
                    └───────────────┘
```

---

## OWASP Agentic Top 10

The Red Council tests for all 10 OWASP Agentic vulnerabilities:

| Code | Name | Description |
|------|------|-------------|
| ASI01 | Excessive Agency | Agent performs actions beyond its intended scope |
| ASI02 | Inadequate Human Oversight | Dangerous actions executed without confirmation |
| ASI03 | Vulnerable Third-Party Integrations | Exploitable external API usage |
| ASI04 | Indirect Prompt Injection | Instructions injected via tool outputs or data |
| ASI05 | Improper Authorization | Accessing resources without proper permissions |
| ASI06 | Data Disclosure | Leaking sensitive data in responses or logs |
| ASI07 | Insecure Long-Term Memory | Memory poisoning or unauthorized access |
| ASI08 | Goal and Instruction Misalignment | Deviating from stated objectives |
| ASI09 | Weak Guardrails | Insufficient output filtering or constraints |
| ASI10 | Over-Trust in LLM Outputs | Blindly trusting external LLM responses |

---

## Core Concepts

### Agent Events

The SDK captures five types of events:

```python
from src.core.agent_schemas import (
    ToolCallEvent,      # Tool invocations
    MemoryAccessEvent,  # Memory read/write/delete
    ActionRecord,       # High-level actions taken
    SpeechRecord,       # What the agent says
    DivergenceEvent,    # Speech vs action mismatch
)
```

### Configuration

```python
from src.core.agent_schemas import AgentInstrumentationConfig

config = AgentInstrumentationConfig(
    enable_tool_interception=True,   # Capture tool calls
    enable_memory_monitoring=True,   # Capture memory access
    divergence_threshold=0.5,        # Sensitivity for deception detection
    sampling_rate=1.0,               # Event capture rate (1.0 = all)
    max_events=1000,                 # Buffer size
)
```

---

## InstrumentedAgent SDK

The core SDK for wrapping agents.

### Basic Usage

```python
from src.agents.instrumented import InstrumentedAgent
from src.core.agent_schemas import AgentInstrumentationConfig

# Create configuration
config = AgentInstrumentationConfig(
    enable_tool_interception=True,
    enable_memory_monitoring=True,
)

# Wrap your agent
instrumented = InstrumentedAgent(
    agent=my_agent,
    name="my-test-agent",
    config=config,
)

# Use as context manager for automatic cleanup
with instrumented:
    # Your agent code here
    pass

# Access recorded events
print(f"Total events: {len(instrumented.events)}")
print(f"Tool calls: {len(instrumented.tool_calls)}")
print(f"Memory accesses: {len(instrumented.memory_accesses)}")
```

### Tool Interception

Wrap tool calls to capture invocation details:

```python
def search_web(query: str) -> str:
    return f"Results for: {query}"

# Option 1: Wrap individual calls
result = instrumented.wrap_tool_call(
    tool_name="search_web",
    func=search_web,
    query="test query"
)

# Option 2: Register tools upfront
instrumented.register_tool(
    name="search_web",
    func=search_web,
    description="Search the web",
    sensitive_args=["api_key"],  # Will be redacted in logs
)

# Then intercept
result = instrumented.intercept_tool_call("search_web", query="test")
```

### Memory Monitoring

Track memory access patterns:

```python
# Write to memory
instrumented.set_memory("user_preference", "dark_mode")

# Read from memory
value = instrumented.get_memory("user_preference")

# Delete from memory
instrumented.delete_memory("user_preference")

# List all keys
keys = instrumented.list_memory_keys()

# Access recorded memory events
for event in instrumented.memory_accesses:
    print(f"{event.operation}: {event.key}")
```

### Speech and Action Recording

Track agent outputs and actions:

```python
# Record what the agent says
instrumented.record_speech(
    content="I will search for that information.",
    intent="search_intent",
    is_response_to_user=True,
)

# Record actions taken
instrumented.record_action(
    action_type="api_call",
    description="Called external API",
    target="https://api.example.com",
)
```

### Async Support

All methods support async agents:

```python
async def async_tool(query: str) -> str:
    await asyncio.sleep(0.1)
    return f"Results: {query}"

# Async wrapping
result = await instrumented.wrap_tool_call_async(
    tool_name="async_search",
    func=async_tool,
    query="test"
)
```

---

## Framework Integrations

### LangChain

```python
from langchain.agents import AgentExecutor
from src.integrations import LangChainAgentWrapper
from src.core.agent_schemas import AgentInstrumentationConfig

# Your existing LangChain agent
executor = AgentExecutor(agent=my_agent, tools=my_tools)

# Wrap for security testing
config = AgentInstrumentationConfig(enable_tool_interception=True)
wrapped = LangChainAgentWrapper.from_agent_executor(executor, config)

# Run normally - events are captured automatically
result = await wrapped.invoke({"input": "Hello"})

# Access events
print(wrapped.events)
```

The wrapper uses a custom callback handler to capture:
- `on_tool_start` / `on_tool_end` / `on_tool_error`
- `on_agent_action` / `on_agent_finish`
- Memory access via `agent.memory`

### LangGraph

```python
from langgraph.graph import StateGraph
from src.integrations import LangGraphAgentWrapper
from src.core.agent_schemas import AgentInstrumentationConfig

# Your existing LangGraph
graph = StateGraph(MyState)
graph.add_node("search", search_node)
graph.add_node("answer", answer_node)
compiled = graph.compile()

# Wrap for security testing
config = AgentInstrumentationConfig(enable_tool_interception=True)
wrapped = LangGraphAgentWrapper.from_state_graph(compiled, config)

# Run normally
result = await wrapped.invoke({"input": "test"})

# Access events
print(wrapped.events)
```

The wrapper captures:
- Node executions as tool calls
- State transitions as action records
- State changes as memory access events

### MCP Protocol

```python
from src.integrations import MCPAgentWrapper
from src.core.agent_schemas import AgentInstrumentationConfig

config = AgentInstrumentationConfig(
    enable_tool_interception=True,
    enable_memory_monitoring=True,
)

# MCP over stdio
async with await MCPAgentWrapper.from_stdio_server(
    command=["python", "my_mcp_server.py"],
    config=config,
) as wrapped:
    # Call tools
    result = await wrapped.call_tool("search", {"query": "test"})

    # Access resources
    content = await wrapped.read_resource("file://data.txt")

# Or MCP over HTTP
async with await MCPAgentWrapper.from_http_server(
    url="http://localhost:3000",
    config=config,
) as wrapped:
    result = await wrapped.call_tool("search", {"query": "test"})
```

---

## Agent Judge

Evaluate captured events for security vulnerabilities:

```python
from src.agents.agent_judge import AgentJudge, AgentJudgeConfig
from src.agents.judge import JudgeAgent

# Create judge
base_judge = JudgeAgent()  # For LLM-based evaluation
judge = AgentJudge(judge=base_judge)

# Evaluate events
score = await judge.evaluate_agent_async(
    events=instrumented.events,
    context="Testing a search agent",
)

# Check results
print(f"Overall Risk: {score.overall_agent_risk}/10")
print(f"Tool Abuse Score: {score.tool_abuse_score}/10")
print(f"Memory Safety Score: {score.memory_safety_score}/10")
print(f"Divergence Count: {score.divergence_count}")

# Check specific violations
for violation in score.owasp_violations:
    if violation.detected:
        print(f"\n{violation.owasp_category.name}:")
        print(f"  Severity: {violation.severity}/10")
        print(f"  Evidence: {violation.evidence}")
        print(f"  Recommendation: {violation.recommendation}")
```

### Custom Configuration

```python
from src.agents.agent_judge import AgentJudgeConfig

config = AgentJudgeConfig(
    tool_abuse_threshold=5,       # Max tool calls before warning
    memory_sensitive_threshold=3, # Max sensitive key accesses
    divergence_weight=0.3,        # Weight in overall score
)

judge = AgentJudge(judge=base_judge, config=config)
```

---

## Security Reports

Generate detailed reports with remediation guidance:

```python
from src.reports.agent_report_generator import AgentReportGenerator

# Generate report from score
generator = AgentReportGenerator()
report = generator.generate(score, instrumented.events)

# Access report data
print(f"Risk Score: {report.risk_score}/10")
print(f"Summary: {report.summary}")

# OWASP coverage
for risk, tested in report.owasp_coverage.items():
    status = "Tested" if tested else "Not Tested"
    print(f"  {risk.name}: {status}")

# Recommendations
for rec in report.recommendations:
    print(f"[{rec.priority}] {rec.category}: {rec.description}")

# Export formats
markdown = report.to_markdown()
json_str = report.to_json()
```

### Hardening Plans

Get specific remediation steps:

```python
from src.agents.agent_defender import AgentDefender

defender = AgentDefender()
plan = defender.generate_hardening(score)

# Tool controls
for control in plan.tool_controls:
    print(f"Tool: {control.tool_name}")
    print(f"  Rate Limit: {control.rate_limit}/min")
    print(f"  Requires Approval: {control.requires_approval}")

# Memory policy
if plan.memory_isolation:
    print(f"Allowed Keys: {plan.memory_isolation.allowed_keys_pattern}")
    print(f"Denied Keys: {plan.memory_isolation.denied_keys_pattern}")

# Guardrails
for guardrail in plan.guardrails:
    print(f"Guardrail: {guardrail.name}")
    print(f"  Trigger: {guardrail.trigger_pattern}")
    print(f"  Action: {guardrail.action}")
```

---

## API Endpoints

Agent testing is available via REST API at `/api/v1/agent/`.

### Create Session

```bash
POST /api/v1/agent/session

Request:
{
  "context": "Optional context about the agent",
  "target_secret": "Optional secret to test for leakage"
}

Response (201):
{
  "session_id": "uuid",
  "status": "active",
  "message": "Agent testing session created successfully"
}
```

### Submit Events

```bash
POST /api/v1/agent/session/{session_id}/events

Request:
{
  "events": [
    {
      "event_type": "tool_call",
      "tool_name": "search",
      "arguments": {"query": "test"},
      "result": "search results",
      "duration_ms": 150.5,
      "success": true
    },
    {
      "event_type": "memory_access",
      "operation": "read",
      "key": "user_data",
      "value_preview": "...",
      "sensitive_detected": false
    }
  ]
}

Response (200):
{
  "session_id": "uuid",
  "events_accepted": 2,
  "total_events": 2,
  "message": "Accepted 2 of 2 events"
}
```

### Run Evaluation

```bash
POST /api/v1/agent/session/{session_id}/evaluate

Request:
{
  "config": {}  // Optional AgentJudgeConfig overrides
}

Response (202):
{
  "session_id": "uuid",
  "status": "evaluating",
  "message": "Evaluation started. Poll /score endpoint for results."
}
```

### Get Score

```bash
GET /api/v1/agent/session/{session_id}/score

Response (200):
{
  "session_id": "uuid",
  "score": {
    "overall_agent_risk": 3.5,
    "tool_abuse_score": 8.0,
    "memory_safety_score": 9.0,
    "owasp_violations": [...]
  },
  "status": "completed"
}
```

### Get Report

```bash
GET /api/v1/agent/session/{session_id}/report?format=json

Response (200):
{
  "session_id": "uuid",
  "report": {
    "summary": "...",
    "risk_score": 3.5,
    "owasp_coverage": {...},
    "recommendations": [...]
  },
  "status": "completed"
}

# For markdown format
GET /api/v1/agent/session/{session_id}/report?format=markdown
```

### Delete Session

```bash
DELETE /api/v1/agent/session/{session_id}

Response (200):
{
  "session_id": "uuid",
  "message": "Session deleted successfully"
}
```

---

## Best Practices

### 1. Test in Isolation

Run agent security tests in a sandboxed environment:

```python
# Use test configuration
config = AgentInstrumentationConfig(
    sampling_rate=1.0,  # Capture everything during tests
    max_events=5000,    # Higher limit for thorough testing
)
```

### 2. Test All OWASP Categories

Ensure comprehensive coverage:

```python
score = judge.evaluate_agent(events)
untested = [
    risk for risk, tested in score.owasp_coverage.items()
    if not tested
]
if untested:
    print(f"Warning: Untested categories: {untested}")
```

### 3. Set Appropriate Thresholds

Tune sensitivity for your use case:

```python
# Strict configuration for high-risk agents
strict_config = AgentJudgeConfig(
    tool_abuse_threshold=3,        # Lower tolerance
    memory_sensitive_threshold=1,  # Very strict
)

# Lenient configuration for low-risk agents
lenient_config = AgentJudgeConfig(
    tool_abuse_threshold=20,
    memory_sensitive_threshold=10,
)
```

### 4. Integrate with CI/CD

```python
def test_agent_security():
    # Run agent with test inputs
    with InstrumentedAgent(agent, "ci-test", config) as instrumented:
        agent.run("test input")

    # Evaluate
    score = judge.evaluate_agent(instrumented.events)

    # Fail CI if high risk
    assert score.overall_agent_risk < 5.0, f"Risk too high: {score.overall_agent_risk}"

    # Fail on critical violations
    critical = [v for v in score.owasp_violations if v.severity >= 8]
    assert not critical, f"Critical violations: {critical}"
```

### 5. Review Divergence Events

Deceptive behavior is a serious concern:

```python
for div in score.divergence_examples:
    print(f"Agent said: {div.speech_intent}")
    print(f"Agent did: {div.actual_action}")
    print(f"Severity: {div.severity}")
```

---

## Containerized Test Agent

For development and testing, a containerized vulnerable test agent is available with intentional OWASP Agentic vulnerabilities.

### Quick Start

```bash
# Start the vulnerable agent
docker compose up vulnerable-agent -d

# Test the connection
curl http://localhost:8080/health
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with OWASP categories |
| `/v1/chat/completions` | POST | OpenAI-compatible chat endpoint |
| `/v1/sessions` | GET | List active sessions |
| `/v1/sessions/{id}/events` | GET | Get session events |
| `/v1/sessions/{id}/events/stream` | GET | SSE event stream |

### Testing Script

```bash
# Run the vulnerability tests
python scripts/test_vulnerable_agent.py

# Run Agent Judge integration test
python scripts/test_agent_judge_integration.py
```

### Intentional Vulnerabilities

The test agent demonstrates:
- **ASI01**: No rate limiting on tool calls
- **ASI02**: Executes dangerous actions without confirmation
- **ASI04**: Processes injection patterns from tool outputs
- **ASI06**: Returns sensitive data (SSNs, cards, hashes) in queries
- **ASI07**: Accepts writes to system memory keys

> **Warning**: This agent is for testing only. Never expose to production traffic.

---

## Troubleshooting

### No Events Captured

1. Ensure `enable_tool_interception=True` in config
2. Use `wrap_tool_call()` or `register_tool()` + `intercept_tool_call()`
3. Check `sampling_rate` is not 0.0

### Framework Integration Not Working

1. Verify framework is installed: `pip install langchain langgraph`
2. Check wrapper is created from correct factory method
3. Use `await` for async methods

### Evaluation Timeout

1. Reduce `max_events` in config
2. Use sampling: `sampling_rate=0.5`
3. Clear events periodically: `instrumented.clear_events()`

---

## Next Steps

- [Basic Test Example](../examples/agent_testing/basic_test.py)
- [LangChain Integration Example](../examples/agent_testing/langchain_example.py)
- [Custom Agent Example](../examples/agent_testing/custom_agent.py)
- [API Reference](api-reference.md)
