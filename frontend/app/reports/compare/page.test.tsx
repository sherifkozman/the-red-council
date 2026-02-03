import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ComparePage from './page';

// Mock mocks
vi.mock('@/lib/mocks/reports', () => ({
  generateMockReports: () => [
    { id: 'r1', title: 'Report 1', generatedAt: '2024-01-01' },
    { id: 'r2', title: 'Report 2', generatedAt: '2024-01-02' },
    { id: 'r3', title: 'Report 3', generatedAt: '2024-01-03' },
  ],
  generateMockReport: (id: string) => ({
    id,
    title: `Full Report ${id}`,
    generatedAt: id === 'r1' ? '2024-01-01' : '2024-01-02',
    targetAgent: 'Agent',
    violations: [],
    recommendations: [],
    events: []
  }),
}));

// Mock router
const pushMock = vi.fn();
const searchParamsMock = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParamsMock,
}));

// Mock components
vi.mock('@/components/reports/ReportList', () => ({
  ReportList: ({ onToggleSelection, selectionMode, selectedIds }: any) => (
    <div data-testid="report-list">
      {selectionMode && <span>Selection Mode Active</span>}
      <button onClick={() => onToggleSelection('r1')}>Select R1</button>
      <button onClick={() => onToggleSelection('r2')}>Select R2</button>
      <button onClick={() => onToggleSelection('r3')}>Select R3</button>
      <div data-testid="selected-count">{selectedIds?.length || 0}</div>
    </div>
  ),
}));

vi.mock('@/components/reports/CompareView', () => ({
  CompareView: ({ baseReport, targetReport }: any) => (
    <div data-testid="compare-view">
      Comparing {baseReport.id} vs {targetReport.id}
    </div>
  ),
}));

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.delete('ids');
  });

  it('renders selection list initially', () => {
    render(<ComparePage />);
    expect(screen.getByTestId('report-list')).toBeInTheDocument();
    expect(screen.getByText('Selection Mode Active')).toBeInTheDocument();
  });

  it('handles selection toggle', () => {
    render(<ComparePage />);
    
    // Select R1
    fireEvent.click(screen.getByText('Select R1'));
    expect(screen.getByTestId('selected-count')).toHaveTextContent('1');
    
    // Select R2
    fireEvent.click(screen.getByText('Select R2'));
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2');
    
    // Deselect R1
    fireEvent.click(screen.getByText('Select R1'));
    expect(screen.getByTestId('selected-count')).toHaveTextContent('1');
  });

  it('replaces second selection if trying to select 3rd', () => {
    render(<ComparePage />);
    
    fireEvent.click(screen.getByText('Select R1'));
    fireEvent.click(screen.getByText('Select R2'));
    // Select R3 - should replace R2 (or one of them)
    fireEvent.click(screen.getByText('Select R3'));
    
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2');
  });

  it('enables compare button only when 2 selected', () => {
    render(<ComparePage />);
    
    const compareBtn = screen.getByText('Compare').closest('button');
    expect(compareBtn).toBeDisabled();
    
    fireEvent.click(screen.getByText('Select R1'));
    expect(compareBtn).toBeDisabled();
    
    fireEvent.click(screen.getByText('Select R2'));
    expect(compareBtn).not.toBeDisabled();
  });

  it('navigates to compare URL on click', () => {
    render(<ComparePage />);
    
    fireEvent.click(screen.getByText('Select R1'));
    fireEvent.click(screen.getByText('Select R2'));
    
    fireEvent.click(screen.getByText('Compare'));
    
    expect(pushMock).toHaveBeenCalledWith('/reports/compare?ids=r1,r2');
  });

  it('renders CompareView when IDs present in URL', async () => {
    searchParamsMock.set('ids', 'r1,r2');
    render(<ComparePage />);
    
    await waitFor(() => {
      expect(screen.getByTestId('compare-view')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Comparing r1 vs r2')).toBeInTheDocument();
  });
});
