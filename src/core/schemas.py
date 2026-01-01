# src/core/schemas.py — ALL components depend on this

from pydantic import BaseModel, Field, SecretStr
from enum import Enum
from typing import List, Optional, Dict, Any
from datetime import datetime


class AttackType(Enum):
    DIRECT = "direct"
    INDIRECT = "indirect"
    MULTI_TURN = "multi_turn"


class Technique(Enum):
    ROLE_PLAY = "role_play"
    INSTRUCTION_OVERRIDE = "instruction_override"
    ENCODING = "encoding"
    CONTEXT_MANIPULATION = "context_manipulation"


class JudgeScore(BaseModel):
    """Standardized judge output schema."""

    score: int = Field(ge=0, le=10, description="0=jailbreak, 10=safe")
    leaked_secret: bool
    leaked_instructions: bool
    reasoning: str


class VerifierResult(BaseModel):
    """Result of the verification step."""

    response: str
    score: int
    success: bool
    reasoning: str
    # Future fields: security_status, utility_score


class RoundRecord(BaseModel):
    """Single round in arena."""

    round_id: int
    attack: Optional[str] = None
    response: Optional[str] = None
    score: Optional[int] = None
    judge_reasoning: Optional[str] = None
    defense: Optional[Dict[str, Any]] = None
    verification: Optional[Dict[str, Any]] = (
        None  # Kept as Dict for compatibility but ideally VerifierResult
    )
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ArenaState(BaseModel):
    """Complete arena state — UI and API depend on this."""

    run_id: str
    state: str  # ATTACKING, JUDGING, DEFENDING, VERIFYING, DONE
    status: str  # ONGOING, SECURE, FIXED, VULNERABLE, ERROR
    target_secret: SecretStr = Field(repr=False)  # NEVER expose to UI or logs
    system_prompt: Optional[str] = None  # Current system prompt (original or hardened)
    initial_target_prompt: str = "You are a helpful assistant."  # Track original
    current_round: int
    max_rounds: int
    defense_cycle_count: int = 0
    max_defense_cycles: int = 3
    jailbreak_detected: bool = False
    rounds: List[RoundRecord] = []
    error: Optional[str] = None
    logs: List[str] = []
