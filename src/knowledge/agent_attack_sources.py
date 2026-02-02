"""
Agent Attack Sources - Enum and metadata for research dataset sources.

This module defines the sources from which agent attack templates are derived,
based on documented research datasets for LLM agent security testing.

Research Dataset Sources:
- AgentDojo: Multi-agent injection benchmark
- ASB (Agent Security Benchmark): Comprehensive agent vulnerability dataset
- InjecAgent: Injection attack patterns for agents
- ToolEmu: Tool use vulnerability patterns
- R-Judge: Reasoning-based attack patterns
- MCPTox: MCP protocol attack patterns
- HarmBench: Harmful behavior benchmark (agent-specific subset)
- garak: LLM vulnerability scanner patterns
"""

from dataclasses import dataclass
from enum import Enum


class AgentAttackSource(str, Enum):
    """
    Enumeration of research dataset sources for agent attack templates.

    Each source represents a documented research dataset or tool that provides
    attack patterns specifically designed for testing LLM agent security.
    """

    # Priority 0: Core agent security benchmarks
    AGENTDOJO = "agentdojo"
    """AgentDojo - Multi-agent injection and jailbreak benchmark."""

    ASB = "asb"
    """Agent Security Benchmark - Comprehensive agent vulnerability dataset."""

    INJECAGENT = "injecagent"
    """InjecAgent - Injection attack patterns targeting agent tool use."""

    HARMBENCH = "harmbench"
    """HarmBench - Harmful behavior benchmark (agent-specific subset)."""

    # Priority 1: Specialized attack sources
    TOOLEMU = "toolemu"
    """ToolEmu - Tool use emulation and vulnerability patterns."""

    RJUDGE = "rjudge"
    """R-Judge - Reasoning-based attack patterns for agents."""

    MCPTOX = "mcptox"
    """MCPTox - Model Context Protocol attack patterns."""

    GARAK = "garak"
    """garak - LLM vulnerability scanner patterns."""

    # Custom/manual entries
    CUSTOM = "custom"
    """Custom - Manually created attack templates."""


class AgentLayer(str, Enum):
    """
    Agent architecture layer targeted by an attack.

    Attacks can target different layers of an agent's architecture,
    from input processing to tool execution to output generation.
    """

    INPUT = "input"
    """Input layer - attacks on prompt/message processing."""

    REASONING = "reasoning"
    """Reasoning layer - attacks on agent's decision-making process."""

    PLANNING = "planning"
    """Planning layer - attacks on multi-step action planning."""

    TOOL_SELECTION = "tool_selection"
    """Tool selection layer - attacks on which tools the agent chooses."""

    TOOL_EXECUTION = "tool_execution"
    """Tool execution layer - attacks on how tools are called/used."""

    MEMORY = "memory"
    """Memory layer - attacks on persistent storage/retrieval."""

    OUTPUT = "output"
    """Output layer - attacks on response generation."""

    ORCHESTRATION = "orchestration"
    """Orchestration layer - attacks on multi-agent coordination."""


@dataclass(frozen=True)
class SourceMetadata:
    """Metadata for an attack source."""

    name: str
    """Human-readable name of the source."""

    url: str | None
    """URL to the source's documentation or repository."""

    paper_url: str | None
    """URL to the research paper, if applicable."""

    description: str
    """Brief description of the source."""

    priority: int
    """Import priority (0 = highest)."""

    estimated_templates: int
    """Estimated number of templates from this source."""


# Metadata for each source
SOURCE_METADATA: dict[AgentAttackSource, SourceMetadata] = {
    AgentAttackSource.AGENTDOJO: SourceMetadata(
        name="AgentDojo",
        url="https://github.com/ethz-spylab/agentdojo",
        paper_url="https://arxiv.org/abs/2406.13352",
        description="Multi-agent benchmark for injection attacks and jailbreaks",
        priority=0,
        estimated_templates=100,
    ),
    AgentAttackSource.ASB: SourceMetadata(
        name="Agent Security Benchmark",
        url="https://github.com/agentic-security/ASB",
        paper_url=None,
        description="Comprehensive benchmark for agent security vulnerabilities",
        priority=0,
        estimated_templates=150,
    ),
    AgentAttackSource.INJECAGENT: SourceMetadata(
        name="InjecAgent",
        url="https://github.com/uiuc-kang-lab/InjecAgent",
        paper_url="https://arxiv.org/abs/2403.02691",
        description="Injection attack patterns for LLM agents with tool access",
        priority=0,
        estimated_templates=100,
    ),
    AgentAttackSource.HARMBENCH: SourceMetadata(
        name="HarmBench",
        url="https://github.com/centerforaisafety/HarmBench",
        paper_url="https://arxiv.org/abs/2402.04249",
        description="Standardized benchmark for harmful behavior in LLMs",
        priority=0,
        estimated_templates=100,
    ),
    AgentAttackSource.TOOLEMU: SourceMetadata(
        name="ToolEmu",
        url="https://github.com/ryoungj/ToolEmu",
        paper_url="https://arxiv.org/abs/2309.15817",
        description="Tool use emulation for safety evaluation",
        priority=1,
        estimated_templates=50,
    ),
    AgentAttackSource.RJUDGE: SourceMetadata(
        name="R-Judge",
        url="https://github.com/Lordog/R-Judge",
        paper_url="https://arxiv.org/abs/2401.10019",
        description="Reasoning-based safety evaluation for agents",
        priority=1,
        estimated_templates=50,
    ),
    AgentAttackSource.MCPTOX: SourceMetadata(
        name="MCPTox",
        url=None,
        paper_url=None,
        description="Attack patterns for Model Context Protocol",
        priority=1,
        estimated_templates=30,
    ),
    AgentAttackSource.GARAK: SourceMetadata(
        name="garak",
        url="https://github.com/leondz/garak",
        paper_url=None,
        description="LLM vulnerability scanner with agent-specific probes",
        priority=1,
        estimated_templates=50,
    ),
    AgentAttackSource.CUSTOM: SourceMetadata(
        name="Custom",
        url=None,
        paper_url=None,
        description="Manually created attack templates",
        priority=2,
        estimated_templates=30,
    ),
}


def get_source_metadata(source: AgentAttackSource) -> SourceMetadata:
    """Get metadata for a given source."""
    return SOURCE_METADATA[source]


def get_priority_sources(priority: int) -> list[AgentAttackSource]:
    """Get all sources with the given priority level."""
    return [
        source
        for source, metadata in SOURCE_METADATA.items()
        if metadata.priority == priority
    ]


def get_all_sources_by_priority() -> list[AgentAttackSource]:
    """Get all sources sorted by priority (lowest number = highest priority)."""
    return sorted(
        SOURCE_METADATA.keys(),
        key=lambda s: SOURCE_METADATA[s].priority,
    )
