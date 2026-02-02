# tests/performance/test_agent_performance.py
"""
Performance benchmarks for The Red Council Agent Security Testing.

Validates the following performance requirements from TRC-028:
1. InstrumentedAgent wrap overhead < 5ms per event
2. AgentJudge evaluation < 10s for 1000 events
3. Full agent test flow < 30s for typical agent (50 tool calls, 100 events)
4. ChromaDB agent_attacks retrieval < 500ms
5. Memory usage < 500MB for typical test

Uses pytest-benchmark for consistent measurements.
"""

import asyncio
import time
from typing import List
from unittest.mock import MagicMock

import pytest
from pydantic import SecretStr

from src.agents.instrumented import InstrumentedAgent
from src.agents.agent_judge import AgentJudge
from src.core.agent_schemas import (
    AgentEvent,
    AgentInstrumentationConfig,
)
from src.knowledge.agent_attacks import AgentAttackKnowledgeBase
from src.reports.agent_report_generator import AgentReportGenerator

from tests.performance.conftest import (
    generate_mixed_events,
    generate_tool_call_events,
    get_process_memory_mb,
    PerformanceMockAgent,
)


# =============================================================================
# Performance Threshold Constants
# =============================================================================

# TRC-028 performance requirements
MAX_EVENT_OVERHEAD_MS = 5.0
MAX_JUDGE_EVAL_TIME_S = 10.0
MAX_FULL_FLOW_TIME_S = 30.0
MAX_CHROMADB_RETRIEVAL_MS = 500.0
MAX_MEMORY_USAGE_MB = 500.0


# =============================================================================
# InstrumentedAgent Performance Tests
# =============================================================================


class TestInstrumentedAgentPerformance:
    """Benchmark InstrumentedAgent event recording overhead."""

    def test_wrap_tool_call_overhead(
        self,
        instrumented_agent: InstrumentedAgent,
        mock_agent: PerformanceMockAgent,
    ):
        """
        Benchmark: InstrumentedAgent wrap overhead < 5ms per event.

        Measures the overhead of wrap_tool_call for sync tools.
        """
        num_iterations = 100
        total_time_ms = 0.0

        for i in range(num_iterations):
            start = time.perf_counter()
            instrumented_agent.wrap_tool_call(
                "read_file",
                mock_agent.tool_call,
                "read_file",
                path=f"/tmp/test_{i}.txt",
            )
            elapsed_ms = (time.perf_counter() - start) * 1000
            total_time_ms += elapsed_ms

        avg_overhead_ms = total_time_ms / num_iterations

        assert avg_overhead_ms < MAX_EVENT_OVERHEAD_MS, (
            f"Tool call overhead {avg_overhead_ms:.2f}ms exceeds "
            f"{MAX_EVENT_OVERHEAD_MS}ms threshold"
        )

    def test_memory_access_overhead(
        self,
        instrumented_agent: InstrumentedAgent,
    ):
        """
        Benchmark: Memory access overhead < 5ms per event.

        Measures set_memory and get_memory overhead.
        """
        num_iterations = 100
        total_time_ms = 0.0

        for i in range(num_iterations):
            start = time.perf_counter()
            instrumented_agent.set_memory(f"key_{i}", f"value_{i}")
            instrumented_agent.get_memory(f"key_{i}")
            elapsed_ms = (time.perf_counter() - start) * 1000
            total_time_ms += elapsed_ms

        avg_overhead_ms = total_time_ms / (num_iterations * 2)

        assert avg_overhead_ms < MAX_EVENT_OVERHEAD_MS, (
            f"Memory access overhead {avg_overhead_ms:.2f}ms exceeds "
            f"{MAX_EVENT_OVERHEAD_MS}ms threshold"
        )

    def test_record_speech_overhead(
        self,
        instrumented_agent: InstrumentedAgent,
    ):
        """
        Benchmark: Speech recording overhead < 5ms per event.
        """
        num_iterations = 100
        total_time_ms = 0.0

        for i in range(num_iterations):
            start = time.perf_counter()
            instrumented_agent.record_speech(
                f"Agent response {i}: This is a test response.",
                intent=f"respond_{i}",
            )
            elapsed_ms = (time.perf_counter() - start) * 1000
            total_time_ms += elapsed_ms

        avg_overhead_ms = total_time_ms / num_iterations

        assert avg_overhead_ms < MAX_EVENT_OVERHEAD_MS, (
            f"Speech recording overhead {avg_overhead_ms:.2f}ms exceeds "
            f"{MAX_EVENT_OVERHEAD_MS}ms threshold"
        )

    def test_high_volume_event_recording(
        self,
        agent_config: AgentInstrumentationConfig,
    ):
        """
        Benchmark: Recording 1000 events maintains < 5ms average.
        """
        mock = PerformanceMockAgent()
        config = AgentInstrumentationConfig(
            enable_tool_interception=True,
            enable_memory_monitoring=True,
            sampling_rate=1.0,
            max_events=2000,
        )
        agent = InstrumentedAgent(mock, "high-volume-test", config)
        agent.register_tool("test_tool", mock.tool_call, "Test tool")

        num_events = 1000
        start = time.perf_counter()

        for i in range(num_events):
            agent.wrap_tool_call(
                "test_tool",
                mock.tool_call,
                "test_tool",
                arg=i,
            )

        total_time_ms = (time.perf_counter() - start) * 1000
        avg_overhead_ms = total_time_ms / num_events

        assert avg_overhead_ms < MAX_EVENT_OVERHEAD_MS, (
            f"High-volume overhead {avg_overhead_ms:.2f}ms exceeds "
            f"{MAX_EVENT_OVERHEAD_MS}ms threshold"
        )

        # Verify all events were recorded
        assert len(agent.events) == num_events


# =============================================================================
# AgentJudge Performance Tests
# =============================================================================


class TestAgentJudgePerformance:
    """Benchmark AgentJudge evaluation performance."""

    @pytest.mark.asyncio
    async def test_judge_small_event_set(
        self,
        agent_judge: AgentJudge,
        small_event_set: List[AgentEvent],
        test_secret: SecretStr,
    ):
        """Benchmark: Small event set (10 events) evaluation."""
        start = time.perf_counter()

        score = await agent_judge.evaluate_agent_async(
            events=small_event_set,
            context="Performance test context",
            target_secret=test_secret,
        )

        elapsed_s = time.perf_counter() - start

        assert score is not None
        assert elapsed_s < 1.0, f"Small set evaluation took {elapsed_s:.2f}s"

    @pytest.mark.asyncio
    async def test_judge_medium_event_set(
        self,
        agent_judge: AgentJudge,
        medium_event_set: List[AgentEvent],
        test_secret: SecretStr,
    ):
        """Benchmark: Medium event set (100 events) evaluation."""
        start = time.perf_counter()

        score = await agent_judge.evaluate_agent_async(
            events=medium_event_set,
            context="Performance test context",
            target_secret=test_secret,
        )

        elapsed_s = time.perf_counter() - start

        assert score is not None
        assert elapsed_s < 2.0, f"Medium set evaluation took {elapsed_s:.2f}s"

    @pytest.mark.asyncio
    async def test_judge_large_event_set(
        self,
        agent_judge: AgentJudge,
        large_event_set: List[AgentEvent],
        test_secret: SecretStr,
    ):
        """
        Benchmark: AgentJudge evaluation < 10s for 1000 events.

        This is the primary TRC-028 requirement for judge performance.
        """
        start = time.perf_counter()

        score = await agent_judge.evaluate_agent_async(
            events=large_event_set,
            context="Performance test context",
            target_secret=test_secret,
        )

        elapsed_s = time.perf_counter() - start

        assert score is not None
        assert elapsed_s < MAX_JUDGE_EVAL_TIME_S, (
            f"Large set evaluation took {elapsed_s:.2f}s, "
            f"exceeds {MAX_JUDGE_EVAL_TIME_S}s threshold"
        )

    @pytest.mark.asyncio
    async def test_owasp_check_performance(
        self,
        agent_judge: AgentJudge,
        large_event_set: List[AgentEvent],
    ):
        """Benchmark individual OWASP checks on large event set."""
        check_times = {}

        checks = [
            ("ASI01", agent_judge.check_asi01_excessive_agency),
            ("ASI02", agent_judge.check_asi02_inadequate_controls),
            ("ASI03", agent_judge.check_asi03_vulnerable_integrations),
            ("ASI04", agent_judge.check_asi04_prompt_injection),
            ("ASI05", agent_judge.check_asi05_improper_authorization),
            ("ASI06", agent_judge.check_asi06_data_disclosure),
            ("ASI07", agent_judge.check_asi07_insecure_memory),
            ("ASI08", agent_judge.check_asi08_misalignment),
            ("ASI09", agent_judge.check_asi09_weak_guardrails),
            ("ASI10", agent_judge.check_asi10_over_trust),
        ]

        for name, check_fn in checks:
            start = time.perf_counter()
            result = check_fn(large_event_set)
            elapsed_ms = (time.perf_counter() - start) * 1000
            check_times[name] = elapsed_ms
            assert result is not None

        # Each check should complete in < 1 second
        for name, elapsed_ms in check_times.items():
            assert elapsed_ms < 1000, (
                f"OWASP check {name} took {elapsed_ms:.2f}ms (>1000ms)"
            )


# =============================================================================
# ChromaDB Performance Tests
# =============================================================================


class TestChromaDBPerformance:
    """Benchmark ChromaDB agent_attacks retrieval performance."""

    @pytest.mark.asyncio
    async def test_retrieve_attacks_performance(
        self,
        agent_attack_kb: AgentAttackKnowledgeBase,
    ):
        """
        Benchmark: ChromaDB agent_attacks retrieval < 500ms.
        """
        start = time.perf_counter()

        results = await agent_attack_kb.retrieve_attacks("tool abuse security", k=10)

        elapsed_ms = (time.perf_counter() - start) * 1000

        assert results is not None, "Retrieval returned None"
        assert len(results) > 0, "Retrieval returned empty results"
        assert elapsed_ms < MAX_CHROMADB_RETRIEVAL_MS, (
            f"ChromaDB retrieval took {elapsed_ms:.2f}ms, "
            f"exceeds {MAX_CHROMADB_RETRIEVAL_MS}ms threshold"
        )

    def test_get_attacks_for_owasp_performance(
        self,
        agent_attack_kb: AgentAttackKnowledgeBase,
    ):
        """Benchmark OWASP-filtered retrieval."""
        from src.core.owasp_agentic import OWASPAgenticRisk

        start = time.perf_counter()

        results = agent_attack_kb.get_attacks_for_owasp(
            OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
            k=5,
        )

        elapsed_ms = (time.perf_counter() - start) * 1000

        assert elapsed_ms < MAX_CHROMADB_RETRIEVAL_MS, (
            f"OWASP-filtered retrieval took {elapsed_ms:.2f}ms, "
            f"exceeds {MAX_CHROMADB_RETRIEVAL_MS}ms threshold"
        )

    def test_get_attacks_by_capability_performance(
        self,
        agent_attack_kb: AgentAttackKnowledgeBase,
    ):
        """Benchmark capability-filtered retrieval."""
        start = time.perf_counter()

        # Only use one filter at a time - ChromaDB requires $and for multiple
        results = agent_attack_kb.get_attacks_by_capability(
            tools=True,
            memory=False,
            k=5,
        )

        elapsed_ms = (time.perf_counter() - start) * 1000

        assert elapsed_ms < MAX_CHROMADB_RETRIEVAL_MS, (
            f"Capability-filtered retrieval took {elapsed_ms:.2f}ms, "
            f"exceeds {MAX_CHROMADB_RETRIEVAL_MS}ms threshold"
        )


# =============================================================================
# Full Flow Performance Tests
# =============================================================================


class TestFullFlowPerformance:
    """
    Benchmark complete agent test flow performance.

    TRC-028 requirement: Full agent test flow < 30s for typical agent
    (50 tool calls, 100 events).
    """

    @pytest.mark.asyncio
    async def test_full_agent_test_flow(
        self,
        mock_base_judge: MagicMock,
        test_secret: SecretStr,
    ):
        """
        Benchmark: Full agent test flow < 30s.

        Simulates: wrap agent -> record events -> evaluate -> generate report.
        """
        start = time.perf_counter()

        # 1. Create and configure instrumented agent
        mock = PerformanceMockAgent()
        config = AgentInstrumentationConfig(
            enable_tool_interception=True,
            enable_memory_monitoring=True,
            sampling_rate=1.0,
            max_events=500,
        )
        agent = InstrumentedAgent(mock, "full-flow-test", config)
        agent.register_tool("read_file", mock.tool_call, "Read a file")
        agent.register_tool("write_file", mock.tool_call, "Write a file")
        agent.register_tool("execute", mock.tool_call, "Execute command")

        # 2. Simulate agent activity (50 tool calls, memory ops, speech)
        for i in range(50):
            agent.wrap_tool_call(
                "read_file",
                mock.tool_call,
                "read_file",
                path=f"/tmp/file_{i}.txt",
            )
            if i % 2 == 0:
                agent.set_memory(f"key_{i}", f"value_{i}")
            if i % 5 == 0:
                agent.record_speech(f"Processing step {i}")

        # 3. Get events
        events = agent.events
        assert len(events) >= 50, f"Expected >=50 events, got {len(events)}"

        # 4. Evaluate with AgentJudge
        from src.agents.agent_judge import AgentJudge, AgentJudgeConfig

        judge = AgentJudge(judge=mock_base_judge, config=AgentJudgeConfig())
        score = await judge.evaluate_agent_async(
            events=events,
            context="Full flow test",
            target_secret=test_secret,
        )
        assert score is not None

        # 5. Generate report
        generator = AgentReportGenerator()
        report = generator.generate(score, events)
        assert report is not None

        # 6. Verify markdown output
        markdown = report.to_markdown()
        assert len(markdown) > 0

        elapsed_s = time.perf_counter() - start

        assert elapsed_s < MAX_FULL_FLOW_TIME_S, (
            f"Full flow took {elapsed_s:.2f}s, "
            f"exceeds {MAX_FULL_FLOW_TIME_S}s threshold"
        )

    @pytest.mark.asyncio
    async def test_typical_agent_simulation(
        self,
        mock_base_judge: MagicMock,
        test_secret: SecretStr,
    ):
        """
        Benchmark: Typical agent with 100 mixed events.
        """
        start = time.perf_counter()

        # Generate pre-built events for faster test
        events = generate_mixed_events(50, 30, 10, 10)

        # Evaluate
        from src.agents.agent_judge import AgentJudge, AgentJudgeConfig

        judge = AgentJudge(judge=mock_base_judge, config=AgentJudgeConfig())
        score = await judge.evaluate_agent_async(
            events=events,
            context="Typical agent test",
            target_secret=test_secret,
        )

        # Generate report
        generator = AgentReportGenerator()
        report = generator.generate(score, events)

        elapsed_s = time.perf_counter() - start

        assert elapsed_s < MAX_FULL_FLOW_TIME_S, (
            f"Typical agent simulation took {elapsed_s:.2f}s"
        )


# =============================================================================
# Memory Usage Tests
# =============================================================================


class TestMemoryUsage:
    """
    Verify memory usage stays within bounds.

    TRC-028 requirement: Memory usage < 500MB for typical test.
    """

    def test_memory_usage_instrumented_agent(
        self,
        memory_baseline: float,
    ):
        """Verify InstrumentedAgent memory usage with many events."""
        # Skip if memory measurement unavailable
        if memory_baseline < 0:
            pytest.skip("Memory measurement unavailable")

        mock = PerformanceMockAgent()
        config = AgentInstrumentationConfig(
            enable_tool_interception=True,
            enable_memory_monitoring=True,
            sampling_rate=1.0,
            max_events=10000,
        )
        agent = InstrumentedAgent(mock, "memory-test", config)
        agent.register_tool("test_tool", mock.tool_call, "Test tool")

        # Record many events
        for i in range(5000):
            agent.wrap_tool_call(
                "test_tool",
                mock.tool_call,
                "test_tool",
                arg=i,
            )
            if i % 10 == 0:
                agent.set_memory(f"key_{i}", f"value_{i}" * 10)

        current_memory = get_process_memory_mb()
        if current_memory < 0:
            pytest.skip("Memory measurement unavailable after test")

        memory_used = current_memory - memory_baseline

        assert memory_used < MAX_MEMORY_USAGE_MB, (
            f"Memory usage {memory_used:.1f}MB exceeds {MAX_MEMORY_USAGE_MB}MB"
        )

    @pytest.mark.asyncio
    async def test_memory_usage_full_flow(
        self,
        mock_base_judge: MagicMock,
        test_secret: SecretStr,
        memory_baseline: float,
    ):
        """Verify full flow memory usage stays bounded."""
        # Skip if memory measurement unavailable
        if memory_baseline < 0:
            pytest.skip("Memory measurement unavailable")

        # Generate large event set
        events = generate_mixed_events(200, 150, 50, 50)

        # Evaluate
        from src.agents.agent_judge import AgentJudge, AgentJudgeConfig

        judge = AgentJudge(judge=mock_base_judge, config=AgentJudgeConfig())
        score = await judge.evaluate_agent_async(
            events=events,
            context="Memory test",
            target_secret=test_secret,
        )

        # Generate report
        generator = AgentReportGenerator()
        report = generator.generate(score, events)
        _ = report.to_markdown()

        current_memory = get_process_memory_mb()
        if current_memory < 0:
            pytest.skip("Memory measurement unavailable after test")

        memory_used = current_memory - memory_baseline

        assert memory_used < MAX_MEMORY_USAGE_MB, (
            f"Full flow memory {memory_used:.1f}MB exceeds limit"
        )


# =============================================================================
# Regression Detection Tests
# =============================================================================


class TestPerformanceRegression:
    """
    Tests to detect performance regressions.

    These establish baseline expectations that CI should fail if exceeded by >20%.
    """

    def test_event_creation_baseline(self):
        """Establish baseline for event creation performance."""
        num_events = 1000
        start = time.perf_counter()

        events = generate_tool_call_events(num_events)

        elapsed_ms = (time.perf_counter() - start) * 1000

        assert len(events) == num_events
        # Baseline: 1000 events should be created in < 500ms (allow for CI variability)
        assert elapsed_ms < 500, (
            f"Event creation took {elapsed_ms:.2f}ms for {num_events} events"
        )

    def test_event_property_access_baseline(
        self,
        instrumented_agent: InstrumentedAgent,
        mock_agent: PerformanceMockAgent,
    ):
        """Establish baseline for accessing events property."""
        # Record some events first
        for i in range(100):
            instrumented_agent.wrap_tool_call(
                "read_file",
                mock_agent.tool_call,
                "read_file",
                path=f"/tmp/{i}.txt",
            )

        # Measure events property access time
        start = time.perf_counter()
        for _ in range(100):
            _ = instrumented_agent.events

        elapsed_ms = (time.perf_counter() - start) * 1000

        # Baseline: 100 accesses should complete in < 50ms
        assert elapsed_ms < 50, (
            f"Events property access took {elapsed_ms:.2f}ms for 100 accesses"
        )
