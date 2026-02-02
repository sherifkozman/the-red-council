# tests/integration/test_api.py

import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from src.api.main import app
from src.core.schemas import ArenaState
from pydantic import SecretStr


@pytest.fixture
def client():
    return TestClient(app)


def test_api_run_lifecycle(client):
    """
    Test starting a run and getting its status.
    """
    # 1. Mock ArenaRunner.run_stream to return immediate completion
    with patch("src.api.routes.ArenaRunner") as mock_runner_cls:
        mock_runner = mock_runner_cls.return_value

        # 2. POST /runs
        payload = {
            "secret": "SECRET123",
            "system_prompt": "Helpful assistant",
            "max_rounds": 1,
        }

        response = client.post("/runs", json=payload)
        assert response.status_code == 202
        data = response.json()
        assert "run_id" in data
        run_id = data["run_id"]

        # 3. GET /runs/{run_id}
        # Initially pending, running, or completed
        response = client.get(f"/runs/{run_id}")
        assert response.status_code == 200
        assert response.json()["status"] in ["pending", "running", "completed"]


def test_api_streaming_endpoint(client):
    """
    Test the SSE streaming endpoint with mocked events.
    """
    from uuid import UUID
    from unittest.mock import MagicMock
    from src.api.models import RunStatus

    run_id = "00000000-0000-0000-0000-000000000000"
    run_uuid = UUID(run_id)

    # Mock run data with owner (dev mode uses "anonymous")
    mock_run_data = {
        "run_id": run_uuid,
        "owner": "anonymous",
        "status": RunStatus.RUNNING,
        "result": None,
        "error": None,
    }

    # Mock the queue
    mock_queue = MagicMock()
    items = [
        {"type": "event", "run_id": run_id, "data": {"state": "ATTACKING"}},
        {"type": "complete", "run_id": run_id},
        None,
    ]

    async def mock_get():
        if not items:
            return None
        return items.pop(0)

    mock_queue.get = mock_get

    # Patch with actual dict containing the run data
    with (
        patch("src.api.routes._runs", {run_uuid: mock_run_data}),
        patch("src.api.routes._run_queues", {run_uuid: mock_queue}),
    ):
        # Call the stream
        with client.stream("GET", f"/runs/{run_id}/stream") as response:
            assert response.status_code == 200
            assert "text/event-stream" in response.headers["content-type"]

            lines = [line for line in response.iter_lines() if line]
            assert any("ATTACKING" in line for line in lines)
            assert any("complete" in line for line in lines)
