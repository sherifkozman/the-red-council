"use client";

import { useEffect, useState } from "react";
import { LLMDemoPlayer } from "@/components/demo/LLMDemoPlayer";
import { Skeleton } from "@/components/ui/skeleton";

export default function LLMDemoPage() {
  const [script, setScript] = useState(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/demo-data/llm-battle.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load demo data");
        return res.json();
      })
      .then(setScript)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-destructive">Error: {error}</p>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return <LLMDemoPlayer script={script} />;
}
