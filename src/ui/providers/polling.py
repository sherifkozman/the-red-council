# src/ui/providers/polling.py

from typing import AsyncGenerator
from src.core.schemas import ArenaState
from src.orchestrator.runner import ArenaRunner
from pydantic import SecretStr
import uuid


async def run_arena_stream(
    secret: str, system_prompt: str, max_rounds: int = 3
) -> AsyncGenerator[ArenaState, None]:
    """
    Runs the arena and yields state updates after each step.
    """
    runner = ArenaRunner()

    current_state = ArenaState(
        run_id=str(uuid.uuid4()),
        state="ATTACKING",
        status="ONGOING",
        target_secret=SecretStr(secret),
        system_prompt=system_prompt,
        initial_target_prompt=system_prompt,
        current_round=1,
        max_rounds=max_rounds,
        rounds=[],
    )

    # Use astream for real-time updates
    async for chunk in runner.graph.astream(current_state, {"recursion_limit": 50}):
        for node_name, updates in chunk.items():
            # Update state immutably using Pydantic's model_copy
            # Note: Pydantic v2 uses model_copy(update=...)
            current_state = current_state.model_copy(update=updates)

            yield current_state
