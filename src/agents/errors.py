# src/agents/errors.py


class AgentError(Exception):
    """Base exception for all agent errors."""

    pass


class AttackerError(AgentError):
    """Errors in Attacker agent."""

    pass


class RetrievalError(AttackerError):
    """Errors during RAG retrieval."""

    pass


class ModelError(AttackerError):
    """Errors during LLM generation."""

    pass


class JudgeError(AgentError):
    """Errors in Judge agent."""

    pass


class JudgeParseError(JudgeError):
    """Errors parsing judge output."""

    pass


class JudgeTimeoutError(JudgeError):
    """Judge evaluation timed out."""

    pass


class DefenderError(AgentError):
    """Errors in Defender agent."""

    pass


class TargetLLMError(AgentError):
    """Errors in Target LLM."""

    pass


class ToolInterceptionError(Exception):
    """Raised when tool interception fails."""
    pass

class InstrumentationFailureError(Exception):
    """Raised when instrumentation system is compromised (too many failures)."""
    pass

