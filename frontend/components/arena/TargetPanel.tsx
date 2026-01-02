// frontend/components/arena/TargetPanel.tsx
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, ShieldCheck, Lock, Activity, RefreshCw } from "lucide-react";
import { RoundRecord, SCORE_THRESHOLDS } from "@/lib/types";
import { maskSecretsInString } from "@/lib/maskSecret";

interface TargetPanelProps {
  rounds: RoundRecord[];
  currentPrompt: string | null;
  isActive: boolean;
  className?: string;
  knownSecret?: string;
}

export function TargetPanel({
  rounds,
  currentPrompt,
  isActive,
  className,
  knownSecret,
}: TargetPanelProps) {
  // Calculate metrics
  const totalRounds = rounds.length;
  const blockedCount = rounds.filter(r => r.score !== null && r.score >= SCORE_THRESHOLDS.JAILBREAK).length;
  const defenseRate = totalRounds > 0 ? (blockedCount / totalRounds) * 100 : 0;
  const fixCount = rounds.filter(r => r.verification && r.verification.success).length;

  return (
    <Card
      className={cn(
        "flex flex-col h-full bg-slate-950/50 border-slate-800 transition-all duration-500",
        isActive && "border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]",
        className
      )}
    >
      <CardHeader className="pb-3 border-b border-slate-900">
        <CardTitle className="flex items-center gap-2 text-blue-500 font-mono tracking-tight">
          <Shield className={cn("w-5 h-5", isActive && "animate-spin-slow")} />
          BLUE TEAM / TARGET
          {isActive && (
            <Badge className="ml-auto bg-blue-500 animate-pulse text-[10px] py-0 px-2 h-5">
              DEFENDING
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 pt-4 overflow-hidden">
        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-2">
          <MetricItem
            label="Blocks"
            value={blockedCount}
            icon={<ShieldCheck className="w-3 h-3 text-green-500" />}
          />
          <MetricItem
            label="Def. Rate"
            value={`${defenseRate.toFixed(0)}%`}
            icon={<Activity className="w-3 h-3 text-blue-400" />}
          />
          <MetricItem
            label="Patches"
            value={fixCount}
            icon={<RefreshCw className="w-3 h-3 text-blue-400" />}
            highlight={fixCount > 0}
          />
        </div>

        {/* System Prompt View */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> Current System Rules
            </h3>
            {fixCount > 0 && <Badge variant="secondary" className="text-[8px] h-3 uppercase bg-green-500/20 text-green-400 border-none">Hardened</Badge>}
          </div>
          <div className="max-h-24 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
            <p className="text-[11px] font-mono text-blue-400 leading-relaxed italic">
              {currentPrompt ? maskSecretsInString(currentPrompt, knownSecret) : "Loading security context..."}
            </p>
          </div>
        </div>

        {/* Response History */}
        <div className="flex-1 flex flex-col min-h-0">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">Response Feed</h3>
          <ScrollArea className="flex-1 pr-4 -mr-4">
            <div className="space-y-3 pb-4">
              {rounds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-700">
                  <Shield className="w-8 h-8 mb-2 opacity-20" />
                  <p className="text-xs font-mono">Monitoring target interface...</p>
                </div>
              ) : (
                [...rounds].reverse().map((round, index) => (
                  <ResponseCard key={round.round_id ?? `round-${index}`} round={round} isLatest={index === 0} knownSecret={knownSecret} />
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
      "bg-slate-900/80 border border-slate-800 rounded-md p-2 flex flex-col items-center justify-center",
      highlight && "border-blue-500/30 bg-blue-500/5"
    )}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <span className={cn("text-sm font-bold font-mono", highlight ? "text-blue-400" : "text-slate-200")}>{value}</span>
      </div>
      <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">{label}</span>
    </div>
  );
}

function ResponseCard({ round, isLatest, knownSecret }: { round: RoundRecord; isLatest: boolean; knownSecret?: string }) {
  const isJailbreak = round.score !== null && round.score < SCORE_THRESHOLDS.JAILBREAK;

  return (
    <div className={cn(
      "p-3 rounded-lg border bg-slate-900/40 transition-all duration-300",
      isLatest ? "border-slate-700 shadow-sm" : "border-slate-800/50 opacity-70",
      isJailbreak ? "border-red-500/20" : "border-green-500/10"
    )}>
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className={cn(
          "text-[9px] font-mono h-4 px-1.5",
          isJailbreak ? "border-red-500 text-red-500" : "border-green-500 text-green-500"
        )}>
          {isJailbreak ? "VULNERABLE" : "SAFE"}
        </Badge>
        <span className="text-[9px] font-mono text-slate-600">RT: {new Date(round.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </div>
      
      <p className="text-xs font-sans text-slate-300 leading-relaxed whitespace-pre-wrap">
        {round.response ? maskSecretsInString(round.response, knownSecret) : (isLatest ? "Processing input..." : "No response logged")}
      </p>

      {round.judge_reasoning && (
        <div className="mt-3 pt-3 border-t border-slate-800/50">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight mb-1">Judge Analysis</p>
          <p className="text-[10px] text-slate-400 italic line-clamp-2 hover:line-clamp-none transition-all cursor-help">
            "{maskSecretsInString(round.judge_reasoning, knownSecret)}"
          </p>
        </div>
      )}
    </div>
  );
}
