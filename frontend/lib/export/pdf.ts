/**
 * PDF export functionality for security reports
 *
 * Uses browser print-to-PDF capabilities with optimized print styles.
 * This approach avoids heavy dependencies like @react-pdf/renderer
 * while providing professional-looking PDF output.
 */

import type {
  ReportData,
  Recommendation,
  AnalysisEvent,
} from '@/components/reports/ReportViewer';
import type { Violation } from '@/components/reports/CategoryCard';
import { OWASP_CATEGORIES } from '@/data/owasp-categories';

/**
 * PDF export version for tracking
 */
export const PDF_EXPORT_VERSION = '1.0.0';

/**
 * Configuration options for PDF export
 */
export interface PDFExportOptions {
  /** Include header with branding (default: true) */
  includeHeader?: boolean;
  /** Include footer with page numbers (default: true) */
  includeFooter?: boolean;
  /** Include events section (default: true) */
  includeEvents?: boolean;
  /** Maximum number of events to include (default: 0 = all) */
  maxEvents?: number;
  /** Paper size for print (default: 'A4') */
  paperSize?: 'A4' | 'Letter';
  /** Include table of contents (default: true) */
  includeTableOfContents?: boolean;
}

/**
 * Default export options
 */
const DEFAULT_OPTIONS: Required<PDFExportOptions> = {
  includeHeader: true,
  includeFooter: true,
  includeEvents: true,
  maxEvents: 0,
  paperSize: 'A4',
  includeTableOfContents: true,
};

/**
 * Risk level thresholds and labels
 */
const RISK_LEVELS = [
  { threshold: 0, label: 'None', color: '#22c55e' },
  { threshold: 1, label: 'Low', color: '#84cc16' },
  { threshold: 4, label: 'Medium', color: '#eab308' },
  { threshold: 7, label: 'High', color: '#f97316' },
  { threshold: 9, label: 'Critical', color: '#ef4444' },
] as const;

/**
 * Get risk level info based on severity
 */
export function getRiskLevelInfo(severity: number): { label: string; color: string } {
  for (let i = RISK_LEVELS.length - 1; i >= 0; i--) {
    if (severity >= RISK_LEVELS[i].threshold) {
      return RISK_LEVELS[i];
    }
  }
  return RISK_LEVELS[0];
}

/**
 * Safely escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string | null | undefined): string {
  if (text === null || text === undefined) {
    return '';
  }
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format date for display
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Date unavailable';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[pdf-export] Invalid date string: "${dateString}"`);
      }
      return 'Date unavailable';
    }
    return date.toLocaleString();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[pdf-export] Date parsing error: "${dateString}"`, error);
    }
    return 'Date unavailable';
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
      return formatIso(new Date().toISOString());
    }
    return formatIso(date.toISOString());
  } catch {
    return formatIso(new Date().toISOString());
  }
}

/**
 * Generate filename for PDF export
 */
export function generateFilename(
  reportId: string,
  generatedAt?: string
): string {
  const timestamp = formatDateForFilename(generatedAt);
  const safeId = reportId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  return `security-report_${safeId}_${timestamp}.pdf`;
}

/**
 * Calculate report statistics from violations
 */
export function calculateStats(violations: Violation[] | null | undefined): {
  totalViolations: number;
  maxSeverity: number;
  avgSeverity: number;
  categoriesTested: number;
} {
  if (!violations || !Array.isArray(violations)) {
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
 * Get OWASP category name by code
 */
function getCategoryName(code: string): string {
  const category = OWASP_CATEGORIES.find((c) => c.code === code);
  return category ? category.name : code;
}

/**
 * Priority order for sorting recommendations
 */
const PRIORITY_ORDER: Record<Recommendation['priority'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Priority colors for styling
 */
const PRIORITY_COLORS: Record<Recommendation['priority'], string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
};

/**
 * Event type labels and colors
 */
const EVENT_TYPES: Record<AnalysisEvent['type'], { label: string; color: string }> = {
  tool_call: { label: 'Tool Call', color: '#3b82f6' },
  memory_access: { label: 'Memory Access', color: '#a855f7' },
  action: { label: 'Action', color: '#22c55e' },
  speech: { label: 'Speech', color: '#f97316' },
  divergence: { label: 'Divergence', color: '#ef4444' },
};

/**
 * Generate print-optimized HTML for PDF export
 */
export function generatePrintHTML(
  report: ReportData,
  options: PDFExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const stats = calculateStats(report.violations);
  const riskInfo = getRiskLevelInfo(stats.maxSeverity);

  // Sort recommendations by priority
  const sortedRecommendations = [...report.recommendations].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );

  // Limit events if needed
  let events = report.events;
  if (opts.maxEvents > 0 && events.length > opts.maxEvents) {
    events = events.slice(0, opts.maxEvents);
  }

  // Generate sections
  const sections: string[] = [];

  // Header with branding
  if (opts.includeHeader) {
    sections.push(`
      <header class="report-header">
        <div class="branding">
          <h1 class="brand-title">The Red Council</h1>
          <p class="brand-subtitle">Security Assessment Platform</p>
        </div>
        <div class="report-meta">
          <h2 class="report-title">${escapeHtml(report.title)}</h2>
          <p class="report-info">
            <strong>Target Agent:</strong> ${escapeHtml(report.targetAgent)}<br>
            <strong>Generated:</strong> ${formatDate(report.generatedAt)}<br>
            <strong>Report ID:</strong> ${escapeHtml(report.id)}
          </p>
        </div>
      </header>
    `);
  }

  // Table of Contents
  if (opts.includeTableOfContents) {
    sections.push(`
      <section class="toc page-break-after">
        <h2>Table of Contents</h2>
        <ul class="toc-list">
          <li><a href="#executive-summary">1. Executive Summary</a></li>
          <li><a href="#risk-score">2. Risk Score</a></li>
          <li><a href="#owasp-findings">3. OWASP Agentic Top 10 Findings</a></li>
          <li><a href="#recommendations">4. Recommendations</a></li>
          ${opts.includeEvents ? '<li><a href="#event-analysis">5. Event Analysis</a></li>' : ''}
        </ul>
      </section>
    `);
  }

  // Executive Summary
  const summaryText = report.executiveSummary || generateDefaultSummary(stats);
  sections.push(`
    <section id="executive-summary" class="report-section page-break-before">
      <h2>1. Executive Summary</h2>
      <div class="summary-content">
        <div class="summary-icon ${stats.maxSeverity > 0 ? 'warning' : 'success'}">
          ${stats.maxSeverity > 0 ? '⚠️' : '✓'}
        </div>
        <p>${escapeHtml(summaryText)}</p>
      </div>
    </section>
  `);

  // Risk Score
  sections.push(`
    <section id="risk-score" class="report-section page-break-before">
      <h2>2. Risk Score</h2>
      <div class="risk-dashboard">
        <div class="risk-gauge">
          <div class="risk-score" style="color: ${riskInfo.color}">
            ${stats.maxSeverity.toFixed(1)}
          </div>
          <div class="risk-label">${riskInfo.label} Risk</div>
        </div>
        <div class="risk-stats">
          <div class="stat-item">
            <span class="stat-value">${stats.totalViolations}</span>
            <span class="stat-label">Vulnerabilities</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${stats.avgSeverity.toFixed(1)}</span>
            <span class="stat-label">Avg Severity</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${stats.categoriesTested}</span>
            <span class="stat-label">Categories Tested</span>
          </div>
        </div>
      </div>
    </section>
  `);

  // OWASP Findings
  const findingsHTML = report.violations
    .filter((v) => v.detected)
    .map((v) => {
      const severityInfo = getRiskLevelInfo(v.severity);
      return `
        <tr>
          <td>${escapeHtml(v.owasp_category)}</td>
          <td>${escapeHtml(getCategoryName(v.owasp_category))}</td>
          <td style="color: ${severityInfo.color}">${v.severity.toFixed(1)}</td>
          <td>${escapeHtml(v.evidence || 'N/A')}</td>
        </tr>
      `;
    })
    .join('');

  sections.push(`
    <section id="owasp-findings" class="report-section page-break-before">
      <h2>3. OWASP Agentic Top 10 Findings</h2>
      ${
        findingsHTML
          ? `
        <table class="findings-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Category</th>
              <th>Severity</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            ${findingsHTML}
          </tbody>
        </table>
      `
          : '<p class="no-data">No vulnerabilities detected. The agent demonstrates strong security posture.</p>'
      }
    </section>
  `);

  // Recommendations
  const recommendationsHTML = sortedRecommendations
    .map((rec) => {
      const priorityColor = PRIORITY_COLORS[rec.priority];
      return `
        <div class="recommendation-item">
          <div class="recommendation-header">
            <span class="recommendation-title">${escapeHtml(rec.title)}</span>
            <span class="priority-badge" style="background-color: ${priorityColor}">
              ${rec.priority.toUpperCase()}
            </span>
          </div>
          <p class="recommendation-desc">${escapeHtml(rec.description)}</p>
          ${
            rec.remediation
              ? `<div class="remediation"><strong>Remediation:</strong> ${escapeHtml(rec.remediation)}</div>`
              : ''
          }
          <p class="recommendation-category">Category: ${escapeHtml(rec.category)}</p>
        </div>
      `;
    })
    .join('');

  sections.push(`
    <section id="recommendations" class="report-section page-break-before">
      <h2>4. Recommendations</h2>
      ${
        recommendationsHTML
          ? `<div class="recommendations-list">${recommendationsHTML}</div>`
          : '<p class="no-data">No specific recommendations. Continue following security best practices.</p>'
      }
    </section>
  `);

  // Event Analysis
  if (opts.includeEvents) {
    const eventsHTML = events
      .map((event) => {
        const eventType = EVENT_TYPES[event.type];
        return `
          <div class="event-item">
            <div class="event-header">
              <span class="event-type" style="color: ${eventType.color}">${eventType.label}</span>
              ${event.severity !== undefined && event.severity > 0 ? `<span class="event-severity">Severity: ${event.severity}/10</span>` : ''}
              <span class="event-timestamp">${escapeHtml(event.timestamp)}</span>
            </div>
            <p class="event-summary">${escapeHtml(event.summary)}</p>
            ${event.details ? `<pre class="event-details">${escapeHtml(event.details)}</pre>` : ''}
          </div>
        `;
      })
      .join('');

    sections.push(`
      <section id="event-analysis" class="report-section page-break-before">
        <h2>5. Event Analysis</h2>
        ${
          eventsHTML
            ? `<div class="events-list">${eventsHTML}</div>`
            : '<p class="no-data">No events recorded during this assessment.</p>'
        }
      </section>
    `);
  }

  // Footer
  if (opts.includeFooter) {
    sections.push(`
      <footer class="report-footer">
        <p>Generated by The Red Council Security Assessment Platform</p>
        <p>Report Version: ${PDF_EXPORT_VERSION} | Export Date: ${new Date().toISOString()}</p>
      </footer>
    `);
  }

  // Build complete HTML document
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.title)} - Security Report</title>
  <style>
    ${getPrintStyles(opts.paperSize)}
  </style>
</head>
<body>
  <div class="print-container">
    ${sections.join('\n')}
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate default executive summary
 */
function generateDefaultSummary(stats: ReturnType<typeof calculateStats>): string {
  const riskInfo = getRiskLevelInfo(stats.maxSeverity);

  if (stats.totalViolations === 0) {
    return `Security assessment completed successfully. No vulnerabilities were detected across ${stats.categoriesTested} OWASP Agentic Top 10 categories tested. The agent demonstrates strong security posture.`;
  }

  return `Security assessment identified ${stats.totalViolations} vulnerability${stats.totalViolations !== 1 ? 'ies' : 'y'} across ${stats.categoriesTested} OWASP Agentic Top 10 categories. The overall risk level is ${riskInfo.label.toLowerCase()} with a maximum severity of ${stats.maxSeverity.toFixed(1)}/10 and average severity of ${stats.avgSeverity.toFixed(1)}/10. Review the findings below and address high-priority recommendations.`;
}

/**
 * Get print-optimized CSS styles
 */
function getPrintStyles(paperSize: 'A4' | 'Letter'): string {
  return `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    @page {
      size: ${paperSize};
      margin: 2cm;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #1f2937;
      background: white;
    }

    .print-container {
      max-width: 100%;
    }

    /* Page breaks */
    .page-break-before {
      page-break-before: always;
    }

    .page-break-after {
      page-break-after: always;
    }

    .no-break {
      page-break-inside: avoid;
    }

    /* Header */
    .report-header {
      border-bottom: 2px solid #dc2626;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .branding {
      text-align: center;
      margin-bottom: 20px;
    }

    .brand-title {
      font-size: 24pt;
      color: #dc2626;
      margin: 0;
    }

    .brand-subtitle {
      font-size: 12pt;
      color: #6b7280;
      margin-top: 5px;
    }

    .report-title {
      font-size: 18pt;
      color: #111827;
      margin-bottom: 10px;
    }

    .report-info {
      font-size: 10pt;
      color: #4b5563;
    }

    /* Table of Contents */
    .toc h2 {
      font-size: 16pt;
      margin-bottom: 15px;
      color: #111827;
    }

    .toc-list {
      list-style: none;
      padding: 0;
    }

    .toc-list li {
      padding: 8px 0;
      border-bottom: 1px dotted #d1d5db;
    }

    .toc-list a {
      color: #1f2937;
      text-decoration: none;
    }

    /* Sections */
    .report-section {
      margin-bottom: 30px;
    }

    .report-section h2 {
      font-size: 16pt;
      color: #111827;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }

    /* Summary */
    .summary-content {
      display: flex;
      gap: 15px;
      align-items: flex-start;
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
    }

    .summary-icon {
      font-size: 24pt;
      flex-shrink: 0;
    }

    .summary-icon.warning {
      color: #f59e0b;
    }

    .summary-icon.success {
      color: #22c55e;
    }

    /* Risk Dashboard */
    .risk-dashboard {
      display: flex;
      gap: 30px;
      align-items: center;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .risk-gauge {
      text-align: center;
      min-width: 120px;
    }

    .risk-score {
      font-size: 36pt;
      font-weight: bold;
    }

    .risk-label {
      font-size: 12pt;
      color: #6b7280;
    }

    .risk-stats {
      display: flex;
      gap: 30px;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      display: block;
      font-size: 24pt;
      font-weight: bold;
      color: #111827;
    }

    .stat-label {
      font-size: 10pt;
      color: #6b7280;
    }

    /* Findings Table */
    .findings-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
    }

    .findings-table th,
    .findings-table td {
      border: 1px solid #e5e7eb;
      padding: 10px;
      text-align: left;
    }

    .findings-table th {
      background: #f3f4f6;
      font-weight: 600;
    }

    .findings-table tr:nth-child(even) {
      background: #f9fafb;
    }

    /* Recommendations */
    .recommendations-list {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .recommendation-item {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
      page-break-inside: avoid;
    }

    .recommendation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .recommendation-title {
      font-weight: 600;
      font-size: 11pt;
    }

    .priority-badge {
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 9pt;
      font-weight: 600;
    }

    .recommendation-desc {
      font-size: 10pt;
      color: #4b5563;
      margin-bottom: 10px;
    }

    .remediation {
      background: #f3f4f6;
      padding: 10px;
      border-radius: 4px;
      font-size: 10pt;
      margin-bottom: 10px;
    }

    .recommendation-category {
      font-size: 9pt;
      color: #6b7280;
    }

    /* Events */
    .events-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .event-item {
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
      page-break-inside: avoid;
    }

    .event-header {
      display: flex;
      gap: 15px;
      align-items: center;
      margin-bottom: 5px;
    }

    .event-type {
      font-weight: 600;
      font-size: 10pt;
    }

    .event-severity {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9pt;
    }

    .event-timestamp {
      font-size: 9pt;
      color: #6b7280;
    }

    .event-summary {
      font-size: 10pt;
    }

    .event-details {
      background: #f3f4f6;
      padding: 10px;
      border-radius: 4px;
      font-size: 9pt;
      font-family: monospace;
      overflow-x: auto;
      white-space: pre-wrap;
      margin-top: 5px;
    }

    /* Footer */
    .report-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 9pt;
      color: #6b7280;
    }

    /* No data message */
    .no-data {
      color: #6b7280;
      font-style: italic;
      padding: 20px;
      text-align: center;
      background: #f9fafb;
      border-radius: 8px;
    }

    /* Print-specific adjustments */
    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .report-header {
        page-break-after: avoid;
      }

      .findings-table {
        page-break-inside: auto;
      }

      .findings-table tr {
        page-break-inside: avoid;
      }
    }
  `;
}

/**
 * Open print dialog for PDF export using a secure iframe approach
 *
 * Creates a blob URL from the HTML content and opens it in a new window,
 * then triggers the browser's print dialog which allows saving as PDF.
 * This approach avoids using document.write() which has XSS risks.
 *
 * @param report - The report data to export
 * @param options - Export configuration options
 * @throws Error if browser environment not available
 */
export function printReportAsPDF(
  report: ReportData,
  options: PDFExportOptions = {}
): void {
  // Verify browser environment
  if (typeof window === 'undefined') {
    throw new Error('printReportAsPDF requires a browser environment');
  }

  // Validate report
  if (!report) {
    throw new Error('Cannot export: No report data provided');
  }

  if (!report.id) {
    throw new Error('Cannot export: Report is missing required ID field');
  }

  try {
    const html = generatePrintHTML(report, options);

    // Create blob from HTML content (safer than document.write)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    // Open print window with blob URL
    const printWindow = window.open(blobUrl, '_blank', 'width=800,height=600');
    if (!printWindow) {
      URL.revokeObjectURL(blobUrl);
      throw new Error('Failed to open print window. Pop-up may be blocked.');
    }

    // Clean up blob URL after window loads and prints
    const cleanup = () => {
      URL.revokeObjectURL(blobUrl);
    };

    // Wait for content to load then print
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      // Clean up after a delay to allow print dialog to work
      setTimeout(cleanup, 1000);
    };

    // Handle window close
    printWindow.onbeforeunload = cleanup;

    // Also try triggering print for browsers that don't fire onload
    setTimeout(() => {
      if (printWindow && !printWindow.closed) {
        printWindow.focus();
        printWindow.print();
      }
    }, 500);

    if (process.env.NODE_ENV === 'development') {
      console.info(
        '[pdf-export] Opened print dialog for report:',
        { reportId: report.id, title: report.title }
      );
    }
  } catch (error) {
    console.error('[pdf-export] Failed to export report:', error);
    throw error;
  }
}

/**
 * Export report as PDF using the print dialog
 *
 * Convenience wrapper that handles common options.
 *
 * @param report - The report data to export
 * @param options - Export configuration options
 * @returns The suggested filename for the PDF
 * @throws Error if export fails
 */
export function exportReportAsPDF(
  report: ReportData,
  options: PDFExportOptions = {}
): string {
  // Validate report
  if (!report) {
    throw new Error('Cannot export: No report data provided');
  }

  if (!report.id) {
    throw new Error('Cannot export: Report is missing required ID field');
  }

  printReportAsPDF(report, options);

  // Return suggested filename (user will choose actual name in print dialog)
  return generateFilename(report.id, report.generatedAt);
}
