'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Play, Link2, Info } from 'lucide-react';

import { EventStream } from '@/components/agent/EventStream';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { useTestingModeStore } from '@/stores/testingMode';
import { loadDemoData } from '@/lib/demo/loadDemoSession';
import { AgentEvent } from '@/lib/demo/demoData';
import { useEventStream, useEventStreamDemo } from '@/hooks/useEventStream';

// ============================================================================
// Page Component
// ============================================================================
export default function MonitorPage() {
  const { mode } = useTestingModeStore();
  const [mounted, setMounted] = useState(false);
  const [demoEvents, setDemoEvents] = useState<AgentEvent[] | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load demo data when in demo mode
  useEffect(() => {
    if (mode === 'demo-mode' && !demoEvents && !demoLoading) {
      setDemoLoading(true);
      setDemoError(null);

      loadDemoData()
        .then((data) => {
          setDemoEvents(data.events);
        })
        .catch((err) => {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load demo data';
          setDemoError(errorMessage);
          if (process.env.NODE_ENV === 'development') {
            console.error('[MonitorPage] Demo load error:', err);
          }
        })
        .finally(() => {
          setDemoLoading(false);
        });
    }
  }, [mode, demoEvents, demoLoading]);

  // Show skeleton during hydration
  if (!mounted) {
    return <MonitorPageSkeleton />;
  }

  return (
    <ErrorBoundary>
      <div className="container max-w-6xl py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Event Monitor</h1>
          <p className="text-muted-foreground mt-1">
            Real-time stream of events from your instrumented agent
          </p>
        </header>

        {mode === 'demo-mode' ? (
          <DemoModeContent
            events={demoEvents}
            isLoading={demoLoading}
            error={demoError}
          />
        ) : mode === 'agent-testing' ? (
          <AgentModeContent />
        ) : (
          <LLMModeContent />
        )}
      </div>
    </ErrorBoundary>
  );
}

// ============================================================================
// Mode-Specific Content
// ============================================================================

/** Demo Mode - Uses static demo events */
function DemoModeContent({
  events,
  isLoading,
  error,
}: {
  events: AgentEvent[] | null;
  isLoading: boolean;
  error: string | null;
}) {
  // Use the demo hook with loaded events
  const stream = useEventStreamDemo(events || []);

  if (isLoading) {
    return <MonitorPageSkeleton />;
  }

  if (error) {
    return (
      <EmptyState
        variant="default"
        icon={AlertCircle}
        title="Failed to Load Demo"
        description={error}
        action={{
          label: 'Retry',
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  if (!events || events.length === 0) {
    return (
      <EmptyState
        variant="demo"
        icon={Play}
        title="No Demo Events"
        description="Demo event data is not available. Please check the data file."
      />
    );
  }

  return <EventStream stream={stream} />;
}

/** Agent Mode - Live event stream from API */
function AgentModeContent() {
  // TODO: Get session ID from session store when implemented
  const sessionId = null; // Will come from useRemoteAgentStore or session context

  const stream = useEventStream({
    sessionId,
    enabled: !!sessionId,
  });

  if (!sessionId) {
    return (
      <EmptyState
        variant="default"
        icon={Link2}
        title="No Active Session"
        description="Connect to a remote agent or start an SDK session to begin monitoring events."
        action={{
          label: 'Configure Agent',
          href: '/agent/connect',
        }}
      />
    );
  }

  return <EventStream stream={stream} />;
}

/** LLM Mode - Not applicable for event monitoring */
function LLMModeContent() {
  return (
    <EmptyState
      variant="default"
      icon={Info}
      title="Event Monitoring Not Available"
      description="Event monitoring is only available in Agent Testing mode. Switch to Agent Testing to monitor agent events."
      action={{
        label: 'Go to Agent Connect',
        href: '/agent/connect',
      }}
    />
  );
}

// ============================================================================
// Skeleton
// ============================================================================
function MonitorPageSkeleton() {
  return (
    <div className="container max-w-6xl py-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 mt-2" />
      </div>
      <div className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>
        <Skeleton className="h-[500px] w-full rounded-lg" />
      </div>
    </div>
  );
}
