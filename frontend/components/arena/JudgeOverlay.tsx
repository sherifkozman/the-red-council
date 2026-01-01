// frontend/components/arena/JudgeOverlay.tsx
"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, AlertTriangle, ShieldCheck, XOctagon } from "lucide-react";
import { SCORE_THRESHOLDS } from "@/lib/types";

interface JudgeOverlayProps {
  score: number;
  reasoning: string;
  className?: string;
}

export function JudgeOverlay({ score, reasoning, className }: JudgeOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [score, reasoning]);

  if (!visible) return null;

  const isJailbreak = score < SCORE_THRESHOLDS.JAILBREAK;
  const isWarning = score < SCORE_THRESHOLDS.SAFE;

  return (
    <div className={cn(
      "fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4 transition-all duration-500",
      visible ? "opacity-100 scale-100" : "opacity-0 scale-95",
      className
    )}>
      {/* Backdrop Blur */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md" />

      <Card className={cn(
        "relative w-full max-w-lg bg-slate-900 border-2 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden",
        isJailbreak ? "border-red-500 shadow-red-500/20" : 
        isWarning ? "border-yellow-500 shadow-yellow-500/20" : 
        "border-green-500 shadow-green-500/20"
      )}>
        {/* Animated Scan Line */}
        <div className={cn(
          "absolute inset-x-0 top-0 h-px bg-white z-10 animate-scan",
          isJailbreak ? "bg-red-400" : isWarning ? "bg-yellow-400" : "bg-green-400"
        )} />

        <div className="p-6 flex flex-col items-center text-center">
          <div className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform duration-700 animate-in zoom-in spin-in-90",
            isJailbreak ? "bg-red-500 text-white" : 
            isWarning ? "bg-yellow-500 text-slate-950" : 
            "bg-green-500 text-white"
          )}>
            {isJailbreak ? <XOctagon className="w-8 h-8" /> : 
             isWarning ? <AlertTriangle className="w-8 h-8" /> : 
             <ShieldCheck className="w-8 h-8" />}
          </div>

          <h2 className={cn(
            "text-2xl font-black font-mono tracking-tighter mb-1",
            isJailbreak ? "text-red-500" : isWarning ? "text-yellow-500" : "text-green-500"
          )}>
            {isJailbreak ? "SECURITY BREACH" : isWarning ? "POLICY WARNING" : "SECURITY CLEARANCE"}
          </h2>
          
          <div className="flex items-center gap-2 mb-4">
            <Scale className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Judge Verdict</span>
          </div>

          <div className="flex items-baseline gap-1 mb-6">
            <span className={cn(
              "text-6xl font-black font-mono",
              isJailbreak ? "text-red-500" : isWarning ? "text-yellow-500" : "text-green-500"
            )}>{score}</span>
            <span className="text-xl font-bold text-slate-700">/10</span>
          </div>

          <Badge variant="outline" className="mb-4 bg-slate-950/50 border-slate-800 text-slate-400 px-4 py-1">
            {isJailbreak ? "Critical Vulnerability" : isWarning ? "Potential Risk" : "No Leak Detected"}
          </Badge>

          <p className="text-sm text-slate-300 font-medium leading-relaxed max-w-sm">
            {reasoning}
          </p>
        </div>

        {/* Footer info */}
        <div className="bg-slate-950/50 border-t border-slate-800 p-3 flex justify-center gap-6">
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full", isJailbreak ? "bg-red-500" : "bg-slate-700")} />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Secret Integrity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full", isWarning ? "bg-yellow-500" : "bg-green-500")}  />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Policy Compliance</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
