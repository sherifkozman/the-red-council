// frontend/app/arena/[runId]/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useArenaState } from "@/hooks/useArenaState";
import { BattleArena } from "@/components/arena/BattleArena";
import { FinalOutcome } from "@/components/arena/FinalOutcome";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Shield, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RoundProgress } from "@/components/arena/RoundProgress";

export default function ArenaPage() {
  const router = useRouter();
  const { runId } = useParams() as { runId: string };
  const { state, error, isComplete } = useArenaState(runId);
  const [knownSecret, setKnownSecret] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Retrieve secret for masking
    const stored = sessionStorage.getItem(`secret_${runId}`);
    if (stored) {
      setKnownSecret(stored);
    }
  }, [runId]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 bg-slate-950" role="alert">
        <Card className="max-w-md w-full p-8 border-red-500/20 bg-slate-900 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Tactical Link Failure</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <Button 
            onClick={() => router.push("/")}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold"
          >
            Return to Command Center
          </Button>
        </Card>
      </div>
    );
  }

  if (!state) {
    return <ArenaLoadingSkeleton />;
  }

  return (
    <main className="h-screen max-h-screen bg-slate-950 text-slate-200 overflow-hidden flex flex-col">
      {/* Header Bar */}
      <header className="flex-shrink-0 h-14 border-b border-slate-900 bg-slate-900/50 flex items-center justify-between px-6 z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-md">
            <Shield className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-black font-mono tracking-wider text-blue-400 uppercase">
              The Red Council
            </span>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest hidden sm:block">
            UPLINK: <span className="text-green-500">ACTIVE</span> / ID: {runId.slice(0, 8)}...
          </span>
        </div>

        <div className="flex items-center gap-6">
          <RoundProgress 
            currentRound={state.current_round} 
            maxRounds={state.max_rounds} 
          />
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all flex gap-2"
            onClick={() => router.push("/")}
          >
            <XCircle className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Abort</span>
          </Button>
        </div>
      </header>

      {/* Main Battle Content */}
      <div className="flex-1 min-h-0 relative">
        <BattleArena state={state} knownSecret={knownSecret} />
      </div>

      {/* Final Outcome Overlay */}
      {isComplete && <FinalOutcome state={state} />}
    </main>
  );
}

function ArenaLoadingSkeleton() {
  return (
    <div className="h-screen bg-slate-950 flex flex-col p-6 gap-6">
      <Skeleton className="h-20 w-full bg-slate-900" />
      <div className="flex-1 grid grid-cols-2 gap-6">
        <Skeleton className="h-full w-full bg-slate-900" />
        <Skeleton className="h-full w-full bg-slate-900" />
      </div>
      <Skeleton className="h-32 w-full bg-slate-900" />
    </div>
  );
}
