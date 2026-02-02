# src/api/agent_routes.py
"""
API endpoints for agent testing mode.
Allows external clients to submit agent events, run evaluations, and retrieve reports.
"""

import logging
from collections import deque
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field, SecretStr

from src.api.security import rate_limit_dependency, verify_bearer_token
from src.core.agent_schemas import (
    AgentEvent,
    AgentJudgeScore,
    ToolCallEvent,
    MemoryAccessEvent,
    ActionRecord,
    SpeechRecord,
    DivergenceEvent,
)
from src.core.agent_report import AgentSecurityReport
from src.agents.agent_judge import AgentJudge, AgentJudgeConfig
from src.agents.judge import JudgeAgent
from src.reports.agent_report_generator import AgentReportGenerator

logger = logging.getLogger(__name__)

# Router setup
router = APIRouter(prefix="/agent", tags=["agent"])

# ============================================================
# Constants
# ============================================================
MAX_EVENTS_PER_SESSION = 1000
MAX_SESSIONS = 100  # Prevent unbounded memory growth


# ============================================================
# Session Status Enum
# ============================================================
class SessionStatus(str, Enum):
    """Status of an agent testing session."""

    ACTIVE = "active"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================
# Request/Response Models
# ============================================================
class CreateSessionRequest(BaseModel):
    """Request schema for creating a new agent testing session."""

    context: Optional[str] = Field(
        None,
        max_length=50000,
        description="Optional context/conversation history for evaluation",
    )
    target_secret: Optional[str] = Field(
        None, max_length=500, description="Optional secret to check for leakage"
    )


class CreateSessionResponse(BaseModel):
    """Response schema for session creation."""

    session_id: UUID
    status: SessionStatus = SessionStatus.ACTIVE
    message: str = "Agent testing session created successfully"


class SubmitEventsRequest(BaseModel):
    """Request schema for submitting agent events."""

    events: List[Dict[str, Any]] = Field(
        ..., min_length=1, max_length=100, description="List of agent events to submit"
    )


class SubmitEventsResponse(BaseModel):
    """Response schema for event submission."""

    session_id: UUID
    events_accepted: int
    total_events: int
    message: str = "Events submitted successfully"


class EvaluateRequest(BaseModel):
    """Request schema for triggering evaluation."""

    config: Optional[Dict[str, Any]] = Field(
        None, description="Optional AgentJudgeConfig overrides"
    )


class EvaluateResponse(BaseModel):
    """Response schema for evaluation trigger."""

    session_id: UUID
    status: SessionStatus
    message: str = "Evaluation started"


class GetEventsResponse(BaseModel):
    """Response schema for retrieving events."""

    session_id: UUID
    events: List[Dict[str, Any]]
    total_count: int


class GetScoreResponse(BaseModel):
    """Response schema for retrieving score."""

    session_id: UUID
    score: Optional[Dict[str, Any]] = None
    status: SessionStatus
    error: Optional[str] = None


class GetReportResponse(BaseModel):
    """Response schema for retrieving report."""

    session_id: UUID
    report: Optional[Dict[str, Any]] = None
    markdown: Optional[str] = None
    status: SessionStatus
    error: Optional[str] = None


class DeleteSessionResponse(BaseModel):
    """Response schema for session deletion."""

    session_id: UUID
    message: str = "Session deleted successfully"


class SessionInfoResponse(BaseModel):
    """Response schema for session status check."""

    session_id: UUID
    status: SessionStatus
    event_count: int
    has_score: bool
    has_report: bool


# ============================================================
# Global State (In-Memory for MVP)
# ============================================================
# NOTE: For production, replace with Redis or database-backed storage
_sessions: Dict[UUID, Dict[str, Any]] = {}


def _cleanup_oldest_session() -> None:
    """Remove oldest session if at capacity."""
    if len(_sessions) >= MAX_SESSIONS:
        # Find oldest session by tracking order (simple FIFO)
        oldest_id = next(iter(_sessions))
        logger.warning(f"Session limit reached, removing oldest session: {oldest_id}")
        del _sessions[oldest_id]


def _get_session(session_id: UUID) -> Dict[str, Any]:
    """Get session or raise 404."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return _sessions[session_id]


def _verify_session_ownership(session_id: UUID, owner: str) -> Dict[str, Any]:
    """Verify session exists and belongs to the requesting user."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    session = _sessions[session_id]
    if session.get("owner") != owner:
        # Return 404 to avoid leaking existence of other users' sessions
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return session


def _parse_event(event_data: Dict[str, Any], session_id: UUID) -> Optional[AgentEvent]:
    """
    Parse event dictionary into typed AgentEvent.
    Returns None if parsing fails (event will be logged but not stored).
    """
    event_type = event_data.get("event_type")

    # Inject session_id if not present
    if "session_id" not in event_data:
        event_data["session_id"] = session_id

    try:
        if event_type == "tool_call":
            return ToolCallEvent(**event_data)
        elif event_type == "memory_access":
            return MemoryAccessEvent(**event_data)
        elif event_type == "action":
            return ActionRecord(**event_data)
        elif event_type == "speech":
            return SpeechRecord(**event_data)
        elif event_type == "divergence":
            return DivergenceEvent(**event_data)
        else:
            logger.warning(f"Unknown event_type: {event_type}")
            return None
    except Exception as e:
        logger.warning(f"Failed to parse event: {e}")
        return None


def _sanitize_score_for_response(score: AgentJudgeScore) -> Dict[str, Any]:
    """Convert AgentJudgeScore to safe dict for API response."""
    # Use model_dump and sanitize any sensitive fields
    data = score.model_dump(mode="json")

    # Remove full divergence event details, keep summary
    if "divergence_examples" in data:
        data["divergence_examples"] = [
            {
                "severity": ex.get("severity"),
                "speech_intent": ex.get("speech_intent", "")[:100],
                "actual_action": ex.get("actual_action", "")[:100],
            }
            for ex in data.get("divergence_examples", [])
        ]

    return data


def _sanitize_report_for_response(report: AgentSecurityReport) -> Dict[str, Any]:
    """Convert AgentSecurityReport to safe dict for API response."""
    return report.model_dump(mode="json")


async def _run_evaluation(session_id: UUID) -> None:
    """Background task to run evaluation."""
    session = _sessions.get(session_id)
    if not session:
        logger.error(f"Session {session_id} not found for evaluation")
        return

    try:
        session["status"] = SessionStatus.EVALUATING

        events: List[AgentEvent] = session.get("events", [])
        context: Optional[str] = session.get("context")
        target_secret: Optional[str] = session.get("target_secret")
        config_dict: Optional[Dict[str, Any]] = session.get("eval_config")

        # Build config
        config = AgentJudgeConfig(**config_dict) if config_dict else None

        # Initialize judge (using default JudgeAgent)
        base_judge = JudgeAgent()
        agent_judge = AgentJudge(judge=base_judge, config=config)

        # Run evaluation
        secret_str = SecretStr(target_secret) if target_secret else None
        score = await agent_judge.evaluate_agent_async(
            events=events, context=context, target_secret=secret_str
        )

        session["score"] = score

        # Generate report
        report_generator = AgentReportGenerator()
        report = report_generator.generate(score, events)
        session["report"] = report
        session["report_markdown"] = report.to_markdown()

        session["status"] = SessionStatus.COMPLETED
        logger.info(f"Evaluation completed for session {session_id}")

    except Exception as e:
        logger.error(f"Evaluation failed for session {session_id}: {e}", exc_info=True)
        session["status"] = SessionStatus.FAILED
        session["error"] = str(e)


# ============================================================
# Endpoints
# ============================================================


@router.post("/session", response_model=CreateSessionResponse, status_code=201)
async def create_session(
    request: CreateSessionRequest,
    _: None = Depends(rate_limit_dependency),
    user_id: str = Depends(verify_bearer_token),
) -> CreateSessionResponse:
    """
    Create a new agent testing session.
    Sessions are scoped to the authenticated user.

    Returns a session_id to use for subsequent operations.
    """
    _cleanup_oldest_session()

    session_id = uuid4()
    _sessions[session_id] = {
        "session_id": session_id,
        "owner": user_id,
        "status": SessionStatus.ACTIVE,
        "events": [],
        "context": request.context,
        "target_secret": request.target_secret,
        "score": None,
        "report": None,
        "report_markdown": None,
        "error": None,
        "eval_config": None,
    }

    logger.info(f"Created agent testing session: {session_id}")
    return CreateSessionResponse(session_id=session_id)


@router.post("/session/{session_id}/events", response_model=SubmitEventsResponse)
async def submit_events(
    session_id: UUID,
    request: SubmitEventsRequest,
    _: None = Depends(rate_limit_dependency),
    user_id: str = Depends(verify_bearer_token),
) -> SubmitEventsResponse:
    """
    Submit agent events to a session. Only accessible by the session owner.

    Events are validated and stored for later evaluation.
    """
    session = _verify_session_ownership(session_id, user_id)

    if session["status"] != SessionStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit events to session in '{session['status']}' state",
        )

    events_list: List[AgentEvent] = session["events"]
    events_accepted = 0

    for event_data in request.events:
        if len(events_list) >= MAX_EVENTS_PER_SESSION:
            logger.warning(f"Session {session_id} reached max events limit")
            break

        parsed = _parse_event(event_data, session_id)
        if parsed:
            events_list.append(parsed)
            events_accepted += 1

    return SubmitEventsResponse(
        session_id=session_id,
        events_accepted=events_accepted,
        total_events=len(events_list),
        message=f"Accepted {events_accepted} of {len(request.events)} events",
    )


@router.post(
    "/session/{session_id}/evaluate", response_model=EvaluateResponse, status_code=202
)
async def evaluate_session(
    session_id: UUID,
    request: EvaluateRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(rate_limit_dependency),
    user_id: str = Depends(verify_bearer_token),
) -> EvaluateResponse:
    """
    Trigger evaluation for a session. Only accessible by the session owner.

    Evaluation runs in the background. Poll /session/{session_id}/score for results.
    """
    session = _verify_session_ownership(session_id, user_id)

    if session["status"] not in (SessionStatus.ACTIVE, SessionStatus.FAILED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot evaluate session in '{session['status']}' state",
        )

    if not session["events"]:
        raise HTTPException(
            status_code=400, detail="No events to evaluate. Submit events first."
        )

    # Store config if provided
    if request.config:
        session["eval_config"] = request.config

    # Clear previous results if re-evaluating
    session["score"] = None
    session["report"] = None
    session["report_markdown"] = None
    session["error"] = None

    background_tasks.add_task(_run_evaluation, session_id)

    return EvaluateResponse(
        session_id=session_id,
        status=SessionStatus.EVALUATING,
        message="Evaluation started. Poll /score endpoint for results.",
    )


@router.get("/session/{session_id}/events", response_model=GetEventsResponse)
async def get_events(
    session_id: UUID,
    limit: int = 100,
    offset: int = 0,
    _: None = Depends(rate_limit_dependency),
    user_id: str = Depends(verify_bearer_token),
) -> GetEventsResponse:
    """
    Retrieve events for a session. Only accessible by the session owner.

    Supports pagination via limit and offset parameters.
    """
    session = _verify_session_ownership(session_id, user_id)
    events: List[AgentEvent] = session["events"]

    # Paginate
    paginated = events[offset : offset + limit]

    # Convert to dicts for response
    events_data = [e.model_dump(mode="json") for e in paginated]

    return GetEventsResponse(
        session_id=session_id, events=events_data, total_count=len(events)
    )


@router.get("/session/{session_id}/score", response_model=GetScoreResponse)
async def get_score(
    session_id: UUID,
    _: None = Depends(rate_limit_dependency),
    user_id: str = Depends(verify_bearer_token),
) -> GetScoreResponse:
    """
    Get the evaluation score for a session. Only accessible by the session owner.

    Returns null score if evaluation is still in progress.
    """
    session = _verify_session_ownership(session_id, user_id)

    score_data = None
    if session["score"]:
        score_data = _sanitize_score_for_response(session["score"])

    return GetScoreResponse(
        session_id=session_id,
        score=score_data,
        status=session["status"],
        error=session.get("error"),
    )


@router.get("/session/{session_id}/report", response_model=GetReportResponse)
async def get_report(
    session_id: UUID,
    format: str = "json",
    _: None = Depends(rate_limit_dependency),
    user_id: str = Depends(verify_bearer_token),
) -> GetReportResponse:
    """
    Get the full security report for a session. Only accessible by the session owner.

    Supports format parameter: 'json' (default) or 'markdown'.
    """
    session = _verify_session_ownership(session_id, user_id)

    report_data = None
    markdown_data = None

    if session["report"]:
        if format == "markdown":
            markdown_data = session.get("report_markdown")
        else:
            report_data = _sanitize_report_for_response(session["report"])

    return GetReportResponse(
        session_id=session_id,
        report=report_data,
        markdown=markdown_data,
        status=session["status"],
        error=session.get("error"),
    )


@router.delete("/session/{session_id}", response_model=DeleteSessionResponse)
async def delete_session(
    session_id: UUID,
    _: None = Depends(rate_limit_dependency),
    user_id: str = Depends(verify_bearer_token),
) -> DeleteSessionResponse:
    """
    Delete a session and all associated data. Only accessible by the session owner.
    """
    _verify_session_ownership(session_id, user_id)

    del _sessions[session_id]
    logger.info(f"Deleted agent testing session: {session_id}")

    return DeleteSessionResponse(session_id=session_id)


@router.get("/session/{session_id}", response_model=SessionInfoResponse)
async def get_session_info(
    session_id: UUID,
    _: None = Depends(rate_limit_dependency),
    user_id: str = Depends(verify_bearer_token),
) -> SessionInfoResponse:
    """
    Get session status and summary information. Only accessible by the session owner.
    """
    session = _verify_session_ownership(session_id, user_id)

    return SessionInfoResponse(
        session_id=session_id,
        status=session["status"],
        event_count=len(session["events"]),
        has_score=session["score"] is not None,
        has_report=session["report"] is not None,
    )
