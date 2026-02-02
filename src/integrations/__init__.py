# src/integrations/__init__.py
"""
Framework integrations for The Red Council Agent Security Testing.

This package provides adapters for popular agent frameworks:
- LangChain (langchain_adapter.py)
- LangGraph (langgraph_adapter.py)
- MCP Protocol (mcp_adapter.py)

All adapters wrap InstrumentedAgent and automatically capture framework-specific
events for security analysis.
"""

from src.integrations.langchain_adapter import (
    LangChainAgentWrapper,
    RedCouncilCallbackHandler,
)
from src.integrations.langgraph_adapter import LangGraphAgentWrapper
from src.integrations.mcp_adapter import MCPAgentWrapper

__all__ = [
    "LangChainAgentWrapper",
    "RedCouncilCallbackHandler",
    "LangGraphAgentWrapper",
    "MCPAgentWrapper",
]
