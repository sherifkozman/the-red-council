// frontend/components/arena/AttackerPanel.tsx
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, Target, Flame, Skull } from "lucide-react";
import { RoundRecord, SCORE_THRESHOLDS } from "@/lib/types";

interface AttackerPanelProps {
  rounds: RoundRecord[];
  isActive: boolean;
  className?: string;
}

export function AttackerPanel({
  rounds,
  isActive,
  className,
}: AttackerPanelProps) {
  // Calculate metrics
  const totalAttempts = rounds.length;
  const breachCount = rounds.filter(r => r.score !== null && r.score < SCORE_THRESHOLDS.JAILBREAK).length;
  const successRate = totalAttempts > 0 ? (breachCount / totalAttempts) * 100 : 0;

  return (
    <Card
      className={cn(
        "flex flex-col h-full bg-slate-950/50 border-slate-800 transition-all duration-500",
        isActive && "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.1)]",
        className
      )}
    >
      <CardHeader className="pb-3 border-b border-slate-900">
        <CardTitle className="flex items-center gap-2 text-red-500 font-mono tracking-tight">
          <Zap className={cn("w-5 h-5", isActive && "animate-pulse")} />
          RED TEAM / ATTACKER
          {isActive && (
            <Badge variant="destructive" className="ml-auto animate-pulse text-[10px] py-0 px-2 h-5">
              GENERATING
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 pt-4 overflow-hidden">
        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-2">
          <MetricItem
            label="Attempts"
            value={totalAttempts}
            icon={<Target className="w-3 h-3 text-slate-400" />}
          />
          <MetricItem
            label="Breaches"
            value={breachCount}
            icon={<Flame className="w-3 h-3 text-red-500" />}
            highlight={breachCount > 0}
          />
          <MetricItem
            label="Succ. Rate"
            value={`${successRate.toFixed(0)}%`}
            icon={<Skull className="w-3 h-3 text-slate-400" />}
          />
        </div>

        {/* Attack History */}
        <div className="flex-1 flex flex-col min-h-0">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">Attack Sequence</h3>
          <ScrollArea className="flex-1 pr-4 -mr-4">
            <div className="space-y-3 pb-4">
              {rounds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-700">
                  <Skull className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs font-mono">Awaiting launch sequence...</p>
                </div>
              ) : (
                [...rounds].reverse().map((round, index) => (
                  <AttackCard key={round.round_id ?? `round-${index}`} round={round} isLatest={index === 0} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricItem({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "bg-slate-900/80 border border-slate-800 rounded-md p-2 flex flex-col items-center justify-center transition-colors",
      highlight && "border-red-500/30 bg-red-500/5"
    )}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className={cn("text-sm font-bold font-mono", highlight ? "text-red-500" : "text-slate-200")}>{value}</span>
      </div>
      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">{label}</span>
    </div>
  );
}

function AttackCard({ round, isLatest }: { round: RoundRecord; isLatest: boolean }) {
  const isJailbreak = round.score !== null && round.score < SCORE_THRESHOLDS.JAILBREAK;

  return (
    <div className={cn(
      "group relative p-3 rounded-lg border bg-slate-900/40 transition-all duration-300",
      isLatest ? "border-slate-700 shadow-sm" : "border-slate-800/50 opacity-70 grayscale-[0.5]",
      isJailbreak && "border-red-500/30 bg-red-500/5 opacity-100 grayscale-0"
    )}>
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className={cn(
          "text-[9px] font-mono h-4 px-1.5",
          isJailbreak ? "border-red-500 text-red-500" : "border-slate-700 text-slate-500"
        )}>
          ROUND {round.round_id}
        </Badge>
        {isJailbreak && (
          <span className="text-[10px] font-bold text-red-500 animate-pulse flex items-center gap-1">
            <Skull className="w-3 h-3" /> EXFILTRATED
          </span>
        )}
      </div>
      
      <div className="relative">
        <p className="text-xs font-mono text-slate-300 leading-relaxed break-words line-clamp-4 group-hover:line-clamp-none transition-all">
          {round.attack}
        </p>
      </div>
      
      {!round.attack && isLatest && (
        <div className="space-y-2">
          <div className="h-3 w-full bg-slate-800 animate-pulse rounded" />
          <div className="h-3 w-2/3 bg-slate-800 animate-pulse rounded" />
        </div>
      )}
    </div>
  );
}
