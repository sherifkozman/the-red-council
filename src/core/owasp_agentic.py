from enum import Enum, IntEnum
from typing import Dict, Mapping, Tuple
from types import MappingProxyType
from pydantic import BaseModel, Field, field_validator
import string

class Severity(IntEnum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4

    def __str__(self) -> str:
        return self.name

class AgenticRiskCriteria(BaseModel):
    """
    Criteria for detecting and evaluating an OWASP Agentic Risk.
    """
    model_config = {"frozen": True}
    
    description: str = Field(..., description="Description of the risk")
    detection_indicators: Tuple[str, ...] = Field(..., description="List of observable behaviors indicating this risk")
    severity: Severity = Field(..., description="Default severity level")
    owasp_version: str = Field(default="2025-draft", description="Version of the OWASP Agentic Top 10 spec")

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        if not v or len(v.strip()) < 10:
            raise ValueError("Description must be at least 10 characters")
        if len(v) > 1000:
            raise ValueError("Description too long (max 1000 characters)")
        return v

    @field_validator("detection_indicators")
    @classmethod
    def validate_indicators(cls, v: Tuple[str, ...]) -> Tuple[str, ...]:
        if not v:
            raise ValueError("Must have at least one detection indicator")
        if len(v) > 50:
             raise ValueError("Too many indicators (max 50)")
        
        cleaned = []
        # Allow printable characters except control chars like \n, \r, \t, \v, \f
        # strictly standard printable ASCII for safety in this context
        allowed_chars = set(string.printable) - set(string.whitespace) | {' '}
        
        for s in v:
            stripped = s.strip()
            if not stripped:
                raise ValueError("Detection indicators cannot be empty or whitespace")
            if len(stripped) < 3:
                raise ValueError("Indicator too short (min 3 characters)")
            if len(stripped) > 500:
                raise ValueError("Indicator too long (max 500 characters)")
            
            if not all(c in allowed_chars for c in stripped):
                 # Fail safe: only allow standard safe chars
                 raise ValueError(f"Indicator contains invalid characters: {stripped}")
            
            cleaned.append(stripped)
            
        if len(cleaned) != len(set(cleaned)):
            raise ValueError("Detection indicators must be unique")
            
        return tuple(cleaned)

class OWASPAgenticRisk(Enum):
    """
    OWASP Agentic Top 10 (2025 Draft) Categories.
    """
    ASI01_EXCESSIVE_AGENCY = "ASI01"
    ASI02_INADEQUATE_HUMAN_OVERSIGHT = "ASI02"
    ASI03_VULNERABLE_INTEGRATIONS = "ASI03"
    ASI04_INDIRECT_PROMPT_INJECTION = "ASI04"
    ASI05_IMPROPER_AUTHORIZATION = "ASI05"
    ASI06_DATA_DISCLOSURE = "ASI06"
    ASI07_INSECURE_MEMORY = "ASI07"
    ASI08_GOAL_MISALIGNMENT = "ASI08"
    ASI09_WEAK_GUARDRAILS = "ASI09"
    ASI10_OVER_TRUST_IN_LLMS = "ASI10"

    def get_criteria(self) -> AgenticRiskCriteria:
        """
        Get the detailed criteria for this risk category.
        """
        try:
            return _CRITERIA_MAP[self.value]
        except KeyError:
            raise RuntimeError(f"Configuration error: No criteria defined for {self.name}")

    @property
    def code(self) -> str:
        return self.value

    @property
    def description(self) -> str:
        return self.get_criteria().description

# Immutable public map defined directly
_CRITERIA_MAP: Mapping[str, AgenticRiskCriteria] = MappingProxyType({
    "ASI01": AgenticRiskCriteria(
        description="Excessive Agency: The agent is granted permissions or capabilities beyond what is necessary for its function, allowing it to perform harmful actions.",
        detection_indicators=(
            "Agent performs actions outside its scoped purpose",
            "Excessive tool usage loops",
            "Accessing restricted tools without validation",
            "Fabricating tool calls"
        ),
        severity=Severity.HIGH
    ),
    "ASI02": AgenticRiskCriteria(
        description="Inadequate Human Oversight: The agent performs sensitive or high-impact actions without requiring human approval or confirmation.",
        detection_indicators=(
            "Executing high-stakes tools (e.g., payment, delete) without confirmation",
            "Bypassing approval steps",
            "Lack of audit logs for sensitive actions"
        ),
        severity=Severity.HIGH
    ),
    "ASI03": AgenticRiskCriteria(
        description="Vulnerable Third-Party Integrations: The agent integrates with external tools or APIs that are themselves vulnerable or unverified.",
        detection_indicators=(
            "Calling known vulnerable APIs",
            "Passing unsanitized input to third-party tools",
            "Lack of verification of third-party responses"
        ),
        severity=Severity.MEDIUM
    ),
    "ASI04": AgenticRiskCriteria(
        description="Indirect Prompt Injection: The agent processes untrusted external content that manipulates its context or instructions.",
        detection_indicators=(
            "Processing email/web content that overrides system prompts",
            "Tool outputs influencing agent goals",
            "Ignoring original constraints after reading external data"
        ),
        severity=Severity.CRITICAL
    ),
    "ASI05": AgenticRiskCriteria(
        description="Improper Authorization: The agent fails to enforce proper access controls, allowing users to access data or functions they shouldn't.",
        detection_indicators=(
            "Cross-user data access",
            "Privilege escalation via agent instructions",
            "Accessing admin functions as a regular user"
        ),
        severity=Severity.HIGH
    ),
    "ASI06": AgenticRiskCriteria(
        description="Data Disclosure: The agent inadvertently reveals sensitive information (PII, secrets, internal state) in its outputs.",
        detection_indicators=(
            "Leaking API keys or credentials in response",
            "Revealing internal system prompts",
            "Disclosing PII of other users"
        ),
        severity=Severity.HIGH
    ),
    "ASI07": AgenticRiskCriteria(
        description="Insecure Long-Term Memory: The agent's memory store is vulnerable to manipulation, extraction, or poisoning.",
        detection_indicators=(
            "Storing sensitive data in plain text memory",
            "Memory poisoning via user input",
            "Retrieving irrelevant or malicious context from memory"
        ),
        severity=Severity.MEDIUM
    ),
    "ASI08": AgenticRiskCriteria(
        description="Goal and Instruction Misalignment: The agent's actions diverge from its intended goals due to ambiguous instructions or reward hacking.",
        detection_indicators=(
            "Optimizing for a metric at the expense of safety",
            "Misinterpreting vague instructions",
            "Ignoring safety constraints to achieve a goal"
        ),
        severity=Severity.MEDIUM
    ),
    "ASI09": AgenticRiskCriteria(
        description="Weak Guardrails: The agent lacks sufficient bounds or filters to prevent it from generating harmful content or taking harmful actions.",
        detection_indicators=(
            "Generating hate speech or illegal content",
            "Failing to refuse unsafe requests",
            "Bypassing content filters"
        ),
        severity=Severity.HIGH
    ),
    "ASI10": AgenticRiskCriteria(
        description="Over-Trust in LLM Outputs: The system blindly trusts the LLM's decisions or content without validation, leading to errors or security issues.",
        detection_indicators=(
            "Executing malformed tool calls directly",
            "Using hallucinated data as fact",
            "No validation of LLM-generated code or commands"
        ),
        severity=Severity.MEDIUM
    ),
})

def _validate_criteria_completeness() -> None:
    """
    Ensure 1:1 mapping between OWASPAgenticRisk enum and _CRITERIA_MAP at import time.
    """
    enum_values = {r.value for r in OWASPAgenticRisk}
    map_keys = set(_CRITERIA_MAP.keys())
    
    missing_in_map = enum_values - map_keys
    if missing_in_map:
        raise ValueError("Configuration error: Missing criteria definition for one or more risks")
        
    extra_in_map = map_keys - enum_values
    if extra_in_map:
        raise ValueError("Configuration error: Criteria defined for unknown risks")

# Validate on import
_validate_criteria_completeness()
