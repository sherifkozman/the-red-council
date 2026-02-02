"""
Tests for the agent attack sources module.

Tests cover:
- AgentAttackSource enum
- AgentLayer enum
- SourceMetadata dataclass
- Helper functions
"""

import pytest

from src.knowledge.agent_attack_sources import (
    AgentAttackSource,
    AgentLayer,
    SOURCE_METADATA,
    SourceMetadata,
    get_all_sources_by_priority,
    get_priority_sources,
    get_source_metadata,
)


class TestAgentAttackSource:
    """Tests for AgentAttackSource enum."""

    def test_priority_0_sources(self):
        """Test Priority 0 sources exist."""
        assert AgentAttackSource.AGENTDOJO.value == "agentdojo"
        assert AgentAttackSource.ASB.value == "asb"
        assert AgentAttackSource.INJECAGENT.value == "injecagent"
        assert AgentAttackSource.HARMBENCH.value == "harmbench"

    def test_priority_1_sources(self):
        """Test Priority 1 sources exist."""
        assert AgentAttackSource.TOOLEMU.value == "toolemu"
        assert AgentAttackSource.RJUDGE.value == "rjudge"
        assert AgentAttackSource.MCPTOX.value == "mcptox"
        assert AgentAttackSource.GARAK.value == "garak"

    def test_custom_source(self):
        """Test custom source exists."""
        assert AgentAttackSource.CUSTOM.value == "custom"

    def test_source_is_string_enum(self):
        """Test sources can be used as strings via .value."""
        source = AgentAttackSource.AGENTDOJO
        assert f"Using {source.value}" == "Using agentdojo"

    def test_source_from_string(self):
        """Test creating source from string value."""
        source = AgentAttackSource("agentdojo")
        assert source == AgentAttackSource.AGENTDOJO

    def test_invalid_source_raises(self):
        """Test invalid source string raises ValueError."""
        with pytest.raises(ValueError):
            AgentAttackSource("invalid_source")


class TestAgentLayer:
    """Tests for AgentLayer enum."""

    def test_input_layer(self):
        """Test input layer exists."""
        assert AgentLayer.INPUT.value == "input"

    def test_reasoning_layer(self):
        """Test reasoning layer exists."""
        assert AgentLayer.REASONING.value == "reasoning"

    def test_planning_layer(self):
        """Test planning layer exists."""
        assert AgentLayer.PLANNING.value == "planning"

    def test_tool_layers(self):
        """Test tool-related layers exist."""
        assert AgentLayer.TOOL_SELECTION.value == "tool_selection"
        assert AgentLayer.TOOL_EXECUTION.value == "tool_execution"

    def test_memory_layer(self):
        """Test memory layer exists."""
        assert AgentLayer.MEMORY.value == "memory"

    def test_output_layer(self):
        """Test output layer exists."""
        assert AgentLayer.OUTPUT.value == "output"

    def test_orchestration_layer(self):
        """Test orchestration layer exists."""
        assert AgentLayer.ORCHESTRATION.value == "orchestration"

    def test_layer_is_string_enum(self):
        """Test layers can be used as strings via .value."""
        layer = AgentLayer.INPUT
        assert f"Layer: {layer.value}" == "Layer: input"


class TestSourceMetadata:
    """Tests for SourceMetadata dataclass."""

    def test_metadata_is_frozen(self):
        """Test SourceMetadata is immutable."""
        metadata = SourceMetadata(
            name="Test",
            url=None,
            paper_url=None,
            description="Test source",
            priority=0,
            estimated_templates=10,
        )
        with pytest.raises(Exception):  # FrozenInstanceError
            metadata.name = "Changed"

    def test_metadata_fields(self):
        """Test SourceMetadata has all expected fields."""
        metadata = SourceMetadata(
            name="Test",
            url="https://example.com",
            paper_url="https://arxiv.org/abs/1234",
            description="Test description",
            priority=1,
            estimated_templates=50,
        )
        assert metadata.name == "Test"
        assert metadata.url == "https://example.com"
        assert metadata.paper_url == "https://arxiv.org/abs/1234"
        assert metadata.description == "Test description"
        assert metadata.priority == 1
        assert metadata.estimated_templates == 50


class TestSourceMetadataMapping:
    """Tests for SOURCE_METADATA dictionary."""

    def test_all_sources_have_metadata(self):
        """Test every source has metadata."""
        for source in AgentAttackSource:
            assert source in SOURCE_METADATA, f"Missing metadata for {source}"

    def test_agentdojo_metadata(self):
        """Test AgentDojo metadata is correct."""
        metadata = SOURCE_METADATA[AgentAttackSource.AGENTDOJO]
        assert metadata.name == "AgentDojo"
        assert metadata.priority == 0
        assert "github.com" in metadata.url
        assert "arxiv.org" in metadata.paper_url

    def test_asb_metadata(self):
        """Test ASB metadata is correct."""
        metadata = SOURCE_METADATA[AgentAttackSource.ASB]
        assert metadata.name == "Agent Security Benchmark"
        assert metadata.priority == 0

    def test_injecagent_metadata(self):
        """Test InjecAgent metadata is correct."""
        metadata = SOURCE_METADATA[AgentAttackSource.INJECAGENT]
        assert metadata.name == "InjecAgent"
        assert metadata.priority == 0
        assert "arxiv.org" in metadata.paper_url

    def test_harmbench_metadata(self):
        """Test HarmBench metadata is correct."""
        metadata = SOURCE_METADATA[AgentAttackSource.HARMBENCH]
        assert metadata.name == "HarmBench"
        assert metadata.priority == 0

    def test_custom_metadata(self):
        """Test custom source metadata."""
        metadata = SOURCE_METADATA[AgentAttackSource.CUSTOM]
        assert metadata.name == "Custom"
        assert metadata.priority == 2
        assert metadata.url is None


class TestGetSourceMetadata:
    """Tests for get_source_metadata function."""

    def test_get_agentdojo(self):
        """Test getting AgentDojo metadata."""
        metadata = get_source_metadata(AgentAttackSource.AGENTDOJO)
        assert metadata.name == "AgentDojo"

    def test_get_all_sources(self):
        """Test getting metadata for all sources."""
        for source in AgentAttackSource:
            metadata = get_source_metadata(source)
            assert metadata is not None
            assert isinstance(metadata, SourceMetadata)


class TestGetPrioritySources:
    """Tests for get_priority_sources function."""

    def test_priority_0(self):
        """Test getting priority 0 sources."""
        sources = get_priority_sources(0)
        assert len(sources) == 4
        assert AgentAttackSource.AGENTDOJO in sources
        assert AgentAttackSource.ASB in sources
        assert AgentAttackSource.INJECAGENT in sources
        assert AgentAttackSource.HARMBENCH in sources

    def test_priority_1(self):
        """Test getting priority 1 sources."""
        sources = get_priority_sources(1)
        assert len(sources) == 4
        assert AgentAttackSource.TOOLEMU in sources
        assert AgentAttackSource.RJUDGE in sources
        assert AgentAttackSource.MCPTOX in sources
        assert AgentAttackSource.GARAK in sources

    def test_priority_2(self):
        """Test getting priority 2 sources."""
        sources = get_priority_sources(2)
        assert len(sources) == 1
        assert AgentAttackSource.CUSTOM in sources

    def test_invalid_priority(self):
        """Test getting sources for non-existent priority."""
        sources = get_priority_sources(99)
        assert sources == []


class TestGetAllSourcesByPriority:
    """Tests for get_all_sources_by_priority function."""

    def test_returns_all_sources(self):
        """Test all sources are returned."""
        sources = get_all_sources_by_priority()
        assert len(sources) == len(AgentAttackSource)

    def test_sorted_by_priority(self):
        """Test sources are sorted by priority."""
        sources = get_all_sources_by_priority()
        priorities = [get_source_metadata(s).priority for s in sources]
        assert priorities == sorted(priorities)

    def test_priority_0_first(self):
        """Test priority 0 sources come first."""
        sources = get_all_sources_by_priority()
        first_four = sources[:4]
        for source in first_four:
            assert get_source_metadata(source).priority == 0

    def test_custom_last(self):
        """Test custom source comes last."""
        sources = get_all_sources_by_priority()
        assert sources[-1] == AgentAttackSource.CUSTOM
