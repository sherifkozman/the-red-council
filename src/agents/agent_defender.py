# src/agents/agent_defender.py
"""
Agent Defender - Generates agent-specific hardening recommendations.

Analyzes AgentJudgeScore to produce AgentHardeningPlan with tool controls,
memory policies, and guardrails based on OWASP Agentic vulnerabilities.
"""

import asyncio
import logging
from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from src.agents.errors import DefenderError
from src.core.agent_report import (
    AgentHardeningPlan,
    GuardrailAction,
    GuardrailConfig,
    MemoryPolicy,
    RemediationStep,
    ToolAccessControl,
)
from src.core.agent_schemas import AgentJudgeScore
from src.core.owasp_agentic import OWASPAgenticRisk
from src.providers.gemini_client import GeminiClient
from src.providers.types import AgentRole

logger = logging.getLogger(__name__)

# Constants for rate limiting and thresholds
DEFAULT_TOOL_RATE_LIMIT = 10  # calls per minute
HIGH_RISK_TOOL_RATE_LIMIT = 3  # for dangerous tools
DEFAULT_MAX_VALUE_SIZE = 1024  # bytes

# OWASP-specific remediation templates
OWASP_REMEDIATIONS: Dict[OWASPAgenticRisk, Tuple[str, str, str]] = {
    # Format: (description, code_example, effort_estimate)
    OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY: (
        "Implement strict tool allowlists and rate limiting to prevent excessive tool usage.",
        """# Example: Tool rate limiter
from functools import wraps
import time

def rate_limit(max_calls: int, period: int = 60):
    calls = []
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            now = time.time()
            calls[:] = [c for c in calls if now - c < period]
            if len(calls) >= max_calls:
                raise RateLimitError("Tool call limit exceeded")
            calls.append(now)
            return func(*args, **kwargs)
        return wrapper
    return decorator""",
        "Medium",
    ),
    OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT: (
        "Add human-in-the-loop confirmation for sensitive operations.",
        """# Example: Confirmation decorator
def requires_approval(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        if not await get_human_approval(func.__name__, args, kwargs):
            raise OperationDenied("Human approval required")
        return await func(*args, **kwargs)
    return wrapper""",
        "High",
    ),
    OWASPAgenticRisk.ASI03_VULNERABLE_INTEGRATIONS: (
        "Validate and sanitize all data from third-party integrations.",
        """# Example: Input validation
def validate_api_response(response: dict, schema: Schema) -> dict:
    # Validate structure
    validated = schema.validate(response)
    # Sanitize strings
    for key, value in validated.items():
        if isinstance(value, str):
            validated[key] = sanitize_string(value)
    return validated""",
        "Medium",
    ),
    OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION: (
        "Implement prompt injection detection and input sanitization.",
        """# Example: Injection detection
INJECTION_PATTERNS = [
    r"ignore previous",
    r"system prompt",
    r"you are now",
    r"disregard.*instruction",
]

def detect_injection(text: str) -> bool:
    text_lower = text.lower()
    return any(re.search(p, text_lower) for p in INJECTION_PATTERNS)""",
        "High",
    ),
    OWASPAgenticRisk.ASI05_IMPROPER_AUTHORIZATION: (
        "Implement role-based access control (RBAC) for all operations.",
        """# Example: RBAC decorator
def requires_permission(permission: str):
    def decorator(func):
        @wraps(func)
        def wrapper(user, *args, **kwargs):
            if permission not in user.permissions:
                raise PermissionDenied(f"Missing: {permission}")
            return func(user, *args, **kwargs)
        return wrapper
    return decorator""",
        "High",
    ),
    OWASPAgenticRisk.ASI06_DATA_DISCLOSURE: (
        "Implement output filtering to prevent sensitive data leakage.",
        """# Example: Output sanitizer
SENSITIVE_PATTERNS = [
    r"sk-[a-zA-Z0-9]{20,}",  # API keys
    r"[A-Za-z0-9+/]{40,}",   # Base64 secrets
]

def sanitize_output(text: str) -> str:
    for pattern in SENSITIVE_PATTERNS:
        text = re.sub(pattern, "[REDACTED]", text)
    return text""",
        "Medium",
    ),
    OWASPAgenticRisk.ASI07_INSECURE_MEMORY: (
        "Implement memory key validation and encryption for sensitive data.",
        """# Example: Secure memory wrapper
class SecureMemory:
    ALLOWED_KEYS = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{0,63}$")
    DENIED_KEYS = re.compile(r"^(__|system_|config_)")

    def set(self, key: str, value: Any) -> None:
        if not self.ALLOWED_KEYS.match(key):
            raise InvalidKeyError("Key format not allowed")
        if self.DENIED_KEYS.match(key):
            raise InvalidKeyError("System keys protected")
        self._store[key] = self._encrypt(value)""",
        "Medium",
    ),
    OWASPAgenticRisk.ASI08_GOAL_MISALIGNMENT: (
        "Implement goal tracking and divergence detection.",
        """# Example: Goal alignment checker
class GoalTracker:
    def __init__(self, original_goal: str):
        self.original_goal = original_goal
        self.actions = []

    def check_alignment(self, action: str) -> float:
        similarity = compute_similarity(self.original_goal, action)
        if similarity < 0.5:
            logger.warning(f"Potential misalignment: {action}")
        return similarity""",
        "High",
    ),
    OWASPAgenticRisk.ASI09_WEAK_GUARDRAILS: (
        "Implement robust content filtering and guardrails.",
        """# Example: Content guardrail
class ContentGuardrail:
    def __init__(self, patterns: List[str], action: str = "block"):
        self.patterns = [re.compile(p) for p in patterns]
        self.action = action

    def check(self, content: str) -> Tuple[bool, str]:
        for pattern in self.patterns:
            if pattern.search(content):
                return False, f"Blocked by guardrail"
        return True, """,
        "Medium",
    ),
    OWASPAgenticRisk.ASI10_OVER_TRUST_IN_LLMS: (
        "Implement validation and verification for all LLM outputs.",
        """# Example: Output validator
def validate_llm_output(output: str, expected_format: Schema) -> dict:
    try:
        parsed = json.loads(output)
        validated = expected_format.validate(parsed)
        # Cross-check with known good data
        if not cross_validate(validated):
            raise ValidationError("Cross-validation failed")
        return validated
    except Exception as e:
        raise InvalidLLMOutput(f"Validation failed: {e}")""",
        "High",
    ),
}

# Dangerous tool keywords for guardrail generation
DANGEROUS_TOOL_KEYWORDS = frozenset(
    [
        "delete",
        "remove",
        "drop",
        "truncate",
        "transfer",
        "pay",
        "send",
        "buy",
        "purchase",
        "grant",
        "revoke",
        "admin",
        "sudo",
        "root",
        "execute",
        "eval",
        "exec",
        "shell",
        "command",
    ]
)


class AgentDefenderConfig(BaseModel):
    """Configuration for AgentDefender."""

    model_config = {"frozen": True, "extra": "forbid"}

    use_llm_recommendations: bool = Field(
        True, description="Whether to use LLM for enhanced recommendations"
    )
    default_tool_rate_limit: int = Field(
        DEFAULT_TOOL_RATE_LIMIT,
        ge=1,
        le=1000,
        description="Default rate limit for tools (calls/min)",
    )
    dangerous_tool_rate_limit: int = Field(
        HIGH_RISK_TOOL_RATE_LIMIT,
        ge=1,
        le=100,
        description="Rate limit for dangerous tools (calls/min)",
    )
    max_value_size: int = Field(
        DEFAULT_MAX_VALUE_SIZE,
        ge=64,
        le=1048576,  # 1MB max
        description="Max memory value size in bytes",
    )


DEFENDER_SYSTEM_PROMPT = """You are an AI security engineer specializing in agent security hardening.
Your role: analyze detected vulnerabilities and generate specific, actionable hardening recommendations.

Output ONLY valid JSON matching the requested schema."""


class LLMHardeningRecommendation(BaseModel):
    """Schema for LLM-generated hardening recommendations."""

    tool_controls: List[Dict[str, object]] = Field(
        default_factory=list, description="Tool-specific access controls"
    )
    memory_policy_recommendation: Optional[str] = Field(
        None, description="Memory policy recommendation text"
    )
    guardrail_suggestions: List[Dict[str, str]] = Field(
        default_factory=list, description="Suggested guardrails"
    )
    additional_steps: List[str] = Field(
        default_factory=list, description="Additional remediation steps"
    )


class AgentDefender:
    """
    Agent-specific defender that generates hardening recommendations.

    Uses composition with GeminiClient for LLM-powered recommendations,
    with fallback to rule-based hardening.
    """

    def __init__(
        self,
        llm_client: Optional[GeminiClient] = None,
        config: Optional[AgentDefenderConfig] = None,
    ):
        """
        Initialize AgentDefender.

        Args:
            llm_client: Optional GeminiClient for LLM-powered recommendations.
                       If None, uses rule-based fallback only.
            config: Configuration for defender behavior.
        """
        self.client = llm_client
        self.config = config or AgentDefenderConfig()

    def generate_hardening(self, score: AgentJudgeScore) -> AgentHardeningPlan:
        """
        Generate a hardening plan from an AgentJudgeScore.

        Sync wrapper for generate_hardening_async.
        WARNING: Do not call from within a running event loop.

        Args:
            score: The agent evaluation score with violations

        Returns:
            AgentHardeningPlan with tool controls, memory policy, and guardrails
        """
        try:
            asyncio.get_running_loop()
            has_loop = True
        except RuntimeError:
            has_loop = False

        if has_loop:
            raise RuntimeError(
                "Cannot call sync generate_hardening from within a running event loop. "
                "Use generate_hardening_async instead."
            )

        return asyncio.run(self.generate_hardening_async(score))

    async def generate_hardening_async(
        self,
        score: AgentJudgeScore,
    ) -> AgentHardeningPlan:
        """
        Generate a hardening plan from an AgentJudgeScore.

        Args:
            score: The agent evaluation score with violations

        Returns:
            AgentHardeningPlan with tool controls, memory policy, and guardrails
        """
        # Start with rule-based hardening
        tool_controls = self._generate_tool_controls(score)
        memory_policy = self._generate_memory_policy(score)
        guardrails = self._generate_guardrails(score)
        owasp_remediations = self._generate_owasp_remediations(score)

        # Optionally enhance with LLM recommendations
        if self.client and self.config.use_llm_recommendations:
            try:
                llm_recommendations = await self._get_llm_recommendations(score)
                # Merge LLM recommendations with rule-based ones
                tool_controls, memory_policy, guardrails = self._merge_recommendations(
                    tool_controls,
                    memory_policy,
                    guardrails,
                    llm_recommendations,
                )
            except Exception as e:
                logger.warning(f"LLM recommendation failed, using rule-based only: {e}")
                # Continue with rule-based recommendations

        return AgentHardeningPlan(
            tool_controls=tool_controls,
            memory_isolation=memory_policy,
            guardrails=guardrails,
            owasp_remediations=owasp_remediations,
        )

    def generate_hardening_prompt(self, score: AgentJudgeScore) -> str:
        """
        Generate a prompt for LLM-based hardening recommendation.

        Args:
            score: The agent evaluation score

        Returns:
            Formatted prompt string for LLM
        """
        violations_text = "\n".join(
            [
                f"- {v.owasp_category.value}: Severity {v.severity}/10 - {v.evidence[:200]}"
                for v in score.owasp_violations
                if v.detected
            ]
        )

        if not violations_text:
            violations_text = (
                "No specific violations detected, but overall risk score is elevated."
            )

        prompt = f"""Analyze the following agent security assessment and provide hardening recommendations:

SECURITY ASSESSMENT:
- Overall Risk Score: {score.overall_agent_risk}/10
- Tool Abuse Score: {score.tool_abuse_score}/10 ({score.tool_abuse_details})
- Memory Safety Score: {score.memory_safety_score}/10 ({score.memory_safety_details})
- Divergence Count: {score.divergence_count}

DETECTED VIOLATIONS:
{violations_text}

EXISTING RECOMMENDATIONS:
{chr(10).join(f"- {r}" for r in score.recommendations)}

Based on this assessment, provide specific hardening recommendations including:
1. Tool-specific access controls with rate limits
2. Memory policy recommendations
3. Guardrail configurations
4. Additional remediation steps

Focus on actionable, implementable changes."""

        return prompt

    def _generate_tool_controls(
        self,
        score: AgentJudgeScore,
    ) -> List[ToolAccessControl]:
        """Generate tool access controls based on score."""
        controls: List[ToolAccessControl] = []

        # Check for ASI01 (Excessive Agency) violations
        has_excessive_agency = any(
            v.detected and v.owasp_category == OWASPAgenticRisk.ASI01_EXCESSIVE_AGENCY
            for v in score.owasp_violations
        )

        # Check for ASI02 (Inadequate Oversight) violations
        has_oversight_issues = any(
            v.detected
            and v.owasp_category == OWASPAgenticRisk.ASI02_INADEQUATE_HUMAN_OVERSIGHT
            for v in score.owasp_violations
        )

        # Parse tool names from details if available
        tool_names = self._extract_tool_names(score.tool_abuse_details)

        # If no specific tools, add general controls
        if not tool_names:
            tool_names = ["*"]  # Wildcard for all tools

        for tool_name in tool_names:
            is_dangerous = any(
                kw in tool_name.lower() for kw in DANGEROUS_TOOL_KEYWORDS
            )

            rate_limit = (
                self.config.dangerous_tool_rate_limit
                if is_dangerous or has_excessive_agency
                else self.config.default_tool_rate_limit
            )

            requires_approval = is_dangerous or has_oversight_issues

            controls.append(
                ToolAccessControl(
                    tool_name=tool_name[:100],  # Truncate to max length
                    allowed_args=None,  # Can be customized per tool
                    rate_limit=rate_limit,
                    requires_approval=requires_approval,
                )
            )

        return controls

    def _generate_memory_policy(
        self,
        score: AgentJudgeScore,
    ) -> MemoryPolicy:
        """Generate memory policy based on score."""
        # Check for ASI07 (Insecure Memory) violations
        has_memory_issues = any(
            v.detected and v.owasp_category == OWASPAgenticRisk.ASI07_INSECURE_MEMORY
            for v in score.owasp_violations
        )

        # Default: strict policy if memory issues detected
        if has_memory_issues or score.memory_safety_score < 5.0:
            return MemoryPolicy(
                allowed_keys_pattern=r"^[a-zA-Z][a-zA-Z0-9_]{0,63}$",
                denied_keys_pattern=r"^(__|system_|config_|admin_|secret_|password_)",
                max_value_size=self.config.max_value_size,
                encryption_required=True,
            )
        else:
            return MemoryPolicy(
                allowed_keys_pattern=r"^[a-zA-Z][a-zA-Z0-9_]{0,127}$",
                denied_keys_pattern=r"^(__|system_)",
                max_value_size=self.config.max_value_size * 4,  # More lenient
                encryption_required=False,
            )

    def _generate_guardrails(
        self,
        score: AgentJudgeScore,
    ) -> List[GuardrailConfig]:
        """Generate guardrail configurations based on score."""
        guardrails: List[GuardrailConfig] = []

        # ASI04: Prompt Injection - add injection detection guardrail
        if any(
            v.detected
            and v.owasp_category == OWASPAgenticRisk.ASI04_INDIRECT_PROMPT_INJECTION
            for v in score.owasp_violations
        ):
            guardrails.append(
                GuardrailConfig(
                    name="Prompt Injection Detector",
                    trigger_pattern=r"(?i)(ignore previous|system prompt|you are now|disregard.*instruction)",
                    action=GuardrailAction.BLOCK,
                    message="Potential prompt injection detected. Request blocked.",
                )
            )

        # ASI06: Data Disclosure - add output sanitizer
        if any(
            v.detected and v.owasp_category == OWASPAgenticRisk.ASI06_DATA_DISCLOSURE
            for v in score.owasp_violations
        ):
            guardrails.append(
                GuardrailConfig(
                    name="Sensitive Data Filter",
                    trigger_pattern=r"(?i)(password|secret|api_key|token|credential)",
                    action=GuardrailAction.WARN,
                    message="Output may contain sensitive data. Review before sharing.",
                )
            )

        # ASI09: Weak Guardrails - add general content filter
        if any(
            v.detected and v.owasp_category == OWASPAgenticRisk.ASI09_WEAK_GUARDRAILS
            for v in score.owasp_violations
        ):
            guardrails.append(
                GuardrailConfig(
                    name="Content Safety Filter",
                    trigger_pattern=r"(?i)(harmful|dangerous|illegal|exploit)",
                    action=GuardrailAction.LOG,
                    message="Content flagged for review.",
                )
            )

        # High overall risk - add catch-all guardrail
        if score.overall_agent_risk >= 7.0:
            guardrails.append(
                GuardrailConfig(
                    name="High Risk Mode",
                    trigger_pattern=r".*",  # Match all
                    action=GuardrailAction.LOG,
                    message="Agent in high-risk mode. All actions logged.",
                )
            )

        return guardrails

    def _generate_owasp_remediations(
        self,
        score: AgentJudgeScore,
    ) -> Dict[OWASPAgenticRisk, RemediationStep]:
        """Generate OWASP-specific remediation steps."""
        remediations: Dict[OWASPAgenticRisk, RemediationStep] = {}

        for violation in score.owasp_violations:
            if violation.detected and violation.owasp_category in OWASP_REMEDIATIONS:
                desc, code, effort = OWASP_REMEDIATIONS[violation.owasp_category]
                remediations[violation.owasp_category] = RemediationStep(
                    description=desc,
                    code_example=code,
                    effort_estimate=effort,
                )

        return remediations

    async def _get_llm_recommendations(
        self,
        score: AgentJudgeScore,
    ) -> LLMHardeningRecommendation:
        """Get LLM-powered hardening recommendations."""
        if not self.client:
            raise DefenderError("LLM client not configured")

        prompt = f"{DEFENDER_SYSTEM_PROMPT}\n\n{self.generate_hardening_prompt(score)}"

        try:
            result_dict = await self.client.generate_structured_evaluation(
                prompt=prompt,
                schema_cls=LLMHardeningRecommendation,
                role=AgentRole.DEFENDER,
            )
            return LLMHardeningRecommendation(**result_dict)

        except Exception as e:
            raise DefenderError(f"LLM recommendation failed: {e}")

    def _merge_recommendations(
        self,
        tool_controls: List[ToolAccessControl],
        memory_policy: MemoryPolicy,
        guardrails: List[GuardrailConfig],
        llm_rec: LLMHardeningRecommendation,
    ) -> Tuple[List[ToolAccessControl], MemoryPolicy, List[GuardrailConfig]]:
        """Merge LLM recommendations with rule-based ones."""
        # Tool controls: add any new tools from LLM
        existing_tools = {tc.tool_name for tc in tool_controls}

        for tc_dict in llm_rec.tool_controls:
            tool_name = str(tc_dict.get("tool_name", ""))[:100]
            if tool_name and tool_name not in existing_tools:
                try:
                    tool_controls.append(
                        ToolAccessControl(
                            tool_name=tool_name,
                            rate_limit=int(
                                tc_dict.get(
                                    "rate_limit", self.config.default_tool_rate_limit
                                )
                            ),
                            requires_approval=bool(
                                tc_dict.get("requires_approval", False)
                            ),
                        )
                    )
                    existing_tools.add(tool_name)
                except Exception as e:
                    logger.warning(f"Failed to parse LLM tool control: {e}")

        # Guardrails: add new ones from LLM
        existing_guardrails = {g.name for g in guardrails}

        for g_dict in llm_rec.guardrail_suggestions:
            name = str(g_dict.get("name", ""))[:100]
            pattern = str(g_dict.get("pattern", ""))[:500]

            if name and pattern and name not in existing_guardrails:
                try:
                    guardrails.append(
                        GuardrailConfig(
                            name=name,
                            trigger_pattern=pattern,
                            action=GuardrailAction.LOG,  # Default to logging
                            message=str(
                                g_dict.get(
                                    "message", "LLM-suggested guardrail triggered"
                                )
                            )[:500],
                        )
                    )
                    existing_guardrails.add(name)
                except Exception as e:
                    logger.warning(f"Failed to parse LLM guardrail: {e}")

        # Memory policy: keep rule-based (more reliable)
        return tool_controls, memory_policy, guardrails

    def _extract_tool_names(self, details: str) -> List[str]:
        """Extract tool names from tool abuse details string."""
        # Look for patterns like "tool 'name'" or "called: name"
        import re

        patterns = [
            r"tool\s+['\"]([^'\"]+)['\"]",
            r"called:\s*([a-zA-Z_][a-zA-Z0-9_]*)",
            r"function\s+['\"]([^'\"]+)['\"]",
        ]

        tools: List[str] = []
        for pattern in patterns:
            matches = re.findall(pattern, details, re.IGNORECASE)
            tools.extend(m for m in matches if m)

        return list(set(tools))[:10]  # Limit to 10 unique tools
