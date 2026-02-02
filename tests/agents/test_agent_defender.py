# tests/agents/test_agent_defender.py
"""
Tests for AgentDefender - agent-specific hardening recommendations.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from src.agents.agent_defender import (
    AgentDefender,
    AgentDefenderConfig,
    DANGEROUS_TOOL_KEYWORDS,
    DEFAULT_TOOL_RATE_LIMIT,
    HIGH_RISK_TOOL_RATE_LIMIT,
    OWASP_REMEDIATIONS,
)
from src.core.agent_report import (
    AgentHardeningPlan,
    GuardrailAction,
)
from src.core.agent_schemas import (
    AgentJudgeScore,
    DivergenceEvent,
    DivergenceSeverity,
    ViolationResult,
)
from src.core.owasp_agentic import OWASPAgenticRisk
from src.core.schemas import JudgeScore


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_gemini_client():
    """Create a mock GeminiClient."""
    client = MagicMock()
    client.generate_structured_evaluation = AsyncMock()
    return client


@pytest.fixture
def base_judge_score():
    """Create a base JudgeScore for testing."""
    return JudgeScore(
        score=5,
        leaked_secret=False,
        leaked_instructions=False,
        reasoning="Test reasoning",
    )


@pytest.fixture
def session_id():
    """Create a session ID for testing."""
    return uuid4()


@pytest.fixture
def safe_agent_score(base_judge_score):
    """Create an AgentJudgeScore with no violations."""
    return AgentJudgeScore(
        base_score=base_judge_score,
        owasp_violations=tuple(),
        tool_abuse_score=9.0,
        tool_abuse_details="No tool abuse detected",
        memory_safety_score=9.0,
        memory_safety_details="No memory issues detected",
        divergence_count=0,
        divergence_examples=tuple(),
        overall_agent_risk=1.0,
        recommendations=tuple(),
    )


@pytest.fixture
def risky_agent_score(base_judge_score, session_id):
    """Create an AgentJudgeScore with multiple violations."""
    violations = (
        ViolationResult(
            detected=True,
            severity=8,
            evidence="Tool 'delete_file' called 50 times in 1 minute",
            recommendation="Implement rate limiting",
            owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
        ),
        ViolationResult(
            detected=True,
            severity=7,
            evidence="Dangerous operation without confirmation",
            recommendation="Add human approval",
            owasp_category=OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT,
        ),
        ViolationResult(
            detected=True,
            severity=9,
            evidence="Prompt injection detected in tool output",
            recommendation="Sanitize inputs",
            owasp_category=OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION,
        ),
        ViolationResult(
            detected=True,
            severity=8,
            evidence="API key exposed in response",
            recommendation="Filter output",
            owasp_category=OWASPAgenticRisk.ASI06_DATA_DISCLOSURE,
        ),
        ViolationResult(
            detected=True,
            severity=7,
            evidence="System keys modified",
            recommendation="Validate memory keys",
            owasp_category=OWASPAgenticRisk.ASI07_INSECURE_MEMORY,
        ),
        ViolationResult(
            detected=True,
            severity=6,
            evidence="Guardrail bypassed",
            recommendation="Strengthen guardrails",
            owasp_category=OWASPAgenticRisk.ASI09_WEAK_GUARDRAILS,
        ),
    )

    divergence = DivergenceEvent(
        session_id=session_id,
        speech_intent="I will only read the file",
        actual_action="Deleted the file",
        severity=DivergenceSeverity.HIGH,
        explanation="Speech and action don't match",
        confidence_score=0.9,
    )

    return AgentJudgeScore(
        base_score=base_judge_score,
        owasp_violations=violations,
        tool_abuse_score=2.0,
        tool_abuse_details="Tool 'delete_file' called excessively",
        memory_safety_score=3.0,
        memory_safety_details="System key '__config' was modified",
        divergence_count=1,
        divergence_examples=(divergence,),
        overall_agent_risk=8.5,
        recommendations=(
            "Implement rate limiting",
            "Add human confirmation",
        ),
    )


@pytest.fixture
def defender_no_llm():
    """Create an AgentDefender without LLM client."""
    return AgentDefender(llm_client=None)


@pytest.fixture
def defender_with_llm(mock_gemini_client):
    """Create an AgentDefender with LLM client."""
    return AgentDefender(llm_client=mock_gemini_client)


# ============================================================================
# Configuration Tests
# ============================================================================


class TestAgentDefenderConfig:
    """Tests for AgentDefenderConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = AgentDefenderConfig()
        assert config.use_llm_recommendations is True
        assert config.default_tool_rate_limit == DEFAULT_TOOL_RATE_LIMIT
        assert config.dangerous_tool_rate_limit == HIGH_RISK_TOOL_RATE_LIMIT
        assert config.max_value_size == 1024

    def test_custom_config(self):
        """Test custom configuration values."""
        config = AgentDefenderConfig(
            use_llm_recommendations=False,
            default_tool_rate_limit=20,
            dangerous_tool_rate_limit=5,
            max_value_size=2048,
        )
        assert config.use_llm_recommendations is False
        assert config.default_tool_rate_limit == 20
        assert config.dangerous_tool_rate_limit == 5
        assert config.max_value_size == 2048

    def test_config_validation_rate_limit_bounds(self):
        """Test rate limit validation."""
        with pytest.raises(ValueError):
            AgentDefenderConfig(default_tool_rate_limit=0)

        with pytest.raises(ValueError):
            AgentDefenderConfig(default_tool_rate_limit=1001)

        with pytest.raises(ValueError):
            AgentDefenderConfig(dangerous_tool_rate_limit=101)

    def test_config_validation_max_value_size(self):
        """Test max value size validation."""
        with pytest.raises(ValueError):
            AgentDefenderConfig(max_value_size=63)  # Below minimum

        with pytest.raises(ValueError):
            AgentDefenderConfig(max_value_size=1048577)  # Above 1MB


# ============================================================================
# AgentDefender Basic Tests
# ============================================================================


class TestAgentDefenderBasic:
    """Basic tests for AgentDefender."""

    def test_init_without_client(self):
        """Test initialization without LLM client."""
        defender = AgentDefender()
        assert defender.client is None
        assert defender.config is not None

    def test_init_with_client(self, mock_gemini_client):
        """Test initialization with LLM client."""
        defender = AgentDefender(llm_client=mock_gemini_client)
        assert defender.client is mock_gemini_client

    def test_init_with_custom_config(self):
        """Test initialization with custom config."""
        config = AgentDefenderConfig(use_llm_recommendations=False)
        defender = AgentDefender(config=config)
        assert defender.config.use_llm_recommendations is False


# ============================================================================
# Hardening Generation Tests (Rule-based)
# ============================================================================


class TestRuleBasedHardening:
    """Tests for rule-based hardening generation."""

    @pytest.mark.asyncio
    async def test_generate_hardening_safe_agent(
        self, defender_no_llm, safe_agent_score
    ):
        """Test hardening generation for safe agent."""
        plan = await defender_no_llm.generate_hardening_async(safe_agent_score)

        assert isinstance(plan, AgentHardeningPlan)
        assert plan.memory_isolation is not None
        # Safe agent should have lenient memory policy
        assert plan.memory_isolation.encryption_required is False

    @pytest.mark.asyncio
    async def test_generate_hardening_risky_agent(
        self, defender_no_llm, risky_agent_score
    ):
        """Test hardening generation for risky agent."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        assert isinstance(plan, AgentHardeningPlan)
        assert len(plan.tool_controls) > 0
        assert len(plan.guardrails) > 0
        assert len(plan.owasp_remediations) > 0

        # Risky agent should have strict memory policy
        assert plan.memory_isolation is not None
        assert plan.memory_isolation.encryption_required is True

    @pytest.mark.asyncio
    async def test_tool_controls_for_excessive_agency(
        self, defender_no_llm, risky_agent_score
    ):
        """Test tool controls generated for ASI01 violation."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        # Should have rate limiting for tools
        assert len(plan.tool_controls) > 0
        for control in plan.tool_controls:
            assert control.rate_limit is not None
            assert control.rate_limit <= DEFAULT_TOOL_RATE_LIMIT

    @pytest.mark.asyncio
    async def test_tool_controls_require_approval_for_oversight(
        self, defender_no_llm, risky_agent_score
    ):
        """Test tool controls require approval for ASI02 violation."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        # At least one tool should require approval
        approvals_required = [tc for tc in plan.tool_controls if tc.requires_approval]
        assert len(approvals_required) > 0

    @pytest.mark.asyncio
    async def test_guardrails_for_prompt_injection(
        self, defender_no_llm, risky_agent_score
    ):
        """Test guardrails generated for ASI04 violation."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        # Should have prompt injection guardrail
        injection_guardrails = [
            g for g in plan.guardrails if "injection" in g.name.lower()
        ]
        assert len(injection_guardrails) > 0
        assert injection_guardrails[0].action == GuardrailAction.BLOCK

    @pytest.mark.asyncio
    async def test_guardrails_for_data_disclosure(
        self, defender_no_llm, risky_agent_score
    ):
        """Test guardrails generated for ASI06 violation."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        # Should have data filter guardrail
        data_guardrails = [g for g in plan.guardrails if "sensitive" in g.name.lower()]
        assert len(data_guardrails) > 0
        assert data_guardrails[0].action == GuardrailAction.WARN

    @pytest.mark.asyncio
    async def test_guardrails_for_weak_guardrails(
        self, defender_no_llm, risky_agent_score
    ):
        """Test guardrails generated for ASI09 violation."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        # Should have content safety guardrail
        safety_guardrails = [g for g in plan.guardrails if "safety" in g.name.lower()]
        assert len(safety_guardrails) > 0

    @pytest.mark.asyncio
    async def test_high_risk_logging_guardrail(
        self, defender_no_llm, risky_agent_score
    ):
        """Test that high risk agents get a logging guardrail."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        # High risk (8.5) should have catch-all log guardrail
        log_guardrails = [g for g in plan.guardrails if g.action == GuardrailAction.LOG]
        assert len(log_guardrails) > 0

    @pytest.mark.asyncio
    async def test_owasp_remediations_generated(
        self, defender_no_llm, risky_agent_score
    ):
        """Test OWASP-specific remediations are generated."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        # Should have remediations for detected violations
        assert OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY in plan.owasp_remediations
        assert (
            OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION in plan.owasp_remediations
        )
        assert OWASPAgenticRisk.ASI07_INSECURE_MEMORY in plan.owasp_remediations

        # Check remediation content
        asi01_remediation = plan.owasp_remediations[
            OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
        ]
        assert "rate limit" in asi01_remediation.description.lower()
        assert asi01_remediation.code_example is not None
        assert asi01_remediation.effort_estimate in ("Low", "Medium", "High")

    @pytest.mark.asyncio
    async def test_memory_policy_strict_for_unsafe(
        self, defender_no_llm, risky_agent_score
    ):
        """Test strict memory policy for unsafe agent."""
        plan = await defender_no_llm.generate_hardening_async(risky_agent_score)

        assert plan.memory_isolation is not None
        assert plan.memory_isolation.encryption_required is True
        assert plan.memory_isolation.denied_keys_pattern is not None
        assert "system_" in plan.memory_isolation.denied_keys_pattern


# ============================================================================
# Hardening Generation Tests (LLM-enhanced)
# ============================================================================


class TestLLMEnhancedHardening:
    """Tests for LLM-enhanced hardening generation."""

    @pytest.mark.asyncio
    async def test_llm_recommendations_merged(
        self, defender_with_llm, risky_agent_score, mock_gemini_client
    ):
        """Test that LLM recommendations are merged with rule-based."""
        mock_gemini_client.generate_structured_evaluation.return_value = {
            "tool_controls": [
                {"tool_name": "new_tool", "rate_limit": 5, "requires_approval": True}
            ],
            "guardrail_suggestions": [
                {
                    "name": "LLM Guardrail",
                    "pattern": r"test.*pattern",
                    "message": "LLM suggested",
                }
            ],
            "additional_steps": ["Step 1", "Step 2"],
        }

        plan = await defender_with_llm.generate_hardening_async(risky_agent_score)

        # Should include both rule-based and LLM tools
        tool_names = [tc.tool_name for tc in plan.tool_controls]
        assert "new_tool" in tool_names

        # Should include LLM guardrail
        guardrail_names = [g.name for g in plan.guardrails]
        assert "LLM Guardrail" in guardrail_names

    @pytest.mark.asyncio
    async def test_llm_failure_fallback(
        self, defender_with_llm, risky_agent_score, mock_gemini_client
    ):
        """Test fallback to rule-based when LLM fails."""
        mock_gemini_client.generate_structured_evaluation.side_effect = Exception(
            "LLM Error"
        )

        # Should not raise, should fall back to rule-based
        plan = await defender_with_llm.generate_hardening_async(risky_agent_score)

        assert isinstance(plan, AgentHardeningPlan)
        assert len(plan.tool_controls) > 0
        assert len(plan.guardrails) > 0

    @pytest.mark.asyncio
    async def test_llm_disabled_by_config(self, mock_gemini_client, risky_agent_score):
        """Test LLM is not called when disabled in config."""
        config = AgentDefenderConfig(use_llm_recommendations=False)
        defender = AgentDefender(llm_client=mock_gemini_client, config=config)

        await defender.generate_hardening_async(risky_agent_score)

        # LLM should not be called
        mock_gemini_client.generate_structured_evaluation.assert_not_called()


# ============================================================================
# Prompt Generation Tests
# ============================================================================


class TestPromptGeneration:
    """Tests for hardening prompt generation."""

    def test_generate_hardening_prompt_with_violations(
        self, defender_no_llm, risky_agent_score
    ):
        """Test prompt generation includes violations."""
        prompt = defender_no_llm.generate_hardening_prompt(risky_agent_score)

        assert "Overall Risk Score: 8.5" in prompt
        assert "Tool Abuse Score: 2.0" in prompt
        assert "Memory Safety Score: 3.0" in prompt
        assert "DETECTED VIOLATIONS" in prompt
        assert "ASI01" in prompt

    def test_generate_hardening_prompt_no_violations(
        self, defender_no_llm, safe_agent_score
    ):
        """Test prompt generation when no violations."""
        prompt = defender_no_llm.generate_hardening_prompt(safe_agent_score)

        assert "Overall Risk Score: 1.0" in prompt
        assert "No specific violations detected" in prompt


# ============================================================================
# Tool Name Extraction Tests
# ============================================================================


class TestToolNameExtraction:
    """Tests for tool name extraction from details."""

    def test_extract_tool_names_quoted(self, defender_no_llm):
        """Test extraction of quoted tool names."""
        details = "Tool 'delete_file' called 50 times"
        tools = defender_no_llm._extract_tool_names(details)
        assert "delete_file" in tools

    def test_extract_tool_names_double_quoted(self, defender_no_llm):
        """Test extraction of double-quoted tool names."""
        details = 'Tool "send_email" was abused'
        tools = defender_no_llm._extract_tool_names(details)
        assert "send_email" in tools

    def test_extract_tool_names_called_pattern(self, defender_no_llm):
        """Test extraction with 'called:' pattern."""
        details = "Functions called: execute_command"
        tools = defender_no_llm._extract_tool_names(details)
        assert "execute_command" in tools

    def test_extract_tool_names_function_pattern(self, defender_no_llm):
        """Test extraction with 'function' pattern."""
        details = "Function 'transfer_funds' executed"
        tools = defender_no_llm._extract_tool_names(details)
        assert "transfer_funds" in tools

    def test_extract_tool_names_empty(self, defender_no_llm):
        """Test extraction with no tool names."""
        details = "No tools found"
        tools = defender_no_llm._extract_tool_names(details)
        assert len(tools) == 0

    def test_extract_tool_names_limit(self, defender_no_llm):
        """Test that extraction is limited to 10 tools."""
        details = " ".join([f"tool 'tool_{i}'" for i in range(20)])
        tools = defender_no_llm._extract_tool_names(details)
        assert len(tools) <= 10


# ============================================================================
# Dangerous Tool Detection Tests
# ============================================================================


class TestDangerousToolDetection:
    """Tests for dangerous tool keyword detection."""

    def test_dangerous_keywords_exist(self):
        """Test that dangerous keywords are defined."""
        assert len(DANGEROUS_TOOL_KEYWORDS) > 0
        assert "delete" in DANGEROUS_TOOL_KEYWORDS
        assert "execute" in DANGEROUS_TOOL_KEYWORDS
        assert "transfer" in DANGEROUS_TOOL_KEYWORDS

    @pytest.mark.asyncio
    async def test_dangerous_tool_lower_rate_limit(
        self, defender_no_llm, base_judge_score
    ):
        """Test dangerous tools get lower rate limits."""
        score = AgentJudgeScore(
            base_score=base_judge_score,
            owasp_violations=tuple(),
            tool_abuse_score=5.0,
            tool_abuse_details="Tool 'delete_user' called",
            memory_safety_score=8.0,
            memory_safety_details="OK",
            divergence_count=0,
            divergence_examples=tuple(),
            overall_agent_risk=3.0,
            recommendations=tuple(),
        )

        plan = await defender_no_llm.generate_hardening_async(score)

        delete_controls = [
            tc for tc in plan.tool_controls if "delete" in tc.tool_name.lower()
        ]
        if delete_controls:
            assert delete_controls[0].rate_limit == HIGH_RISK_TOOL_RATE_LIMIT


# ============================================================================
# OWASP Remediations Completeness Tests
# ============================================================================


class TestOWASPRemediations:
    """Tests for OWASP remediation coverage."""

    def test_all_owasp_categories_have_remediations(self):
        """Test that all OWASP categories have remediation templates."""
        for risk in OWASPAgenticRisk:
            assert risk in OWASP_REMEDIATIONS, f"Missing remediation for {risk}"
            desc, code, effort = OWASP_REMEDIATIONS[risk]
            assert len(desc) > 0
            assert len(code) > 0
            assert effort in ("Low", "Medium", "High")

    @pytest.mark.asyncio
    async def test_remediation_for_each_violation(
        self, defender_no_llm, base_judge_score
    ):
        """Test remediation generated for each violation type."""
        for risk in OWASPAgenticRisk:
            violation = ViolationResult(
                detected=True,
                severity=7,
                evidence="Test evidence",
                recommendation="Test recommendation",
                owasp_category=risk,
            )

            score = AgentJudgeScore(
                base_score=base_judge_score,
                owasp_violations=(violation,),
                tool_abuse_score=5.0,
                tool_abuse_details="Test",
                memory_safety_score=5.0,
                memory_safety_details="Test",
                divergence_count=0,
                divergence_examples=tuple(),
                overall_agent_risk=5.0,
                recommendations=tuple(),
            )

            plan = await defender_no_llm.generate_hardening_async(score)
            assert risk in plan.owasp_remediations


# ============================================================================
# Sync Wrapper Tests
# ============================================================================


class TestSyncWrapper:
    """Tests for sync wrapper behavior."""

    def test_sync_generate_hardening(self, defender_no_llm, safe_agent_score):
        """Test sync wrapper works outside event loop."""
        plan = defender_no_llm.generate_hardening(safe_agent_score)
        assert isinstance(plan, AgentHardeningPlan)

    @pytest.mark.asyncio
    async def test_sync_wrapper_raises_in_event_loop(
        self, defender_no_llm, safe_agent_score
    ):
        """Test sync wrapper raises when called in event loop."""
        with pytest.raises(RuntimeError, match="running event loop"):
            defender_no_llm.generate_hardening(safe_agent_score)


# ============================================================================
# Edge Cases and Error Handling
# ============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_empty_violations(self, defender_no_llm, safe_agent_score):
        """Test handling of empty violations list."""
        plan = await defender_no_llm.generate_hardening_async(safe_agent_score)
        assert isinstance(plan, AgentHardeningPlan)
        # Should still have basic controls
        assert plan.memory_isolation is not None

    @pytest.mark.asyncio
    async def test_undetected_violations_ignored(
        self, defender_no_llm, base_judge_score
    ):
        """Test that undetected violations don't generate remediations."""
        violation = ViolationResult(
            detected=False,
            severity=1,
            evidence="Not detected",
            recommendation="N/A",
            owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
        )

        score = AgentJudgeScore(
            base_score=base_judge_score,
            owasp_violations=(violation,),
            tool_abuse_score=9.0,
            tool_abuse_details="OK",
            memory_safety_score=9.0,
            memory_safety_details="OK",
            divergence_count=0,
            divergence_examples=tuple(),
            overall_agent_risk=1.0,
            recommendations=tuple(),
        )

        plan = await defender_no_llm.generate_hardening_async(score)

        # Should not have remediation for undetected violation
        assert OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY not in plan.owasp_remediations

    @pytest.mark.asyncio
    async def test_wildcard_tool_when_no_names(self, defender_no_llm, base_judge_score):
        """Test wildcard tool control when no tool names extracted."""
        violation = ViolationResult(
            detected=True,
            severity=7,
            evidence="General tool abuse",
            recommendation="Limit tools",
            owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
        )

        score = AgentJudgeScore(
            base_score=base_judge_score,
            owasp_violations=(violation,),
            tool_abuse_score=3.0,
            tool_abuse_details="General abuse detected",  # No specific tool
            memory_safety_score=8.0,
            memory_safety_details="OK",
            divergence_count=0,
            divergence_examples=tuple(),
            overall_agent_risk=5.0,
            recommendations=tuple(),
        )

        plan = await defender_no_llm.generate_hardening_async(score)

        # Should have wildcard tool control
        tool_names = [tc.tool_name for tc in plan.tool_controls]
        assert "*" in tool_names

    @pytest.mark.asyncio
    async def test_memory_policy_lenient_for_high_score(
        self, defender_no_llm, base_judge_score
    ):
        """Test lenient memory policy when score is high."""
        score = AgentJudgeScore(
            base_score=base_judge_score,
            owasp_violations=tuple(),
            tool_abuse_score=9.0,
            tool_abuse_details="OK",
            memory_safety_score=9.0,  # High score
            memory_safety_details="OK",
            divergence_count=0,
            divergence_examples=tuple(),
            overall_agent_risk=1.0,
            recommendations=tuple(),
        )

        plan = await defender_no_llm.generate_hardening_async(score)

        # Lenient policy
        assert plan.memory_isolation.encryption_required is False
        assert plan.memory_isolation.max_value_size > 1024
