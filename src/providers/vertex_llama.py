# src/providers/vertex_llama.py

import logging
import google.auth
import google.auth.transport.requests
import requests
from typing import Dict, List
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential_jitter,
    retry_if_exception_type,
)

from src.providers.errors import GeminiClientError, RateLimitError, ConfigurationError

logger = logging.getLogger(__name__)


class VertexAILlamaClient:
    """
    Client for Vertex AI Llama 3.1 MaaS.

    CRITICAL: This client explicitly disables safety filters (`model_safety_settings.enabled: False`)
    to allow the generation of adversarial prompts for red-teaming purposes.
    """

    def __init__(
        self,
        project_id: str = "the-jarvis-brain",
        location: str = "us-central1",
        model_id: str = "meta/llama-3.1-8b-instruct-maas",
        llama_guard_enabled: bool = False,  # MUST be False for Attacker
    ):
        self.project_id = project_id
        self.location = location
        self.model_id = model_id
        self.llama_guard_enabled = llama_guard_enabled

        # Endpoint for Vertex AI Model-as-a-Service
        self.endpoint = f"https://{location}-aiplatform.googleapis.com/v1beta1/projects/{project_id}/locations/{location}/endpoints/openapi/chat/completions"

        # Authenticate using Application Default Credentials
        try:
            self.credentials, self.project = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
        except Exception as e:
            raise ConfigurationError(f"Failed to load Google Cloud credentials: {e}")

    def _get_headers(self) -> Dict[str, str]:
        """Refreshes credentials and returns auth headers."""
        if not self.credentials.valid:
            request = google.auth.transport.requests.Request()
            self.credentials.refresh(request)

        return {
            "Authorization": f"Bearer {self.credentials.token}",
            "Content-Type": "application/json",
        }

    @retry(
        retry=retry_if_exception_type(
            (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential_jitter(initial=2, max=30, jitter=2),
    )
    def generate(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = 1024,
        temperature: float = 0.9,
    ) -> str:
        """
        Generates text using Llama 3.1 on Vertex AI.
        """
        headers = self._get_headers()

        # Construct the specific payload for Vertex AI Llama
        # Note: The "google" extra_body is the standard way to configure safety settings in Vertex
        payload = {
            "model": self.model_id,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
            # CRITICAL: Disable Llama Guard for red-teaming
            "extra_body": {
                "google": {
                    "model_safety_settings": {"enabled": self.llama_guard_enabled}
                }
            },
        }

        try:
            response = requests.post(
                self.endpoint,
                headers=headers,
                json=payload,
                timeout=(5, 30),  # Connect timeout 5s, Read timeout 30s
            )

            if response.status_code == 429:
                raise RateLimitError(
                    f"Vertex AI rate limit exceeded: {response.text[:200]}"
                )

            if response.status_code != 200:
                # Truncate error text to avoid log leakage
                error_preview = (
                    response.text[:200] + "..."
                    if len(response.text) > 200
                    else response.text
                )
                logger.error(
                    f"Vertex AI error: {response.status_code} - {error_preview}"
                )
                raise GeminiClientError(
                    f"Vertex AI error {response.status_code}: {error_preview}"
                )

            data = response.json()

            # OpenAI-compatible response format
            if "choices" not in data or not data["choices"]:
                raise GeminiClientError("Empty response from Vertex AI Llama")

            return data["choices"][0]["message"]["content"]

        except requests.exceptions.RequestException as e:
            raise GeminiClientError(f"Network error calling Vertex AI: {str(e)}")
        except Exception as e:
            if isinstance(e, (GeminiClientError, RateLimitError)):
                raise e
            logger.error(
                f"Unexpected error in VertexAILlamaClient: {type(e).__name__}: {str(e)}"
            )
            raise GeminiClientError(f"Unexpected error: {str(e)}")
