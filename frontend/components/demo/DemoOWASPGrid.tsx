"use client";

import { cn } from "@/lib/utils";
import { OWASP_CATEGORIES } from "@/data/owasp-categories";

type CellStatus = "not_tested" | "testing" | "passed" | "vulnerable";

interface DemoOWASPGridProps {
  statuses: Record<string, CellStatus>;
  className?: string;
}

export function DemoOWASPGrid({ statuses, className }: DemoOWASPGridProps) {
  return (
    <div className={cn("grid grid-cols-5 gap-2", className)}>
      {OWASP_CATEGORIES.slice(0, 10).map((category) => {
        const status = statuses[category.code] || "not_tested";

        return (
          <div
            key={category.code}
            className={cn(
              "aspect-square rounded-lg flex flex-col items-center justify-center text-center p-2 transition-all duration-500",
              status === "not_tested" && "bg-muted/50 text-muted-foreground",
              status === "testing" &&
                "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 ring-2 ring-yellow-500 animate-pulse",
              status === "passed" &&
                "bg-green-500/20 text-green-600 dark:text-green-400",
              status === "vulnerable" &&
                "bg-red-500/20 text-red-600 dark:text-red-400"
            )}
          >
            <span className="text-xs font-bold">{category.code}</span>
            <span className="text-[10px] mt-1">
              {status === "not_tested" && "—"}
              {status === "testing" && "Testing..."}
              {status === "passed" && "Pass"}
              {status === "vulnerable" && "Vuln"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
