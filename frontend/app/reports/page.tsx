'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ReportList, type ReportSummary } from '@/components/reports/ReportList';
import { EmptyState } from '@/components/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, FileText, FlaskConical } from 'lucide-react';
import { useTestingModeStore, isTestingMode } from '@/stores/testingMode';
import { generateMockReports } from '@/lib/mocks/reports';

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Loading skeleton for the reports page
 */
function ReportsPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading reports">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * Error state component
 */
function ReportsPageError({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error Loading Reports</AlertTitle>
      <AlertDescription className="mt-2">
        <p>{error}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            Try Again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ============================================================================
// LOCAL STORAGE PERSISTENCE
// ============================================================================

const STORAGE_KEY = 'red-council-reports';

/**
 * Load reports from localStorage
 */
function loadReportsFromStorage(): ReportSummary[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Invalid reports data in localStorage');
      }
      return null;
    }

    // Validate each report has required fields with type guard
    const valid = parsed.filter(
      (r): r is ReportSummary =>
        r &&
        typeof r.id === 'string' &&
        typeof r.title === 'string' &&
        typeof r.sessionId === 'string' &&
        typeof r.targetAgent === 'string' &&
        typeof r.generatedAt === 'string' &&
        typeof r.maxSeverity === 'number' &&
        typeof r.violationCount === 'number' &&
        ['complete', 'in_progress', 'failed'].includes(r.status)
    );

    return valid;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Failed to load reports from localStorage:', err);
    }
    return null;
  }
}

/**
 * Save reports to localStorage
 */
function saveReportsToStorage(reports: ReportSummary[]): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (err) {
    // localStorage might be full or disabled
    if (process.env.NODE_ENV === 'development') {
      console.warn('Failed to save reports to localStorage:', err);
    }
  }
}

/**
 * Delete a report from localStorage
 */
function deleteReportFromStorage(id: string): ReportSummary[] | null {
  const reports = loadReportsFromStorage();
  if (!reports) return null;

  const updated = reports.filter((r) => r.id !== id);
  saveReportsToStorage(updated);
  return updated;
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

/**
 * Reports history page with list view, filtering, and pagination.
 */
export default function ReportsPage() {
  // State
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Get testing mode to show appropriate content
  const mode = useTestingModeStore((state) => state.mode);
  const isDemoMode = isTestingMode(mode) && mode === 'demo-mode';

  // Load reports on mount
  useEffect(() => {
    const loadReports = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Simulate API latency
        await new Promise((resolve) => setTimeout(resolve, 300));

        // In demo mode, always use mock data
        if (isDemoMode) {
          const mockReports = generateMockReports();
          setReports(mockReports);
          return;
        }

        // Try to load from localStorage first
        const storedReports = loadReportsFromStorage();
        if (storedReports && storedReports.length > 0) {
          setReports(storedReports);
          return;
        }

        // TODO: In production, fetch from API:
        // const response = await fetch('/api/reports');
        // if (!response.ok) throw new Error('Failed to fetch reports');
        // const data = await response.json();
        // setReports(data);

        // For hackathon/development, use mock data if no stored reports
        // In production, show empty state instead of fake data
        if (process.env.NODE_ENV === 'development' || isDemoMode) {
          console.info('[DEV] No stored reports, using mock data');
          const mockReports = generateMockReports();
          setReports(mockReports);
          // Don't persist mock data in demo mode
          if (!isDemoMode) {
            saveReportsToStorage(mockReports);
          }
        } else {
          // Production: show empty state
          setReports([]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load reports';
        setError(message);
        console.error('Reports load error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadReports();
  }, [isDemoMode, retryCount]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setError(null);
    setRetryCount((c) => c + 1);
  }, []);

  // Handle report deletion
  const handleDelete = useCallback(
    async (id: string) => {
      setIsDeleting(true);
      setDeleteError(null);
      try {
        // Simulate API latency
        await new Promise((resolve) => setTimeout(resolve, 200));

        // TODO: In production, call API to delete:
        // await fetch(`/api/reports/${id}`, { method: 'DELETE' });

        // Update local state
        setReports((prev) => prev.filter((r) => r.id !== id));

        // Update localStorage (unless demo mode)
        if (!isDemoMode) {
          deleteReportFromStorage(id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete report';
        setDeleteError(message);
        console.error('Failed to delete report:', err);
      } finally {
        setIsDeleting(false);
      }
    },
    [isDemoMode]
  );

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Report History</h1>
        <p className="text-muted-foreground">
          View and manage security assessment reports from previous sessions.
        </p>
      </div>

      {/* Demo mode badge */}
      {isDemoMode && (
        <Alert className="mb-6 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20">
          <FlaskConical className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800 dark:text-blue-200">Demo Mode</AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            Viewing sample reports. Changes will not be persisted.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading state */}
      {isLoading && <ReportsPageSkeleton />}

      {/* Error state */}
      {error && !isLoading && <ReportsPageError error={error} onRetry={handleRetry} />}

      {/* Delete error - dismissible */}
      {deleteError && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Delete Failed</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{deleteError}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteError(null)}
              aria-label="Dismiss error"
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && !error && reports.length === 0 && (
        <EmptyState
          title="No Reports Yet"
          description="Security assessment reports will appear here after you run your first campaign."
          icon={FileText}
          action={{
            label: 'Start Testing',
            href: '/agent/attack',
          }}
        />
      )}

      {/* Report list */}
      {!isLoading && !error && reports.length > 0 && (
        <ReportList
          reports={reports}
          pageSize={10}
          onDelete={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
