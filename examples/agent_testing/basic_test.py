#!/usr/bin/env python3
"""
Basic Agent Security Testing Example

This example demonstrates the minimal setup for testing an agent
with The Red Council's security testing framework.

Usage:
    python -m examples.agent_testing.basic_test
"""

from typing import Any, Dict

from src.agents.agent_judge import AgentJudge
from src.agents.instrumented import InstrumentedAgent
from src.core.agent_schemas import AgentInstrumentationConfig


# Example: A simple agent that can search and store data
class SimpleAgent:
    """A basic agent with search and memory capabilities."""

    def __init__(self):
        self.memory: Dict[str, Any] = {}

    def search(self, query: str) -> str:
        """Simulate a search operation."""
        return f"Search results for: {query}"

    def store(self, key: str, value: str) -> str:
        """Store a value in memory."""
        self.memory[key] = value
        return f"Stored {key}"

    def retrieve(self, key: str) -> str:
        """Retrieve a value from memory."""
        return self.memory.get(key, "Not found")


def run_basic_test():
    """Run a basic agent security test."""
    print("=" * 60)
    print("The Red Council - Basic Agent Security Test")
    print("=" * 60)

    # 1. Create the agent to test
    agent = SimpleAgent()

    # 2. Configure instrumentation
    config = AgentInstrumentationConfig(
        enable_tool_interception=True,
        enable_memory_monitoring=True,
        divergence_threshold=0.5,
        sampling_rate=1.0,  # Capture all events
        max_events=1000,
    )

    # 3. Wrap the agent with instrumentation
    instrumented = InstrumentedAgent(
        agent=agent,
        name="simple-agent",
        config=config,
    )

    print("\n[1] Running agent operations...")

    # 4. Execute agent operations (events are automatically captured)
    with instrumented:
        # Simulate tool calls
        result1 = instrumented.wrap_tool_call(
            tool_name="search",
            func=agent.search,
            query="python security best practices",
        )
        print(f"  Search result: {result1}")

        result2 = instrumented.wrap_tool_call(
            tool_name="store",
            func=agent.store,
            key="user_query",
            value="python security",
        )
        print(f"  Store result: {result2}")

        # Simulate memory operations
        instrumented.set_memory("session_id", "abc123")
        instrumented.set_memory("user_preference", "dark_mode")

        # Record agent speech
        instrumented.record_speech(
            content="I found some security resources for you.",
            intent="inform_user",
            is_response_to_user=True,
        )

        # Record an action
        instrumented.record_action(
            action_type="response",
            description="Returned search results to user",
            target="user",
        )

    # 5. Review captured events
    print(f"\n[2] Captured {len(instrumented.events)} events:")
    print(f"  - Tool calls: {len(instrumented.tool_calls)}")
    print(f"  - Memory accesses: {len(instrumented.memory_accesses)}")
    print(f"  - Divergences: {len(instrumented.divergences)}")

    # 6. Evaluate for security vulnerabilities
    print("\n[3] Evaluating security...")

    # Create judge (without LLM for this basic example)
    judge = AgentJudge()

    # Synchronous evaluation
    score = judge.evaluate_agent(
        events=instrumented.events,
        context="Testing a simple search and store agent",
    )

    # 7. Print results
    print("\n[4] Security Assessment Results:")
    print(f"  Overall Risk Score: {score.overall_agent_risk:.1f}/10")
    print(f"  Tool Abuse Score: {score.tool_abuse_score:.1f}/10")
    print(f"  Memory Safety Score: {score.memory_safety_score:.1f}/10")
    print(f"  Divergence Count: {score.divergence_count}")

    # 8. Check for specific violations
    print("\n[5] OWASP Agentic Top 10 Violations:")
    violations_found = False
    for violation in score.owasp_violations:
        if violation.detected:
            violations_found = True
            print(
                f"\n  {violation.owasp_category.value}: {violation.owasp_category.name}"
            )
            print(f"    Severity: {violation.severity}/10")
            print(f"    Evidence: {violation.evidence[:100]}...")
            print(f"    Recommendation: {violation.recommendation[:100]}...")

    if not violations_found:
        print("  No violations detected. Agent appears secure.")

    # 9. Print recommendations
    if score.recommendations:
        print("\n[6] Recommendations:")
        for i, rec in enumerate(score.recommendations, 1):
            print(f"  {i}. {rec}")

    print("\n" + "=" * 60)
    print("Test completed successfully!")
    print("=" * 60)

    return score


if __name__ == "__main__":
    run_basic_test()
