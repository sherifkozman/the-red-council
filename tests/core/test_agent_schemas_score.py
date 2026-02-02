from uuid import uuid4

import pytest
from pydantic import ValidationError

from src.core.agent_schemas import (
    AgentJudgeScore,
    DivergenceEvent,
    DivergenceSeverity,
    MAX_EVIDENCE_LENGTH,
    ViolationResult,
)
from src.core.owasp_agentic import OWASPAgenticRisk
from src.core.schemas import JudgeScore


class TestViolationResult:
    def test_valid_creation(self):
        v = ViolationResult(
            detected=True,
            severity=10,
            evidence="Evidence of violation",
            recommendation="Fix it",
            owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
        )
        assert v.detected is True
        assert v.severity == 10
        assert v.evidence == "Evidence of violation"
        assert v.owasp_category == OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY

    def test_immutability(self):
        v = ViolationResult(
            detected=True,
            severity=5,
            evidence="Test",
            recommendation="Rec",
            owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
        )
        with pytest.raises(ValidationError):
            v.severity = 8  # type: ignore

    def test_constraints(self):
        # Severity out of range
        with pytest.raises(ValidationError):
            ViolationResult(
                detected=True,
                severity=11,
                evidence="Test",
                recommendation="Rec",
                owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
            )

        # Evidence too long
        with pytest.raises(ValidationError):
            ViolationResult(
                detected=True,
                severity=5,
                evidence="A" * (MAX_EVIDENCE_LENGTH + 1),
                recommendation="Rec",
                owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
            )


class TestAgentJudgeScore:
    @pytest.fixture
    def base_judge_score(self):
        return JudgeScore(
            score=8,
            leaked_secret=False,
            leaked_instructions=False,
            reasoning="Generally safe",
        )

    @pytest.fixture
    def violations(self):
        return [
            ViolationResult(
                detected=True,
                severity=8,
                evidence="Called restricted tool",
                recommendation="Restrict tool access",
                owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
            ),
            ViolationResult(
                detected=False,
                severity=1,
                evidence="No issue",
                recommendation="None",
                owasp_category=OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT,
            ),
        ]

    def test_valid_creation(self, base_judge_score, violations):
        score = AgentJudgeScore(
            base_score=base_judge_score,
            owasp_violations=violations,
            tool_abuse_score=9.5,
            tool_abuse_details="Minor warnings",
            memory_safety_score=10.0,
            memory_safety_details="No issues",
            divergence_count=0,
            overall_agent_risk=2.0,
            recommendations=["Add tool confirmation"],
        )
        assert score.base_score.score == 8
        assert len(score.owasp_violations) == 2

    def test_get_failed_categories(self, base_judge_score, violations):
        score = AgentJudgeScore(
            base_score=base_judge_score,
            owasp_violations=violations,
            tool_abuse_score=9.5,
            tool_abuse_details="Minor warnings",
            memory_safety_score=10.0,
            memory_safety_details="No issues",
            divergence_count=0,
            overall_agent_risk=2.0,
        )
        failed = score.get_failed_categories()
        assert len(failed) == 1
        assert failed[0] == OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY

    def test_to_summary_dict(self, base_judge_score, violations):
        score = AgentJudgeScore(
            base_score=base_judge_score,
            owasp_violations=violations,
            tool_abuse_score=9.5,
            tool_abuse_details="Details",
            memory_safety_score=10.0,
            memory_safety_details="Details",
            divergence_count=1,
            overall_agent_risk=2.5,
            divergence_examples=[
                DivergenceEvent(
                    session_id=uuid4(),
                    speech_intent="I will wait",
                    actual_action="executed_command",
                    severity=DivergenceSeverity.HIGH,
                    explanation="Said wait but acted",
                    confidence_score=0.9,
                )
            ],
        )
        summary = score.to_summary_dict()
        assert summary["overall_risk"] == 2.5
        assert summary["base_score"] == 8
        assert summary["violations_count"] == 1
        assert summary["divergences"] == 1
        assert summary["failed_categories"] == ["ASI01"]

    def test_max_divergence_examples(self, base_judge_score):
        # Create 6 examples
        examples = [
            DivergenceEvent(
                session_id=uuid4(),
                speech_intent=f"Intent {i}",
                actual_action="action",
                severity=DivergenceSeverity.LOW,
                explanation="expl",
                confidence_score=0.5,
            )
            for i in range(6)
        ]
        
        with pytest.raises(ValidationError):
            AgentJudgeScore(
                base_score=base_judge_score,
                owasp_violations=[],
                tool_abuse_score=10.0,
                tool_abuse_details="",
                memory_safety_score=10.0,
                memory_safety_details="",
                divergence_count=6,
                overall_agent_risk=0.0,
                divergence_examples=examples,
            )
