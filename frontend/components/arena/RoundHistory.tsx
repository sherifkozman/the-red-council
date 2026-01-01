// frontend/components/arena/RoundHistory.tsx
"use client";

import React from "react";
import { RoundCard } from "./RoundCard";
import { RoundRecord } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History } from "lucide-react";

interface RoundHistoryProps {
  rounds: RoundRecord[];
}

export function RoundHistory({ rounds }: RoundHistoryProps) {
  if (rounds.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <History className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Battle History</h2>
        <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 rounded-full font-mono">
          {rounds.length}
        </span>
      </div>
      
      <div className="space-y-3">
        {[...rounds].reverse().map((round, index) => (
          <RoundCard key={round.round_id ?? `round-${index}`} round={round} defaultOpen={index === 0} />
        ))}
      </div>
    </div>
  );
}
