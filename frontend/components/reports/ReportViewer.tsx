'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Download,
  FileText,
  Grid3X3,
  Lightbulb,
  Printer,
  Activity,
  FileOutput,
} from 'lucide-react';
import {
  ReportSection,
  SectionNavItem,
  type ReportSectionId,
  type SectionConfig,
} from './ReportSection';
import { RiskGauge, RiskScoreCard, getRiskLevel, getRiskLevelLabel } from './RiskGauge';
import { OWASPGrid } from './OWASPGrid';
import type { Violation } from './CategoryCard';
import { escapeHtml } from '@/lib/utils';
import { OWASP_CATEGORIES } from '@/data/owasp-categories';
import { exportReportAsMarkdown } from '@/lib/export/markdown';
import { exportReportAsJSON } from '@/lib/export/json';
import { exportReportAsPDF } from '@/lib/export/pdf';

/**
 * Recommendation data structure
 */
export interface Recommendation {
  id: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  remediation?: string;
}

/**
 * Event data for analysis section
 */
export interface AnalysisEvent {
  id: string;
  timestamp: string;
  type: 'tool_call' | 'memory_access' | 'action' | 'speech' | 'divergence';
  severity?: number;
  summary: string;
  details?: string;
}

/**
 * Report data structure
 */
export interface ReportData {
  id: string;
  title: string;
  generatedAt: string;
  targetAgent: string;
  violations: Violation[];
  recommendations: Recommendation[];
  events: AnalysisEvent[];
  executiveSummary?: string;
}

/**
 * Section configuration for navigation
 */
const SECTION_CONFIGS: SectionConfig[] = [
  { id: 'executive-summary', label: 'Executive Summary', icon: FileText },
  { id: 'risk-score', label: 'Risk Score', icon: BarChart3 },
  { id: 'owasp-findings', label: 'OWASP Findings', icon: Grid3X3 },
  { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
  { id: 'event-analysis', label: 'Event Analysis', icon: Activity },
];

/**
 * Props for ReportViewer component
 */
export interface ReportViewerProps {
  /** Report data */
  report: ReportData;
  /** Whether to show the navigation sidebar (default: true) */
  showNav?: boolean;
  /** Whether to enable print mode (default: false) */
  printMode?: boolean;
  /** Callback when print is requested */
  onPrint?: () => void;
  /** Callback when markdown export is requested (receives filename) */
  onExportMarkdown?: (filename: string) => void;
  /** Callback when JSON export is requested (receives filename) */
  onExportJSON?: (filename: string) => void;
  /** Callback when PDF export is requested (receives suggested filename) */
  onExportPDF?: (filename: string) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Calculate report statistics from violations
 * Handles edge cases where violations may be null/undefined
 */
function calculateStats(violations: Violation[] | null | undefined) {
  // Defensive check for invalid violations data
  if (!violations || !Array.isArray(violations)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('calculateStats received invalid violations:', violations);
    }
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

  // Count unique categories that have been tested
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
 * Safely format a date string
 */
function formatDateSafe(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'Date unavailable';
  }
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Invalid date string:', dateString);
      }
      return 'Date unavailable';
    }
    return date.toLocaleString();
  } catch {
    return 'Date unavailable';
  }
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
 * Priority badge component
 */
const PriorityBadge = React.memo(function PriorityBadge({
  priority,
}: {
  priority: Recommendation['priority'];
}) {
  const variants: Record<Recommendation['priority'], { class: string; label: string }> = {
    critical: {
      class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      label: 'Critical',
    },
    high: {
      class: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      label: 'High',
    },
    medium: {
      class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      label: 'Medium',
    },
    low: {
      class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      label: 'Low',
    },
  };

  const config = variants[priority];

  return (
    <Badge variant="outline" className={config.class}>
      {config.label}
    </Badge>
  );
});

/**
 * Recommendation item component
 */
const RecommendationItem = React.memo(function RecommendationItem({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  return (
    <li className="border rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium">{escapeHtml(recommendation.title)}</h4>
        <PriorityBadge priority={recommendation.priority} />
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        {escapeHtml(recommendation.description)}
      </p>
      {recommendation.remediation && (
        <div className="mt-2 p-2 bg-muted rounded text-sm">
          <span className="font-medium">Remediation: </span>
          {escapeHtml(recommendation.remediation)}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Category: {recommendation.category}
      </p>
    </li>
  );
});

/**
 * Event item component
 */
const EventItem = React.memo(function EventItem({
  event,
}: {
  event: AnalysisEvent;
}) {
  const typeIcons: Record<AnalysisEvent['type'], React.ReactNode> = {
    tool_call: <Activity className="h-4 w-4 text-blue-500" aria-hidden="true" />,
    memory_access: <Activity className="h-4 w-4 text-purple-500" aria-hidden="true" />,
    action: <Activity className="h-4 w-4 text-green-500" aria-hidden="true" />,
    speech: <Activity className="h-4 w-4 text-orange-500" aria-hidden="true" />,
    divergence: <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden="true" />,
  };

  const typeLabels: Record<AnalysisEvent['type'], string> = {
    tool_call: 'Tool Call',
    memory_access: 'Memory Access',
    action: 'Action',
    speech: 'Speech',
    divergence: 'Divergence',
  };

  return (
    <li className="flex gap-3 py-2 border-b last:border-b-0">
      <div className="flex-shrink-0 mt-1">{typeIcons[event.type]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{typeLabels[event.type]}</span>
          {event.severity !== undefined && event.severity > 0 && (
            <Badge variant="secondary" className="text-xs">
              Severity: {event.severity}/10
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{event.timestamp}</span>
        </div>
        <p className="text-sm">{escapeHtml(event.summary)}</p>
        {event.details && (
          <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
            {escapeHtml(event.details)}
          </pre>
        )}
      </div>
    </li>
  );
});

/**
 * Section-based report viewer with navigation sidebar
 */
export const ReportViewer = React.memo(function ReportViewer({
  report,
  showNav = true,
  printMode = false,
  onPrint,
  onExportMarkdown,
  onExportJSON,
  onExportPDF,
  className,
}: ReportViewerProps) {
  const [activeSection, setActiveSection] = useState<ReportSectionId>('executive-summary');
  const [highlightedSection, setHighlightedSection] = useState<ReportSectionId | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<ReportSectionId>>(
    new Set(['executive-summary', 'risk-score', 'owasp-findings', 'recommendations', 'event-analysis'])
  );

  // Calculate stats
  const stats = useMemo(() => calculateStats(report.violations), [report.violations]);

  // Get executive summary
  const executiveSummary = useMemo(
    () => report.executiveSummary || generateDefaultSummary(stats),
    [report.executiveSummary, stats]
  );

  // Sort recommendations by priority
  const sortedRecommendations = useMemo(() => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...report.recommendations].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }, [report.recommendations]);

  // Handle section navigation
  const handleSectionClick = useCallback((sectionId: ReportSectionId) => {
    setActiveSection(sectionId);
    setHighlightedSection(sectionId);

    // Scroll to section
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Clear highlight after animation
    setTimeout(() => setHighlightedSection(null), 2000);
  }, []);

  // Handle section expand/collapse
  const handleSectionExpandChange = useCallback(
    (sectionId: ReportSectionId) => (expanded: boolean) => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (expanded) {
          next.add(sectionId);
        } else {
          next.delete(sectionId);
        }
        return next;
      });
    },
    []
  );

  // Handle print
  const handlePrint = useCallback(() => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  }, [onPrint]);

  // Handle markdown export
  const handleExportMarkdown = useCallback(() => {
    try {
      const filename = exportReportAsMarkdown(report);
      onExportMarkdown?.(filename);
    } catch (error) {
      // Log but don't crash - let the download fail gracefully
      console.error('Failed to export markdown:', error);
    }
  }, [report, onExportMarkdown]);

  // Handle JSON export
  const handleExportJSON = useCallback(() => {
    try {
      const filename = exportReportAsJSON(report);
      onExportJSON?.(filename);
    } catch (error) {
      // Log but don't crash - let the download fail gracefully
      console.error('Failed to export JSON:', error);
    }
  }, [report, onExportJSON]);

  // Handle PDF export
  const handleExportPDF = useCallback(() => {
    try {
      const filename = exportReportAsPDF(report);
      onExportPDF?.(filename);
    } catch (error) {
      // Log but don't crash - let the export fail gracefully
      console.error('Failed to export PDF:', error);
    }
  }, [report, onExportPDF]);

  // Track active section on scroll
  useEffect(() => {
    if (printMode) return;

    const handleScroll = () => {
      const sections = SECTION_CONFIGS.map((config) =>
        document.getElementById(config.id)
      ).filter(Boolean) as HTMLElement[];

      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 100 && rect.bottom > 100) {
          setActiveSection(section.id as ReportSectionId);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [printMode]);

  return (
    <div
      className={cn(
        'flex gap-6',
        printMode && 'print:block print:gap-0',
        className
      )}
    >
      {/* Navigation sidebar */}
      {showNav && !printMode && (
        <aside
          className="hidden lg:block w-56 flex-shrink-0 sticky top-4 h-fit"
          aria-label="Report navigation"
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sections</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <nav>
                <ul className="space-y-1 p-2" role="list">
                  {SECTION_CONFIGS.map((config) => (
                    <SectionNavItem
                      key={config.id}
                      sectionId={config.id}
                      label={config.label}
                      icon={config.icon}
                      isActive={activeSection === config.id}
                      onClick={handleSectionClick}
                    />
                  ))}
                </ul>
              </nav>

              <Separator />

              <div className="p-2 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleExportMarkdown}
                >
                  <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                  Export Markdown
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleExportJSON}
                >
                  <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                  Export JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleExportPDF}
                >
                  <FileOutput className="h-4 w-4 mr-2" aria-hidden="true" />
                  Export PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handlePrint}
                >
                  <Printer className="h-4 w-4 mr-2" aria-hidden="true" />
                  Print Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 space-y-4 print:space-y-6">
        {/* Report header */}
        <header className="mb-6 print:mb-4">
          <h1 className="text-2xl font-bold mb-2">{escapeHtml(report.title)}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Target: {escapeHtml(report.targetAgent)}</span>
            <span aria-hidden="true">•</span>
            <time dateTime={report.generatedAt}>
              Generated: {formatDateSafe(report.generatedAt)}
            </time>
          </div>
        </header>

        {/* Executive Summary */}
        <ReportSection
          id="executive-summary"
          title="Executive Summary"
          icon={FileText}
          expanded={expandedSections.has('executive-summary')}
          onExpandedChange={handleSectionExpandChange('executive-summary')}
          highlighted={highlightedSection === 'executive-summary'}
          printMode={printMode}
        >
          <div className="flex items-start gap-4">
            {stats.maxSeverity > 0 ? (
              <AlertCircle
                className="h-6 w-6 text-amber-500 flex-shrink-0"
                aria-hidden="true"
              />
            ) : (
              <CheckCircle
                className="h-6 w-6 text-green-500 flex-shrink-0"
                aria-hidden="true"
              />
            )}
            <p className="text-muted-foreground">{escapeHtml(executiveSummary)}</p>
          </div>
        </ReportSection>

        {/* Risk Score */}
        <ReportSection
          id="risk-score"
          title="Risk Score"
          icon={BarChart3}
          expanded={expandedSections.has('risk-score')}
          onExpandedChange={handleSectionExpandChange('risk-score')}
          highlighted={highlightedSection === 'risk-score'}
          printMode={printMode}
        >
          <RiskScoreCard
            maxSeverity={stats.maxSeverity}
            avgSeverity={stats.avgSeverity}
            totalViolations={stats.totalViolations}
            categoriesTested={stats.categoriesTested}
          />
        </ReportSection>

        {/* OWASP Findings */}
        <ReportSection
          id="owasp-findings"
          title="OWASP Agentic Top 10 Findings"
          icon={Grid3X3}
          expanded={expandedSections.has('owasp-findings')}
          onExpandedChange={handleSectionExpandChange('owasp-findings')}
          highlighted={highlightedSection === 'owasp-findings'}
          printMode={printMode}
        >
          <OWASPGrid
            violations={report.violations}
            showLayoutToggle={!printMode}
            showCoverageStats={true}
            layout={printMode ? 'list' : 'grid'}
          />
        </ReportSection>

        {/* Recommendations */}
        <ReportSection
          id="recommendations"
          title="Recommendations"
          icon={Lightbulb}
          expanded={expandedSections.has('recommendations')}
          onExpandedChange={handleSectionExpandChange('recommendations')}
          highlighted={highlightedSection === 'recommendations'}
          printMode={printMode}
        >
          {sortedRecommendations.length > 0 ? (
            <ul className="space-y-3" role="list">
              {sortedRecommendations.map((rec) => (
                <RecommendationItem key={rec.id} recommendation={rec} />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No specific recommendations at this time. Continue following security best
              practices.
            </p>
          )}
        </ReportSection>

        {/* Event Analysis */}
        <ReportSection
          id="event-analysis"
          title="Event Analysis"
          icon={Activity}
          expanded={expandedSections.has('event-analysis')}
          onExpandedChange={handleSectionExpandChange('event-analysis')}
          highlighted={highlightedSection === 'event-analysis'}
          printMode={printMode}
        >
          {report.events.length > 0 ? (
            <ScrollArea className="max-h-96 print:max-h-none">
              <ul role="list">
                {report.events.map((event) => (
                  <EventItem key={event.id} event={event} />
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground">
              No events recorded during this assessment.
            </p>
          )}
        </ReportSection>
      </main>
    </div>
  );
});
