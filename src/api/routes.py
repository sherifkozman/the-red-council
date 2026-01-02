# src/api/routes.py

import asyncio
import json
import logging
from uuid import UUID, uuid4
from typing import Any, Dict
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from src.api.models import StartRunRequest, StartRunResponse, RunResponse, RunStatus
from src.orchestrator.runner import ArenaRunner

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/runs", tags=["runs"])

# Global state
_runs: Dict[UUID, Dict[str, Any]] = {}
_run_queues: Dict[UUID, asyncio.Queue[Dict[str, Any]]] = {}


def sanitize_event(event: Any) -> Any:
    """Recursively remove sensitive fields like target_secret."""
    if isinstance(event, dict):
        return {k: sanitize_event(v) for k, v in event.items() if k != "target_secret"}
    elif isinstance(event, list):
        return [sanitize_event(i) for i in event]
    return event


def _get_or_create_queue(run_id: UUID) -> asyncio.Queue:
    if run_id not in _run_queues:
        # HIGH-002: Bounded queue to prevent memory exhaustion
        _run_queues[run_id] = asyncio.Queue(maxsize=100)
    return _run_queues[run_id]


async def _execute_run(
    run_id: UUID, secret: str, system_prompt: str, max_rounds: int
) -> None:
    """Execute arena run in background and stream events."""
    _runs[run_id]["status"] = RunStatus.RUNNING
    queue = _get_or_create_queue(run_id)

    try:
        runner = ArenaRunner()
        # Use run_stream to get events
        async for event in runner.run_stream(
            secret=secret, system_prompt=system_prompt, max_rounds=max_rounds
        ):
            # MED-002: Sanitize event before enqueuing
            safe_event = sanitize_event(event)
            
            # Update global state for polling
            _runs[run_id]["result"] = safe_event

            # Enqueue event for SSE
            await queue.put(
                {
                    "type": "event",
                    "run_id": str(run_id),
                    "data": safe_event,  # LangGraph event (dict)
                }
            )

        _runs[run_id]["status"] = RunStatus.COMPLETED
        await queue.put({"type": "complete", "run_id": str(run_id)})

    except asyncio.CancelledError:
        _runs[run_id]["status"] = RunStatus.FAILED
        await queue.put({"type": "error", "run_id": str(run_id), "error": "Cancelled"})

    except Exception as e:
        _runs[run_id]["status"] = RunStatus.FAILED
        error_msg = str(e).replace(secret, "[REDACTED]")
        _runs[run_id]["error"] = error_msg
        await queue.put({"type": "error", "run_id": str(run_id), "error": error_msg})


@router.post("", response_model=StartRunResponse, status_code=202)
async def start_run(
    request: StartRunRequest, background_tasks: BackgroundTasks
) -> StartRunResponse:
    """
    Start a new arena run.
    NOTE: Access control is not implemented for Hackathon MVP (Known IDOR risk).
    """
    run_id = uuid4()

    # Initialize run state
    _runs[run_id] = {
        "run_id": run_id,
        "status": RunStatus.PENDING,
        "result": None,
        "error": None,
    }

    # Pre-create queue to capture early events
    _get_or_create_queue(run_id)

    background_tasks.add_task(
        _execute_run, run_id, request.secret, request.system_prompt, request.max_rounds
    )

    return StartRunResponse(run_id=run_id)


@router.get("/{run_id}", response_model=RunResponse)
async def get_run_status(run_id: UUID) -> RunResponse:
    """Get status of an arena run (Polling)."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    
    run_data = _runs[run_id]
    return RunResponse(
        run_id=run_id,
        status=run_data.get("status", RunStatus.FAILED),
        result=run_data.get("result"),
        error=run_data.get("error")
    )


@router.get("/{run_id}/stream")
async def stream_run(run_id: UUID, request: Request) -> StreamingResponse:
    """Stream run events (SSE)."""
    if run_id not in _runs:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")

    queue = _get_or_create_queue(run_id)
    start_time = asyncio.get_event_loop().time()
    MAX_DURATION = 1800  # MED-004: 30 minute max duration

    async def event_generator():
        try:
            while True:
                # Check disconnect
                if await request.is_disconnected():
                    logger.info(f"Client disconnected from {run_id}")
                    break

                # Check timeout
                if asyncio.get_event_loop().time() - start_time > MAX_DURATION:
                    yield f"data: {json.dumps({'type': 'timeout', 'run_id': str(run_id)})}\n\n"
                    break

                try:
                    # Wait for event
                    event = await asyncio.wait_for(queue.get(), timeout=5.0)

                    if event is None:
                        break

                    # Format SSE
                    yield f"data: {json.dumps(event, default=str)}\n\n"

                    if event.get("type") in ("complete", "error"):
                        break

                except asyncio.TimeoutError:
                    # Keep-alive
                    yield ": keepalive\n\n"
                    continue

        finally:
            # LOW-001: Safe cleanup
            _run_queues.pop(run_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # HIGH-003: Headers from spec
        },
    )
