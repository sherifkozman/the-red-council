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
import { useBattleHistoryStore, BattleSummary } from '@/stores/battleHistory';
import type { Violation } from '@/components/reports/CategoryCard';
import type { Recommendation, AnalysisEvent } from '@/components/reports/ReportViewer';

/**
 * Convert battle to full report data
 */
function battleToReportData(battle: BattleSummary): ReportData | null {
  if (!battle.finalState) return null;

  const rounds = battle.finalState.rounds || [];

  // Convert rounds to violations
  const violations: Violation[] = rounds
    .filter(r => r.score !== null && r.score < 5)
    .map((r, i) => ({
      detected: true,
      severity: r.score ? 10 - r.score : 8,
      evidence: r.response || 'Response contained potential security issue',
      recommendation: 'Review and strengthen system prompt defenses',
      owasp_category: i % 2 === 0 ? 'LLM01' : 'LLM02' // Simplified mapping
    }));

  // Generate recommendations based on violations
  const recommendations: Recommendation[] = violations.length > 0 ? [
    {
      id: 'rec-1',
      category: 'System Prompt',
      priority: 'high' as const,
      title: 'Strengthen Input Validation',
      description: 'Add explicit instructions to reject malicious prompts',
      remediation: 'Update system prompt with defensive instructions'
    },
    {
      id: 'rec-2',
      category: 'Output Filtering',
      priority: 'medium' as const,
      title: 'Implement Output Guardrails',
      description: 'Filter responses for sensitive information leakage',
    }
  ] : [];

  // Convert rounds to analysis events
  const events: AnalysisEvent[] = rounds.map((r, i) => ({
    id: `event-${i}`,
    timestamp: r.timestamp,
    type: 'action' as const,
    severity: r.score ? 10 - r.score : undefined,
    summary: `Round ${r.round_id}: ${r.score !== null && r.score < 5 ? 'Breach detected' : 'Attack defended'}`,
    details: r.judge_reasoning || undefined
  }));

  // Calculate max severity for executive summary
  const maxSeverity = violations.length > 0
    ? Math.max(...violations.map(v => v.severity))
    : 0;

  return {
    id: battle.id,
    title: battle.title,
    generatedAt: battle.completedAt || battle.createdAt,
    targetAgent: battle.targetAgent,
    violations,
    recommendations,
    events,
    executiveSummary: maxSeverity >= 8
      ? `Critical vulnerabilities detected. ${violations.length} security breaches found during ${rounds.length} rounds of testing.`
      : maxSeverity >= 5
      ? `Moderate security concerns identified. Review recommended.`
      : `Target demonstrated strong defensive capabilities.`
  };
}

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

    // Load report from battle history or mock data
    const loadReport = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Small delay for UI feedback
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Try to load from battle history store first
        const battles = useBattleHistoryStore.getState().battles;
        const battle = battles.find(b => b.id === reportId);

        if (battle) {
          const realReport = battleToReportData(battle);
          if (realReport) {
            setReport(realReport);
            return;
          }
        }

        // Fall back to mock data for demo/development
        const mockReport = generateMockReport(reportId);
        setReport(mockReport);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load report';
        setError(message);
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
