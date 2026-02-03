import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { EventStream } from './EventStream';
import { UseEventStreamReturn } from '@/hooks/useEventStream';
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

const mockToolCallEvent = createMockEvent({
  id: '11111111-1111-1111-1111-111111111111',
  event_type: 'tool_call',
  tool_name: 'search_database',
});

const mockSpeechEvent = createMockEvent({
  id: '22222222-2222-2222-2222-222222222222',
  event_type: 'speech',
  content: 'Hello, how can I help you today?',
  intent: 'greeting',
  is_response_to_user: true,
} as AgentEvent);

const mockDivergenceEvent = createMockEvent({
  id: '33333333-3333-3333-3333-333333333333',
  event_type: 'divergence',
  speech_intent: 'check_balance',
  actual_action: 'accessed_admin_config',
  severity: 'HIGH',
  explanation: 'Agent deviated from stated intent.',
  confidence_score: 0.95,
} as AgentEvent);

const mockEvents: AgentEvent[] = [mockToolCallEvent, mockSpeechEvent, mockDivergenceEvent];

// ============================================================================
// Mock Stream
// ============================================================================
const createMockStream = (overrides: Partial<UseEventStreamReturn> = {}): UseEventStreamReturn => ({
  events: mockEvents,
  isLoading: false,
  isPaused: false,
  autoScroll: true,
  connectionStatus: 'connected',
  eventRate: 2.5,
  newEventCount: 3,
  totalEventCount: 3,
  error: null,
  filters: ['all'],
  maxEventsReached: false,
  filteredEvents: mockEvents,
  pause: vi.fn(),
  resume: vi.fn(),
  toggleAutoScroll: vi.fn(),
  clearEvents: vi.fn(),
  markAllRead: vi.fn(),
  setFilters: vi.fn(),
  addFilter: vi.fn(),
  removeFilter: vi.fn(),
  exportEvents: vi.fn(() => ({
    data: JSON.stringify({ events: mockEvents }),
    sizeBytes: 1000,
    exceedsLimit: false,
  })),
  ...overrides,
});

// ============================================================================
// Tests - Each test is self-contained with single render
// ============================================================================
describe('EventStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders connection status, metrics, and event cards', () => {
    const stream = createMockStream();
    render(<EventStream stream={stream} />);

    // Connection status
    expect(screen.getByRole('status', { name: /connection status/i })).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();

    // Metrics
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2.5/s')).toBeInTheDocument();
    expect(screen.getByText('3 new')).toBeInTheDocument();

    // Event cards - use getAllByText since labels appear in both filters and event cards
    expect(screen.getByText(/showing 3 events/i)).toBeInTheDocument();
    expect(screen.getAllByText('Tool call').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Speech').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Divergence').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('High severity')).toBeInTheDocument();
  });

  it('renders error and max events alerts', () => {
    const stream = createMockStream({
      maxEventsReached: true,
      error: 'Connection failed',
    });
    render(<EventStream stream={stream} />);

    expect(screen.getByText(/maximum event limit reached/i)).toBeInTheDocument();
    expect(screen.getByText('Connection failed')).toBeInTheDocument();
  });

  it('renders paused state with controls', () => {
    const resume = vi.fn();
    const stream = createMockStream({ isPaused: true, resume });
    render(<EventStream stream={stream} />);

    expect(screen.getByText(/event stream paused/i)).toBeInTheDocument();

    const resumeBtn = screen.getByRole('button', { name: /resume event stream/i });
    fireEvent.click(resumeBtn);
    expect(resume).toHaveBeenCalled();
  });

  it('renders empty and loading states', () => {
    const stream = createMockStream({
      isLoading: true,
      events: [],
      filteredEvents: [],
      totalEventCount: 0
    });
    render(<EventStream stream={stream} />);

    expect(screen.getByText(/loading events/i)).toBeInTheDocument();
  });

  it('handles pause, auto-scroll, clear, and mark read controls', () => {
    const pause = vi.fn();
    const toggleAutoScroll = vi.fn();
    const clearEvents = vi.fn();
    const markAllRead = vi.fn();

    const stream = createMockStream({
      isPaused: false,
      pause,
      toggleAutoScroll,
      clearEvents,
      markAllRead,
      newEventCount: 5
    });
    render(<EventStream stream={stream} />);

    // Test pause
    fireEvent.click(screen.getByRole('button', { name: /pause event stream/i }));
    expect(pause).toHaveBeenCalled();

    // Test auto-scroll toggle
    fireEvent.click(screen.getByRole('button', { name: /auto-scroll/i, pressed: true }));
    expect(toggleAutoScroll).toHaveBeenCalled();

    // Test clear
    fireEvent.click(screen.getByRole('button', { name: /clear all events/i }));
    expect(clearEvents).toHaveBeenCalled();

    // Test mark read
    fireEvent.click(screen.getByRole('button', { name: /mark 5 events as read/i }));
    expect(markAllRead).toHaveBeenCalled();
  });

  it('handles export functionality', () => {
    const exportEvents = vi.fn(() => ({ data: '{}', sizeBytes: 100, exceedsLimit: false }));
    const stream = createMockStream({ exportEvents });
    render(<EventStream stream={stream} />);

    // Test export
    fireEvent.click(screen.getByRole('button', { name: /export events as json/i }));
    expect(exportEvents).toHaveBeenCalled();
  });

  it('handles filter controls', () => {
    const setFilters = vi.fn();
    const stream = createMockStream({ setFilters });
    render(<EventStream stream={stream} />);

    // Test filter toggle
    expect(screen.getByRole('button', { name: /show all event types/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /filter by tool call/i }));
    expect(setFilters).toHaveBeenCalled();
  });
});
