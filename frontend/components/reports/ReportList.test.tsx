import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import {
  ReportList,
  ReportSummary,
  formatReportDate,
  formatRelativeTime,
  truncateText,
  getStatusConfig,
  filterReports,
  sortReportsByDate,
  ReportFilters,
} from './ReportList';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// ============================================================================
// TEST DATA
// ============================================================================

const mockReports: ReportSummary[] = [
  {
    id: 'report-1',
    title: 'Security Assessment - Agent A',
    targetAgent: 'Agent A',
    generatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    sessionId: 'sess-abc123',
    maxSeverity: 9.5,
    violationCount: 5,
    status: 'complete',
  },
  {
    id: 'report-2',
    title: 'Prompt Injection Test - Agent B',
    targetAgent: 'Agent B',
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    sessionId: 'sess-def456',
    maxSeverity: 6.2,
    violationCount: 3,
    status: 'complete',
  },
  {
    id: 'report-3',
    title: 'OWASP Scan - Agent C',
    targetAgent: 'Agent C',
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // 1 week ago
    sessionId: 'sess-ghi789',
    maxSeverity: 0,
    violationCount: 0,
    status: 'complete',
  },
  {
    id: 'report-4',
    title: 'Running Test - Agent D',
    targetAgent: 'Agent D',
    generatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 min ago
    sessionId: 'sess-jkl012',
    maxSeverity: 3.5,
    violationCount: 1,
    status: 'in_progress',
  },
  {
    id: 'report-5',
    title: 'Failed Assessment - Agent E',
    targetAgent: 'Agent E',
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days ago
    sessionId: 'sess-mno345',
    maxSeverity: 0,
    violationCount: 0,
    status: 'failed',
  },
];

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('formatReportDate', () => {
  it('formats valid date string', () => {
    const result = formatReportDate('2024-01-15T10:00:00Z');
    expect(result).toContain('2024');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });

  it('returns "Unknown" for null', () => {
    expect(formatReportDate(null)).toBe('Unknown');
  });

  it('returns "Unknown" for undefined', () => {
    expect(formatReportDate(undefined)).toBe('Unknown');
  });

  it('returns "Unknown" for empty string', () => {
    expect(formatReportDate('')).toBe('Unknown');
  });

  it('returns "Unknown" for invalid date string', () => {
    expect(formatReportDate('not-a-date')).toBe('Unknown');
  });
});

describe('formatRelativeTime', () => {
  it('returns "Just now" for very recent times', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('Just now');
  });

  it('returns minutes ago for recent times', () => {
    const date = new Date(Date.now() - 1000 * 60 * 15).toISOString();
    expect(formatRelativeTime(date)).toBe('15m ago');
  });

  it('returns hours ago for times within 24 hours', () => {
    const date = new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString();
    expect(formatRelativeTime(date)).toBe('5h ago');
  });

  it('returns "Yesterday" for 1 day ago', () => {
    const date = new Date(Date.now() - 1000 * 60 * 60 * 24 * 1.5).toISOString();
    expect(formatRelativeTime(date)).toBe('Yesterday');
  });

  it('returns days ago for times within a week', () => {
    const date = new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString();
    expect(formatRelativeTime(date)).toBe('4 days ago');
  });

  it('returns weeks ago for times within a month', () => {
    const date = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString();
    expect(formatRelativeTime(date)).toBe('2 weeks ago');
  });

  it('returns empty string for null', () => {
    expect(formatRelativeTime(null)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatRelativeTime('invalid')).toBe('');
  });
});

describe('truncateText', () => {
  it('returns text as-is when under limit', () => {
    expect(truncateText('short', 10)).toBe('short');
  });

  it('truncates with ellipsis when over limit', () => {
    expect(truncateText('this is a longer text', 10)).toBe('this is...');
  });

  it('returns empty string for null/undefined', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('handles text exactly at limit', () => {
    expect(truncateText('1234567890', 10)).toBe('1234567890');
  });
});

describe('getStatusConfig', () => {
  it('returns correct config for complete status', () => {
    const config = getStatusConfig('complete');
    expect(config.label).toBe('Complete');
    expect(config.variant).toBe('default');
    expect(config.className).toContain('green');
  });

  it('returns correct config for in_progress status', () => {
    const config = getStatusConfig('in_progress');
    expect(config.label).toBe('In Progress');
    expect(config.variant).toBe('secondary');
    expect(config.className).toContain('blue');
  });

  it('returns correct config for failed status', () => {
    const config = getStatusConfig('failed');
    expect(config.label).toBe('Failed');
    expect(config.variant).toBe('destructive');
    expect(config.className).toContain('red');
  });
});

describe('filterReports', () => {
  const defaultFilters: ReportFilters = {
    riskLevel: 'all',
    status: 'all',
    search: '',
  };

  it('returns all reports with default filters', () => {
    const result = filterReports(mockReports, defaultFilters);
    expect(result.length).toBe(mockReports.length);
  });

  it('filters by risk level - critical', () => {
    const filters: ReportFilters = { ...defaultFilters, riskLevel: 'critical' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('report-1');
  });

  it('filters by risk level - high', () => {
    const filters: ReportFilters = { ...defaultFilters, riskLevel: 'high' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(0); // 6.2 is medium, not high
  });

  it('filters by risk level - medium', () => {
    const filters: ReportFilters = { ...defaultFilters, riskLevel: 'medium' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('report-2');
  });

  it('filters by risk level - none', () => {
    const filters: ReportFilters = { ...defaultFilters, riskLevel: 'none' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(2); // report-3 and report-5
  });

  it('filters by status - complete', () => {
    const filters: ReportFilters = { ...defaultFilters, status: 'complete' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(3);
  });

  it('filters by status - in_progress', () => {
    const filters: ReportFilters = { ...defaultFilters, status: 'in_progress' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('report-4');
  });

  it('filters by status - failed', () => {
    const filters: ReportFilters = { ...defaultFilters, status: 'failed' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('report-5');
  });

  it('filters by search query - title match', () => {
    const filters: ReportFilters = { ...defaultFilters, search: 'Prompt Injection' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('report-2');
  });

  it('filters by search query - session ID match', () => {
    const filters: ReportFilters = { ...defaultFilters, search: 'sess-ghi789' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('report-3');
  });

  it('filters by search query - agent name match', () => {
    const filters: ReportFilters = { ...defaultFilters, search: 'Agent A' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('report-1');
  });

  it('combines multiple filters', () => {
    const filters: ReportFilters = {
      riskLevel: 'none',
      status: 'complete',
      search: '',
    };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('report-3');
  });

  it('handles empty search string with whitespace', () => {
    const filters: ReportFilters = { ...defaultFilters, search: '   ' };
    const result = filterReports(mockReports, filters);
    expect(result.length).toBe(mockReports.length);
  });
});

describe('sortReportsByDate', () => {
  it('sorts reports by date newest first', () => {
    const result = sortReportsByDate(mockReports);
    // report-4 is newest (30 min ago), report-3 is oldest (1 week ago)
    expect(result[0].id).toBe('report-4'); // 30 min ago
    expect(result[1].id).toBe('report-1'); // 1 hour ago
    expect(result[result.length - 1].id).toBe('report-3'); // 1 week ago
  });

  it('handles invalid dates by pushing them to the end', () => {
    const reportsWithInvalid = [
      ...mockReports.slice(0, 2),
      {
        ...mockReports[2],
        generatedAt: 'invalid-date',
      },
    ];
    const result = sortReportsByDate(reportsWithInvalid);
    expect(result[result.length - 1].id).toBe('report-3');
  });

  it('does not mutate original array', () => {
    const original = [...mockReports];
    sortReportsByDate(mockReports);
    expect(mockReports).toEqual(original);
  });
});

// ============================================================================
// COMPONENT TESTS
// ============================================================================

describe('ReportList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders the report list with title', () => {
    render(<ReportList reports={mockReports} />);
    expect(screen.getByText('Report History')).toBeInTheDocument();
  });

  it('renders all reports', () => {
    render(<ReportList reports={mockReports} />);
    expect(screen.getByTestId('report-item-report-1')).toBeInTheDocument();
    expect(screen.getByTestId('report-item-report-2')).toBeInTheDocument();
    expect(screen.getByTestId('report-item-report-3')).toBeInTheDocument();
  });

  it('displays report titles', () => {
    render(<ReportList reports={mockReports.slice(0, 3)} pageSize={10} />);
    expect(screen.getByText('Security Assessment - Agent A')).toBeInTheDocument();
    expect(screen.getByText('Prompt Injection Test - Agent B')).toBeInTheDocument();
    expect(screen.getByText('OWASP Scan - Agent C')).toBeInTheDocument();
  });

  it('displays agent names', () => {
    render(<ReportList reports={mockReports.slice(0, 2)} pageSize={10} />);
    expect(screen.getByText('Agent A')).toBeInTheDocument();
    expect(screen.getByText('Agent B')).toBeInTheDocument();
  });

  it('displays session IDs (truncated)', () => {
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} />);
    expect(screen.getByText('sess-abc123')).toBeInTheDocument();
  });

  it('displays risk badges', () => {
    render(<ReportList reports={mockReports.slice(0, 2)} pageSize={10} />);
    // Critical risk for report-1 (9.5 severity)
    expect(screen.getByLabelText('Risk level: Critical')).toBeInTheDocument();
    // Medium risk for report-2 (6.2 severity)
    expect(screen.getByLabelText('Risk level: Medium')).toBeInTheDocument();
  });

  it('displays status badges', () => {
    render(<ReportList reports={mockReports} pageSize={10} />);
    const completeBadges = screen.getAllByLabelText('Status: Complete');
    expect(completeBadges.length).toBe(3);
    expect(screen.getByLabelText('Status: In Progress')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Failed')).toBeInTheDocument();
  });

  it('displays violation count when present', () => {
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} />);
    expect(screen.getByText('5 violations detected')).toBeInTheDocument();
  });

  it('uses singular "violation" for count of 1', () => {
    render(<ReportList reports={[mockReports[3]]} pageSize={10} />);
    expect(screen.getByText('1 violation detected')).toBeInTheDocument();
  });

  it('does not show violation count when zero', () => {
    render(<ReportList reports={[mockReports[2]]} pageSize={10} />);
    expect(screen.queryByText(/violation/i)).not.toBeInTheDocument();
  });

  it('shows empty state when no reports', () => {
    render(<ReportList reports={[]} />);
    expect(screen.getByText('No reports available yet.')).toBeInTheDocument();
  });

  it('shows filter summary', () => {
    render(<ReportList reports={mockReports} />);
    expect(screen.getByText(/Showing 5 of 5 reports/)).toBeInTheDocument();
  });

  it('links to report detail page', () => {
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} />);
    const links = screen.getAllByRole('link');
    const reportLink = links.find(link => link.getAttribute('href')?.includes('/reports/report-1'));
    expect(reportLink).toBeInTheDocument();
  });
});

describe('ReportList - Search', () => {
  beforeEach(() => {
    cleanup();
  });

  it('filters reports by search query', () => {
    render(<ReportList reports={mockReports} pageSize={10} />);

    const searchInput = screen.getByPlaceholderText('Search reports...');
    fireEvent.change(searchInput, { target: { value: 'Prompt Injection' } });

    expect(screen.getByText('Prompt Injection Test - Agent B')).toBeInTheDocument();
    expect(screen.queryByText('Security Assessment - Agent A')).not.toBeInTheDocument();
  });

  it('updates filter summary when searching', () => {
    render(<ReportList reports={mockReports} pageSize={10} />);

    const searchInput = screen.getByPlaceholderText('Search reports...');
    fireEvent.change(searchInput, { target: { value: 'Agent A' } });

    expect(screen.getByText(/Showing 1 of 5 reports/)).toBeInTheDocument();
  });

  it('shows no results message when search finds nothing', () => {
    render(<ReportList reports={mockReports} pageSize={10} />);

    const searchInput = screen.getByPlaceholderText('Search reports...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent report xyz' } });

    expect(screen.getByText('No reports match the current filters.')).toBeInTheDocument();
  });
});

describe('ReportList - Filters', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows clear filters button when filters active', () => {
    render(<ReportList reports={mockReports} pageSize={10} />);

    // Initially no clear button
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();

    // Apply search filter
    const searchInput = screen.getByPlaceholderText('Search reports...');
    fireEvent.change(searchInput, { target: { value: 'test' } });

    // Clear button should appear
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('clears all filters when clear button clicked', () => {
    render(<ReportList reports={mockReports} pageSize={10} />);

    const searchInput = screen.getByPlaceholderText('Search reports...');
    fireEvent.change(searchInput, { target: { value: 'Agent A' } });

    expect(screen.getByText(/Showing 1 of 5 reports/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Clear filters'));

    expect(screen.getByText(/Showing 5 of 5 reports/)).toBeInTheDocument();
    expect(searchInput).toHaveValue('');
  });
});

describe('ReportList - Pagination', () => {
  // Create more reports for pagination testing
  const manyReports: ReportSummary[] = Array.from({ length: 25 }, (_, i) => ({
    id: `report-${i + 1}`,
    title: `Report ${i + 1}`,
    targetAgent: `Agent ${i + 1}`,
    generatedAt: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
    sessionId: `sess-${i + 1}`,
    maxSeverity: (i % 10) + 1,
    violationCount: i % 5,
    status: 'complete' as const,
  }));

  beforeEach(() => {
    cleanup();
  });

  it('paginates reports correctly', () => {
    render(<ReportList reports={manyReports} pageSize={10} />);

    // Should show pagination
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    // Should show first 10 reports
    expect(screen.getByTestId('report-item-report-1')).toBeInTheDocument();
    expect(screen.queryByTestId('report-item-report-11')).not.toBeInTheDocument();
  });

  it('navigates to next page', () => {
    render(<ReportList reports={manyReports} pageSize={10} />);

    const nextButton = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextButton);

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByTestId('report-item-report-11')).toBeInTheDocument();
    expect(screen.queryByTestId('report-item-report-1')).not.toBeInTheDocument();
  });

  it('navigates to previous page', () => {
    render(<ReportList reports={manyReports} pageSize={10} />);

    // Go to page 2 first
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    // Go back to page 1
    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('disables previous button on first page', () => {
    render(<ReportList reports={manyReports} pageSize={10} />);

    const prevButton = screen.getByRole('button', { name: /previous page/i });
    expect(prevButton).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<ReportList reports={manyReports} pageSize={10} />);

    // Navigate to last page
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));

    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('resets to page 1 when filters change', () => {
    render(<ReportList reports={manyReports} pageSize={10} />);

    // Go to page 2
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    // Apply search filter
    const searchInput = screen.getByPlaceholderText('Search reports...');
    fireEvent.change(searchInput, { target: { value: 'Report 1' } });

    // Should be back on page 1
    expect(screen.queryByText('Page 2')).not.toBeInTheDocument();
  });

  it('hides pagination when only one page', () => {
    render(<ReportList reports={mockReports} pageSize={10} />);

    expect(screen.queryByText(/Page \d+ of/)).not.toBeInTheDocument();
  });
});

describe('ReportList - Delete', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows delete button when onDelete provided', () => {
    const onDelete = vi.fn();
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} onDelete={onDelete} />);

    const deleteButton = screen.getByRole('button', { name: /delete report/i });
    expect(deleteButton).toBeInTheDocument();
  });

  it('hides delete button when onDelete not provided', () => {
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} />);

    expect(screen.queryByRole('button', { name: /delete report/i })).not.toBeInTheDocument();
  });

  it('opens confirmation dialog when delete clicked', () => {
    const onDelete = vi.fn();
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete report/i }));

    expect(screen.getByText('Delete Report')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete this report/)).toBeInTheDocument();
  });

  it('calls onDelete when confirmed', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} onDelete={onDelete} />);

    // Open dialog
    fireEvent.click(screen.getByRole('button', { name: /delete report/i }));

    // Confirm delete
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButton);

    expect(onDelete).toHaveBeenCalledWith('report-1');
  });

  it('does not call onDelete when cancelled', () => {
    const onDelete = vi.fn();
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} onDelete={onDelete} />);

    // Open dialog
    fireEvent.click(screen.getByRole('button', { name: /delete report/i }));

    // Cancel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('disables delete button when isDeleting is true', () => {
    const onDelete = vi.fn();
    render(
      <ReportList
        reports={mockReports.slice(0, 1)}
        pageSize={10}
        onDelete={onDelete}
        isDeleting={true}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete report/i });
    expect(deleteButton).toBeDisabled();
  });
});

describe('ReportList - Selection Mode', () => {
  const onToggleSelection = vi.fn();
  
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders checkboxes in selection mode', () => {
    render(
      <ReportList 
        reports={mockReports.slice(0, 3)} 
        selectionMode={true} 
        onToggleSelection={onToggleSelection} 
      />
    );
    
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(3);
  });

  it('hides delete buttons in selection mode', () => {
    const onDelete = vi.fn();
    render(
      <ReportList 
        reports={mockReports.slice(0, 1)} 
        selectionMode={true} 
        onDelete={onDelete} 
      />
    );
    
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
  
  it('calls onToggleSelection when checkbox clicked', () => {
    render(
      <ReportList 
        reports={mockReports.slice(0, 1)} 
        selectionMode={true} 
        onToggleSelection={onToggleSelection} 
      />
    );
    
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    
    expect(onToggleSelection).toHaveBeenCalledWith('report-1');
  });
  
  it('calls onToggleSelection when row clicked', () => {
    render(
      <ReportList 
        reports={mockReports.slice(0, 1)} 
        selectionMode={true} 
        onToggleSelection={onToggleSelection} 
      />
    );
    
    const row = screen.getByTestId('report-item-report-1');
    fireEvent.click(row);
    
    expect(onToggleSelection).toHaveBeenCalledWith('report-1');
  });
  
  it('highlights selected items', () => {
    render(
      <ReportList 
        reports={mockReports.slice(0, 1)} 
        selectionMode={true} 
        selectedIds={['report-1']} 
        onToggleSelection={onToggleSelection} 
      />
    );
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    
    // Check if aria-selected is true on the row
    const row = screen.getByTestId('report-item-report-1');
    expect(row).toHaveAttribute('aria-selected', 'true');
  });
  
  it('updates title in selection mode', () => {
    render(<ReportList reports={mockReports} selectionMode={true} />);
    expect(screen.getByText('Select Reports to Compare')).toBeInTheDocument();
  });
});

describe('ReportList - Accessibility', () => {
  beforeEach(() => {
    cleanup();
  });

  it('has accessible search input', () => {
    render(<ReportList reports={mockReports} />);

    const searchInput = screen.getByLabelText(/search reports/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('has accessible filter selects', () => {
    render(<ReportList reports={mockReports} />);

    expect(screen.getByLabelText(/filter by risk level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by status/i)).toBeInTheDocument();
  });

  it('has accessible pagination navigation', () => {
    const manyReports: ReportSummary[] = Array.from({ length: 15 }, (_, i) => ({
      id: `report-${i + 1}`,
      title: `Report ${i + 1}`,
      targetAgent: `Agent ${i + 1}`,
      generatedAt: new Date().toISOString(),
      sessionId: `sess-${i + 1}`,
      maxSeverity: 5,
      violationCount: 1,
      status: 'complete' as const,
    }));

    render(<ReportList reports={manyReports} pageSize={10} />);

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });

  it('has accessible report list', () => {
    render(<ReportList reports={mockReports} />);

    expect(screen.getByRole('list', { name: 'Report list' })).toBeInTheDocument();
  });

  it('report links have accessible labels', () => {
    render(<ReportList reports={mockReports.slice(0, 1)} pageSize={10} />);

    const viewLink = screen.getByLabelText(/view report.*Security Assessment/i);
    expect(viewLink).toBeInTheDocument();
  });
});
