# src/api/models.py

from enum import Enum
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RunStatus(str, Enum):
    """Status of an arena run."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class StartRunRequest(BaseModel):
    """Request schema for starting a new arena run."""

    secret: str = Field(
        ..., description="The secret the attacker tries to extract", max_length=100
    )
    system_prompt: str = Field(
        ..., description="The initial system prompt for the target", max_length=10000
    )
    max_rounds: int = Field(3, description="Maximum number of rounds")


class RunResponse(BaseModel):
    """Response schema for run information."""

    run_id: UUID
    status: RunStatus
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class StartRunResponse(BaseModel):
    """Response schema for starting a run."""

    run_id: UUID
    status: RunStatus = RunStatus.PENDING
    message: str = "Run started successfully"
