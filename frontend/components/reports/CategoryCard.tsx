'use client';

import React, { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Shield,
} from 'lucide-react';
import type { OWASPCategory } from '@/data/owasp-categories';
import { escapeHtml } from '@/lib/utils';

/**
 * Violation data structure matching backend ViolationResult
 */
export interface Violation {
  detected: boolean;
  severity: number;
  evidence: string;
  recommendation: string;
  owasp_category: string;
}

/**
 * Status of an OWASP category based on test results
 */
export type CategoryStatus = 'detected' | 'warning' | 'passed' | 'not_tested';

/**
 * Warning severity threshold - severities below this are warnings, at or above are detections
 */
export const WARNING_SEVERITY_THRESHOLD = 4;

/**
 * Get the status of a category based on its violations
 */
export function getCategoryStatus(
  violations: Violation[],
  warningSeverityThreshold: number = WARNING_SEVERITY_THRESHOLD
): CategoryStatus {
  const detectedViolations = violations.filter((v) => v.detected);

  if (violations.length === 0) {
    return 'not_tested';
  }

  if (detectedViolations.length === 0) {
    return 'passed';
  }

  // Find max severity among detected violations
  const maxSeverity = Math.max(...detectedViolations.map((v) => v.severity));

  if (maxSeverity >= warningSeverityThreshold) {
    return 'detected';
  }

  return 'warning';
}

/**
 * Get status color class based on category status
 */
export function getStatusColorClass(status: CategoryStatus): string {
  switch (status) {
    case 'detected':
      return 'bg-red-100 border-red-300 dark:bg-red-900/30 dark:border-red-800';
    case 'warning':
      return 'bg-yellow-100 border-yellow-300 dark:bg-yellow-900/30 dark:border-yellow-800';
    case 'passed':
      return 'bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-800';
    case 'not_tested':
    default:
      return 'bg-gray-100 border-gray-300 dark:bg-gray-800/50 dark:border-gray-700';
  }
}

/**
 * Get status icon component based on category status
 */
export function getStatusIcon(status: CategoryStatus): React.ReactNode {
  const iconProps = { className: 'h-5 w-5', 'aria-hidden': true };

  switch (status) {
    case 'detected':
      return <AlertCircle {...iconProps} className="h-5 w-5 text-red-600 dark:text-red-400" />;
    case 'warning':
      return <AlertTriangle {...iconProps} className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
    case 'passed':
      return <CheckCircle {...iconProps} className="h-5 w-5 text-green-600 dark:text-green-400" />;
    case 'not_tested':
    default:
      return <HelpCircle {...iconProps} className="h-5 w-5 text-gray-500 dark:text-gray-400" />;
  }
}

/**
 * Get status label text
 */
export function getStatusLabel(status: CategoryStatus): string {
  switch (status) {
    case 'detected':
      return 'Detected';
    case 'warning':
      return 'Warning';
    case 'passed':
      return 'Passed';
    case 'not_tested':
    default:
      return 'Not Tested';
  }
}

/**
 * Props for CategoryCard component
 */
export interface CategoryCardProps {
  /** OWASP category data */
  category: OWASPCategory;
  /** Violations for this category */
  violations: Violation[];
  /** Warning severity threshold (default: 4) */
  warningSeverityThreshold?: number;
  /** Whether the card starts expanded */
  defaultExpanded?: boolean;
  /** Callback when card is clicked */
  onClick?: (categoryCode: string) => void;
  /** Additional class names */
  className?: string;
}

/**
 * ViolationItem sub-component for rendering individual violations
 */
const ViolationItem = React.memo(function ViolationItem({
  violation,
  index,
}: {
  violation: Violation;
  index: number;
}) {
  return (
    <div
      className={cn(
        'border-l-2 pl-3 py-2',
        violation.severity >= WARNING_SEVERITY_THRESHOLD
          ? 'border-red-400'
          : 'border-yellow-400'
      )}
      role="listitem"
    >
      <div className="flex items-center gap-2 mb-1">
        <Badge
          variant={violation.severity >= 7 ? 'destructive' : 'secondary'}
          className="text-xs"
        >
          Severity: {violation.severity}/10
        </Badge>
      </div>

      {violation.evidence && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Evidence:</p>
          <pre
            className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32"
            aria-label={`Evidence for violation ${index + 1}`}
          >
            {escapeHtml(violation.evidence)}
          </pre>
        </div>
      )}

      {violation.recommendation && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation:</p>
          <p className="text-xs text-muted-foreground">{escapeHtml(violation.recommendation)}</p>
        </div>
      )}
    </div>
  );
});

/**
 * CategoryCard component for displaying OWASP category results
 */
export const CategoryCard = React.memo(function CategoryCard({
  category,
  violations,
  warningSeverityThreshold = WARNING_SEVERITY_THRESHOLD,
  defaultExpanded = false,
  onClick,
  className,
}: CategoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const status = getCategoryStatus(violations, warningSeverityThreshold);
  const detectedViolations = violations.filter((v) => v.detected);
  const maxSeverity =
    detectedViolations.length > 0
      ? Math.max(...detectedViolations.map((v) => v.severity))
      : 0;

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(category.code);
    }
  }, [onClick, category.code]);

  const handleToggle = useCallback((open: boolean) => {
    setIsExpanded(open);
  }, []);

  return (
    <TooltipProvider>
      <Collapsible open={isExpanded} onOpenChange={handleToggle}>
        <Card
          className={cn(
            'transition-colors border-2',
            getStatusColorClass(status),
            onClick && 'cursor-pointer hover:shadow-md',
            className
          )}
          onClick={onClick ? handleClick : undefined}
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={
            onClick
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                  }
                }
              : undefined
          }
          aria-label={`${category.name}: ${getStatusLabel(status)}`}
        >
          <CardHeader className="p-3 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {getStatusIcon(status)}
                <div className="min-w-0">
                  <CardTitle className="text-sm font-semibold truncate">
                    {category.code}
                  </CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-xs text-muted-foreground truncate cursor-help">
                        {category.name}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="font-medium">{category.name}</p>
                      <p className="text-xs mt-1">{category.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {status === 'detected' && (
                  <Badge variant="destructive" className="text-xs">
                    {maxSeverity}/10
                  </Badge>
                )}
                {status === 'warning' && (
                  <Badge variant="secondary" className="text-xs bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200">
                    {maxSeverity}/10
                  </Badge>
                )}
                {detectedViolations.length > 0 && (
                  <CollapsibleTrigger asChild>
                    <button
                      className="p-1 rounded hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3 pt-0">
            <div className="flex items-center justify-between text-xs">
              <span
                className={cn(
                  'font-medium',
                  status === 'detected' && 'text-red-600 dark:text-red-400',
                  status === 'warning' && 'text-yellow-600 dark:text-yellow-400',
                  status === 'passed' && 'text-green-600 dark:text-green-400',
                  status === 'not_tested' && 'text-muted-foreground'
                )}
              >
                {getStatusLabel(status)}
              </span>
              {detectedViolations.length > 0 && (
                <span className="text-muted-foreground">
                  {detectedViolations.length} violation{detectedViolations.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <CollapsibleContent>
              {detectedViolations.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-3" role="list" aria-label="Violations list">
                  {detectedViolations
                    .sort((a, b) => b.severity - a.severity)
                    .map((violation, index) => (
                      <ViolationItem
                        key={`${violation.owasp_category}-${index}`}
                        violation={violation}
                        index={index}
                      />
                    ))}
                </div>
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </TooltipProvider>
  );
});

/**
 * Compact CategoryCard for grid display (no expansion)
 */
export const CompactCategoryCard = React.memo(function CompactCategoryCard({
  category,
  status,
  maxSeverity,
  violationCount,
  onClick,
  className,
}: {
  category: OWASPCategory;
  status: CategoryStatus;
  maxSeverity: number;
  violationCount: number;
  onClick?: (categoryCode: string) => void;
  className?: string;
}) {
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(category.code);
    }
  }, [onClick, category.code]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className={cn(
              'transition-all border-2 p-2',
              getStatusColorClass(status),
              onClick && 'cursor-pointer hover:shadow-md hover:scale-[1.02]',
              className
            )}
            onClick={onClick ? handleClick : undefined}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={
              onClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick();
                    }
                  }
                : undefined
            }
            aria-label={`${category.code} ${category.name}: ${getStatusLabel(status)}${maxSeverity > 0 ? `, severity ${maxSeverity}` : ''}`}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              {getStatusIcon(status)}
              <span className="text-xs font-semibold">{category.code}</span>
              {status !== 'not_tested' && status !== 'passed' && (
                <Badge
                  variant={status === 'detected' ? 'destructive' : 'secondary'}
                  className={cn(
                    'text-[10px] px-1 py-0',
                    status === 'warning' && 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200'
                  )}
                >
                  {maxSeverity}/10
                </Badge>
              )}
              {status === 'passed' && (
                <Shield className="h-3 w-3 text-green-600 dark:text-green-400" aria-hidden="true" />
              )}
            </div>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">{category.name}</p>
          <p className="text-xs mt-1">{category.shortDescription}</p>
          {violationCount > 0 && (
            <p className="text-xs mt-1 text-muted-foreground">
              {violationCount} violation{violationCount !== 1 ? 's' : ''} detected
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
