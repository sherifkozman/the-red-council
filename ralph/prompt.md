# Ralph Agent Instructions

You are an autonomous coding agent working on The Red Council Agent Security feature. You are running inside a Ralph loop - each iteration is a fresh instance with clean context.

## Your Task

1. Read the PRD at `ralph/prd.json`
2. Read the progress log at `ralph/progress.txt` (check **Codebase Patterns** section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from trunk.
4. Pick the **highest priority** user story where `passes: false`
5. Read the CLAUDE.md and relevant spec documents before implementing
6. Implement that single user story WITH tests (see Testing Requirements)
7. Run quality checks and verify coverage (see Testing Requirements)
8. Run ALL post-implementation reviews (see Post-Implementation Reviews)
9. Fix ALL issues flagged by reviews before proceeding
10. Update AGENTS.md if you discover reusable patterns
11. If ALL checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
12. Update the PRD to set `passes: true` for the completed story
13. Append your progress to `ralph/progress.txt`

---

## Testing Requirements (MANDATORY)

### Coverage Requirement
- **Minimum 80% coverage** for all new code
- Run coverage check from repository root:
  ```bash
  pytest --cov=src --cov-report=term-missing tests/ -v
  ```
- Do NOT proceed if coverage is below 80%

### Unit Tests (REQUIRED)
- ALL new functions MUST have unit tests
- Test edge cases, not just happy path
- Use pytest fixtures for common setup
- Use pytest.mark.parametrize for table-driven tests

### Integration Tests (REQUIRED)
- **Integration tests are MANDATORY** - mocks alone are NOT sufficient
- API endpoints MUST be tested with FastAPI TestClient
- Agent instrumentation MUST be tested with mock agents
- ChromaDB operations MUST be tested against real database

### Test Patterns for This Codebase
```python
# Parametrized test example
import pytest

@pytest.mark.parametrize("input,expected,should_raise", [
    ("valid_input", "expected_output", False),
    ("invalid_input", None, True),
])
def test_my_function(input, expected, should_raise):
    if should_raise:
        with pytest.raises(ValueError):
            my_function(input)
    else:
        assert my_function(input) == expected

# Fixture example
@pytest.fixture
def mock_agent():
    """Create a mock agent for testing."""
    return MockAgent(name="test-agent")

# Async test example
@pytest.mark.asyncio
async def test_async_function():
    result = await async_function()
    assert result is not None
```

---

## Post-Implementation Reviews (MANDATORY)

After implementation passes tests, run these reviews **IN ORDER**. Do NOT commit until ALL pass.

**IMPORTANT**: Use `council` commands for ALL reviews - works with both Claude and Gemini CLIs.

### 1. Code Review (Quality + Correctness)

```bash
council run critic --mode review "Code review for [Story ID]: Check for logic errors, bugs, code quality, project pattern adherence, and edge case handling in [list files]" --json
```

**Fix ALL issues before proceeding.**

### 2. Silent Failure Detection (Error Handling)

```bash
council run critic --mode review "Silent failure hunt for [Story ID]: Check for empty except blocks, swallowed errors, missing error propagation, inappropriate fallbacks in [list files]" --json
```

**Fix ALL silent failure issues before proceeding.**

### 3. Security Review (CRITICAL)

```bash
council run critic --mode security "Security audit for [Story ID]: Check for injection vulnerabilities, unsafe deserialization, prompt injection risks, auth issues, OWASP violations in [list files]" --json
```

**Fix ALL security issues before proceeding.** This is an LLM security testing platform - security is critical.

### 4. Code Simplification

```bash
council run critic --mode review "Simplification review for [Story ID]: Identify unnecessary complexity, readability improvements, dead code, duplicate logic in [list files]" --json
```

**Apply simplifications that improve maintainability.**

### Review Checklist

Before committing, confirm:
- [ ] All tests pass with 80%+ coverage
- [ ] Code review issues resolved
- [ ] No silent failures
- [ ] Security review passed
- [ ] Code simplified where possible

---

## Project Context

**The Red Council** - LLM Adversarial Security Arena

This is an adversarial testing platform that can test **any LLM with an HTTP endpoint**. The v0.5.0 release extends testing from pure LLM to AI Agent security testing using the OWASP Agentic Top 10.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARENA ORCHESTRATOR (LangGraph)               │
│   States: ATTACKING → JUDGING → DEFENDING → VERIFYING → DONE   │
└─────────────────────────────────────────────────────────────────┘
        ↓                    ↓                    ↓
   Attacker Agent      Judge Agent         Defender Agent
   (Configurable)      (Configurable)      (Configurable)
        ↓                    ↓                    ↓
   Attack KB ←──────── Target LLM ────────► Hardened Prompt
   (ChromaDB)          (Configurable)
```

### OWASP Agentic Top 10 (ASI01-ASI10)

This version implements testing for:
- **ASI01**: Excessive Agency
- **ASI02**: Inadequate Human Oversight
- **ASI03**: Vulnerable Third-Party Integrations
- **ASI04**: Indirect Prompt Injection
- **ASI05**: Improper Authorization
- **ASI06**: Data Disclosure
- **ASI07**: Insecure Long-Term Memory
- **ASI08**: Goal and Instruction Misalignment
- **ASI09**: Weak Guardrails
- **ASI10**: Over-Trust in LLM Outputs

### Key Documentation (READ BEFORE IMPLEMENTING)

- `CLAUDE.md` - Project guidance and architecture
- `specs/product-spec.md` - Product vision
- `specs/components/` - Component specifications
- `red-team-in-a-box-blueprint-v0.3.md` - Research-validated blueprint

### Key Locations

- `src/core/` - Core schemas and models
- `src/agents/` - Agent implementations (attacker, judge, defender)
- `src/knowledge/` - Attack knowledge base (ChromaDB)
- `src/orchestrator/` - LangGraph state machine
- `src/ui/` - Streamlit dashboard
- `src/api/` - FastAPI endpoints

---

## CRITICAL: Non-Interactive Commands

You are running unattended. All commands MUST be non-interactive.

### Python Commands
- **pytest**: `pytest -v tests/ 2>&1` (native non-interactive)
- **pytest coverage**: `pytest --cov=src --cov-report=term-missing tests/ -v`
- **ruff lint**: `ruff check src/ tests/`
- **ruff format**: `ruff format src/ tests/`
- **mypy**: `mypy src/`

### Package Management
- **pip install**: `pip install -q package_name` (quiet mode)
- **uv pip**: `uv pip install package_name`
- **pnpm**: Use `CI=true pnpm install` if frontend needed

### FastAPI/Streamlit
- **Run tests only**: Never start servers interactively
- **Use TestClient**: `from fastapi.testclient import TestClient`

### Other Commands
- **git**: Never use `-i` flags (no `git rebase -i`, `git add -i`)
- **editors**: Never invoke editors (no `git commit` without `-m`)
- **confirmations**: Always use `--yes`, `-y`, or `--force` where available

If a command prompts for input, it will hang forever. Always use the non-interactive variant.

---

## Progress Report Format

APPEND to `ralph/progress.txt` (never replace, always append):

```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- Test coverage achieved: X%
- Reviews completed: code-reviewer, silent-failure-hunter, security, code-simplifier
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

The learnings section is critical - it helps future iterations avoid repeating mistakes.

---

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of `ralph/progress.txt`:

```
## Codebase Patterns
- Pydantic models in src/core/ use Field() with descriptions
- All agent classes inherit from base classes in src/agents/
- ChromaDB collections follow naming convention: {domain}_attacks
- Pytest fixtures in tests/conftest.py for common setup
- Use pytest.mark.asyncio for async test functions
```

Only add patterns that are **general and reusable**, not story-specific details.

---

## Update AGENTS.md

Before committing, check if any edited files have learnings worth preserving in `AGENTS.md`:

**Good additions:**
- API patterns or conventions specific to that module
- Gotchas or non-obvious requirements
- Dependencies between files
- Testing approaches for that area

**Do NOT add:**
- Story-specific implementation details
- Temporary debugging notes
- Information already in progress.txt

---

## Quality Requirements Summary

- ALL commits must pass quality checks (pytest, ruff, mypy)
- ALL new code must have 80%+ test coverage
- ALL new code must have integration tests (not just mocks)
- ALL code must pass 4 review stages before commit
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns
- Security reviews are MANDATORY for agent/LLM code
- OWASP Agentic criteria must be correctly implemented

---

## Stop Condition

**CRITICAL: Complete ONE story, then STOP.**

After completing a user story:
1. Update PRD to set `passes: true`
2. Append progress to `ralph/progress.txt`
3. Check if ALL stories have `passes: true`

If ALL stories are complete, output this EXACT signal on its own line:

    RALPH_SIGNAL_ALL_STORIES_COMPLETE

If there are still stories with `passes: false`:
- **STOP immediately. Do NOT continue to the next story.**
- End your response. The bash loop will start a fresh iteration.
- The next iteration will pick up the next story with clean context.

---

## Failure Recovery

If you encounter failures, follow these recovery steps:

### Test Failures
1. Read the full error output carefully
2. Check if it's a missing dependency: `pip install -q <package>`
3. Check if it's a missing fixture: add to tests/conftest.py
4. Fix the root cause, don't just skip the test

### Council Not Available
If `council` command is not available:
1. Run linting manually: `ruff check src/ tests/ --fix`
2. Run type checking: `mypy src/`
3. Perform manual code review focusing on security

### Git Conflicts
1. Never use interactive git commands
2. If conflicts exist: `git status` to identify, then resolve manually
3. Stage files explicitly: `git add <specific-files>`

### Stuck or Context Exhausted
1. DO NOT continue partial work
2. STOP and let the next iteration continue
3. Document what was attempted in progress.txt

### Python Environment
1. Activate venv if exists: `source venv/bin/activate`
2. Install missing deps: `pip install -q -e ".[dev]"`

---

## Important Reminders

- **ONE story per iteration - then EXIT**
- **80% test coverage minimum - no exceptions**
- **Integration tests required - mocks alone are insufficient**
- **All 4 reviews must pass before commit**
- Commit after each story (keep CI green)
- Read Codebase Patterns in progress.txt BEFORE starting
- Read CLAUDE.md and spec documents BEFORE implementing
- Use non-interactive commands ALWAYS
- Update AGENTS.md with discovered patterns
- Small, focused changes are better than large ones
- This is an LLM security testing platform - security reviews are critical
- **If stuck, STOP and EXIT** - next iteration will continue with fresh context
