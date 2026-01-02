// frontend/components/arena/StateMachine.tsx
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle, Circle, Loader2 } from "lucide-react";
import { ArenaPhase } from "@/lib/types";

interface StateMachineProps {
  currentPhase: ArenaPhase;
  className?: string;
}

const PHASES: { key: ArenaPhase | "UNKNOWN"; label: string; icon: string }[] = [
  { key: "ATTACKING", label: "Attack", icon: "⚔️" },
  { key: "JUDGING", label: "Judge", icon: "⚖️" },
  { key: "DEFENDING", label: "Defend", icon: "🛡️" },
  { key: "VERIFYING", label: "Verify", icon: "🔍" },
  { key: "DONE", label: "Complete", icon: "🏆" },
  { key: "UNKNOWN", label: "Unknown State", icon: "❓" },
];

// Map possible backend state names to our phase keys
const PHASE_ALIASES: Record<string, ArenaPhase> = {
  "ATTACKING": "ATTACKING",
  "ATTACK": "ATTACKING",
  "JUDGING": "JUDGING",
  "JUDGE": "JUDGING",
  "DEFENDING": "DEFENDING",
  "DEFEND": "DEFENDING",
  "VERIFYING": "VERIFYING",
  "VERIFY": "VERIFYING",
  "DONE": "DONE",
  "COMPLETE": "DONE",
  "FINISHED": "DONE",
};

function normalizePhase(phase: string): ArenaPhase | "UNKNOWN" {
  if (!phase) return "ATTACKING";
  const normalized = PHASE_ALIASES[phase.toUpperCase()];
  
  if (!normalized) {
    console.error(`[StateMachine] CRITICAL: Received unexpected arena phase: "${phase}". This might indicate a backend version mismatch.`);
    return "UNKNOWN";
  }
  
  return normalized as ArenaPhase;
}

export function StateMachine({ currentPhase, className }: StateMachineProps) {
  const normalizedPhase = normalizePhase(currentPhase);
  const currentIndex = PHASES.findIndex((p) => p.key === normalizedPhase);
  const isUnknown = normalizedPhase === "UNKNOWN";
  
  // Fallback index if unknown
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <div className={cn("w-full px-4 py-6", className)}>
      <div className="flex items-center justify-between relative max-w-4xl mx-auto">
        {/* Progress Line Background */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-800 -translate-y-1/2 z-0" />
        
        {/* Progress Line Active */}
        <div
          className={cn(
            "absolute top-1/2 left-0 h-1 -translate-y-1/2 z-0 transition-all duration-500",
            isUnknown ? "bg-red-500/50" : "bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
          )}
          style={{
            width: isUnknown ? "100%" : `${Math.max(0, (safeIndex / (PHASES.length - 2)) * 100)}%`,
          }}
        />

        {/* Phase Nodes */}
        {PHASES.filter(p => !isUnknown ? p.key !== "UNKNOWN" : true).map((phase, index) => {
          const isCompleted = !isUnknown && index < safeIndex;
          const isCurrent = index === safeIndex;
          const isPending = !isUnknown && index > safeIndex;

          return (
            <div
              key={phase.key}
              className="relative z-10 flex flex-col items-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              {/* Node */}
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 border-2",
                  isCompleted && "bg-green-500 border-green-400 text-white shadow-lg shadow-green-500/20",
                  isCurrent && !isUnknown && "bg-slate-900 border-yellow-500 text-white shadow-lg shadow-yellow-500/20 ring-4 ring-yellow-500/10",
                  isCurrent && isUnknown && "bg-red-900 border-red-500 text-white animate-pulse",
                  isPending && "bg-slate-900 border-slate-700 text-slate-500"
                )}
                role="img"
                aria-label={`${phase.label} phase ${isCompleted ? '(completed)' : isCurrent ? '(current)' : '(pending)'}`}
              >
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5" />
                ) : isCurrent ? (
                  <span className="text-xl">{phase.icon}</span>
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "mt-3 text-xs font-bold uppercase tracking-tighter transition-colors",
                  isCompleted && "text-green-500",
                  isCurrent && !isUnknown && "text-yellow-500",
                  isCurrent && isUnknown && "text-red-500",
                  isPending && "text-slate-600"
                )}
              >
                {phase.label}
              </span>

              {/* Active Indicator */}
              {isCurrent && phase.key !== "DONE" && phase.key !== "UNKNOWN" && (
                <div className="absolute -bottom-6 flex items-center gap-1">
                   <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
                   <span className="text-[10px] text-yellow-500/70 animate-pulse font-mono uppercase">Processing</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
