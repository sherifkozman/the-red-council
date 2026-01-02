// frontend/components/arena/EventLog.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "lucide-react";
import { maskSecretsInString } from "@/lib/maskSecret";

interface EventLogProps {
  logs: string[];
}

export function EventLog({ logs }: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Check if user is near bottom
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const atBottom = scrollHeight - scrollTop - clientHeight < 50;
      setIsAtBottom(atBottom);
    }
  };

  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      // Throttle scroll using requestAnimationFrame
      let ticking = false;
      
      const scroll = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        ticking = false;
      };

      if (!ticking) {
        requestAnimationFrame(scroll);
        ticking = true;
      }
    }
  }, [logs, isAtBottom]);

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-inner">
      <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 p-2 flex items-center gap-2">
        <Terminal className="w-3 h-3 text-slate-500" />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Arena Event Log</span>
        <div className="flex gap-1 ml-auto">
          {!isAtBottom && (
            <span className="text-[8px] text-blue-400 animate-pulse font-bold uppercase mr-2">New logs below</span>
          )}
          <div className="w-2 h-2 rounded-full bg-slate-800" />
          <div className="w-2 h-2 rounded-full bg-slate-800" />
          <div className="w-2 h-2 rounded-full bg-slate-800" />
        </div>
      </div>
      
      {/* Fixed height scrollable container */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 min-h-0 scrollbar-thin scrollbar-thumb-slate-800"
        role="log" 
        aria-live="polite" 
      >
        <div className="space-y-1" aria-label="Event log updates">
          {logs.length === 0 ? (
            <div className="text-[10px] text-slate-700 font-mono italic animate-pulse">
              {'>'} Initializing logging system...
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex gap-2 text-[10px] font-mono leading-relaxed group">
                <span className="text-slate-600 select-none shrink-0">[{index.toString().padStart(3, '0')}]</span>
                <span className="text-slate-400 group-hover:text-slate-200 transition-colors break-words">
                  <span className="text-blue-500">{'>'}</span> {maskSecretsInString(log)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
