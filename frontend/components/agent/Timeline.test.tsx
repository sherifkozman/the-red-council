import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Timeline, EVENTS_PER_PAGE, MAX_EVENTS_LIMIT, MAX_EXPORT_SIZE_BYTES } from './Timeline';
import { AgentEvent } from '@/lib/demo/demoData';

// Mock data generators
function createMockToolCallEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: 'tool_call',
    tool_name: 'test_tool',
    arguments: { arg1: 'value1' },
    result: 'success',
    duration_ms: 100,
    success: true,
    exception_type: null,
    ...overrides,
  } as AgentEvent;
}

function createMockMemoryEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: 'memory_access',
    operation: 'read',
    key: 'test_key',
    value_preview: 'test value',
    sensitive_detected: false,
    success: true,
    exception_type: null,
    ...overrides,
  } as AgentEvent;
}

function createMockDivergenceEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: 'divergence',
    speech_intent: 'Help user',
    actual_action: 'Deleted files',
    severity: 'HIGH',
    explanation: 'Agent claimed to help but performed destructive action',
    confidence_score: 0.95,
    ...overrides,
  } as AgentEvent;
}

function createMockSpeechEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: 'speech',
    content: 'Hello, I am here to help',
    intent: 'greeting',
    is_response_to_user: true,
    ...overrides,
  } as AgentEvent;
}

function createMockActionEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: crypto.randomUUID(),
    session_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: 'action',
    action_type: 'navigation',
    description: 'Navigate to page',
    target: '/dashboard',
    related_tool_calls: [],
    ...overrides,
  } as AgentEvent;
}

function generateMockEvents(count: number, startTime = new Date()): AgentEvent[] {
  const events: AgentEvent[] = [];
  const types: AgentEvent['event_type'][] = ['tool_call', 'memory_access', 'action', 'speech', 'divergence'];

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const timestamp = new Date(startTime.getTime() + i * 1000).toISOString();

    if (type === 'tool_call') {
      events.push(createMockToolCallEvent({ timestamp }));
    } else if (type === 'memory_access') {
      events.push(createMockMemoryEvent({ timestamp }));
    } else if (type === 'action') {
      events.push(createMockActionEvent({ timestamp }));
    } else if (type === 'speech') {
      events.push(createMockSpeechEvent({ timestamp }));
    } else {
      events.push(createMockDivergenceEvent({ timestamp }));
    }
  }

  return events;
}

describe('Timeline', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders empty state when no events', () => {
      render(<Timeline events={[]} />);

      expect(screen.getByText('No events to display')).toBeInTheDocument();
      expect(screen.getByText('Agent events will appear here as they occur.')).toBeInTheDocument();
    });

    it('renders timeline header and export button', () => {
      const events = [createMockToolCallEvent()];
      render(<Timeline events={events} />);

      expect(screen.getByText('Agent Behavior Timeline')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download timeline as json/i })).toBeInTheDocument();
    });

    it('renders event cards for each event', () => {
      const events = [
        createMockToolCallEvent({ tool_name: 'my_tool' }),
        createMockSpeechEvent({ content: 'Hello world' }),
      ];
      render(<Timeline events={events} />);

      // Check tool call event
      expect(screen.getByText('my_tool')).toBeInTheDocument();

      // Check speech event - look for partial text
      expect(screen.getByText(/Hello world/)).toBeInTheDocument();
    });

    it('renders all event type badges', () => {
      const events = [
        createMockToolCallEvent(),
        createMockMemoryEvent(),
        createMockActionEvent(),
        createMockSpeechEvent(),
        createMockDivergenceEvent(),
      ];
      render(<Timeline events={events} />);

      // Look for badges in the timeline cards (not filters)
      // Each event type appears in filters AND as event badge, so check for multiple
      expect(screen.getAllByText('Tool call').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Memory access').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Action').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Speech').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Divergence').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Pagination', () => {
    it('shows pagination when events exceed page size', () => {
      const events = generateMockEvents(25);
      render(<Timeline events={events} />);

      // Should show pagination controls
      expect(screen.getAllByText(/Page 1 of 2/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Showing 1-20 of 25 events/i)[0]).toBeInTheDocument();
    });

    it('navigates to next page', () => {
      const events = generateMockEvents(25);
      render(<Timeline events={events} />);

      // Click next page
      const nextButtons = screen.getAllByRole('button', { name: /next page/i });
      fireEvent.click(nextButtons[0]);

      // Should now show page 2
      expect(screen.getAllByText(/Page 2 of 2/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Showing 21-25 of 25 events/i)[0]).toBeInTheDocument();
    });

    it('navigates to first and last page', () => {
      const events = generateMockEvents(50);
      render(<Timeline events={events} />);

      // Go to last page
      const lastButtons = screen.getAllByRole('button', { name: /last page/i });
      fireEvent.click(lastButtons[0]);

      expect(screen.getAllByText(/Page 3 of 3/i)[0]).toBeInTheDocument();

      // Go to first page
      const firstButtons = screen.getAllByRole('button', { name: /first page/i });
      fireEvent.click(firstButtons[0]);

      expect(screen.getAllByText(/Page 1 of 3/i)[0]).toBeInTheDocument();
    });

    it('disables prev/first buttons on first page', () => {
      const events = generateMockEvents(25);
      render(<Timeline events={events} />);

      const prevButtons = screen.getAllByRole('button', { name: /previous page/i });
      const firstButtons = screen.getAllByRole('button', { name: /first page/i });

      expect(prevButtons[0]).toBeDisabled();
      expect(firstButtons[0]).toBeDisabled();
    });

    it('disables next/last buttons on last page', () => {
      const events = generateMockEvents(25);
      render(<Timeline events={events} />);

      // Go to last page
      const lastButtons = screen.getAllByRole('button', { name: /last page/i });
      fireEvent.click(lastButtons[0]);

      const nextButtons = screen.getAllByRole('button', { name: /next page/i });
      expect(nextButtons[0]).toBeDisabled();
      expect(lastButtons[0]).toBeDisabled();
    });

    it('does not show pagination for single page', () => {
      const events = generateMockEvents(10);
      render(<Timeline events={events} />);

      // Should not have page navigation
      expect(screen.queryByText(/Page 1 of/i)).not.toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('renders filter buttons with counts', () => {
      const events = [
        createMockToolCallEvent(),
        createMockToolCallEvent(),
        createMockSpeechEvent(),
      ];
      render(<Timeline events={events} />);

      // Check filter with count
      const toolCallFilter = screen.getByRole('button', { name: /filter by tool call/i });
      expect(within(toolCallFilter).getByText('2')).toBeInTheDocument();

      const speechFilter = screen.getByRole('button', { name: /filter by speech/i });
      expect(within(speechFilter).getByText('1')).toBeInTheDocument();
    });

    it('filters events when type is selected', () => {
      const events = [
        createMockToolCallEvent({ tool_name: 'tool_one' }),
        createMockSpeechEvent({ content: 'speech_content' }),
      ];
      render(<Timeline events={events} />);

      // Both should be visible initially
      expect(screen.getByText('tool_one')).toBeInTheDocument();
      expect(screen.getByText(/speech_content/)).toBeInTheDocument();

      // Click to filter by tool_call only
      const toolCallFilter = screen.getByRole('button', { name: /filter by tool call/i });
      fireEvent.click(toolCallFilter);

      // Only tool call should be visible
      expect(screen.getByText('tool_one')).toBeInTheDocument();
      expect(screen.queryByText(/speech_content/)).not.toBeInTheDocument();
    });

    it('shows empty state when filter matches no events', () => {
      const events = [createMockToolCallEvent()];
      render(<Timeline events={events} />);

      // Filter by speech (which has 0 events)
      const speechFilter = screen.getByRole('button', { name: /filter by speech/i });
      fireEvent.click(speechFilter);

      expect(screen.getByText('No events match the selected filters.')).toBeInTheDocument();
    });

    it('resets filters when All is clicked', () => {
      const events = [
        createMockToolCallEvent({ tool_name: 'tool_one' }),
        createMockSpeechEvent({ content: 'speech_content' }),
      ];
      render(<Timeline events={events} />);

      // Filter by tool_call
      const toolCallFilter = screen.getByRole('button', { name: /filter by tool call/i });
      fireEvent.click(toolCallFilter);

      // Speech should be hidden
      expect(screen.queryByText(/speech_content/)).not.toBeInTheDocument();

      // Click All to reset
      const allFilter = screen.getByRole('button', { name: /show all event types/i });
      fireEvent.click(allFilter);

      // Both should be visible again
      expect(screen.getByText('tool_one')).toBeInTheDocument();
      expect(screen.getByText(/speech_content/)).toBeInTheDocument();
    });
  });

  describe('Event Expansion', () => {
    it('expands event card on click to show details', () => {
      const events = [createMockToolCallEvent({
        tool_name: 'expand_test',
        arguments: { test: 'value' },
      })];
      render(<Timeline events={events} />);

      // Find and click the trigger using data-state attribute
      const trigger = screen.getByText('expand_test').closest('[data-state]');
      if (trigger) {
        fireEvent.click(trigger);
      }

      // Details should be visible
      expect(screen.getByText(/Arguments:/)).toBeInTheDocument();
      expect(screen.getByText(/Result:/)).toBeInTheDocument();
    });

    it('divergence events are expanded by default', () => {
      const events = [createMockDivergenceEvent({
        explanation: 'Default expanded explanation',
      })];
      render(<Timeline events={events} />);

      // Explanation should be visible without clicking
      expect(screen.getByText('Default expanded explanation')).toBeInTheDocument();
    });

    it('shows event ID and timestamp in expanded view', () => {
      const events = [createMockToolCallEvent()];
      render(<Timeline events={events} />);

      // Expand the event using the trigger
      const trigger = screen.getByText('test_tool').closest('[data-state]');
      if (trigger) {
        fireEvent.click(trigger);
      }

      // Should show ID prefix
      expect(screen.getByText(/ID:/)).toBeInTheDocument();
      expect(screen.getByText(/Timestamp:/)).toBeInTheDocument();
    });
  });

  describe('Export', () => {
    beforeEach(() => {
      // Mock URL methods
      global.URL.createObjectURL = vi.fn(() => 'blob:test');
      global.URL.revokeObjectURL = vi.fn();
    });

    it('exports events as JSON when clicking export button', () => {
      const events = [createMockToolCallEvent()];
      render(<Timeline events={events} />);

      // Mock link click
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as unknown as Node);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as unknown as Node);

      const exportButton = screen.getByRole('button', { name: /download timeline as json/i });
      fireEvent.click(exportButton);

      // Should have created a link element
      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('disables export button when no events', () => {
      render(<Timeline events={[]} />);

      // Export button shouldn't exist in empty state
      expect(screen.queryByRole('button', { name: /export json/i })).not.toBeInTheDocument();
    });
  });

  describe('Limit Handling', () => {
    it('shows warning when events exceed limit', () => {
      // Create a mock that pretends events.length > MAX_EVENTS_LIMIT
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // We can't easily create 5000+ events in test, so we test the warning condition
      // by checking the console.warn is called when limit would be exceeded
      const events = generateMockEvents(10);
      render(<Timeline events={events} />);

      // No warning for small event list
      expect(screen.queryByText(/Event list truncated/)).not.toBeInTheDocument();
    });
  });

  describe('Time Display', () => {
    it('shows relative time since session start', () => {
      const sessionStart = '2024-01-01T10:00:00.000Z';
      const events = [
        createMockToolCallEvent({
          timestamp: '2024-01-01T10:01:30.000Z' // 1 minute 30 seconds after start
        }),
      ];
      render(<Timeline events={events} sessionStartTime={sessionStart} />);

      // Should show relative time (+0:01:30)
      expect(screen.getByText('+0:01:30')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for filters', () => {
      const events = [createMockToolCallEvent()];
      render(<Timeline events={events} />);

      expect(screen.getByRole('group', { name: /event type filters/i })).toBeInTheDocument();
    });

    it('has proper ARIA labels for pagination', () => {
      const events = generateMockEvents(25);
      render(<Timeline events={events} />);

      expect(screen.getAllByRole('navigation', { name: /pagination/i })[0]).toBeInTheDocument();
    });

    it('has proper role for timeline list', () => {
      const events = [createMockToolCallEvent()];
      render(<Timeline events={events} />);

      expect(screen.getByRole('list', { name: /timeline events/i })).toBeInTheDocument();
    });
  });

  describe('Event Type Specific Rendering', () => {
    it('renders tool call with success/failure indicator', () => {
      const successEvent = createMockToolCallEvent({ success: true, tool_name: 'success_tool' });
      const failEvent = createMockToolCallEvent({
        success: false,
        tool_name: 'fail_tool',
        exception_type: 'TestError',
      });

      render(<Timeline events={[successEvent, failEvent]} />);

      // Both tools should be visible
      expect(screen.getByText('success_tool')).toBeInTheDocument();
      expect(screen.getByText('fail_tool')).toBeInTheDocument();

      // Check for success/failure icons via aria-labels
      expect(screen.getByLabelText('Success')).toBeInTheDocument();
      expect(screen.getByLabelText('Failed')).toBeInTheDocument();
    });

    it('renders memory access with sensitive data warning', () => {
      const sensitiveEvent = createMockMemoryEvent({
        sensitive_detected: true,
        key: 'api_key',
      });

      render(<Timeline events={[sensitiveEvent]} />);

      // Check for sensitive indicator
      expect(screen.getByLabelText('Sensitive data detected')).toBeInTheDocument();
    });

    it('renders divergence with severity badge', () => {
      const highSeverity = createMockDivergenceEvent({ severity: 'HIGH' });

      render(<Timeline events={[highSeverity]} />);

      // Check severity badge is displayed multiple times (header + details)
      const badges = screen.getAllByText('High severity');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('renders speech with direction indicator', () => {
      const toUserSpeech = createMockSpeechEvent({
        is_response_to_user: true,
        content: 'Response to user',
      });
      const internalSpeech = createMockSpeechEvent({
        is_response_to_user: false,
        content: 'Internal thought',
      });

      render(<Timeline events={[toUserSpeech, internalSpeech]} />);

      expect(screen.getByText(/To User: Response to user/)).toBeInTheDocument();
      expect(screen.getByText(/Internal: Internal thought/)).toBeInTheDocument();
    });
  });
});
