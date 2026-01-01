// frontend/components/arena/RoundCard.tsx
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ShieldCheck, 
  AlertCircle, 
  History, 
  MessageSquare,
  Scale
} from "lucide-react";
import { RoundRecord, SCORE_THRESHOLDS } from "@/lib/types";

interface RoundCardProps {
  round: RoundRecord;
  defaultOpen?: boolean;
}

export function RoundCard({ round, defaultOpen = false }: RoundCardProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const isJailbreak = round.score !== null && round.score < SCORE_THRESHOLDS.JAILBREAK;
  const isFixed = round.verification && round.verification.success;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "w-full border rounded-lg overflow-hidden transition-all duration-300",
        isJailbreak ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900/40",
        isFixed && "border-green-500/30 bg-green-500/5"
      )}
    >
      <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors group">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs",
            isJailbreak ? "bg-red-500 text-white" : "bg-slate-800 text-slate-400"
          )}>
            {round.round_id}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-200 uppercase tracking-tight">Round Analysis</span>
              <Badge variant={isJailbreak ? "destructive" : "secondary"} className="text-[10px] h-4">
                {isJailbreak ? "BREACH DETECTED" : "SAFE"}
              </Badge>
              {isFixed && (
                <Badge className="bg-green-600 text-white text-[10px] h-4">PATCHED</Badge>
              )}
            </div>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              {new Date(round.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {round.score !== null && (
            <div className="flex flex-col items-end">
              <span className={cn(
                "text-lg font-black font-mono leading-none",
                isJailbreak ? "text-red-500" : "text-green-500"
              )}>{round.score}</span>
              <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Score</span>
            </div>
          )}
          <ChevronDown className={cn(
            "w-4 h-4 text-slate-600 transition-transform duration-300",
            isOpen && "rotate-180"
          )} />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="p-4 pt-0 space-y-4">
        <div className="h-px bg-slate-800/50 mb-4" />
        
        {/* The Attack */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-red-400">
            <History className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Adversarial Input</span>
          </div>
          <div className="p-3 bg-slate-950/50 rounded border border-slate-800/50">
            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              {round.attack}
            </p>
          </div>
        </div>

        {/* The Response */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-blue-400">
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Target Output</span>
          </div>
          <div className="p-3 bg-slate-950/50 rounded border border-slate-800/50">
            <p className="text-xs font-sans text-slate-300 leading-relaxed whitespace-pre-wrap">
              {round.response}
            </p>
          </div>
        </div>

        {/* Judge Verdict */}
        {round.judge_reasoning && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-yellow-500">
              <Scale className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Judge Verdict</span>
            </div>
            <div className="p-3 bg-yellow-500/5 rounded border border-yellow-500/10">
              <p className="text-xs italic text-yellow-200/80">
                "{round.judge_reasoning}"
              </p>
            </div>
          </div>
        )}

        {/* Defense & Verification */}
        {(round.defense || round.verification) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {round.defense && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-blue-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Applied Patch</span>
                </div>
                <div className="p-2 bg-blue-500/5 rounded border border-blue-500/10 max-h-32 overflow-y-auto">
                  <p className="text-[10px] font-mono text-blue-300 leading-tight">
                    {round.defense.hardened_prompt}
                  </p>
                </div>
              </div>
            )}
            
            {round.verification && (
              <div className="space-y-2">
                <div className={cn(
                  "flex items-center gap-1.5",
                  round.verification.success ? "text-green-400" : "text-red-400"
                )}>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Verification Result</span>
                </div>
                <div className={cn(
                  "p-2 rounded border",
                  round.verification.success ? "bg-green-500/5 border-green-500/10" : "bg-red-500/5 border-red-500/10"
                )}>
                  <p className="text-[10px] font-medium text-slate-300 mb-1">
                    {round.verification.reasoning}
                  </p>
                  <Badge className={cn(
                    "text-[8px] h-3 uppercase border-none",
                    round.verification.success ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                  )}>
                    Score: {round.verification.score}/10
                  </Badge>
                </div>
              </div>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
