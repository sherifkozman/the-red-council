// frontend/components/arena/BattleArena.tsx
"use client";

import React from "react";
import { ArenaState } from "@/lib/types";
import { StateMachine } from "./StateMachine";
import { AttackerPanel } from "./AttackerPanel";
import { TargetPanel } from "./TargetPanel";
import { EventLog } from "./EventLog";

interface BattleArenaProps {
  state: ArenaState;
  knownSecret?: string;
}

export function BattleArena({ state, knownSecret }: BattleArenaProps) {
  const currentRound = state.rounds[state.rounds.length - 1] || null;
  const isRedTurn = state.state === "ATTACKING";
  const isBlueTurn = ["JUDGING", "DEFENDING", "VERIFYING"].includes(state.state);

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-950 overflow-hidden">
      {/* Top: State Machine */}
      <div className="flex-shrink-0 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md z-20">
        <StateMachine currentPhase={state.state} />
      </div>

      {/* Middle: Battle Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 min-h-0 overflow-hidden">
        <AttackerPanel
          rounds={state.rounds}
          isActive={isRedTurn}
          className="min-h-0"
        />
        <TargetPanel
          rounds={state.rounds}
          currentPrompt={state.system_prompt}
          isActive={isBlueTurn}
          knownSecret={knownSecret}
          className="min-h-0"
        />
      </div>

      {/* Bottom: Event Log - Fixed Height */}
      <div className="flex-shrink-0 h-48 border-t border-slate-900 bg-slate-950 p-4 z-10">
        <EventLog logs={state.logs} />
      </div>
    </div>
  );
}
