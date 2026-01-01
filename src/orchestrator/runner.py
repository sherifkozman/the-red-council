# src/orchestrator/runner.py

from src.core.schemas import ArenaState
from src.orchestrator.graph import build_arena_graph
from pydantic import SecretStr
import uuid
from typing import AsyncGenerator, Dict, Any


class ArenaRunner:
    def __init__(self):
        self.graph = build_arena_graph()

    def create_initial_state(
        self,
        secret: str,
        system_prompt: str = "You are a helpful assistant.",
        max_rounds: int = 3,
    ) -> ArenaState:
        from datetime import datetime

        timestamp = datetime.utcnow().strftime("%H:%M:%S")
        initial_logs = [
            f"[{timestamp}] Arena initialized. Max rounds: {max_rounds}",
            f"[{timestamp}] Target system prompt loaded ({len(system_prompt)} chars)",
            f"[{timestamp}] Secret injected. Beginning adversarial simulation...",
        ]
        return ArenaState(
            run_id=str(uuid.uuid4()),
            state="ATTACKING",
            status="ONGOING",
            target_secret=SecretStr(secret),
            system_prompt=system_prompt,
            initial_target_prompt=system_prompt,
            current_round=1,
            max_rounds=max_rounds,
            rounds=[],
            logs=initial_logs,
        )

    async def run(
        self,
        secret: str,
        system_prompt: str = "You are a helpful assistant.",
        max_rounds: int = 3,
    ) -> ArenaState:
        """
        Runs the arena to completion.
        """
        initial_state = self.create_initial_state(secret, system_prompt, max_rounds)
        result = await self.graph.ainvoke(initial_state, {"recursion_limit": 50})

        if isinstance(result, dict):
            return ArenaState(**result)
        return result

    async def run_stream(
        self,
        secret: str,
        system_prompt: str = "You are a helpful assistant.",
        max_rounds: int = 3,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Runs the arena and yields full state after each node.
        Uses stream_mode="values" to get complete ArenaState, not just node outputs.
        """
        initial_state = self.create_initial_state(secret, system_prompt, max_rounds)
        async for state in self.graph.astream(
            initial_state, {"recursion_limit": 50}, stream_mode="values"
        ):
            # state is the full ArenaState dict after each node execution
            if hasattr(state, "model_dump"):
                # Pydantic model - serialize with mode='json' for proper datetime handling
                yield state.model_dump(mode="json")
            elif isinstance(state, dict):
                # Already a dict - convert any nested Pydantic models
                yield self._serialize_state(state)
            else:
                yield dict(state)

    def _serialize_state(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively serialize state dict, handling Pydantic models and datetime."""
        from datetime import datetime

        result = {}
        for key, value in state.items():
            if hasattr(value, "model_dump"):
                result[key] = value.model_dump(mode="json")
            elif isinstance(value, list):
                result[key] = [
                    item.model_dump(mode="json")
                    if hasattr(item, "model_dump")
                    else (item.isoformat() if isinstance(item, datetime) else item)
                    for item in value
                ]
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            else:
                result[key] = value
        return result
