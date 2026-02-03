'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Clock,
  Filter,
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Toggle } from '@/components/ui/toggle';
import {
  AgentEvent,
  AgentEventType,
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
// Constants
// ============================================================================
export const EVENTS_PER_PAGE = 20;
export const MAX_EVENTS_LIMIT = 5000;
export const MAX_EXPORT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

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

type EventTypeFilter = 'all' | AgentEvent['event_type'];

// ============================================================================
// Types
// ============================================================================
export interface TimelineProps {
  events: AgentEvent[];
  className?: string;
  sessionStartTime?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================
function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      console.warn('[formatTimestamp] Invalid date value:', isoString);
      return 'Invalid time';
    }
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (err) {
    console.warn('[formatTimestamp] Date parse error:', { isoString, error: err });
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Event Type Filter Chips */
function EventTypeFilters({
  activeFilters,
  onFilterChange,
  eventCounts,
}: {
  activeFilters: EventTypeFilter[];
  onFilterChange: (filters: EventTypeFilter[]) => void;
  eventCounts: Record<AgentEvent['event_type'], number>;
}) {
  const isAllSelected = activeFilters.includes('all');

  const toggleFilter = (filter: EventTypeFilter) => {
    if (filter === 'all') {
      onFilterChange(['all']);
      return;
    }

    const withoutAll = activeFilters.filter((f) => f !== 'all');
    if (withoutAll.includes(filter)) {
      const remaining = withoutAll.filter((f) => f !== filter);
      onFilterChange(remaining.length === 0 ? ['all'] : remaining);
    } else {
      onFilterChange([...withoutAll, filter]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Event type filters">
      <Toggle
        pressed={isAllSelected}
        onPressedChange={() => toggleFilter('all')}
        variant="outline"
        size="sm"
        aria-label="Show all event types"
      >
        <Filter className="h-3 w-3 mr-1" aria-hidden="true" />
        All
      </Toggle>
      {(Object.keys(AGENT_EVENT_TYPE_LABELS) as AgentEvent['event_type'][]).map((type) => (
        <Toggle
          key={type}
          pressed={!isAllSelected && activeFilters.includes(type)}
          onPressedChange={() => toggleFilter(type)}
          variant="outline"
          size="sm"
          className={cn(
            !isAllSelected && activeFilters.includes(type) && EVENT_TYPE_BADGE_COLORS[type]
          )}
          aria-label={`Filter by ${AGENT_EVENT_TYPE_LABELS[type]}`}
        >
          {EVENT_TYPE_ICONS[type]}
          <span className="ml-1">{AGENT_EVENT_TYPE_LABELS[type]}</span>
          <Badge variant="secondary" className="ml-1 text-xs">
            {eventCounts[type] || 0}
          </Badge>
        </Toggle>
      ))}
    </div>
  );
}

/** Pagination Controls */
function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  totalEvents,
  startIndex,
  endIndex,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalEvents: number;
  startIndex: number;
  endIndex: number;
}) {
  return (
    <div className="flex items-center justify-between py-4" role="navigation" aria-label="Pagination">
      <p className="text-sm text-muted-foreground">
        Showing {startIndex + 1}-{endIndex} of {totalEvents} events
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-3 text-sm">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Timeline Event Card */
function TimelineEvent({
  event,
  sessionStartTime,
  defaultExpanded = false,
}: {
  event: AgentEvent;
  sessionStartTime: string;
  defaultExpanded?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  const relativeTime = formatRelativeToSession(event.timestamp, sessionStartTime);
  const absoluteTime = formatTimestamp(event.timestamp);

  return (
    <div className="relative pl-8 pb-4 last:pb-0" role="listitem">
      {/* Timeline Line */}
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" aria-hidden="true" />

      {/* Timeline Dot */}
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
export function Timeline({ events, className, sessionStartTime }: TimelineProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<EventTypeFilter[]>(['all']);

  // Apply safety limit and sort chronologically
  const limitedEvents = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    if (sorted.length > MAX_EVENTS_LIMIT) {
      console.warn(
        `[Timeline] Event list truncated: showing newest ${MAX_EVENTS_LIMIT} of ${sorted.length} events`
      );
      return sorted.slice(-MAX_EVENTS_LIMIT);
    }
    return sorted;
  }, [events]);

  // Calculate event counts per type
  const eventCounts = useMemo(() => {
    const counts: Record<AgentEvent['event_type'], number> = {
      tool_call: 0,
      memory_access: 0,
      action: 0,
      speech: 0,
      divergence: 0,
    };
    limitedEvents.forEach((e) => {
      if (e.event_type in counts) {
        counts[e.event_type]++;
      }
    });
    return counts;
  }, [limitedEvents]);

  // Filter events
  const filteredEvents = useMemo(() => {
    if (filters.includes('all')) return limitedEvents;
    return limitedEvents.filter((e) => filters.includes(e.event_type as EventTypeFilter));
  }, [limitedEvents, filters]);

  // Pagination
  const totalEvents = filteredEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalEvents / EVENTS_PER_PAGE));

  // Reset page when filters change and page would be out of bounds
  const safePage = Math.min(currentPage, totalPages);
  if (safePage !== currentPage) {
    setCurrentPage(safePage);
  }

  const startIndex = (safePage - 1) * EVENTS_PER_PAGE;
  const endIndex = Math.min(startIndex + EVENTS_PER_PAGE, totalEvents);
  const pageEvents = filteredEvents.slice(startIndex, endIndex);

  // Session start time (first event or provided)
  const sessionStart = sessionStartTime || (limitedEvents.length > 0 ? limitedEvents[0].timestamp : new Date().toISOString());

  // Export handler
  const handleExport = useCallback(() => {
    if (filteredEvents.length === 0) return;

    try {
      const exportData = {
        metadata: {
          exported_at: new Date().toISOString(),
          total_events: filteredEvents.length,
          filters: filters,
        },
        events: filteredEvents,
      };
      const jsonString = JSON.stringify(exportData, null, 2);
      const sizeBytes = new Blob([jsonString]).size;

      if (sizeBytes > MAX_EXPORT_SIZE_BYTES) {
        console.warn(
          `[Timeline] Export size (${formatFileSize(sizeBytes)}) exceeds limit (${formatFileSize(MAX_EXPORT_SIZE_BYTES)})`
        );
        alert(`Export file is too large (${formatFileSize(sizeBytes)}). Please filter events to reduce size.`);
        return;
      }

      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `agent_timeline_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Timeline] Export failed:', err);
      alert('Failed to generate export file.');
    }
  }, [filteredEvents, filters]);

  // Empty state
  if (events.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No events to display</p>
          <p className="text-sm mt-1">Agent events will appear here as they occur.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with limit warning */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agent Behavior Timeline</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={filteredEvents.length === 0}
          aria-label="Download timeline as JSON"
        >
          <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Export JSON
        </Button>
      </div>

      {/* Limit warning */}
      {events.length > MAX_EVENTS_LIMIT && (
        <div className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Event list truncated: showing newest {MAX_EVENTS_LIMIT.toLocaleString()} of {events.length.toLocaleString()} events
        </div>
      )}

      {/* Filters */}
      <EventTypeFilters
        activeFilters={filters}
        onFilterChange={setFilters}
        eventCounts={eventCounts}
      />

      {/* Top Pagination */}
      {totalPages > 1 && (
        <PaginationControls
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalEvents={totalEvents}
          startIndex={startIndex}
          endIndex={endIndex}
        />
      )}

      {/* Timeline */}
      {pageEvents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>No events match the selected filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative" role="list" aria-label="Timeline events">
          {pageEvents.map((event) => (
            <TimelineEvent
              key={event.id}
              event={event}
              sessionStartTime={sessionStart}
              defaultExpanded={event.event_type === 'divergence'}
            />
          ))}
        </div>
      )}

      {/* Bottom Pagination */}
      {totalPages > 1 && (
        <PaginationControls
          currentPage={safePage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalEvents={totalEvents}
          startIndex={startIndex}
          endIndex={endIndex}
        />
      )}
    </div>
  );
}

export default Timeline;
