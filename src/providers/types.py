# src/providers/types.py

import os
from enum import Enum
from typing import TypedDict, Optional, Any, Dict
from typing_extensions import NotRequired
from pydantic import BaseModel


class AgentRole(Enum):
    ATTACKER = "attacker"
    JUDGE = "judge"
    DEFENDER = "defender"
    TARGET = "target"


class Message(TypedDict):
    role: str
    content: str
    name: NotRequired[str]


class RoleConfig(BaseModel):
    role: AgentRole
    model_id: str
    temperature: float = 0.7
    max_output_tokens: int = 1024
    safety_settings: Dict[str, Any] = {}
    system_instruction: Optional[str] = None


# Default configurations with Env Var overrides
ROLE_CONFIGS: Dict[AgentRole, RoleConfig] = {
    AgentRole.ATTACKER: RoleConfig(
        role=AgentRole.ATTACKER,
        model_id=os.getenv("RC_ATTACKER_MODEL", "meta/llama-3.1-8b-instruct-maas"),
        temperature=float(os.getenv("RC_ATTACKER_TEMP", "0.9")),
    ),
    AgentRole.JUDGE: RoleConfig(
        role=AgentRole.JUDGE,
        model_id=os.getenv("RC_JUDGE_MODEL", "gemini-3-pro-preview"),
        temperature=float(
            os.getenv("RC_JUDGE_TEMP", "0.1")
        ),  # Deterministic for judging
    ),
    AgentRole.DEFENDER: RoleConfig(
        role=AgentRole.DEFENDER,
        model_id=os.getenv("RC_DEFENDER_MODEL", "gemini-3-pro-preview"),
        temperature=float(os.getenv("RC_DEFENDER_TEMP", "0.4")),
    ),
    AgentRole.TARGET: RoleConfig(
        role=AgentRole.TARGET,
        model_id=os.getenv("RC_TARGET_MODEL", "gemini-3-pro-preview"),
        temperature=float(os.getenv("RC_TARGET_TEMP", "0.7")),
    ),
}
