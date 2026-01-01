// frontend/components/arena/FinalOutcome.tsx
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Trophy, 
  ShieldAlert, 
  ShieldCheck, 
  Download, 
  RefreshCcw,
  ArrowRight,
  ExternalLink
} from "lucide-react";
import { ArenaState, STATUS_COLORS } from "@/lib/types";
import Link from "next/link";

interface FinalOutcomeProps {
  state: ArenaState;
}

export function FinalOutcome({ state }: FinalOutcomeProps) {
  const rounds = state.rounds ?? [];
  const isVulnerable = state.status === "VULNERABLE";
  const isFixed = state.status === "FIXED" || state.status === "SECURE";
  
  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `arena-report-${state.run_id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-500">
      <Card className="w-full max-w-2xl bg-slate-900 border-slate-800 shadow-2xl shadow-black/50 overflow-hidden">
        <div className={cn(
          "h-2 w-full",
          isFixed ? "bg-green-500" : isVulnerable ? "bg-red-500" : "bg-blue-500"
        )} />
        
        <CardHeader className="text-center pt-8">
          <div className="flex justify-center mb-4">
            <div className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center shadow-lg",
              isFixed ? "bg-green-500/20 text-green-500" : 
              isVulnerable ? "bg-red-500/20 text-red-500" : 
              "bg-blue-500/20 text-blue-500"
            )}>
              {isFixed ? <ShieldCheck className="w-10 h-10" /> : 
               isVulnerable ? <ShieldAlert className="w-10 h-10" /> : 
               <Trophy className="w-10 h-10" />}
            </div>
          </div>
          
          <CardTitle className="text-3xl font-black font-mono tracking-tighter uppercase">
            Campaign {state.status}
          </CardTitle>
          <CardDescription className="text-slate-400 font-medium max-w-md mx-auto">
            The adversarial simulation has concluded. Detailed results and hardened logic are available for review.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Summary Metrics</h4>
              <div className="space-y-2">
                <MetricRow label="Total Rounds" value={state.max_rounds} />
                <MetricRow label="Breaches Detected" value={rounds.filter(r => r.score !== null && r.score < 5).length} />
                <MetricRow label="Defense Cycles" value={`${state.defense_cycle_count}/${state.max_defense_cycles}`} />
                <MetricRow label="Final Posture" value={state.status} highlight={state.status === "FIXED" || state.status === "SECURE"} />
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Infrastructure</h4>
              <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Orchestrator</span>
                  <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400">Gemini 3 Pro</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Attacker</span>
                  <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400">Llama 3.1 405B</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Knowledge Base</span>
                  <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400">100+ Samples</Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="bg-slate-950/50 border-t border-slate-800 p-6 flex flex-wrap gap-3 justify-center">
          <Button asChild variant="outline" className="border-slate-700 hover:bg-slate-800">
            <Link href="/">
              <RefreshCcw className="w-4 h-4 mr-2" /> New Campaign
            </Link>
          </Button>
          
          <Button onClick={handleDownload} className="bg-blue-600 hover:bg-blue-500 text-white">
            <Download className="w-4 h-4 mr-2" /> Download Report
          </Button>
          
          <Button asChild className="bg-slate-100 hover:bg-white text-slate-950 font-bold">
            <Link href={`https://github.com/sherifkozman/the-red-council`} target="_blank">
              <ExternalLink className="w-4 h-4 mr-2" /> View Repo
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function MetricRow({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded bg-slate-800/30 border border-slate-800/50">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">{label}</span>
      <span className={cn(
        "text-xs font-black font-mono tracking-tight",
        highlight ? "text-green-400" : "text-slate-200"
      )}>{value}</span>
    </div>
  );
}
