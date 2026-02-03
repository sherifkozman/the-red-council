'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, GitCompare, X, Loader2 } from 'lucide-react';
import { ReportList, type ReportSummary } from '@/components/reports/ReportList';
import { CompareView } from '@/components/reports/CompareView';
import { type ReportData } from '@/components/reports/ReportViewer';
import { generateMockReports, generateMockReport } from '@/lib/mocks/reports';
import Link from 'next/link';

const MAX_COMPARE_REPORTS = 2;
// Allow alphanumeric, hyphens, underscores for IDs
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export default function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // State
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [baseReport, setBaseReport] = useState<ReportData | null>(null);
  const [targetReport, setTargetReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  // Initialize from URL
  useEffect(() => {
    const ids = searchParams?.get('ids')?.split(',').filter(Boolean) || [];
    // Only set valid IDs
    const validIds = ids.filter(id => VALID_ID_PATTERN.test(id));
    setSelectedIds(validIds);
  }, [searchParams]);

  // Load summary list
  useEffect(() => {
    // In production this would fetch from API
    // For now use shared mocks
    const data = generateMockReports();
    setReports(data);
    setIsLoading(false);
  }, []);

  // Load full reports when MAX_COMPARE_REPORTS selected AND present in URL
  useEffect(() => {
    const idsInUrl = searchParams?.get('ids')?.split(',').filter(Boolean) || [];
    const validIds = idsInUrl.filter(id => VALID_ID_PATTERN.test(id));
    
    if (validIds.length === MAX_COMPARE_REPORTS) {
      setIsLoadingReports(true);
      
      // Use setTimeout to simulate async/prevent blocking UI if logic was heavy
      // In real app this would be fetch
      setTimeout(() => {
        try {
          const [id1, id2] = validIds;
          const r1 = generateMockReport(id1);
          const r2 = generateMockReport(id2);
          
          // Sort by date so older is base
          const d1 = new Date(r1.generatedAt).getTime();
          const d2 = new Date(r2.generatedAt).getTime();
          
          if (d1 < d2) {
            setBaseReport(r1);
            setTargetReport(r2);
          } else {
            setBaseReport(r2);
            setTargetReport(r1);
          }
        } catch (err) {
          console.error('Failed to load comparison reports:', err);
          // Fallback or error state could be handled here
        } finally {
          setIsLoadingReports(false);
        }
      }, 0);
    } else {
      setBaseReport(null);
      setTargetReport(null);
      setIsLoadingReports(false);
    }
  }, [searchParams]);

  const handleToggleSelection = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(p => p !== id);
      }
      if (prev.length >= MAX_COMPARE_REPORTS) {
        // If already max selected, replace the second one to allow easy switching
        return [prev[0], id];
      }
      return [...prev, id];
    });
  };

  const handleCompare = () => {
    if (selectedIds.length === MAX_COMPARE_REPORTS) {
      router.push(`/reports/compare?ids=${selectedIds.join(',')}`);
    }
  };
  
  const handleClearSelection = () => {
    router.push('/reports/compare');
    setSelectedIds([]);
  };

  const isComparing = !!(baseReport && targetReport);

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Link href="/reports" className="hover:text-foreground flex items-center gap-1 text-sm">
                <ArrowLeft className="h-4 w-4" /> Back to History
              </Link>
            </div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitCompare className="h-6 w-6" />
              Compare Reports
            </h1>
          </div>
          
          {/* Action Bar (only visible in selection mode) */}
          {!isComparing && !isLoadingReports && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {selectedIds.length} of {MAX_COMPARE_REPORTS} selected
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSelectedIds([])}
                disabled={selectedIds.length === 0}
              >
                Clear
              </Button>
              <Button 
                onClick={handleCompare} 
                disabled={selectedIds.length !== MAX_COMPARE_REPORTS}
                className="gap-2"
              >
                <GitCompare className="h-4 w-4" />
                Compare
              </Button>
            </div>
          )}

          {/* Back to Selection (only visible in compare mode) */}
          {isComparing && !isLoadingReports && (
            <Button variant="outline" onClick={handleClearSelection}>
              <X className="h-4 w-4 mr-2" />
              Change Selection
            </Button>
          )}
        </div>

        {/* Content */}
        {isLoadingReports ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p>Loading reports for comparison...</p>
          </div>
        ) : isComparing ? (
          <CompareView baseReport={baseReport!} targetReport={targetReport!} />
        ) : (
          <ReportList
            reports={reports}
            selectionMode={true}
            selectedIds={selectedIds}
            onToggleSelection={handleToggleSelection}
            pageSize={10}
          />
        )}
      </div>
    </div>
  );
}
