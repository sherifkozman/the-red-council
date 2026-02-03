'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, BarChart3, Hash, Percent, ShieldAlert } from 'lucide-react';
import type { ToolCallEvent } from '@/lib/demo/demoData';

// Thresholds matching Streamlit implementation
export const LOOP_THRESHOLD = 3;
export const EXCESSIVE_CALLS_THRESHOLD = 10;

export interface ToolNode {
  name: string;
  callCount: number;
  successCount: number;
  errorCount: number;
  totalDurationMs: number;
  isLoop: boolean;
  isExcessive: boolean;
  isAsi01Violation: boolean;
}

export interface ToolEdge {
  source: string;
  target: string;
  count: number;
}

export interface ChainAnalysis {
  nodes: Map<string, ToolNode>;
  edges: ToolEdge[];
  loopsDetected: string[];
  excessiveTools: string[];
  asi01Violations: string[];
  totalCalls: number;
  uniqueTools: number;
  errorRate: number;
}

/**
 * Analyze tool call sequence for patterns and violations.
 * Ports logic from src/ui/components/tool_chain.py
 */
export function analyzeToolChain(toolCalls: ToolCallEvent[]): ChainAnalysis {
  if (toolCalls.length === 0) {
    return {
      nodes: new Map(),
      edges: [],
      loopsDetected: [],
      excessiveTools: [],
      asi01Violations: [],
      totalCalls: 0,
      uniqueTools: 0,
      errorRate: 0,
    };
  }

  // Sort by timestamp to ensure chronological order
  const sortedCalls = [...toolCalls].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    // Handle invalid timestamps - maintain original order
    if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
      return 0;
    }
    return timeA - timeB;
  });

  // Build node statistics
  const nodes = new Map<string, ToolNode>();
  for (const call of sortedCalls) {
    const name = call.tool_name;
    const existing = nodes.get(name);
    if (!existing) {
      nodes.set(name, {
        name,
        callCount: 1,
        successCount: call.success ? 1 : 0,
        errorCount: call.success ? 0 : 1,
        totalDurationMs: call.duration_ms,
        isLoop: false,
        isExcessive: false,
        isAsi01Violation: false,
      });
    } else {
      nodes.set(name, {
        ...existing,
        callCount: existing.callCount + 1,
        successCount: existing.successCount + (call.success ? 1 : 0),
        errorCount: existing.errorCount + (call.success ? 0 : 1),
        totalDurationMs: existing.totalDurationMs + call.duration_ms,
      });
    }
  }

  // Detect loops (same tool called >3x consecutively)
  const loopsDetected: string[] = [];
  if (sortedCalls.length >= LOOP_THRESHOLD) {
    let consecutiveCount = 1;
    let prevTool = sortedCalls[0].tool_name;
    for (let i = 1; i < sortedCalls.length; i++) {
      const call = sortedCalls[i];
      if (call.tool_name === prevTool) {
        consecutiveCount++;
        if (consecutiveCount > LOOP_THRESHOLD && !loopsDetected.includes(prevTool)) {
          loopsDetected.push(prevTool);
          const node = nodes.get(prevTool);
          if (node) {
            nodes.set(prevTool, {
              ...node,
              isLoop: true,
              isAsi01Violation: true,
            });
          }
        }
      } else {
        consecutiveCount = 1;
        prevTool = call.tool_name;
      }
    }
  }

  // Detect excessive calls (>10 total)
  const excessiveTools: string[] = [];
  for (const [name, node] of nodes) {
    if (node.callCount > EXCESSIVE_CALLS_THRESHOLD) {
      excessiveTools.push(name);
      nodes.set(name, {
        ...node,
        isExcessive: true,
        isAsi01Violation: true,
      });
    }
  }

  // ASI01 violations = loops OR excessive calls
  const asi01Violations = [...new Set([...loopsDetected, ...excessiveTools])];

  // Build edges (transitions between tools)
  const edgeCounts = new Map<string, number>();
  for (let i = 0; i < sortedCalls.length - 1; i++) {
    const src = sortedCalls[i].tool_name;
    const dst = sortedCalls[i + 1].tool_name;
    const key = `${src}|${dst}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }

  const edges: ToolEdge[] = [];
  for (const [key, count] of edgeCounts) {
    const [source, target] = key.split('|');
    edges.push({ source, target, count });
  }

  // Calculate error rate
  const totalCalls = sortedCalls.length;
  const errorCount = sortedCalls.filter((c) => !c.success).length;
  const errorRate = totalCalls > 0 ? errorCount / totalCalls : 0;

  return {
    nodes,
    edges,
    loopsDetected,
    excessiveTools,
    asi01Violations,
    totalCalls,
    uniqueTools: nodes.size,
    errorRate,
  };
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger';
  delta?: string;
}

function StatCard({ title, value, icon, variant = 'default', delta }: StatCardProps) {
  return (
    <Card
      className={cn(
        'transition-colors',
        variant === 'warning' && 'border-yellow-500/50 bg-yellow-500/5',
        variant === 'danger' && 'border-red-500/50 bg-red-500/5'
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div
          className={cn(
            'text-muted-foreground',
            variant === 'warning' && 'text-yellow-500',
            variant === 'danger' && 'text-red-500'
          )}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {delta && (
          <Badge
            variant={variant === 'danger' ? 'destructive' : variant === 'warning' ? 'outline' : 'secondary'}
            className="mt-1"
          >
            {delta}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

interface ToolStatsProps {
  analysis: ChainAnalysis;
  className?: string;
}

/**
 * Summary statistics for tool chain analysis.
 * Shows total calls, unique tools, error rate, and ASI01 violations.
 */
export function ToolStats({ analysis, className }: ToolStatsProps) {
  const violationCount = analysis.asi01Violations.length;

  return (
    <div
      className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}
      role="region"
      aria-label="Tool chain statistics"
    >
      <StatCard
        title="Total Calls"
        value={analysis.totalCalls}
        icon={<Hash className="h-4 w-4" aria-hidden="true" />}
      />
      <StatCard
        title="Unique Tools"
        value={analysis.uniqueTools}
        icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
      />
      <StatCard
        title="Error Rate"
        value={`${(analysis.errorRate * 100).toFixed(1)}%`}
        icon={<Percent className="h-4 w-4" aria-hidden="true" />}
        variant={analysis.errorRate > 0.1 ? 'warning' : 'default'}
        delta={analysis.errorRate > 0.1 ? 'Above 10%' : undefined}
      />
      <StatCard
        title="ASI01 Violations"
        value={violationCount}
        icon={
          violationCount > 0 ? (
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          )
        }
        variant={violationCount > 0 ? 'danger' : 'default'}
        delta={violationCount > 0 ? 'Detected' : undefined}
      />
    </div>
  );
}
