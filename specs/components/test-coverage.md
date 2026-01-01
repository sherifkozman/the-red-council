# Spec: Test Coverage & CI/CD

**Phase:** 11
**Status:** PLANNED (Post-Hackathon)
**Priority:** MEDIUM

---

## Overview

Implement comprehensive test coverage tooling and CI/CD pipeline to ensure production-grade code quality.

## Goals

1. **Measure coverage** - Know which code paths are untested
2. **Enforce standards** - Fail builds if coverage drops
3. **Automate testing** - Run tests on every PR
4. **Improve reliability** - Add integration and property-based tests

---

## Phase 11A: Test Coverage Tooling

### Dependencies

```bash
pip install pytest-cov coverage
```

### Configuration (.coveragerc)

```ini
[run]
source = src
omit =
    src/mocks/*
    src/ui/*
    */tests/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise NotImplementedError
fail_under = 80
show_missing = true

[html]
directory = htmlcov
```

### Commands

```bash
# Run with coverage
pytest --cov=src --cov-report=html --cov-report=term tests/

# Check threshold (fails if < 80%)
pytest --cov=src --cov-fail-under=80 tests/
```

### Badge

Add to README.md:
```markdown
![Coverage](https://img.shields.io/badge/coverage-80%25-green)
```

---

## Phase 11B: CI/CD Pipeline

### GitHub Actions (.github/workflows/test.yml)

```yaml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-cov pytest-asyncio ruff mypy

      - name: Lint with ruff
        run: ruff check src/

      - name: Type check with mypy
        run: mypy src/ --ignore-missing-imports

      - name: Run tests with coverage
        run: pytest --cov=src --cov-fail-under=80 tests/

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage.xml
```

---

## Phase 11C: Integration Tests

### E2E Test Strategy

```python
# tests/integration/test_arena_e2e.py

@pytest.mark.integration
async def test_full_arena_run():
    """Test complete arena flow with recorded LLM responses."""
    runner = ArenaRunner()

    with patch_llm_responses("fixtures/recorded_responses.json"):
        result = await runner.run(
            secret="BANANA123",
            system_prompt="You are helpful.",
            max_rounds=2
        )

    assert result.state == "DONE"
    assert len(result.rounds) == 2
```

### API Integration Tests

```python
# tests/integration/test_api.py

@pytest.mark.integration
async def test_run_lifecycle():
    """Test API run creation and streaming."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Start run
        response = await client.post("/runs", json={
            "secret": "test",
            "system_prompt": "Be helpful",
            "max_rounds": 1
        })
        assert response.status_code == 202
        run_id = response.json()["run_id"]

        # Stream events
        async with client.stream("GET", f"/runs/{run_id}/stream") as stream:
            events = [json.loads(line) async for line in stream.aiter_lines()]

        assert any(e.get("type") == "complete" for e in events)
```

### Property-Based Testing

```python
# tests/property/test_prompts.py

from hypothesis import given, strategies as st

@given(st.text(min_size=1, max_size=10000))
def test_system_prompt_validation(prompt):
    """Any string up to 10k chars should be accepted."""
    request = StartRunRequest(
        secret="test",
        system_prompt=prompt,
        max_rounds=1
    )
    assert len(request.system_prompt) <= 10000
```

---

## Phase 11D: Test Data Management

### Fixture Structure

```
tests/
├── fixtures/
│   ├── attacks/
│   │   └── sample_attacks.json  # 10 representative attacks
│   ├── responses/
│   │   └── recorded_llm.json    # Recorded LLM responses
│   └── states/
│       └── arena_states.json    # Sample ArenaState objects
├── conftest.py                  # Shared fixtures
└── integration/
```

### Ephemeral ChromaDB

```python
# tests/conftest.py

@pytest.fixture
def ephemeral_kb(tmp_path):
    """Create isolated ChromaDB for each test."""
    kb = AttackKnowledgeBase(persist_directory=str(tmp_path / "chroma"))
    yield kb
    # Cleanup automatic via tmp_path
```

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Line coverage | >= 80% |
| Branch coverage | >= 70% |
| All tests pass | 100% |
| CI run time | < 5 min |
| No linting errors | 0 |
| No type errors | 0 |

---

## Files to Create

| File | Purpose |
|------|---------|
| `.coveragerc` | Coverage configuration |
| `.github/workflows/test.yml` | CI pipeline |
| `tests/conftest.py` | Shared fixtures |
| `tests/integration/` | Integration tests |
| `tests/property/` | Property-based tests |
| `tests/fixtures/` | Test data |
