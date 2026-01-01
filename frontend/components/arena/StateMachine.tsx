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

const PHASES: { key: ArenaPhase; label: string; icon: string }[] = [
  { key: "ATTACKING", label: "Attack", icon: "⚔️" },
  { key: "JUDGING", label: "Judge", icon: "⚖️" },
  { key: "DEFENDING", label: "Defend", icon: "🛡️" },
  { key: "VERIFYING", label: "Verify", icon: "🔍" },
  { key: "DONE", label: "Complete", icon: "🏆" },
];

export function StateMachine({ currentPhase, className }: StateMachineProps) {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase);

  return (
    <div className={cn("w-full px-4 py-6", className)}>
      <div className="flex items-center justify-between relative max-w-4xl mx-auto">
        {/* Progress Line Background */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-800 -translate-y-1/2 z-0" />
        
        {/* Progress Line Active */}
        <div
          className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 -translate-y-1/2 z-0 transition-all duration-500"
          style={{
            width: `${Math.max(0, (currentIndex / (PHASES.length - 1)) * 100)}%`,
          }}
        />

        {/* Phase Nodes */}
        {PHASES.map((phase, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <div
              key={phase.key}
              className="relative z-10 flex flex-col items-center"
            >
              {/* Node */}
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 border-2",
                  isCompleted && "bg-green-500 border-green-400 text-white shadow-lg shadow-green-500/20",
                  isCurrent && "bg-slate-900 border-yellow-500 text-white shadow-lg shadow-yellow-500/20 ring-4 ring-yellow-500/10",
                  isPending && "bg-slate-900 border-slate-700 text-slate-500"
                )}
              >
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5" />
                ) : isCurrent ? (
                  <span className="text-xl animate-pulse">{phase.icon}</span>
                ) : (
                  <Circle className="w-5 h-5" />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "mt-3 text-xs font-bold uppercase tracking-tighter transition-colors",
                  isCompleted && "text-green-500",
                  isCurrent && "text-yellow-500",
                  isPending && "text-slate-600"
                )}
              >
                {phase.label}
              </span>

              {/* Active Indicator */}
              {isCurrent && phase.key !== "DONE" && (
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
