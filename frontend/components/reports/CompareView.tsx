'use client';

import React, { useMemo } from 'react';
import { cn, escapeHtml } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  Shield,
  Calendar,
} from 'lucide-react';
import { type ReportData } from './ReportViewer';
import {
  getRiskLevel,
  getRiskLevelLabel,
  getRiskLevelColors,
  type RiskLevel,
} from './RiskGauge';
import { OWASP_CATEGORIES } from '@/data/owasp-categories';
import { type Violation } from './CategoryCard';

export interface CompareViewProps {
  baseReport: ReportData;
  targetReport: ReportData;
  className?: string;
}

type CategoryStatus = 'passed' | 'failed' | 'warning' | 'not_tested';
type StatusChange = 'improved' | 'regressed' | 'same' | 'neutral';

// Helper to calculate statistics
function calculateReportStats(report: ReportData) {
  const detected = report.violations.filter((v) => v.detected);
  const severities = detected.map((v) => v.severity ?? 0);
  const maxSeverity = severities.length > 0 ? Math.max(...severities) : 0;
  
  return {
    maxSeverity,
    violationCount: detected.length,
    riskLevel: getRiskLevel(maxSeverity),
  };
}

// Helper to get category status
function getCategoryStatus(violations: Violation[], categoryId: string): CategoryStatus {
  const catViolations = violations.filter((v) => v.owasp_category === categoryId);
  if (catViolations.length === 0) return 'not_tested';
  
  const detectedViolations = catViolations.filter((v) => v.detected);
  if (detectedViolations.length === 0) return 'passed';
  
  // Check max severity of DETECTED violations only
  const severities = detectedViolations.map((v) => v.severity ?? 0);
  const maxSeverity = Math.max(...severities);
  
  return maxSeverity >= 4 ? 'failed' : 'warning';
}

function formatDate(dateString: string) {
  if (!dateString) return 'Unknown Date';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('CompareView: Invalid date string:', dateString);
      }
      return 'Unknown Date';
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Unknown Date';
  }
}

/**
 * Compare two reports side-by-side
 */
export const CompareView = React.memo(function CompareView({
  baseReport,
  targetReport,
  className,
}: CompareViewProps) {
  const baseStats = useMemo(() => calculateReportStats(baseReport), [baseReport]);
  const targetStats = useMemo(() => calculateReportStats(targetReport), [targetReport]);

  const diffSeverity = targetStats.maxSeverity - baseStats.maxSeverity;
  const diffViolations = targetStats.violationCount - baseStats.violationCount;

  // Comparison logic per category
  const categoryComparison = useMemo(() => {
    return OWASP_CATEGORIES.map((cat) => {
      const baseStatus = getCategoryStatus(baseReport.violations, cat.code);
      const targetStatus = getCategoryStatus(targetReport.violations, cat.code);
      
      let statusChange: StatusChange = 'neutral';
      
      if (baseStatus === targetStatus) {
        statusChange = 'same';
      } else if (targetStatus === 'passed' && (baseStatus === 'failed' || baseStatus === 'warning')) {
        statusChange = 'improved';
      } else if ((targetStatus === 'failed' || targetStatus === 'warning') && baseStatus === 'passed') {
        statusChange = 'regressed';
      } else if (targetStatus === 'failed' && baseStatus === 'warning') {
        statusChange = 'regressed';
      } else if (targetStatus === 'warning' && baseStatus === 'failed') {
        statusChange = 'improved';
      }

      return {
        ...cat,
        baseStatus,
        targetStatus,
        statusChange,
      };
    });
  }, [baseReport.violations, targetReport.violations]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Base Report */}
        <Card className="border-l-4 border-l-muted">
          <CardHeader className="pb-2">
            <div className="text-sm text-muted-foreground font-medium uppercase tracking-wider mb-1">Base Report</div>
            <CardTitle className="text-lg line-clamp-1" title={escapeHtml(baseReport.title)}>
              {escapeHtml(baseReport.title)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span>{escapeHtml(baseReport.targetAgent)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <time dateTime={baseReport.generatedAt}>{formatDate(baseReport.generatedAt)}</time>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <RiskBadge severity={baseStats.maxSeverity} />
              <span className="text-muted-foreground">
                ({baseStats.violationCount} violations)
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Target Report */}
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <div className="text-sm text-primary font-medium uppercase tracking-wider mb-1">Target Report</div>
            <CardTitle className="text-lg line-clamp-1" title={escapeHtml(targetReport.title)}>
              {escapeHtml(targetReport.title)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span>{escapeHtml(targetReport.targetAgent)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <time dateTime={targetReport.generatedAt}>{formatDate(targetReport.generatedAt)}</time>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <RiskBadge severity={targetStats.maxSeverity} />
              <span className="text-muted-foreground">
                ({targetStats.violationCount} violations)
              </span>
              
              {/* Delta Badges */}
              {diffSeverity !== 0 && (
                <Badge 
                  variant={diffSeverity > 0 ? 'destructive' : 'default'} 
                  className="ml-auto"
                  aria-label={`${diffSeverity > 0 ? 'Increased' : 'Decreased'} risk by ${Math.abs(diffSeverity).toFixed(1)}`}
                >
                  {diffSeverity > 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                  Risk {Math.abs(diffSeverity).toFixed(1)}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Category Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
              <div className="col-span-6 md:col-span-4">Category</div>
              <div className="col-span-3 md:col-span-3 text-center">Base</div>
              <div className="hidden md:block md:col-span-1 text-center"></div>
              <div className="col-span-3 md:col-span-3 text-center">Target</div>
              <div className="hidden md:block md:col-span-1 text-center">Diff</div>
            </div>
            
            <ul className="space-y-3">
              {categoryComparison.map((cat) => (
                <li key={cat.code} className="grid grid-cols-12 gap-2 items-center text-sm p-2 rounded-md hover:bg-muted/50">
                  {/* Category Name */}
                  <div className="col-span-6 md:col-span-4 font-medium flex flex-col">
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">{cat.code}</Badge>
                      <span className="truncate" title={cat.name}>{cat.name}</span>
                    </span>
                  </div>

                  {/* Base Status */}
                  <div className="col-span-3 md:col-span-3 flex justify-center">
                    <StatusIcon status={cat.baseStatus} />
                  </div>

                  {/* Arrow (Desktop) */}
                  <div className="hidden md:flex md:col-span-1 justify-center text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                  </div>

                  {/* Target Status */}
                  <div className="col-span-3 md:col-span-3 flex justify-center">
                    <StatusIcon status={cat.targetStatus} />
                  </div>

                  {/* Diff (Desktop) */}
                  <div className="hidden md:flex md:col-span-1 justify-center">
                    {cat.statusChange === 'improved' && <Badge variant="default" className="bg-green-600 hover:bg-green-700">Better</Badge>}
                    {cat.statusChange === 'regressed' && <Badge variant="destructive">Worse</Badge>}
                    {cat.statusChange === 'same' && <span className="text-muted-foreground" aria-label="No change">-</span>}
                    {cat.statusChange === 'neutral' && <span className="text-muted-foreground" aria-label="No change">-</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

// Sub-components

function RiskBadge({ severity }: { severity: number }) {
  const level = getRiskLevel(severity);
  const label = getRiskLevelLabel(level);
  const colors = getRiskLevelColors(level);
  
  return (
    <Badge variant="outline" className={cn(colors.bg, colors.text)}>
      {label} ({severity.toFixed(1)})
    </Badge>
  );
}

function StatusIcon({ status }: { status: CategoryStatus }) {
  const labelMap: Record<CategoryStatus, string> = {
    passed: 'Passed',
    failed: 'Failed',
    warning: 'Warning',
    not_tested: 'Not Tested',
  };
  const label = labelMap[status];

  switch (status) {
    case 'passed':
      return <div role="status" aria-label={label} className="flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" /> <span className="hidden sm:inline">Pass</span></div>;
    case 'failed':
      return <div role="status" aria-label={label} className="flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4" /> <span className="hidden sm:inline">Fail</span></div>;
    case 'warning':
      return <div role="status" aria-label={label} className="flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" /> <span className="hidden sm:inline">Warn</span></div>;
    default:
      return <div role="status" aria-label={label} className="flex items-center gap-1 text-muted-foreground"><Minus className="h-4 w-4" /> <span className="hidden sm:inline">N/A</span></div>;
  }
}
