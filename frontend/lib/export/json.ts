/**
 * JSON export functionality for security reports
 *
 * Provides structured JSON export with versioning, metadata,
 * and format options for both reports and raw events.
 */

import type {
  ReportData,
  Recommendation,
  AnalysisEvent,
} from '@/components/reports/ReportViewer';
import type { Violation } from '@/components/reports/CategoryCard';

/**
 * Current schema version for exported JSON
 * Increment when making breaking changes to export format
 */
export const EXPORT_SCHEMA_VERSION = '1.0.0';

/**
 * Maximum safe export size in bytes (10MB)
 */
export const MAX_EXPORT_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Export type discriminator
 */
export type ExportType = 'report' | 'events';

/**
 * Metadata included in all exports
 */
export interface ExportMetadata {
  /** Schema version for forward compatibility */
  schemaVersion: string;
  /** Type of export */
  exportType: ExportType;
  /** ISO timestamp when export was created */
  exportedAt: string;
  /** Application name */
  source: string;
  /** Optional description */
  description?: string;
}

/**
 * Full report export structure
 */
export interface ReportExport {
  metadata: ExportMetadata;
  report: ReportData;
  summary: {
    totalViolations: number;
    maxSeverity: number;
    avgSeverity: number;
    categoriesTested: number;
    recommendationCount: number;
    eventCount: number;
  };
}

/**
 * Events-only export structure
 */
export interface EventsExport {
  metadata: ExportMetadata;
  sessionId: string;
  events: AnalysisEvent[];
  stats: {
    totalEvents: number;
    eventsByType: Record<string, number>;
    timeRange: {
      start: string | null;
      end: string | null;
    };
  };
}

/**
 * Configuration options for JSON export
 */
export interface JSONExportOptions {
  /** Pretty-print the JSON output (default: true) */
  prettyPrint?: boolean;
  /** Number of spaces for indentation (default: 2) */
  indentSpaces?: number;
  /** Include events in report export (default: true) */
  includeEvents?: boolean;
  /** Maximum number of events to include (default: 0 = all) */
  maxEvents?: number;
  /** Custom description for the export */
  description?: string;
}

/**
 * Default export options
 */
const DEFAULT_OPTIONS: Required<JSONExportOptions> = {
  prettyPrint: true,
  indentSpaces: 2,
  includeEvents: true,
  maxEvents: 0,
  description: '',
};

/**
 * Safely format a date string to ISO format
 */
export function formatDateISO(dateString: string | null | undefined): string | null {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[json-export] Invalid date string: "${dateString}"`);
      }
      return null;
    }
    return date.toISOString();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[json-export] Date parsing error: "${dateString}"`, error);
    }
    return null;
  }
}

/**
 * Format date for filename (YYYYMMDD-HHMMSS)
 */
export function formatDateForFilename(dateString: string | null | undefined): string {
  const formatIso = (iso: string): string => iso.replace(/\D/g, '').slice(0, 14);

  if (!dateString) {
    return formatIso(new Date().toISOString());
  }

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[json-export] Invalid date for filename, using current time: "${dateString}"`);
      }
      return formatIso(new Date().toISOString());
    }
    return formatIso(date.toISOString());
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[json-export] Date parsing error for filename: "${dateString}"`, error);
    }
    return formatIso(new Date().toISOString());
  }
}

/**
 * Generate filename for the exported JSON file
 */
export function generateFilename(
  reportId: string,
  exportType: ExportType,
  generatedAt?: string
): string {
  const timestamp = formatDateForFilename(generatedAt);
  const safeId = reportId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  return `${exportType === 'report' ? 'security-report' : 'events'}_${safeId}_${timestamp}.json`;
}

/**
 * Calculate report statistics from violations
 */
function calculateStats(violations: Violation[] | null | undefined): {
  totalViolations: number;
  maxSeverity: number;
  avgSeverity: number;
  categoriesTested: number;
} {
  if (!violations || !Array.isArray(violations)) {
    console.warn(
      '[json-export] calculateStats received invalid violations data:',
      { type: typeof violations, isArray: Array.isArray(violations) }
    );
    return {
      totalViolations: 0,
      maxSeverity: 0,
      avgSeverity: 0,
      categoriesTested: 0,
    };
  }

  const detected = violations.filter((v) => v && v.detected);
  const severities = detected.map((v) => v.severity ?? 0);

  const maxSeverity = severities.length > 0 ? Math.max(...severities) : 0;
  const avgSeverity =
    severities.length > 0
      ? severities.reduce((sum, s) => sum + s, 0) / severities.length
      : 0;

  const testedCategories = new Set(violations.map((v) => v.owasp_category));

  return {
    totalViolations: detected.length,
    maxSeverity,
    avgSeverity,
    categoriesTested: testedCategories.size,
  };
}

/**
 * Calculate event statistics
 */
function calculateEventStats(events: AnalysisEvent[]): EventsExport['stats'] {
  if (!events || !Array.isArray(events) || events.length === 0) {
    return {
      totalEvents: 0,
      eventsByType: {},
      timeRange: { start: null, end: null },
    };
  }

  // Count events by type
  const eventsByType: Record<string, number> = {};
  for (const event of events) {
    eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
  }

  // Find time range
  const timestamps = events
    .map((e) => e.timestamp)
    .filter(Boolean)
    .sort();

  return {
    totalEvents: events.length,
    eventsByType,
    timeRange: {
      start: timestamps.length > 0 ? timestamps[0] : null,
      end: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
    },
  };
}

/**
 * Create export metadata
 */
function createMetadata(
  exportType: ExportType,
  description?: string
): ExportMetadata {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportType,
    exportedAt: new Date().toISOString(),
    source: 'The Red Council Security Assessment Platform',
    ...(description && { description }),
  };
}

/**
 * Export report data to JSON format
 *
 * @param report - The report data to export
 * @param options - Export configuration options
 * @returns JSON string
 */
export function exportReportToJSON(
  report: ReportData,
  options: JSONExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate report
  if (!report) {
    throw new Error('Cannot export: No report data provided');
  }

  if (!report.id) {
    throw new Error('Cannot export: Report is missing required ID field');
  }

  // Prepare events (optionally limit)
  let events = report.events;
  if (opts.maxEvents > 0 && events.length > opts.maxEvents) {
    events = events.slice(0, opts.maxEvents);
  }

  // Calculate statistics
  const stats = calculateStats(report.violations);

  // Build export structure
  const exportData: ReportExport = {
    metadata: createMetadata('report', opts.description),
    report: opts.includeEvents
      ? { ...report, events }
      : { ...report, events: [] },
    summary: {
      ...stats,
      recommendationCount: report.recommendations?.length || 0,
      eventCount: opts.includeEvents ? events.length : 0,
    },
  };

  // Serialize with formatting options
  try {
    const json = opts.prettyPrint
      ? JSON.stringify(exportData, null, opts.indentSpaces)
      : JSON.stringify(exportData);

    // Check size
    const size = new Blob([json]).size;
    if (size > MAX_EXPORT_SIZE_BYTES) {
      console.warn(
        `[json-export] Export size (${(size / 1024 / 1024).toFixed(2)}MB) exceeds recommended limit (${MAX_EXPORT_SIZE_BYTES / 1024 / 1024}MB)`
      );
    }

    return json;
  } catch (error) {
    console.error('[json-export] Failed to serialize report:', error);
    throw new Error('Failed to serialize report to JSON');
  }
}

/**
 * Export events only to JSON format
 *
 * @param sessionId - The session ID for the events
 * @param events - The events to export
 * @param options - Export configuration options
 * @returns JSON string
 */
export function exportEventsToJSON(
  sessionId: string,
  events: AnalysisEvent[],
  options: JSONExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate inputs
  if (!sessionId) {
    throw new Error('Cannot export: No session ID provided');
  }

  if (!events || !Array.isArray(events)) {
    throw new Error('Cannot export: Events must be an array');
  }

  // Prepare events (optionally limit)
  let exportEvents = events;
  if (opts.maxEvents > 0 && events.length > opts.maxEvents) {
    exportEvents = events.slice(0, opts.maxEvents);
  }

  // Build export structure
  const exportData: EventsExport = {
    metadata: createMetadata('events', opts.description),
    sessionId,
    events: exportEvents,
    stats: calculateEventStats(exportEvents),
  };

  // Serialize with formatting options
  try {
    const json = opts.prettyPrint
      ? JSON.stringify(exportData, null, opts.indentSpaces)
      : JSON.stringify(exportData);

    // Check size
    const size = new Blob([json]).size;
    if (size > MAX_EXPORT_SIZE_BYTES) {
      console.warn(
        `[json-export] Export size (${(size / 1024 / 1024).toFixed(2)}MB) exceeds recommended limit (${MAX_EXPORT_SIZE_BYTES / 1024 / 1024}MB)`
      );
    }

    return json;
  } catch (error) {
    console.error('[json-export] Failed to serialize events:', error);
    throw new Error('Failed to serialize events to JSON');
  }
}

/**
 * Trigger a download of the JSON content
 *
 * @param content - The JSON content to download
 * @param filename - The filename for the download
 * @throws Error if download fails (e.g., browser environment not available)
 */
export function downloadJSON(content: string, filename: string): void {
  // Verify browser environment
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('downloadJSON requires a browser environment');
  }

  // Create blob
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });

  let url: string | null = null;
  let link: HTMLAnchorElement | null = null;

  try {
    // Create download link
    url = URL.createObjectURL(blob);
    link = document.createElement('a');
    link.href = url;
    link.download = filename;

    // Trigger download
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    console.error(
      '[json-export] Failed to trigger download:',
      { filename, contentLength: content.length },
      error
    );
    throw error;
  } finally {
    // Cleanup
    if (link && link.parentNode) {
      document.body.removeChild(link);
    }
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Export and download a report as JSON
 *
 * @param report - The report data to export
 * @param options - Export configuration options
 * @returns The filename that was used for the download
 * @throws Error if report data is invalid or download fails
 */
export function exportReportAsJSON(
  report: ReportData,
  options: JSONExportOptions = {}
): string {
  // Validate report
  if (!report) {
    throw new Error('Cannot export: No report data provided');
  }

  if (!report.id) {
    throw new Error('Cannot export: Report is missing required ID field');
  }

  try {
    const json = exportReportToJSON(report, options);
    const filename = generateFilename(report.id, 'report', report.generatedAt);
    downloadJSON(json, filename);

    if (process.env.NODE_ENV === 'development') {
      console.info(
        `[json-export] Successfully exported report: ${filename}`,
        { reportId: report.id, contentLength: json.length }
      );
    }

    return filename;
  } catch (error) {
    console.error(
      '[json-export] Failed to export report:',
      { reportId: report.id, title: report.title },
      error
    );
    throw error;
  }
}

/**
 * Export and download events as JSON
 *
 * @param sessionId - The session ID for the events
 * @param events - The events to export
 * @param options - Export configuration options
 * @returns The filename that was used for the download
 * @throws Error if data is invalid or download fails
 */
export function exportEventsAsJSON(
  sessionId: string,
  events: AnalysisEvent[],
  options: JSONExportOptions = {}
): string {
  // Validate inputs
  if (!sessionId) {
    throw new Error('Cannot export: No session ID provided');
  }

  if (!events || !Array.isArray(events)) {
    throw new Error('Cannot export: Events must be an array');
  }

  try {
    const json = exportEventsToJSON(sessionId, events, options);
    const filename = generateFilename(sessionId, 'events');
    downloadJSON(json, filename);

    if (process.env.NODE_ENV === 'development') {
      console.info(
        `[json-export] Successfully exported events: ${filename}`,
        { sessionId, eventCount: events.length }
      );
    }

    return filename;
  } catch (error) {
    console.error(
      '[json-export] Failed to export events:',
      { sessionId, eventCount: events?.length },
      error
    );
    throw error;
  }
}
