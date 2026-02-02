"""
Test Agents Package - Intentionally Vulnerable Agents for Integration Testing.

This package provides demo agents with intentional security vulnerabilities
for testing The Red Council's agent security detection capabilities.

WARNING: These agents are for TESTING ONLY. They contain intentional
security flaws and should NEVER be used in production environments.

Available Agents:
- VulnerableTestAgent: Agent with 5 intentional OWASP Agentic vulnerabilities

OWASP Categories Covered:
- ASI01: Excessive Agency (no tool call limits)
- ASI02: Inadequate Human Oversight (no confirmation for dangerous actions)
- ASI04: Indirect Prompt Injection (processes injected instructions from outputs)
- ASI06: Data Disclosure (returns sensitive data in query results)
- ASI07: Insecure Long-Term Memory (accepts writes to system keys)
"""

from src.test_agents.vulnerable_agent import VulnerableTestAgent

__all__ = ["VulnerableTestAgent"]
