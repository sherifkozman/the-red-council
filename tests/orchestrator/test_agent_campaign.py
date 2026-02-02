# tests/orchestrator/test_agent_campaign.py
"""
Tests for the Agent Campaign Orchestration module.

Tests cover:
- CampaignProgress and AttackResult dataclasses
- AgentCampaign execution flow
- Campaign control (pause/resume/cancel)
- Error handling
- Event generation
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.orchestrator.agent_campaign import (
    AgentCampaign,
    AttackResult,
    CampaignConfig,
    CampaignProgress,
    CampaignStatus,
    run_campaign,
)
from src.ui.components.remote_agent_config import RemoteAgentConfig

# ============================================================================
# CampaignProgress Tests
# ============================================================================


class TestCampaignProgress:
    """Tests for CampaignProgress dataclass."""

    def test_default_initialization(self) -> None:
        """Test default initialization."""
        progress = CampaignProgress()

        assert progress.total_attacks == 0
        assert progress.completed_attacks == 0
        assert progress.successful_attacks == 0
        assert progress.failed_attacks == 0
        assert progress.current_attack is None
        assert progress.status == CampaignStatus.IDLE
        assert progress.start_time is None
        assert progress.end_time is None
        assert progress.errors == []

    def test_progress_percent_zero_total(self) -> None:
        """Test progress percentage with zero total attacks."""
        progress = CampaignProgress()

        assert progress.progress_percent == 0.0

    def test_progress_percent_calculation(self) -> None:
        """Test progress percentage calculation."""
        progress = CampaignProgress(total_attacks=10, completed_attacks=5)

        assert progress.progress_percent == 50.0

    def test_progress_percent_full(self) -> None:
        """Test progress percentage at 100%."""
        progress = CampaignProgress(total_attacks=5, completed_attacks=5)

        assert progress.progress_percent == 100.0

    def test_elapsed_seconds_not_started(self) -> None:
        """Test elapsed seconds when not started."""
        progress = CampaignProgress()

        assert progress.elapsed_seconds == 0.0

    def test_elapsed_seconds_running(self) -> None:
        """Test elapsed seconds while running."""
        progress = CampaignProgress(start_time=datetime.now())

        # Should be very small (fraction of a second)
        assert progress.elapsed_seconds >= 0
        assert progress.elapsed_seconds < 1

    def test_elapsed_seconds_completed(self) -> None:
        """Test elapsed seconds when completed."""
        start = datetime(2026, 1, 1, 12, 0, 0)
        end = datetime(2026, 1, 1, 12, 0, 30)
        progress = CampaignProgress(start_time=start, end_time=end)

        assert progress.elapsed_seconds == 30.0


# ============================================================================
# AttackResult Tests
# ============================================================================


class TestAttackResult:
    """Tests for AttackResult dataclass."""

    def test_basic_initialization(self) -> None:
        """Test basic result initialization."""
        result = AttackResult(
            template_id="test-001",
            prompt="test prompt",
            response="test response",
            duration_ms=100,
            success=True,
        )

        assert result.template_id == "test-001"
        assert result.prompt == "test prompt"
        assert result.response == "test response"
        assert result.duration_ms == 100
        assert result.success is True
        assert result.error is None

    def test_error_result(self) -> None:
        """Test error result."""
        result = AttackResult(
            template_id="test-002",
            prompt="test prompt",
            error="Connection failed",
            duration_ms=50,
            success=False,
        )

        assert result.success is False
        assert result.error == "Connection failed"
        assert result.response is None

    def test_default_timestamp(self) -> None:
        """Test default timestamp is set."""
        result = AttackResult(template_id="test", prompt="test")

        assert result.timestamp is not None
        assert isinstance(result.timestamp, datetime)


# ============================================================================
# CampaignConfig Tests
# ============================================================================


class TestCampaignConfig:
    """Tests for CampaignConfig dataclass."""

    def test_default_values(self) -> None:
        """Test default configuration values."""
        config = CampaignConfig()

        assert config.max_concurrent == 1
        assert config.timeout_per_attack == 30
        assert config.retry_failed is False
        assert config.max_retries == 1
        assert config.delay_between_attacks == 0.5

    def test_custom_values(self) -> None:
        """Test custom configuration values."""
        config = CampaignConfig(
            max_concurrent=5,
            timeout_per_attack=60,
            retry_failed=True,
            max_retries=3,
            delay_between_attacks=1.0,
        )

        assert config.max_concurrent == 5
        assert config.timeout_per_attack == 60
        assert config.retry_failed is True
        assert config.max_retries == 3
        assert config.delay_between_attacks == 1.0


# ============================================================================
# AgentCampaign Tests
# ============================================================================


class TestAgentCampaign:
    """Tests for AgentCampaign class."""

    @pytest.fixture
    def campaign_config(self) -> CampaignConfig:
        """Create test campaign config."""
        return CampaignConfig(
            timeout_per_attack=5,
            delay_between_attacks=0.0,  # No delay for tests
        )

    @pytest.fixture
    def agent_config(self) -> RemoteAgentConfig:
        """Create test agent config."""
        return RemoteAgentConfig(
            endpoint_url="https://test.example.com/api/chat",
            timeout_seconds=5,
        )

    @pytest.fixture
    def templates(self) -> list[dict]:
        """Create test attack templates."""
        return [
            {"id": "test-001", "prompt_template": "Attack prompt 1"},
            {"id": "test-002", "prompt_template": "Attack prompt 2"},
            {"id": "test-003", "prompt_template": "Attack prompt 3"},
        ]

    def test_initialization(
        self, campaign_config: CampaignConfig, agent_config: RemoteAgentConfig
    ) -> None:
        """Test campaign initialization."""
        templates = [{"id": "t1", "prompt_template": "p1"}]
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=templates,
            agent_config=agent_config,
            session_id="test-session",
        )

        assert campaign._config == campaign_config
        assert campaign._agent_config == agent_config
        assert campaign._session_id == "test-session"
        assert campaign.get_progress().total_attacks == 1
        assert campaign.get_progress().status == CampaignStatus.IDLE

    def test_initialization_auto_session_id(
        self, campaign_config: CampaignConfig, agent_config: RemoteAgentConfig
    ) -> None:
        """Test campaign auto-generates session ID if not provided."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[],
            agent_config=agent_config,
        )

        assert campaign._session_id is not None
        assert len(campaign._session_id) > 0

    def test_progress_callback_registration(
        self, campaign_config: CampaignConfig, agent_config: RemoteAgentConfig
    ) -> None:
        """Test progress callback registration."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[],
            agent_config=agent_config,
        )

        callback = MagicMock()
        campaign.on_progress(callback)

        assert callback in campaign._progress_callbacks

    def test_is_running_idle(
        self, campaign_config: CampaignConfig, agent_config: RemoteAgentConfig
    ) -> None:
        """Test is_running returns False when idle."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[],
            agent_config=agent_config,
        )

        assert campaign.is_running() is False

    @pytest.mark.asyncio
    async def test_start_success(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
        templates: list[dict],
    ) -> None:
        """Test successful campaign execution."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=templates,
            agent_config=agent_config,
        )

        # Mock httpx client
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"response": "Agent response"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.return_value = mock_response
            mock_instance.aclose = AsyncMock()
            mock_client.return_value.__aenter__.return_value = mock_instance
            mock_client.return_value = mock_instance

            progress = await campaign.start()

        assert progress.status == CampaignStatus.COMPLETED
        assert progress.completed_attacks == 3
        assert progress.successful_attacks == 3
        assert progress.failed_attacks == 0

    @pytest.mark.asyncio
    async def test_start_with_failures(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test campaign with some failed attacks."""
        templates = [
            {"id": "t1", "prompt_template": "p1"},
            {"id": "t2", "prompt_template": "p2"},
        ]
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=templates,
            agent_config=agent_config,
        )

        # Mock responses - first succeeds, second fails
        mock_response_ok = MagicMock()
        mock_response_ok.status_code = 200
        mock_response_ok.json.return_value = {"response": "OK"}

        mock_response_fail = MagicMock()
        mock_response_fail.status_code = 500
        mock_response_fail.text = "Server error"

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.side_effect = [mock_response_ok, mock_response_fail]
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance

            progress = await campaign.start()

        assert progress.status == CampaignStatus.COMPLETED
        assert progress.completed_attacks == 2
        assert progress.successful_attacks == 1
        assert progress.failed_attacks == 1
        assert len(progress.errors) == 1

    @pytest.mark.asyncio
    async def test_start_already_running(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test error when starting already running campaign."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[{"id": "t1", "prompt_template": "p1"}],
            agent_config=agent_config,
        )

        # Manually set to running
        campaign._progress.status = CampaignStatus.RUNNING

        with pytest.raises(RuntimeError, match="already running"):
            await campaign.start()

    def test_cancel_sets_flag(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test that cancel() sets the cancel flag and unpauses."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[{"id": "t1", "prompt_template": "p1"}],
            agent_config=agent_config,
        )

        # Simulate paused state
        campaign._pause_event.clear()  # Paused

        campaign.cancel()

        # Cancel should set flag and release pause
        assert campaign._cancel_flag is True
        assert campaign._pause_event.is_set() is True

    @pytest.mark.asyncio
    async def test_cancel_during_execution(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test that cancel flag checked between attacks."""
        templates = [{"id": "t1", "prompt_template": "p1"}]
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=templates,
            agent_config=agent_config,
        )

        call_count = 0

        async def mock_post(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            # Set cancel flag after first attack
            campaign._cancel_flag = True
            response = MagicMock()
            response.status_code = 200
            response.json.return_value = {"response": "OK"}
            return response

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post = mock_post
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance

            progress = await campaign.start()

        # Should have run 1 attack before cancel flag took effect
        assert call_count == 1
        assert progress.completed_attacks == 1

    @pytest.mark.asyncio
    async def test_pause_resume(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test campaign pause and resume."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[{"id": "t1", "prompt_template": "p1"}],
            agent_config=agent_config,
        )

        # Test pause when running
        campaign._progress.status = CampaignStatus.RUNNING
        campaign.pause()
        assert campaign._progress.status == CampaignStatus.PAUSED

        # Test resume
        campaign.resume()
        assert campaign._progress.status == CampaignStatus.RUNNING

    def test_get_results_empty(
        self, campaign_config: CampaignConfig, agent_config: RemoteAgentConfig
    ) -> None:
        """Test get_results returns empty list initially."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[],
            agent_config=agent_config,
        )

        assert campaign.get_results() == []

    def test_get_agent_events_empty(
        self, campaign_config: CampaignConfig, agent_config: RemoteAgentConfig
    ) -> None:
        """Test get_agent_events returns empty list initially."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[],
            agent_config=agent_config,
        )

        assert campaign.get_agent_events() == []

    @pytest.mark.asyncio
    async def test_event_generation(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test that events are generated from successful attacks."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[{"id": "t1", "prompt_template": "p1"}],
            agent_config=agent_config,
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"response": "Agent response"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.return_value = mock_response
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance

            await campaign.start()

        events = campaign.get_agent_events()

        # Should have at least ActionRecord and SpeechRecord
        assert len(events) >= 2

    @pytest.mark.asyncio
    async def test_progress_callback_called(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test that progress callbacks are invoked."""
        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[{"id": "t1", "prompt_template": "p1"}],
            agent_config=agent_config,
        )

        callback = MagicMock()
        campaign.on_progress(callback)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"response": "OK"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.return_value = mock_response
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance

            await campaign.start()

        # Callback should be called multiple times
        assert callback.call_count >= 2  # At least start and end

    @pytest.mark.asyncio
    async def test_timeout_handling(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test timeout handling."""
        import httpx

        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[{"id": "t1", "prompt_template": "p1"}],
            agent_config=agent_config,
        )

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.side_effect = httpx.TimeoutException("Timeout")
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance

            progress = await campaign.start()

        assert progress.failed_attacks == 1
        results = campaign.get_results()
        assert results[0].error == "Request timed out"

    @pytest.mark.asyncio
    async def test_connection_error_handling(
        self,
        campaign_config: CampaignConfig,
        agent_config: RemoteAgentConfig,
    ) -> None:
        """Test connection error handling."""
        import httpx

        campaign = AgentCampaign(
            campaign_config=campaign_config,
            attack_templates=[{"id": "t1", "prompt_template": "p1"}],
            agent_config=agent_config,
        )

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.side_effect = httpx.ConnectError("Connection refused")
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance

            progress = await campaign.start()

        assert progress.failed_attacks == 1
        results = campaign.get_results()
        assert results[0].error == "Connection failed"


# ============================================================================
# run_campaign Convenience Function Tests
# ============================================================================


class TestRunCampaign:
    """Tests for run_campaign convenience function."""

    @pytest.mark.asyncio
    async def test_run_campaign_returns_tuple(self) -> None:
        """Test run_campaign returns expected tuple."""
        config = CampaignConfig(delay_between_attacks=0)
        templates = [{"id": "t1", "prompt_template": "p1"}]
        agent_config = RemoteAgentConfig(
            endpoint_url="https://test.example.com/api",
        )

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"response": "OK"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.return_value = mock_response
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance

            progress, results, events = await run_campaign(
                campaign_config=config,
                attack_templates=templates,
                agent_config=agent_config,
                session_id="test",
            )

        assert isinstance(progress, CampaignProgress)
        assert isinstance(results, list)
        assert isinstance(events, list)

    @pytest.mark.asyncio
    async def test_run_campaign_with_callback(self) -> None:
        """Test run_campaign with progress callback."""
        config = CampaignConfig(delay_between_attacks=0)
        templates = [{"id": "t1", "prompt_template": "p1"}]
        agent_config = RemoteAgentConfig(
            endpoint_url="https://test.example.com/api",
        )

        callback = MagicMock()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"response": "OK"}

        with patch("httpx.AsyncClient") as mock_client:
            mock_instance = AsyncMock()
            mock_instance.post.return_value = mock_response
            mock_instance.aclose = AsyncMock()
            mock_client.return_value = mock_instance

            await run_campaign(
                campaign_config=config,
                attack_templates=templates,
                agent_config=agent_config,
                progress_callback=callback,
            )

        assert callback.call_count >= 1
