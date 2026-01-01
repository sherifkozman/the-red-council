# src/providers/errors.py


class GeminiClientError(Exception):
    """Base exception for Gemini client errors."""

    pass


class SafetyBlockedError(GeminiClientError):
    """Raised when the model refuses to generate due to safety settings."""

    pass


class ToolValidationError(GeminiClientError):
    """Raised when tool/function calling fails validation."""

    pass


class RateLimitError(GeminiClientError):
    """Raised when API rate limits are exceeded."""

    pass


class ConfigurationError(GeminiClientError):
    """Raised when client is misconfigured (e.g., missing API key)."""

    pass
