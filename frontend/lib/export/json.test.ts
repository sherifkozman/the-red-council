import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EXPORT_SCHEMA_VERSION,
  MAX_EXPORT_SIZE_BYTES,
  formatDateISO,
  formatDateForFilename,
  generateFilename,
  exportReportToJSON,
  exportEventsToJSON,
  downloadJSON,
  exportReportAsJSON,
  exportEventsAsJSON,
  type JSONExportOptions,
  type ReportExport,
  type EventsExport,
} from './json';
import type { ReportData, AnalysisEvent } from '@/components/reports/ReportViewer';

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

function createSampleEvents(): AnalysisEvent[] {
  return [
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
    },
    {
      id: 'evt-3',
      timestamp: '2024-01-15T10:00:10Z',
      type: 'memory_access',
      summary: 'Read from user_preferences',
    },
  ];
}

describe('constants', () => {
  it('exports schema version', () => {
    expect(EXPORT_SCHEMA_VERSION).toBe('1.0.0');
  });

  it('exports max size limit', () => {
    expect(MAX_EXPORT_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('formatDateISO', () => {
  it('returns null for null/undefined', () => {
    expect(formatDateISO(null)).toBeNull();
    expect(formatDateISO(undefined)).toBeNull();
  });

  it('returns ISO string for valid date', () => {
    const result = formatDateISO('2024-01-15T10:30:00Z');
    expect(result).toBe('2024-01-15T10:30:00.000Z');
  });

  it('returns null for invalid date', () => {
    expect(formatDateISO('not-a-date')).toBeNull();
    expect(formatDateISO('invalid')).toBeNull();
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
  it('generates filename for report with ID and timestamp', () => {
    const filename = generateFilename('test-123', 'report', '2024-01-15T10:30:00Z');
    expect(filename).toMatch(/^security-report_test-123_\d+\.json$/);
  });

  it('generates filename for events', () => {
    const filename = generateFilename('session-456', 'events');
    expect(filename).toMatch(/^events_session-456_\d+\.json$/);
  });

  it('sanitizes report ID with special characters', () => {
    const filename = generateFilename('report/with:special@chars', 'report');
    expect(filename).not.toContain('/');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('@');
    expect(filename).toContain('report_with_special_chars');
  });

  it('truncates long report IDs', () => {
    const longId = 'a'.repeat(100);
    const filename = generateFilename(longId, 'report');
    // ID should be truncated to 50 chars
    expect(filename.split('_')[1]).toHaveLength(50);
  });
});

describe('exportReportToJSON', () => {
  it('exports report with correct structure', () => {
    const report = createSampleReport();
    const json = exportReportToJSON(report);
    const parsed: ReportExport = JSON.parse(json);

    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(parsed.metadata.exportType).toBe('report');
    expect(parsed.metadata.source).toContain('Red Council');
    expect(parsed.report).toBeDefined();
    expect(parsed.summary).toBeDefined();
  });

  it('includes correct summary statistics', () => {
    const report = createSampleReport();
    const json = exportReportToJSON(report);
    const parsed: ReportExport = JSON.parse(json);

    expect(parsed.summary.totalViolations).toBe(2); // 2 detected
    expect(parsed.summary.maxSeverity).toBe(8);
    expect(parsed.summary.recommendationCount).toBe(2);
    expect(parsed.summary.eventCount).toBe(2);
  });

  it('pretty-prints by default', () => {
    const report = createSampleReport();
    const json = exportReportToJSON(report);

    // Pretty-printed JSON has newlines
    expect(json).toContain('\n');
    expect(json).toContain('  '); // 2-space indent
  });

  it('minifies when prettyPrint is false', () => {
    const report = createSampleReport();
    const json = exportReportToJSON(report, { prettyPrint: false });

    // Minified JSON has no newlines (except in values)
    expect(json.split('\n').length).toBe(1);
  });

  it('uses custom indent spaces', () => {
    const report = createSampleReport();
    const json = exportReportToJSON(report, { indentSpaces: 4 });

    expect(json).toContain('    '); // 4-space indent
  });

  it('excludes events when includeEvents is false', () => {
    const report = createSampleReport();
    const json = exportReportToJSON(report, { includeEvents: false });
    const parsed: ReportExport = JSON.parse(json);

    expect(parsed.report.events).toHaveLength(0);
    expect(parsed.summary.eventCount).toBe(0);
  });

  it('limits events when maxEvents is set', () => {
    const manyEvents = Array.from({ length: 100 }, (_, i) => ({
      id: `evt-${i}`,
      timestamp: `2024-01-15T10:${String(i).padStart(2, '0')}:00Z`,
      type: 'tool_call' as const,
      summary: `Event ${i}`,
    }));

    const report = createSampleReport({ events: manyEvents });
    const json = exportReportToJSON(report, { maxEvents: 10 });
    const parsed: ReportExport = JSON.parse(json);

    expect(parsed.report.events).toHaveLength(10);
    expect(parsed.summary.eventCount).toBe(10);
  });

  it('includes custom description', () => {
    const report = createSampleReport();
    const json = exportReportToJSON(report, { description: 'Weekly security audit' });
    const parsed: ReportExport = JSON.parse(json);

    expect(parsed.metadata.description).toBe('Weekly security audit');
  });

  it('throws error for null report', () => {
    expect(() => exportReportToJSON(null as unknown as ReportData)).toThrow(
      'Cannot export: No report data provided'
    );
  });

  it('throws error for report without ID', () => {
    const report = createSampleReport({ id: '' });
    expect(() => exportReportToJSON(report)).toThrow(
      'Cannot export: Report is missing required ID field'
    );
  });

  it('handles null violations gracefully', () => {
    const report = createSampleReport({ violations: null as unknown as any });
    const json = exportReportToJSON(report);
    const parsed: ReportExport = JSON.parse(json);

    expect(parsed.summary.totalViolations).toBe(0);
  });
});

describe('exportEventsToJSON', () => {
  it('exports events with correct structure', () => {
    const events = createSampleEvents();
    const json = exportEventsToJSON('session-123', events);
    const parsed: EventsExport = JSON.parse(json);

    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(parsed.metadata.exportType).toBe('events');
    expect(parsed.sessionId).toBe('session-123');
    expect(parsed.events).toHaveLength(3);
    expect(parsed.stats).toBeDefined();
  });

  it('calculates correct event statistics', () => {
    const events = createSampleEvents();
    const json = exportEventsToJSON('session-123', events);
    const parsed: EventsExport = JSON.parse(json);

    expect(parsed.stats.totalEvents).toBe(3);
    expect(parsed.stats.eventsByType.tool_call).toBe(1);
    expect(parsed.stats.eventsByType.divergence).toBe(1);
    expect(parsed.stats.eventsByType.memory_access).toBe(1);
    expect(parsed.stats.timeRange.start).toBe('2024-01-15T10:00:00Z');
    expect(parsed.stats.timeRange.end).toBe('2024-01-15T10:00:10Z');
  });

  it('limits events when maxEvents is set', () => {
    const events = createSampleEvents();
    const json = exportEventsToJSON('session-123', events, { maxEvents: 2 });
    const parsed: EventsExport = JSON.parse(json);

    expect(parsed.events).toHaveLength(2);
    expect(parsed.stats.totalEvents).toBe(2);
  });

  it('throws error for missing session ID', () => {
    const events = createSampleEvents();
    expect(() => exportEventsToJSON('', events)).toThrow(
      'Cannot export: No session ID provided'
    );
  });

  it('throws error for invalid events', () => {
    expect(() => exportEventsToJSON('session-123', null as unknown as any)).toThrow(
      'Cannot export: Events must be an array'
    );
  });

  it('handles empty events array', () => {
    const json = exportEventsToJSON('session-123', []);
    const parsed: EventsExport = JSON.parse(json);

    expect(parsed.events).toHaveLength(0);
    expect(parsed.stats.totalEvents).toBe(0);
    expect(parsed.stats.timeRange.start).toBeNull();
    expect(parsed.stats.timeRange.end).toBeNull();
  });
});

describe('downloadJSON', () => {
  let createObjectURLMock: any;
  let revokeObjectURLMock: any;
  let appendChildMock: any;
  let removeChildMock: any;
  let clickMock: any;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url') as any;
    revokeObjectURLMock = vi.fn() as any;
    appendChildMock = vi.fn() as any;
    removeChildMock = vi.fn() as any;
    clickMock = vi.fn() as any;

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildMock);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildMock);

    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = clickMock;
      }
      return element;
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates blob with correct type', () => {
    downloadJSON('{"test": true}', 'test.json');

    expect(createObjectURLMock).toHaveBeenCalled();
    const blobArg = createObjectURLMock.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('application/json;charset=utf-8');
  });

  it('creates download link with correct attributes', () => {
    downloadJSON('{"test": true}', 'test-file.json');

    expect(appendChildMock).toHaveBeenCalled();
    const link = appendChildMock.mock.calls[0][0];
    expect(link.href).toBe('blob:test-url');
    expect(link.download).toBe('test-file.json');
  });

  it('triggers click on the link', () => {
    downloadJSON('{"test": true}', 'test.json');

    expect(clickMock).toHaveBeenCalled();
  });

  it('cleans up after download', () => {
    // Make appendChild set parentNode so removeChild is called
    appendChildMock.mockImplementation((node: HTMLElement) => {
      Object.defineProperty(node, 'parentNode', { value: document.body, configurable: true });
      return node;
    });

    downloadJSON('{"test": true}', 'test.json');

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

    expect(() => downloadJSON('{"test": true}', 'test.json')).toThrow('Click failed');
    expect(removeChildMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test-url');
  });
});

describe('exportReportAsJSON', () => {
  let createObjectURLMock: any;
  let revokeObjectURLMock: any;
  let appendChildMock: any;
  let removeChildMock: any;
  let clickMock: any;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url') as any;
    revokeObjectURLMock = vi.fn() as any;
    appendChildMock = vi.fn() as any;
    removeChildMock = vi.fn() as any;
    clickMock = vi.fn() as any;

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildMock);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildMock);

    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = clickMock;
      }
      return element;
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports report and returns filename', () => {
    const report = createSampleReport();
    const filename = exportReportAsJSON(report);

    expect(filename).toMatch(/^security-report_test-report-123_\d+\.json$/);
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
  });

  it('passes options to exportReportToJSON', () => {
    const report = createSampleReport();
    exportReportAsJSON(report, { includeEvents: false });

    // Get the blob content
    const blob = createObjectURLMock.mock.calls[0][0];

    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const parsed: ReportExport = JSON.parse(content);
        expect(parsed.report.events).toHaveLength(0);
        resolve();
      };
      reader.readAsText(blob);
    });
  });

  it('throws error for null report', () => {
    expect(() => exportReportAsJSON(null as unknown as ReportData)).toThrow(
      'Cannot export: No report data provided'
    );
  });

  it('throws error for report without ID', () => {
    const report = createSampleReport({ id: '' });
    expect(() => exportReportAsJSON(report)).toThrow(
      'Cannot export: Report is missing required ID field'
    );
  });
});

describe('exportEventsAsJSON', () => {
  let createObjectURLMock: any;
  let revokeObjectURLMock: any;
  let appendChildMock: any;
  let removeChildMock: any;
  let clickMock: any;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue('blob:test-url') as any;
    revokeObjectURLMock = vi.fn() as any;
    appendChildMock = vi.fn() as any;
    removeChildMock = vi.fn() as any;
    clickMock = vi.fn() as any;

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildMock);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildMock);

    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = clickMock;
      }
      return element;
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports events and returns filename', () => {
    const events = createSampleEvents();
    const filename = exportEventsAsJSON('session-123', events);

    expect(filename).toMatch(/^events_session-123_\d+\.json$/);
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
  });

  it('throws error for missing session ID', () => {
    const events = createSampleEvents();
    expect(() => exportEventsAsJSON('', events)).toThrow(
      'Cannot export: No session ID provided'
    );
  });

  it('throws error for null events', () => {
    expect(() => exportEventsAsJSON('session-123', null as unknown as any)).toThrow(
      'Cannot export: Events must be an array'
    );
  });
});

describe('edge cases', () => {
  it('handles report with empty arrays', () => {
    const report: ReportData = {
      id: 'minimal',
      title: 'Minimal Report',
      generatedAt: '',
      targetAgent: '',
      violations: [],
      recommendations: [],
      events: [],
    };

    const json = exportReportToJSON(report);
    const parsed: ReportExport = JSON.parse(json);

    expect(parsed.summary.totalViolations).toBe(0);
    expect(parsed.summary.recommendationCount).toBe(0);
    expect(parsed.summary.eventCount).toBe(0);
  });

  it('handles violations with missing severity', () => {
    const report = createSampleReport({
      violations: [
        {
          detected: true,
          severity: undefined as unknown as number,
          evidence: 'Test',
          recommendation: '',
          owasp_category: 'ASI01',
        },
      ],
    });

    const json = exportReportToJSON(report);
    const parsed: ReportExport = JSON.parse(json);

    // Should default to 0 for missing severity
    expect(parsed.summary.maxSeverity).toBe(0);
    expect(parsed.summary.avgSeverity).toBe(0);
  });

  it('handles events with empty timestamps', () => {
    const events: AnalysisEvent[] = [
      {
        id: 'evt-1',
        timestamp: '',
        type: 'tool_call',
        summary: 'Test event',
      },
    ];

    const json = exportEventsToJSON('session-123', events);
    const parsed: EventsExport = JSON.parse(json);

    expect(parsed.stats.timeRange.start).toBeNull();
    expect(parsed.stats.timeRange.end).toBeNull();
  });

  it('handles all event types in statistics', () => {
    const events: AnalysisEvent[] = [
      { id: '1', timestamp: '2024-01-15T10:00:00Z', type: 'tool_call', summary: 'Tool' },
      { id: '2', timestamp: '2024-01-15T10:01:00Z', type: 'memory_access', summary: 'Memory' },
      { id: '3', timestamp: '2024-01-15T10:02:00Z', type: 'action', summary: 'Action' },
      { id: '4', timestamp: '2024-01-15T10:03:00Z', type: 'speech', summary: 'Speech' },
      { id: '5', timestamp: '2024-01-15T10:04:00Z', type: 'divergence', summary: 'Diverge' },
    ];

    const json = exportEventsToJSON('session-123', events);
    const parsed: EventsExport = JSON.parse(json);

    expect(parsed.stats.eventsByType.tool_call).toBe(1);
    expect(parsed.stats.eventsByType.memory_access).toBe(1);
    expect(parsed.stats.eventsByType.action).toBe(1);
    expect(parsed.stats.eventsByType.speech).toBe(1);
    expect(parsed.stats.eventsByType.divergence).toBe(1);
  });

  it('generates valid JSON that can be parsed', () => {
    const report = createSampleReport();
    const json = exportReportToJSON(report);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('handles special characters in report content', () => {
    const report = createSampleReport({
      title: 'Report with "quotes" and <brackets> & ampersands',
      violations: [
        {
          detected: true,
          severity: 5,
          evidence: 'Evidence with\nnewlines\tand\ttabs',
          recommendation: 'Fix\r\ncarriage returns',
          owasp_category: 'ASI01',
        },
      ],
    });

    const json = exportReportToJSON(report);
    const parsed: ReportExport = JSON.parse(json);

    expect(parsed.report.title).toContain('quotes');
    expect(parsed.report.violations[0].evidence).toContain('newlines');
  });
});
