# src/integrations/__init__.py
"""
Framework integrations for The Red Council Agent Security Testing.

This package provides adapters for popular agent frameworks:
- LangChain (langchain_adapter.py)
- LangGraph (langgraph_adapter.py) - TRC-021
- MCP Protocol (mcp_adapter.py) - TRC-022

All adapters wrap InstrumentedAgent and automatically capture framework-specific events.
"""

from src.integrations.langchain_adapter import (
    LangChainAgentWrapper,
    RedCouncilCallbackHandler,
)

__all__ = [
    "LangChainAgentWrapper",
    "RedCouncilCallbackHandler",
]
