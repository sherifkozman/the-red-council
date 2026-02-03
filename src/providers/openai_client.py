# src/providers/openai_client.py

import json
import logging
import os
from typing import AsyncGenerator, Dict, List, Optional, Any, Union

from openai import OpenAI, AsyncOpenAI, APIError, RateLimitError
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from src.providers.errors import GeminiClientError, ConfigurationError
from src.providers.types import AgentRole, RoleConfig, ROLE_CONFIGS, Message

logger = logging.getLogger(__name__)

class ProviderClientError(Exception):
    pass

class OpenAIClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model_id: Optional[str] = None,
    ):
        """
        Initialize OpenAI Client.
        
        Args:
            api_key: OpenAI API Key. Defaults to OPENAI_API_KEY env var.
            base_url: Base URL for API (e.g. for Ollama/vLLM).
            model_id: Default model ID.
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or os.getenv("OPENAI_API_BASE")
        self.default_model = model_id or "gpt-4o"

        if not self.api_key and not self.base_url:
             # If using Ollama, API key might be optional, but we warn
             logger.warning("OpenAIClient initialized without API Key.")

        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        self.async_client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=1, max=10),
        retry=lambda rs: isinstance(rs.outcome.exception(), RateLimitError)
    )
    def generate(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 1024,
        temperature: float = 0.7,
        model: Optional[str] = None,
    ) -> str:
        """
        Synchronous generation (compatible with AttackerAgent).
        """
        try:
            response = self.client.chat.completions.create(
                model=model or self.default_model,
                messages=messages, # type: ignore
                max_tokens=max_tokens,
                temperature=temperature,
            )
            content = response.choices[0].message.content
            if not content:
                raise ProviderClientError("Empty response from OpenAI")
            return content
        except APIError as e:
            raise ProviderClientError(f"OpenAI API Error: {str(e)}")
        except Exception as e:
            logger.error(f"OpenAI generation error: {e}")
            raise ProviderClientError(f"Unexpected error: {str(e)}")

    async def generate_structured_evaluation(
        self,
        prompt: str,
        schema_cls: Any,  # Pydantic model class
        role: AgentRole = AgentRole.JUDGE,
    ) -> Dict[str, Any]:
        """
        Generates structured JSON output using OpenAI JSON mode or Structured Outputs.
        """
        config = ROLE_CONFIGS[role]
        model = self.default_model

        messages = [
            {"role": "system", "content": "You are a helpful assistant. Output valid JSON."},
            {"role": "user", "content": prompt}
        ]

        try:
            response = await self.async_client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=config.temperature,
            )
            
            content = response.choices[0].message.content
            if not content:
                raise ProviderClientError("Empty response from OpenAI")
            
            data = json.loads(content)
            
            # Validate against schema
            if not hasattr(schema_cls, "model_validate"):
                raise ConfigurationError(f"Invalid schema class: {schema_cls}. Must have model_validate method.")
                
            validated = schema_cls.model_validate(data)
            return validated.model_dump()

        except ConfigurationError:
            raise
        except Exception as e:
            raise ProviderClientError(f"Failed to generate structured evaluation: {e}")

    async def stream_campaign_content(self, prompt: str) -> AsyncGenerator[str, None]:
        """Streams content."""
        try:
            stream = await self.async_client.chat.completions.create(
                model=self.default_model,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.error(f"Stream failed: {e}")
            raise ProviderClientError(f"Stream interrupted: {e}")