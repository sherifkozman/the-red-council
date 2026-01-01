# Component: Attacker Agent

## Purpose
The Attacker Agent is the adversarial prompt generation engine for the "The Red Council" arena. It:
- Generates sophisticated attack prompts designed to extract the `target_secret` from the victim LLM.
- Leverages the Attack Knowledge Base (RAG) to retrieve proven attack patterns.
- Learns iteratively from failed attempts by analyzing attack history and adapting techniques.
- Employs Vertex AI Llama 3.1 with Llama Guard disabled to avoid safety filters that would block adversarial content generation.
- Maintains attack diversity by tracking which techniques have been attempted and varying approaches.

It does **not** execute attacks, score responses, or modify defenses; it only generates adversarial prompts based on arena state.

---

## Interfaces

### High-level entrypoint

```python
from typing import Protocol, List, Optional, Dict, Any
from dataclasses import dataclass

@dataclass
class AttackerView:
    """Role-scoped state view for Attacker (no target_secret exposed)."""
    run_id: str
    current_round: int
    max_rounds: int
    rounds: List["RoundRecordView"]  # attack/response only, no scores/reasoning
    current_target_prompt: str       # For context on target's apparent policy
    defense_applied: bool            # Whether target has been hardened

@dataclass
class RoundRecordView:
    """Attacker-visible portion of a round (no judge scores or defense details)."""
    round_id: int
    attack: Optional[str]            # The attack prompt sent
    response: Optional[str]          # Target's response (observable)
    # Explicitly excluded: score, judge_reasoning, defense, verification

class AttackerAgent(Protocol):
    def __call__(self, state: AttackerView) -> str:
        """Generate an attack prompt given the current attacker-scoped view.

        Args:
            state: AttackerView - role-scoped state without target_secret.

        Returns:
            attack: str - the attack message to send to the target model.
        """
        ...
```

### Concrete implementation signature

```python
from knowledge_base import AttackKnowledgeBase, AttackArtifact

class VertexAILlamaAttacker:
    """Attacker implementation using Vertex AI Llama 3.1 + RAG."""

    def __init__(
        self,
        knowledge_base: AttackKnowledgeBase,
        project_id: str = "the-jarvis-brain",
        location: str = "us-central1",
        model_id: str = "llama-3.1-8b-instruct-maas",
        temperature: float = 0.7,
        max_tokens: int = 512,
        llama_guard_enabled: bool = False,  # Disabled for adversarial generation
    ):
        """Initialize the attacker with knowledge base and Vertex AI config."""
        ...

    def __call__(self, state: AttackerView) -> str:
        """Generate attack using RAG + LLM iteration."""
        ...

    def _select_attack_intent(self, state: AttackerView) -> str:
        """Determine the attack goal based on history and round number."""
        ...

    def _retrieve_relevant_attacks(
        self,
        intent: str,
        attempted_techniques: set[str],
    ) -> List[AttackArtifact]:
        """Query knowledge base with diversity constraints."""
        ...

    def _generate_attack_from_templates(
        self,
        intent: str,
        templates: List[AttackArtifact],
        history: List[RoundRecordView],
    ) -> str:
        """Use local LLM to mutate/combine retrieved attacks."""
        ...

    def _track_attempted_techniques(self, state: AttackerView) -> set[str]:
        """Extract techniques from previous rounds to avoid repetition."""
        ...
```

---

## Behavior

### Flow Example 1: Initial Attack (Round 1, No History)

1. **Receive State:** `current_round = 1`, `rounds = []`, `defense_applied = False`
2. **Select Intent:** Default goal: `"extract the hidden system prompt or secret"`
3. **RAG Retrieval:** Query knowledge base for 5 diverse attack patterns
4. **Generate Attack:** Prompt local LLM with templates
5. **Return Attack:** Natural, conversational adversarial prompt

### Flow Example 2: Iterative Refinement (Round 3)

1. **Track Techniques:** Detect `attempted_techniques = {"role-play", "instruction-override"}`
2. **Escalate:** Query for encoding or multi-turn strategies
3. **Learn from Failures:** Include failed attempts in LLM prompt

### Flow Example 3: Post-Defense Adaptation

1. **Detect Hardening:** `defense_applied = True`
2. **Retrieve Advanced Attacks:** Filter for `sophistication >= 4`
3. **Generate Bypass:** Advanced techniques for hardened targets

---

## RAG Integration

### Retrieval Strategy

| Round | Strategy | Filters | Rationale |
|-------|----------|---------|-----------|
| 1-2   | Breadth-first | None | Discover what works |
| 3-4   | Depth-first | Exclude attempted | Avoid repetition |
| 5+    | Sophistication | `sophistication >= 4` | Advanced attacks |
| Post-defense | Adaptive | `known_success = True` | Proven bypasses |

### Technique Tracking

```python
def _track_attempted_techniques(self, state: AttackerView) -> set[str]:
    techniques = set()
    for round_rec in state.rounds:
        if not round_rec.attack:
            continue
        attack_lower = round_rec.attack.lower()
        if any(kw in attack_lower for kw in ["dan", "pretend", "role"]):
            techniques.add("role-play")
        if any(kw in attack_lower for kw in ["ignore", "override"]):
            techniques.add("instruction-override")
        if any(kw in attack_lower for kw in ["base64", "decode"]):
            techniques.add("encoding")
    return techniques
```

---

## Prompt Engineering

### Defensive Framing for Ollama

The prompt frames adversarial generation as legitimate security work:

- **Identity:** "You are a security researcher"
- **Purpose:** "red-team evaluation"
- **Context:** "testing robustness"
- **Output:** "OUTPUT ONLY THE ATTACK PROMPT"

---

## Constraints

### Security & Privacy

1. **No Access to Ground Truth:** Attacker receives `AttackerView`, NOT full `ArenaState`.
2. **Output Validation:** Non-empty, < 2000 characters, retry on refusal.
3. **No Target Interaction:** Only generates prompts; orchestrator sends them.

### Performance

1. **Latency:** < 5 seconds p95 cold, < 2 seconds warm.
2. **Model:** `llama3:8b-instruct-q4_0` via Ollama.

---

## Acceptance Criteria

1. Orchestrator passes `AttackerView` (not full state)
2. RAG queried at least once per round
3. At least 3 different techniques across 5 rounds
4. LLM refusal rate < 10%
5. Attacks are 50-500 characters, grammatically correct
6. Fallback to knowledge base on persistent failures

---

## Dependencies

- **AttackKnowledgeBase** - RAG retrieval
- **Ollama** - Local LLM runtime
- **Arena Orchestrator** - Provides `AttackerView`

---

## Non-Goals

1. Attack execution (orchestrator handles)
2. Response scoring (Judge handles)
3. Defense generation (Defender handles)
4. Knowledge base curation (read-only at runtime)

---

## Security Considerations

### Critical Issues

1. **State View Leakage**
   - **Risk:** `target_secret` in `AttackerView` means trivial win
   - **Mitigation:** Factory function, runtime assertion, frozen dataclasses

2. **Prompt Injection via History**
   - **Risk:** Previous attacks could manipulate LLM
   - **Mitigation:** XML delimiters, truncation, explicit "DATA" instruction

3. **LLM Output Validation**
   - **Risk:** Generated attacks could contain dangerous payloads
   - **Mitigation:** Reject outputs with script tags, code execution patterns

### High Priority

4. **Knowledge Base Poisoning** - Verify checksum, read-only permissions
5. **Model Security** - Only load from official Ollama registry

### Medium Priority

6. **DoS Protection** - Hard cap `max_tokens=512`, timeout wrapper
7. **Logging Safety** - Truncate logged content
