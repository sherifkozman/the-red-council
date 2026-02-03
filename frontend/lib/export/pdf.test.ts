/**
 * Tests for PDF export functionality
 *
 * Tests the PDF export utility functions including HTML generation,
 * validation, statistics calculation, and print dialog handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PDF_EXPORT_VERSION,
  escapeHtml,
  formatDate,
  formatDateForFilename,
  generateFilename,
  calculateStats,
  getRiskLevelInfo,
  generatePrintHTML,
  printReportAsPDF,
  exportReportAsPDF,
} from './pdf';
import type { ReportData } from '@/components/reports/ReportViewer';
import type { Violation } from '@/components/reports/CategoryCard';

// Helper to create a valid report
function createValidReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    id: 'test-report-123',
    title: 'Test Security Report',
    generatedAt: '2024-01-15T10:30:00Z',
    targetAgent: 'TestAgent v1.0',
    violations: [],
    recommendations: [],
    events: [],
    ...overrides,
  };
}

// Helper to create a violation
function createViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    owasp_category: 'AT-01',
    detected: true,
    severity: 7,
    evidence: 'Test evidence',
    recommendation: 'Test recommendation',
    ...overrides,
  };
}

describe('PDF Export', () => {
  describe('PDF_EXPORT_VERSION', () => {
    it('should be a valid semver string', () => {
      expect(PDF_EXPORT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('escapeHtml', () => {
    it('escapes HTML entities', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('escapes ampersands', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('escapes quotes', () => {
      expect(escapeHtml("it's \"quoted\"")).toBe(
        'it&#039;s &quot;quoted&quot;'
      );
    });

    it('handles null', () => {
      expect(escapeHtml(null)).toBe('');
    });

    it('handles undefined', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('handles numbers', () => {
      // Should convert to string
      expect(escapeHtml(123 as unknown as string)).toBe('123');
    });
  });

  describe('formatDate', () => {
    it('formats valid date string', () => {
      const result = formatDate('2024-01-15T10:30:00Z');
      // Result depends on locale, just check it's not the error message
      expect(result).not.toBe('Date unavailable');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns fallback for null', () => {
      expect(formatDate(null)).toBe('Date unavailable');
    });

    it('returns fallback for undefined', () => {
      expect(formatDate(undefined)).toBe('Date unavailable');
    });

    it('returns fallback for invalid date', () => {
      expect(formatDate('not-a-date')).toBe('Date unavailable');
    });

    it('returns fallback for empty string', () => {
      expect(formatDate('')).toBe('Date unavailable');
    });
  });

  describe('formatDateForFilename', () => {
    it('formats date as YYYYMMDDHHMMSS', () => {
      const result = formatDateForFilename('2024-01-15T10:30:45Z');
      expect(result).toBe('20240115103045');
    });

    it('uses current time for null', () => {
      const result = formatDateForFilename(null);
      expect(result).toMatch(/^\d{14}$/);
    });

    it('uses current time for undefined', () => {
      const result = formatDateForFilename(undefined);
      expect(result).toMatch(/^\d{14}$/);
    });

    it('uses current time for invalid date', () => {
      const result = formatDateForFilename('not-a-date');
      expect(result).toMatch(/^\d{14}$/);
    });
  });

  describe('generateFilename', () => {
    it('generates valid filename with report ID and timestamp', () => {
      const filename = generateFilename('report-123', '2024-01-15T10:30:00Z');
      expect(filename).toBe('security-report_report-123_20240115103000.pdf');
    });

    it('sanitizes special characters in report ID', () => {
      const filename = generateFilename('report/with\\special<chars>', '2024-01-15T10:30:00Z');
      expect(filename).toBe('security-report_report_with_special_chars__20240115103000.pdf');
    });

    it('truncates long report IDs', () => {
      const longId = 'a'.repeat(100);
      const filename = generateFilename(longId, '2024-01-15T10:30:00Z');
      expect(filename.length).toBeLessThanOrEqual(100);
    });

    it('uses current time if generatedAt not provided', () => {
      const filename = generateFilename('report-123');
      expect(filename).toMatch(/^security-report_report-123_\d{14}\.pdf$/);
    });
  });

  describe('calculateStats', () => {
    it('returns zeros for null violations', () => {
      const stats = calculateStats(null);
      expect(stats).toEqual({
        totalViolations: 0,
        maxSeverity: 0,
        avgSeverity: 0,
        categoriesTested: 0,
      });
    });

    it('returns zeros for undefined violations', () => {
      const stats = calculateStats(undefined);
      expect(stats).toEqual({
        totalViolations: 0,
        maxSeverity: 0,
        avgSeverity: 0,
        categoriesTested: 0,
      });
    });

    it('returns zeros for empty array', () => {
      const stats = calculateStats([]);
      expect(stats).toEqual({
        totalViolations: 0,
        maxSeverity: 0,
        avgSeverity: 0,
        categoriesTested: 0,
      });
    });

    it('calculates stats for single violation', () => {
      const violations = [createViolation({ severity: 7 })];
      const stats = calculateStats(violations);
      expect(stats).toEqual({
        totalViolations: 1,
        maxSeverity: 7,
        avgSeverity: 7,
        categoriesTested: 1,
      });
    });

    it('calculates stats for multiple violations', () => {
      const violations = [
        createViolation({ owasp_category: 'AT-01', severity: 8 }),
        createViolation({ owasp_category: 'AT-02', severity: 6 }),
        createViolation({ owasp_category: 'AT-03', severity: 4 }),
      ];
      const stats = calculateStats(violations);
      expect(stats.totalViolations).toBe(3);
      expect(stats.maxSeverity).toBe(8);
      expect(stats.avgSeverity).toBeCloseTo(6, 5);
      expect(stats.categoriesTested).toBe(3);
    });

    it('only counts detected violations', () => {
      const violations = [
        createViolation({ detected: true, severity: 8 }),
        createViolation({ detected: false, severity: 10 }),
      ];
      const stats = calculateStats(violations);
      expect(stats.totalViolations).toBe(1);
      expect(stats.maxSeverity).toBe(8);
    });

    it('handles violations without severity', () => {
      const violations = [
        createViolation({ severity: undefined as unknown as number }),
      ];
      const stats = calculateStats(violations);
      expect(stats.maxSeverity).toBe(0);
      expect(stats.avgSeverity).toBe(0);
    });
  });

  describe('getRiskLevelInfo', () => {
    it('returns None for severity 0', () => {
      const info = getRiskLevelInfo(0);
      expect(info.label).toBe('None');
      expect(info.color).toBe('#22c55e');
    });

    it('returns Low for severity 1-3', () => {
      expect(getRiskLevelInfo(1).label).toBe('Low');
      expect(getRiskLevelInfo(2).label).toBe('Low');
      expect(getRiskLevelInfo(3).label).toBe('Low');
    });

    it('returns Medium for severity 4-6', () => {
      expect(getRiskLevelInfo(4).label).toBe('Medium');
      expect(getRiskLevelInfo(5).label).toBe('Medium');
      expect(getRiskLevelInfo(6).label).toBe('Medium');
    });

    it('returns High for severity 7-8', () => {
      expect(getRiskLevelInfo(7).label).toBe('High');
      expect(getRiskLevelInfo(8).label).toBe('High');
    });

    it('returns Critical for severity 9-10', () => {
      expect(getRiskLevelInfo(9).label).toBe('Critical');
      expect(getRiskLevelInfo(10).label).toBe('Critical');
    });

    it('handles decimal values', () => {
      expect(getRiskLevelInfo(6.9).label).toBe('Medium');
      expect(getRiskLevelInfo(7.0).label).toBe('High');
    });

    it('returns correct colors', () => {
      expect(getRiskLevelInfo(0).color).toBe('#22c55e'); // None - green
      expect(getRiskLevelInfo(1).color).toBe('#84cc16'); // Low - lime
      expect(getRiskLevelInfo(4).color).toBe('#eab308'); // Medium - yellow
      expect(getRiskLevelInfo(7).color).toBe('#f97316'); // High - orange
      expect(getRiskLevelInfo(9).color).toBe('#ef4444'); // Critical - red
    });
  });

  describe('generatePrintHTML', () => {
    it('generates valid HTML document', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('includes report title', () => {
      const report = createValidReport({ title: 'My Test Report' });
      const html = generatePrintHTML(report);

      expect(html).toContain('My Test Report');
    });

    it('includes target agent', () => {
      const report = createValidReport({ targetAgent: 'MyAgent v2.0' });
      const html = generatePrintHTML(report);

      expect(html).toContain('MyAgent v2.0');
    });

    it('includes branding header by default', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report);

      expect(html).toContain('The Red Council');
      expect(html).toContain('Security Assessment Platform');
    });

    it('excludes branding header when disabled', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report, { includeHeader: false });

      // Should not have branding class
      expect(html).not.toContain('class="branding"');
    });

    it('includes table of contents by default', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report);

      expect(html).toContain('Table of Contents');
      expect(html).toContain('Executive Summary');
      expect(html).toContain('Risk Score');
    });

    it('excludes table of contents when disabled', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report, { includeTableOfContents: false });

      // Check for the TOC section element (not CSS comment which also contains "Table of Contents")
      expect(html).not.toContain('<h2>Table of Contents</h2>');
      expect(html).not.toContain('class="toc');
    });

    it('includes executive summary section', () => {
      const report = createValidReport({
        executiveSummary: 'This is a custom executive summary.',
      });
      const html = generatePrintHTML(report);

      expect(html).toContain('Executive Summary');
      expect(html).toContain('This is a custom executive summary.');
    });

    it('generates default summary if not provided', () => {
      const report = createValidReport({
        executiveSummary: undefined,
        violations: [createViolation({ severity: 8 })],
      });
      const html = generatePrintHTML(report);

      expect(html).toContain('1 vulnerability');
    });

    it('includes risk score section', () => {
      const report = createValidReport({
        violations: [createViolation({ severity: 7 })],
      });
      const html = generatePrintHTML(report);

      expect(html).toContain('Risk Score');
      expect(html).toContain('7.0');
    });

    it('includes OWASP findings section', () => {
      const report = createValidReport({
        violations: [
          createViolation({ owasp_category: 'AT-01', severity: 7, evidence: 'Test evidence' }),
        ],
      });
      const html = generatePrintHTML(report);

      expect(html).toContain('OWASP Agentic Top 10 Findings');
      expect(html).toContain('AT-01');
      expect(html).toContain('Test evidence');
    });

    it('shows no findings message when no violations', () => {
      const report = createValidReport({ violations: [] });
      const html = generatePrintHTML(report);

      expect(html).toContain('No vulnerabilities detected');
    });

    it('includes recommendations section', () => {
      const report = createValidReport({
        recommendations: [
          {
            id: 'rec-1',
            category: 'AT-01',
            priority: 'critical',
            title: 'Fix Critical Issue',
            description: 'This needs immediate attention',
            remediation: 'Apply patch X',
          },
        ],
      });
      const html = generatePrintHTML(report);

      expect(html).toContain('Recommendations');
      expect(html).toContain('Fix Critical Issue');
      expect(html).toContain('This needs immediate attention');
      expect(html).toContain('Apply patch X');
      expect(html).toContain('CRITICAL');
    });

    it('sorts recommendations by priority', () => {
      const report = createValidReport({
        recommendations: [
          { id: '1', category: 'AT-01', priority: 'low', title: 'RecommendationLowPriority', description: '' },
          { id: '2', category: 'AT-01', priority: 'critical', title: 'RecommendationCriticalPriority', description: '' },
          { id: '3', category: 'AT-01', priority: 'high', title: 'RecommendationHighPriority', description: '' },
        ],
      });
      const html = generatePrintHTML(report);

      // Use unique titles to avoid matching "High" in "High Risk" labels
      const criticalIndex = html.indexOf('RecommendationCriticalPriority');
      const highIndex = html.indexOf('RecommendationHighPriority');
      const lowIndex = html.indexOf('RecommendationLowPriority');

      expect(criticalIndex).toBeGreaterThan(-1);
      expect(highIndex).toBeGreaterThan(-1);
      expect(lowIndex).toBeGreaterThan(-1);
      expect(criticalIndex).toBeLessThan(highIndex);
      expect(highIndex).toBeLessThan(lowIndex);
    });

    it('includes events section by default', () => {
      const report = createValidReport({
        events: [
          {
            id: 'evt-1',
            timestamp: '2024-01-15T10:30:00Z',
            type: 'tool_call',
            severity: 5,
            summary: 'Test event occurred',
            details: 'Some details',
          },
        ],
      });
      const html = generatePrintHTML(report);

      expect(html).toContain('Event Analysis');
      expect(html).toContain('Tool Call');
      expect(html).toContain('Test event occurred');
    });

    it('excludes events when disabled', () => {
      const report = createValidReport({
        events: [
          {
            id: 'evt-1',
            timestamp: '2024-01-15T10:30:00Z',
            type: 'tool_call',
            summary: 'Test event occurred',
          },
        ],
      });
      const html = generatePrintHTML(report, { includeEvents: false });

      expect(html).not.toContain('Event Analysis');
      expect(html).not.toContain('Test event occurred');
    });

    it('limits events when maxEvents is set', () => {
      const report = createValidReport({
        events: [
          { id: 'evt-1', timestamp: '2024-01-15T10:30:00Z', type: 'tool_call', summary: 'Event 1' },
          { id: 'evt-2', timestamp: '2024-01-15T10:31:00Z', type: 'action', summary: 'Event 2' },
          { id: 'evt-3', timestamp: '2024-01-15T10:32:00Z', type: 'speech', summary: 'Event 3' },
        ],
      });
      const html = generatePrintHTML(report, { maxEvents: 2 });

      expect(html).toContain('Event 1');
      expect(html).toContain('Event 2');
      expect(html).not.toContain('Event 3');
    });

    it('includes footer by default', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report);

      expect(html).toContain('report-footer');
      expect(html).toContain('Report Version:');
    });

    it('excludes footer when disabled', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report, { includeFooter: false });

      // The class name is in CSS, but there should be no footer element
      expect(html).not.toContain('<footer class="report-footer">');
    });

    it('includes print styles', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report);

      expect(html).toContain('@page');
      expect(html).toContain('@media print');
    });

    it('uses A4 paper size by default', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report);

      expect(html).toContain('size: A4');
    });

    it('uses Letter paper size when specified', () => {
      const report = createValidReport();
      const html = generatePrintHTML(report, { paperSize: 'Letter' });

      expect(html).toContain('size: Letter');
    });

    it('escapes HTML in user content', () => {
      const report = createValidReport({
        title: '<script>alert("xss")</script>',
        targetAgent: '<img onerror="alert(1)">',
        executiveSummary: 'Test <b>bold</b> text',
      });
      const html = generatePrintHTML(report);

      // Verify dangerous HTML is escaped (not executable)
      expect(html).not.toContain('<script>alert');
      // onerror is escaped as onerror=&quot; which is safe
      expect(html).not.toContain('onerror="alert');
      expect(html).toContain('&lt;script&gt;');
    });

    it('handles all event types', () => {
      const eventTypes = ['tool_call', 'memory_access', 'action', 'speech', 'divergence'] as const;
      const events = eventTypes.map((type, i) => ({
        id: `evt-${i}`,
        timestamp: '2024-01-15T10:30:00Z',
        type,
        summary: `Event type ${type}`,
      }));

      const report = createValidReport({ events });
      const html = generatePrintHTML(report);

      expect(html).toContain('Tool Call');
      expect(html).toContain('Memory Access');
      expect(html).toContain('Action');
      expect(html).toContain('Speech');
      expect(html).toContain('Divergence');
    });

    it('handles all priority levels', () => {
      const priorities = ['critical', 'high', 'medium', 'low'] as const;
      const recommendations = priorities.map((priority, i) => ({
        id: `rec-${i}`,
        category: 'AT-01',
        priority,
        title: `${priority} priority`,
        description: 'Test',
      }));

      const report = createValidReport({ recommendations });
      const html = generatePrintHTML(report);

      expect(html).toContain('CRITICAL');
      expect(html).toContain('HIGH');
      expect(html).toContain('MEDIUM');
      expect(html).toContain('LOW');
    });
  });

  describe('printReportAsPDF', () => {
    let mockOpen: ReturnType<typeof vi.fn>;
    let mockCreateObjectURL: ReturnType<typeof vi.fn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Mock window.open
      mockOpen = vi.fn().mockReturnValue({
        document: {
          write: vi.fn(),
          close: vi.fn(),
        },
        focus: vi.fn(),
        print: vi.fn(),
        closed: false,
        onload: null,
        onbeforeunload: null,
      });

      // Mock URL methods
      mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
      mockRevokeObjectURL = vi.fn();

      // Define window with mocks - jsdom provides window, we just add our mock
      vi.stubGlobal('open', mockOpen);

      // Mock URL methods
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('validates report exists', () => {
      expect(() => printReportAsPDF(null as unknown as ReportData)).toThrow(
        'Cannot export: No report data provided'
      );
    });

    it('throws error for report without ID', () => {
      const report = createValidReport({ id: '' });
      expect(() => printReportAsPDF(report)).toThrow(
        'Cannot export: Report is missing required ID field'
      );
    });

    it('opens print window with blob URL', () => {
      const report = createValidReport();
      printReportAsPDF(report);

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(mockOpen).toHaveBeenCalledWith('blob:test-url', '_blank', 'width=800,height=600');
    });

    it('throws error if popup is blocked', () => {
      mockOpen.mockReturnValue(null);

      const report = createValidReport();
      expect(() => printReportAsPDF(report)).toThrow(
        'Failed to open print window. Pop-up may be blocked.'
      );
    });

    it('cleans up blob URL after popup is blocked', () => {
      mockOpen.mockReturnValue(null);

      const report = createValidReport();
      try {
        printReportAsPDF(report);
      } catch {
        // Expected error
      }

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });
  });

  describe('exportReportAsPDF', () => {
    let mockOpen: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // Mock window.open
      mockOpen = vi.fn().mockReturnValue({
        document: {
          write: vi.fn(),
          close: vi.fn(),
        },
        focus: vi.fn(),
        print: vi.fn(),
        closed: false,
        onload: null,
        onbeforeunload: null,
      });

      vi.stubGlobal('open', mockOpen);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('throws error for null report', () => {
      expect(() => exportReportAsPDF(null as unknown as ReportData)).toThrow(
        'Cannot export: No report data provided'
      );
    });

    it('throws error for report without ID', () => {
      const report = createValidReport({ id: '' });
      expect(() => exportReportAsPDF(report)).toThrow(
        'Cannot export: Report is missing required ID field'
      );
    });

    it('returns suggested filename', () => {
      const report = createValidReport({
        id: 'test-report-456',
        generatedAt: '2024-01-15T10:30:00Z',
      });
      const filename = exportReportAsPDF(report);

      expect(filename).toBe('security-report_test-report-456_20240115103000.pdf');
    });

    it('passes options to printReportAsPDF', () => {
      const report = createValidReport();
      exportReportAsPDF(report, { includeEvents: false, paperSize: 'Letter' });

      // Verify the print function was called
      expect(mockOpen).toHaveBeenCalled();
    });
  });

  describe('integration', () => {
    it('generates complete report with all sections', () => {
      const report = createValidReport({
        title: 'Full Security Assessment',
        targetAgent: 'Production API v3.0',
        executiveSummary: 'Comprehensive security review completed.',
        violations: [
          createViolation({ owasp_category: 'AT-01', severity: 8, evidence: 'SQL injection found' }),
          createViolation({ owasp_category: 'AT-02', severity: 6, evidence: 'XSS vulnerability' }),
        ],
        recommendations: [
          {
            id: 'rec-1',
            category: 'AT-01',
            priority: 'critical',
            title: 'Fix SQL Injection',
            description: 'Parameterize all queries',
            remediation: 'Use prepared statements',
          },
          {
            id: 'rec-2',
            category: 'AT-02',
            priority: 'high',
            title: 'Fix XSS',
            description: 'Sanitize output',
          },
        ],
        events: [
          {
            id: 'evt-1',
            timestamp: '2024-01-15T10:00:00Z',
            type: 'tool_call',
            severity: 5,
            summary: 'Initial scan started',
          },
          {
            id: 'evt-2',
            timestamp: '2024-01-15T10:30:00Z',
            type: 'divergence',
            severity: 8,
            summary: 'Critical vulnerability detected',
            details: 'SQL injection in /api/users endpoint',
          },
        ],
      });

      const html = generatePrintHTML(report);

      // Verify all sections are present
      expect(html).toContain('Full Security Assessment');
      expect(html).toContain('Production API v3.0');
      expect(html).toContain('Comprehensive security review completed.');
      expect(html).toContain('AT-01');
      expect(html).toContain('AT-02');
      expect(html).toContain('Fix SQL Injection');
      expect(html).toContain('Fix XSS');
      expect(html).toContain('Initial scan started');
      expect(html).toContain('Critical vulnerability detected');

      // Verify stats
      expect(html).toContain('2'); // totalViolations
      expect(html).toContain('8.0'); // maxSeverity
    });
  });
});
