'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileWarning,
  Loader2,
  Target,
  Timer,
  XCircle,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CampaignControls } from '@/components/attack/CampaignControls';
import { useCampaign, AttackResult, CampaignProgress, CampaignStatus } from '@/hooks/useCampaign';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface CampaignRunnerProps {
  /**
   * Selected template IDs to run
   */
  selectedTemplateIds: string[];

  /**
   * Whether the remote agent is configured
   */
  isAgentConfigured: boolean;

  /**
   * Function to get template by ID
   */
  getTemplate: (id: string) => Promise<{ id: string; prompt: string } | null>;

  /**
   * Function to execute attack against agent
   */
  executeAttack: (prompt: string) => Promise<{ response: string; success: boolean }>;

  /**
   * Session ID for state persistence
   */
  sessionId?: string;

  /**
   * Callback when campaign completes
   */
  onComplete?: (results: AttackResult[]) => void;

  /**
   * Additional class names
   */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  } catch {
    return timestamp;
  }
}

// ============================================================================
// Sub-components
// ============================================================================
interface ProgressStatsProps {
  progress: CampaignProgress;
}

const ProgressStats = memo(function ProgressStats({ progress }: ProgressStatsProps) {
  const {
    totalAttacks,
    completedAttacks,
    successfulAttacks,
    failedAttacks,
    elapsedSeconds,
  } = progress;

  const successRate =
    completedAttacks > 0
      ? Math.round((successfulAttacks / completedAttacks) * 100)
      : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Progress</span>
        <span className="text-lg font-semibold">
          {completedAttacks}/{totalAttacks}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Success Rate</span>
        <span
          className={cn(
            'text-lg font-semibold',
            successRate >= 50 ? 'text-green-600' : 'text-red-600'
          )}
        >
          {successRate}%
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Failed</span>
        <span className="text-lg font-semibold text-red-600">{failedAttacks}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Elapsed</span>
        <span className="text-lg font-semibold">{formatDuration(elapsedSeconds)}</span>
      </div>
    </div>
  );
});

interface CurrentAttackIndicatorProps {
  currentAttackId: string | null;
  currentAttackIndex: number;
  totalAttacks: number;
}

const CurrentAttackIndicator = memo(function CurrentAttackIndicator({
  currentAttackId,
  currentAttackIndex,
  totalAttacks,
}: CurrentAttackIndicatorProps) {
  if (!currentAttackId) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>
        Executing attack {currentAttackIndex + 1} of {totalAttacks}
      </span>
      <Badge variant="outline" className="font-mono text-xs">
        {currentAttackId.length > 20
          ? `${currentAttackId.substring(0, 20)}...`
          : currentAttackId}
      </Badge>
    </div>
  );
});

interface ResultItemProps {
  result: AttackResult;
  index: number;
}

const ResultItem = memo(function ResultItem({ result, index }: ResultItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  const statusIcon = result.success ? (
    <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
  ) : (
    <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
  );

  const statusLabel = result.success ? 'Success' : 'Failed';

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 rounded-lg transition-colors">
        <div className="flex items-center gap-3">
          {statusIcon}
          <span className="font-mono text-sm truncate max-w-[200px]">
            {result.templateId}
          </span>
          <Badge variant={result.success ? 'default' : 'destructive'} className="text-xs">
            {statusLabel}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{result.durationMs}ms</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 pt-0 space-y-3">
          {result.prompt && (
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">
                Prompt
              </h5>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap">
                {result.prompt.length > 500
                  ? `${result.prompt.substring(0, 500)}...`
                  : result.prompt}
              </pre>
            </div>
          )}
          {result.response && (
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">
                Response
              </h5>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap">
                {result.response.length > 500
                  ? `${result.response.substring(0, 500)}...`
                  : result.response}
              </pre>
            </div>
          )}
          {result.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{result.error}</AlertDescription>
            </Alert>
          )}
          <div className="text-xs text-muted-foreground">
            <Clock className="h-3 w-3 inline mr-1" aria-hidden="true" />
            {formatTimestamp(result.timestamp)}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

interface ResultsSummaryProps {
  results: AttackResult[];
  errors: string[];
}

const ResultsSummary = memo(function ResultsSummary({
  results,
  errors,
}: ResultsSummaryProps) {
  if (results.length === 0) return null;

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const avgDuration =
    results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.durationMs, 0) / results.length)
      : 0;

  return (
    <div className="space-y-4">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Target className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Total Attacks</p>
              <p className="text-lg font-semibold">{results.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Successful</p>
              <p className="text-lg font-semibold text-green-600">{successful}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-lg font-semibold text-red-600">{failed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Timer className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted-foreground">Avg Duration</p>
              <p className="text-lg font-semibold">{avgDuration}ms</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <FileWarning className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Campaign Errors</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside text-sm mt-1">
              {errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Results List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attack Results</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {results.map((result, index) => (
                <ResultItem key={`${result.templateId}-${index}`} result={result} index={index} />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================
function CampaignRunnerComponent({
  selectedTemplateIds,
  isAgentConfigured,
  getTemplate,
  executeAttack,
  sessionId,
  onComplete,
  className,
}: CampaignRunnerProps) {
  const [isStarting, setIsStarting] = useState(false);

  const {
    progress,
    results,
    isRunning,
    isPaused,
    isActive,
    isComplete,
    progressPercent,
    start,
    pause,
    resume,
    cancel,
    reset,
  } = useCampaign({
    templateIds: selectedTemplateIds,
    getTemplate,
    executeAttack,
    sessionId,
    onComplete,
  });

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    try {
      await start();
    } finally {
      setIsStarting(false);
    }
  }, [start]);

  // Show completion status
  const completionStatus = useMemo(() => {
    if (progress.status === 'completed') {
      return {
        variant: 'default' as const,
        icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
        title: 'Campaign Completed',
        description: `${progress.successfulAttacks} of ${progress.totalAttacks} attacks successful.`,
      };
    }
    if (progress.status === 'cancelled') {
      return {
        variant: 'default' as const,
        icon: <AlertCircle className="h-4 w-4" aria-hidden="true" />,
        title: 'Campaign Cancelled',
        description: `Completed ${progress.completedAttacks} of ${progress.totalAttacks} attacks before cancellation.`,
      };
    }
    if (progress.status === 'failed') {
      return {
        variant: 'destructive' as const,
        icon: <XCircle className="h-4 w-4" aria-hidden="true" />,
        title: 'Campaign Failed',
        description: 'The campaign encountered an error. Check the errors below.',
      };
    }
    return null;
  }, [progress]);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Controls */}
      <CampaignControls
        status={progress.status}
        selectedCount={selectedTemplateIds.length}
        isAgentConfigured={isAgentConfigured}
        isStarting={isStarting}
        onStart={handleStart}
        onPause={pause}
        onResume={resume}
        onCancel={cancel}
        onReset={reset}
      />

      {/* Progress Section */}
      {(isActive || isComplete) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" aria-hidden="true" />
              Campaign Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {progress.completedAttacks} of {progress.totalAttacks} attacks
                </span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <Progress
                value={progressPercent}
                className="h-2"
                aria-label={`Campaign progress: ${progressPercent}%`}
              />
            </div>

            {/* Current Attack */}
            {isRunning && (
              <CurrentAttackIndicator
                currentAttackId={progress.currentAttackId}
                currentAttackIndex={progress.currentAttackIndex}
                totalAttacks={progress.totalAttacks}
              />
            )}

            {/* Stats */}
            <ProgressStats progress={progress} />
          </CardContent>
        </Card>
      )}

      {/* Completion Status */}
      {completionStatus && (
        <Alert variant={completionStatus.variant}>
          {completionStatus.icon}
          <AlertTitle>{completionStatus.title}</AlertTitle>
          <AlertDescription>{completionStatus.description}</AlertDescription>
        </Alert>
      )}

      {/* Results Summary */}
      {isComplete && (
        <ResultsSummary results={results} errors={progress.errors} />
      )}
    </div>
  );
}

export const CampaignRunner = memo(CampaignRunnerComponent);
