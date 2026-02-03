import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeMarkdown,
  formatDate,
  formatDateForFilename,
  generateFilename,
  exportToMarkdown,
  downloadMarkdown,
  exportReportAsMarkdown,
  type MarkdownExportOptions,
} from './markdown';
import type { ReportData } from '@/components/reports/ReportViewer';

// Mock the RiskGauge module
vi.mock('@/components/reports/RiskGauge', () => ({
  getRiskLevel: (score: number) => {
    if (score >= 9) return 'critical';
    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    if (score >= 1) return 'low';
    return 'none';
  },
  getRiskLevelLabel: (level: string) => {
    const labels: Record<string, string> = {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      none: 'None',
    };
    return labels[level] || 'Unknown';
  },
}));

// Sample report data for tests
function createSampleReport(overrides: Partial<ReportData> = {}): ReportData {
  return {
    id: 'test-report-123',
    title: 'Security Assessment Report',
    generatedAt: '2024-01-15T10:30:00Z',
    targetAgent: 'Test Agent v1.0',
    violations: [
      {
        detected: true,
        severity: 8,
        evidence: 'Agent executed dangerous operation',
        recommendation: 'Add confirmation dialog',
        owasp_category: 'ASI01',
      },
      {
        detected: true,
        severity: 5,
        evidence: 'Missing oversight',
        recommendation: 'Implement human review',
        owasp_category: 'ASI02',
      },
      {
        detected: false,
        severity: 0,
        evidence: 'Authorization checks passed',
        recommendation: '',
        owasp_category: 'ASI05',
      },
    ],
    recommendations: [
      {
        id: 'rec-1',
        category: 'ASI01',
        priority: 'critical',
        title: 'Implement Confirmation Dialogs',
        description: 'Add user confirmation for destructive actions',
        remediation: 'Use a modal dialog before executing',
      },
      {
        id: 'rec-2',
        category: 'ASI02',
        priority: 'high',
        title: 'Add Human Oversight',
        description: 'Implement approval workflow',
      },
      {
        id: 'rec-3',
        category: 'ASI06',
        priority: 'medium',
        title: 'Sanitize Error Messages',
        description: 'Filter internal errors from user responses',
      },
    ],
    events: [
      {
        id: 'evt-1',
        timestamp: '2024-01-15T10:00:00Z',
        type: 'tool_call',
        summary: 'Agent called file_list tool',
        details: 'Path: /users/demo/documents',
      },
      {
        id: 'evt-2',
        timestamp: '2024-01-15T10:00:05Z',
        type: 'divergence',
        severity: 9,
        summary: 'Agent behavior diverged from expected',
        details: 'Processed malicious instruction',
      },
    ],
    ...overrides,
  };
}

describe('escapeMarkdown', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeMarkdown(null)).toBe('');
    expect(escapeMarkdown(undefined)).toBe('');
    expect(escapeMarkdown('')).toBe('');
  });

  it('escapes asterisks', () => {
    expect(escapeMarkdown('**bold**')).toBe('\\*\\*bold\\*\\*');
  });

  it('escapes underscores', () => {
    expect(escapeMarkdown('_italic_')).toBe('\\_italic\\_');
  });

  it('escapes square brackets', () => {
    expect(escapeMarkdown('[link](url)')).toBe('\\[link\\]\\(url\\)');
  });

  it('escapes hash symbols', () => {
    expect(escapeMarkdown('# heading')).toBe('\\# heading');
  });

  it('escapes backticks', () => {
    expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
  });

  it('escapes pipe symbols', () => {
    expect(escapeMarkdown('| table |')).toBe('\\| table \\|');
  });

  it('escapes angle brackets', () => {
    expect(escapeMarkdown('<html>')).toBe('\\<html\\>');
  });

  it('escapes multiple characters', () => {
    const input = '# **Hello** [world]!';
    const escaped = escapeMarkdown(input);
    expect(escaped).toContain('\\#');
    expect(escaped).toContain('\\*');
    expect(escaped).toContain('\\[');
    expect(escaped).toContain('\\!');
  });
});

describe('formatDate', () => {
  it('returns "Date unavailable" for null/undefined', () => {
    expect(formatDate(null)).toBe('Date unavailable');
    expect(formatDate(undefined)).toBe('Date unavailable');
  });

  it('returns ISO string for valid date', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toBe('2024-01-15T10:30:00.000Z');
  });

  it('returns "Date unavailable" for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('Date unavailable');
    expect(formatDate('invalid')).toBe('Date unavailable');
  });
});

describe('formatDateForFilename', () => {
  it('formats date for filename without special characters', () => {
    const result = formatDateForFilename('2024-01-15T10:30:00Z');
    expect(result).toMatch(/^\d{14}$/); // 14 digits: YYYYMMDDHHMMSS
    expect(result).not.toContain('-');
    expect(result).not.toContain(':');
    expect(result).not.toContain('T');
  });

  it('uses current date for null/undefined', () => {
    const result = formatDateForFilename(null);
    expect(result).toMatch(/^\d{14}$/);
  });

  it('uses current date for invalid date', () => {
    const result = formatDateForFilename('invalid-date');
    expect(result).toMatch(/^\d{14}$/);
  });
});

describe('generateFilename', () => {
  it('generates filename with report ID and timestamp', () => {
    const report = createSampleReport();
    const filename = generateFilename(report);

    expect(filename).toMatch(/^security-report_test-report-123_\d+\.md$/);
  });

  it('sanitizes report ID with special characters', () => {
    const report = createSampleReport({ id: 'report/with:special@chars' });
    const filename = generateFilename(report);

    expect(filename).not.toContain('/');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('@');
    expect(filename).toContain('report_with_special_chars');
  });

  it('truncates long report IDs', () => {
    const longId = 'a'.repeat(100);
    const report = createSampleReport({ id: longId });
    const filename = generateFilename(report);

    // ID should be truncated to 50 chars
    expect(filename.split('_')[1]).toHaveLength(50);
  });
});

describe('exportToMarkdown', () => {
  it('includes report title as H1', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('# Security Assessment Report');
  });

  it('includes metadata section by default', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('---');
    expect(markdown).toContain('title:');
    expect(markdown).toContain('generated_at:');
    expect(markdown).toContain('target_agent:');
    expect(markdown).toContain('report_id:');
  });

  it('excludes metadata when option is false', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report, { includeMetadata: false });

    // Should not have YAML frontmatter markers at the start
    const lines = markdown.split('\n');
    expect(lines[0]).toBe('# Security Assessment Report');
  });

  it('includes table of contents by default', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('## Table of Contents');
    expect(markdown).toContain('[Executive Summary]');
    expect(markdown).toContain('[Risk Score]');
    expect(markdown).toContain('[OWASP Findings]');
    expect(markdown).toContain('[Recommendations]');
  });

  it('excludes table of contents when option is false', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report, { includeToc: false });

    expect(markdown).not.toContain('## Table of Contents');
  });

  it('includes executive summary section', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('## Executive Summary');
    expect(markdown).toMatch(/vulnerability|vulnerabilities/i);
  });

  it('uses custom executive summary when provided', () => {
    const report = createSampleReport({
      executiveSummary: 'Custom summary text here',
    });
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('Custom summary text here');
  });

  it('generates default summary for reports with no violations', () => {
    const report = createSampleReport({
      violations: [],
    });
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('No vulnerabilities were detected');
  });

  it('includes risk score table', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('## Risk Score');
    expect(markdown).toContain('| Metric | Value |');
    expect(markdown).toContain('Risk Level');
    expect(markdown).toContain('Maximum Severity');
    expect(markdown).toContain('Average Severity');
    expect(markdown).toContain('Total Violations');
    expect(markdown).toContain('Categories Tested');
  });

  it('includes OWASP findings section with table', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('## OWASP Agentic Top 10 Findings');
    expect(markdown).toContain('| Category | Status | Severity | Description |');
    expect(markdown).toContain('ASI01');
    expect(markdown).toContain('ASI02');
  });

  it('includes detailed findings for detected violations', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('### Detailed Findings');
    expect(markdown).toContain('Agent executed dangerous operation');
    expect(markdown).toContain('Add confirmation dialog');
  });

  it('shows "No violations recorded" when violations array is empty', () => {
    const report = createSampleReport({ violations: [] });
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('No violations recorded');
  });

  it('includes recommendations section', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('## Recommendations');
    expect(markdown).toContain('[CRITICAL]');
    expect(markdown).toContain('[HIGH]');
    expect(markdown).toContain('[MEDIUM]');
    expect(markdown).toContain('Implement Confirmation Dialogs');
    expect(markdown).toContain('Add Human Oversight');
  });

  it('sorts recommendations by priority', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    const criticalIndex = markdown.indexOf('[CRITICAL]');
    const highIndex = markdown.indexOf('[HIGH]');
    const mediumIndex = markdown.indexOf('[MEDIUM]');

    expect(criticalIndex).toBeLessThan(highIndex);
    expect(highIndex).toBeLessThan(mediumIndex);
  });

  it('shows "No specific recommendations" when recommendations empty', () => {
    const report = createSampleReport({ recommendations: [] });
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('No specific recommendations');
  });

  it('includes event analysis section by default', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('## Event Analysis');
    expect(markdown).toContain('| Timestamp | Type | Severity | Summary |');
    expect(markdown).toContain('Tool Call');
    expect(markdown).toContain('Divergence');
  });

  it('excludes event analysis when option is false', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report, { includeEvents: false });

    expect(markdown).not.toContain('## Event Analysis');
  });

  it('truncates events when maxEvents is set', () => {
    const manyEvents = Array.from({ length: 150 }, (_, i) => ({
      id: `evt-${i}`,
      timestamp: `2024-01-15T10:${String(i).padStart(2, '0')}:00Z`,
      type: 'tool_call' as const,
      summary: `Event ${i}`,
    }));

    const report = createSampleReport({ events: manyEvents });
    const markdown = exportToMarkdown(report, { maxEvents: 50 });

    expect(markdown).toContain('Showing first 50 of 150 events');
    // Should have the first 50 events, not all 150
    expect((markdown.match(/Event \d+/g) || []).length).toBeLessThanOrEqual(100); // Allow for details section
  });

  it('shows "No events recorded" when events empty', () => {
    const report = createSampleReport({ events: [] });
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('No events recorded');
  });

  it('includes event details section when events have details', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('### Event Details');
    expect(markdown).toContain('Path: /users/demo/documents');
    expect(markdown).toContain('Processed malicious instruction');
  });

  it('includes footer with generation info', () => {
    const report = createSampleReport();
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('The Red Council Security Assessment Platform');
    expect(markdown).toContain('Generated:');
  });

  it('handles null violations gracefully', () => {
    const report = createSampleReport({ violations: null as unknown as any });
    const markdown = exportToMarkdown(report);

    expect(markdown).toContain('No violations recorded');
  });

  it('escapes markdown in user content', () => {
    const report = createSampleReport({
      title: '# Malicious **Title** [link](http://evil.com)',
      targetAgent: '**Bold** Agent',
    });
    const markdown = exportToMarkdown(report);

    // Title should be escaped in header
    expect(markdown).toContain('\\#');
    expect(markdown).toContain('\\*\\*');
  });

  it('uses code blocks for evidence without escaping', () => {
    const report = createSampleReport({
      violations: [
        {
          detected: true,
          severity: 8,
          evidence: '```javascript\nconsole.log("test");\n```',
          recommendation: 'Fix it',
          owasp_category: 'ASI01',
        },
      ],
    });
    const markdown = exportToMarkdown(report);

    // Evidence is inside a code block, so the inner backticks should be visible
    expect(markdown).toContain('```\n```javascript');
  });
});

describe('downloadMarkdown', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildMock: ReturnType<typeof vi.fn>;
  let removeChildMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn>;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url');
    revokeObjectURLMock = vi.fn();
    appendChildMock = vi.fn();
    removeChildMock = vi.fn();
    clickMock = vi.fn();

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    // Mock document.body methods
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildMock);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildMock);

    // Store original createElement
    originalCreateElement = document.createElement.bind(document);

    // Mock document.createElement for anchor element
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = clickMock;
      }
      return element;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates blob with UTF-8 BOM and correct type', () => {
    downloadMarkdown('# Test', 'test.md');

    expect(createObjectURLMock).toHaveBeenCalled();
    const blobArg = createObjectURLMock.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('text/markdown;charset=utf-8');
  });

  it('creates download link with correct attributes', () => {
    downloadMarkdown('# Test', 'test-file.md');

    expect(appendChildMock).toHaveBeenCalled();
    const link = appendChildMock.mock.calls[0][0];
    expect(link.href).toBe('blob:test-url');
    expect(link.download).toBe('test-file.md');
  });

  it('triggers click on the link', () => {
    downloadMarkdown('# Test', 'test.md');

    expect(clickMock).toHaveBeenCalled();
  });

  it('cleans up after download', () => {
    // Make appendChild set parentNode so removeChild is called
    appendChildMock.mockImplementation((node: HTMLElement) => {
      Object.defineProperty(node, 'parentNode', { value: document.body, configurable: true });
      return node;
    });

    downloadMarkdown('# Test', 'test.md');

    expect(removeChildMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url');
  });

  it('cleans up even if click throws', () => {
    // Make appendChild set parentNode so removeChild is called
    appendChildMock.mockImplementation((node: HTMLElement) => {
      Object.defineProperty(node, 'parentNode', { value: document.body, configurable: true });
      return node;
    });

    clickMock.mockImplementation(() => {
      throw new Error('Click failed');
    });

    expect(() => downloadMarkdown('# Test', 'test.md')).toThrow('Click failed');
    expect(removeChildMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url');
  });
});

describe('exportReportAsMarkdown', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildMock: ReturnType<typeof vi.fn>;
  let removeChildMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn>;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url');
    revokeObjectURLMock = vi.fn();
    appendChildMock = vi.fn();
    removeChildMock = vi.fn();
    clickMock = vi.fn();

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildMock);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildMock);

    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = clickMock;
      }
      return element;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports report and returns filename', () => {
    const report = createSampleReport();
    const filename = exportReportAsMarkdown(report);

    expect(filename).toMatch(/^security-report_test-report-123_\d+\.md$/);
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
  });

  it('passes options to exportToMarkdown', () => {
    const report = createSampleReport();
    exportReportAsMarkdown(report, { includeEvents: false });

    // Get the blob content
    const blob = createObjectURLMock.mock.calls[0][0];

    // Read the blob content
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        expect(content).not.toContain('## Event Analysis');
        resolve();
      };
      reader.readAsText(blob);
    });
  });
});

describe('edge cases', () => {
  it('handles report with all fields null/undefined', () => {
    const report: ReportData = {
      id: 'minimal',
      title: 'Minimal Report',
      generatedAt: '',
      targetAgent: '',
      violations: [],
      recommendations: [],
      events: [],
    };

    const markdown = exportToMarkdown(report);
    expect(markdown).toContain('# Minimal Report');
    expect(markdown).toContain('Date unavailable');
  });

  it('handles unknown OWASP category gracefully', () => {
    const report = createSampleReport({
      violations: [
        {
          detected: true,
          severity: 5,
          evidence: 'Unknown category violation',
          recommendation: 'Fix it',
          owasp_category: 'UNKNOWN_CAT',
        },
      ],
    });

    const markdown = exportToMarkdown(report);
    // Underscores are escaped in markdown
    expect(markdown).toContain('UNKNOWN\\_CAT');
    expect(markdown).toContain('Unknown category violation');
  });

  it('handles very long evidence strings', () => {
    const longEvidence = 'x'.repeat(10000);
    const report = createSampleReport({
      violations: [
        {
          detected: true,
          severity: 5,
          evidence: longEvidence,
          recommendation: '',
          owasp_category: 'ASI01',
        },
      ],
    });

    const markdown = exportToMarkdown(report);
    expect(markdown).toContain(longEvidence);
  });

  it('handles special characters in all fields', () => {
    const report = createSampleReport({
      title: '<script>alert("xss")</script>',
      targetAgent: '| Table | Breaking | Content |',
      violations: [
        {
          detected: true,
          severity: 5,
          evidence: '```\ncode injection\n```',
          recommendation: '[link](http://malicious.com)',
          owasp_category: 'ASI01',
        },
      ],
    });

    const markdown = exportToMarkdown(report);
    // Should be escaped
    expect(markdown).toContain('\\<script\\>');
    expect(markdown).toContain('\\|');
  });

  it('handles low priority recommendations correctly', () => {
    const report = createSampleReport({
      recommendations: [
        {
          id: 'rec-low',
          category: 'ASI10',
          priority: 'low',
          title: 'Low Priority Item',
          description: 'Not urgent',
        },
      ],
    });

    const markdown = exportToMarkdown(report);
    expect(markdown).toContain('[LOW]');
    expect(markdown).toContain('Low Priority Item');
  });

  it('handles all event types', () => {
    const report = createSampleReport({
      events: [
        { id: '1', timestamp: '2024-01-15T10:00:00Z', type: 'tool_call', summary: 'Tool' },
        { id: '2', timestamp: '2024-01-15T10:01:00Z', type: 'memory_access', summary: 'Memory' },
        { id: '3', timestamp: '2024-01-15T10:02:00Z', type: 'action', summary: 'Action' },
        { id: '4', timestamp: '2024-01-15T10:03:00Z', type: 'speech', summary: 'Speech' },
        { id: '5', timestamp: '2024-01-15T10:04:00Z', type: 'divergence', summary: 'Diverge' },
      ],
    });

    const markdown = exportToMarkdown(report);
    expect(markdown).toContain('Tool Call');
    expect(markdown).toContain('Memory Access');
    expect(markdown).toContain('Action');
    expect(markdown).toContain('Speech');
    expect(markdown).toContain('Divergence');
  });
});
