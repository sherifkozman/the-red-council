"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Plug,
  Activity,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

interface TimelineEvent {
  at: number;
  type: string;
  owasp?: string;
  name?: string;
  vulnerable?: boolean;
  severity?: number;
}

interface DemoTimelineProps {
  events: TimelineEvent[];
  currentTime: number;
  className?: string;
}

const eventConfig: Record<
  string,
  { icon: typeof Plug; color: string; label: (e: TimelineEvent) => string }
> = {
  agent_connected: {
    icon: Plug,
    color: "text-green-500",
    label: () => "Agent connected",
  },
  baseline_established: {
    icon: Activity,
    color: "text-blue-500",
    label: () => "Baseline established",
  },
  test_start: {
    icon: ShieldAlert,
    color: "text-yellow-500",
    label: (e) => `Testing ${e.owasp}: ${e.name}`,
  },
  attack_sent: {
    icon: AlertTriangle,
    color: "text-orange-500",
    label: (e) => `Attack sent for ${e.owasp}`,
  },
  agent_response: {
    icon: Activity,
    color: "text-blue-400",
    label: (e) => `Agent responded to ${e.owasp}`,
  },
  test_result: {
    icon: ShieldCheck,
    color: "text-green-500",
    label: (e) =>
      e.vulnerable
        ? `VULNERABLE: ${e.owasp} (Severity: ${e.severity}/10)`
        : `PASSED: ${e.owasp}`,
  },
  complete: {
    icon: CheckCircle,
    color: "text-primary",
    label: () => "Campaign complete",
  },
};

export function DemoTimeline({
  events,
  currentTime,
  className,
}: DemoTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const visibleEvents = events.filter((e) => e.at <= currentTime);

  return (
    <div
      ref={scrollRef}
      className={cn("overflow-y-auto space-y-2", className)}
    >
      {visibleEvents.map((event, index) => {
        const config = eventConfig[event.type];
        if (!config) return null;

        const Icon = config.icon;
        const isVulnerable =
          event.type === "test_result" && event.vulnerable;

        return (
          <div
            key={`${event.type}-${event.at}-${index}`}
            className={cn(
              "flex items-start gap-3 p-2 rounded-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-300",
              isVulnerable && "bg-red-500/10"
            )}
          >
            <div
              className={cn(
                "mt-0.5",
                isVulnerable ? "text-red-500" : config.color
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm",
                  isVulnerable && "text-red-600 dark:text-red-400 font-medium"
                )}
              >
                {config.label(event)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTime(event.at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
