import json
import enum
import re
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Set
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict

from src.core.owasp_agentic import OWASPAgenticRisk
from src.core.agent_schemas import ViolationResult

logger = logging.getLogger(__name__)

# Constants
MAX_SUMMARY_LENGTH = 5000
MAX_DESCRIPTION_LENGTH = 2000
MAX_CODE_EXAMPLE_LENGTH = 5000
MAX_PATTERN_LENGTH = 500

# Priority mapping for sorting
PRIORITY_ORDER = {
    "HIGH": 0,
    "MEDIUM": 1,
    "LOW": 2
}

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

def sanitize_markdown(text: Optional[str]) -> str:
    """
    Sanitize text to prevent Markdown injection.
    Escapes characters that could be interpreted as Markdown formatting.
    """
    if text is None:
        return ""
    
    try:
        text_str = str(text)
        # Escape characters that have special meaning in Markdown
        # Includes: \ ` * _ { } [ ] ( ) # + - . ! | < >
        reserved = r"([\\`*_{{}}\[\]()#+\-.!|<>])"
        # Use a lambda that returns backslash + group(1)
        # We use a simple function to avoid lambda syntax errors in some environments
        def escape_match(m):
            return chr(92) + m.group(1)
            
        return re.sub(reserved, escape_match, text_str)
    except Exception:
        # Fail safe: return a simple "SANITIZATION_FAILED" or extremely stripped version
        return "[SANITIZATION_FAILED]"

def validate_regex_pattern(pattern: str, field_name: str) -> str:
    """Validate that a string is a valid regex pattern."""
    if not pattern:
        return pattern
    try:
        re.compile(pattern)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern in {field_name}: {e}")
    return pattern

class RecommendationPriority(str, enum.Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class ToolAccessControl(BaseModel):
    """Configuration for tool access control hardening."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    tool_name: str = Field(..., min_length=1, max_length=100, description="Name of the tool")
    allowed_args: Optional[Dict[str, Any]] = Field(None, description="Allowed argument values or patterns")
    rate_limit: Optional[int] = Field(None, description="Max calls per minute", gt=0, le=1000000)
    requires_approval: bool = Field(False, description="Whether human approval is required")

class MemoryPolicy(BaseModel):
    """Configuration for memory isolation hardening."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    allowed_keys_pattern: Optional[str] = Field(None, max_length=MAX_PATTERN_LENGTH, description="Regex for allowed keys")
    denied_keys_pattern: Optional[str] = Field(None, max_length=MAX_PATTERN_LENGTH, description="Regex for denied keys")
    max_value_size: int = Field(1024, gt=0, description="Max value size in bytes (advisory)")
    encryption_required: bool = Field(True, description="Whether encryption is required for sensitive data")

    @field_validator("allowed_keys_pattern", "denied_keys_pattern")
    @classmethod
    def validate_patterns(cls, v: Optional[str], info: Any) -> Optional[str]:
        if v:
            validate_regex_pattern(v, info.field_name)
        return v

class GuardrailAction(str, enum.Enum):
    BLOCK = "block"
    WARN = "warn"
    LOG = "log"

class GuardrailConfig(BaseModel):
    """Configuration for output guardrails."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    name: str = Field(..., min_length=1, max_length=100, description="Name of the guardrail")
    trigger_pattern: str = Field(..., max_length=MAX_PATTERN_LENGTH, description="Regex pattern to trigger guardrail")
    action: GuardrailAction = Field(..., description="Action to take when triggered")
    message: str = Field(..., max_length=MAX_DESCRIPTION_LENGTH, description="Message to return when blocked/warned")

    @field_validator("trigger_pattern")
    @classmethod
    def validate_pattern(cls, v: str) -> str:
        return validate_regex_pattern(v, "trigger_pattern")

class ToolAnalysisSection(BaseModel):
    """Analysis of tool usage."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    call_count: int = Field(..., ge=0, description="Total number of tool calls")
    unique_tools: List[str] = Field(..., description="List of unique tools called")
    suspicious_patterns: List[str] = Field(default_factory=list, description="List of suspicious patterns detected")
    abuse_detected: bool = Field(False, description="Whether tool abuse was detected")
    
    @model_validator(mode='after')
    def validate_consistency(self) -> 'ToolAnalysisSection':
        if self.call_count > 0 and not self.unique_tools:
            # We don't raise here because call_count might come from a counter while unique_tools list might be truncated or sampled
            pass
        return self

class MemoryAnalysisSection(BaseModel):
    """Analysis of memory usage."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    access_count: int = Field(..., ge=0, description="Total number of memory accesses")
    sensitive_keys_accessed: List[str] = Field(default_factory=list, description="List of sensitive keys accessed")
    injection_attempts: List[str] = Field(default_factory=list, description="List of potential injection attempts")

class DivergenceAnalysisSection(BaseModel):
    """Analysis of agent divergence (deception)."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    divergence_count: int = Field(..., ge=0, description="Number of detected divergences")
    examples: List[Dict[str, Any]] = Field(default_factory=list, max_length=5, description="Examples of divergence events (serialized)")
    severity_distribution: Dict[str, int] = Field(default_factory=dict, description="Count by severity level")

class Recommendation(BaseModel):
    """Actionable recommendation for security improvement."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    priority: RecommendationPriority = Field(..., description="Priority level")
    category: OWASPAgenticRisk = Field(..., description="Related OWASP category")
    description: str = Field(..., max_length=MAX_DESCRIPTION_LENGTH, description="Detailed recommendation text")

class RemediationStep(BaseModel):
    """Specific remediation step."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    description: str = Field(..., max_length=MAX_DESCRIPTION_LENGTH, description="Description of the step")
    code_example: Optional[str] = Field(None, max_length=MAX_CODE_EXAMPLE_LENGTH, description="Code example for fix")
    effort_estimate: str = Field(..., description="Estimated effort (e.g., 'Low', 'Medium', 'High')")

class AgentHardeningPlan(BaseModel):
    """Comprehensive plan for hardening an agent."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    tool_controls: List[ToolAccessControl] = Field(default_factory=list, description="Tool access controls to apply")
    memory_isolation: Optional[MemoryPolicy] = Field(None, description="Memory policy to apply")
    guardrails: List[GuardrailConfig] = Field(default_factory=list, description="Guardrails to implement")
    owasp_remediations: Dict[OWASPAgenticRisk, RemediationStep] = Field(default_factory=dict, description="Remediations mapped by OWASP category")

class AgentSecurityReport(BaseModel):
    """Comprehensive security assessment report."""
    model_config = ConfigDict(extra="forbid", frozen=True)
    
    id: UUID = Field(default_factory=uuid4, description="Report ID")
    generated_at: datetime = Field(default_factory=utc_now)
    
    summary: str = Field(..., max_length=MAX_SUMMARY_LENGTH, description="Executive summary of findings")
    owasp_coverage: Dict[OWASPAgenticRisk, bool] = Field(..., description="Map of tested OWASP categories")
    vulnerability_findings: List[ViolationResult] = Field(default_factory=list, description="List of detected vulnerabilities")
    risk_score: float = Field(..., ge=0.0, le=10.0, description="Overall risk score (0=Safe, 10=Risky)")
    
    tool_analysis: Optional[ToolAnalysisSection] = Field(None, description="Tool usage analysis")
    memory_analysis: Optional[MemoryAnalysisSection] = Field(None, description="Memory usage analysis")
    divergence_analysis: Optional[DivergenceAnalysisSection] = Field(None, description="Divergence analysis")
    
    recommendations: List[Recommendation] = Field(default_factory=list, description="Prioritized recommendations")
    remediation_steps: List[RemediationStep] = Field(default_factory=list, description="Specific remediation steps")
    
    hardening_plan: Optional[AgentHardeningPlan] = Field(None, description="Generated hardening plan")

    @model_validator(mode='after')
    def validate_risk_consistency(self) -> 'AgentSecurityReport':
        """Ensure risk score reflects findings severity."""
        high_sev_count = sum(1 for v in self.vulnerability_findings if v.detected and v.severity >= 7)
        if high_sev_count > 0 and self.risk_score < 4.0:
            msg = f"Risk score {self.risk_score} is too low for {high_sev_count} HIGH/CRITICAL severity findings"
            raise ValueError(msg)
            
        # Inconsistency 2: High score but no findings (only if score is very high)
        total_detected = sum(1 for v in self.vulnerability_findings if v.detected)
        if self.risk_score > 7.0 and total_detected == 0:
            raise ValueError(f"Risk score {self.risk_score} is inconsistent with 0 detected vulnerabilities")
            
        return self

    def to_json(self) -> str:
        """Serialize report to JSON string."""
        try:
            return self.model_dump_json(indent=2)
        except Exception as e:
            # Fallback for serialization errors
            logger.error(f"Serialization failed for report {self.id}: {e}")
            return json.dumps({
                "error": "Serialization failed", 
                "message": str(e),
                "partial_summary": self.summary[:100]
            })

    def to_markdown(self) -> str:
        """Generate a Markdown representation of the report."""
        try:
            md = ["# Agent Security Assessment Report\n"]
            md.append(f"**Generated**: {self.generated_at.isoformat()}")
            md.append(f"**Overall Risk Score**: {self.risk_score}/10.0\n")
            
            md.append("## Executive Summary")
            md.append(sanitize_markdown(self.summary) + "\n")
            
            md.append("## OWASP Agentic Top 10 Coverage")
            md.append("| Category | Tested | Violation Detected |")
            md.append("|----------|--------|-------------------|")
            
            # Sort keys by enum value explicitly for stable ordering
            sorted_risks = sorted(self.owasp_coverage.keys(), key=lambda x: x.value)
            
            # Create map of detected violations
            detected_categories: Set[OWASPAgenticRisk] = {
                v.owasp_category for v in self.vulnerability_findings if v.detected
            }
            
            for risk in sorted_risks:
                tested = "Yes" if self.owasp_coverage[risk] else "No"
                
                if not self.owasp_coverage[risk]:
                    status = "Not Tested"
                elif risk in detected_categories:
                    status = "Detected"
                else:
                    status = "Safe"
                    
                md.append(f"| {risk.value} - {risk.name} | {tested} | {status} |")
                
            if self.vulnerability_findings:
                md.append("\n## Vulnerability Findings")
                for v in self.vulnerability_findings:
                    if v.detected:
                        md.append(f"### {v.owasp_category.value}: {v.owasp_category.name}")
                        md.append(f"- **Severity**: {v.severity}/10")
                        md.append(f"- **Evidence**: {sanitize_markdown(v.evidence)}")
                        md.append(f"- **Recommendation**: {sanitize_markdown(v.recommendation)}")
            else:
                md.append("\n## Vulnerability Findings")
                md.append("No vulnerabilities detected.")
                        
            if self.tool_analysis:
                md.append("\n## Tool Analysis")
                md.append(f"- **Total Calls**: {self.tool_analysis.call_count}")
                tools_str = ", ".join(self.tool_analysis.unique_tools) if self.tool_analysis.unique_tools else "None"
                md.append(f"- **Unique Tools**: {sanitize_markdown(tools_str)}")
                
                if self.tool_analysis.abuse_detected:
                    md.append("- **Tool Abuse Detected**")
                
                if self.tool_analysis.suspicious_patterns:
                    patterns_str = ", ".join(self.tool_analysis.suspicious_patterns)
                    md.append(f"- **Suspicious Patterns**: {sanitize_markdown(patterns_str)}")
            else:
                md.append("\n## Tool Analysis")
                md.append("No tool analysis data available.")
                    
            if self.memory_analysis:
                md.append("\n## Memory Analysis")
                md.append(f"- **Access Count**: {self.memory_analysis.access_count}")
                if self.memory_analysis.sensitive_keys_accessed:
                     keys_str = ", ".join(self.memory_analysis.sensitive_keys_accessed)
                     md.append(f"- **Sensitive Keys Accessed**: {sanitize_markdown(keys_str)}")
                if self.memory_analysis.injection_attempts:
                     attempts_str = ", ".join(self.memory_analysis.injection_attempts)
                     md.append(f"- **Injection Attempts**: {sanitize_markdown(attempts_str)}")
            else:
                md.append("\n## Memory Analysis")
                md.append("No memory analysis data available.")

            if self.divergence_analysis:
                 md.append("\n## Divergence Analysis (Deception Detection)")
                 md.append(f"- **Total Divergences**: {self.divergence_analysis.divergence_count}")
                 if self.divergence_analysis.severity_distribution:
                     md.append("- **Severity Distribution**:")
                     for sev, count in self.divergence_analysis.severity_distribution.items():
                         md.append(f"  - {sanitize_markdown(sev)}: {count}")
            else:
                 md.append("\n## Divergence Analysis")
                 md.append("No divergence analysis data available.")

            if self.recommendations:
                md.append("\n## Recommendations")
                sorted_recs = sorted(
                    self.recommendations, 
                    key=lambda x: PRIORITY_ORDER.get(x.priority.value, 99)
                )
                
                for r in sorted_recs:
                    md.append(f"### [{r.priority.value}] {r.category.value}")
                    md.append(sanitize_markdown(r.description))
            else:
                md.append("\n## Recommendations")
                md.append("No recommendations.")

            if self.hardening_plan:
                 md.append("\n## Hardening Plan")
                 if self.hardening_plan.tool_controls:
                     md.append("### Tool Controls")
                     for tc in self.hardening_plan.tool_controls:
                         approval = " (Requires Approval)" if tc.requires_approval else ""
                         limit = f" (Limit: {tc.rate_limit}/min)" if tc.rate_limit else ""
                         md.append(f"- **{sanitize_markdown(tc.tool_name)}**: {approval}{limit}")
                 
                 if self.hardening_plan.guardrails:
                     md.append("### Recommended Guardrails")
                     for g in self.hardening_plan.guardrails:
                         md.append(f"- **{sanitize_markdown(g.name)}** ({g.action.value}): {sanitize_markdown(g.message)}")
                 
                 if self.hardening_plan.memory_isolation:
                     md.append("### Memory Policy")
                     mp = self.hardening_plan.memory_isolation
                     if mp.allowed_keys_pattern:
                         md.append(f"- Allowed Keys: `{sanitize_markdown(mp.allowed_keys_pattern)}`")
                     if mp.denied_keys_pattern:
                         md.append(f"- Denied Keys: `{sanitize_markdown(mp.denied_keys_pattern)}`")
                     md.append(f"- Max Value Size: {mp.max_value_size} bytes")
                     md.append(f"- Encryption: {'Required' if mp.encryption_required else 'Optional'}")
            else:
                 md.append("\n## Hardening Plan")
                 md.append("No hardening plan generated.")
            
            if self.remediation_steps:
                md.append("\n## Remediation Steps")
                for step in self.remediation_steps:
                     md.append(f"- **{sanitize_markdown(step.description)}** (Effort: {sanitize_markdown(step.effort_estimate)})")
                     if step.code_example:
                         code = step.code_example
                         if "```" in code:
                             md.append(f"  ~~~\n{code}\n  ~~~")
                         else:
                             md.append(f"  ```\n{code}\n  ```")

            return "\n".join(md)
            
        except Exception as e:
            # Fail safe for report generation errors
            return f"# Error Generating Report\n\nAn error occurred while generating the report: {sanitize_markdown(str(e))}"