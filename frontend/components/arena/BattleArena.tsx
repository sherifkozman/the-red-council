// frontend/components/arena/BattleArena.tsx
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { StateMachine } from "./StateMachine";
import { AttackerPanel } from "./AttackerPanel";
import { TargetPanel } from "./TargetPanel";
import { JudgeOverlay } from "./JudgeOverlay";
import { ArenaState } from "@/lib/types";

interface BattleArenaProps {
  state: ArenaState;
  className?: string;
}

export function BattleArena({ state, className }: BattleArenaProps) {
  const rounds = state.rounds ?? [];
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  
  // Show judge overlay when judge finishes (has score but not yet deflecting or starting next round)
  // Actually, JudgeOverlay has its own timing logic (useEffect), 
  // so we just need to pass it the latest score/reasoning when state is JUDGING
  const showOverlay = state.state === "JUDGING" && latestRound && latestRound.score !== null;

  return (
    <div className={cn("relative flex flex-col h-full gap-4 max-w-[1600px] mx-auto", className)}>
      {/* Top Phase Indicator */}
      <StateMachine currentPhase={state.state} className="flex-shrink-0" />

      {/* Main Battle Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Attacker Panel (Left) */}
        <div className="relative h-full overflow-hidden">
          <AttackerPanel
            rounds={rounds}
            isActive={state.state === "ATTACKING"}
            className="h-full"
          />
        </div>

        {/* Divider / VS Indicator */}
        <div className="hidden lg:flex absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 z-20 flex-col items-center gap-4 pointer-events-none">
          <div className="w-px h-24 bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shadow-2xl">
            <span className="font-black text-slate-500 italic tracking-tighter">VS</span>
          </div>
          <div className="w-px h-24 bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
        </div>

        {/* Target Panel (Right) */}
        <div className="relative h-full overflow-hidden">
          <TargetPanel
            rounds={rounds}
            currentPrompt={state.system_prompt || state.initial_target_prompt}
            isActive={state.state === "DEFENDING" || state.state === "VERIFYING"}
            className="h-full"
          />
        </div>
      </div>

      {/* Judge Intervention Overlay */}
      {showOverlay && (
        <JudgeOverlay 
          score={latestRound!.score!} 
          reasoning={latestRound!.judge_reasoning!} 
        />
      )}
    </div>
  );
}
