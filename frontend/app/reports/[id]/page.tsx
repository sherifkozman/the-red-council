'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ReportViewer, type ReportData } from '@/components/reports/ReportViewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { generateMockReport } from '@/lib/mocks/reports';

/**
 * Loading skeleton for report
 */
function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-60 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

/**
 * Error state component
 */
function ReportError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error Loading Report</AlertTitle>
      <AlertDescription className="mt-2">
        <p>{error}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onRetry}
          >
            Try Again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Report page component with dynamic routing
 */
export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Validate and extract report ID
  const reportId = params?.id;

  // Load report data
  useEffect(() => {
    if (!reportId) {
      setError('Invalid report ID');
      setIsLoading(false);
      return;
    }

    // Validate report ID format (alphanumeric, hyphens, underscores)
    const validIdPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validIdPattern.test(reportId)) {
      setError('Invalid report ID format');
      setIsLoading(false);
      return;
    }

    // Simulate API fetch - replace with actual API call
    const loadReport = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        // TODO: In production, replace with actual API call:
        // const response = await fetch(`/api/reports/${reportId}`);
        // if (!response.ok) {
        //   throw new Error(`Failed to load report: ${response.status}`);
        // }
        // const data = await response.json();

        // Using mock data for hackathon demo
        if (process.env.NODE_ENV === 'development') {
          console.info('[DEV] Using mock report data for ID:', reportId);
        }
        const mockReport = generateMockReport(reportId);
        setReport(mockReport);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load report';
        setError(message);
        // Log errors in all environments for debugging
        console.error('Report load error:', { reportId, error: err });
      } finally {
        setIsLoading(false);
      }
    };

    loadReport();
  }, [reportId, retryCount]);

  // Handle retry - uses retryCount to re-trigger useEffect
  const handleRetry = () => {
    setReport(null);
    setError(null);
    setRetryCount((c) => c + 1);
  };

  // Handle print
  const handlePrint = () => {
    setIsPrintMode(true);
    // Wait for state update then print
    setTimeout(() => {
      window.print();
      // Reset after print dialog closes
      setTimeout(() => setIsPrintMode(false), 100);
    }, 100);
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 print:py-2 print:px-0">
      {/* Back navigation - hide in print */}
      <nav className="mb-6 print:hidden" aria-label="Back navigation">
        <Link
          href="/agent/results"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Results
        </Link>
      </nav>

      {/* Print header - only shown in print */}
      <div className="hidden print:block print:mb-4">
        <p className="text-xs text-muted-foreground">
          The Red Council - Security Assessment Report
        </p>
      </div>

      {/* Content */}
      {isLoading && <ReportSkeleton />}

      {error && <ReportError error={error} onRetry={handleRetry} />}

      {report && !isLoading && !error && (
        <ReportViewer
          report={report}
          showNav={!isPrintMode}
          printMode={isPrintMode}
          onPrint={handlePrint}
        />
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .print\\:hidden {
            display: none !important;
          }

          .print\\:block {
            display: block !important;
          }
        }
      `}</style>
    </div>
  );
}
