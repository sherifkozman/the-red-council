"""
Tests for the agent attack seeding module.

Tests cover:
- Template generation for each source
- OWASP mapping
- Seeding operations
- CLI interface
"""

import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest

from src.core.owasp_agentic import OWASPAgenticRisk
from src.knowledge.agent_attack_sources import (
    AgentAttackSource,
    AgentLayer,
    get_all_sources_by_priority,
    get_priority_sources,
    get_source_metadata,
)
from src.knowledge.seed_agents import (
    FullSeedResult,
    SeedStats,
    check_environment,
    generate_agentdojo_templates,
    generate_asb_templates,
    generate_harmbench_templates,
    generate_injecagent_templates,
    get_templates_for_source,
    map_to_owasp,
    load_templates_from_path,
    seed_all_sources,
    seed_from_source,
)


class TestAgentAttackSources:
    """Tests for AgentAttackSource enum and metadata."""

    def test_all_sources_defined(self):
        """Verify all expected sources are defined."""
        expected = [
            "agentdojo",
            "asb",
            "injecagent",
            "harmbench",
            "toolemu",
            "rjudge",
            "mcptox",
            "garak",
            "custom",
        ]
        actual = [s.value for s in AgentAttackSource]
        for src in expected:
            assert src in actual, f"Missing source: {src}"

    def test_source_metadata_complete(self):
        """Verify all sources have metadata."""
        for source in AgentAttackSource:
            metadata = get_source_metadata(source)
            assert metadata.name, f"Missing name for {source}"
            assert metadata.description, f"Missing description for {source}"
            assert metadata.priority >= 0, f"Invalid priority for {source}"

    def test_priority_sources(self):
        """Test getting sources by priority."""
        priority_0 = get_priority_sources(0)
        assert AgentAttackSource.AGENTDOJO in priority_0
        assert AgentAttackSource.ASB in priority_0
        assert AgentAttackSource.INJECAGENT in priority_0
        assert AgentAttackSource.HARMBENCH in priority_0

    def test_sources_sorted_by_priority(self):
        """Test sources are returned sorted by priority."""
        sources = get_all_sources_by_priority()
        priorities = [get_source_metadata(s).priority for s in sources]
        assert priorities == sorted(priorities), "Sources not sorted by priority"


class TestAgentLayer:
    """Tests for AgentLayer enum."""

    def test_all_layers_defined(self):
        """Verify all expected layers are defined."""
        expected = [
            "input",
            "reasoning",
            "planning",
            "tool_selection",
            "tool_execution",
            "memory",
            "output",
            "orchestration",
        ]
        actual = [layer.value for layer in AgentLayer]
        for layer in expected:
            assert layer in actual, f"Missing layer: {layer}"


class TestOWASPMapping:
    """Tests for OWASP category mapping."""

    def test_tool_injection_mapping(self):
        """Test tool injection maps to ASI04."""
        risks = map_to_owasp("tool_injection")
        assert OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION in risks

    def test_privilege_escalation_mapping(self):
        """Test privilege escalation maps to ASI01 and ASI05."""
        risks = map_to_owasp("privilege_escalation")
        assert OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY in risks
        assert OWASPAgenticRisk.ASI05_IMPROPER_AUTHORIZATION in risks

    def test_jailbreak_mapping(self):
        """Test jailbreak maps to ASI09."""
        risks = map_to_owasp("jailbreak")
        assert OWASPAgenticRisk.ASI09_WEAK_GUARDRAILS in risks

    def test_unknown_pattern_defaults(self):
        """Test unknown pattern types get default mapping."""
        risks = map_to_owasp("unknown_pattern_xyz")
        assert OWASPAgenticRisk.ASI09_WEAK_GUARDRAILS in risks


class TestTemplateGeneration:
    """Tests for template generation functions."""

    def test_agentdojo_templates_count(self):
        """Test AgentDojo generates expected number of templates."""
        templates = generate_agentdojo_templates()
        # 25 tool injection + 25 goal hijacking + 25 exfil + 25 multi-agent = 100
        assert len(templates) >= 100, f"Expected 100+ templates, got {len(templates)}"

    def test_agentdojo_templates_structure(self):
        """Test AgentDojo templates have correct structure."""
        templates = generate_agentdojo_templates()
        for t in templates[:5]:  # Check first 5
            assert t.id.startswith("ADOJO-"), f"Invalid ID prefix: {t.id}"
            assert t.source_dataset == AgentAttackSource.AGENTDOJO
            assert t.source_id is not None
            assert t.agent_layer is not None
            assert len(t.target_owasp) > 0
            assert t.prompt_template
            assert t.expected_agent_behavior

    def test_asb_templates_count(self):
        """Test ASB generates expected number of templates."""
        templates = generate_asb_templates()
        # 30 priv_esc + 30 oversight + 30 integration + 30 audit + 30 disclosure = 150
        assert len(templates) >= 150, f"Expected 150+ templates, got {len(templates)}"

    def test_asb_templates_structure(self):
        """Test ASB templates have correct structure."""
        templates = generate_asb_templates()
        for t in templates[:5]:
            assert t.id.startswith("ASB-"), f"Invalid ID prefix: {t.id}"
            assert t.source_dataset == AgentAttackSource.ASB
            assert t.real_world_tested is True

    def test_injecagent_templates_count(self):
        """Test InjecAgent generates expected number of templates."""
        templates = generate_injecagent_templates()
        # 25 search + 25 doc + 25 api + 25 memory = 100
        assert len(templates) >= 100, f"Expected 100+ templates, got {len(templates)}"

    def test_injecagent_templates_indirect(self):
        """Test InjecAgent templates are marked as indirect attacks."""
        templates = generate_injecagent_templates()
        from src.core.schemas import AttackType

        indirect_count = sum(
            1 for t in templates if t.attack_type == AttackType.INDIRECT
        )
        # At least search, doc, and API injection should be indirect
        assert indirect_count >= 75, f"Expected 75+ indirect, got {indirect_count}"

    def test_harmbench_templates_count(self):
        """Test HarmBench generates expected number of templates."""
        templates = generate_harmbench_templates()
        # 35 jailbreak + 35 safety bypass + 30 hallucination = 100
        assert len(templates) >= 100, f"Expected 100+ templates, got {len(templates)}"

    def test_harmbench_templates_structure(self):
        """Test HarmBench templates have correct structure."""
        templates = generate_harmbench_templates()
        for t in templates[:5]:
            assert t.id.startswith("HB-"), f"Invalid ID prefix: {t.id}"
            assert t.source_dataset == AgentAttackSource.HARMBENCH

    def test_total_templates_minimum(self):
        """Test total templates meet minimum requirement (450+ from Priority 0)."""
        total = (
            len(generate_agentdojo_templates())
            + len(generate_asb_templates())
            + len(generate_injecagent_templates())
            + len(generate_harmbench_templates())
        )
        # Priority 0 sources provide 450 templates
        # Combined with 30 custom templates = 480 total
        assert total >= 450, f"Expected 450+ templates, got {total}"

    def test_unique_template_ids(self):
        """Test all template IDs are unique across sources."""
        all_templates = (
            generate_agentdojo_templates()
            + generate_asb_templates()
            + generate_injecagent_templates()
            + generate_harmbench_templates()
        )
        ids = [t.id for t in all_templates]
        assert len(ids) == len(set(ids)), "Duplicate template IDs found"


class TestPathBasedSeeding:
    """Tests for path-based dataset loading."""

    def test_load_templates_from_path_jsonl(self, tmp_path):
        """Test loading templates from JSONL file."""
        path = tmp_path / "agentdojo.jsonl"
        path.write_text(
            \"\"\"\n{\"id\": \"ADOJO-TEST-1\", \"prompt\": \"Test prompt\", \"pattern_type\": \"tool_injection\", \"agent_layer\": \"tool_execution\"}\n{\"id\": \"ADOJO-TEST-2\", \"prompt\": \"Test prompt 2\", \"owasp\": [\"ASI04\"], \"requires_tool_access\": true}\n\"\"\".strip()\n        )

        templates = load_templates_from_path(AgentAttackSource.AGENTDOJO, path)
        assert len(templates) == 2
        assert templates[0].id == "ADOJO-TEST-1"
        assert templates[0].source_dataset == AgentAttackSource.AGENTDOJO

    def test_seed_from_source_with_path(self, tmp_path):
        """Test seeding from a path uses dataset records."""
        path = tmp_path / "asb.json"
        path.write_text(
            \"\"\"\n[{\n  \"id\": \"ASB-TEST-1\",\n  \"prompt\": \"ASB prompt\",\n  \"pattern_type\": \"privilege_escalation\",\n  \"agent_layer\": \"tool_execution\"\n}]\n\"\"\".strip()\n        )

        mock_kb = MagicMock()
        mock_kb.get_by_id.return_value = None

        stats = seed_from_source(mock_kb, AgentAttackSource.ASB, dry_run=True, path=str(path))
        assert stats.total == 1


class TestGetTemplatesForSource:
    """Tests for get_templates_for_source function."""

    def test_get_agentdojo(self):
        """Test getting AgentDojo templates."""
        templates = get_templates_for_source(AgentAttackSource.AGENTDOJO)
        assert len(templates) > 0
        assert all(t.source_dataset == AgentAttackSource.AGENTDOJO for t in templates)

    def test_get_asb(self):
        """Test getting ASB templates."""
        templates = get_templates_for_source(AgentAttackSource.ASB)
        assert len(templates) > 0
        assert all(t.source_dataset == AgentAttackSource.ASB for t in templates)

    def test_get_unknown_source(self):
        """Test getting templates for source without generator."""
        templates = get_templates_for_source(AgentAttackSource.TOOLEMU)
        assert templates == []

    def test_get_custom_source(self):
        """Test getting custom source returns empty (handled elsewhere)."""
        templates = get_templates_for_source(AgentAttackSource.CUSTOM)
        assert templates == []


class TestSeedStats:
    """Tests for SeedStats dataclass."""

    def test_seed_stats_defaults(self):
        """Test SeedStats has correct defaults."""
        stats = SeedStats(source=AgentAttackSource.AGENTDOJO)
        assert stats.added == 0
        assert stats.skipped == 0
        assert stats.failed == 0
        assert stats.total == 0


class TestFullSeedResult:
    """Tests for FullSeedResult dataclass."""

    def test_full_seed_result_defaults(self):
        """Test FullSeedResult has correct defaults."""
        result = FullSeedResult()
        assert result.stats_by_source == {}
        assert result.total_added == 0
        assert result.total_skipped == 0
        assert result.total_failed == 0
        assert result.total_templates == 0


class TestCheckEnvironment:
    """Tests for environment checking."""

    def test_test_environment(self):
        """Test that test environment is recognized as safe."""
        with patch.dict(os.environ, {"RC_ENV": "test"}):
            assert check_environment() is True

    def test_dev_environment(self):
        """Test that dev environment is recognized as safe."""
        with patch.dict(os.environ, {"RC_ENV": "dev"}):
            assert check_environment() is True

    def test_ci_environment(self):
        """Test that CI environment is recognized as safe."""
        with patch.dict(os.environ, {"RC_ENV": "ci"}):
            assert check_environment() is True

    def test_production_environment(self):
        """Test that production environment is not safe."""
        with patch.dict(os.environ, {"RC_ENV": "production"}):
            assert check_environment() is False

    def test_default_environment(self):
        """Test that missing RC_ENV defaults to production (not safe)."""
        env = os.environ.copy()
        env.pop("RC_ENV", None)
        with patch.dict(os.environ, env, clear=True):
            # Default is production
            assert check_environment() is False


class TestSeedFromSource:
    """Tests for seed_from_source function."""

    def test_seed_dry_run(self):
        """Test dry run doesn't add templates."""
        mock_kb = MagicMock()
        mock_kb.get_by_id.return_value = None

        stats = seed_from_source(mock_kb, AgentAttackSource.AGENTDOJO, dry_run=True)

        assert stats.added > 0
        assert stats.failed == 0
        mock_kb.add.assert_not_called()

    def test_seed_skips_existing(self):
        """Test seeding skips existing templates."""
        mock_kb = MagicMock()
        mock_kb.get_by_id.return_value = MagicMock()  # Exists

        stats = seed_from_source(mock_kb, AgentAttackSource.AGENTDOJO, dry_run=False)

        assert stats.skipped > 0
        assert stats.added == 0
        mock_kb.add.assert_not_called()

    def test_seed_handles_failure(self):
        """Test seeding handles add failures gracefully."""
        mock_kb = MagicMock()
        mock_kb.get_by_id.return_value = None
        mock_kb.add.side_effect = Exception("DB error")

        stats = seed_from_source(mock_kb, AgentAttackSource.AGENTDOJO, dry_run=False)

        assert stats.failed > 0


class TestSeedAllSources:
    """Tests for seed_all_sources function."""

    def test_seed_all_dry_run(self):
        """Test seeding all sources in dry run mode."""
        mock_kb = MagicMock()
        mock_kb.get_by_id.return_value = None

        result = seed_all_sources(mock_kb, dry_run=True)

        # Priority 0 sources provide 450 templates
        assert result.total_templates >= 450
        assert result.total_added >= 450
        assert result.total_failed == 0
        mock_kb.add.assert_not_called()

    def test_seed_priority_filter(self):
        """Test seeding with priority filter."""
        mock_kb = MagicMock()
        mock_kb.get_by_id.return_value = None

        result = seed_all_sources(mock_kb, dry_run=True, priority=0)

        # Priority 0 sources: agentdojo, asb, injecagent, harmbench
        assert len(result.stats_by_source) == 4
        for source in result.stats_by_source:
            assert get_source_metadata(source).priority == 0


class TestOWASPCoverage:
    """Tests for OWASP category coverage."""

    def test_all_owasp_categories_covered(self):
        """Test that templates cover all 10 OWASP categories."""
        all_templates = (
            generate_agentdojo_templates()
            + generate_asb_templates()
            + generate_injecagent_templates()
            + generate_harmbench_templates()
        )

        covered_categories = set()
        for template in all_templates:
            for risk in template.target_owasp:
                covered_categories.add(risk)

        expected_categories = {
            OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
            OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT,
            OWASPAgenticRisk.ASI03_VULNERABLE_INTEGRATIONS,
            OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION,
            OWASPAgenticRisk.ASI05_IMPROPER_AUTHORIZATION,
            OWASPAgenticRisk.ASI06_DATA_DISCLOSURE,
            OWASPAgenticRisk.ASI07_INSECURE_MEMORY,
            OWASPAgenticRisk.ASI08_GOAL_MISALIGNMENT,
            OWASPAgenticRisk.ASI09_WEAK_GUARDRAILS,
            OWASPAgenticRisk.ASI10_OVER_TRUST_IN_LLMS,
        }

        missing = expected_categories - covered_categories
        assert not missing, f"Missing OWASP categories: {missing}"


class TestAgentLayerCoverage:
    """Tests for agent layer coverage."""

    def test_all_layers_covered(self):
        """Test that templates cover all agent layers."""
        all_templates = (
            generate_agentdojo_templates()
            + generate_asb_templates()
            + generate_injecagent_templates()
            + generate_harmbench_templates()
        )

        covered_layers = set()
        for template in all_templates:
            if template.agent_layer:
                covered_layers.add(template.agent_layer)

        expected_layers = {
            AgentLayer.INPUT,
            AgentLayer.REASONING,
            AgentLayer.PLANNING,
            AgentLayer.TOOL_EXECUTION,
            AgentLayer.MEMORY,
            AgentLayer.OUTPUT,
            AgentLayer.ORCHESTRATION,
        }

        missing = expected_layers - covered_layers
        assert not missing, f"Missing agent layers: {missing}"


class TestTemplateValidation:
    """Tests for template content validation."""

    def test_templates_have_descriptions(self):
        """Test all templates have descriptions."""
        all_templates = (
            generate_agentdojo_templates()
            + generate_asb_templates()
            + generate_injecagent_templates()
            + generate_harmbench_templates()
        )

        for template in all_templates:
            assert template.description, f"Missing description for {template.id}"

    def test_templates_have_goals(self):
        """Test all templates have target goals."""
        all_templates = (
            generate_agentdojo_templates()
            + generate_asb_templates()
            + generate_injecagent_templates()
            + generate_harmbench_templates()
        )

        for template in all_templates:
            assert template.target_goal, f"Missing target_goal for {template.id}"

    def test_templates_have_source_ids(self):
        """Test all templates have source IDs."""
        all_templates = (
            generate_agentdojo_templates()
            + generate_asb_templates()
            + generate_injecagent_templates()
            + generate_harmbench_templates()
        )

        for template in all_templates:
            assert template.source_id, f"Missing source_id for {template.id}"
