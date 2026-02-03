# src/test_agents/http_server.py
"""
HTTP Server wrapper for VulnerableTestAgent.
Provides OpenAI-compatible chat endpoint for testing.

This server wraps the VulnerableTestAgent in a FastAPI HTTP server,
allowing external tools and the Red Council frontend to interact
with the vulnerable agent over HTTP.

WARNING: This server is for TESTING ONLY. It intentionally exposes
security vulnerabilities for red-team testing purposes.
"""

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.test_agents.vulnerable_agent import VulnerableTestAgent

logger = logging.getLogger(__name__)

# Session storage (in-memory for testing)
_agents: dict[str, VulnerableTestAgent] = {}
MAX_SESSIONS = 100


class ChatMessage(BaseModel):
    """OpenAI-compatible chat message."""

    role: str
    content: str


class ChatRequest(BaseModel):
    """OpenAI-compatible chat completion request."""

    messages: list[ChatMessage]
    model: str = "vulnerable-test-agent"
    session_id: str | None = None
    stream: bool = False  # Not implemented yet


class ChatChoice(BaseModel):
    """OpenAI-compatible chat choice."""

    index: int = 0
    message: ChatMessage
    finish_reason: str = "stop"


class ChatResponse(BaseModel):
    """OpenAI-compatible chat completion response with events."""

    id: str
    object: str = "chat.completion"
    model: str = "vulnerable-test-agent"
    choices: list[ChatChoice]
    session_id: str
    events: list[dict[str, Any]] = Field(default_factory=list)


class EventsResponse(BaseModel):
    """Response for session events endpoint."""

    session_id: str
    events: list[dict[str, Any]]
    total_count: int


class SessionInfo(BaseModel):
    """Session information."""

    session_id: str
    event_count: int
    tool_call_count: int
    emails_sent: int
    commands_executed: int


class SessionsResponse(BaseModel):
    """Response for list sessions endpoint."""

    sessions: list[SessionInfo]


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"
    agent_type: str = "vulnerable-test-agent"
    owasp_categories: list[str] = Field(
        default=["ASI01", "ASI02", "ASI04", "ASI06", "ASI07"]
    )
    description: str = "Intentionally vulnerable agent for security testing"


def _cleanup_oldest_session() -> None:
    """Remove oldest session if at capacity."""
    if len(_agents) >= MAX_SESSIONS:
        oldest_id = next(iter(_agents))
        logger.warning(f"Session limit reached, removing oldest: {oldest_id}")
        del _agents[oldest_id]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Starting Vulnerable Test Agent HTTP Server")
    logger.info("WARNING: This server contains intentional security vulnerabilities!")
    yield
    _agents.clear()
    logger.info("Shutting down Vulnerable Test Agent HTTP Server")


# Create FastAPI app
app = FastAPI(
    title="Vulnerable Test Agent",
    description="""
    Intentionally vulnerable agent for security testing.

    This agent has the following OWASP Agentic Top 10 vulnerabilities:
    - ASI01: Excessive Agency (no tool call limits)
    - ASI02: Inadequate Human Oversight (no confirmation for dangerous actions)
    - ASI04: Indirect Prompt Injection (processes injected instructions)
    - ASI06: Data Disclosure (returns sensitive data in queries)
    - ASI07: Insecure Long-Term Memory (accepts writes to system keys)

    **WARNING**: For testing purposes only!
    """,
    version="0.1.0",
    lifespan=lifespan,
)

# Enable CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns the agent type and list of testable OWASP categories.
    """
    return HealthResponse()


@app.post("/v1/chat/completions", response_model=ChatResponse)
async def chat_completions(request: ChatRequest) -> ChatResponse:
    """
    OpenAI-compatible chat completions endpoint.

    Processes messages through VulnerableTestAgent and returns
    both the response and all events generated during processing.

    The `events` field in the response contains all security-relevant
    events (tool calls, memory access, actions, speech) for evaluation.
    """
    _cleanup_oldest_session()

    # Get or create agent for session
    session_id = request.session_id or str(uuid4())

    if session_id not in _agents:
        try:
            # Validate session_id is a valid UUID
            session_uuid = UUID(session_id)
        except ValueError:
            # Generate new UUID if invalid
            session_uuid = uuid4()
            session_id = str(session_uuid)

        _agents[session_id] = VulnerableTestAgent(session_id=session_uuid)
        logger.info(f"Created new agent session: {session_id}")

    agent = _agents[session_id]

    # Get the last user message
    user_message = next(
        (m.content for m in reversed(request.messages) if m.role == "user"),
        "",
    )

    if not user_message:
        raise HTTPException(status_code=400, detail="No user message found in request")

    # Record starting event count to return only new events
    start_event_count = len(agent.get_events())

    # Run the agent (synchronous, but wrapped for async compatibility)
    response_text = agent.run(user_message)

    # Get events generated during this run
    all_events = agent.get_events()
    new_events = all_events[start_event_count:]
    events_data = [e.model_dump(mode="json") for e in new_events]

    return ChatResponse(
        id=f"chatcmpl-{uuid4().hex[:12]}",
        model=request.model,
        choices=[
            ChatChoice(
                message=ChatMessage(role="assistant", content=response_text),
            )
        ],
        session_id=session_id,
        events=events_data,
    )


@app.get("/v1/sessions/{session_id}/events", response_model=EventsResponse)
async def get_session_events(
    session_id: str,
    limit: int = 100,
    offset: int = 0,
) -> EventsResponse:
    """
    Get all events for a session.

    Supports pagination via limit and offset parameters.
    """
    if session_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    agent = _agents[session_id]
    all_events = agent.get_events()

    # Paginate
    paginated = all_events[offset : offset + limit]
    events_data = [e.model_dump(mode="json") for e in paginated]

    return EventsResponse(
        session_id=session_id,
        events=events_data,
        total_count=len(all_events),
    )


@app.get("/v1/sessions/{session_id}/events/stream")
async def stream_session_events(session_id: str) -> StreamingResponse:
    """
    Server-Sent Events endpoint for real-time event streaming.

    Clients can connect to receive events as they occur.
    New events are pushed as they are recorded by the agent.
    """
    if session_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    async def event_generator():
        agent = _agents.get(session_id)
        last_count = 0

        while agent and session_id in _agents:
            events = agent.get_events()
            if len(events) > last_count:
                # Send new events
                for event in events[last_count:]:
                    data = json.dumps(event.model_dump(mode="json"))
                    yield f"data: {data}\n\n"
                last_count = len(events)

            await asyncio.sleep(0.1)  # Poll every 100ms

        yield "event: close\ndata: session ended\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.delete("/v1/sessions/{session_id}")
async def delete_session(session_id: str) -> dict[str, str]:
    """Delete a session and its agent."""
    if session_id in _agents:
        del _agents[session_id]
        logger.info(f"Deleted session: {session_id}")
    return {"message": "Session deleted", "session_id": session_id}


@app.get("/v1/sessions", response_model=SessionsResponse)
async def list_sessions() -> SessionsResponse:
    """List all active sessions with their statistics."""
    sessions = [
        SessionInfo(
            session_id=sid,
            event_count=len(agent.get_events()),
            tool_call_count=agent.get_tool_call_count(),
            emails_sent=len(agent.get_emails_sent()),
            commands_executed=len(agent.get_commands_executed()),
        )
        for sid, agent in _agents.items()
    ]
    return SessionsResponse(sessions=sessions)


@app.post("/v1/sessions/{session_id}/reset")
async def reset_session(session_id: str) -> dict[str, str]:
    """Reset a session's agent state (clear events, memory, etc.)."""
    if session_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    agent = _agents[session_id]
    agent.clear_events()
    agent.memory.clear()
    agent._emails_sent.clear()
    agent._commands_executed.clear()

    return {"message": "Session reset", "session_id": session_id}


# CLI entry point
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.test_agents.http_server:app",
        host="0.0.0.0",
        port=8080,
        reload=False,
        log_level="info",
    )
