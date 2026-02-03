'use client';

import * as React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCcw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import type { ToolCallEvent } from '@/lib/demo/demoData';
import {
  ToolStats,
  analyzeToolChain,
  LOOP_THRESHOLD,
  EXCESSIVE_CALLS_THRESHOLD,
  type ChainAnalysis,
  type ToolNode,
} from './ToolStats';

/** Safely parse and format a timestamp, returning fallback for invalid dates */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleTimeString();
}

/** Safely stringify JSON with fallback for circular refs or BigInt */
function safeStringify(obj: unknown, maxLength = 500): string {
  try {
    const str = JSON.stringify(
      obj,
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2
    );
    return str.length > maxLength ? str.slice(0, maxLength - 3) + '...' : str;
  } catch (error) {
    // Log for debugging without exposing details to user
    if (process.env.NODE_ENV === 'development') {
      console.warn('[safeStringify] Failed to serialize object:', error);
    }
    return '[Unable to display - complex data structure]';
  }
}

// Colors matching Streamlit implementation
const COLOR_NORMAL = '#3b82f6'; // Blue-500
const COLOR_WARNING = '#f59e0b'; // Amber-500
const COLOR_DANGER = '#ef4444'; // Red-500
const COLOR_SUCCESS = '#22c55e'; // Green-500

interface ToolChainProps {
  toolCalls: ToolCallEvent[];
  className?: string;
}

/**
 * Tool Chain Visualization component.
 * Shows tool call patterns with loop/excessive call detection.
 * Implements graceful fallback: Recharts → SVG → Text list
 */
export function ToolChain({ toolCalls, className }: ToolChainProps) {
  const [expandedTools, setExpandedTools] = React.useState<Set<string>>(new Set());
  const [renderMode, setRenderMode] = React.useState<'chart' | 'svg' | 'text'>('chart');

  const analysis = React.useMemo(() => analyzeToolChain(toolCalls), [toolCalls]);

  const toggleTool = React.useCallback((toolName: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  }, []);

  if (toolCalls.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No tool calls to display.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Stats */}
      <ToolStats analysis={analysis} />

      {/* Violation Warnings */}
      {analysis.asi01Violations.length > 0 && (
        <ViolationWarnings analysis={analysis} />
      )}

      {/* Render Mode Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">View:</span>
        <div className="flex gap-1">
          {(['chart', 'svg', 'text'] as const).map((mode) => (
            <Button
              key={mode}
              variant={renderMode === mode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRenderMode(mode)}
              aria-pressed={renderMode === mode}
            >
              {mode === 'chart' ? 'Chart' : mode === 'svg' ? 'Diagram' : 'List'}
            </Button>
          ))}
        </div>
      </div>

      {/* Visualization */}
      <Card>
        <CardHeader>
          <CardTitle>Tool Call Chain</CardTitle>
          <CardDescription>
            Visualization of tool call patterns and transitions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderMode === 'chart' && (
            <ErrorBoundary
              fallback={
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Chart visualization failed to render. Try switching to Diagram or List view.
                  </AlertDescription>
                </Alert>
              }
            >
              <ChartVisualization analysis={analysis} />
            </ErrorBoundary>
          )}
          {renderMode === 'svg' && <SvgVisualization analysis={analysis} />}
          {renderMode === 'text' && (
            <TextSequence
              toolCalls={toolCalls}
              analysis={analysis}
              expandedTools={expandedTools}
              toggleTool={toggleTool}
            />
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Legend />

      {/* Tool Statistics Details */}
      <ToolStatisticsDetails analysis={analysis} />
    </div>
  );
}

interface ViolationWarningsProps {
  analysis: ChainAnalysis;
}

function ViolationWarnings({ analysis }: ViolationWarningsProps) {
  return (
    <div className="space-y-3">
      {analysis.loopsDetected.length > 0 && (
        <Alert variant="destructive">
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Loop Patterns Detected</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc pl-4">
              {analysis.loopsDetected.map((tool) => {
                const node = analysis.nodes.get(tool);
                return (
                  <li key={tool}>
                    <strong>{tool}</strong>: Called {node?.callCount ?? 0} times with{' '}
                    &gt;{LOOP_THRESHOLD} consecutive calls (potential infinite loop)
                  </li>
                );
              })}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {analysis.excessiveTools.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Excessive Calls Detected</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc pl-4">
              {analysis.excessiveTools.map((tool) => {
                const node = analysis.nodes.get(tool);
                return (
                  <li key={tool}>
                    <strong>{tool}</strong>: Called {node?.callCount ?? 0} times (exceeds{' '}
                    {EXCESSIVE_CALLS_THRESHOLD} call threshold)
                  </li>
                );
              })}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>ASI01 Excessive Agency Detected</AlertTitle>
        <AlertDescription>
          {analysis.asi01Violations.length} tool(s) show abuse patterns. Review:{' '}
          {analysis.asi01Violations.join(', ')}
        </AlertDescription>
      </Alert>
    </div>
  );
}

interface ChartVisualizationProps {
  analysis: ChainAnalysis;
}

function ChartVisualization({ analysis }: ChartVisualizationProps) {
  const data = React.useMemo(() => {
    return Array.from(analysis.nodes.values())
      .map((node) => ({
        name: node.name.length > 15 ? node.name.slice(0, 12) + '...' : node.name,
        fullName: node.name,
        calls: node.callCount,
        errors: node.errorCount,
        avgDuration: node.callCount > 0 ? node.totalDurationMs / node.callCount : 0,
        isViolation: node.isAsi01Violation,
        hasErrors: node.errorCount > 0,
      }))
      .sort((a, b) => b.calls - a.calls);
  }, [analysis.nodes]);

  if (data.length === 0) {
    return <p className="text-center text-muted-foreground">No data to chart.</p>;
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 12 }}
            aria-label="Tool names"
          />
          <YAxis
            label={{ value: 'Call Count', angle: -90, position: 'insideLeft' }}
            aria-label="Number of calls"
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const item = payload[0]?.payload as (typeof data)[0] | undefined;
              if (!item) return null;
              return (
                <div className="rounded-lg border bg-background p-3 shadow-md">
                  <p className="font-medium">{item.fullName}</p>
                  <p className="text-sm text-muted-foreground">Calls: {item.calls}</p>
                  <p className="text-sm text-muted-foreground">Errors: {item.errors}</p>
                  <p className="text-sm text-muted-foreground">
                    Avg Duration: {item.avgDuration.toFixed(1)}ms
                  </p>
                  {item.isViolation && (
                    <Badge variant="destructive" className="mt-1">
                      ASI01 Violation
                    </Badge>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="calls" name="Calls" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.isViolation ? COLOR_DANGER : entry.hasErrors ? COLOR_WARNING : COLOR_NORMAL
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface SvgVisualizationProps {
  analysis: ChainAnalysis;
}

function SvgVisualization({ analysis }: SvgVisualizationProps) {
  const nodes = Array.from(analysis.nodes.values());
  const edges = analysis.edges;

  if (nodes.length === 0) {
    return <p className="text-center text-muted-foreground">No tools to visualize.</p>;
  }

  // Calculate positions for nodes in a circular layout
  const width = 600;
  const height = 400;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;

  const nodePositions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    nodePositions.set(node.name, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  });

  return (
    <div className="flex justify-center overflow-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-full"
        role="img"
        aria-label="Tool chain diagram showing transitions between tools"
      >
        {/* Edges */}
        {edges.map((edge, i) => {
          const source = nodePositions.get(edge.source);
          const target = nodePositions.get(edge.target);
          if (!source || !target) return null;

          // Self-loop
          if (edge.source === edge.target) {
            const x = source.x;
            const y = source.y;
            return (
              <g key={`edge-${i}`}>
                <path
                  d={`M ${x - 20} ${y - 20} C ${x - 50} ${y - 50}, ${x + 50} ${y - 50}, ${x + 20} ${y - 20}`}
                  fill="none"
                  stroke="#666"
                  strokeWidth={1 + Math.min(edge.count, 5)}
                  markerEnd="url(#arrowhead)"
                />
                {edge.count > 1 && (
                  <text x={x} y={y - 45} textAnchor="middle" className="fill-muted-foreground text-xs">
                    {edge.count}
                  </text>
                )}
              </g>
            );
          }

          // Calculate arrow offset to not overlap with node
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const offsetX = (dx / dist) * 25;
          const offsetY = (dy / dist) * 25;

          return (
            <g key={`edge-${i}`}>
              <line
                x1={source.x + offsetX}
                y1={source.y + offsetY}
                x2={target.x - offsetX}
                y2={target.y - offsetY}
                stroke="#666"
                strokeWidth={1 + Math.min(edge.count, 5)}
                markerEnd="url(#arrowhead)"
              />
              {edge.count > 1 && (
                <text
                  x={(source.x + target.x) / 2}
                  y={(source.y + target.y) / 2 - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-xs"
                >
                  {edge.count}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = nodePositions.get(node.name);
          if (!pos) return null;

          const fill = node.isAsi01Violation
            ? COLOR_DANGER
            : node.errorCount > 0
              ? COLOR_WARNING
              : COLOR_NORMAL;
          const nodeRadius = 20 + Math.min(node.callCount * 2, 15);

          return (
            <g key={node.name}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius}
                fill={fill}
                opacity={0.9}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white text-xs font-medium"
                style={{ pointerEvents: 'none' }}
              >
                {node.name.length > 10 ? node.name.slice(0, 8) + '...' : node.name}
              </text>
              <text
                x={pos.x}
                y={pos.y + nodeRadius + 12}
                textAnchor="middle"
                className="fill-foreground text-xs"
              >
                ({node.callCount})
              </text>
            </g>
          );
        })}

        {/* Arrow marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

interface TextSequenceProps {
  toolCalls: ToolCallEvent[];
  analysis: ChainAnalysis;
  expandedTools: Set<string>;
  toggleTool: (name: string) => void;
}

function TextSequence({ toolCalls, analysis, expandedTools, toggleTool }: TextSequenceProps) {
  const sortedCalls = React.useMemo(
    () =>
      [...toolCalls].sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        // Handle invalid timestamps - maintain original order
        if (Number.isNaN(timeA) || Number.isNaN(timeB)) {
          return 0;
        }
        return timeA - timeB;
      }),
    [toolCalls]
  );

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-2 pr-4">
        {sortedCalls.map((call, i) => {
          const isViolation = analysis.asi01Violations.includes(call.tool_name);
          const isExpanded = expandedTools.has(`${call.id}`);

          return (
            <Collapsible key={call.id} open={isExpanded} onOpenChange={() => toggleTool(call.id)}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-start gap-2 text-left',
                    isViolation && 'border-l-2 border-red-500'
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="font-mono text-sm">{i + 1}.</span>
                    {isViolation ? (
                      <XCircle className="h-4 w-4 text-red-500" aria-label="Violation" />
                    ) : !call.success ? (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" aria-label="Warning" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="Success" />
                    )}
                    <span className="font-medium">{call.tool_name}</span>
                  </span>
                  {i < sortedCalls.length - 1 && (
                    <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-12">
                <Card className="mt-2">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Arguments</p>
                      <pre className="mt-1 rounded bg-muted p-2 text-xs overflow-auto max-h-32">
                        {safeStringify(call.arguments)}
                      </pre>
                    </div>
                    {call.result !== undefined && call.result !== null && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Result</p>
                        <pre className="mt-1 rounded bg-muted p-2 text-xs overflow-auto max-h-32">
                          {typeof call.result === 'string'
                            ? call.result.slice(0, 500)
                            : safeStringify(call.result)}
                        </pre>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {call.duration_ms.toFixed(1)}ms
                      </span>
                      <span className="flex items-center gap-1">
                        {call.success ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                        {call.success ? 'Success' : 'Failed'}
                      </span>
                      <span>{formatTime(call.timestamp)}</span>
                    </div>
                    {!call.success && call.exception_type && (
                      <Alert variant="destructive" className="py-2">
                        <AlertDescription className="text-xs">
                          Exception: {call.exception_type}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function Legend() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Legend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLOR_NORMAL }} />
            <span className="text-sm">Normal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLOR_WARNING }} />
            <span className="text-sm">Has Errors</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLOR_DANGER }} />
            <span className="text-sm">ASI01 Violation</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLOR_SUCCESS }} />
            <span className="text-sm">Highlighted</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ToolStatisticsDetailsProps {
  analysis: ChainAnalysis;
}

function ToolStatisticsDetails({ analysis }: ToolStatisticsDetailsProps) {
  const sortedNodes = React.useMemo(
    () => Array.from(analysis.nodes.values()).sort((a, b) => b.callCount - a.callCount),
    [analysis.nodes]
  );

  if (sortedNodes.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          Tool Statistics
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardContent className="p-4">
            <div className="space-y-2">
              {sortedNodes.map((node) => {
                const avgDuration = node.callCount > 0 ? node.totalDurationMs / node.callCount : 0;
                let statusBadge = null;
                if (node.isAsi01Violation) {
                  statusBadge = (
                    <Badge variant="destructive" className="ml-2">
                      ASI01
                    </Badge>
                  );
                } else if (node.isLoop) {
                  statusBadge = (
                    <Badge variant="outline" className="ml-2 border-yellow-500 text-yellow-500">
                      Loop
                    </Badge>
                  );
                } else if (node.isExcessive) {
                  statusBadge = (
                    <Badge variant="outline" className="ml-2 border-yellow-500 text-yellow-500">
                      Excessive
                    </Badge>
                  );
                }

                return (
                  <div key={node.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center">
                      <span className="font-medium">{node.name}</span>
                      {statusBadge}
                    </span>
                    <span className="text-muted-foreground">
                      {node.callCount} calls, {node.successCount} success, {node.errorCount} errors,
                      avg {avgDuration.toFixed(1)}ms
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
