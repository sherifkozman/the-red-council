import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OWASPGrid, type GridLayout } from './OWASPGrid';
import type { Violation } from './CategoryCard';
import { OWASP_CATEGORIES } from '@/data/owasp-categories';

// Helper to create violations
function createViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    detected: true,
    severity: 5,
    evidence: 'Test evidence',
    recommendation: 'Test recommendation',
    owasp_category: 'ASI01',
    ...overrides,
  };
}

// Sample violations covering multiple categories
const sampleViolations: Violation[] = [
  createViolation({ owasp_category: 'ASI01', severity: 8, evidence: 'High severity ASI01' }),
  createViolation({ owasp_category: 'ASI01', severity: 5, evidence: 'Medium severity ASI01' }),
  createViolation({ owasp_category: 'ASI04', severity: 9, evidence: 'Critical ASI04' }),
  createViolation({ owasp_category: 'ASI06', severity: 3, evidence: 'Low severity ASI06' }),
  createViolation({ owasp_category: 'ASI02', detected: false }),
];

describe('OWASPGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 10 OWASP categories in grid layout', () => {
    render(<OWASPGrid violations={[]} />);

    OWASP_CATEGORIES.forEach((category) => {
      expect(screen.getByText(category.code)).toBeInTheDocument();
    });
  });

  it('renders header with title', () => {
    render(<OWASPGrid violations={[]} />);
    expect(screen.getByText('OWASP Agentic Top 10 Coverage')).toBeInTheDocument();
  });

  it('shows layout toggle buttons', () => {
    render(<OWASPGrid violations={[]} showLayoutToggle={true} />);

    expect(screen.getByLabelText('Grid view')).toBeInTheDocument();
    expect(screen.getByLabelText('List view')).toBeInTheDocument();
  });

  it('hides layout toggle when showLayoutToggle is false', () => {
    render(<OWASPGrid violations={[]} showLayoutToggle={false} />);

    expect(screen.queryByLabelText('Grid view')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('List view')).not.toBeInTheDocument();
  });

  it('switches between grid and list layout', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    // Default is grid
    expect(screen.getByRole('list', { name: 'OWASP categories grid' })).toBeInTheDocument();

    // Click list view
    fireEvent.click(screen.getByLabelText('List view'));
    expect(screen.getByRole('list', { name: 'OWASP categories list' })).toBeInTheDocument();

    // Click grid view
    fireEvent.click(screen.getByLabelText('Grid view'));
    expect(screen.getByRole('list', { name: 'OWASP categories grid' })).toBeInTheDocument();
  });

  it('displays coverage statistics', () => {
    render(<OWASPGrid violations={sampleViolations} showCoverageStats={true} />);

    // Should show coverage percentage
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    // 4 categories have violations (ASI01, ASI04, ASI06, ASI02)
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('hides coverage statistics when showCoverageStats is false', () => {
    render(<OWASPGrid violations={sampleViolations} showCoverageStats={false} />);

    expect(screen.queryByText('Coverage')).not.toBeInTheDocument();
  });

  it('shows correct counts in statistics', () => {
    render(<OWASPGrid violations={sampleViolations} showCoverageStats={true} />);

    // Get the stats region
    const statsRegion = screen.getByRole('region', { name: 'Coverage statistics' });

    // 2 detected (ASI01 severity 8, ASI04 severity 9)
    expect(within(statsRegion).getByText('2')).toBeInTheDocument();
    // 1 warning (ASI06 severity 3)
    // 1 passed (ASI02 not detected)
    // 6 not tested
  });

  it('handles orphan violations with invalid categories', () => {
    const violationsWithOrphans = [
      ...sampleViolations,
      createViolation({ owasp_category: 'INVALID', severity: 7 }),
      createViolation({ owasp_category: 'UNKNOWN', severity: 5 }),
    ];

    render(<OWASPGrid violations={violationsWithOrphans} />);

    // Should show alert about invalid categories
    expect(screen.getByText('Invalid Category Violations')).toBeInTheDocument();
    expect(screen.getByText(/2 violations have invalid or unknown OWASP categories/)).toBeInTheDocument();
  });

  it('shows orphan violation details in sheet', () => {
    const violationsWithOrphans = [
      createViolation({ owasp_category: 'INVALID', severity: 7, evidence: 'Orphan evidence' }),
    ];

    render(<OWASPGrid violations={violationsWithOrphans} />);

    // Click view details button
    fireEvent.click(screen.getByLabelText('View invalid violations'));

    // Sheet should open with orphan details
    expect(screen.getByText('Invalid/Orphan Violations')).toBeInTheDocument();
    expect(screen.getByText('Category: INVALID')).toBeInTheDocument();
  });

  it('does not show orphan alert when no invalid categories', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    expect(screen.queryByText('Invalid Category Violations')).not.toBeInTheDocument();
  });

  it('calls onCategoryClick when category is clicked', () => {
    const onCategoryClick = vi.fn();
    render(<OWASPGrid violations={sampleViolations} onCategoryClick={onCategoryClick} />);

    // Click on ASI01
    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    expect(onCategoryClick).toHaveBeenCalledWith('ASI01');
  });

  it('opens category details sheet when clicking a category', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    // Click on ASI01
    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    // Sheet should open with category details
    expect(screen.getByText('ASI01 - Excessive Agency')).toBeInTheDocument();
  });

  it('shows violations in category details sheet', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    // Click on ASI01 which has 2 violations
    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    // Should show 2 violations
    expect(screen.getByText('2 Violations Detected:')).toBeInTheDocument();
    expect(screen.getByText('High severity ASI01')).toBeInTheDocument();
    expect(screen.getByText('Medium severity ASI01')).toBeInTheDocument();
  });

  it('shows "All tests passed" message for passed categories', () => {
    const passedViolations = [createViolation({ owasp_category: 'ASI02', detected: false })];
    render(<OWASPGrid violations={passedViolations} />);

    // Click on ASI02
    const asi02Card = screen.getAllByText('ASI02')[0].closest('[role="button"]');
    if (asi02Card) {
      fireEvent.click(asi02Card);
    }

    expect(screen.getByText('All tests passed for this category.')).toBeInTheDocument();
  });

  it('shows "not tested" message for untested categories', () => {
    render(<OWASPGrid violations={[]} />);

    // Click on ASI03 (no violations)
    const asi03Card = screen.getAllByText('ASI03')[0].closest('[role="button"]');
    if (asi03Card) {
      fireEvent.click(asi03Card);
    }

    expect(screen.getByText('This category has not been tested yet.')).toBeInTheDocument();
  });

  it('closes category details sheet when close button clicked', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    // Open sheet
    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    // Sheet should be open
    expect(screen.getByText('ASI01 - Excessive Agency')).toBeInTheDocument();

    // Close sheet by clicking close button (the X)
    const closeButton = screen.getAllByRole('button').find(
      (btn) => btn.getAttribute('aria-label')?.includes('Close') || btn.classList.contains('absolute')
    );
    if (closeButton) {
      fireEvent.click(closeButton);
    }
  });

  it('uses custom severity threshold', () => {
    const violations = [createViolation({ owasp_category: 'ASI01', severity: 5 })];

    // With threshold 6, severity 5 should be warning
    render(<OWASPGrid violations={violations} warningSeverityThreshold={6} />);

    // ASI01 should show as warning (yellow) not detected (red)
    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    expect(asi01Card?.parentElement?.querySelector('.bg-yellow-100')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<OWASPGrid violations={[]} className="custom-grid-class" />);
    expect(container.querySelector('.custom-grid-class')).toBeInTheDocument();
  });

  it('renders in list layout when specified', () => {
    render(<OWASPGrid violations={sampleViolations} layout="list" />);
    expect(screen.getByRole('list', { name: 'OWASP categories list' })).toBeInTheDocument();
  });

  it('grid layout has correct columns', () => {
    render(<OWASPGrid violations={[]} />);

    const grid = screen.getByRole('list', { name: 'OWASP categories grid' });
    expect(grid).toHaveClass('grid-cols-5');
  });

  it('list layout shows expandable category cards', () => {
    render(<OWASPGrid violations={sampleViolations} layout="list" />);

    // In list view, cards should have expand buttons for categories with violations
    const expandButtons = screen.getAllByLabelText(/Expand details/i);
    expect(expandButtons.length).toBeGreaterThan(0);
  });

  it('displays max severity in detected category cards', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    // ASI01 has max severity 8
    expect(screen.getByText('8/10')).toBeInTheDocument();
    // ASI04 has max severity 9
    expect(screen.getByText('9/10')).toBeInTheDocument();
  });

  it('calculates coverage percentage correctly', () => {
    // 4 categories tested out of 10 = 40%
    render(<OWASPGrid violations={sampleViolations} showCoverageStats={true} />);
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows 0% coverage when no violations', () => {
    render(<OWASPGrid violations={[]} showCoverageStats={true} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('handles empty violations array', () => {
    render(<OWASPGrid violations={[]} />);

    // Should still render all 10 categories as not tested
    OWASP_CATEGORIES.forEach((category) => {
      expect(screen.getByText(category.code)).toBeInTheDocument();
    });
  });

  it('sorts violations by severity in details sheet', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    // Click on ASI01
    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    // Get all severity badges - they should be sorted (8 first, then 5)
    const severityBadges = screen.getAllByText(/Severity: \d\/10/);
    expect(severityBadges[0]).toHaveTextContent('Severity: 8/10');
    expect(severityBadges[1]).toHaveTextContent('Severity: 5/10');
  });
});

describe('StatsDisplay (via OWASPGrid)', () => {
  it('shows all stat cards', () => {
    render(<OWASPGrid violations={sampleViolations} showCoverageStats={true} />);

    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getByText('Detected')).toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText('Not Tested')).toBeInTheDocument();
  });

  it('has correct accessibility region', () => {
    render(<OWASPGrid violations={sampleViolations} showCoverageStats={true} />);
    expect(screen.getByRole('region', { name: 'Coverage statistics' })).toBeInTheDocument();
  });
});

describe('OrphanViolationsAlert (via OWASPGrid)', () => {
  it('shows correct count of orphan violations', () => {
    const violationsWithOrphans = [
      createViolation({ owasp_category: 'BAD1', severity: 7 }),
      createViolation({ owasp_category: 'BAD2', severity: 5 }),
      createViolation({ owasp_category: 'BAD3', severity: 3 }),
    ];

    render(<OWASPGrid violations={violationsWithOrphans} />);
    expect(screen.getByText(/3 violations have invalid/)).toBeInTheDocument();
  });

  it('uses singular form for one orphan', () => {
    const violationsWithOrphans = [createViolation({ owasp_category: 'BAD1', severity: 7 })];

    render(<OWASPGrid violations={violationsWithOrphans} />);
    expect(screen.getByText(/1 violation has invalid/)).toBeInTheDocument();
  });
});

describe('CategoryDetailsSheet (via OWASPGrid)', () => {
  it('shows correct status badge', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    // Open ASI01 (detected)
    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    // Multiple "Detected" texts may appear (in stats and sheet), use getAllByText
    expect(screen.getAllByText('Detected').length).toBeGreaterThan(0);
  });

  it('shows category description', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    expect(screen.getByText(/beyond what is necessary/i)).toBeInTheDocument();
  });

  it('shows evidence in violation cards', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    expect(screen.getByText('High severity ASI01')).toBeInTheDocument();
  });

  it('shows recommendation in violation cards', () => {
    render(<OWASPGrid violations={sampleViolations} />);

    const asi01Card = screen.getAllByText('ASI01')[0].closest('[role="button"]');
    if (asi01Card) {
      fireEvent.click(asi01Card);
    }

    expect(screen.getAllByText('Test recommendation').length).toBeGreaterThan(0);
  });
});
