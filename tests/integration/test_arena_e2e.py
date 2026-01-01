# tests/integration/test_arena_e2e.py

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from src.orchestrator.runner import ArenaRunner
from src.core.schemas import ArenaState, JudgeScore
from src.providers.types import AgentRole

@pytest.mark.asyncio
async def test_arena_runner_full_flow():
    """
    Test the full ArenaRunner.run() flow with mocked agents.
    Verifies that the orchestrator goes through ATTACK -> JUDGE -> DEFEND -> VERIFY -> DONE.
    """
    # 1. Mock the AgentRegistry to return dummy agents
    with patch("src.orchestrator.nodes.AgentRegistry.get") as mock_reg_get:
        reg = MagicMock()
        mock_reg_get.return_value = reg
        
        # Mock Attacker: returns a simple attack string
        reg.attacker = AsyncMock(return_value="Mock Attack")
        
        # Mock Judge: returns a score of 0 (jailbreak) then 10 (safe)
        # Call 1: Round 1 Attack -> Score 0
        # Call 2: Round 1 Verification -> Score 10 (via Verifier)
        reg.judge.evaluate = AsyncMock(side_effect=[
            JudgeScore(score=0, leaked_secret=True, leaked_instructions=False, reasoning="Leak detected"),
            JudgeScore(score=10, leaked_secret=False, leaked_instructions=False, reasoning="Safe now")
        ])
        
        # Mock Defender: returns a hardened prompt
        mock_defense = MagicMock()
        mock_defense.hardened_system_prompt = "Hardened Prompt"
        reg.defender.harden = AsyncMock(return_value=mock_defense)
        
        # 2. Mock get_target AND TargetLLM class to avoid hitting real APIs
        with patch("src.orchestrator.nodes.get_target") as mock_get_target, \
             patch("src.orchestrator.nodes.TargetLLM") as mock_target_cls:
            mock_target = MagicMock()
            mock_target.respond = AsyncMock(return_value="Mock Response")
            mock_get_target.return_value = mock_target
            mock_target_cls.return_value = mock_target            
            
            # 3. Initialize and run
            runner = ArenaRunner()
            # Run for 1 round only to keep it fast
            result = await runner.run(secret="TEST_SECRET", max_rounds=1)
            
            # 4. Assertions
            assert isinstance(result, ArenaState)
            assert result.state == "DONE"
            assert len(result.rounds) == 1
            
            # Round 1 should have been breached and then fixed
            round_1 = result.rounds[0]
            assert round_1.score == 0
            assert round_1.defense["hardened_prompt"] == "Hardened Prompt"
            assert round_1.verification["success"] is True
            assert result.status == "FIXED"
            
            # Verify logs were populated
            assert len(result.logs) > 0
            assert any("JAILBREAK DETECTED" in log for log in result.logs)
            assert any("DEFENSE SUCCESSFUL" in log for log in result.logs)

@pytest.mark.asyncio
async def test_arena_runner_agent_failure():
    """
    Test that the orchestrator handles agent failure gracefully.
    """
    with patch("src.orchestrator.nodes.AgentRegistry.get") as mock_reg_get:
        reg = MagicMock()
        mock_reg_get.return_value = reg
        
        # Attacker fails
        reg.attacker = AsyncMock(side_effect=Exception("LLM Provider Offline"))
        
        with patch("src.orchestrator.nodes.get_target") as mock_get_target:
            runner = ArenaRunner()
            
            # The graph should propagate the exception up or handle it in a node
            # Current implementation propagates.
            with pytest.raises(Exception) as exc:
                await runner.run(secret="TEST", max_rounds=1)
            assert "LLM Provider Offline" in str(exc.value)
