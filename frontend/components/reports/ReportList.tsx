'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { cn, escapeHtml } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  Trash2,
  FileText,
  Calendar,
  Shield,
} from 'lucide-react';
import {
  getRiskLevel,
  getRiskLevelLabel,
  getRiskLevelColors,
  getRiskLevelIcon,
  type RiskLevel,
} from './RiskGauge';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Report summary data for list display
 */
export interface ReportSummary {
  /** Unique identifier */
  id: string;
  /** Report title */
  title: string;
  /** Target agent name */
  targetAgent: string;
  /** Generation timestamp (ISO 8601) */
  generatedAt: string;
  /** Session identifier */
  sessionId: string;
  /** Maximum severity score (0-10) */
  maxSeverity: number;
  /** Number of violations detected */
  violationCount: number;
  /** Report status */
  status: 'complete' | 'in_progress' | 'failed';
}

/**
 * Filter options for report list
 */
export interface ReportFilters {
  /** Filter by risk level */
  riskLevel: RiskLevel | 'all';
  /** Filter by status */
  status: 'all' | 'complete' | 'in_progress' | 'failed';
  /** Search query for title/session ID */
  search: string;
}

/**
 * Props for ReportList component
 */
export interface ReportListProps {
  /** List of report summaries */
  reports: ReportSummary[];
  /** Items per page (default: 10) */
  pageSize?: number;
  /** Callback when a report is deleted */
  onDelete?: (id: string) => void | Promise<void>;
  /** Whether delete operations are in progress */
  isDeleting?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PAGE_SIZE = 10;
const MAX_SESSION_ID_DISPLAY = 12;
const MAX_TITLE_DISPLAY = 40;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format a date string for display, handling invalid dates gracefully
 */
export function formatReportDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return 'Unknown';
  }
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('ReportList: Invalid date string:', dateString);
      }
      return 'Unknown';
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

/**
 * Format relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) {
    return '';
  }
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '';
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        if (diffMinutes <= 0) return 'Just now';
        return `${diffMinutes}m ago`;
      }
      return `${diffHours}h ago`;
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    return formatReportDate(dateString);
  } catch {
    return '';
  }
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Get status badge variant and label
 */
export function getStatusConfig(status: ReportSummary['status']): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
} {
  switch (status) {
    case 'complete':
      return {
        label: 'Complete',
        variant: 'default',
        className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      };
    case 'in_progress':
      return {
        label: 'In Progress',
        variant: 'secondary',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      };
    case 'failed':
      return {
        label: 'Failed',
        variant: 'destructive',
        className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      };
  }
}

/**
 * Filter reports based on criteria
 */
export function filterReports(
  reports: ReportSummary[],
  filters: ReportFilters
): ReportSummary[] {
  return reports.filter((report) => {
    // Filter by risk level
    if (filters.riskLevel !== 'all') {
      const reportRiskLevel = getRiskLevel(report.maxSeverity);
      if (reportRiskLevel !== filters.riskLevel) {
        return false;
      }
    }

    // Filter by status
    if (filters.status !== 'all' && report.status !== filters.status) {
      return false;
    }

    // Filter by search query
    if (filters.search.trim()) {
      const query = filters.search.toLowerCase().trim();
      const matchesTitle = report.title.toLowerCase().includes(query);
      const matchesSessionId = report.sessionId.toLowerCase().includes(query);
      const matchesAgent = report.targetAgent.toLowerCase().includes(query);
      if (!matchesTitle && !matchesSessionId && !matchesAgent) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort reports by date (newest first)
 */
export function sortReportsByDate(reports: ReportSummary[]): ReportSummary[] {
  return [...reports].sort((a, b) => {
    const dateA = new Date(a.generatedAt || 0).getTime();
    const dateB = new Date(b.generatedAt || 0).getTime();
    // Handle invalid dates - push them to the end
    if (isNaN(dateA) && isNaN(dateB)) return 0;
    if (isNaN(dateA)) return 1;
    if (isNaN(dateB)) return -1;
    return dateB - dateA; // Newest first
  });
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Risk level badge component
 */
const RiskBadge = React.memo(function RiskBadge({
  severity,
}: {
  severity: number;
}) {
  const level = getRiskLevel(severity);
  const label = getRiskLevelLabel(level);
  const colors = getRiskLevelColors(level);

  return (
    <Badge
      variant="outline"
      className={cn(colors.bg, colors.text, 'gap-1')}
      aria-label={`Risk level: ${label}`}
    >
      {getRiskLevelIcon(level)}
      <span>{label}</span>
    </Badge>
  );
});

/**
 * Status badge component
 */
const StatusBadge = React.memo(function StatusBadge({
  status,
}: {
  status: ReportSummary['status'];
}) {
  const config = getStatusConfig(status);
  return (
    <Badge
      variant="outline"
      className={config.className}
      aria-label={`Status: ${config.label}`}
    >
      {config.label}
    </Badge>
  );
});

/**
 * Single report item in the list
 */
const ReportItem = React.memo(function ReportItem({
  report,
  onDelete,
  isDeleting,
}: {
  report: ReportSummary;
  onDelete?: (id: string) => void | Promise<void>;
  isDeleting?: boolean;
}) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDelete = useCallback(async () => {
    try {
      if (onDelete) {
        await onDelete(report.id);
      }
      // Only close dialog on success
      setIsDeleteDialogOpen(false);
    } catch (err) {
      // Log error defensively, keep dialog open so user knows deletion failed
      console.error('Delete failed for report:', report.id, err);
      // Close dialog anyway since parent handles error display
      setIsDeleteDialogOpen(false);
    }
  }, [onDelete, report.id]);

  const truncatedTitle = truncateText(escapeHtml(report.title), MAX_TITLE_DISPLAY);
  const truncatedSessionId = truncateText(escapeHtml(report.sessionId), MAX_SESSION_ID_DISPLAY);
  const safeSessionId = escapeHtml(report.sessionId);
  const relativeTime = formatRelativeTime(report.generatedAt);

  return (
    <li
      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
      data-testid={`report-item-${report.id}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2">
            <FileText
              className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <Link
                href={`/reports/${encodeURIComponent(report.id)}`}
                className="font-medium hover:underline focus:underline focus:outline-none"
                aria-label={`View report: ${report.title}`}
              >
                {truncatedTitle}
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" aria-hidden="true" />
                  {escapeHtml(report.targetAgent)}
                </span>
                <span
                  className="font-mono text-xs"
                  title={safeSessionId}
                  aria-label={`Session ID: ${safeSessionId}`}
                >
                  {truncatedSessionId}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  <time
                    dateTime={report.generatedAt}
                    title={formatReportDate(report.generatedAt)}
                  >
                    {relativeTime}
                  </time>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Badges and actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <RiskBadge severity={report.maxSeverity} />
          <StatusBadge status={report.status} />

          {/* View button */}
          <Button variant="ghost" size="sm" asChild>
            <Link
              href={`/reports/${encodeURIComponent(report.id)}`}
              aria-label={`Open report ${report.title}`}
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">View</span>
            </Link>
          </Button>

          {/* Delete button with confirmation */}
          {onDelete && (
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={isDeleting}
                  aria-label={`Delete report ${report.title}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Delete</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Report</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this report? This action cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Violation count */}
      {report.violationCount > 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          {report.violationCount} violation{report.violationCount !== 1 ? 's' : ''}{' '}
          detected
        </div>
      )}
    </li>
  );
});

/**
 * Filter controls component
 */
const ReportFiltersBar = React.memo(function ReportFiltersBar({
  filters,
  onFiltersChange,
  totalCount,
  filteredCount,
}: {
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  totalCount: number;
  filteredCount: number;
}) {
  const handleRiskLevelChange = useCallback(
    (value: string) => {
      onFiltersChange({ ...filters, riskLevel: value as ReportFilters['riskLevel'] });
    },
    [filters, onFiltersChange]
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      onFiltersChange({ ...filters, status: value as ReportFilters['status'] });
    },
    [filters, onFiltersChange]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({ ...filters, search: e.target.value });
    },
    [filters, onFiltersChange]
  );

  const handleClearFilters = useCallback(() => {
    onFiltersChange({ riskLevel: 'all', status: 'all', search: '' });
  }, [onFiltersChange]);

  const hasActiveFilters =
    filters.riskLevel !== 'all' || filters.status !== 'all' || filters.search.trim();

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search reports..."
            value={filters.search}
            onChange={handleSearchChange}
            className="pl-9"
            aria-label="Search reports by title, session ID, or agent name"
            maxLength={100}
          />
        </div>

        {/* Risk level filter */}
        <Select value={filters.riskLevel} onValueChange={handleRiskLevelChange}>
          <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filter by risk level">
            <SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risks</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={filters.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filter summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {filteredCount} of {totalCount} report{totalCount !== 1 ? 's' : ''}
        </span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="text-xs"
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
});

/**
 * Pagination controls component
 */
const Pagination = React.memo(function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const handlePrevious = useCallback(() => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, onPageChange]);

  const handleNext = useCallback(() => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, totalPages, onPageChange]);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrevious}
        disabled={currentPage <= 1}
        aria-label="Go to previous page"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
      </Button>

      <span className="text-sm text-muted-foreground" aria-current="page">
        Page {currentPage} of {totalPages}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={handleNext}
        disabled={currentPage >= totalPages}
        aria-label="Go to next page"
      >
        <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </nav>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Report history list component with filtering, sorting, and pagination.
 * Displays a list of report summaries with risk levels, status, and actions.
 */
export const ReportList = React.memo(function ReportList({
  reports,
  pageSize = DEFAULT_PAGE_SIZE,
  onDelete,
  isDeleting = false,
  className,
}: ReportListProps) {
  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<ReportFilters>({
    riskLevel: 'all',
    status: 'all',
    search: '',
  });

  // Filter and sort reports
  const processedReports = useMemo(() => {
    const filtered = filterReports(reports, filters);
    return sortReportsByDate(filtered);
  }, [reports, filters]);

  // Pagination
  const totalPages = Math.ceil(processedReports.length / pageSize);
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return processedReports.slice(start, end);
  }, [processedReports, currentPage, pageSize]);

  // Reset to page 1 when filters change
  const handleFiltersChange = useCallback((newFilters: ReportFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    // Scroll to top of list
    const listElement = document.getElementById('report-list');
    if (listElement) {
      listElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" aria-hidden="true" />
          Report History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <ReportFiltersBar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          totalCount={reports.length}
          filteredCount={processedReports.length}
        />

        {/* Report list */}
        {paginatedReports.length > 0 ? (
          <ul
            id="report-list"
            className="space-y-3"
            role="list"
            aria-label="Report list"
          >
            {paginatedReports.map((report) => (
              <ReportItem
                key={report.id}
                report={report}
                onDelete={onDelete}
                isDeleting={isDeleting}
              />
            ))}
          </ul>
        ) : (
          <div className="text-center py-8 text-muted-foreground" role="status">
            {reports.length === 0
              ? 'No reports available yet.'
              : 'No reports match the current filters.'}
          </div>
        )}

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </CardContent>
    </Card>
  );
});
