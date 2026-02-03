/**
 * Markdown export functionality for security reports
 *
 * Generates well-formatted markdown documents from ReportData,
 * suitable for sharing, documentation, and archiving.
 */

import type {
  ReportData,
  Recommendation,
  AnalysisEvent,
} from '@/components/reports/ReportViewer';
import type { Violation } from '@/components/reports/CategoryCard';
import { OWASP_CATEGORIES, OWASP_CATEGORY_MAP } from '@/data/owasp-categories';
import { getRiskLevel, getRiskLevelLabel } from '@/components/reports/RiskGauge';

/**
 * Configuration options for markdown export
 */
export interface MarkdownExportOptions {
  /** Include table of contents (default: true) */
  includeToc?: boolean;
  /** Include metadata header (default: true) */
  includeMetadata?: boolean;
  /** Include event analysis section (default: true) */
  includeEvents?: boolean;
  /** Maximum number of events to include (default: 100, 0 for all) */
  maxEvents?: number;
}

/**
 * Default export options
 */
const DEFAULT_OPTIONS: Required<MarkdownExportOptions> = {
  includeToc: true,
  includeMetadata: true,
  includeEvents: true,
  maxEvents: 100,
};

/**
 * Escape special markdown characters in text
 * Prevents accidental markdown formatting in user content
 */
export function escapeMarkdown(text: string | null | undefined): string {
  if (!text) return '';

  // Escape special markdown characters
  return text
    .replace(/\\/g, '\\\\') // backslash first
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!')
    .replace(/`/g, '\\`')
    .replace(/\|/g, '\\|')
    .replace(/>/g, '\\>')
    .replace(/</g, '\\<');
}

/**
 * Format a date string for the report
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Date unavailable';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[markdown-export] Invalid date string: "${dateString}"`);
      }
      return 'Date unavailable';
    }
    return date.toISOString();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[markdown-export] Date parsing error: "${dateString}"`, error);
    }
    return 'Date unavailable';
  }
}

/**
 * Format date for filename (YYYYMMDD-HHMMSS)
 */
export function formatDateForFilename(dateString: string | null | undefined): string {
  // Helper to format an ISO string for filename (remove all non-digits, take first 14 chars)
  const formatIso = (iso: string): string => iso.replace(/\D/g, '').slice(0, 14);

  if (!dateString) {
    return formatIso(new Date().toISOString());
  }

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[markdown-export] Invalid date for filename, using current time: "${dateString}"`);
      }
      return formatIso(new Date().toISOString());
    }
    return formatIso(date.toISOString());
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[markdown-export] Date parsing error for filename: "${dateString}"`, error);
    }
    return formatIso(new Date().toISOString());
  }
}

/**
 * Generate filename for the exported report
 */
export function generateFilename(report: ReportData): string {
  const timestamp = formatDateForFilename(report.generatedAt);
  const safeId = report.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  return `security-report_${safeId}_${timestamp}.md`;
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
    // Log warning for security tool - invalid violations data is concerning
    console.warn(
      '[markdown-export] calculateStats received invalid violations data:',
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
  const validCategories = [...testedCategories].filter((cat) =>
    OWASP_CATEGORIES.some((c) => c.code === cat)
  );

  return {
    totalViolations: detected.length,
    maxSeverity,
    avgSeverity,
    categoriesTested: validCategories.length,
  };
}

/**
 * Generate default executive summary
 */
function generateDefaultSummary(stats: ReturnType<typeof calculateStats>): string {
  const riskLevel = getRiskLevel(stats.maxSeverity);

  if (stats.totalViolations === 0) {
    return `Security assessment completed successfully. No vulnerabilities were detected across ${stats.categoriesTested} OWASP Agentic Top 10 categories tested. The agent demonstrates strong security posture.`;
  }

  return `Security assessment identified ${stats.totalViolations} vulnerability${stats.totalViolations !== 1 ? 'ies' : 'y'} across ${stats.categoriesTested} OWASP Agentic Top 10 categories. The overall risk level is ${getRiskLevelLabel(riskLevel).toLowerCase()} with a maximum severity of ${stats.maxSeverity.toFixed(1)}/10 and average severity of ${stats.avgSeverity.toFixed(1)}/10. Review the findings below and address high-priority recommendations.`;
}

/**
 * Generate markdown table of contents
 */
function generateTableOfContents(includeEvents: boolean): string {
  const sections = [
    '1. [Executive Summary](#executive-summary)',
    '2. [Risk Score](#risk-score)',
    '3. [OWASP Findings](#owasp-agentic-top-10-findings)',
    '4. [Recommendations](#recommendations)',
  ];

  if (includeEvents) {
    sections.push('5. [Event Analysis](#event-analysis)');
  }

  return `## Table of Contents

${sections.join('\n')}

---

`;
}

/**
 * Generate metadata header section
 */
function generateMetadataSection(report: ReportData): string {
  return `---
title: ${escapeMarkdown(report.title)}
generated_at: ${formatDate(report.generatedAt)}
target_agent: ${escapeMarkdown(report.targetAgent)}
report_id: ${escapeMarkdown(report.id)}
---

`;
}

/**
 * Generate executive summary section
 */
function generateExecutiveSummarySection(
  report: ReportData,
  stats: ReturnType<typeof calculateStats>
): string {
  const summary = report.executiveSummary || generateDefaultSummary(stats);

  return `## Executive Summary

${escapeMarkdown(summary)}

`;
}

/**
 * Generate risk score section
 */
function generateRiskScoreSection(stats: ReturnType<typeof calculateStats>): string {
  const riskLevel = getRiskLevel(stats.maxSeverity);
  const riskLabel = getRiskLevelLabel(riskLevel);

  return `## Risk Score

| Metric | Value |
|--------|-------|
| **Risk Level** | ${riskLabel} |
| **Maximum Severity** | ${stats.maxSeverity.toFixed(1)}/10 |
| **Average Severity** | ${stats.avgSeverity.toFixed(1)}/10 |
| **Total Violations** | ${stats.totalViolations} |
| **Categories Tested** | ${stats.categoriesTested}/10 |

`;
}

/**
 * Generate OWASP findings section
 */
function generateOWASPFindingsSection(violations: Violation[] | null | undefined): string {
  if (!violations || !Array.isArray(violations) || violations.length === 0) {
    return `## OWASP Agentic Top 10 Findings

No violations recorded.

`;
  }

  // Group violations by category
  const violationsByCategory = new Map<string, Violation[]>();
  for (const violation of violations) {
    const cat = violation.owasp_category || 'UNKNOWN';
    if (!violationsByCategory.has(cat)) {
      violationsByCategory.set(cat, []);
    }
    violationsByCategory.get(cat)!.push(violation);
  }

  // Build findings table
  let output = `## OWASP Agentic Top 10 Findings

| Category | Status | Severity | Description |
|----------|--------|----------|-------------|
`;

  // Add row for each OWASP category
  for (const category of OWASP_CATEGORIES) {
    const categoryViolations = violationsByCategory.get(category.code) || [];
    const detected = categoryViolations.filter((v) => v.detected);

    let status: string;
    let severity: string;

    if (categoryViolations.length === 0) {
      status = 'Not Tested';
      severity = '-';
    } else if (detected.length === 0) {
      status = 'Passed';
      severity = '0';
    } else {
      const maxSeverity = Math.max(...detected.map((v) => v.severity));
      status = maxSeverity >= 4 ? 'Detected' : 'Warning';
      severity = maxSeverity.toFixed(1);
    }

    output += `| ${category.code}: ${escapeMarkdown(category.name)} | ${status} | ${severity} | ${escapeMarkdown(category.shortDescription)} |\n`;
  }

  // Add detailed findings for detected violations
  const detectedViolations = violations.filter((v) => v.detected);
  if (detectedViolations.length > 0) {
    output += `\n### Detailed Findings\n\n`;

    for (const violation of detectedViolations) {
      const category = OWASP_CATEGORY_MAP[violation.owasp_category];
      const categoryName = category
        ? `${category.code}: ${category.name}`
        : violation.owasp_category;

      output += `#### ${escapeMarkdown(categoryName)} (Severity: ${violation.severity.toFixed(1)}/10)\n\n`;
      output += `**Evidence:**\n\n\`\`\`\n${violation.evidence || 'No evidence provided'}\n\`\`\`\n\n`;

      if (violation.recommendation) {
        output += `**Recommendation:** ${escapeMarkdown(violation.recommendation)}\n\n`;
      }
    }
  }

  return output;
}

/**
 * Get priority emoji for visual indication
 */
function getPriorityIndicator(priority: Recommendation['priority']): string {
  switch (priority) {
    case 'critical':
      return '[CRITICAL]';
    case 'high':
      return '[HIGH]';
    case 'medium':
      return '[MEDIUM]';
    case 'low':
      return '[LOW]';
    default:
      return '';
  }
}

/**
 * Generate recommendations section
 */
function generateRecommendationsSection(recommendations: Recommendation[]): string {
  if (!recommendations || recommendations.length === 0) {
    return `## Recommendations

No specific recommendations at this time. Continue following security best practices.

`;
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...recommendations].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );

  let output = `## Recommendations

`;

  // Summary table
  output += `| # | Priority | Title | Category |
|---|----------|-------|----------|
`;

  sorted.forEach((rec, index) => {
    output += `| ${index + 1} | ${getPriorityIndicator(rec.priority)} | ${escapeMarkdown(rec.title)} | ${escapeMarkdown(rec.category)} |\n`;
  });

  output += `\n### Details\n\n`;

  // Detailed recommendations
  for (const rec of sorted) {
    output += `#### ${getPriorityIndicator(rec.priority)} ${escapeMarkdown(rec.title)}\n\n`;
    output += `**Category:** ${escapeMarkdown(rec.category)}\n\n`;
    output += `${escapeMarkdown(rec.description)}\n\n`;

    if (rec.remediation) {
      output += `**Remediation:**\n\n${escapeMarkdown(rec.remediation)}\n\n`;
    }
  }

  return output;
}

/**
 * Get event type label
 */
function getEventTypeLabel(type: AnalysisEvent['type']): string {
  const labels: Record<AnalysisEvent['type'], string> = {
    tool_call: 'Tool Call',
    memory_access: 'Memory Access',
    action: 'Action',
    speech: 'Speech',
    divergence: 'Divergence',
  };
  return labels[type] || type;
}

/**
 * Generate event analysis section
 */
function generateEventAnalysisSection(
  events: AnalysisEvent[],
  maxEvents: number
): string {
  if (!events || events.length === 0) {
    return `## Event Analysis

No events recorded during this assessment.

`;
  }

  const truncated = maxEvents > 0 && events.length > maxEvents;
  const displayEvents = truncated ? events.slice(0, maxEvents) : events;

  let output = `## Event Analysis

`;

  if (truncated) {
    output += `> **Note:** Showing first ${maxEvents} of ${events.length} events.\n\n`;
  }

  // Summary table
  output += `| Timestamp | Type | Severity | Summary |
|-----------|------|----------|---------|
`;

  for (const event of displayEvents) {
    const severity = event.severity !== undefined && event.severity > 0
      ? `${event.severity}/10`
      : '-';

    // Truncate summary for table
    const shortSummary = event.summary.length > 60
      ? event.summary.slice(0, 57) + '...'
      : event.summary;

    output += `| ${escapeMarkdown(event.timestamp)} | ${getEventTypeLabel(event.type)} | ${severity} | ${escapeMarkdown(shortSummary)} |\n`;
  }

  // Add detailed events section for those with details
  const eventsWithDetails = displayEvents.filter((e) => e.details);
  if (eventsWithDetails.length > 0) {
    output += `\n### Event Details\n\n`;

    for (const event of eventsWithDetails) {
      output += `#### ${getEventTypeLabel(event.type)} (${escapeMarkdown(event.timestamp)})\n\n`;
      output += `${escapeMarkdown(event.summary)}\n\n`;

      if (event.details) {
        output += `\`\`\`\n${event.details}\n\`\`\`\n\n`;
      }
    }
  }

  return output;
}

/**
 * Generate footer section
 */
function generateFooterSection(generatedAt: string): string {
  return `---

*Report generated by The Red Council Security Assessment Platform*
*Generated: ${formatDate(generatedAt)}*
`;
}

/**
 * Export report data to markdown format
 *
 * @param report - The report data to export
 * @param options - Export configuration options
 * @returns Formatted markdown string
 */
export function exportToMarkdown(
  report: ReportData,
  options: MarkdownExportOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Calculate statistics
  const stats = calculateStats(report.violations);

  // Build markdown document
  let markdown = '';

  // Report title
  markdown += `# ${escapeMarkdown(report.title)}\n\n`;

  // Metadata header
  if (opts.includeMetadata) {
    markdown += generateMetadataSection(report);
  }

  // Table of contents
  if (opts.includeToc) {
    markdown += generateTableOfContents(opts.includeEvents);
  }

  // Executive summary
  markdown += generateExecutiveSummarySection(report, stats);

  // Risk score
  markdown += generateRiskScoreSection(stats);

  // OWASP findings
  markdown += generateOWASPFindingsSection(report.violations);

  // Recommendations
  markdown += generateRecommendationsSection(report.recommendations);

  // Event analysis
  if (opts.includeEvents) {
    markdown += generateEventAnalysisSection(report.events, opts.maxEvents);
  }

  // Footer
  markdown += generateFooterSection(report.generatedAt);

  return markdown;
}

/**
 * Trigger a download of the markdown content
 *
 * @param content - The markdown content to download
 * @param filename - The filename for the download
 * @throws Error if download fails (e.g., browser environment not available)
 */
export function downloadMarkdown(content: string, filename: string): void {
  // Verify browser environment
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('downloadMarkdown requires a browser environment');
  }

  // Create blob with UTF-8 BOM for better compatibility
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/markdown;charset=utf-8' });

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
      '[markdown-export] Failed to trigger download:',
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
 * Export and download a report as markdown
 *
 * @param report - The report data to export
 * @param options - Export configuration options
 * @returns The filename that was used for the download
 * @throws Error if report data is invalid or download fails
 */
export function exportReportAsMarkdown(
  report: ReportData,
  options: MarkdownExportOptions = {}
): string {
  // Validate report
  if (!report) {
    throw new Error('Cannot export: No report data provided');
  }

  if (!report.id) {
    throw new Error('Cannot export: Report is missing required ID field');
  }

  try {
    const markdown = exportToMarkdown(report, options);
    const filename = generateFilename(report);
    downloadMarkdown(markdown, filename);

    if (process.env.NODE_ENV === 'development') {
      console.info(
        `[markdown-export] Successfully exported report: ${filename}`,
        { reportId: report.id, contentLength: markdown.length }
      );
    }

    return filename;
  } catch (error) {
    console.error(
      '[markdown-export] Failed to export report:',
      { reportId: report.id, title: report.title },
      error
    );
    throw error;
  }
}
