import pytest
from uuid import uuid4
from datetime import datetime, timezone
from src.core.agent_schemas import (
    AgentJudgeScore,
    ToolCallEvent,
    MemoryAccessEvent,
    DivergenceEvent,
    ViolationResult,
    OWASPAgenticRisk,
    DivergenceSeverity,
)
from src.core.schemas import JudgeScore
from src.reports.agent_report_generator import AgentReportGenerator
from src.core.agent_report import AgentSecurityReport

def utc_now():
    return datetime.now(timezone.utc)

@pytest.fixture
def mock_score():
    return AgentJudgeScore(
        base_score=JudgeScore(score=8, leaked_secret=False, leaked_instructions=False, reasoning="Good"),
        owasp_violations=(
            ViolationResult(
                detected=True,
                severity=8,
                evidence="Tool abuse detected",
                recommendation="Fix it",
                owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
            ),
             ViolationResult(
                detected=False,
                severity=1,
                evidence="No issue",
                recommendation="Keep it up",
                owasp_category=OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT
            ),
        ),
        tool_abuse_score=6.0,
        tool_abuse_details="Excessive calls",
        memory_safety_score=9.0,
        memory_safety_details="Safe",
        divergence_count=1,
        divergence_examples=(
            DivergenceEvent(
                session_id=uuid4(),
                speech_intent="I will wait",
                actual_action="file_delete",
                severity=DivergenceSeverity.HIGH,
                explanation="Said wait but deleted file",
                confidence_score=0.9
            ),
        ),
        overall_agent_risk=5.5,
        recommendations=("[ASI01_EXCESSIVE_AGENCY] Implement rate limits",)
    )

@pytest.fixture
def mock_events():
    session_id = uuid4()
    return [
        ToolCallEvent(session_id=session_id, tool_name="ls", arguments={}, duration_ms=10, success=True),
        ToolCallEvent(session_id=session_id, tool_name="rm", arguments={"path": "/"}, duration_ms=10, success=False, exception_type="PermissionError"),
        MemoryAccessEvent(session_id=session_id, operation="read", key="secret_key", sensitive_detected=True),
        DivergenceEvent(
            session_id=session_id,
            speech_intent="I will wait",
            actual_action="file_delete",
            severity=DivergenceSeverity.HIGH,
            explanation="Said wait but deleted file",
            confidence_score=0.9
        )
    ]

def test_generate_report_structure(mock_score, mock_events):
    """Test that generate() creates a valid AgentSecurityReport."""
    generator = AgentReportGenerator()
    report = generator.generate(mock_score, mock_events)
    
    assert isinstance(report, AgentSecurityReport)
    assert report.risk_score == 5.5
    assert len(report.vulnerability_findings) == 2
    
    # Check analysis sections
    assert report.tool_analysis is not None
    assert report.tool_analysis.call_count == 2
    assert "ls" in report.tool_analysis.unique_tools
    assert report.tool_analysis.abuse_detected is True # score < 7.0
    
    assert report.memory_analysis is not None
    assert report.memory_analysis.access_count == 1
    assert "secret_key" in report.memory_analysis.sensitive_keys_accessed
    
    assert report.divergence_analysis is not None
    assert report.divergence_analysis.divergence_count == 1
    assert report.divergence_analysis.severity_distribution["HIGH"] == 1

    # Check generated text
    assert "Overall Risk Score of 5.5" in report.summary
    assert "MEDIUM" in report.summary

def test_generate_heatmap_data(mock_score):
    """Test heatmap data generation."""
    generator = AgentReportGenerator()
    data = generator.generate_heatmap_data(mock_score)
    
    # Keys are enum values (e.g., "ASI01"), not names
    assert "ASI01" in data
    assert data["ASI01"]["status"] == "DETECTED"
    assert data["ASI01"]["severity"] == 8
    
    assert "ASI02" in data
    assert data["ASI02"]["status"] == "SAFE"
    assert data["ASI02"]["severity"] == 0

def test_render_report(mock_score, mock_events):
    """Test Markdown rendering using Jinja2."""
    generator = AgentReportGenerator()
    report = generator.generate(mock_score, mock_events)
    md = generator.render(report)
    
    assert "# Agent Security Assessment Report" in md
    assert "Overall Risk Score**: 5.5" in md
    # Match format: Code - Name
    assert "| ASI01 - ASI01_EXCESSIVE_AGENCY | Yes | Detected |" in md
    assert "Tool abuse detected" in md # Evidence
    assert "Total Divergences**: 1" in md
    
    # Check remediation logic
    assert "Implement strict rate limiting" in md # Remdiation for ASI01

def test_generate_empty_events(mock_score):
    """Test generation with no events."""
    generator = AgentReportGenerator()
    report = generator.generate(mock_score, [])
    
    assert report.tool_analysis.call_count == 0
    assert report.memory_analysis.access_count == 0
    # Divergence comes from score, so it should still be present if score has it
    assert report.divergence_analysis.divergence_count == 1

def test_custom_template_dir(tmp_path):
    """Test loading template from custom directory."""
    template_file = tmp_path / "report.md.j2"
    template_file.write_text("Custom Report: {{ risk_score }}")
    
    generator = AgentReportGenerator(template_dir=str(tmp_path))
    
    # Create dummy report manually to skip generate() logic for this test
    # (Or just use generate, it doesn't use template)
    mock_events = []
    mock_score = AgentJudgeScore(
        base_score=JudgeScore(score=10, leaked_secret=False, leaked_instructions=False, reasoning="Good"),
        owasp_violations=(),
        tool_abuse_score=10,
        tool_abuse_details="",
        memory_safety_score=10,
        memory_safety_details="",
        divergence_count=0,
        overall_agent_risk=0,
        recommendations=()
    )
    report = generator.generate(mock_score, mock_events)
    
    rendered = generator.render(report)
    assert rendered == "Custom Report: 0.0"

def test_summary_critical_risk():
    """Test summary generation for high risk."""
    score = AgentJudgeScore(
        base_score=JudgeScore(score=0, leaked_secret=False, leaked_instructions=False, reasoning="Bad"),
        owasp_violations=(),
        tool_abuse_score=0,
        tool_abuse_details="",
        memory_safety_score=0,
        memory_safety_details="",
        divergence_count=0,
        overall_agent_risk=9.5,
        recommendations=()
    )
    generator = AgentReportGenerator()
    summary = generator.generate_summary(score)
    assert "CRITICAL" in summary
    assert "9.5" in summary

def test_summary_low_risk():
    """Test summary generation for low risk."""
    score = AgentJudgeScore(
        base_score=JudgeScore(score=10, leaked_secret=False, leaked_instructions=False, reasoning="Good"),
        owasp_violations=(),
        tool_abuse_score=10,
        tool_abuse_details="",
        memory_safety_score=10,
        memory_safety_details="",
        divergence_count=0,
        overall_agent_risk=1.5,
        recommendations=()
    )
    generator = AgentReportGenerator()
    summary = generator.generate_summary(score)
    assert "LOW" in summary
    assert "1.5" in summary
