# tests/test_runner.py

import pytest
from unittest.mock import MagicMock, patch
from src.orchestrator.runner import ArenaRunner
from src.core.schemas import ArenaState
from pydantic import SecretStr

@pytest.mark.asyncio
async def test_runner_run_stream_flow():
    """Test that run_stream yields events correctly."""
    
    # 1. Mock the graph
    mock_compiled_graph = MagicMock()
    
    # Mock the async generator returned by astream
    async def mock_stream(*args, **kwargs):
        # Yield mock state dicts
        yield {"state": "JUDGING"}
        yield {"state": "DEFENDING"}
        yield {"state": "DONE"}
        
    mock_compiled_graph.astream = mock_stream
    
    # 2. Patch build_arena_graph
    with patch("src.orchestrator.runner.build_arena_graph", return_value=mock_compiled_graph):
        runner = ArenaRunner()
        
        # 3. Collect events
        events = []
        async for event in runner.run_stream(secret="test", max_rounds=1):
            events.append(event)
            
        # 4. Assertions
        assert len(events) == 3
        assert events[-1]["state"] == "DONE"

@pytest.mark.asyncio
async def test_runner_run_sync_wrapper():
    """Test the run() wrapper calls ainvoke."""
    mock_graph = MagicMock()
    
    # Setup mock ainvoke result
    final_state_dict = {
        "run_id": "test", 
        "state": "DONE", 
        "status": "SECURE",
        "target_secret": "test",
        "system_prompt": "prompt",
        "current_round": 1,
        "max_rounds": 3,
        "rounds": [],
        "logs": []
    }
    
    # AsyncMock for ainvoke
    from unittest.mock import AsyncMock
    mock_graph.ainvoke = AsyncMock(return_value=final_state_dict)
    
    with patch("src.orchestrator.runner.build_arena_graph", return_value=mock_graph):
        runner = ArenaRunner()
        result = await runner.run(secret="test")
        
        assert isinstance(result, ArenaState)
        assert result.state == "DONE"
        mock_graph.ainvoke.assert_called_once()