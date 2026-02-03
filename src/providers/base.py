from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List, Union

class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> str:
        """
        Generate text from a prompt.
        
        Args:
            prompt: The input prompt.
            **kwargs: Additional generation parameters (e.g., temperature, max_tokens).
        
        Returns:
            The generated text.
        """
        pass

    @abstractmethod
    async def generate_chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """
        Generate text from a chat history.
        
        Args:
            messages: List of message dicts with 'role' and 'content'.
            **kwargs: Additional generation parameters.
        
        Returns:
            The generated text.
        """
        pass
