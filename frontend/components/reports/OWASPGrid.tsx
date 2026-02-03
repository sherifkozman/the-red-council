'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  ChevronRight,
  Shield,
  ShieldAlert,
  LayoutGrid,
  List,
} from 'lucide-react';
import { OWASP_CATEGORIES, OWASP_CATEGORY_MAP, type OWASPCategory } from '@/data/owasp-categories';
import { escapeHtml } from '@/lib/utils';
import {
  CategoryCard,
  CompactCategoryCard,
  type Violation,
  type CategoryStatus,
  getCategoryStatus,
  getStatusLabel,
  WARNING_SEVERITY_THRESHOLD,
} from './CategoryCard';

/**
 * Layout mode for the OWASP grid
 */
export type GridLayout = 'grid' | 'list';

/**
 * Props for OWASPGrid component
 */
export interface OWASPGridProps {
  /** Violations grouped by OWASP category code */
  violations: Violation[];
  /** Warning severity threshold (default: 4) */
  warningSeverityThreshold?: number;
  /** Layout mode (grid or list) */
  layout?: GridLayout;
  /** Whether to show layout toggle */
  showLayoutToggle?: boolean;
  /** Whether to show coverage statistics */
  showCoverageStats?: boolean;
  /** Callback when a category is clicked */
  onCategoryClick?: (categoryCode: string) => void;
  /** Additional class names */
  className?: string;
}

/**
 * Summary statistics for the grid
 */
interface GridStats {
  total: number;
  tested: number;
  passed: number;
  warning: number;
  detected: number;
  notTested: number;
  coveragePercent: number;
  orphanViolations: Violation[];
}

/**
 * Category with computed status
 */
interface CategoryWithStatus {
  category: OWASPCategory;
  violations: Violation[];
  status: CategoryStatus;
  maxSeverity: number;
}

/**
 * Compute grid statistics from violations
 */
function computeGridStats(
  categoryStatuses: CategoryWithStatus[],
  orphanViolations: Violation[]
): GridStats {
  const total = categoryStatuses.length;
  const tested = categoryStatuses.filter((c) => c.status !== 'not_tested').length;
  const passed = categoryStatuses.filter((c) => c.status === 'passed').length;
  const warning = categoryStatuses.filter((c) => c.status === 'warning').length;
  const detected = categoryStatuses.filter((c) => c.status === 'detected').length;
  const notTested = categoryStatuses.filter((c) => c.status === 'not_tested').length;
  const coveragePercent = total > 0 ? Math.round((tested / total) * 100) : 0;

  return {
    total,
    tested,
    passed,
    warning,
    detected,
    notTested,
    coveragePercent,
    orphanViolations,
  };
}

/**
 * Stats display component
 */
const StatsDisplay = React.memo(function StatsDisplay({ stats }: { stats: GridStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3" role="region" aria-label="Coverage statistics">
      <Card className="p-3">
        <div className="text-xs text-muted-foreground">Coverage</div>
        <div className="text-2xl font-bold">{stats.coveragePercent}%</div>
        <Progress value={stats.coveragePercent} className="h-1 mt-1" />
      </Card>
      <Card className="p-3 bg-red-50 dark:bg-red-900/20">
        <div className="text-xs text-red-600 dark:text-red-400">Detected</div>
        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
          {stats.detected}
        </div>
      </Card>
      <Card className="p-3 bg-yellow-50 dark:bg-yellow-900/20">
        <div className="text-xs text-yellow-600 dark:text-yellow-400">Warnings</div>
        <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
          {stats.warning}
        </div>
      </Card>
      <Card className="p-3 bg-green-50 dark:bg-green-900/20">
        <div className="text-xs text-green-600 dark:text-green-400">Passed</div>
        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
          {stats.passed}
        </div>
      </Card>
      <Card className="p-3 bg-gray-50 dark:bg-gray-800/50">
        <div className="text-xs text-muted-foreground">Not Tested</div>
        <div className="text-2xl font-bold text-muted-foreground">{stats.notTested}</div>
      </Card>
    </div>
  );
});

/**
 * Orphan violations alert component
 */
const OrphanViolationsAlert = React.memo(function OrphanViolationsAlert({
  orphanViolations,
}: {
  orphanViolations: Violation[];
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (orphanViolations.length === 0) {
    return null;
  }

  return (
    <>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Invalid Category Violations</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>
            {orphanViolations.length} violation{orphanViolations.length !== 1 ? 's' : ''}{' '}
            {orphanViolations.length !== 1 ? 'have' : 'has'} invalid or unknown OWASP categories and {orphanViolations.length !== 1 ? 'are' : 'is'} not shown in the grid.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDetails(true)}
            aria-label="View invalid violations"
          >
            View Details
            <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
          </Button>
        </AlertDescription>
      </Alert>

      <Sheet open={showDetails} onOpenChange={setShowDetails}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Invalid/Orphan Violations</SheetTitle>
            <SheetDescription>
              These violations have categories that don&apos;t match the OWASP Agentic Top 10.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-200px)] mt-4">
            <div className="space-y-4 pr-4">
              {orphanViolations.map((violation, index) => (
                <Card key={`orphan-${index}`} className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">
                        Category: {violation.owasp_category || 'Unknown'}
                      </Badge>
                      <Badge variant="destructive">Severity: {violation.severity}/10</Badge>
                    </div>
                    {violation.evidence && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Evidence:
                        </p>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                          {escapeHtml(violation.evidence)}
                        </pre>
                      </div>
                    )}
                    {violation.recommendation && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Recommendation:
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {escapeHtml(violation.recommendation)}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
});

/**
 * Category details sheet
 */
const CategoryDetailsSheet = React.memo(function CategoryDetailsSheet({
  category,
  violations,
  warningSeverityThreshold,
  open,
  onOpenChange,
}: {
  category: OWASPCategory | null;
  violations: Violation[];
  warningSeverityThreshold: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!category) {
    return null;
  }

  const status = getCategoryStatus(violations, warningSeverityThreshold);
  const detectedViolations = violations.filter((v) => v.detected);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {status === 'detected' && (
              <ShieldAlert className="h-5 w-5 text-red-600" aria-hidden="true" />
            )}
            {status === 'passed' && (
              <Shield className="h-5 w-5 text-green-600" aria-hidden="true" />
            )}
            {category.code} - {category.name}
          </SheetTitle>
          <SheetDescription>{category.description}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Status:</span>
            <Badge
              variant={
                status === 'detected'
                  ? 'destructive'
                  : status === 'warning'
                  ? 'secondary'
                  : status === 'passed'
                  ? 'outline'
                  : 'outline'
              }
              className={cn(
                status === 'warning' &&
                  'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200',
                status === 'passed' &&
                  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              )}
            >
              {getStatusLabel(status)}
            </Badge>
          </div>

          <ScrollArea className="h-[calc(100vh-300px)]">
            {detectedViolations.length > 0 ? (
              <div className="space-y-4 pr-4">
                <h4 className="text-sm font-medium">
                  {detectedViolations.length} Violation{detectedViolations.length !== 1 ? 's' : ''}{' '}
                  Detected:
                </h4>
                {detectedViolations
                  .sort((a, b) => b.severity - a.severity)
                  .map((violation, index) => (
                    <Card
                      key={`violation-${index}`}
                      className={cn(
                        'p-3 border-l-4',
                        violation.severity >= warningSeverityThreshold
                          ? 'border-l-red-500'
                          : 'border-l-yellow-500'
                      )}
                    >
                      <div className="space-y-2">
                        <Badge
                          variant={violation.severity >= 7 ? 'destructive' : 'secondary'}
                        >
                          Severity: {violation.severity}/10
                        </Badge>
                        {violation.evidence && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Evidence:
                            </p>
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">
                              {violation.evidence}
                            </pre>
                          </div>
                        )}
                        {violation.recommendation && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Recommendation:
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {violation.recommendation}
                            </p>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
              </div>
            ) : violations.length > 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-2 text-green-600" aria-hidden="true" />
                <p>All tests passed for this category.</p>
                <p className="text-xs mt-1">No violations detected.</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-2" aria-hidden="true" />
                <p>This category has not been tested yet.</p>
                <p className="text-xs mt-1">Run a campaign to test this category.</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
});

/**
 * OWASPGrid component - displays OWASP Agentic Top 10 coverage grid
 */
export function OWASPGrid({
  violations,
  warningSeverityThreshold = WARNING_SEVERITY_THRESHOLD,
  layout: initialLayout = 'grid',
  showLayoutToggle = true,
  showCoverageStats = true,
  onCategoryClick,
  className,
}: OWASPGridProps) {
  const [layout, setLayout] = useState<GridLayout>(initialLayout);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Group violations by category and compute statuses
  const { categoryStatuses, orphanViolations } = useMemo(() => {
    const validCategoryCodes = new Set(OWASP_CATEGORIES.map((c) => c.code));
    const violationsByCategory: Record<string, Violation[]> = {};
    const orphans: Violation[] = [];

    // Group violations
    for (const violation of violations) {
      if (validCategoryCodes.has(violation.owasp_category)) {
        if (!violationsByCategory[violation.owasp_category]) {
          violationsByCategory[violation.owasp_category] = [];
        }
        violationsByCategory[violation.owasp_category].push(violation);
      } else {
        // Log invalid categories for debugging
        if (process.env.NODE_ENV === 'development') {
          console.warn('[OWASPGrid] Violation has invalid OWASP category:', {
            category: violation.owasp_category,
            validCategories: Array.from(validCategoryCodes),
          });
        }
        orphans.push(violation);
      }
    }

    // Compute status for each category
    const statuses: CategoryWithStatus[] = OWASP_CATEGORIES.map((category) => {
      const categoryViolations = violationsByCategory[category.code] || [];
      const status = getCategoryStatus(categoryViolations, warningSeverityThreshold);
      const detectedViolations = categoryViolations.filter((v) => v.detected);
      const maxSeverity =
        detectedViolations.length > 0
          ? Math.max(...detectedViolations.map((v) => v.severity))
          : 0;

      return {
        category,
        violations: categoryViolations,
        status,
        maxSeverity,
      };
    });

    return { categoryStatuses: statuses, orphanViolations: orphans };
  }, [violations, warningSeverityThreshold]);

  // Compute stats
  const stats = useMemo(
    () => computeGridStats(categoryStatuses, orphanViolations),
    [categoryStatuses, orphanViolations]
  );

  // Get selected category data
  const selectedCategoryData = useMemo(() => {
    if (!selectedCategory) return null;
    return categoryStatuses.find((c) => c.category.code === selectedCategory) || null;
  }, [selectedCategory, categoryStatuses]);

  const handleCategoryClick = useCallback(
    (categoryCode: string) => {
      setSelectedCategory(categoryCode);
      if (onCategoryClick) {
        onCategoryClick(categoryCode);
      }
    },
    [onCategoryClick]
  );

  const handleCloseDetails = useCallback(() => {
    setSelectedCategory(null);
  }, []);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with layout toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">OWASP Agentic Top 10 Coverage</h2>
        </div>
        {showLayoutToggle && (
          <div className="flex items-center gap-1 border rounded-md p-1" role="radiogroup" aria-label="Layout options">
            <Button
              variant={layout === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLayout('grid')}
              aria-pressed={layout === 'grid'}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant={layout === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setLayout('list')}
              aria-pressed={layout === 'list'}
              aria-label="List view"
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {/* Coverage statistics */}
      {showCoverageStats && <StatsDisplay stats={stats} />}

      {/* Orphan violations alert */}
      <OrphanViolationsAlert orphanViolations={orphanViolations} />

      {/* Grid/List view */}
      {layout === 'grid' ? (
        <div
          className="grid grid-cols-5 gap-2 md:gap-3"
          role="list"
          aria-label="OWASP categories grid"
        >
          {categoryStatuses.map((item) => (
            <CompactCategoryCard
              key={item.category.code}
              category={item.category}
              status={item.status}
              maxSeverity={item.maxSeverity}
              violationCount={item.violations.filter((v) => v.detected).length}
              onClick={handleCategoryClick}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3" role="list" aria-label="OWASP categories list">
          {categoryStatuses.map((item) => (
            <CategoryCard
              key={item.category.code}
              category={item.category}
              violations={item.violations}
              warningSeverityThreshold={warningSeverityThreshold}
              onClick={handleCategoryClick}
            />
          ))}
        </div>
      )}

      {/* Category details sheet */}
      <CategoryDetailsSheet
        category={selectedCategoryData?.category || null}
        violations={selectedCategoryData?.violations || []}
        warningSeverityThreshold={warningSeverityThreshold}
        open={selectedCategory !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseDetails();
        }}
      />
    </div>
  );
}
