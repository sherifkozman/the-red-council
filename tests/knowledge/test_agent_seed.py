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

    @pytest.fixture
    def kb(self, temp_db_path):
        """Initialize KB with temp directory."""
        # Use context manager to ensure proper cleanup of executor
        with AgentAttackKnowledgeBase(persist_directory=temp_db_path) as kb:
            yield kb

    def test_seed_agent_attacks_success(self, kb):
        """Verify seeding adds templates to the KB."""
        count = seed_agent_attacks(kb)
        
        # Verify count matches defined templates
        assert count == len(AGENT_ATTACK_TEMPLATES)
        assert count > 0, "Should have seeded at least one template"
        
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
        count1 = seed_agent_attacks(kb)
        assert count1 == len(AGENT_ATTACK_TEMPLATES)
        
        # Second run
        count2 = seed_agent_attacks(kb)
        assert count2 == 0  # Should add 0 new
        
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
        count = seed_agent_attacks(kb)
        
        # Should add the rest
        expected_added = len(AGENT_ATTACK_TEMPLATES) - 2
        assert count == expected_added
        
        # Total should be full
        assert kb.collection.count() == len(AGENT_ATTACK_TEMPLATES)

    def test_retrieve_seeded_by_owasp(self, kb):
        """Verify we can retrieve seeded attacks by OWASP category."""
        seed_agent_attacks(kb)
        
        # Verify ASI01
        expected_asi01 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY in t.target_owasp]
        asi01_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY)
        
        assert len(asi01_attacks) == len(expected_asi01)
        assert {a.id for a in asi01_attacks} == {t.id for t in expected_asi01}

        # Verify ASI02
        expected_asi02 = [t for t in AGENT_ATTACK_TEMPLATES 
                          if OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT in t.target_owasp]
        asi02_attacks = kb.get_attacks_for_owasp(OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT)
        
        assert len(asi02_attacks) == len(expected_asi02)
        assert {a.id for a in asi02_attacks} == {t.id for t in expected_asi02}

    def test_multi_category_owasp_retrieval(self, kb):
        """Verify templates with multiple OWASP tags are retrievable by all of them."""
        seed_agent_attacks(kb)
        
        # Find a multi-tag template (ASI03-003 has ASI03 and ASI06)
        multi_tag_templates = [t for t in AGENT_ATTACK_TEMPLATES if len(t.target_owasp) > 1]
        if not multi_tag_templates:
            pytest.skip("No multi-tag templates defined yet")
            
        target = multi_tag_templates[0]
        for risk in target.target_owasp:
            retrieved = kb.get_attacks_for_owasp(risk)
            ids = {a.id for a in retrieved}
            assert target.id in ids, f"Template {target.id} not found when searching for {risk}"

    def test_retrieve_seeded_by_capability(self, kb):
        """Verify we can retrieve seeded attacks by capability."""
        seed_agent_attacks(kb)
        
        # Requires tool access
        expected_tools = {t.id for t in AGENT_ATTACK_TEMPLATES if t.requires_tool_access}
        # Pass k to ensure we get all of them (default is 5)
        tool_attacks = kb.get_attacks_by_capability(tools=True, k=100)
        assert {a.id for a in tool_attacks} == expected_tools
            
        # Requires memory access
        expected_memory = {t.id for t in AGENT_ATTACK_TEMPLATES if t.requires_memory_access}
        memory_attacks = kb.get_attacks_by_capability(memory=True, k=100)
        assert {a.id for a in memory_attacks} == expected_memory

    def test_validate_template_ids(self):
        """Ensure all template IDs in the source file are unique."""
        ids = [t.id for t in AGENT_ATTACK_TEMPLATES]
        assert len(ids) == len(set(ids)), "Duplicate template IDs detected in source data"