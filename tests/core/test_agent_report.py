import pytest
import json
from src.core.agent_report import (
    AgentSecurityReport, AgentHardeningPlan, ToolAccessControl, MemoryPolicy,
    GuardrailConfig, GuardrailAction, Recommendation, RecommendationPriority,
    ToolAnalysisSection, sanitize_markdown
)
from src.core.owasp_agentic import OWASPAgenticRisk
from src.core.agent_schemas import ViolationResult

def test_agent_security_report_serialization():
    """Test full report serialization to JSON and Markdown."""
    
    # Create sample data
    violation = ViolationResult(
        detected=True,
        severity=8,
        evidence="Agent deleted system file",
        recommendation="Restrict file access",
        owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
    )
    
    tool_analysis = ToolAnalysisSection(
        call_count=10,
        unique_tools=["file_delete", "exec"],
        suspicious_patterns=["exec without approval"],
        abuse_detected=True
    )
    
    rec = Recommendation(
        priority=RecommendationPriority.HIGH,
        category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY,
        description="Implement strict allowlist for tools"
    )
    
    hardening = AgentHardeningPlan(
        tool_controls=[
            ToolAccessControl(tool_name="file_delete", requires_approval=True)
        ],
        guardrails=[
            GuardrailConfig(
                name="no_exec",
                trigger_pattern="exec.*",
                action=GuardrailAction.BLOCK,
                message="Execution blocked"
            )
        ],
        memory_isolation=MemoryPolicy(
            allowed_keys_pattern="user_.*",
            max_value_size=1024
        )
    )
    
    report = AgentSecurityReport(
        summary="High risk agent detected.",
        owasp_coverage={r: True for r in OWASPAgenticRisk},
        vulnerability_findings=[violation],
        risk_score=8.5,
        tool_analysis=tool_analysis,
        recommendations=[rec],
        hardening_plan=hardening
    )
    
    # Test JSON
    json_str = report.to_json()
    data = json.loads(json_str)
    assert data["risk_score"] == 8.5
    assert data["vulnerability_findings"][0]["severity"] == 8
    assert data["hardening_plan"]["tool_controls"][0]["tool_name"] == "file_delete"
    
    # Test Markdown
    md = report.to_markdown()
    assert "# Agent Security Assessment Report" in md
    assert "**Overall Risk Score**: 8.5/10.0" in md
    assert "Yes" in md  # Coverage check
    assert "ASI01 - ASI01_EXCESSIVE_AGENCY" in md
    assert "Detected" in md
    assert "Tool Abuse Detected" in md
    assert "Requires Approval" in md
    assert "Memory Policy" in md

def test_minimal_report():
    """Test report with minimal fields."""
    report = AgentSecurityReport(
        summary="Safe agent.",
        owasp_coverage={OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY: True},
        risk_score=0.0
    )
    
    assert report.risk_score == 0.0
    assert report.vulnerability_findings == []
    assert report.tool_analysis is None
    
    md = report.to_markdown()
    assert "Safe agent" in md
    assert "0.0/10.0" in md
    assert "No tool analysis data available" in md

def test_hardening_plan_defaults():
    """Test hardening plan default values."""
    plan = AgentHardeningPlan()
    assert plan.tool_controls == []
    assert plan.guardrails == []
    assert plan.owasp_remediations == {}

def test_memory_policy_validation():
    """Test memory policy model and regex validation."""
    policy = MemoryPolicy(
        allowed_keys_pattern="user_.*",
        max_value_size=2048
    )
    assert policy.encryption_required is True  # Default
    assert policy.max_value_size == 2048

    # Invalid regex
    with pytest.raises(ValueError):
        MemoryPolicy(allowed_keys_pattern="[invalid")

def test_guardrail_config():
    """Test guardrail configuration."""
    config = GuardrailConfig(
        name="test_guard",
        trigger_pattern="bad_word",
        action=GuardrailAction.WARN,
        message="Don't say that"
    )
    assert config.action == GuardrailAction.WARN
    
    # Invalid regex
    with pytest.raises(ValueError):
        GuardrailConfig(
            name="test",
            trigger_pattern="[",
            action=GuardrailAction.BLOCK,
            message="msg"
        )

def test_risk_consistency_validation():
    """Test validation of risk score vs findings."""
    
    # Valid: Low risk, no findings
    report = AgentSecurityReport(
        summary="Safe",
        owasp_coverage={},
        risk_score=1.0
    )
    assert report.risk_score == 1.0
    
    # Invalid: High risk score but no findings
    with pytest.raises(ValueError, match="inconsistent with 0 detected"):
        AgentSecurityReport(
            summary="Safe",
            owasp_coverage={},
            risk_score=9.0,
            vulnerability_findings=[]
        )
        
    # Invalid: High findings but low score
    violation = ViolationResult(
        detected=True,
        severity=9,
        evidence="Bad",
        recommendation="Fix",
        owasp_category=OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
    )
    with pytest.raises(ValueError, match="too low for 1 HIGH/CRITICAL"):
        AgentSecurityReport(
            summary="Unsafe",
            owasp_coverage={},
            risk_score=2.0,
            vulnerability_findings=[violation]
        )

def test_sanitize_markdown():
    """Test markdown sanitization."""
    assert sanitize_markdown("Normal text") == "Normal text"
    assert sanitize_markdown(None) == ""
    # Check escaping of special chars
    assert sanitize_markdown("**Bold**") == "\\*\\*Bold\\*\\*"
    assert sanitize_markdown("[Link](url)") == "\\[Link\\]\\(url\\)"
    assert sanitize_markdown("<script>") == "\\<script\\>"
    
def test_sanitize_markdown_injection():
    """Test defense against markdown injection."""
    malicious = "Normal text [click](javascript:alert(1))"
    sanitized = sanitize_markdown(malicious)
    assert "\\[click\\]" in sanitized
    assert "\\(javascript:alert\\(1\\)\\)" in sanitized

def test_report_generation_error_handling():
    """Test robust error handling in to_markdown."""
    report = AgentSecurityReport(
        summary="Summary",
        owasp_coverage={},
        risk_score=5.0
    )
    
    import src.core.agent_report
    original_sanitize = src.core.agent_report.sanitize_markdown
    
    call_count = 0
    def side_effect(text):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise RuntimeError("Sanitizer boom")
        return original_sanitize(text)
        
    src.core.agent_report.sanitize_markdown = side_effect
    
    try:
        md = report.to_markdown()
        assert "# Error Generating Report" in md
        assert "Sanitizer boom" in md
    finally:
        src.core.agent_report.sanitize_markdown = original_sanitize