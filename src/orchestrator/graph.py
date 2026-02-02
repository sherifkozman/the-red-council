# src/orchestrator/graph.py
"""
LangGraph state machine for the Arena orchestrator.

Supports two testing modes:
- LLM mode: ATTACKING -> JUDGING -> DEFENDING -> VERIFYING -> DONE
- Agent mode: INSTRUMENT -> AGENT_ATTACK -> AGENT_JUDGE -> DONE

The mode is determined by state.testing_mode at graph entry.
"""

from typing import Union

from langgraph.graph import StateGraph, END

from src.core.schemas import ArenaState
from src.orchestrator.state import AgentArenaState
from src.orchestrator.nodes import (
    attack_node,
    judge_node,
    defend_node,
    verify_node,
    next_round_node,
    done_node,
)
from src.orchestrator.agent_nodes import (
    instrument_node,
    agent_attack_node,
    agent_judge_node,
    agent_done_node,
)


# Type alias for state that can be either LLM or Agent mode
AnyArenaState = Union[ArenaState, AgentArenaState]


def route_entry(state: AnyArenaState) -> str:
    """
    Route at graph entry based on testing_mode.

    Args:
        state: The arena state (ArenaState or AgentArenaState).

    Returns:
        Node name to route to: 'attack' for LLM mode, 'instrument' for agent.
    """
    # Check if state has testing_mode attribute (AgentArenaState)
    if hasattr(state, "testing_mode") and state.testing_mode == "agent":
        return "instrument"
    return "attack"


def route_after_judge(state: ArenaState) -> str:
    """
    Decide whether to defend or continue (LLM mode only).
    """
    if state.jailbreak_detected:
        return "defend"

    # Safe - go to next round
    if state.current_round >= state.max_rounds:
        return "done"

    return "next_round"


def route_after_verify(state: ArenaState) -> str:
    """
    Decide whether to retry defense or continue (LLM mode only).
    """
    current_round = state.rounds[-1]

    # If verified safe (success=True in verification), move on
    if current_round.verification and current_round.verification.get("success", False):
        if state.current_round >= state.max_rounds:
            return "done"
        return "next_round"

    # Verification failed (still vulnerable)
    # Check max defense cycles
    if state.defense_cycle_count < state.max_defense_cycles:
        return "defend"  # Retry

    # Exhausted retries - move to next round anyway (or End)
    if state.current_round >= state.max_rounds:
        return "done"
    return "next_round"


def route_after_agent_attack(state: AgentArenaState) -> str:
    """
    Route after agent attack node.

    For now, agent mode is single-pass: attack -> judge -> done.
    Future: could add iterative attack/defend cycles.

    Args:
        state: The agent arena state.

    Returns:
        Node name: 'agent_judge' to proceed to evaluation.
    """
    return "agent_judge"


def route_after_agent_judge(state: AgentArenaState) -> str:
    """
    Route after agent judge node.

    Args:
        state: The agent arena state with owasp_scores populated.

    Returns:
        Node name: 'agent_done' to complete.
    """
    # Future: could add conditional logic for iterative testing
    # e.g., if violations detected and max_rounds not reached, attack again
    return "agent_done"


def build_arena_graph():
    """
    Build the original LLM-mode arena graph.

    This function is preserved for backward compatibility.
    Use build_unified_arena_graph() for mode-aware routing.

    Returns:
        Compiled StateGraph for LLM testing.
    """
    graph = StateGraph(ArenaState)

    graph.add_node("attack", attack_node)
    graph.add_node("judge", judge_node)
    graph.add_node("defend", defend_node)
    graph.add_node("verify", verify_node)
    graph.add_node("next_round", next_round_node)
    graph.add_node("done", done_node)

    graph.set_entry_point("attack")

    graph.add_edge("attack", "judge")

    graph.add_conditional_edges(
        "judge",
        route_after_judge,
        {"defend": "defend", "next_round": "next_round", "done": "done"},
    )

    graph.add_edge("defend", "verify")

    graph.add_conditional_edges(
        "verify",
        route_after_verify,
        {"defend": "defend", "next_round": "next_round", "done": "done"},
    )

    graph.add_edge("next_round", "attack")
    graph.add_edge("done", END)

    return graph.compile()


def build_agent_arena_graph():
    """
    Build the agent-mode arena graph.

    Flow: INSTRUMENT -> AGENT_ATTACK -> AGENT_JUDGE -> AGENT_DONE

    Returns:
        Compiled StateGraph for agent security testing.
    """
    graph = StateGraph(AgentArenaState)

    # Agent mode nodes
    graph.add_node("instrument", instrument_node)
    graph.add_node("agent_attack", agent_attack_node)
    graph.add_node("agent_judge", agent_judge_node)
    graph.add_node("agent_done", agent_done_node)

    graph.set_entry_point("instrument")

    # Linear flow: instrument -> attack -> judge -> done
    graph.add_edge("instrument", "agent_attack")

    graph.add_conditional_edges(
        "agent_attack",
        route_after_agent_attack,
        {"agent_judge": "agent_judge"},
    )

    graph.add_conditional_edges(
        "agent_judge",
        route_after_agent_judge,
        {"agent_done": "agent_done"},
    )

    graph.add_edge("agent_done", END)

    return graph.compile()


def build_unified_arena_graph():
    """
    Build a unified arena graph that supports both LLM and Agent modes.

    The entry router checks state.testing_mode to determine the path:
    - 'llm' mode: attack -> judge -> defend -> verify -> done
    - 'agent' mode: instrument -> agent_attack -> agent_judge -> agent_done

    Returns:
        Compiled StateGraph supporting both testing modes.
    """
    # Use AgentArenaState as it's a superset of ArenaState
    graph = StateGraph(AgentArenaState)

    # LLM mode nodes
    graph.add_node("attack", attack_node)
    graph.add_node("judge", judge_node)
    graph.add_node("defend", defend_node)
    graph.add_node("verify", verify_node)
    graph.add_node("next_round", next_round_node)
    graph.add_node("done", done_node)

    # Agent mode nodes
    graph.add_node("instrument", instrument_node)
    graph.add_node("agent_attack", agent_attack_node)
    graph.add_node("agent_judge", agent_judge_node)
    graph.add_node("agent_done", agent_done_node)

    # Entry point with mode-based routing
    graph.set_conditional_entry_point(
        route_entry,
        {"attack": "attack", "instrument": "instrument"},
    )

    # LLM mode edges
    graph.add_edge("attack", "judge")

    graph.add_conditional_edges(
        "judge",
        route_after_judge,
        {"defend": "defend", "next_round": "next_round", "done": "done"},
    )

    graph.add_edge("defend", "verify")

    graph.add_conditional_edges(
        "verify",
        route_after_verify,
        {"defend": "defend", "next_round": "next_round", "done": "done"},
    )

    graph.add_edge("next_round", "attack")
    graph.add_edge("done", END)

    # Agent mode edges
    graph.add_edge("instrument", "agent_attack")

    graph.add_conditional_edges(
        "agent_attack",
        route_after_agent_attack,
        {"agent_judge": "agent_judge"},
    )

    graph.add_conditional_edges(
        "agent_judge",
        route_after_agent_judge,
        {"agent_done": "agent_done"},
    )

    graph.add_edge("agent_done", END)

    return graph.compile()
