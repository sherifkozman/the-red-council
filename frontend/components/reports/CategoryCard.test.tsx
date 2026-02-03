import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CategoryCard,
  CompactCategoryCard,
  getCategoryStatus,
  getStatusColorClass,
  getStatusLabel,
  WARNING_SEVERITY_THRESHOLD,
  type Violation,
  type CategoryStatus,
} from './CategoryCard';
import type { OWASPCategory } from '@/data/owasp-categories';

// Mock category for testing
const mockCategory: OWASPCategory = {
  id: 'ASI01',
  code: 'ASI01',
  name: 'Excessive Agency',
  description: 'When an AI agent is granted capabilities beyond necessary',
  shortDescription: 'Agent has more capabilities than needed',
};

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

describe('getCategoryStatus', () => {
  it('returns not_tested when no violations', () => {
    expect(getCategoryStatus([])).toBe('not_tested');
  });

  it('returns passed when violations exist but none detected', () => {
    const violations = [createViolation({ detected: false })];
    expect(getCategoryStatus(violations)).toBe('passed');
  });

  it('returns warning when max severity is below threshold', () => {
    const violations = [createViolation({ severity: 3 })];
    expect(getCategoryStatus(violations)).toBe('warning');
  });

  it('returns detected when max severity is at or above threshold', () => {
    const violations = [createViolation({ severity: 4 })];
    expect(getCategoryStatus(violations)).toBe('detected');
  });

  it('returns detected for high severity', () => {
    const violations = [createViolation({ severity: 8 })];
    expect(getCategoryStatus(violations)).toBe('detected');
  });

  it('uses custom threshold', () => {
    const violations = [createViolation({ severity: 5 })];
    expect(getCategoryStatus(violations, 6)).toBe('warning');
    expect(getCategoryStatus(violations, 5)).toBe('detected');
  });

  it('considers max severity among multiple violations', () => {
    const violations = [
      createViolation({ severity: 2 }),
      createViolation({ severity: 7 }),
      createViolation({ severity: 3 }),
    ];
    expect(getCategoryStatus(violations)).toBe('detected');
  });
});

describe('getStatusColorClass', () => {
  it('returns red classes for detected', () => {
    const result = getStatusColorClass('detected');
    expect(result).toContain('red');
  });

  it('returns yellow classes for warning', () => {
    const result = getStatusColorClass('warning');
    expect(result).toContain('yellow');
  });

  it('returns green classes for passed', () => {
    const result = getStatusColorClass('passed');
    expect(result).toContain('green');
  });

  it('returns gray classes for not_tested', () => {
    const result = getStatusColorClass('not_tested');
    expect(result).toContain('gray');
  });
});

describe('getStatusLabel', () => {
  it('returns correct labels', () => {
    expect(getStatusLabel('detected')).toBe('Detected');
    expect(getStatusLabel('warning')).toBe('Warning');
    expect(getStatusLabel('passed')).toBe('Passed');
    expect(getStatusLabel('not_tested')).toBe('Not Tested');
  });
});

describe('WARNING_SEVERITY_THRESHOLD', () => {
  it('is 4 by default', () => {
    expect(WARNING_SEVERITY_THRESHOLD).toBe(4);
  });
});

describe('CategoryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders category code and name', () => {
    render(<CategoryCard category={mockCategory} violations={[]} />);
    expect(screen.getByText('ASI01')).toBeInTheDocument();
    expect(screen.getByText('Excessive Agency')).toBeInTheDocument();
  });

  it('shows not tested status when no violations', () => {
    render(<CategoryCard category={mockCategory} violations={[]} />);
    expect(screen.getByText('Not Tested')).toBeInTheDocument();
  });

  it('shows passed status when no violations detected', () => {
    const violations = [createViolation({ detected: false })];
    render(<CategoryCard category={mockCategory} violations={violations} />);
    expect(screen.getByText('Passed')).toBeInTheDocument();
  });

  it('shows warning status for low severity violations', () => {
    const violations = [createViolation({ severity: 3 })];
    render(<CategoryCard category={mockCategory} violations={violations} />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('shows detected status for high severity violations', () => {
    const violations = [createViolation({ severity: 8 })];
    render(<CategoryCard category={mockCategory} violations={violations} />);
    expect(screen.getByText('Detected')).toBeInTheDocument();
  });

  it('shows severity badge for detected violations', () => {
    const violations = [createViolation({ severity: 8 })];
    render(<CategoryCard category={mockCategory} violations={violations} />);
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });

  it('shows violation count', () => {
    const violations = [
      createViolation({ severity: 7 }),
      createViolation({ severity: 5 }),
    ];
    render(<CategoryCard category={mockCategory} violations={violations} />);
    expect(screen.getByText('2 violations')).toBeInTheDocument();
  });

  it('shows singular violation text for one violation', () => {
    const violations = [createViolation({ severity: 7 })];
    render(<CategoryCard category={mockCategory} violations={violations} />);
    expect(screen.getByText('1 violation')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<CategoryCard category={mockCategory} violations={[]} onClick={onClick} />);

    const card = screen.getByLabelText('Excessive Agency: Not Tested');
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledWith('ASI01');
  });

  it('supports keyboard navigation', () => {
    const onClick = vi.fn();
    render(<CategoryCard category={mockCategory} violations={[]} onClick={onClick} />);

    const card = screen.getByLabelText('Excessive Agency: Not Tested');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith('ASI01');

    onClick.mockClear();
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).toHaveBeenCalledWith('ASI01');
  });

  it('expands to show violation details', () => {
    const violations = [createViolation({ severity: 7, evidence: 'Test evidence content' })];
    render(<CategoryCard category={mockCategory} violations={violations} defaultExpanded={true} />);

    expect(screen.getByText('Severity: 7/10')).toBeInTheDocument();
    expect(screen.getByText('Test evidence content')).toBeInTheDocument();
  });

  it('shows expand button when violations exist', () => {
    const violations = [createViolation({ severity: 7 })];
    render(<CategoryCard category={mockCategory} violations={violations} />);

    expect(screen.getByLabelText('Expand details')).toBeInTheDocument();
  });

  it('does not show expand button when no violations', () => {
    render(<CategoryCard category={mockCategory} violations={[]} />);

    expect(screen.queryByLabelText('Expand details')).not.toBeInTheDocument();
  });

  it('shows recommendation when available', () => {
    const violations = [createViolation({ recommendation: 'Fix the issue' })];
    render(<CategoryCard category={mockCategory} violations={violations} defaultExpanded={true} />);

    expect(screen.getByText('Fix the issue')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <CategoryCard category={mockCategory} violations={[]} className="custom-class" />
    );
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('uses custom severity threshold', () => {
    const violations = [createViolation({ severity: 5 })];
    render(
      <CategoryCard
        category={mockCategory}
        violations={violations}
        warningSeverityThreshold={6}
      />
    );
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('sorts violations by severity descending', () => {
    const violations = [
      createViolation({ severity: 3, evidence: 'Low severity' }),
      createViolation({ severity: 9, evidence: 'High severity' }),
      createViolation({ severity: 5, evidence: 'Medium severity' }),
    ];
    render(<CategoryCard category={mockCategory} violations={violations} defaultExpanded={true} />);

    const severityBadges = screen.getAllByText(/\/10$/);
    // First should be the main badge (9/10), then individual violations
    expect(severityBadges[0]).toHaveTextContent('9/10');
  });

  it('has correct aria-label', () => {
    const violations = [createViolation({ severity: 8 })];
    render(<CategoryCard category={mockCategory} violations={violations} onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Excessive Agency: Detected' })).toBeInTheDocument();
  });
});

describe('CompactCategoryCard', () => {
  it('renders category code', () => {
    render(
      <CompactCategoryCard
        category={mockCategory}
        status="not_tested"
        maxSeverity={0}
        violationCount={0}
      />
    );
    expect(screen.getByText('ASI01')).toBeInTheDocument();
  });

  it('shows severity badge for detected status', () => {
    render(
      <CompactCategoryCard
        category={mockCategory}
        status="detected"
        maxSeverity={8}
        violationCount={2}
      />
    );
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });

  it('shows severity badge for warning status', () => {
    render(
      <CompactCategoryCard
        category={mockCategory}
        status="warning"
        maxSeverity={3}
        violationCount={1}
      />
    );
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('does not show severity badge for passed status', () => {
    render(
      <CompactCategoryCard
        category={mockCategory}
        status="passed"
        maxSeverity={0}
        violationCount={0}
      />
    );
    expect(screen.queryByText('/10')).not.toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <CompactCategoryCard
        category={mockCategory}
        status="not_tested"
        maxSeverity={0}
        violationCount={0}
        onClick={onClick}
      />
    );

    const card = screen.getByRole('button');
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledWith('ASI01');
  });

  it('supports keyboard navigation', () => {
    const onClick = vi.fn();
    render(
      <CompactCategoryCard
        category={mockCategory}
        status="not_tested"
        maxSeverity={0}
        violationCount={0}
        onClick={onClick}
      />
    );

    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith('ASI01');
  });

  it('has tooltip content available in DOM', async () => {
    const { container } = render(
      <CompactCategoryCard
        category={mockCategory}
        status="detected"
        maxSeverity={8}
        violationCount={2}
      />
    );

    // Tooltip content is rendered in the document (may be hidden/portal)
    // Check that tooltips exist
    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toBeInTheDocument();
  });

  it('has violation count tooltip when violations exist', () => {
    const { container } = render(
      <CompactCategoryCard
        category={mockCategory}
        status="detected"
        maxSeverity={8}
        violationCount={3}
      />
    );

    // Verify tooltip trigger is in the document
    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toBeInTheDocument();
  });

  it('applies correct color class for each status', () => {
    const { rerender, container } = render(
      <CompactCategoryCard
        category={mockCategory}
        status="detected"
        maxSeverity={8}
        violationCount={1}
      />
    );
    expect(container.querySelector('.bg-red-100')).toBeInTheDocument();

    rerender(
      <CompactCategoryCard
        category={mockCategory}
        status="warning"
        maxSeverity={3}
        violationCount={1}
      />
    );
    expect(container.querySelector('.bg-yellow-100')).toBeInTheDocument();

    rerender(
      <CompactCategoryCard
        category={mockCategory}
        status="passed"
        maxSeverity={0}
        violationCount={0}
      />
    );
    expect(container.querySelector('.bg-green-100')).toBeInTheDocument();

    rerender(
      <CompactCategoryCard
        category={mockCategory}
        status="not_tested"
        maxSeverity={0}
        violationCount={0}
      />
    );
    expect(container.querySelector('.bg-gray-100')).toBeInTheDocument();
  });

  it('has correct aria-label with severity info', () => {
    render(
      <CompactCategoryCard
        category={mockCategory}
        status="detected"
        maxSeverity={8}
        violationCount={2}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /ASI01 Excessive Agency: Detected, severity 8/ })).toBeInTheDocument();
  });

  it('shows shield icon for passed status', () => {
    const { container } = render(
      <CompactCategoryCard
        category={mockCategory}
        status="passed"
        maxSeverity={0}
        violationCount={0}
      />
    );

    // Shield icon should be present for passed status
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });
});

describe('ViolationItem (via CategoryCard)', () => {
  it('renders evidence in pre tag', () => {
    const violations = [createViolation({ evidence: 'Test evidence <script>alert("xss")</script>' })];
    render(<CategoryCard category={mockCategory} violations={violations} defaultExpanded={true} />);

    // Should escape HTML
    const pre = screen.getByRole('listitem').querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toContain('&lt;script&gt;');
  });

  it('escapes HTML in evidence', () => {
    const violations = [createViolation({ evidence: '<img src=x onerror=alert(1)>' })];
    const { container } = render(
      <CategoryCard category={mockCategory} violations={violations} defaultExpanded={true} />
    );

    // Should not have actual img element in the document
    expect(container.querySelector('img')).toBeNull();
  });

  it('escapes HTML in recommendation', () => {
    const violations = [createViolation({ recommendation: '<script>bad</script> Do this instead' })];
    const { container } = render(
      <CategoryCard category={mockCategory} violations={violations} defaultExpanded={true} />
    );

    expect(container.querySelector('script')).toBeNull();
  });
});
