# src/integrations/__init__.py
"""
Framework integrations for The Red Council Agent Security Testing.

This package provides adapters for popular agent frameworks:
- LangChain (langchain_adapter.py)
- LangGraph (langgraph_adapter.py)
- MCP Protocol (mcp_adapter.py) - TRC-022

All adapters wrap InstrumentedAgent and automatically capture framework-specific events.
"""

from src.integrations.langchain_adapter import (
    LangChainAgentWrapper,
    RedCouncilCallbackHandler,
)
from src.integrations.langgraph_adapter import LangGraphAgentWrapper

__all__ = [
    "LangChainAgentWrapper",
    "RedCouncilCallbackHandler",
    "LangGraphAgentWrapper",
]
