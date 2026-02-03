'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Download,
  Filter,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  XCircle,
  Wrench,
  Database,
  Zap,
  MessageSquare,
  FileWarning,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useEffect } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toggle } from '@/components/ui/toggle';
import {
  AgentEvent,
  AgentEventType,
  AGENT_EVENT_TYPE_LABELS,
  DIVERGENCE_SEVERITY_LABELS,
} from '@/lib/demo/demoData';
import {
  ConnectionStatus,
  EventTypeFilter,
  MAX_EVENTS_LIMIT,
  MAX_EXPORT_SIZE_BYTES,
  UseEventStreamReturn,
} from '@/hooks/useEventStream';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface EventStreamProps {
  stream: UseEventStreamReturn;
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
  tool_call: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  memory_access: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  action: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  speech: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  divergence: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const CONNECTION_STATUS_CONFIG: Record<
  ConnectionStatus,
  { icon: React.ReactNode; label: string; className: string }
> = {
  connected: {
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
    label: 'Connected',
    className: 'text-green-600 dark:text-green-400',
  },
  connecting: {
    icon: <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />,
    label: 'Connecting...',
    className: 'text-yellow-600 dark:text-yellow-400',
  },
  disconnected: {
    icon: <Circle className="h-4 w-4" aria-hidden="true" />,
    label: 'Disconnected',
    className: 'text-gray-500 dark:text-gray-400',
  },
  error: {
    icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
    label: 'Error',
    className: 'text-red-600 dark:text-red-400',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================
function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  } catch {
    return 'Invalid time';
  }
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return '';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Sanitize text content for safe display
function sanitizeText(text: string, maxLength = 500): string {
  if (!text) return '';
  // Truncate if too long
  const truncated = text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  // React handles XSS automatically when rendering text content
  return truncated;
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Connection Status Indicator */
function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const config = CONNECTION_STATUS_CONFIG[status];

  return (
    <div
      className={cn('flex items-center gap-1.5', config.className)}
      role="status"
      aria-label={`Connection status: ${config.label}`}
    >
      {config.icon}
      <span className="text-sm font-medium">{config.label}</span>
    </div>
  );
}

/** Stream Metrics Display */
function StreamMetrics({
  totalCount,
  eventRate,
  newCount,
  maxReached,
}: {
  totalCount: number;
  eventRate: number;
  newCount: number;
  maxReached: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-4 text-sm" role="group" aria-label="Event stream metrics">
      <div>
        <span className="text-muted-foreground">Total: </span>
        <span className="font-medium">{totalCount.toLocaleString()}</span>
        {maxReached && (
          <Badge variant="destructive" className="ml-2">
            Limit reached ({MAX_EVENTS_LIMIT.toLocaleString()})
          </Badge>
        )}
      </div>
      <div>
        <span className="text-muted-foreground">Rate: </span>
        <span className="font-medium">{eventRate.toFixed(1)}/s</span>
      </div>
      {newCount > 0 && (
        <Badge variant="secondary">
          {newCount} new
        </Badge>
      )}
    </div>
  );
}

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
  const eventTypes = Object.values(AgentEventType) as AgentEvent['event_type'][];
  const isAllActive = activeFilters.includes('all');

  const handleToggle = (type: EventTypeFilter) => {
    if (type === 'all') {
      onFilterChange(['all']);
      return;
    }

    if (isAllActive) {
      // Switching from 'all' to specific filter
      onFilterChange([type]);
    } else if (activeFilters.includes(type)) {
      // Remove filter
      const remaining = activeFilters.filter((f) => f !== type);
      onFilterChange(remaining.length === 0 ? ['all'] : remaining);
    } else {
      // Add filter
      onFilterChange([...activeFilters, type]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events by type">
      <Toggle
        pressed={isAllActive}
        onPressedChange={() => handleToggle('all')}
        size="sm"
        aria-label="Show all event types"
      >
        <Filter className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
        All
      </Toggle>
      {eventTypes.map((type) => (
        <Toggle
          key={type}
          pressed={!isAllActive && activeFilters.includes(type)}
          onPressedChange={() => handleToggle(type)}
          size="sm"
          aria-label={`Filter by ${AGENT_EVENT_TYPE_LABELS[type]}`}
        >
          {EVENT_TYPE_ICONS[type]}
          <span className="ml-1">{AGENT_EVENT_TYPE_LABELS[type]}</span>
          <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-xs">
            {eventCounts[type] || 0}
          </Badge>
        </Toggle>
      ))}
    </div>
  );
}

/** Single Event Card */
function EventCard({
  event,
  index,
  isLatest,
}: {
  event: AgentEvent;
  index: number;
  isLatest: boolean;
}) {
  const eventType = event.event_type;
  const label = AGENT_EVENT_TYPE_LABELS[eventType];

  return (
    <Collapsible defaultOpen={isLatest}>
      <Card
        className={cn(
          'transition-colors',
          isLatest && 'ring-2 ring-primary ring-offset-2'
        )}
      >
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Badge
                  className={cn('shrink-0', EVENT_TYPE_COLORS[eventType])}
                  aria-label={label}
                >
                  {EVENT_TYPE_ICONS[eventType]}
                  <span className="ml-1">{label}</span>
                </Badge>
                <EventSummary event={event} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <time dateTime={event.timestamp} title={event.timestamp}>
                  {formatTimestamp(event.timestamp)}
                </time>
                <span className="text-muted-foreground/60">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-4">
            <EventDetails event={event} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

/** Brief summary shown in collapsed state */
function EventSummary({ event }: { event: AgentEvent }) {
  switch (event.event_type) {
    case 'tool_call':
      return (
        <span className="text-sm text-muted-foreground truncate">
          {sanitizeText(event.tool_name, 50)}
          {event.success ? '' : ' (failed)'}
        </span>
      );
    case 'memory_access':
      return (
        <span className="text-sm text-muted-foreground truncate">
          {event.operation}: {sanitizeText(event.key, 50)}
          {event.sensitive_detected && (
            <Badge variant="destructive" className="ml-1.5 text-xs">
              Sensitive
            </Badge>
          )}
        </span>
      );
    case 'speech':
      return (
        <span className="text-sm text-muted-foreground truncate">
          {sanitizeText(event.content, 80)}
        </span>
      );
    case 'action':
      return (
        <span className="text-sm text-muted-foreground truncate">
          {sanitizeText(event.action_type, 30)}: {sanitizeText(event.description, 50)}
        </span>
      );
    case 'divergence':
      return (
        <span className="text-sm text-muted-foreground truncate">
          <Badge
            variant={event.severity === 'HIGH' ? 'destructive' : 'secondary'}
            className="mr-1.5"
          >
            {DIVERGENCE_SEVERITY_LABELS[event.severity]}
          </Badge>
          {sanitizeText(event.explanation, 60)}
        </span>
      );
    default:
      return null;
  }
}

/** Expanded event details */
function EventDetails({ event }: { event: AgentEvent }) {
  switch (event.event_type) {
    case 'tool_call':
      return (
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Tool:</span> {sanitizeText(event.tool_name)}
          </div>
          <div>
            <span className="font-medium">Duration:</span> {event.duration_ms}ms
          </div>
          <div>
            <span className="font-medium">Success:</span>{' '}
            {event.success ? (
              <span className="text-green-600">Yes</span>
            ) : (
              <span className="text-red-600">No</span>
            )}
          </div>
          {event.exception_type && (
            <div>
              <span className="font-medium">Exception:</span>{' '}
              <span className="text-red-600">{sanitizeText(event.exception_type)}</span>
            </div>
          )}
          {event.arguments && Object.keys(event.arguments).length > 0 && (
            <div>
              <span className="font-medium">Arguments:</span>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                {JSON.stringify(event.arguments, null, 2)}
              </pre>
            </div>
          )}
          {event.result !== undefined && event.result !== null && (
            <div>
              <span className="font-medium">Result:</span>
              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-40 overflow-y-auto">
                {typeof event.result === 'string'
                  ? sanitizeText(event.result, 1000)
                  : JSON.stringify(event.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      );

    case 'memory_access':
      return (
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Operation:</span>{' '}
            <Badge variant="outline">{event.operation}</Badge>
          </div>
          <div>
            <span className="font-medium">Key:</span> {sanitizeText(event.key)}
          </div>
          {event.value_preview && (
            <div>
              <span className="font-medium">Value Preview:</span>
              <pre className="mt-1 p-2 bg-muted rounded text-xs">
                {sanitizeText(event.value_preview, 200)}
              </pre>
            </div>
          )}
          {event.sensitive_detected && (
            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Sensitive data detected in this access</AlertDescription>
            </Alert>
          )}
          {event.exception_type && (
            <div>
              <span className="font-medium">Exception:</span>{' '}
              <span className="text-red-600">{sanitizeText(event.exception_type)}</span>
            </div>
          )}
        </div>
      );

    case 'speech':
      return (
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Content:</span>
            <p className="mt-1 p-2 bg-muted rounded whitespace-pre-wrap">
              {sanitizeText(event.content, 2000)}
            </p>
          </div>
          {event.intent && (
            <div>
              <span className="font-medium">Intent:</span> {sanitizeText(event.intent)}
            </div>
          )}
          <div>
            <span className="font-medium">User Response:</span>{' '}
            {event.is_response_to_user ? 'Yes' : 'No'}
          </div>
        </div>
      );

    case 'action':
      return (
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Type:</span>{' '}
            <Badge variant="outline">{sanitizeText(event.action_type)}</Badge>
          </div>
          <div>
            <span className="font-medium">Description:</span>
            <p className="mt-1">{sanitizeText(event.description)}</p>
          </div>
          <div>
            <span className="font-medium">Target:</span> {sanitizeText(event.target)}
          </div>
          {event.related_tool_calls && event.related_tool_calls.length > 0 && (
            <div>
              <span className="font-medium">Related Tool Calls:</span>
              <ul className="mt-1 list-disc list-inside text-xs text-muted-foreground">
                {event.related_tool_calls.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );

    case 'divergence':
      return (
        <div className="space-y-2 text-sm">
          <Alert
            variant={event.severity === 'HIGH' ? 'destructive' : 'default'}
            className="mb-3"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {DIVERGENCE_SEVERITY_LABELS[event.severity]} divergence detected
            </AlertDescription>
          </Alert>
          <div>
            <span className="font-medium">Speech Intent:</span> {sanitizeText(event.speech_intent)}
          </div>
          <div>
            <span className="font-medium">Actual Action:</span> {sanitizeText(event.actual_action)}
          </div>
          <div>
            <span className="font-medium">Explanation:</span>
            <p className="mt-1 p-2 bg-muted rounded">{sanitizeText(event.explanation)}</p>
          </div>
          <div>
            <span className="font-medium">Confidence:</span>{' '}
            {(event.confidence_score * 100).toFixed(0)}%
          </div>
        </div>
      );

    default:
      return (
        <pre className="text-xs p-2 bg-muted rounded overflow-x-auto">
          {JSON.stringify(event, null, 2)}
        </pre>
      );
  }
}

// ============================================================================
// Main Component
// ============================================================================
export function EventStream({ stream, className }: EventStreamProps) {
  const {
    filteredEvents,
    isLoading,
    isPaused,
    autoScroll,
    connectionStatus,
    eventRate,
    newEventCount,
    totalEventCount,
    error,
    filters,
    maxEventsReached,
    pause,
    resume,
    toggleAutoScroll,
    clearEvents,
    markAllRead,
    setFilters,
    exportEvents,
  } = stream;

  const scrollRef = useRef<HTMLDivElement>(null);

  // Calculate event counts by type
  const eventCounts = useMemo(() => {
    const counts: Record<AgentEvent['event_type'], number> = {
      tool_call: 0,
      memory_access: 0,
      action: 0,
      speech: 0,
      divergence: 0,
    };
    stream.events.forEach((event) => {
      counts[event.event_type]++;
    });
    return counts;
  }, [stream.events]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current && filteredEvents.length > 0) {
      scrollRef.current.scrollTop = 0;
    }
  }, [filteredEvents.length, autoScroll]);

  // Handle export
  const handleExport = useCallback(() => {
    const { data, sizeBytes, exceedsLimit } = exportEvents();

    if (exceedsLimit) {
      // Still allow download but warn
      console.warn(
        `Export size (${formatFileSize(sizeBytes)}) exceeds limit (${formatFileSize(MAX_EXPORT_SIZE_BYTES)})`
      );
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `events-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [exportEvents]);

  // Display events in reverse order (newest first) when auto-scroll is on
  const displayedEvents = autoScroll ? [...filteredEvents].reverse() : filteredEvents;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Header with status and metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ConnectionIndicator status={connectionStatus} />
        <StreamMetrics
          totalCount={totalEventCount}
          eventRate={eventRate}
          newCount={newEventCount}
          maxReached={maxEventsReached}
        />
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Max events warning */}
      {maxEventsReached && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Maximum event limit reached ({MAX_EVENTS_LIMIT.toLocaleString()} events). Oldest events
            are being removed. Consider exporting and clearing events.
          </AlertDescription>
        </Alert>
      )}

      {/* Paused indicator */}
      {isPaused && (
        <Alert>
          <Pause className="h-4 w-4" />
          <AlertDescription>
            Event stream paused. New events will not be received. Click Resume to continue.
          </AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {isPaused ? (
          <Button onClick={resume} size="sm" aria-label="Resume event stream">
            <Play className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Resume
          </Button>
        ) : (
          <Button onClick={pause} size="sm" variant="outline" aria-label="Pause event stream">
            <Pause className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Pause
          </Button>
        )}

        <Toggle
          pressed={autoScroll}
          onPressedChange={toggleAutoScroll}
          size="sm"
          aria-label={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
        >
          Auto-scroll {autoScroll ? 'On' : 'Off'}
        </Toggle>

        <Button
          onClick={clearEvents}
          size="sm"
          variant="outline"
          aria-label="Clear all events"
        >
          <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Clear
        </Button>

        {newEventCount > 0 && (
          <Button
            onClick={markAllRead}
            size="sm"
            variant="ghost"
            aria-label={`Mark ${newEventCount} events as read`}
          >
            Mark Read ({newEventCount})
          </Button>
        )}

        <div className="ml-auto">
          <Button
            onClick={handleExport}
            size="sm"
            variant="outline"
            disabled={totalEventCount === 0}
            aria-label="Export events as JSON"
          >
            <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Filters */}
      <EventTypeFilters
        activeFilters={filters}
        onFilterChange={setFilters}
        eventCounts={eventCounts}
      />

      {/* Event List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {filteredEvents.length === 0
              ? 'No events'
              : `Showing ${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''}`}
            {filteredEvents.length !== totalEventCount && ` (filtered from ${totalEventCount})`}
            {autoScroll && filteredEvents.length > 0 && ' - newest first'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredEvents.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
              role="status"
              aria-label="No events"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-8 w-8 animate-spin mb-3" aria-hidden="true" />
                  <p>Loading events...</p>
                </>
              ) : (
                <>
                  <Database className="h-8 w-8 mb-3" aria-hidden="true" />
                  <p>No events received yet.</p>
                  <p className="text-sm mt-1">
                    Connect your instrumented agent to see events here.
                  </p>
                </>
              )}
            </div>
          ) : (
            <ScrollArea
              className="h-[500px]"
              ref={scrollRef}
            >
              <div className="flex flex-col gap-2 p-4">
                {displayedEvents.map((event, index) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={index}
                    isLatest={index === 0 && autoScroll}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default EventStream;
