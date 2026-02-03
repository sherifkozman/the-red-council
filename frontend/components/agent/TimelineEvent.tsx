'use client';

import { useState } from 'react';
import {
  ChevronDown,
  Clock,
  Wrench,
  Database,
  Zap,
  MessageSquare,
  FileWarning,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AgentEvent,
  AGENT_EVENT_TYPE_LABELS,
  DIVERGENCE_SEVERITY_LABELS,
  ToolCallEvent,
  MemoryAccessEvent,
  ActionRecord,
  SpeechRecord,
  DivergenceEvent,
} from '@/lib/demo/demoData';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface TimelineEventProps {
  event: AgentEvent;
  sessionStartTime: string;
  defaultExpanded?: boolean;
  showTimelineLine?: boolean;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================
const EVENT_TYPE_ICONS: Record<AgentEvent['event_type'], React.ReactNode> = {
  tool_call: <Wrench className="h-4 w-4" aria-hidden="true" />,
  memory_access: <Database className="h-4 w-4" aria-hidden="true" />,
  action: <Zap className="h-4 w-4" aria-hidden="true" />,
  speech: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
  divergence: <FileWarning className="h-4 w-4" aria-hidden="true" />,
};

const EVENT_TYPE_COLORS: Record<AgentEvent['event_type'], string> = {
  tool_call: 'border-blue-400 bg-blue-50 dark:bg-blue-950/30',
  memory_access: 'border-purple-400 bg-purple-50 dark:bg-purple-950/30',
  action: 'border-green-400 bg-green-50 dark:bg-green-950/30',
  speech: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30',
  divergence: 'border-red-400 bg-red-50 dark:bg-red-950/30',
};

const EVENT_TYPE_BADGE_COLORS: Record<AgentEvent['event_type'], string> = {
  tool_call: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  memory_access: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  action: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  speech: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  divergence: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

// ============================================================================
// Helper Functions
// ============================================================================
function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return 'Invalid time';
    }
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return 'Invalid time';
  }
}

function formatRelativeToSession(eventTime: string, sessionStart: string): string {
  try {
    const event = new Date(eventTime);
    const start = new Date(sessionStart);

    if (isNaN(event.getTime()) || isNaN(start.getTime())) {
      return '0:00:00';
    }

    const diffMs = event.getTime() - start.getTime();
    const diffSec = Math.floor(Math.abs(diffMs) / 1000);
    const sign = diffMs < 0 ? '-' : '+';

    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const seconds = diffSec % 60;

    return `${sign}${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } catch {
    return '0:00:00';
  }
}

function sanitizeText(text: string, maxLength = 1000): string {
  if (!text) return '';
  const truncated = text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  return truncated;
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Event Header - Type-specific summary */
function EventHeader({ event }: { event: AgentEvent }) {
  switch (event.event_type) {
    case 'tool_call': {
      const e = event as ToolCallEvent;
      const status = e.success ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Success" />
      ) : (
        <XCircle className="h-4 w-4 text-red-600" aria-label="Failed" />
      );
      return (
        <span className="flex items-center gap-1.5 font-medium truncate">
          {sanitizeText(e.tool_name, 50)}
          {status}
          <span className="text-xs text-muted-foreground">({e.duration_ms.toFixed(0)}ms)</span>
        </span>
      );
    }
    case 'memory_access': {
      const e = event as MemoryAccessEvent;
      return (
        <span className="flex items-center gap-1.5 font-medium truncate">
          {e.operation.toUpperCase()}: {sanitizeText(e.key, 50)}
          {e.sensitive_detected && (
            <AlertTriangle className="h-4 w-4 text-yellow-600" aria-label="Sensitive data detected" />
          )}
        </span>
      );
    }
    case 'action': {
      const e = event as ActionRecord;
      return (
        <span className="font-medium truncate">
          {sanitizeText(e.action_type, 50)}: {sanitizeText(e.description, 80)}
        </span>
      );
    }
    case 'speech': {
      const e = event as SpeechRecord;
      const direction = e.is_response_to_user ? 'To User' : 'Internal';
      return (
        <span className="font-medium truncate">
          {direction}: {sanitizeText(e.content, 80)}
        </span>
      );
    }
    case 'divergence': {
      const e = event as DivergenceEvent;
      return (
        <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
          DIVERGENCE DETECTED
          <Badge variant="destructive" className="text-xs">
            {DIVERGENCE_SEVERITY_LABELS[e.severity]}
          </Badge>
        </span>
      );
    }
    default:
      return <span className="font-medium">Unknown Event</span>;
  }
}

/** Event Details - Type-specific content */
function EventDetails({ event }: { event: AgentEvent }) {
  switch (event.event_type) {
    case 'tool_call': {
      const e = event as ToolCallEvent;
      return (
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-muted-foreground mb-1">Arguments:</p>
            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
              {sanitizeText(JSON.stringify(e.arguments, null, 2), 2000)}
            </pre>
          </div>
          <div>
            <p className="font-medium text-muted-foreground mb-1">Result:</p>
            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
              {sanitizeText(String(e.result ?? ''), 2000)}
            </pre>
          </div>
          {!e.success && e.exception_type && (
            <div className="text-red-600 dark:text-red-400">
              <p className="font-medium">Exception: {sanitizeText(e.exception_type, 200)}</p>
            </div>
          )}
        </div>
      );
    }
    case 'memory_access': {
      const e = event as MemoryAccessEvent;
      return (
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-muted-foreground mb-1">Operation: {e.operation.toUpperCase()}</p>
          </div>
          <div>
            <p className="font-medium text-muted-foreground mb-1">Key:</p>
            <code className="bg-muted px-2 py-1 rounded text-xs">{sanitizeText(e.key, 200)}</code>
          </div>
          {e.value_preview && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Value Preview:</p>
              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                {sanitizeText(e.value_preview, 1000)}
              </pre>
            </div>
          )}
          {e.sensitive_detected && (
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              <span>Sensitive data pattern detected in memory access</span>
            </div>
          )}
        </div>
      );
    }
    case 'action': {
      const e = event as ActionRecord;
      return (
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-muted-foreground mb-1">Description:</p>
            <p>{sanitizeText(e.description, 1000)}</p>
          </div>
          <div>
            <p className="font-medium text-muted-foreground mb-1">Target:</p>
            <code className="bg-muted px-2 py-1 rounded text-xs">{sanitizeText(e.target, 300)}</code>
          </div>
          {e.related_tool_calls && e.related_tool_calls.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Related Tool Calls:</p>
              <p className="text-xs">{e.related_tool_calls.join(', ')}</p>
            </div>
          )}
        </div>
      );
    }
    case 'speech': {
      const e = event as SpeechRecord;
      return (
        <div className="space-y-3 text-sm">
          {e.intent && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Inferred Intent:</p>
              <p className="italic">{sanitizeText(e.intent, 500)}</p>
            </div>
          )}
          <div>
            <p className="font-medium text-muted-foreground mb-1">Content:</p>
            <div className="bg-muted p-3 rounded whitespace-pre-wrap">
              {sanitizeText(e.content, 2000)}
            </div>
          </div>
        </div>
      );
    }
    case 'divergence': {
      const e = event as DivergenceEvent;
      return (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="destructive">{DIVERGENCE_SEVERITY_LABELS[e.severity]}</Badge>
            <span className="text-muted-foreground">
              Confidence: {(e.confidence_score * 100).toFixed(0)}%
            </span>
          </div>
          <div>
            <p className="font-medium text-muted-foreground mb-1">Explanation:</p>
            <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded border border-red-200 dark:border-red-900">
              {sanitizeText(e.explanation, 2000)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-medium text-muted-foreground mb-1">Stated Intent:</p>
              <p>{sanitizeText(e.speech_intent, 500)}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground mb-1">Actual Action:</p>
              <p>{sanitizeText(e.actual_action, 500)}</p>
            </div>
          </div>
        </div>
      );
    }
    default:
      return <p className="text-sm text-muted-foreground">No details available.</p>;
  }
}

// ============================================================================
// Main Component
// ============================================================================
export function TimelineEvent({
  event,
  sessionStartTime,
  defaultExpanded = false,
  showTimelineLine = true,
  className,
}: TimelineEventProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  const relativeTime = formatRelativeToSession(event.timestamp, sessionStartTime);
  const absoluteTime = formatTimestamp(event.timestamp);

  return (
    <div className={cn('relative', showTimelineLine && 'pl-8 pb-4 last:pb-0', className)} role="listitem">
      {/* Timeline Line */}
      {showTimelineLine && (
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" aria-hidden="true" />
      )}

      {/* Timeline Dot */}
      {showTimelineLine && (
        <div
          className={cn(
            'absolute left-1.5 top-2 h-4 w-4 rounded-full border-2 bg-background flex items-center justify-center',
            event.event_type === 'divergence' ? 'border-red-500' : 'border-primary'
          )}
          aria-hidden="true"
        >
          {event.event_type === 'divergence' && (
            <div className="h-2 w-2 rounded-full bg-red-500" />
          )}
        </div>
      )}

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className={cn('border-l-4', EVENT_TYPE_COLORS[event.event_type])}>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {EVENT_TYPE_ICONS[event.event_type]}
                  <EventHeader event={event} />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <span title={absoluteTime}>{relativeTime}</span>
                  </div>
                  <Badge className={EVENT_TYPE_BADGE_COLORS[event.event_type]} variant="secondary">
                    {AGENT_EVENT_TYPE_LABELS[event.event_type]}
                  </Badge>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform',
                      isOpen && 'rotate-180'
                    )}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-4 px-4">
              <EventDetails event={event} />
              <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                <span>ID: {event.id}</span>
                <span className="mx-2">|</span>
                <span>Timestamp: {absoluteTime}</span>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

export default TimelineEvent;
