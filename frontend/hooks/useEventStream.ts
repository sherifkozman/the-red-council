'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { AgentEvent, AgentEventSchema } from '@/lib/demo/demoData';

// ============================================================================
// Constants - Match Streamlit implementation
// ============================================================================
export const MAX_EVENTS_LIMIT = 5000;
export const MAX_EXPORT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DISPLAYED_EVENTS = 200;
const POLL_INTERVAL_MS = 1000;
const CONNECTION_TIMEOUT_MS = 30000;

// ============================================================================
// Types
// ============================================================================
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export type EventTypeFilter = 'all' | AgentEvent['event_type'];

export interface EventStreamState {
  events: AgentEvent[];
  isLoading: boolean;
  isPaused: boolean;
  autoScroll: boolean;
  connectionStatus: ConnectionStatus;
  eventRate: number; // events per second
  newEventCount: number;
  totalEventCount: number;
  error: string | null;
  filters: EventTypeFilter[];
  maxEventsReached: boolean;
}

export interface UseEventStreamOptions {
  sessionId: string | null;
  baseUrl?: string;
  authToken?: string | null;
  enabled?: boolean;
  pollIntervalMs?: number;
}

export interface UseEventStreamReturn extends EventStreamState {
  // Actions
  pause: () => void;
  resume: () => void;
  toggleAutoScroll: () => void;
  clearEvents: () => void;
  markAllRead: () => void;
  setFilters: (filters: EventTypeFilter[]) => void;
  addFilter: (filter: EventTypeFilter) => void;
  removeFilter: (filter: EventTypeFilter) => void;
  // Export
  exportEvents: () => { data: string; sizeBytes: number; exceedsLimit: boolean };
  // Filtered events
  filteredEvents: AgentEvent[];
}

// ============================================================================
// Event Rate Calculation
// ============================================================================
interface RateTracker {
  timestamps: number[];
  windowMs: number;
}

function calculateEventRate(tracker: RateTracker): number {
  const now = Date.now();
  const recent = tracker.timestamps.filter((t) => now - t <= tracker.windowMs);

  if (recent.length < 2) return 0;

  const timeSpanMs = recent[recent.length - 1] - recent[0];
  if (timeSpanMs <= 0) return 0;

  return ((recent.length - 1) / timeSpanMs) * 1000; // Convert to per-second
}

// ============================================================================
// Event Validation
// ============================================================================
const EventsResponseSchema = z.object({
  events: z.array(AgentEventSchema),
  total_count: z.number().int().nonnegative(),
});

function validateEvents(data: unknown): { events: AgentEvent[]; totalCount: number } | null {
  try {
    const parsed = EventsResponseSchema.parse(data);
    return { events: parsed.events, totalCount: parsed.total_count };
  } catch (primaryError) {
    // Log the primary parse failure in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[validateEvents] Primary schema parse failed:', primaryError);
    }

    // Try parsing just an array of events (fallback)
    try {
      const eventsArray = z.array(AgentEventSchema).parse(data);
      if (process.env.NODE_ENV === 'development') {
        console.warn('[validateEvents] Using fallback array schema - API may be returning non-standard format');
      }
      return { events: eventsArray, totalCount: eventsArray.length };
    } catch (fallbackError) {
      // Log full details for debugging
      console.error('[validateEvents] All validation failed', {
        primaryError: primaryError instanceof z.ZodError ? primaryError.errors : primaryError,
        fallbackError: fallbackError instanceof z.ZodError ? fallbackError.errors : fallbackError,
      });
      return null;
    }
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================
export function useEventStream(options: UseEventStreamOptions): UseEventStreamReturn {
  const {
    sessionId,
    baseUrl = '/api/v1',
    authToken = null,
    enabled = true,
    pollIntervalMs = POLL_INTERVAL_MS,
  } = options;

  // State
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [eventRate, setEventRate] = useState(0);
  const [newEventCount, setNewEventCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<EventTypeFilter[]>(['all']);
  const [maxEventsReached, setMaxEventsReached] = useState(false);

  // Refs for mutable state that shouldn't trigger re-renders
  const pollOffsetRef = useRef(0);
  const lastUpdateRef = useRef(0);
  const rateTrackerRef = useRef<RateTracker>({ timestamps: [], windowMs: 5000 });
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // Poll for Events
  // ============================================================================
  const pollEvents = useCallback(async () => {
    if (!sessionId || !enabled || isPaused) {
      return;
    }

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setConnectionStatus('connecting');

    try {
      const url = new URL(`${baseUrl}/agent/session/${sessionId}/events`, window.location.origin);
      url.searchParams.set('offset', String(pollOffsetRef.current));
      url.searchParams.set('limit', String(MAX_DISPLAYED_EVENTS));

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const validated = validateEvents(data);

      if (!validated) {
        throw new Error('Invalid event data format');
      }

      const { events: newEvents, totalCount } = validated;

      if (newEvents.length > 0) {
        const now = Date.now();
        lastUpdateRef.current = now;

        // Update rate tracker
        newEvents.forEach(() => {
          rateTrackerRef.current.timestamps.push(now);
        });
        // Trim old timestamps
        rateTrackerRef.current.timestamps = rateTrackerRef.current.timestamps.filter(
          (t) => now - t <= rateTrackerRef.current.windowMs
        );

        // Check if max events will be reached and update state accordingly
        const willExceedLimit = events.length + newEvents.length >= MAX_EVENTS_LIMIT;
        if (willExceedLimit) {
          setMaxEventsReached(true);
        }

        setEvents((prev) => {
          const combined = [...prev, ...newEvents];
          // Trim to max events limit if needed
          if (combined.length >= MAX_EVENTS_LIMIT) {
            return combined.slice(-MAX_EVENTS_LIMIT);
          }
          return combined;
        });

        setNewEventCount((prev) => prev + newEvents.length);
        pollOffsetRef.current += newEvents.length;
        setEventRate(calculateEventRate(rateTrackerRef.current));
      }

      setConnectionStatus('connected');
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was aborted, ignore
        return;
      }

      // Log error with context for debugging
      console.error('[useEventStream] Poll error:', {
        sessionId,
        pollOffset: pollOffsetRef.current,
        errorType: err instanceof Error ? err.constructor.name : typeof err,
        errorMessage: err instanceof Error ? err.message : String(err),
      });

      // Provide user-actionable messages based on error type
      let userMessage: string;
      if (err instanceof TypeError && err.message.includes('fetch')) {
        userMessage = 'Network error: Unable to reach the server. Check your connection.';
      } else if (err instanceof Error && err.message.includes('HTTP 401')) {
        userMessage = 'Authentication failed. Please re-authenticate and try again.';
      } else if (err instanceof Error && err.message.includes('HTTP 429')) {
        userMessage = 'Rate limited. Event polling will automatically retry.';
      } else if (err instanceof Error && err.message.includes('Invalid event data')) {
        userMessage = 'Received malformed data from server. The API may have changed.';
      } else {
        userMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      }

      setError(userMessage);

      // Check connection timeout
      const timeSinceUpdate = Date.now() - lastUpdateRef.current;
      if (lastUpdateRef.current > 0 && timeSinceUpdate > CONNECTION_TIMEOUT_MS) {
        setConnectionStatus('disconnected');
      } else {
        setConnectionStatus('error');
      }
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, baseUrl, authToken, enabled, isPaused]);

  // ============================================================================
  // Polling Effect
  // ============================================================================
  useEffect(() => {
    if (!sessionId || !enabled || isPaused) {
      return;
    }

    // Initial poll
    pollEvents();

    // Set up interval
    const intervalId = setInterval(pollEvents, pollIntervalMs);

    return () => {
      clearInterval(intervalId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sessionId, enabled, isPaused, pollIntervalMs, pollEvents]);

  // ============================================================================
  // Actions
  // ============================================================================
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setNewEventCount(0);
    setMaxEventsReached(false);
    pollOffsetRef.current = 0;
    rateTrackerRef.current.timestamps = [];
    setEventRate(0);
  }, []);

  const markAllRead = useCallback(() => {
    setNewEventCount(0);
  }, []);

  const setFilters = useCallback((newFilters: EventTypeFilter[]) => {
    // If 'all' is selected, ignore other filters
    if (newFilters.includes('all')) {
      setFiltersState(['all']);
    } else if (newFilters.length === 0) {
      setFiltersState(['all']);
    } else {
      setFiltersState(newFilters);
    }
  }, []);

  const addFilter = useCallback((filter: EventTypeFilter) => {
    setFiltersState((prev) => {
      if (filter === 'all') return ['all'];
      const withoutAll = prev.filter((f) => f !== 'all');
      if (withoutAll.includes(filter)) return prev;
      return [...withoutAll, filter];
    });
  }, []);

  const removeFilter = useCallback((filter: EventTypeFilter) => {
    setFiltersState((prev) => {
      const remaining = prev.filter((f) => f !== filter);
      return remaining.length === 0 ? ['all'] : remaining;
    });
  }, []);

  // ============================================================================
  // Export
  // ============================================================================
  const exportEvents = useCallback((): { data: string; sizeBytes: number; exceedsLimit: boolean } => {
    const exportData = {
      metadata: {
        exported_at: new Date().toISOString(),
        session_id: sessionId,
        event_count: events.length,
        schema_version: '1.0',
      },
      events,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const sizeBytes = new Blob([jsonString]).size;
    const exceedsLimit = sizeBytes > MAX_EXPORT_SIZE_BYTES;

    return { data: jsonString, sizeBytes, exceedsLimit };
  }, [events, sessionId]);

  // ============================================================================
  // Filtered Events
  // ============================================================================
  const filteredEvents = filters.includes('all')
    ? events
    : events.filter((event) => filters.includes(event.event_type as EventTypeFilter));

  // ============================================================================
  // Return
  // ============================================================================
  return {
    events,
    isLoading,
    isPaused,
    autoScroll,
    connectionStatus,
    eventRate,
    newEventCount,
    totalEventCount: events.length,
    error,
    filters,
    maxEventsReached,
    // Actions
    pause,
    resume,
    toggleAutoScroll,
    clearEvents,
    markAllRead,
    setFilters,
    addFilter,
    removeFilter,
    // Export
    exportEvents,
    // Filtered
    filteredEvents,
  };
}

// ============================================================================
// Demo Mode Hook - Uses static demo data
// ============================================================================
export function useEventStreamDemo(demoEvents: AgentEvent[]): UseEventStreamReturn {
  const [events, setEvents] = useState<AgentEvent[]>(demoEvents);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newEventCount, setNewEventCount] = useState(demoEvents.length);
  const [filters, setFiltersState] = useState<EventTypeFilter[]>(['all']);

  // Sync events when demoEvents prop changes (e.g., after loading completes)
  useEffect(() => {
    if (demoEvents.length > 0) {
      setEvents(demoEvents);
      setNewEventCount(demoEvents.length);
    }
  }, [demoEvents]);

  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);
  const toggleAutoScroll = useCallback(() => setAutoScroll((prev) => !prev), []);
  const clearEvents = useCallback(() => {
    setEvents([]);
    setNewEventCount(0);
  }, []);
  const markAllRead = useCallback(() => setNewEventCount(0), []);

  const setFilters = useCallback((newFilters: EventTypeFilter[]) => {
    if (newFilters.includes('all') || newFilters.length === 0) {
      setFiltersState(['all']);
    } else {
      setFiltersState(newFilters);
    }
  }, []);

  const addFilter = useCallback((filter: EventTypeFilter) => {
    setFiltersState((prev) => {
      if (filter === 'all') return ['all'];
      const withoutAll = prev.filter((f) => f !== 'all');
      if (withoutAll.includes(filter)) return prev;
      return [...withoutAll, filter];
    });
  }, []);

  const removeFilter = useCallback((filter: EventTypeFilter) => {
    setFiltersState((prev) => {
      const remaining = prev.filter((f) => f !== filter);
      return remaining.length === 0 ? ['all'] : remaining;
    });
  }, []);

  const exportEvents = useCallback(() => {
    const exportData = {
      metadata: {
        exported_at: new Date().toISOString(),
        session_id: 'demo',
        event_count: events.length,
        schema_version: '1.0',
      },
      events,
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    const sizeBytes = new Blob([jsonString]).size;
    return { data: jsonString, sizeBytes, exceedsLimit: sizeBytes > MAX_EXPORT_SIZE_BYTES };
  }, [events]);

  const filteredEvents = filters.includes('all')
    ? events
    : events.filter((event) => filters.includes(event.event_type as EventTypeFilter));

  return {
    events,
    isLoading: false,
    isPaused,
    autoScroll,
    connectionStatus: 'connected' as const,
    eventRate: 0,
    newEventCount,
    totalEventCount: events.length,
    error: null,
    filters,
    maxEventsReached: false,
    pause,
    resume,
    toggleAutoScroll,
    clearEvents,
    markAllRead,
    setFilters,
    addFilter,
    removeFilter,
    exportEvents,
    filteredEvents,
  };
}
