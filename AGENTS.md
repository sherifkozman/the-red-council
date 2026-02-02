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