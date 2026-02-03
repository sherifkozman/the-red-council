"use client";

import { cn } from "@/lib/utils";
import { OWASP_CATEGORIES } from "@/data/owasp-categories";
import {
  Shield,
  Eye,
  Plug,
  MessageSquareWarning,
  KeyRound,
  FileWarning,
  Brain,
  Target,
  ShieldOff,
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  Minus,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type CellStatus = "not_tested" | "testing" | "passed" | "vulnerable";

interface DemoOWASPGridProps {
  statuses: Record<string, CellStatus>;
  className?: string;
}

// Icons for each OWASP category
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ASI01: Shield,        // Excessive Agency
  ASI02: Eye,           // Inadequate Oversight
  ASI03: Plug,          // Vulnerable Integrations
  ASI04: MessageSquareWarning, // Prompt Injection
  ASI05: KeyRound,      // Improper Authorization
  ASI06: FileWarning,   // Data Disclosure
  ASI07: Brain,         // Insecure Memory
  ASI08: Target,        // Goal Misalignment
  ASI09: ShieldOff,     // Weak Guardrails
  ASI10: Bot,           // Over-Trust in LLMs
};

function StatusIcon({ status }: { status: CellStatus }) {
  switch (status) {
    case "testing":
      return <Loader2 className="w-4 h-4 animate-spin" />;
    case "passed":
      return <CheckCircle2 className="w-4 h-4" />;
    case "vulnerable":
      return <XCircle className="w-4 h-4" />;
    default:
      return <Minus className="w-4 h-4 opacity-40" />;
  }
}

export function DemoOWASPGrid({ statuses, className }: DemoOWASPGridProps) {
  return (
    <TooltipProvider>
      <div className={cn("grid grid-cols-2 md:grid-cols-5 gap-2", className)}>
        {OWASP_CATEGORIES.slice(0, 10).map((category) => {
          const status = statuses[category.code] || "not_tested";
          const Icon = CATEGORY_ICONS[category.code] || Shield;

          return (
            <Tooltip key={category.code}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "relative rounded-lg p-3 transition-all duration-300 cursor-help",
                    "flex flex-col gap-1.5 min-h-[80px]",
                    status === "not_tested" && "bg-muted/30 text-muted-foreground",
                    status === "testing" &&
                      "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 ring-1 ring-yellow-500/50",
                    status === "passed" &&
                      "bg-green-500/10 text-green-600 dark:text-green-400 ring-1 ring-green-500/30",
                    status === "vulnerable" &&
                      "bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/30"
                  )}
                >
                  {/* Header: Icon + Status */}
                  <div className="flex items-center justify-between">
                    <Icon className={cn(
                      "w-5 h-5",
                      status === "not_tested" && "opacity-40"
                    )} />
                    <StatusIcon status={status} />
                  </div>

                  {/* Category Name */}
                  <div className="flex-1">
                    <p className={cn(
                      "text-xs font-medium leading-tight",
                      status === "not_tested" && "opacity-60"
                    )}>
                      {category.name}
                    </p>
                  </div>

                  {/* Status Label */}
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "text-[10px] font-medium uppercase tracking-wide",
                      status === "testing" && "animate-pulse"
                    )}>
                      {status === "not_tested" && "Pending"}
                      {status === "testing" && "Testing..."}
                      {status === "passed" && "Secure"}
                      {status === "vulnerable" && "Vulnerable"}
                    </span>
                  </div>

                  {/* Pulse animation for testing */}
                  {status === "testing" && (
                    <div className="absolute inset-0 rounded-lg bg-yellow-500/10 animate-pulse" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[250px]">
                <p className="font-medium">{category.code}: {category.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {category.shortDescription}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
