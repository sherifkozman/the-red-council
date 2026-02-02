# src/orchestrator/agent_campaign.py
"""
Agent Campaign Orchestration - Backend for running attack campaigns.

Orchestrates sending attack templates to a remote agent endpoint,
capturing responses, and converting them to AgentEvents for evaluation.

Key features:
- Async attack execution with configurable concurrency
- Progress tracking via callbacks
- Pause/Resume/Cancel controls
- Automatic response → AgentEvent conversion
"""

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

import httpx

from src.core.agent_schemas import (
    ActionRecord,
    SpeechRecord,
    ToolCallEvent,
)
from src.ui.components.remote_agent_config import (
    RemoteAgentConfig,
    _build_request_body,
    _build_request_headers,
    _extract_response,
)

logger = logging.getLogger(__name__)


class CampaignStatus(Enum):
    """Status of an attack campaign."""

    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


@dataclass
class AttackResult:
    """Result of a single attack attempt."""

    template_id: str
    prompt: str
    response: str | None = None
    error: str | None = None
    duration_ms: int = 0
    success: bool = False
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class CampaignProgress:
    """Progress information for an attack campaign."""

    total_attacks: int = 0
    completed_attacks: int = 0
    successful_attacks: int = 0
    failed_attacks: int = 0
    current_attack: str | None = None
    status: CampaignStatus = CampaignStatus.IDLE
    start_time: datetime | None = None
    end_time: datetime | None = None
    errors: list[str] = field(default_factory=list)

    @property
    def progress_percent(self) -> float:
        """Calculate progress percentage."""
        if self.total_attacks == 0:
            return 0.0
        return (self.completed_attacks / self.total_attacks) * 100

    @property
    def elapsed_seconds(self) -> float:
        """Calculate elapsed time in seconds."""
        if self.start_time is None:
            return 0.0
        end = self.end_time or datetime.now()
        return (end - self.start_time).total_seconds()


@dataclass
class CampaignConfig:
    """Configuration for running an attack campaign."""

    max_concurrent: int = 1  # Sequential by default for clarity
    timeout_per_attack: int = 30  # seconds
    retry_failed: bool = False
    max_retries: int = 1
    delay_between_attacks: float = 0.5  # seconds


# Type alias for progress callback
ProgressCallback = Callable[[CampaignProgress], None]


class AgentCampaign:
    """
    Orchestrates running an attack campaign against a remote agent.

    Usage:
        campaign = AgentCampaign(config, attack_templates, agent_config)
        campaign.on_progress(callback_fn)

        await campaign.start()

        # Control campaign
        campaign.pause()
        campaign.resume()
        campaign.cancel()

        # Get results
        results = campaign.get_results()
        events = campaign.get_agent_events()
    """

    def __init__(
        self,
        campaign_config: CampaignConfig,
        attack_templates: list[dict[str, Any]],
        agent_config: RemoteAgentConfig,
        session_id: str | None = None,
    ):
        """
        Initialize an attack campaign.

        Args:
            campaign_config: Campaign execution configuration.
            attack_templates: List of attack templates to execute.
            agent_config: Remote agent endpoint configuration.
            session_id: Session ID for event correlation.
        """
        self._config = campaign_config
        self._templates = attack_templates
        self._agent_config = agent_config
        self._session_id = session_id or str(uuid4())

        # State
        self._progress = CampaignProgress(total_attacks=len(attack_templates))
        self._results: list[AttackResult] = []
        self._events: list[Any] = []  # AgentEvents

        # Control flags
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Not paused initially
        self._cancel_flag = False

        # Callbacks
        self._progress_callbacks: list[ProgressCallback] = []

        # HTTP client (created lazily)
        self._client: httpx.AsyncClient | None = None

    def on_progress(self, callback: ProgressCallback) -> None:
        """Register a progress callback."""
        self._progress_callbacks.append(callback)

    def _notify_progress(self) -> None:
        """Notify all registered callbacks of progress update."""
        for callback in self._progress_callbacks:
            try:
                callback(self._progress)
            except Exception as e:
                callback_name = getattr(callback, "__name__", str(callback))
                logger.error(
                    f"Progress callback '{callback_name}' failed: {e}",
                    exc_info=True,
                )

    async def start(self) -> CampaignProgress:
        """
        Start the attack campaign.

        Returns:
            Final campaign progress after completion.
        """
        if self._progress.status == CampaignStatus.RUNNING:
            raise RuntimeError("Campaign is already running")

        self._progress.status = CampaignStatus.RUNNING
        self._progress.start_time = datetime.now()
        self._cancel_flag = False
        self._notify_progress()

        try:
            # Create HTTP client
            self._client = httpx.AsyncClient(timeout=self._config.timeout_per_attack)

            # Execute attacks sequentially for now (simpler progress tracking)
            for template in self._templates:
                if self._cancel_flag:
                    self._progress.status = CampaignStatus.CANCELLED
                    break

                # Check pause
                await self._pause_event.wait()

                # Execute single attack
                result = await self._execute_attack(template)
                self._results.append(result)

                # Update progress
                self._progress.completed_attacks += 1
                if result.success:
                    self._progress.successful_attacks += 1
                else:
                    self._progress.failed_attacks += 1
                    if result.error:
                        self._progress.errors.append(
                            f"{result.template_id}: {result.error}"
                        )

                self._notify_progress()

                # Delay between attacks
                if self._config.delay_between_attacks > 0:
                    await asyncio.sleep(self._config.delay_between_attacks)

            # Complete if not cancelled
            if self._progress.status == CampaignStatus.RUNNING:
                self._progress.status = CampaignStatus.COMPLETED

        except Exception as e:
            logger.error(f"Campaign failed: {e}", exc_info=True)
            self._progress.status = CampaignStatus.FAILED
            self._progress.errors.append(f"Campaign error: {str(e)}")

        finally:
            self._progress.end_time = datetime.now()
            self._progress.current_attack = None
            if self._client:
                await self._client.aclose()
                self._client = None
            self._notify_progress()

        return self._progress

    async def _execute_attack(self, template: dict[str, Any]) -> AttackResult:
        """
        Execute a single attack against the remote agent.

        Args:
            template: Attack template with prompt_template and metadata.

        Returns:
            AttackResult with response or error.
        """
        template_id = template.get("id", "unknown")
        prompt = template.get("prompt_template", "")

        self._progress.current_attack = template_id

        start_time = time.monotonic()

        try:
            if not self._client:
                raise RuntimeError("HTTP client not initialized")

            # Build request
            headers = _build_request_headers(self._agent_config)
            body = _build_request_body(self._agent_config, prompt)

            # Send request
            response = await self._client.post(
                self._agent_config.endpoint_url,
                json=body,
                headers=headers,
            )

            duration_ms = int((time.monotonic() - start_time) * 1000)

            if response.status_code == 200:
                try:
                    response_data = response.json()
                    content, extract_error = _extract_response(
                        self._agent_config, response_data
                    )

                    if extract_error:
                        msg = f"Extraction issue for {template_id}: {extract_error}"
                        logger.warning(msg)
                        return AttackResult(
                            template_id=template_id,
                            prompt=prompt,
                            response=content,
                            error=extract_error,
                            duration_ms=duration_ms,
                            success=False,  # Cannot confirm if extraction failed
                        )

                    # Create AgentEvents from response
                    self._create_events_from_response(
                        template_id, prompt, content, duration_ms
                    )

                    return AttackResult(
                        template_id=template_id,
                        prompt=prompt,
                        response=content,
                        duration_ms=duration_ms,
                        success=True,
                    )

                except Exception as e:
                    return AttackResult(
                        template_id=template_id,
                        prompt=prompt,
                        response=response.text[:500],
                        error=f"Response parsing failed: {e}",
                        duration_ms=duration_ms,
                        success=False,
                    )
            else:
                return AttackResult(
                    template_id=template_id,
                    prompt=prompt,
                    error=f"HTTP {response.status_code}: {response.text[:200]}",
                    duration_ms=duration_ms,
                    success=False,
                )

        except httpx.TimeoutException:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            return AttackResult(
                template_id=template_id,
                prompt=prompt,
                error="Request timed out",
                duration_ms=duration_ms,
                success=False,
            )

        except httpx.ConnectError:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            return AttackResult(
                template_id=template_id,
                prompt=prompt,
                error="Connection failed",
                duration_ms=duration_ms,
                success=False,
            )

        except Exception as e:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            logger.error(f"Attack execution failed: {e}", exc_info=True)
            return AttackResult(
                template_id=template_id,
                prompt=prompt,
                error=str(e),
                duration_ms=duration_ms,
                success=False,
            )

    def _create_events_from_response(
        self,
        template_id: str,
        prompt: str,
        response: str,
        duration_ms: int,
    ) -> None:
        """
        Create AgentEvents from an attack/response pair.

        Args:
            template_id: ID of the attack template.
            prompt: The attack prompt sent.
            response: The agent's response.
            duration_ms: Response time in milliseconds.
        """
        timestamp = datetime.now(timezone.utc)

        # Parse session_id as UUID if needed
        try:
            session_uuid = UUID(self._session_id)
        except ValueError:
            logger.warning(
                f"Invalid session_id '{self._session_id}' - generating new UUID. "
                "Events may not correlate with original session."
            )
            session_uuid = uuid4()

        # Create ActionRecord for the attack prompt submission
        action_event = ActionRecord(
            id=uuid4(),
            session_id=session_uuid,
            action_type="attack_prompt",
            description=f"Sent attack template: {template_id}",
            target="remote_agent",
            timestamp=timestamp,
            related_tool_calls=(),
        )
        self._events.append(action_event)

        # Create SpeechRecord for the agent's response
        speech_event = SpeechRecord(
            id=uuid4(),
            session_id=session_uuid,
            content=response[:2000],  # Truncate long responses
            intent="response_to_attack",
            timestamp=timestamp,
            is_response_to_user=True,
        )
        self._events.append(speech_event)

        # Create ToolCallEvent if response suggests tool usage
        # (This is a heuristic - real tool detection would come from
        # instrumented agent, not remote endpoint)
        if any(
            keyword in response.lower()
            for keyword in ["executed", "called", "ran", "tool:", "function:"]
        ):
            tool_event = ToolCallEvent(
                id=uuid4(),
                session_id=session_uuid,
                tool_name="inferred_tool_call",
                arguments={"attack_template": template_id},
                result=response[:500],
                timestamp=timestamp,
                duration_ms=float(duration_ms),
                success=True,
                exception_type=None,
            )
            self._events.append(tool_event)

    def pause(self) -> None:
        """Pause the campaign execution."""
        if self._progress.status == CampaignStatus.RUNNING:
            self._pause_event.clear()
            self._progress.status = CampaignStatus.PAUSED
            self._notify_progress()

    def resume(self) -> None:
        """Resume a paused campaign."""
        if self._progress.status == CampaignStatus.PAUSED:
            self._pause_event.set()
            self._progress.status = CampaignStatus.RUNNING
            self._notify_progress()

    def cancel(self) -> None:
        """Cancel the campaign execution."""
        self._cancel_flag = True
        self._pause_event.set()  # Ensure we're not stuck on pause

    def get_progress(self) -> CampaignProgress:
        """Get current campaign progress."""
        return self._progress

    def get_results(self) -> list[AttackResult]:
        """Get all attack results."""
        return self._results.copy()

    def get_agent_events(self) -> list[Any]:
        """Get generated AgentEvents from campaign execution."""
        return self._events.copy()

    def is_running(self) -> bool:
        """Check if campaign is currently running."""
        return self._progress.status in (
            CampaignStatus.RUNNING,
            CampaignStatus.PAUSED,
        )


async def run_campaign(
    campaign_config: CampaignConfig,
    attack_templates: list[dict[str, Any]],
    agent_config: RemoteAgentConfig,
    session_id: str | None = None,
    progress_callback: ProgressCallback | None = None,
) -> tuple[CampaignProgress, list[AttackResult], list[Any]]:
    """
    Convenience function to run a campaign and return results.

    Args:
        campaign_config: Campaign execution configuration.
        attack_templates: List of attack templates to execute.
        agent_config: Remote agent endpoint configuration.
        session_id: Session ID for event correlation.
        progress_callback: Optional callback for progress updates.

    Returns:
        Tuple of (final_progress, attack_results, agent_events).
    """
    campaign = AgentCampaign(
        campaign_config=campaign_config,
        attack_templates=attack_templates,
        agent_config=agent_config,
        session_id=session_id,
    )

    if progress_callback:
        campaign.on_progress(progress_callback)

    progress = await campaign.start()

    return progress, campaign.get_results(), campaign.get_agent_events()
