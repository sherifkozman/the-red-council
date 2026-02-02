#!/usr/bin/env python3
"""
LangChain Agent Security Testing Example

This example demonstrates how to test a LangChain agent using
The Red Council's security testing framework.

Requirements:
    pip install langchain langchain-core

Usage:
    python -m examples.agent_testing.langchain_example
"""

import asyncio
from typing import Any, Dict
from unittest.mock import MagicMock, AsyncMock

from src.integrations import LangChainAgentWrapper
from src.core.agent_schemas import AgentInstrumentationConfig
from src.agents.agent_judge import AgentJudge
from src.reports.agent_report_generator import AgentReportGenerator


def create_mock_langchain_executor() -> MagicMock:
    """
    Create a mock LangChain AgentExecutor for testing.

    In a real scenario, you would use your actual LangChain agent:
        from langchain.agents import AgentExecutor, create_openai_functions_agent
        executor = AgentExecutor(agent=agent, tools=tools)
    """
    # Mock the executor structure
    executor = MagicMock()
    executor.agent = MagicMock()
    executor.tools = []

    # Mock memory (optional)
    memory = MagicMock()
    memory.load_memory_variables = MagicMock(return_value={"history": []})
    executor.memory = memory

    # Mock invoke method
    async def mock_invoke(inputs: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        return {
            "input": inputs.get("input", ""),
            "output": "I searched for that information and found relevant results.",
        }

    executor.ainvoke = AsyncMock(side_effect=mock_invoke)
    executor.invoke = MagicMock(
        side_effect=lambda inputs, **kwargs: {
            "input": inputs.get("input", ""),
            "output": "I searched for that information and found relevant results.",
        }
    )

    return executor


async def run_langchain_test():
    """Run a LangChain agent security test."""
    print("=" * 60)
    print("The Red Council - LangChain Agent Security Test")
    print("=" * 60)

    # 1. Create or load your LangChain agent
    # In production, this would be your actual agent:
    #   executor = AgentExecutor(agent=my_agent, tools=my_tools)
    executor = create_mock_langchain_executor()

    # 2. Configure instrumentation
    config = AgentInstrumentationConfig(
        enable_tool_interception=True,
        enable_memory_monitoring=True,
        divergence_threshold=0.5,
        sampling_rate=1.0,
        max_events=1000,
    )

    # 3. Wrap with LangChainAgentWrapper
    wrapped = LangChainAgentWrapper.from_agent_executor(executor, config)
    print("\n[1] Created LangChainAgentWrapper")

    # 4. Run the agent (events are captured automatically via callbacks)
    print("\n[2] Running agent operations...")

    # Simulate some tool calls that would be captured by callbacks
    # In a real scenario, these would be triggered by the agent
    wrapped.wrap_tool_call(
        tool_name="web_search",
        func=lambda q: f"Results for: {q}",
        query="python security",
    )

    wrapped.wrap_tool_call(
        tool_name="calculator",
        func=lambda x, y: x + y,
        x=10,
        y=20,
    )

    # Simulate memory access
    wrapped.set_memory("conversation_history", "User asked about security")
    wrapped.get_memory("conversation_history")

    # Run the agent
    result = await wrapped.invoke({"input": "Tell me about Python security"})
    print(f"  Agent output: {result.get('output', 'No output')}")

    # 5. Review captured events
    print(f"\n[3] Captured {len(wrapped.events)} events:")
    print(f"  - Tool calls: {len(wrapped.tool_calls)}")
    print(f"  - Memory accesses: {len(wrapped.memory_accesses)}")

    for event in wrapped.events[:5]:  # Show first 5 events
        event_type = type(event).__name__
        event_name = getattr(event, "tool_name", getattr(event, "key", "N/A"))
        print(f"  - {event_type}: {event_name}")

    # 6. Evaluate security
    print("\n[4] Running security evaluation...")
    judge = AgentJudge()
    score = judge.evaluate_agent(
        events=wrapped.events,
        context="LangChain agent with web search and calculator tools",
    )

    # 7. Print assessment results
    print("\n[5] Security Assessment:")
    print(f"  Overall Risk: {score.overall_agent_risk:.1f}/10")
    print(f"  Tool Abuse: {score.tool_abuse_score:.1f}/10")
    print(f"  Memory Safety: {score.memory_safety_score:.1f}/10")

    # 8. Generate detailed report
    print("\n[6] Generating security report...")
    generator = AgentReportGenerator()
    report = generator.generate(score, wrapped.events)

    print(f"  Report Summary: {report.summary[:200]}...")
    print(f"  Risk Score: {report.risk_score:.1f}/10")

    # Print OWASP coverage
    print("\n[7] OWASP Coverage:")
    for risk, tested in report.owasp_coverage.items():
        status = "Tested" if tested else "Not Tested"
        print(f"  - {risk.value}: {status}")

    # Print recommendations
    if report.recommendations:
        print("\n[8] Recommendations:")
        for rec in report.recommendations[:3]:
            print(f"  [{rec.priority.value}] {rec.category.value}")
            print(f"    {rec.description[:80]}...")

    print("\n" + "=" * 60)
    print("LangChain test completed!")
    print("=" * 60)

    return score, report


def run_sync():
    """Synchronous wrapper for the async test."""
    return asyncio.run(run_langchain_test())


if __name__ == "__main__":
    run_sync()
