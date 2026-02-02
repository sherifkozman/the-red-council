# tests/performance/__init__.py
"""
Performance tests for The Red Council Agent Security Testing.

Validates:
1. InstrumentedAgent overhead < 5ms per event
2. AgentJudge evaluation < 10s for 1000 events
3. Full agent test flow < 30s for typical agent (50 tool calls, 100 events)
4. ChromaDB agent_attacks retrieval < 500ms
5. Memory usage < 500MB for typical test
"""
