import pytest
import shutil
import tempfile
import logging

from src.knowledge.agent_attacks import AgentAttackKnowledgeBase
from src.knowledge.agent_seed_data import seed_agent_attacks, AGENT_ATTACK_TEMPLATES
from src.core.owasp_agentic import OWASPAgenticRisk

class TestAgentSeedData:
    
    @pytest.fixture
    def temp_db_path(self):
        """Create a temporary directory for the test database."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir)

    @pytest.fixture(autouse=True)
    def setup_env(self, monkeypatch):
        """Set RC_ENV to test for all tests in this class."""
        monkeypatch.setenv("RC_ENV", "test")

    @pytest.fixture
    def kb(self, temp_db_path):
        """Initialize KB with temp directory."""
        # Use context manager to ensure proper cleanup of executor
        with AgentAttackKnowledgeBase(persist_directory=temp_db_path) as kb:
            yield kb

    def test_seed_agent_attacks_success(self, kb):
        """Verify seeding adds templates to the KB."""
        result = seed_agent_attacks(kb)
        
        # Verify count matches defined templates
        assert result.added == len(AGENT_ATTACK_TEMPLATES)
        assert result.failed == 0
        assert result.skipped == 0
        assert result.added > 0, "Should have seeded at least one template"
        
        # Verify collection count
        assert kb.collection.count() == len(AGENT_ATTACK_TEMPLATES)
        
        # Verify specific template exists
        template_id = AGENT_ATTACK_TEMPLATES[0].id
        retrieved = kb.get_by_id(template_id)
        assert retrieved is not None
        assert retrieved.id == template_id
        assert retrieved.target_owasp == AGENT_ATTACK_TEMPLATES[0].target_owasp

    def test_seed_idempotency(self, kb):
        """Verify seeding is idempotent (skips existing)."""
        # First run
        result1 = seed_agent_attacks(kb)
        assert result1.added == len(AGENT_ATTACK_TEMPLATES)
        
        # Second run
        result2 = seed_agent_attacks(kb)
        assert result2.added == 0
        assert result2.skipped == len(AGENT_ATTACK_TEMPLATES)
        assert result2.failed == 0
        
        # Total count should remain same
        assert kb.collection.count() == len(AGENT_ATTACK_TEMPLATES)

    def test_seed_with_partial_existing(self, kb):
        """Verify seeding works when some templates already exist."""
        # Pre-insert first 2 templates
        existing_subset = AGENT_ATTACK_TEMPLATES[:2]
        for t in existing_subset:
            kb.add(t)
            
        assert kb.collection.count() == 2
        
        # Run seed
        result = seed_agent_attacks(kb)
        
        # Should add the rest
        expected_added = len(AGENT_ATTACK_TEMPLATES) - 2
        assert result.added == expected_added
        assert result.skipped == 2
        assert result.failed == 0
        
        # Total should be full
        assert kb.collection.count() == len(AGENT_ATTACK_TEMPLATES)

    def test_retrieve_seeded_by_owasp(self, kb):
        """Verify we can retrieve seeded attacks by OWASP category."""
        seed_agent_attacks(kb)
    
        # Verify ASI01
        expected_asi01 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY in t.target_owasp]
        asi01_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY, k=100)
        
        assert len(asi01_attacks) == len(expected_asi01)
        assert {a.id for a in asi01_attacks} == {t.id for t in expected_asi01}

        # Verify ASI02
        expected_asi02 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT in t.target_owasp]
        asi02_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT, k=100)
        
        assert len(asi02_attacks) == len(expected_asi02)
        assert {a.id for a in asi02_attacks} == {t.id for t in expected_asi02}

        # Verify ASI04
        expected_asi04 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION in t.target_owasp]
        asi04_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION, k=100)
        
        assert len(asi04_attacks) == len(expected_asi04)
        assert {a.id for a in asi04_attacks} == {t.id for t in expected_asi04}

        # Verify ASI05
        expected_asi05 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI05_IMPROPER_AUTHORIZATION in t.target_owasp]
        asi05_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI05_IMPROPER_AUTHORIZATION, k=100)
        
        assert len(asi05_attacks) == len(expected_asi05)
        assert {a.id for a in asi05_attacks} == {t.id for t in expected_asi05}

        # Verify ASI06
        expected_asi06 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI06_DATA_DISCLOSURE in t.target_owasp]
        asi06_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI06_DATA_DISCLOSURE, k=100)
        
        assert len(asi06_attacks) == len(expected_asi06)
        assert {a.id for a in asi06_attacks} == {t.id for t in expected_asi06}

        # Verify ASI07
        expected_asi07 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI07_INSECURE_MEMORY in t.target_owasp]
        asi07_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI07_INSECURE_MEMORY, k=100)
        
        assert len(asi07_attacks) == len(expected_asi07)
        assert {a.id for a in asi07_attacks} == {t.id for t in expected_asi07}

        # Verify ASI08
        expected_asi08 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI08_GOAL_MISALIGNMENT in t.target_owasp]
        asi08_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI08_GOAL_MISALIGNMENT, k=100)
        
        assert len(asi08_attacks) == len(expected_asi08)
        assert {a.id for a in asi08_attacks} == {t.id for t in expected_asi08}

        # Verify ASI09
        expected_asi09 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI09_WEAK_GUARDRAILS in t.target_owasp]
        asi09_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI09_WEAK_GUARDRAILS, k=100)
        
        assert len(asi09_attacks) == len(expected_asi09)
        assert {a.id for a in asi09_attacks} == {t.id for t in expected_asi09}

        # Verify ASI10
        expected_asi10 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI10_OVER_TRUST_IN_LLMS in t.target_owasp]
        asi10_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI10_OVER_TRUST_IN_LLMS, k=100)
        
        assert len(asi10_attacks) == len(expected_asi10)
        assert {a.id for a in asi10_attacks} == {t.id for t in expected_asi10}

    def test_multi_category_owasp_retrieval(self, kb):
        """Verify templates with multiple OWASP tags are retrievable by all of them."""
        seed_agent_attacks(kb)
        
        # Find a multi-tag template (ASI03-003 has ASI03 and ASI06)
        multi_tag_templates = [t for t in AGENT_ATTACK_TEMPLATES if len(t.target_owasp) > 1]
        if not multi_tag_templates:
            pytest.skip("No multi-tag templates defined yet")
            
        target = multi_tag_templates[0]
        # Ensure we test all tags
        for risk in target.target_owasp:
            retrieved = kb.get_attacks_for_owasp(risk, k=100)
            ids = {a.id for a in retrieved}
            assert target.id in ids, f"Template {target.id} not found when searching for {risk}"

    def test_retrieve_seeded_by_capability(self, kb):
        """Verify we can retrieve seeded attacks by capability."""
        seed_agent_attacks(kb)
        
        # Requires tool access
        expected_tools = {t.id for t in AGENT_ATTACK_TEMPLATES if t.requires_tool_access}
        # Pass k large enough to ensure we get all of them, or use a specific method if available
        # Current implementation supports large k
        tool_attacks = kb.get_attacks_by_capability(tools=True, k=len(AGENT_ATTACK_TEMPLATES) + 10)
        assert {a.id for a in tool_attacks} == expected_tools
            
        # Requires memory access
        expected_memory = {t.id for t in AGENT_ATTACK_TEMPLATES if t.requires_memory_access}
        memory_attacks = kb.get_attacks_by_capability(memory=True, k=len(AGENT_ATTACK_TEMPLATES) + 10)
        assert {a.id for a in memory_attacks} == expected_memory

    def test_validate_template_ids(self):
        """Ensure all template IDs in the source file are unique."""
        ids = [t.id for t in AGENT_ATTACK_TEMPLATES]
        assert len(ids) == len(set(ids)), "Duplicate template IDs detected in source data"

    def test_seed_validation_failure(self, kb, monkeypatch):
        """Verify seeding fails if a template is invalid."""
        from src.knowledge.agent_seed_data import validate_template, AgentAttackTemplate
        from src.core.schemas import AttackType, Technique
        
        invalid_template = AgentAttackTemplate(
            id="INVALID-ID", # Wrong format
            prompt_template="", # Empty
            attack_type=AttackType.DIRECT,
            technique=Technique.ROLE_PLAY,
            target_owasp=[], # Empty, might pass Pydantic but fail my check
            expected_agent_behavior="Fail",
            source="test",
            target_goal="Test Goal" # Required by Pydantic
        )
        
        with pytest.raises(ValueError, match="Invalid template ID format"):
            validate_template(invalid_template)

    def test_seed_production_block(self, kb, monkeypatch):
        """Verify seeding is blocked in production without explicit flags."""
        monkeypatch.setenv("RC_ENV", "production")
        
        # 1. Blocked by default
        with pytest.raises(RuntimeError, match="Seeding blocked in environment"):
            seed_agent_attacks(kb)
            
        # 2. Blocked if allow_production=True but no env var
        with pytest.raises(RuntimeError, match="Production seeding requires RC_ALLOW_PRODUCTION_SEEDING=1"):
            seed_agent_attacks(kb, allow_production=True)
            
        # 3. Allowed with both
        monkeypatch.setenv("RC_ALLOW_PRODUCTION_SEEDING", "1")
        result = seed_agent_attacks(kb, allow_production=True)
        assert result.added == len(AGENT_ATTACK_TEMPLATES)

    def test_seed_failure(self, kb, monkeypatch):
        """Verify seeding handles and reports failures."""
        # Mock kb.add to raise exception for one template
        original_add = kb.add
        
        def mock_add(template):
            if template.id == AGENT_ATTACK_TEMPLATES[0].id:
                raise ValueError("Simulated failure")
            original_add(template)
            
        monkeypatch.setattr(kb, "add", mock_add)
        
        # Should raise RuntimeError because of failure
        with pytest.raises(RuntimeError, match="Seeding failed for 1 templates"):
            seed_agent_attacks(kb)
        
        # Verify others were added (partial success)
        # We expect len-1 to be added
        assert kb.collection.count() == len(AGENT_ATTACK_TEMPLATES) - 1

