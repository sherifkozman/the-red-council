# src/agents/target.py

from typing import List
from pydantic import SecretStr
from src.providers.gemini_client import GeminiClient
from src.providers.types import AgentRole, Message, ROLE_CONFIGS
from src.agents.errors import TargetLLMError


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
        """
        try:
            # GeminiClient handles conversation history conversion
            response = await self.client.generate_agent_response(
                role=AgentRole.TARGET, messages=history, override_config=self.config
            )
            return response
        except Exception as e:
            raise TargetLLMError(f"Target LLM failed: {e}")
