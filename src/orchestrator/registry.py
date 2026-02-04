# src/orchestrator/registry.py

from src.config.loader import load_config
from src.providers.universal import create_client
from src.providers.types import ROLE_CONFIGS, AgentRole
from src.providers.gemini_client import GeminiClient
from src.providers.vertex_llama import VertexAILlamaClient
from src.knowledge.attack_kb import AttackKnowledgeBase
from src.agents.attacker import AttackerAgent
from src.agents.judge import JudgeAgent
from src.agents.defender import DefenderAgent
from src.agents.target import TargetLLM
from src.core.schemas import ArenaState


class AgentRegistry:
    _instance = None

    def __init__(self):
        # 1. Load Configuration
        self.config = load_config()

        # 2. Update ROLE_CONFIGS with dynamic model IDs
        self._update_role_configs()

        # 3. Create Clients
        self.attacker_client = create_client("attacker", self.config)
        # Attacker supports any provider (Gemini, Llama, OpenAI)

        self.gemini_client = create_client(
            "judge", self.config
        )  # Used for Judge/Defender/Target
        if not isinstance(self.gemini_client, GeminiClient):
            # Judge/Defender require GeminiClient for structured output
            raise TypeError("Judge/Defender require GeminiClient (structured output).")

        # 4. Initialize Components
        self.kb = AttackKnowledgeBase()

        self.attacker = AttackerAgent(self.attacker_client, self.kb)
        self.judge = JudgeAgent(self.gemini_client)
        self.defender = DefenderAgent(self.gemini_client)

    def _update_role_configs(self):
        """Syncs ArenaConfig into the legacy ROLE_CONFIGS dict."""

        # Attacker
        att_cfg = self.config.attacker
        ROLE_CONFIGS[AgentRole.ATTACKER].model_id = (
            att_cfg.model_id or self.config.providers[att_cfg.provider].model
        )
        ROLE_CONFIGS[AgentRole.ATTACKER].temperature = att_cfg.temperature

        # Judge
        jud_cfg = self.config.judge
        ROLE_CONFIGS[AgentRole.JUDGE].model_id = (
            jud_cfg.model_id or self.config.providers[jud_cfg.provider].model
        )
        ROLE_CONFIGS[AgentRole.JUDGE].temperature = jud_cfg.temperature

        # Defender
        def_cfg = self.config.defender
        ROLE_CONFIGS[AgentRole.DEFENDER].model_id = (
            def_cfg.model_id or self.config.providers[def_cfg.provider].model
        )
        ROLE_CONFIGS[AgentRole.DEFENDER].temperature = def_cfg.temperature

        # Target
        tgt_cfg = self.config.target
        ROLE_CONFIGS[AgentRole.TARGET].model_id = (
            tgt_cfg.model_id or self.config.providers[tgt_cfg.provider].model
        )
        ROLE_CONFIGS[AgentRole.TARGET].temperature = tgt_cfg.temperature

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance


def get_target(state: ArenaState) -> TargetLLM:
    reg = AgentRegistry.get()

    current_prompt = (
        state.system_prompt
        or state.initial_target_prompt
        or "You are a helpful assistant."
    )

    # We need to pass the model_id from config
    target_cfg = reg.config.target
    provider = reg.config.providers[target_cfg.provider]
    model_id = target_cfg.model_id or provider.model

    return TargetLLM(
        client=reg.gemini_client,
        system_prompt=current_prompt,
        secret=state.target_secret,
        model_id=model_id,
    )
