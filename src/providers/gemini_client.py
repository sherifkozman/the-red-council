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
        project_id: Optional[str] = "dummy-project-id",
        location: Optional[str] = "global",
        api_key: Optional[str] = None,
        use_vertex_ai: bool = True,
    ):
        """
        Initialize GeminiClient using either Vertex AI or Google AI Studio.

        Args:
            project_id: Google Cloud project ID (required for Vertex AI)
            location: Vertex AI location (use 'global' for Gemini 3 models)
            api_key: API Key for Google AI Studio (required if use_vertex_ai=False)
            use_vertex_ai: Whether to use Vertex AI (True) or Google AI Studio (False)
        """
        self.project_id = project_id
        self.location = location
        self.api_key = api_key
        self._use_vertexai = use_vertex_ai

        if not self._use_vertexai and not self.api_key:
            # Fallback to env var if not provided explicitly
            import os

            self.api_key = os.getenv("GOOGLE_API_KEY")

        if not self._use_vertexai and not self.api_key:
            logger.warning(
                "GeminiClient initialized without API Key for AI Studio mode."
            )

        # Note: We create a fresh client per async call to avoid connection lifecycle issues
        # The google-genai SDK's async client can have connection pool issues when reused
        # across different event loop iterations (especially in Streamlit)

    def _create_client(self) -> genai.Client:
        """Create a fresh client instance for each request."""
        if self._use_vertexai:
            return genai.Client(
                vertexai=True, project=self.project_id, location=self.location
            )
        else:
            return genai.Client(api_key=self.api_key)

    def _sanitize_error(self, error: Exception) -> str:
        """Sanitize error message to remove potential secrets."""
        import re

        msg = str(error)
        # Redact API keys and tokens
        msg = re.sub(r"AIza[0-9A-Za-z-_]{35}", "***REDACTED***", msg)
        msg = re.sub(r"sk-[A-Za-z0-9]{48}", "***REDACTED***", msg)
        msg = re.sub(
            r"sk-proj-[A-Za-z0-9-_]{48,}", "***REDACTED***", msg
        )  # OpenAI Project keys
        msg = re.sub(r'"token":\s*"[^"]*"', '"token": "***REDACTED***"', msg)
        return msg

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=2, max=30, jitter=2),
        retry=lambda rs: (
            rs.outcome.failed
            and rs.outcome.exception() is not None
            and not isinstance(
                rs.outcome.exception(),
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
        contents = []
        system_instruction = config.system_instruction

        for msg in messages:
            if msg.get("role") == "system":
                continue
            role_name = "user" if msg.get("role") == "user" else "model"
            contents.append(
                types.Content(
                    role=role_name,
                    parts=[types.Part.from_text(text=msg.get("content", ""))],
                )
            )

        # Convert safety_settings dict to list of types.SafetySetting
        safety_settings_list = []
        if config.safety_settings:
            for category, threshold in config.safety_settings.items():
                safety_settings_list.append(
                    types.SafetySetting(category=category, threshold=threshold)
                )

        try:
            async with self._create_client().aio as aclient:
                response = await aclient.models.generate_content(
                    model=config.model_id,
                    contents=contents,  # type: ignore
                    config=types.GenerateContentConfig(
                        temperature=config.temperature,
                        max_output_tokens=config.max_output_tokens,
                        safety_settings=safety_settings_list,
                        system_instruction=system_instruction,
                    ),
                )

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

            sanitized_msg = self._sanitize_error(e)
            error_str = str(e).lower()

            if "rate limit" in error_str or "resource exhausted" in error_str:
                raise RateLimitError(f"Gemini rate limit exceeded: {sanitized_msg}")
            if "permission denied" in error_str or "unauthorized" in error_str:
                raise ConfigurationError(f"Gemini permission denied: {sanitized_msg}")

            logger.error(
                f"Gemini generation error: {type(e).__name__}: {sanitized_msg}"
            )
            raise GeminiClientError(f"Unexpected error: {sanitized_msg}")

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

            if not response.text:
                raise GeminiClientError("Empty response from Gemini")

            data = json.loads(response.text)

            # Validate against schema
            if hasattr(schema_cls, "model_validate"):
                validated = schema_cls.model_validate(data)
                return validated.model_dump()
            return data

        except Exception as e:
            raise GeminiClientError(
                f"Failed to generate structured evaluation: {self._sanitize_error(e)}"
            )

    async def stream_campaign_content(
        self, prompt: str, role: AgentRole = AgentRole.DEFENDER
    ) -> AsyncGenerator[str, None]:
        """Streams content for real-time UI feel."""
        config = ROLE_CONFIGS[role]
        # Fallback if config model is None or empty
        model_id = config.model_id or "gemini-3-pro-preview"

        try:
            async with self._create_client().aio as aclient:
                # generate_content_stream returns an async iterator, but as an async method it must be awaited
                stream = await aclient.models.generate_content_stream(
                    model=model_id,
                    contents=prompt,
                )
                async for chunk in stream:
                    if chunk.text:
                        yield chunk.text
        except Exception as e:
            # Raise securely instead of yielding error text
            logger.error(f"Stream error: {self._sanitize_error(e)}")
            raise GeminiClientError("Stream generation failed") from e
