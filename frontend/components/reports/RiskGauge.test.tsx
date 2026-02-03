import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  RiskGauge,
  RiskBadge,
  RiskScoreCard,
  getRiskLevel,
  getRiskLevelLabel,
  getRiskLevelColors,
  getRiskLevelIcon,
  type RiskLevel,
} from './RiskGauge';

describe('getRiskLevel', () => {
  it('returns critical for scores >= 9', () => {
    expect(getRiskLevel(9)).toBe('critical');
    expect(getRiskLevel(10)).toBe('critical');
  });

  it('returns high for scores >= 7 and < 9', () => {
    expect(getRiskLevel(7)).toBe('high');
    expect(getRiskLevel(8)).toBe('high');
    expect(getRiskLevel(8.9)).toBe('high');
  });

  it('returns medium for scores >= 4 and < 7', () => {
    expect(getRiskLevel(4)).toBe('medium');
    expect(getRiskLevel(5)).toBe('medium');
    expect(getRiskLevel(6.9)).toBe('medium');
  });

  it('returns low for scores >= 1 and < 4', () => {
    expect(getRiskLevel(1)).toBe('low');
    expect(getRiskLevel(2)).toBe('low');
    expect(getRiskLevel(3.9)).toBe('low');
  });

  it('returns none for scores < 1', () => {
    expect(getRiskLevel(0)).toBe('none');
    expect(getRiskLevel(0.5)).toBe('none');
    expect(getRiskLevel(0.9)).toBe('none');
  });
});

describe('getRiskLevelLabel', () => {
  it('returns correct labels', () => {
    expect(getRiskLevelLabel('critical')).toBe('Critical');
    expect(getRiskLevelLabel('high')).toBe('High');
    expect(getRiskLevelLabel('medium')).toBe('Medium');
    expect(getRiskLevelLabel('low')).toBe('Low');
    expect(getRiskLevelLabel('none')).toBe('None');
  });
});

describe('getRiskLevelColors', () => {
  it('returns red colors for critical', () => {
    const colors = getRiskLevelColors('critical');
    expect(colors.bg).toContain('red');
    expect(colors.text).toContain('red');
    expect(colors.border).toContain('red');
    expect(colors.fill).toBe('#dc2626');
  });

  it('returns orange colors for high', () => {
    const colors = getRiskLevelColors('high');
    expect(colors.bg).toContain('orange');
    expect(colors.text).toContain('orange');
    expect(colors.fill).toBe('#ea580c');
  });

  it('returns yellow colors for medium', () => {
    const colors = getRiskLevelColors('medium');
    expect(colors.bg).toContain('yellow');
    expect(colors.text).toContain('yellow');
    expect(colors.fill).toBe('#ca8a04');
  });

  it('returns blue colors for low', () => {
    const colors = getRiskLevelColors('low');
    expect(colors.bg).toContain('blue');
    expect(colors.text).toContain('blue');
    expect(colors.fill).toBe('#2563eb');
  });

  it('returns green colors for none', () => {
    const colors = getRiskLevelColors('none');
    expect(colors.bg).toContain('green');
    expect(colors.text).toContain('green');
    expect(colors.fill).toBe('#16a34a');
  });
});

describe('getRiskLevelIcon', () => {
  const levels: RiskLevel[] = ['critical', 'high', 'medium', 'low', 'none'];

  levels.forEach((level) => {
    it(`returns an icon for ${level}`, () => {
      const icon = getRiskLevelIcon(level);
      expect(icon).toBeTruthy();
    });
  });
});

describe('RiskGauge', () => {
  it('renders with score', () => {
    render(<RiskGauge score={7.5} />);

    expect(screen.getByText('7.5')).toBeInTheDocument();
  });

  it('renders with risk level label by default', () => {
    render(<RiskGauge score={8} />);

    expect(screen.getByText(/High Risk/)).toBeInTheDocument();
  });

  it('hides score when showScore is false', () => {
    render(<RiskGauge score={7.5} showScore={false} />);

    expect(screen.queryByText('7.5')).not.toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<RiskGauge score={8} showLabel={false} />);

    expect(screen.queryByText(/High Risk/)).not.toBeInTheDocument();
  });

  it('clamps score to valid range', () => {
    render(<RiskGauge score={15} maxScore={10} />);

    expect(screen.getByText('10.0')).toBeInTheDocument();
  });

  it('clamps negative scores to 0', () => {
    render(<RiskGauge score={-5} />);

    expect(screen.getByText('0.0')).toBeInTheDocument();
  });

  it('uses custom maxScore', () => {
    render(<RiskGauge score={50} maxScore={100} />);

    // Score should be 50, which is 50% - medium risk
    expect(screen.getByText('50.0')).toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    render(<RiskGauge score={8.5} />);

    const gauge = screen.getByRole('img');
    expect(gauge).toHaveAttribute(
      'aria-label',
      'Risk score: 8.5 out of 10, High risk'
    );
  });

  it('renders SVG with aria-hidden', () => {
    const { container } = render(<RiskGauge score={5} />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies small size', () => {
    const { container } = render(<RiskGauge score={5} size="sm" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '80');
  });

  it('applies medium size', () => {
    const { container } = render(<RiskGauge score={5} size="md" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '120');
  });

  it('applies large size', () => {
    const { container } = render(<RiskGauge score={5} size="lg" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '160');
  });

  it('applies custom className', () => {
    const { container } = render(
      <RiskGauge score={5} className="custom-gauge" />
    );

    expect(container.firstChild).toHaveClass('custom-gauge');
  });

  it('shows filled arc for non-zero scores', () => {
    const { container } = render(<RiskGauge score={5} />);

    // Should have 2 path elements in the gauge SVG - background and filled
    const svg = container.querySelector('svg[aria-hidden="true"]');
    const paths = svg?.querySelectorAll('path') || [];
    expect(paths.length).toBe(2);
  });

  it('shows only background arc for zero score', () => {
    const { container } = render(<RiskGauge score={0} />);

    // Should have only 1 path element in the gauge SVG - background only
    const svg = container.querySelector('svg[aria-hidden="true"]');
    const paths = svg?.querySelectorAll('path') || [];
    expect(paths.length).toBe(1);
  });
});

describe('RiskBadge', () => {
  it('renders risk level label', () => {
    render(<RiskBadge score={8} />);

    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows score by default', () => {
    render(<RiskBadge score={8.5} />);

    expect(screen.getByText('(8.5)')).toBeInTheDocument();
  });

  it('hides score when showScore is false', () => {
    render(<RiskBadge score={8.5} showScore={false} />);

    expect(screen.queryByText('(8.5)')).not.toBeInTheDocument();
  });

  it('applies small size', () => {
    const { container } = render(<RiskBadge score={5} size="sm" />);

    expect(container.firstChild).toHaveClass('text-xs');
  });

  it('applies medium size', () => {
    const { container } = render(<RiskBadge score={5} size="md" />);

    expect(container.firstChild).toHaveClass('text-sm');
  });

  it('applies large size', () => {
    const { container } = render(<RiskBadge score={5} size="lg" />);

    expect(container.firstChild).toHaveClass('text-base');
  });

  it('applies custom className', () => {
    const { container } = render(
      <RiskBadge score={5} className="custom-badge" />
    );

    expect(container.firstChild).toHaveClass('custom-badge');
  });

  it('clamps score to valid range', () => {
    render(<RiskBadge score={15} />);

    expect(screen.getByText('(10.0)')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('shows correct colors for different risk levels', () => {
    const { rerender, container } = render(<RiskBadge score={9} />);
    expect(container.firstChild).toHaveClass('bg-red-100');

    rerender(<RiskBadge score={7} />);
    expect(container.firstChild).toHaveClass('bg-orange-100');

    rerender(<RiskBadge score={5} />);
    expect(container.firstChild).toHaveClass('bg-yellow-100');

    rerender(<RiskBadge score={2} />);
    expect(container.firstChild).toHaveClass('bg-blue-100');

    rerender(<RiskBadge score={0} />);
    expect(container.firstChild).toHaveClass('bg-green-100');
  });

  it('includes icon', () => {
    const { container } = render(<RiskBadge score={8} />);

    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('RiskScoreCard', () => {
  const defaultProps = {
    maxSeverity: 8,
    avgSeverity: 5.5,
    totalViolations: 4,
    categoriesTested: 6,
  };

  it('renders all statistics', () => {
    render(<RiskScoreCard {...defaultProps} />);

    expect(screen.getByText('8.0/10')).toBeInTheDocument();
    expect(screen.getByText('5.5/10')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('6/10')).toBeInTheDocument();
  });

  it('renders stat labels', () => {
    render(<RiskScoreCard {...defaultProps} />);

    expect(screen.getByText('Max Severity')).toBeInTheDocument();
    expect(screen.getByText('Avg Severity')).toBeInTheDocument();
    expect(screen.getByText('Violations')).toBeInTheDocument();
    expect(screen.getByText('Categories Tested')).toBeInTheDocument();
  });

  it('shows overall risk level', () => {
    render(<RiskScoreCard {...defaultProps} />);

    expect(screen.getByText(/Overall Risk:/)).toBeInTheDocument();
    // "High" text appears within the overall risk text
    expect(screen.getByText(/High/)).toBeInTheDocument();
  });

  it('includes RiskGauge', () => {
    const { container } = render(<RiskScoreCard {...defaultProps} />);

    // Check for SVG (gauge)
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('has correct aria role', () => {
    render(<RiskScoreCard {...defaultProps} />);

    expect(screen.getByRole('region', { name: /Risk score summary/ })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <RiskScoreCard {...defaultProps} className="custom-card" />
    );

    expect(container.firstChild).toHaveClass('custom-card');
  });

  it('shows correct colors based on max severity', () => {
    const { container, rerender } = render(
      <RiskScoreCard {...defaultProps} maxSeverity={9} />
    );
    expect(container.firstChild).toHaveClass('bg-red-100');

    rerender(<RiskScoreCard {...defaultProps} maxSeverity={7} />);
    expect(container.firstChild).toHaveClass('bg-orange-100');

    rerender(<RiskScoreCard {...defaultProps} maxSeverity={5} />);
    expect(container.firstChild).toHaveClass('bg-yellow-100');

    rerender(<RiskScoreCard {...defaultProps} maxSeverity={2} />);
    expect(container.firstChild).toHaveClass('bg-blue-100');

    rerender(<RiskScoreCard {...defaultProps} maxSeverity={0} />);
    expect(container.firstChild).toHaveClass('bg-green-100');
  });

  it('formats decimal scores correctly', () => {
    render(
      <RiskScoreCard
        maxSeverity={7.333}
        avgSeverity={4.666}
        totalViolations={3}
        categoriesTested={5}
      />
    );

    expect(screen.getByText('7.3/10')).toBeInTheDocument();
    expect(screen.getByText('4.7/10')).toBeInTheDocument();
  });
});
