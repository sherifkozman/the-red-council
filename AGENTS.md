# Agent Development Guide

## Schema Design Patterns (TRC-002)

### Event Definitions
- Use **Discriminated Unions** for polymorphic events to ensure O(1) parsing and correct type narrowing.
  ```python
  AgentEvent = Annotated[Union[A, B], Field(discriminator="event_type")]
  ```
- All events must inherit from `BaseAgentEvent` which provides:
  - `id` (UUID)
  - `session_id` (UUID)
  - `timestamp` (UTC datetime)
  - `model_config = {"frozen": True, "extra": "forbid"}`

### Security & Validation
- **Sanitization**: Use `@model_validator(mode='before')` to sanitize/redact sensitive fields *before* model instantiation. This works with frozen models and avoids `object.__setattr__` hacks.
- **Constraints**: Define constants for all max lengths (e.g., `MAX_TOOL_NAME_LENGTH`) and apply them to fields.
- **Untrusted Input**: Explicitly document fields that contain user/LLM input with `WARNING` docstrings.
- **Validation**: Enforce logical consistency (e.g., if `success=True`, `exception` must be `None`) using validators.

### Constants
- Define constants at the top of the module for easier maintenance and visibility.

## Testing Patterns

### Integration Testing
- **Mocking Strategy**: Only mock *external* dependencies (like LLM APIs). Do NOT mock the system-under-test (e.g., don't mock `AgentJudge` when testing `AgentJudge`).
- **Negative Testing**: Always include a "benign path" test to ensure no false positives.
- **Error Propagation**: Explicitly test that exceptions in wrapped components (tools) are propagated correctly and recorded as failure events.
- **Concurrency**: For async components, include a simple concurrency test (e.g., `asyncio.gather`) to catch race conditions in state recording.
- **Secrets in Tests**: Never hardcode secrets. Use `os.getenv` or generated values. Use secure comparison (`hmac.compare_digest`) if testing auth logic, though simple equality is often sufficient for functional tests.

### Streamlit UI Testing (TRC-035)
- **Global Module Patching**: For Streamlit tests, patching `sys.modules["streamlit"]` globally in `setUp` is safer and more consistent than patching local imports, ensuring all modules use the same mock.
- **Button Side Effects**: When multiple buttons are used in a single render function, configure `mock_st.button.side_effect` (or `mock_st.sidebar.button.side_effect`) to return `True` only for the specific button being tested (checking `label` or `key`).
- **Async in Callbacks**: `asyncio.run` works inside Streamlit callbacks if no event loop is running, but be aware of the execution context.
- **State Mocking**: Mocking `st.session_state` as a real `dict` (or subclass) is often easier than mocking `__getitem__`/`__setitem__` on a MagicMock.

## Knowledge Base Patterns (TRC-013)

### Seeding Security
- **Environment Gating**: Destructive or dangerous seeding operations MUST be gated by environment checks (e.g., `RC_ENV != production`).
- **Defense in Depth**: For production actions, require TWO checks: an explicit function argument (`allow_production=True`) AND a specific environment variable (`RC_ALLOW_PRODUCTION_SEEDING=1`).
- **Content Validation**: Validate all seed data integrity (IDs, Enums, non-empty fields) *before* attempting insertion to fail fast.
- **Partial Failure Handling**: Explicitly decide and document behavior on partial failure (fail fast vs. best effort). For seeding, best-effort with final error reporting is often acceptable if idempotent.
- **Idempotency**: Ensure seeding is idempotent. Check existence before adding.

## UI Security Patterns (TRC-035)
- **Safe Display**: Never use `st.text(str(obj))` for untrusted objects to prevent arbitrary code execution via malicious `__repr__`. Always use `st.json` for Pydantic models or explicitly format the output.
- **Session ID**: Use `secrets.token_urlsafe(32)` instead of `uuid.uuid4()` for cryptographically secure session IDs.
- **Error Handling**: Catch specific exceptions and log them with tracebacks server-side, but show generic, sanitized error messages to the user to prevent information leakage.
- **State Cleanup**: Ensure error handlers clean up potentially corrupted session state (e.g., reset scores/reports on failure).