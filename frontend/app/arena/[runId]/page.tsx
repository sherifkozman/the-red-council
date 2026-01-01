// frontend/app/arena/[runId]/page.tsx
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useArenaState } from "@/hooks/useArenaState";
import { BattleArena } from "@/components/arena/BattleArena";
import { EventLog } from "@/components/arena/EventLog";
import { RoundHistory } from "@/components/arena/RoundHistory";
import { FinalOutcome } from "@/components/arena/FinalOutcome";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Terminal, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function ArenaPage() {
  const { runId } = useParams() as { runId: string };
  const { state, error, isComplete } = useArenaState(runId);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 bg-slate-950" role="alert" aria-live="assertive">
        <Card className="max-w-md w-full p-8 border-red-500/20 bg-slate-900 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Connection Error</h1>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <a href="/" className="text-blue-400 hover:text-blue-300 font-bold text-xs uppercase tracking-widest underline">
            Return to Command Center
          </a>
        </Card>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex flex-col h-screen bg-slate-950 p-6 overflow-hidden gap-6">
        <div className="h-20 w-full mb-4">
          <Skeleton className="h-full w-full bg-slate-900 rounded-xl" />
        </div>
        <div className="flex-1 grid grid-cols-2 gap-6">
          <Skeleton className="h-full w-full bg-slate-900 rounded-xl" />
          <Skeleton className="h-full w-full bg-slate-900 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col h-screen bg-slate-950 overflow-hidden text-slate-200">
      {/* Header Info */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black font-mono tracking-tighter uppercase leading-none">The Red Council</h1>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Adversarial Security Arena</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[9px] font-bold text-slate-500 uppercase">Current Run ID</span>
            <span className="text-[10px] font-mono text-blue-400">{runId}</span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Uplink Active</span>
          </div>
        </div>
      </header>

      {/* Main Battle Section */}
      <div className="flex-1 flex min-h-0 p-6 gap-6">
        {/* Left Side: Battle Arena */}
        <div className="flex-[3] flex flex-col min-h-0">
          <BattleArena state={state} />
        </div>

        {/* Right Side: History & Logs */}
        <div className="flex-[1] flex flex-col gap-6 min-w-[320px]">
          {/* History */}
          <div className="flex-[3] min-h-0">
            <RoundHistory rounds={state.rounds ?? []} />
          </div>

          {/* Logs */}
          <div className="flex-[2] min-h-0">
            <EventLog logs={state.logs ?? []} />
          </div>
        </div>
      </div>

      {/* Final Outcome Modal */}
      {isComplete && state.state === "DONE" && (
        <FinalOutcome state={state} />
      )}
    </main>
  );
}
