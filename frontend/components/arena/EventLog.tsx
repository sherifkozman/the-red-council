// frontend/components/arena/EventLog.tsx
"use client";

import React, { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from "lucide-react";

interface EventLogProps {
  logs: string[];
}

export function EventLog({ logs }: EventLogProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom when new logs arrive
    if (viewportRef.current) {
      const scrollContainer = viewportRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-inner">
      <div className="bg-slate-900 border-b border-slate-800 p-2 flex items-center gap-2">
        <Terminal className="w-3 h-3 text-slate-500" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Arena Event Log</span>
        <div className="flex gap-1 ml-auto">
          <div className="w-2 h-2 rounded-full bg-slate-800" />
          <div className="w-2 h-2 rounded-full bg-slate-800" />
          <div className="w-2 h-2 rounded-full bg-slate-800" />
        </div>
      </div>
      
      <ScrollArea 
        ref={viewportRef} 
        className="flex-1 p-3" 
        role="log" 
        aria-live="polite" 
        aria-relevant="additions"
      >
        <div className="space-y-1" aria-live="polite" aria-label="Event log updates">
          {logs.length === 0 ? (
            <div className="text-[10px] text-slate-700 font-mono italic animate-pulse">
              {'>'} Initializing logging system...
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex gap-2 text-[10px] font-mono leading-relaxed group">
                <span className="text-slate-600 select-none shrink-0">[{index.toString().padStart(3, '0')}]</span>
                <span className="text-slate-400 group-hover:text-slate-200 transition-colors">
                  <span className="text-blue-500">{'>'}</span> {log}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
