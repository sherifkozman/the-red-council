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
