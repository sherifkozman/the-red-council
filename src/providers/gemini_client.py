# src/providers/gemini_client.py

import json
import logging
from typing import AsyncGenerator, Optional, Dict, Any, List

from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from src.providers.types import AgentRole, RoleConfig, ROLE_CONFIGS, Message
from src.providers.errors import (
    GeminiClientError,
    SafetyBlockedError,
    RateLimitError,
    ConfigurationError,
)

# Configure logging
logger = logging.getLogger(__name__)


class GeminiClient:
    def __init__(
        self,
        project_id: str = "the-jarvis-brain",
        location: str = "global",
        api_key: Optional[str] = None,
    ):
        """
        Initialize GeminiClient using Vertex AI authentication.

        Args:
            project_id: Google Cloud project ID
            location: Vertex AI location (use 'global' for Gemini 3 models)
            api_key: Optional API key (deprecated, uses Vertex AI by default)
        """
        self.project_id = project_id
        self.location = location
        self._use_vertexai = True

        # Note: We create a fresh client per async call to avoid connection lifecycle issues
        # The google-genai SDK's async client can have connection pool issues when reused
        # across different event loop iterations (especially in Streamlit)

    def _create_client(self) -> genai.Client:
        """Create a fresh client instance for each request using Vertex AI."""
        return genai.Client(
            vertexai=True, project=self.project_id, location=self.location
        )

    def _should_retry(self, exception: Exception) -> bool:
        """Determine if we should retry on this exception."""
        # Don't retry on our own custom errors
        if isinstance(
            exception, (GeminiClientError, SafetyBlockedError, ConfigurationError)
        ):
            return False
        # Retry on rate limits
        if isinstance(exception, RateLimitError):
            return True
        # Check for retryable errors in the message
        error_str = str(exception).lower()
        return (
            "rate limit" in error_str
            or "resource exhausted" in error_str
            or "service unavailable" in error_str
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=2, max=30, jitter=2),
        retry=lambda retry_state: (
            retry_state.outcome.failed
            and not isinstance(
                retry_state.outcome.exception(),
                (GeminiClientError, SafetyBlockedError, ConfigurationError),
            )
        ),
    )
    async def generate_agent_response(
        self,
        role: AgentRole,
        messages: List[Message],
        override_config: Optional[RoleConfig] = None,
    ) -> str:
        """Generates a text response for a specific agent role."""
        config = override_config or ROLE_CONFIGS[role]

        # Convert internal Message format to google-genai format
        # New SDK expects list of types.Content or simple strings
        contents = []
        system_instruction = config.system_instruction

        for msg in messages:
            if msg["role"] == "system":
                # Accumulate system messages into system_instruction
                continue
            role_name = "user" if msg["role"] == "user" else "model"
            contents.append(
                types.Content(
                    role=role_name, parts=[types.Part.from_text(text=msg["content"])]
                )
            )

        try:
            # Create fresh client and use async context manager for proper lifecycle
            # This prevents TCPTransport closed errors in Streamlit
            async with self._create_client().aio as aclient:
                response = await aclient.models.generate_content(
                    model=config.model_id,
                    contents=contents,  # type: ignore
                    config=types.GenerateContentConfig(
                        temperature=config.temperature,
                        system_instruction=system_instruction,
                    ),
                )

            # Check for safety blocks - new SDK structure
            if hasattr(response, "prompt_feedback") and response.prompt_feedback:
                if (
                    hasattr(response.prompt_feedback, "block_reason")
                    and response.prompt_feedback.block_reason
                ):
                    raise SafetyBlockedError(
                        f"Blocked: {response.prompt_feedback.block_reason}"
                    )

            if not response.text:
                raise SafetyBlockedError("Response blocked or empty (safety filters).")

            return response.text

        except Exception as e:
            if isinstance(
                e,
                (
                    GeminiClientError,
                    SafetyBlockedError,
                    RateLimitError,
                    ConfigurationError,
                ),
            ):
                raise e
            error_str = str(e).lower()
            if "rate limit" in error_str or "resource exhausted" in error_str:
                raise RateLimitError(f"Gemini rate limit exceeded: {str(e)}")
            if "permission denied" in error_str or "unauthorized" in error_str:
                raise ConfigurationError(
                    f"Gemini permission denied (check API key): {str(e)}"
                )
            if "invalid argument" in error_str:
                raise GeminiClientError(f"Invalid argument to Gemini API: {str(e)}")
            logger.error(f"Gemini generation error: {type(e).__name__}: {str(e)}")
            raise GeminiClientError(f"Unexpected error: {str(e)}")

    async def generate_structured_evaluation(
        self,
        prompt: str,
        schema_cls: Any,  # Pydantic model class
        role: AgentRole = AgentRole.JUDGE,
    ) -> Dict[str, Any]:
        """Generates valid JSON output matching a Pydantic schema."""
        config = ROLE_CONFIGS[role]

        try:
            async with self._create_client().aio as aclient:
                response = await aclient.models.generate_content(
                    model=config.model_id,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=config.temperature,
                        response_mime_type="application/json",
                        response_schema=schema_cls,
                    ),
                )
            return json.loads(response.text or "{}")
        except Exception as e:
            raise GeminiClientError(f"Failed to generate structured evaluation: {e}")

    async def stream_campaign_content(self, prompt: str) -> AsyncGenerator[str, None]:
        """Streams content for real-time UI feel."""
        try:
            async with self._create_client().aio as aclient:
                async for chunk in await aclient.models.generate_content_stream(
                    model="gemini-3-pro-preview",  # Gemini 3 Pro for streaming
                    contents=prompt,
                ):
                    if chunk.text:
                        yield chunk.text
        except Exception as e:
            yield f"[Error streaming content: {str(e)}]"
