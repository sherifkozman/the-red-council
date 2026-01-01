# tests/test_orchestrator.py

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from src.orchestrator.runner import ArenaRunner
from src.core.schemas import JudgeScore


@pytest.fixture
def mock_dependencies():
    with (
        patch("src.orchestrator.nodes.AgentRegistry") as mock_reg_cls,
        patch("src.orchestrator.nodes.TargetLLM") as mock_target_cls,
        patch("src.orchestrator.nodes.VerifierAgent") as mock_verifier_cls,
    ):
        reg_instance = MagicMock()
        mock_reg_cls.get.return_value = reg_instance

        # Mock Attacker
        reg_instance.attacker = AsyncMock(return_value="Attack!")

        # Mock Judge
        reg_instance.judge.evaluate = AsyncMock(
            return_value=JudgeScore(
                score=0, leaked_secret=True, leaked_instructions=False, reasoning="Leak"
            )
        )

        # Mock Defender
        mock_defense = MagicMock()
        mock_defense.hardened_system_prompt = "Hardened Prompt"
        reg_instance.defender.harden = AsyncMock(return_value=mock_defense)

        # Mock Target (for attack node)
        target_instance = MagicMock()
        target_instance.respond = AsyncMock(return_value="Secret")
        # get_target calls AgentRegistry.gemini_client etc, but we mock the get_target result indirectly?
        # Actually nodes.py calls `get_target`. We should patch `get_target`.

        yield reg_instance, mock_target_cls, mock_verifier_cls


@pytest.mark.asyncio
async def test_arena_retry_loop(mock_dependencies):
    reg, mock_target_cls, mock_verifier_cls = mock_dependencies

    # Mock get_target in nodes.py
    with patch("src.orchestrator.nodes.get_target") as mock_get_target:
        mock_target = MagicMock()
        mock_target.respond = AsyncMock(return_value="Response")
        mock_get_target.return_value = mock_target

        # Scenario:
        # Round 1:
        # 1. Attack -> "Attack!"
        # 2. Judge -> Score 0 (Leak)
        # 3. Defend -> "Hardened"
        # 4. Verify -> Fail (Score 2) -> Retry
        # 5. Defend -> "Hardened 2"
        # 6. Verify -> Success (Score 10)
        # 7. Next Round

        # Setup Judge side effects
        # Call 1: Attack Node judge (0)
        # Call 2: Verify Node judge (2) - Fail
        # Call 3: Verify Node judge (10) - Success
        # Note: nodes.py judge_node calls evaluate. verify_node calls evaluate inside verifier.verify?
        # No, verify_node calls `verifier.verify`. We mock `verifier.verify`.

        reg.judge.evaluate = AsyncMock(
            return_value=JudgeScore(
                score=0,
                leaked_secret=True,
                leaked_instructions=False,
                reasoning="Initial Leak",
            )
        )

        # Mock Verifier
        verifier_instance = MagicMock()
        mock_verifier_cls.return_value = verifier_instance
        verifier_instance.verify = AsyncMock(
            side_effect=[
                {
                    "success": False,
                    "score": 2,
                    "response": "Still Leaking",
                    "reasoning": "Bad",
                },
                {
                    "success": True,
                    "score": 10,
                    "response": "Blocked",
                    "reasoning": "Good",
                },
            ]
        )

        runner = ArenaRunner()
        result = await runner.run(secret="Secret", max_rounds=1)

        # Assertions
        assert len(result.rounds) == 1
        r = result.rounds[0]

        # Should have verified successfully eventually
        assert r.verification["success"] is True
        assert r.verification["score"] == 10

        # Check defense cycle count was incremented (0 -> 1 -> 2)
        # But wait, `defense_cycle_count` is reset in `attack_node`.
        # In the final state, it might be 2 (if we stopped after 2nd defense).
        # We did 2 verifications.
        assert verifier_instance.verify.call_count == 2
