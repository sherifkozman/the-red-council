import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReportViewer,
  type ReportData,
  type Recommendation,
  type AnalysisEvent,
} from './ReportViewer';
import type { Violation } from './CategoryCard';

// Mock scrollIntoView
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Create a complete mock report
function createMockReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    id: 'test-report-1',
    title: 'Test Security Report',
    generatedAt: '2024-01-15T10:00:00Z',
    targetAgent: 'Test Agent v1.0',
    violations: [],
    recommendations: [],
    events: [],
    ...overrides,
  };
}

function createMockViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    detected: true,
    severity: 5,
    evidence: 'Test evidence',
    recommendation: 'Test recommendation',
    owasp_category: 'ASI01',
    ...overrides,
  };
}

function createMockRecommendation(
  overrides: Partial<Recommendation> = {}
): Recommendation {
  return {
    id: 'rec-1',
    category: 'ASI01',
    priority: 'high',
    title: 'Test Recommendation',
    description: 'Test description',
    ...overrides,
  };
}

function createMockEvent(overrides: Partial<AnalysisEvent> = {}): AnalysisEvent {
  return {
    id: 'evt-1',
    timestamp: '2024-01-15T10:00:00Z',
    type: 'tool_call',
    summary: 'Test event summary',
    ...overrides,
  };
}

describe('ReportViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Header', () => {
    it('renders report title', () => {
      const report = createMockReport({ title: 'Security Assessment Report' });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('Security Assessment Report')).toBeInTheDocument();
    });

    it('renders target agent', () => {
      const report = createMockReport({ targetAgent: 'My Test Agent' });
      render(<ReportViewer report={report} />);

      expect(screen.getByText(/Target: My Test Agent/)).toBeInTheDocument();
    });

    it('renders generated date', () => {
      const report = createMockReport({ generatedAt: '2024-01-15T10:00:00Z' });
      render(<ReportViewer report={report} />);

      expect(screen.getByText(/Generated:/)).toBeInTheDocument();
    });

    it('escapes HTML in title', () => {
      const report = createMockReport({ title: '<script>alert("xss")</script>' });
      const { container } = render(<ReportViewer report={report} />);

      expect(container.querySelector('script')).toBeNull();
    });
  });

  describe('Navigation sidebar', () => {
    it('renders navigation sidebar by default', () => {
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} />);

      // Sidebar is rendered but hidden on small screens via CSS (hidden lg:block)
      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      expect(aside).toBeInTheDocument();
    });

    it('renders all section links', () => {
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} />);

      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      expect(aside).toBeInTheDocument();

      // Check links inside the aside
      expect(within(aside as HTMLElement).getByText('Executive Summary')).toBeInTheDocument();
      expect(within(aside as HTMLElement).getByText('Risk Score')).toBeInTheDocument();
      expect(within(aside as HTMLElement).getByText('OWASP Findings')).toBeInTheDocument();
      expect(within(aside as HTMLElement).getByText('Recommendations')).toBeInTheDocument();
      expect(within(aside as HTMLElement).getByText('Event Analysis')).toBeInTheDocument();
    });

    it('hides navigation sidebar when showNav is false', () => {
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} showNav={false} />);

      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      expect(aside).not.toBeInTheDocument();
    });

    it('hides navigation in print mode', () => {
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} printMode={true} />);

      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      expect(aside).not.toBeInTheDocument();
    });

    it('renders print button', () => {
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} />);

      // Print button is inside the sidebar
      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      expect(within(aside as HTMLElement).getByRole('button', { name: /Print Report/ })).toBeInTheDocument();
    });

    it('calls onPrint when print button clicked', () => {
      const onPrint = vi.fn();
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} onPrint={onPrint} />);

      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      const printBtn = within(aside as HTMLElement).getByRole('button', { name: /Print Report/ });
      fireEvent.click(printBtn);
      expect(onPrint).toHaveBeenCalled();
    });

    it('calls window.print when no onPrint provided', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} />);

      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      const printBtn = within(aside as HTMLElement).getByRole('button', { name: /Print Report/ });
      fireEvent.click(printBtn);
      expect(printSpy).toHaveBeenCalled();
    });

    it('scrolls to section when nav item clicked', () => {
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} />);

      // Find the nav link inside the aside
      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      const riskScoreLink = within(aside as HTMLElement).getByText('Risk Score');

      fireEvent.click(riskScoreLink);

      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('renders export markdown button', () => {
      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} />);

      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      expect(within(aside as HTMLElement).getByRole('button', { name: /Export Markdown/ })).toBeInTheDocument();
    });

    it('calls onExportMarkdown callback when export button clicked', () => {
      const onExportMarkdown = vi.fn();
      const report = createMockReport();
      const { container } = render(
        <ReportViewer report={report} onExportMarkdown={onExportMarkdown} />
      );

      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      const exportBtn = within(aside as HTMLElement).getByRole('button', { name: /Export Markdown/ });
      fireEvent.click(exportBtn);

      // The callback should be called with the filename
      expect(onExportMarkdown).toHaveBeenCalledWith(expect.stringContaining('.md'));
    });

    it('handles export error gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock URL.createObjectURL to throw
      const originalCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = vi.fn().mockImplementation(() => {
        throw new Error('Blob error');
      });

      const report = createMockReport();
      const { container } = render(<ReportViewer report={report} />);

      const aside = container.querySelector('aside[aria-label="Report navigation"]');
      const exportBtn = within(aside as HTMLElement).getByRole('button', { name: /Export Markdown/ });

      // Should not throw, error is caught
      expect(() => fireEvent.click(exportBtn)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to export markdown:', expect.any(Error));

      // Restore
      URL.createObjectURL = originalCreateObjectURL;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Executive Summary section', () => {
    it('renders executive summary section', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      expect(document.getElementById('executive-summary')).toBeInTheDocument();
    });

    it('uses provided executive summary', () => {
      const report = createMockReport({
        executiveSummary: 'Custom executive summary text',
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('Custom executive summary text')).toBeInTheDocument();
    });

    it('generates default summary when none provided', () => {
      const report = createMockReport({
        violations: [createMockViolation({ severity: 8 })],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText(/Security assessment identified/)).toBeInTheDocument();
    });

    it('shows success message when no violations', () => {
      const report = createMockReport({ violations: [] });
      render(<ReportViewer report={report} />);

      expect(screen.getByText(/No vulnerabilities were detected/)).toBeInTheDocument();
    });
  });

  describe('Risk Score section', () => {
    it('renders risk score section', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      expect(document.getElementById('risk-score')).toBeInTheDocument();
    });

    it('shows correct max severity', () => {
      const report = createMockReport({
        violations: [
          createMockViolation({ severity: 5 }),
          createMockViolation({ severity: 8 }),
          createMockViolation({ severity: 3 }),
        ],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('8.0/10')).toBeInTheDocument();
    });

    it('shows correct average severity', () => {
      const report = createMockReport({
        violations: [
          createMockViolation({ severity: 4 }),
          createMockViolation({ severity: 8 }),
        ],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('6.0/10')).toBeInTheDocument();
    });

    it('shows violation count', () => {
      const report = createMockReport({
        violations: [
          createMockViolation(),
          createMockViolation(),
          createMockViolation({ detected: false }), // Not counted
        ],
      });
      render(<ReportViewer report={report} />);

      // Find the violations count in the stats
      const statsRegion = screen.getByRole('region', { name: 'Risk score summary' });
      expect(within(statsRegion).getByText('2')).toBeInTheDocument();
    });
  });

  describe('OWASP Findings section', () => {
    it('renders OWASP findings section', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      expect(document.getElementById('owasp-findings')).toBeInTheDocument();
    });

    it('passes violations to OWASPGrid', () => {
      const report = createMockReport({
        violations: [createMockViolation({ owasp_category: 'ASI01', severity: 8 })],
      });
      render(<ReportViewer report={report} />);

      // Check that ASI01 shows as detected
      expect(screen.getAllByText('ASI01').length).toBeGreaterThan(0);
    });
  });

  describe('Recommendations section', () => {
    it('renders recommendations section', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      expect(document.getElementById('recommendations')).toBeInTheDocument();
    });

    it('renders recommendations', () => {
      const report = createMockReport({
        recommendations: [
          createMockRecommendation({ title: 'Fix the vulnerability' }),
        ],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('Fix the vulnerability')).toBeInTheDocument();
    });

    it('shows empty message when no recommendations', () => {
      const report = createMockReport({ recommendations: [] });
      render(<ReportViewer report={report} />);

      expect(screen.getByText(/No specific recommendations/)).toBeInTheDocument();
    });

    it('sorts recommendations by priority', () => {
      const report = createMockReport({
        recommendations: [
          createMockRecommendation({ id: '1', priority: 'low', title: 'Low priority' }),
          createMockRecommendation({ id: '2', priority: 'critical', title: 'Critical priority' }),
          createMockRecommendation({ id: '3', priority: 'medium', title: 'Medium priority' }),
        ],
      });
      render(<ReportViewer report={report} />);

      const items = screen.getAllByRole('listitem');
      // Filter to only recommendation items (not nav items)
      const recItems = items.filter(
        (item) =>
          item.textContent?.includes('priority') &&
          item.classList.contains('border')
      );

      expect(recItems[0].textContent).toContain('Critical priority');
      expect(recItems[1].textContent).toContain('Medium priority');
      expect(recItems[2].textContent).toContain('Low priority');
    });

    it('shows priority badges', () => {
      const report = createMockReport({
        recommendations: [
          createMockRecommendation({ priority: 'critical' }),
        ],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('shows remediation when available', () => {
      const report = createMockReport({
        recommendations: [
          createMockRecommendation({ remediation: 'Apply this fix' }),
        ],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText(/Apply this fix/)).toBeInTheDocument();
    });

    it('escapes HTML in recommendation content', () => {
      const report = createMockReport({
        recommendations: [
          createMockRecommendation({
            title: '<script>bad</script>',
            description: '<img src=x onerror=alert(1)>',
          }),
        ],
      });
      const { container } = render(<ReportViewer report={report} />);

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
    });
  });

  describe('Event Analysis section', () => {
    it('renders event analysis section', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      expect(document.getElementById('event-analysis')).toBeInTheDocument();
    });

    it('renders events', () => {
      const report = createMockReport({
        events: [createMockEvent({ summary: 'Test event happened' })],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('Test event happened')).toBeInTheDocument();
    });

    it('shows empty message when no events', () => {
      const report = createMockReport({ events: [] });
      render(<ReportViewer report={report} />);

      expect(screen.getByText(/No events recorded/)).toBeInTheDocument();
    });

    it('shows event type labels', () => {
      const report = createMockReport({
        events: [
          createMockEvent({ type: 'tool_call' }),
          createMockEvent({ id: 'evt-2', type: 'divergence' }),
        ],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('Tool Call')).toBeInTheDocument();
      expect(screen.getByText('Divergence')).toBeInTheDocument();
    });

    it('shows severity badge when present', () => {
      const report = createMockReport({
        events: [createMockEvent({ severity: 7 })],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('Severity: 7/10')).toBeInTheDocument();
    });

    it('hides severity badge when severity is 0', () => {
      const report = createMockReport({
        events: [createMockEvent({ severity: 0 })],
      });
      render(<ReportViewer report={report} />);

      expect(screen.queryByText(/Severity:/)).not.toBeInTheDocument();
    });

    it('shows event details when available', () => {
      const report = createMockReport({
        events: [createMockEvent({ details: 'Detailed event info' })],
      });
      render(<ReportViewer report={report} />);

      expect(screen.getByText('Detailed event info')).toBeInTheDocument();
    });

    it('escapes HTML in event content', () => {
      const report = createMockReport({
        events: [
          createMockEvent({
            summary: '<script>bad</script>',
            details: '<img src=x>',
          }),
        ],
      });
      const { container } = render(<ReportViewer report={report} />);

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
    });
  });

  describe('Print mode', () => {
    it('renders all sections expanded in print mode', () => {
      const report = createMockReport({
        violations: [createMockViolation()],
        recommendations: [createMockRecommendation()],
        events: [createMockEvent()],
      });
      render(<ReportViewer report={report} printMode={true} />);

      // All content should be visible
      expect(screen.getByText('Test Recommendation')).toBeInTheDocument();
      expect(screen.getByText('Test event summary')).toBeInTheDocument();
    });

    it('uses list layout for OWASP grid in print mode', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} printMode={true} />);

      // In print mode, grid should use list layout
      expect(screen.getByRole('list', { name: 'OWASP categories list' })).toBeInTheDocument();
    });
  });

  describe('Section collapsing', () => {
    it('sections are expandable', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      // Find a collapsible trigger
      const triggers = screen.getAllByRole('button', { expanded: true });
      expect(triggers.length).toBeGreaterThan(0);
    });

    it('toggles section when trigger clicked', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      // Find the first section trigger
      const trigger = screen.getAllByRole('button', { expanded: true })[0];
      fireEvent.click(trigger);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('Accessibility', () => {
    it('has main content area', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('has accessible section headings', () => {
      const report = createMockReport();
      render(<ReportViewer report={report} />);

      const sections = document.querySelectorAll('section[aria-labelledby]');
      expect(sections.length).toBe(5);
    });

    it('uses time element for dates', () => {
      const report = createMockReport({ generatedAt: '2024-01-15T10:00:00Z' });
      const { container } = render(<ReportViewer report={report} />);

      const timeElement = container.querySelector('time');
      expect(timeElement).toHaveAttribute('dateTime', '2024-01-15T10:00:00Z');
    });
  });

  describe('Custom className', () => {
    it('applies custom className', () => {
      const report = createMockReport();
      const { container } = render(
        <ReportViewer report={report} className="custom-viewer" />
      );

      expect(container.firstChild).toHaveClass('custom-viewer');
    });
  });
});
