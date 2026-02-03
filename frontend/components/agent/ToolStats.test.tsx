import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ToolStats,
  analyzeToolChain,
  LOOP_THRESHOLD,
  EXCESSIVE_CALLS_THRESHOLD,
} from './ToolStats';
import type { ToolCallEvent } from '@/lib/demo/demoData';

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
    arguments: {},
    result: null,
    duration_ms: 100,
    success: true,
    ...options,
  };
}

describe('analyzeToolChain', () => {
  it('returns empty analysis for empty array', () => {
    const analysis = analyzeToolChain([]);
    expect(analysis.totalCalls).toBe(0);
    expect(analysis.uniqueTools).toBe(0);
    expect(analysis.errorRate).toBe(0);
    expect(analysis.loopsDetected).toHaveLength(0);
    expect(analysis.excessiveTools).toHaveLength(0);
    expect(analysis.asi01Violations).toHaveLength(0);
  });

  it('counts tool calls correctly', () => {
    const toolCalls = [
      createToolCall('search'),
      createToolCall('search'),
      createToolCall('read'),
    ];
    const analysis = analyzeToolChain(toolCalls);

    expect(analysis.totalCalls).toBe(3);
    expect(analysis.uniqueTools).toBe(2);
    expect(analysis.nodes.get('search')?.callCount).toBe(2);
    expect(analysis.nodes.get('read')?.callCount).toBe(1);
  });

  it('calculates error rate correctly', () => {
    const toolCalls = [
      createToolCall('tool1', { success: true }),
      createToolCall('tool2', { success: false }),
      createToolCall('tool3', { success: true }),
      createToolCall('tool4', { success: false }),
    ];
    const analysis = analyzeToolChain(toolCalls);

    expect(analysis.errorRate).toBe(0.5);
    expect(analysis.nodes.get('tool2')?.errorCount).toBe(1);
    expect(analysis.nodes.get('tool4')?.errorCount).toBe(1);
  });

  it('detects loop patterns when tool called more than LOOP_THRESHOLD consecutive times', () => {
    // Create calls with more than LOOP_THRESHOLD consecutive calls
    const toolCalls = [
      createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:01Z' }),
      createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:02Z' }),
      createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:03Z' }),
      createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:04Z' }),
      createToolCall('looping_tool', { timestamp: '2026-01-01T00:00:05Z' }), // 5 consecutive
    ];
    const analysis = analyzeToolChain(toolCalls);

    expect(analysis.loopsDetected).toContain('looping_tool');
    expect(analysis.nodes.get('looping_tool')?.isLoop).toBe(true);
    expect(analysis.nodes.get('looping_tool')?.isAsi01Violation).toBe(true);
  });

  it('does not flag loop when under threshold', () => {
    const toolCalls = [
      createToolCall('tool1', { timestamp: '2026-01-01T00:00:01Z' }),
      createToolCall('tool1', { timestamp: '2026-01-01T00:00:02Z' }),
      createToolCall('tool1', { timestamp: '2026-01-01T00:00:03Z' }), // Exactly 3, not > 3
    ];
    const analysis = analyzeToolChain(toolCalls);

    expect(analysis.loopsDetected).toHaveLength(0);
    expect(analysis.nodes.get('tool1')?.isLoop).toBe(false);
  });

  it('detects excessive calls when tool called more than EXCESSIVE_CALLS_THRESHOLD times', () => {
    const toolCalls = Array.from({ length: EXCESSIVE_CALLS_THRESHOLD + 1 }, (_, i) =>
      createToolCall('excessive_tool', { timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z` })
    );
    const analysis = analyzeToolChain(toolCalls);

    expect(analysis.excessiveTools).toContain('excessive_tool');
    expect(analysis.nodes.get('excessive_tool')?.isExcessive).toBe(true);
    expect(analysis.nodes.get('excessive_tool')?.isAsi01Violation).toBe(true);
  });

  it('does not flag excessive when under threshold', () => {
    const toolCalls = Array.from({ length: EXCESSIVE_CALLS_THRESHOLD }, (_, i) =>
      createToolCall('normal_tool', { timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z` })
    );
    const analysis = analyzeToolChain(toolCalls);

    expect(analysis.excessiveTools).toHaveLength(0);
    expect(analysis.nodes.get('normal_tool')?.isExcessive).toBe(false);
  });

  it('combines ASI01 violations from loops and excessive calls', () => {
    // Create both loop and excessive patterns
    const loopCalls = Array.from({ length: 5 }, (_, i) =>
      createToolCall('loop_tool', { timestamp: `2026-01-01T00:00:0${i}Z` })
    );
    const excessiveCalls = Array.from({ length: EXCESSIVE_CALLS_THRESHOLD + 1 }, (_, i) =>
      createToolCall('excessive_tool', { timestamp: `2026-01-01T00:01:${String(i).padStart(2, '0')}Z` })
    );
    const analysis = analyzeToolChain([...loopCalls, ...excessiveCalls]);

    expect(analysis.asi01Violations).toContain('loop_tool');
    expect(analysis.asi01Violations).toContain('excessive_tool');
    expect(analysis.asi01Violations.length).toBe(2);
  });

  it('calculates edges correctly', () => {
    const toolCalls = [
      createToolCall('a', { timestamp: '2026-01-01T00:00:01Z' }),
      createToolCall('b', { timestamp: '2026-01-01T00:00:02Z' }),
      createToolCall('a', { timestamp: '2026-01-01T00:00:03Z' }),
      createToolCall('b', { timestamp: '2026-01-01T00:00:04Z' }),
    ];
    const analysis = analyzeToolChain(toolCalls);

    expect(analysis.edges).toHaveLength(2); // a→b and b→a
    const abEdge = analysis.edges.find((e) => e.source === 'a' && e.target === 'b');
    const baEdge = analysis.edges.find((e) => e.source === 'b' && e.target === 'a');
    expect(abEdge?.count).toBe(2);
    expect(baEdge?.count).toBe(1);
  });

  it('tracks duration correctly', () => {
    const toolCalls = [
      createToolCall('tool1', { duration_ms: 100 }),
      createToolCall('tool1', { duration_ms: 200 }),
      createToolCall('tool1', { duration_ms: 300 }),
    ];
    const analysis = analyzeToolChain(toolCalls);

    expect(analysis.nodes.get('tool1')?.totalDurationMs).toBe(600);
  });

  it('sorts calls by timestamp', () => {
    const toolCalls = [
      createToolCall('c', { timestamp: '2026-01-01T00:00:03Z' }),
      createToolCall('a', { timestamp: '2026-01-01T00:00:01Z' }),
      createToolCall('b', { timestamp: '2026-01-01T00:00:02Z' }),
    ];
    const analysis = analyzeToolChain(toolCalls);

    // Edges should show a→b→c sequence
    expect(analysis.edges.find((e) => e.source === 'a' && e.target === 'b')).toBeDefined();
    expect(analysis.edges.find((e) => e.source === 'b' && e.target === 'c')).toBeDefined();
  });
});

describe('ToolStats', () => {
  it('renders empty state for zero calls', () => {
    const analysis = analyzeToolChain([]);
    render(<ToolStats analysis={analysis} />);

    expect(screen.getByText('Total Calls')).toBeInTheDocument();
    // Use getAllByText since '0' appears in multiple stat cards
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Unique Tools')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('renders correct statistics', () => {
    const toolCalls = [
      createToolCall('tool1', { success: true }),
      createToolCall('tool2', { success: false }),
      createToolCall('tool1', { success: true }),
    ];
    const analysis = analyzeToolChain(toolCalls);
    render(<ToolStats analysis={analysis} />);

    expect(screen.getByText('3')).toBeInTheDocument(); // Total calls
    expect(screen.getByText('2')).toBeInTheDocument(); // Unique tools
    expect(screen.getByText('33.3%')).toBeInTheDocument(); // Error rate
  });

  it('shows ASI01 violation count', () => {
    const toolCalls = Array.from({ length: 12 }, (_, i) =>
      createToolCall('violation_tool', { timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z` })
    );
    const analysis = analyzeToolChain(toolCalls);
    render(<ToolStats analysis={analysis} />);

    expect(screen.getByText('ASI01 Violations')).toBeInTheDocument();
    // '1' may appear elsewhere, so use getAllByText
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Detected')).toBeInTheDocument(); // Badge
  });

  it('has accessible region', () => {
    const analysis = analyzeToolChain([]);
    render(<ToolStats analysis={analysis} />);

    expect(screen.getByRole('region', { name: /tool chain statistics/i })).toBeInTheDocument();
  });

  it('shows warning badge for high error rate', () => {
    const toolCalls = [
      createToolCall('tool1', { success: false }),
      createToolCall('tool2', { success: false }),
      createToolCall('tool3', { success: true }),
    ];
    const analysis = analyzeToolChain(toolCalls);
    render(<ToolStats analysis={analysis} />);

    expect(screen.getByText('Above 10%')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const analysis = analyzeToolChain([]);
    const { container } = render(<ToolStats analysis={analysis} className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('Constants', () => {
  it('LOOP_THRESHOLD is 3', () => {
    expect(LOOP_THRESHOLD).toBe(3);
  });

  it('EXCESSIVE_CALLS_THRESHOLD is 10', () => {
    expect(EXCESSIVE_CALLS_THRESHOLD).toBe(10);
  });
});
