import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  useEventStream,
  useEventStreamDemo,
  MAX_EVENTS_LIMIT,
  MAX_EXPORT_SIZE_BYTES,
} from './useEventStream';
import { AgentEvent } from '@/lib/demo/demoData';

// ============================================================================
// Test Data
// ============================================================================
const createMockEvent = (overrides: Partial<AgentEvent> = {}): AgentEvent => ({
  id: crypto.randomUUID(),
  session_id: '00000000-0000-0000-0000-000000000000',
  timestamp: new Date().toISOString(),
  event_type: 'tool_call',
  tool_name: 'test_tool',
  arguments: { arg1: 'value1' },
  result: { success: true },
  duration_ms: 100,
  success: true,
  ...overrides,
} as AgentEvent);

const mockEvents: AgentEvent[] = [
  createMockEvent({ id: '11111111-1111-1111-1111-111111111111', event_type: 'tool_call', tool_name: 'search' }),
  createMockEvent({ id: '22222222-2222-2222-2222-222222222222', event_type: 'speech', content: 'Hello', intent: 'greeting', is_response_to_user: true } as AgentEvent),
  createMockEvent({ id: '33333333-3333-3333-3333-333333333333', event_type: 'memory_access', operation: 'read', key: 'test_key', sensitive_detected: false, success: true } as AgentEvent),
];

// ============================================================================
// Mocks
// ============================================================================
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID for consistent test data
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
});

describe('useEventStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('initializes with default state', () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: null, enabled: false })
      );

      expect(result.current.events).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.autoScroll).toBe(true);
      expect(result.current.connectionStatus).toBe('disconnected');
      expect(result.current.eventRate).toBe(0);
      expect(result.current.newEventCount).toBe(0);
      expect(result.current.totalEventCount).toBe(0);
      expect(result.current.error).toBeNull();
      expect(result.current.filters).toEqual(['all']);
      expect(result.current.maxEventsReached).toBe(false);
    });

    it('does not poll when sessionId is null', async () => {
      renderHook(() => useEventStream({ sessionId: null }));

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not poll when enabled is false', async () => {
      renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: false })
      );

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('polling', () => {
    it('polls for events when enabled with valid sessionId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: mockEvents, total_count: 3 }),
      });

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Verify the URL was constructed correctly
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toContain('/api/v1/agent/session/test-session/events');
    });

    it('updates events on successful poll', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: mockEvents, total_count: 3 }),
      });

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.events.length).toBe(3);
      });

      expect(result.current.connectionStatus).toBe('connected');
      expect(result.current.newEventCount).toBe(3);
      expect(result.current.totalEventCount).toBe(3);
    });

    it('handles HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('HTTP 500: Internal Server Error');
      });

      expect(result.current.connectionStatus).toBe('error');
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });
    });

    it('includes auth token in headers when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: [], total_count: 0 }),
      });

      renderHook(() =>
        useEventStream({
          sessionId: 'test-session',
          enabled: true,
          authToken: 'test-token',
        })
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer test-token');
    });
  });

  describe('pause/resume', () => {
    it('pauses event stream', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [], total_count: 0 }),
      });

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      act(() => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(true);
    });

    it('resumes event stream', async () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      act(() => {
        result.current.pause();
      });

      act(() => {
        result.current.resume();
      });

      expect(result.current.isPaused).toBe(false);
    });

    it('does not poll when paused', async () => {
      mockFetch.mockClear();

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      act(() => {
        result.current.pause();
      });

      // Clear any initial fetch calls
      mockFetch.mockClear();

      // Advance time
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('auto-scroll', () => {
    it('toggles auto-scroll', () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: null, enabled: false })
      );

      expect(result.current.autoScroll).toBe(true);

      act(() => {
        result.current.toggleAutoScroll();
      });

      expect(result.current.autoScroll).toBe(false);

      act(() => {
        result.current.toggleAutoScroll();
      });

      expect(result.current.autoScroll).toBe(true);
    });
  });

  describe('clear events', () => {
    it('clears all events and resets state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: mockEvents, total_count: 3 }),
      });

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.events.length).toBe(3);
      });

      act(() => {
        result.current.clearEvents();
      });

      expect(result.current.events).toEqual([]);
      expect(result.current.newEventCount).toBe(0);
      expect(result.current.totalEventCount).toBe(0);
      expect(result.current.maxEventsReached).toBe(false);
      expect(result.current.eventRate).toBe(0);
    });
  });

  describe('mark all read', () => {
    it('resets new event count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: mockEvents, total_count: 3 }),
      });

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.newEventCount).toBe(3);
      });

      act(() => {
        result.current.markAllRead();
      });

      expect(result.current.newEventCount).toBe(0);
    });
  });

  describe('filters', () => {
    it('sets filters correctly', () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: null, enabled: false })
      );

      act(() => {
        result.current.setFilters(['tool_call', 'speech']);
      });

      expect(result.current.filters).toEqual(['tool_call', 'speech']);
    });

    it('resets to all when empty filters provided', () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: null, enabled: false })
      );

      act(() => {
        result.current.setFilters(['tool_call']);
      });

      act(() => {
        result.current.setFilters([]);
      });

      expect(result.current.filters).toEqual(['all']);
    });

    it('selects only all when all is in filters', () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: null, enabled: false })
      );

      act(() => {
        result.current.setFilters(['all', 'tool_call']);
      });

      expect(result.current.filters).toEqual(['all']);
    });

    it('adds filter correctly', () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: null, enabled: false })
      );

      act(() => {
        result.current.addFilter('tool_call');
      });

      expect(result.current.filters).toEqual(['tool_call']);

      act(() => {
        result.current.addFilter('speech');
      });

      expect(result.current.filters).toEqual(['tool_call', 'speech']);
    });

    it('removes filter correctly', () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: null, enabled: false })
      );

      act(() => {
        result.current.setFilters(['tool_call', 'speech']);
      });

      act(() => {
        result.current.removeFilter('tool_call');
      });

      expect(result.current.filters).toEqual(['speech']);
    });

    it('resets to all when last filter removed', () => {
      const { result } = renderHook(() =>
        useEventStream({ sessionId: null, enabled: false })
      );

      act(() => {
        result.current.setFilters(['tool_call']);
      });

      act(() => {
        result.current.removeFilter('tool_call');
      });

      expect(result.current.filters).toEqual(['all']);
    });

    it('filters events correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: mockEvents, total_count: 3 }),
      });

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.events.length).toBe(3);
      });

      act(() => {
        result.current.setFilters(['tool_call']);
      });

      expect(result.current.filteredEvents.length).toBe(1);
      expect(result.current.filteredEvents[0].event_type).toBe('tool_call');
    });
  });

  describe('export', () => {
    it('exports events as JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: mockEvents, total_count: 3 }),
      });

      const { result } = renderHook(() =>
        useEventStream({ sessionId: 'test-session', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.events.length).toBe(3);
      });

      const { data, sizeBytes, exceedsLimit } = result.current.exportEvents();

      const parsed = JSON.parse(data);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.session_id).toBe('test-session');
      expect(parsed.metadata.event_count).toBe(3);
      expect(parsed.events).toHaveLength(3);
      expect(sizeBytes).toBeGreaterThan(0);
      expect(exceedsLimit).toBe(false);
    });

    it('detects when export exceeds size limit', () => {
      // Create a large event payload using demo hook for simplicity
      const largeEvents = Array.from({ length: 500 }, (_, i) =>
        createMockEvent({
          id: `large-${i}-${crypto.randomUUID()}`,
          tool_name: 'x'.repeat(25000), // Very long tool name
        })
      );

      const { result } = renderHook(() => useEventStreamDemo(largeEvents));

      const { exceedsLimit, sizeBytes } = result.current.exportEvents();

      // With 500 events with 25KB tool names, this should exceed 10MB
      expect(sizeBytes).toBeGreaterThan(10 * 1024 * 1024);
      expect(exceedsLimit).toBe(true);
    });
  });
});

describe('useEventStreamDemo', () => {
  it('initializes with provided demo events', () => {
    const { result } = renderHook(() => useEventStreamDemo(mockEvents));

    expect(result.current.events).toEqual(mockEvents);
    expect(result.current.totalEventCount).toBe(3);
    expect(result.current.connectionStatus).toBe('connected');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('supports pause/resume', () => {
    const { result } = renderHook(() => useEventStreamDemo(mockEvents));

    act(() => {
      result.current.pause();
    });

    expect(result.current.isPaused).toBe(true);

    act(() => {
      result.current.resume();
    });

    expect(result.current.isPaused).toBe(false);
  });

  it('supports auto-scroll toggle', () => {
    const { result } = renderHook(() => useEventStreamDemo(mockEvents));

    expect(result.current.autoScroll).toBe(true);

    act(() => {
      result.current.toggleAutoScroll();
    });

    expect(result.current.autoScroll).toBe(false);
  });

  it('supports clear events', () => {
    const { result } = renderHook(() => useEventStreamDemo(mockEvents));

    act(() => {
      result.current.clearEvents();
    });

    expect(result.current.events).toEqual([]);
    expect(result.current.totalEventCount).toBe(0);
    expect(result.current.newEventCount).toBe(0);
  });

  it('supports mark all read', () => {
    const { result } = renderHook(() => useEventStreamDemo(mockEvents));

    expect(result.current.newEventCount).toBe(3);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.newEventCount).toBe(0);
  });

  it('supports filters', () => {
    const { result } = renderHook(() => useEventStreamDemo(mockEvents));

    act(() => {
      result.current.setFilters(['tool_call']);
    });

    expect(result.current.filteredEvents.length).toBe(1);
    expect(result.current.filteredEvents[0].event_type).toBe('tool_call');
  });

  it('supports export', () => {
    const { result } = renderHook(() => useEventStreamDemo(mockEvents));

    const { data, sizeBytes, exceedsLimit } = result.current.exportEvents();

    const parsed = JSON.parse(data);
    expect(parsed.metadata.session_id).toBe('demo');
    expect(parsed.events).toHaveLength(3);
    expect(sizeBytes).toBeGreaterThan(0);
    expect(exceedsLimit).toBe(false);
  });
});

describe('constants', () => {
  it('exports MAX_EVENTS_LIMIT', () => {
    expect(MAX_EVENTS_LIMIT).toBe(5000);
  });

  it('exports MAX_EXPORT_SIZE_BYTES', () => {
    expect(MAX_EXPORT_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});
