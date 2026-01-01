# src/knowledge/taxonomy.py

from pydantic import BaseModel, Field
from typing import List, Optional
from src.core.schemas import AttackType, Technique


class AttackArtifact(BaseModel):
    """
    Represents a single attack prompt or template in the Knowledge Base.
    """

    id: str = Field(..., description="Unique ID of the attack artifact")
    prompt_template: str = Field(..., description="The actual attack text or template")
    attack_type: AttackType
    technique: Technique
    source: str = Field(..., description="Origin (e.g., 'HarmBench', 'PyRIT')")
    target_goal: str = Field(
        ...,
        description="What this attack aims to achieve (e.g. 'system_prompt', 'pii')",
    )
    sophistication: int = Field(
        ge=1, le=5, default=1, description="Complexity level (1-5)"
    )
    known_success: bool = Field(
        default=False, description="Whether this is a known working jailbreak"
    )
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    success_rate: float = Field(0.0, description="Historical success rate if known")


class RetrievalResult(BaseModel):
    """Result returned from RAG query."""

    artifact: AttackArtifact
    score: float = Field(..., description="Similarity score")
