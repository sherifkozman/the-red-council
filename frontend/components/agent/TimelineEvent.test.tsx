import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { TimelineEvent } from './TimelineEvent';
import { AgentEvent } from '@/lib/demo/demoData';

// Mock data generators
function createMockToolCallEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: 'test-id-123',
    session_id: 'session-456',
    timestamp: '2024-01-01T10:30:00.000Z',
    event_type: 'tool_call',
    tool_name: 'test_tool',
    arguments: { arg1: 'value1' },
    result: 'success result',
    duration_ms: 150,
    success: true,
    exception_type: null,
    ...overrides,
  } as AgentEvent;
}

function createMockDivergenceEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: 'divergence-id-789',
    session_id: 'session-456',
    timestamp: '2024-01-01T10:30:00.000Z',
    event_type: 'divergence',
    speech_intent: 'Help user with files',
    actual_action: 'Deleted important files',
    severity: 'HIGH',
    explanation: 'Agent stated intent to help but performed destructive action',
    confidence_score: 0.92,
    ...overrides,
  } as AgentEvent;
}

function createMockMemoryEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: 'memory-id-321',
    session_id: 'session-456',
    timestamp: '2024-01-01T10:30:00.000Z',
    event_type: 'memory_access',
    operation: 'write',
    key: 'user_preferences',
    value_preview: '{"theme": "dark"}',
    sensitive_detected: false,
    success: true,
    exception_type: null,
    ...overrides,
  } as AgentEvent;
}

describe('TimelineEvent', () => {
  const defaultSessionStart = '2024-01-01T10:00:00.000Z';

  afterEach(() => {
    cleanup();
  });

  describe('Basic Rendering', () => {
    it('renders tool call event with correct header', () => {
      const event = createMockToolCallEvent({ tool_name: 'my_custom_tool' });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      expect(screen.getByText('my_custom_tool')).toBeInTheDocument();
      expect(screen.getByText('Tool call')).toBeInTheDocument();
    });

    it('renders divergence event with severity badge', () => {
      const event = createMockDivergenceEvent({ severity: 'HIGH' });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      expect(screen.getByText('DIVERGENCE DETECTED')).toBeInTheDocument();
      // Multiple instances of severity badge may exist
      expect(screen.getAllByText('High severity').length).toBeGreaterThan(0);
    });

    it('renders memory event with operation type', () => {
      const event = createMockMemoryEvent({ operation: 'read', key: 'test_key' });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      expect(screen.getByText(/READ: test_key/)).toBeInTheDocument();
      expect(screen.getByText('Memory access')).toBeInTheDocument();
    });

    it('shows relative time from session start', () => {
      const event = createMockToolCallEvent({
        timestamp: '2024-01-01T10:30:00.000Z', // 30 minutes after session start
      });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      expect(screen.getByText('+0:30:00')).toBeInTheDocument();
    });
  });

  describe('Expand/Collapse', () => {
    it('is collapsed by default', () => {
      const event = createMockToolCallEvent();
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      // Details should not be visible
      expect(screen.queryByText('Arguments:')).not.toBeInTheDocument();
    });

    it('expands when header is clicked', () => {
      const event = createMockToolCallEvent({
        arguments: { testArg: 'testValue' },
      });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      // The CardHeader is the clickable trigger
      const cardHeader = screen.getByText('test_tool').closest('[data-state]');
      expect(cardHeader).not.toBeNull();
      if (cardHeader) fireEvent.click(cardHeader);

      // Details should be visible
      expect(screen.getByText('Arguments:')).toBeInTheDocument();
      expect(screen.getByText('Result:')).toBeInTheDocument();
    });

    it('respects defaultExpanded prop', () => {
      const event = createMockToolCallEvent();
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      // Details should be visible without clicking
      expect(screen.getByText('Arguments:')).toBeInTheDocument();
    });

    it('collapses when clicking expanded event', () => {
      const event = createMockToolCallEvent();
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      // Should be expanded
      expect(screen.getByText('Arguments:')).toBeInTheDocument();

      // Click to collapse - use data-state attribute to find the trigger
      const cardHeader = screen.getByText('test_tool').closest('[data-state]');
      if (cardHeader) fireEvent.click(cardHeader);

      // Details should be hidden (Radix Collapsible hides content)
      // Note: Radix may keep content in DOM but hide it, so check visibility or data-state
      const collapsible = screen.getByText('test_tool').closest('[data-state]');
      expect(collapsible).toHaveAttribute('data-state', 'closed');
    });
  });

  describe('Timeline Line', () => {
    it('shows timeline line by default', () => {
      const event = createMockToolCallEvent();
      const { container } = render(
        <TimelineEvent event={event} sessionStartTime={defaultSessionStart} />
      );

      // Check for timeline dot
      const dot = container.querySelector('.rounded-full.border-2');
      expect(dot).toBeInTheDocument();
    });

    it('hides timeline line when showTimelineLine is false', () => {
      const event = createMockToolCallEvent();
      const { container } = render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          showTimelineLine={false}
        />
      );

      // Should not have padding-left from timeline
      const wrapper = container.firstChild;
      expect(wrapper).not.toHaveClass('pl-8');
    });
  });

  describe('Tool Call Details', () => {
    it('shows success icon for successful tool call', () => {
      const event = createMockToolCallEvent({ success: true });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      expect(screen.getByLabelText('Success')).toBeInTheDocument();
    });

    it('shows failure icon for failed tool call', () => {
      const event = createMockToolCallEvent({
        success: false,
        exception_type: 'RuntimeError',
      });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      expect(screen.getByLabelText('Failed')).toBeInTheDocument();
    });

    it('shows duration in milliseconds', () => {
      const event = createMockToolCallEvent({ duration_ms: 256.789 });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      expect(screen.getByText('(257ms)')).toBeInTheDocument();
    });

    it('shows exception type when failed', () => {
      const event = createMockToolCallEvent({
        success: false,
        exception_type: 'ValueError',
      });
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText(/Exception: ValueError/)).toBeInTheDocument();
    });
  });

  describe('Memory Event Details', () => {
    it('shows sensitive data warning when detected', () => {
      const event = createMockMemoryEvent({
        sensitive_detected: true,
        key: 'api_secret',
      });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      expect(screen.getByLabelText('Sensitive data detected')).toBeInTheDocument();
    });

    it('shows value preview when available', () => {
      const event = createMockMemoryEvent({
        value_preview: 'preview content here',
      });
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText('Value Preview:')).toBeInTheDocument();
      expect(screen.getByText('preview content here')).toBeInTheDocument();
    });
  });

  describe('Divergence Event Details', () => {
    it('shows confidence score', () => {
      const event = createMockDivergenceEvent({ confidence_score: 0.85 });
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText('Confidence: 85%')).toBeInTheDocument();
    });

    it('shows stated intent and actual action', () => {
      const event = createMockDivergenceEvent({
        speech_intent: 'Backup files',
        actual_action: 'Deleted files',
      });
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText('Stated Intent:')).toBeInTheDocument();
      expect(screen.getByText('Backup files')).toBeInTheDocument();
      expect(screen.getByText('Actual Action:')).toBeInTheDocument();
      expect(screen.getByText('Deleted files')).toBeInTheDocument();
    });

    it('shows explanation in highlighted box', () => {
      const event = createMockDivergenceEvent({
        explanation: 'This is a critical explanation',
      });
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText('Explanation:')).toBeInTheDocument();
      expect(screen.getByText('This is a critical explanation')).toBeInTheDocument();
    });
  });

  describe('Footer Information', () => {
    it('shows event ID in expanded view', () => {
      const event = createMockToolCallEvent({ id: 'unique-event-id-12345' });
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText(/ID: unique-event-id-12345/)).toBeInTheDocument();
    });

    it('shows timestamp in expanded view', () => {
      const event = createMockToolCallEvent();
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText(/Timestamp:/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles invalid timestamp gracefully', () => {
      const event = createMockToolCallEvent({
        timestamp: 'invalid-date',
      });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      // Should render something, not crash
      expect(screen.getByText('test_tool')).toBeInTheDocument();
      expect(screen.getByText('0:00:00')).toBeInTheDocument();
    });

    it('truncates long text content', () => {
      const longText = 'A'.repeat(2000);
      const event = createMockToolCallEvent({
        tool_name: longText,
      });
      render(<TimelineEvent event={event} sessionStartTime={defaultSessionStart} />);

      // Should truncate the tool name
      const displayedText = screen.getByText(/A{1,50}/);
      expect(displayedText).toBeInTheDocument();
      expect(displayedText.textContent?.length).toBeLessThan(100);
    });

    it('applies custom className', () => {
      const event = createMockToolCallEvent();
      const { container } = render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Action Event Details', () => {
    it('renders action event with related tool calls', () => {
      const event: AgentEvent = {
        id: 'action-123',
        session_id: 'session-456',
        timestamp: '2024-01-01T10:30:00.000Z',
        event_type: 'action',
        action_type: 'click',
        description: 'Click the button',
        target: '#submit-btn',
        related_tool_calls: ['uuid-1', 'uuid-2'],
      };
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText('Description:')).toBeInTheDocument();
      expect(screen.getByText('Click the button')).toBeInTheDocument();
      expect(screen.getByText('Target:')).toBeInTheDocument();
      expect(screen.getByText('Related Tool Calls:')).toBeInTheDocument();
    });
  });

  describe('Speech Event Details', () => {
    it('renders speech event with intent', () => {
      const event: AgentEvent = {
        id: 'speech-123',
        session_id: 'session-456',
        timestamp: '2024-01-01T10:30:00.000Z',
        event_type: 'speech',
        content: 'I will help you with this task.',
        intent: 'assistance',
        is_response_to_user: true,
      };
      render(
        <TimelineEvent
          event={event}
          sessionStartTime={defaultSessionStart}
          defaultExpanded={true}
        />
      );

      expect(screen.getByText('Inferred Intent:')).toBeInTheDocument();
      expect(screen.getByText('assistance')).toBeInTheDocument();
      expect(screen.getByText('Content:')).toBeInTheDocument();
    });
  });
});
