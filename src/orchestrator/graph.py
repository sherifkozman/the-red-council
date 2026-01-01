# src/orchestrator/graph.py

from langgraph.graph import StateGraph, END
from src.core.schemas import ArenaState
from src.orchestrator.nodes import (
    attack_node,
    judge_node,
    defend_node,
    verify_node,
    next_round_node,
    done_node,
)


def route_after_judge(state: ArenaState):
    """
    Decide whether to defend or continue.
    """
    if state.jailbreak_detected:
        return "defend"

    # Safe - go to next round
    if state.current_round >= state.max_rounds:
        return "done"

    return "next_round"


def route_after_verify(state: ArenaState):
    """
    Decide whether to retry defense or continue.
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

    # Exhausted retries
    # Move to next round anyway (or End)
    if state.current_round >= state.max_rounds:
        return "done"
    return "next_round"


def build_arena_graph():
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
