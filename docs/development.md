# Developer Guide

Welcome to The Red Council. This guide helps you contribute to the project.

## Development Setup

1.  **Clone and Install**: See [Quickstart](quickstart.md).
2.  **Formatting**: We use `ruff` for linting and formatting.
    ```bash
    ./venv/bin/ruff format .
    ./venv/bin/ruff check . --fix
    ```
3.  **Type Checking**: We use `mypy` for strict type safety.
    ```bash
    ./venv/bin/mypy src/ --ignore-missing-imports
    ```

## Testing

Run the full test suite with coverage:
```bash
PYTHONPATH=. ./venv/bin/pytest --cov=src --cov-report=term-missing
```

We aim for **>80% coverage** on all core logic.

### Integration Tests
Integration tests are located in `tests/integration/` and use mocked LLM responses to test the orchestrator flow without incurring API costs.

## Architecture Patterns

- **Schema First**: All data structures must be defined in `src/core/schemas.py`.
- **Stateless API**: The API layer should remain thin, delegating logic to the Orchestrator.
- **Provider Abstraction**: Never use a specific SDK (like `google-genai`) directly in an agent. Use the `UniversalLLMClient` interface.

## Knowledge Base Management

To add new jailbreak artifacts:
1.  Add your artifacts to a JSON file.
2.  Run the seed script:
    ```bash
    PYTHONPATH=. ./venv/bin/python scripts/seed_kb.py --file my_artifacts.json
    ```

### Refreshing Test Data
The integration tests use a subset of artifacts found in `tests/fixtures/attacks/sample_attacks.json`.
To refresh this data:
1.  Modify the JSON file with new test cases.
2.  Ensure each artifact has a unique `id`.
3.  The `ephemeral_kb` fixture in `conftest.py` will automatically load a clean instance for each test run.

