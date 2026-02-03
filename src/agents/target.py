# src/agents/target.py

import logging
from typing import List
from pydantic import SecretStr
from src.providers.gemini_client import GeminiClient
from src.providers.errors import SafetyBlockedError
from src.providers.types import AgentRole, Message, ROLE_CONFIGS
from src.agents.errors import TargetLLMError

logger = logging.getLogger(__name__)


class TargetLLM:
    """
    Wrapper around GeminiClient to act as the 'target' model being attacked.
    """

    def __init__(
        self,
        client: GeminiClient,
        system_prompt: str,
        secret: SecretStr,  # SEC-002: SecretStr
        model_id: str = "gemini-3-pro-preview",
    ):
        self.client = client
        self.system_prompt = system_prompt
        self.secret = secret
        self.model_id = model_id

        # Override the default TARGET config with our specific system prompt
        self.config = ROLE_CONFIGS[AgentRole.TARGET].model_copy()
        self.config.model_id = model_id
        self.config.system_instruction = system_prompt

    async def respond(self, history: List[Message]) -> str:
        """
        Generate a response from the target LLM.

        If safety filters block the response, return a refusal message
        rather than crashing the battle - this allows the judge to evaluate.
        """
        try:
            # GeminiClient handles conversation history conversion
            response = await self.client.generate_agent_response(
                role=AgentRole.TARGET, messages=history, override_config=self.config
            )
            return response
        except SafetyBlockedError as e:
            # Safety filter triggered - return refusal for judge to evaluate
            logger.warning("Target response blocked by safety filters: %s", e)
            return (
                "I cannot process that request. "
                "It appears to violate my safety guidelines."
            )
        except Exception as e:
            raise TargetLLMError(f"Target LLM failed: {e}")
