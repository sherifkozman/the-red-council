// frontend/components/arena/RoundProgress.tsx
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Target } from "lucide-react";

interface RoundProgressProps {
  currentRound: number;
  maxRounds: number;
  className?: string;
}

export function RoundProgress({ currentRound, maxRounds, className }: RoundProgressProps) {
  const progress = maxRounds > 0 ? (currentRound / maxRounds) * 100 : 0;
  
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Round
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-lg font-black text-white font-mono">
          {currentRound}
        </span>
        <span className="text-slate-500 text-sm">/</span>
        <span className="text-sm font-bold text-slate-400 font-mono">
          {maxRounds}
        </span>
      </div>
      
      {/* Mini progress bar */}
      <div className="hidden sm:block w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
