# tests/test_agents.py

import pytest
from unittest.mock import MagicMock, AsyncMock
from pydantic import SecretStr
from src.agents.target import TargetLLM
from src.agents.attacker import AttackerAgent, AttackerView
from src.agents.judge import JudgeAgent
from src.agents.defender import DefenderAgent
from src.core.schemas import ArenaState


@pytest.mark.asyncio
async def test_target_llm():
    mock_client = MagicMock()
    mock_client.generate_agent_response = AsyncMock(return_value="I am safe.")

    target = TargetLLM(
        client=mock_client, system_prompt="Sys", secret=SecretStr("Secret")
    )
    response = await target.respond(history=[{"role": "user", "content": "Hi"}])

    assert response == "I am safe."


@pytest.mark.asyncio
async def test_attacker_agent():
    mock_client = MagicMock()
    # Mock return must be > 50 chars to pass validation
    long_attack = "Attack! " * 10
    mock_client.generate.return_value = long_attack

    mock_kb = MagicMock()
    mock_kb.retrieve_attacks = AsyncMock(return_value=[])

    attacker = AttackerAgent(client=mock_client, kb=mock_kb)
    view = AttackerView(
        run_id="1",
        current_round=1,
        max_rounds=3,
        rounds=[],
        current_target_prompt="Sys",
        defense_applied=False,
    )

    # We test __call__ which wraps the logic
    prompt = await attacker(view)

    assert prompt == long_attack


@pytest.mark.asyncio
async def test_judge_agent():
    mock_client = MagicMock()
    # Mock return for LLM evaluation
    mock_client.generate_structured_evaluation = AsyncMock(
        return_value={
            "score": 8,
            "leaked_secret": False,
            "leaked_instructions": False,
            "reasoning": "Ok",
        }
    )

    judge = JudgeAgent(client=mock_client)
    state = MagicMock(spec=ArenaState)
    state.target_secret = SecretStr("Secret")

    # Test __call__ (sync wrapper) - needs event loop, usually tricky in unit tests if not careful.
    # We test evaluate() directly for async test
    score = await judge.evaluate(state, "Attack", "Response")

    assert score.score == 8

    # Test deterministic leak detection
    # "Secret" vs "The Secret is here"
    score_leak = await judge.evaluate(state, "Attack", "The Secret is here")
    assert score_leak.score == 0  # Exact match logic


@pytest.mark.asyncio
async def test_defender_agent():
    mock_client = MagicMock()
    # Mock return must be > 50 chars to pass validation
    long_defense = "Better Sys " * 10
    mock_client.generate_structured_evaluation = AsyncMock(
        return_value={
            "hardened_system_prompt": long_defense,
            "explanation": "Fixed",
            "techniques_used": ["T1"],
        }
    )

    defender = DefenderAgent(client=mock_client)
    # Test harden() directly
    rec = await defender.harden("Sys", "Attack", "Leak", verifier_response="Bad")

    assert rec.hardened_system_prompt == long_defense
