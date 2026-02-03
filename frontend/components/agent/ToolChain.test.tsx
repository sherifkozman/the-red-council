import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ToolChain } from './ToolChain';
import type { ToolCallEvent } from '@/lib/demo/demoData';

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: () => <div data-testid="cell" />,
}));

// Helper to create mock tool call events
function createToolCall(
  toolName: string,
  options: Partial<ToolCallEvent> = {}
): ToolCallEvent {
  return {
    id: `${Math.random().toString(36).slice(2)}-0000-0000-0000-000000000001`,
    session_id: '00000000-0000-0000-0000-000000000000',
    timestamp: new Date().toISOString(),
    event_type: 'tool_call',
    tool_name: toolName,
    arguments: { param: 'value' },
    result: { data: 'result' },
    duration_ms: 100,
    success: true,
    ...options,
  };
}

describe('ToolChain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty State', () => {
    it('renders empty state message when no tool calls', () => {
      render(<ToolChain toolCalls={[]} />);
      expect(screen.getByText('No tool calls to display.')).toBeInTheDocument();
    });
  });

  describe('Stats Display', () => {
    it('renders ToolStats with correct data', () => {
      const toolCalls = [
        createToolCall('search'),
        createToolCall('read'),
        createToolCall('search'),
      ];
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.getByText('Total Calls')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Unique Tools')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('View Mode Toggle', () => {
    it('renders view mode buttons', () => {
      const toolCalls = [createToolCall('tool1')];
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.getByRole('button', { name: 'Chart' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Diagram' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
    });

    it('switches to SVG view when Diagram button clicked', () => {
      const toolCalls = [createToolCall('tool1')];
      render(<ToolChain toolCalls={toolCalls} />);

      fireEvent.click(screen.getByRole('button', { name: 'Diagram' }));

      // SVG view should contain the svg element
      const svg = screen.getByRole('img', { name: /tool chain diagram/i });
      expect(svg).toBeInTheDocument();
    });

    it('switches to text list view when List button clicked', () => {
      const toolCalls = [createToolCall('tool1', { arguments: { test: 'value' } })];
      render(<ToolChain toolCalls={toolCalls} />);

      fireEvent.click(screen.getByRole('button', { name: 'List' }));

      // Text view shows tool names as buttons
      expect(screen.getByRole('button', { name: /tool1/i })).toBeInTheDocument();
    });
  });

  describe('Violation Warnings', () => {
    it('shows loop warning when loop detected', () => {
      const toolCalls = [
        createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:01Z' }),
        createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:02Z' }),
        createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:03Z' }),
        createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:04Z' }),
        createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:05Z' }),
      ];
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.getByText('Loop Patterns Detected')).toBeInTheDocument();
      // Use getAllByText since looping_tool appears in multiple places
      expect(screen.getAllByText(/looping_tool/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/potential infinite loop/)).toBeInTheDocument();
    });

    it('shows excessive calls warning when threshold exceeded', () => {
      const toolCalls = Array.from({ length: 12 }, (_, i) =>
        createToolCall('excessive_tool', {
          timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        })
      );
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.getByText('Excessive Calls Detected')).toBeInTheDocument();
      expect(screen.getByText(/exceeds 10 call threshold/)).toBeInTheDocument();
    });

    it('shows ASI01 violation alert', () => {
      const toolCalls = Array.from({ length: 12 }, (_, i) =>
        createToolCall('bad_tool', {
          timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        })
      );
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.getByText('ASI01 Excessive Agency Detected')).toBeInTheDocument();
      expect(screen.getByText(/1 tool\(s\) show abuse patterns/)).toBeInTheDocument();
    });

    it('does not show violation warnings when no violations', () => {
      const toolCalls = [
        createToolCall('tool1'),
        createToolCall('tool2'),
      ];
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.queryByText('Loop Patterns Detected')).not.toBeInTheDocument();
      expect(screen.queryByText('Excessive Calls Detected')).not.toBeInTheDocument();
      expect(screen.queryByText('ASI01 Excessive Agency Detected')).not.toBeInTheDocument();
    });
  });

  describe('Chart Visualization', () => {
    it('renders chart by default', () => {
      const toolCalls = [createToolCall('tool1')];
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  describe('SVG Visualization', () => {
    it('renders nodes in SVG diagram', () => {
      const toolCalls = [
        createToolCall('nodeA', { timestamp: '2026-01-01T00:00:01Z' }),
        createToolCall('nodeB', { timestamp: '2026-01-01T00:00:02Z' }),
      ];
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'Diagram' }));

      const svg = screen.getByRole('img', { name: /tool chain diagram/i });
      expect(within(svg).getByText('nodeA')).toBeInTheDocument();
      expect(within(svg).getByText('nodeB')).toBeInTheDocument();
    });

    it('shows call counts in SVG', () => {
      const toolCalls = [
        createToolCall('tool1', { timestamp: '2026-01-01T00:00:01Z' }),
        createToolCall('tool1', { timestamp: '2026-01-01T00:00:02Z' }),
      ];
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'Diagram' }));

      const svg = screen.getByRole('img', { name: /tool chain diagram/i });
      expect(within(svg).getByText('(2)')).toBeInTheDocument();
    });

    it('handles empty diagram gracefully', () => {
      const toolCalls: ToolCallEvent[] = [];
      render(<ToolChain toolCalls={toolCalls} />);
      // Empty state is shown, no SVG rendered
      expect(screen.getByText('No tool calls to display.')).toBeInTheDocument();
    });
  });

  describe('Text Sequence View', () => {
    it('shows tool calls in list', () => {
      const toolCalls = [
        createToolCall('first_tool', { timestamp: '2026-01-01T00:00:01Z' }),
        createToolCall('second_tool', { timestamp: '2026-01-01T00:00:02Z' }),
      ];
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'List' }));

      expect(screen.getByText('first_tool')).toBeInTheDocument();
      expect(screen.getByText('second_tool')).toBeInTheDocument();
    });

    it('shows success indicator for successful calls', () => {
      const toolCalls = [createToolCall('success_tool', { success: true })];
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'List' }));

      // Now using icons instead of emojis - check for aria-label
      expect(screen.getByLabelText('Success')).toBeInTheDocument();
    });

    it('shows warning indicator for failed calls', () => {
      const toolCalls = [createToolCall('failed_tool', { success: false })];
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'List' }));

      // Now using icons instead of emojis - check for aria-label
      expect(screen.getByLabelText('Warning')).toBeInTheDocument();
    });

    it('shows violation indicator for ASI01 violations', () => {
      const toolCalls = Array.from({ length: 12 }, (_, i) =>
        createToolCall('violation_tool', {
          timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        })
      );
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'List' }));

      // Now using icons instead of emojis - check for aria-label
      const violationIndicators = screen.getAllByLabelText('Violation');
      expect(violationIndicators.length).toBeGreaterThan(0);
    });

    it('expands to show call details', () => {
      const toolCalls = [
        createToolCall('detail_tool', {
          arguments: { key: 'value' },
          duration_ms: 250,
        }),
      ];
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'List' }));

      // Click to expand
      fireEvent.click(screen.getByRole('button', { name: /detail_tool/i }));

      // Check for details
      expect(screen.getByText('Arguments')).toBeInTheDocument();
      expect(screen.getByText(/250.0ms/)).toBeInTheDocument();
    });

    it('shows exception type for failed calls', () => {
      const toolCalls = [
        createToolCall('error_tool', {
          success: false,
          exception_type: 'SecurityError',
        }),
      ];
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'List' }));
      fireEvent.click(screen.getByRole('button', { name: /error_tool/i }));

      expect(screen.getByText(/Exception: SecurityError/)).toBeInTheDocument();
    });
  });

  describe('Legend', () => {
    it('renders color legend', () => {
      const toolCalls = [createToolCall('tool1')];
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.getByText('Legend')).toBeInTheDocument();
      expect(screen.getByText('Normal')).toBeInTheDocument();
      expect(screen.getByText('Has Errors')).toBeInTheDocument();
      expect(screen.getByText('ASI01 Violation')).toBeInTheDocument();
      expect(screen.getByText('Highlighted')).toBeInTheDocument();
    });
  });

  describe('Tool Statistics Details', () => {
    it('renders collapsible tool statistics', () => {
      const toolCalls = [
        createToolCall('tool1', { duration_ms: 100 }),
        createToolCall('tool1', { duration_ms: 200 }),
        createToolCall('tool2', { success: false }),
      ];
      render(<ToolChain toolCalls={toolCalls} />);

      // Find and click the statistics button
      fireEvent.click(screen.getByRole('button', { name: 'Tool Statistics' }));

      // Check for tool details
      expect(screen.getByText(/tool1/)).toBeInTheDocument();
      expect(screen.getByText(/2 calls, 2 success, 0 errors/)).toBeInTheDocument();
      expect(screen.getByText(/tool2/)).toBeInTheDocument();
      expect(screen.getByText(/1 calls, 0 success, 1 errors/)).toBeInTheDocument();
    });

    it('shows badges for violations in statistics', () => {
      const toolCalls = Array.from({ length: 12 }, (_, i) =>
        createToolCall('flagged_tool', {
          timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        })
      );
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'Tool Statistics' }));

      expect(screen.getAllByText('ASI01').length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('has accessible chart header', () => {
      const toolCalls = [createToolCall('tool1')];
      render(<ToolChain toolCalls={toolCalls} />);

      expect(screen.getByText('Tool Call Chain')).toBeInTheDocument();
      expect(
        screen.getByText('Visualization of tool call patterns and transitions')
      ).toBeInTheDocument();
    });

    it('SVG has aria-label', () => {
      const toolCalls = [createToolCall('tool1')];
      render(<ToolChain toolCalls={toolCalls} />);
      fireEvent.click(screen.getByRole('button', { name: 'Diagram' }));

      const svg = screen.getByRole('img');
      expect(svg).toHaveAttribute('aria-label', 'Tool chain diagram showing transitions between tools');
    });
  });

  describe('Props', () => {
    it('applies custom className', () => {
      const toolCalls = [createToolCall('tool1')];
      const { container } = render(
        <ToolChain toolCalls={toolCalls} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
