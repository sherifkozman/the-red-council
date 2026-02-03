'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Loader2,
  Timer,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export type TemplateStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface TemplateProgress {
  /**
   * Template ID
   */
  templateId: string;

  /**
   * Display name for the template (optional, defaults to ID)
   */
  name?: string;

  /**
   * Current status
   */
  status: TemplateStatus;

  /**
   * Execution duration in milliseconds (if complete or failed)
   */
  durationMs?: number;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Response from the attack (if complete)
   */
  response?: string;

  /**
   * Whether the attack was successful (only meaningful if complete)
   */
  success?: boolean;

  /**
   * The prompt that was sent
   */
  prompt?: string;
}

export interface CampaignProgressProps {
  /**
   * List of templates with their progress status
   */
  templates: TemplateProgress[];

  /**
   * Index of the currently running template (for highlighting)
   */
  currentIndex: number;

  /**
   * Total elapsed time in seconds
   */
  elapsedSeconds: number;

  /**
   * Whether the campaign is currently running
   */
  isRunning: boolean;

  /**
   * Additional class names
   */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================
const STATUS_CONFIG: Record<
  TemplateStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
    className: string;
  }
> = {
  pending: {
    icon: CircleDashed,
    label: 'Pending',
    badgeVariant: 'outline',
    className: 'text-muted-foreground',
  },
  running: {
    icon: Loader2,
    label: 'Running',
    badgeVariant: 'default',
    className: 'text-blue-600',
  },
  complete: {
    icon: CheckCircle2,
    label: 'Complete',
    badgeVariant: 'secondary',
    className: 'text-green-600',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    badgeVariant: 'destructive',
    className: 'text-red-600',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Estimate remaining time based on completed work
 */
function estimateRemainingTime(
  completedCount: number,
  totalCount: number,
  elapsedSeconds: number
): string {
  if (completedCount === 0 || elapsedSeconds === 0) {
    return 'Calculating...';
  }

  const avgTimePerTemplate = elapsedSeconds / completedCount;
  const remainingTemplates = totalCount - completedCount;
  const estimatedRemainingSeconds = Math.ceil(avgTimePerTemplate * remainingTemplates);

  if (estimatedRemainingSeconds <= 0) {
    return 'Almost done';
  }

  return `~${formatTime(estimatedRemainingSeconds)}`;
}

// ============================================================================
// Sub-components
// ============================================================================
interface TemplateItemProps {
  template: TemplateProgress;
  isHighlighted: boolean;
  index: number;
}

const TemplateItem = memo(function TemplateItem({
  template,
  isHighlighted,
  index,
}: TemplateItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = STATUS_CONFIG[template.status];
  const StatusIcon = config.icon;

  const hasDetails = Boolean(
    template.prompt || template.response || template.error || template.durationMs
  );

  // Truncate long IDs for display
  const displayName = template.name || template.templateId;
  const truncatedName =
    displayName.length > 30 ? `${displayName.substring(0, 27)}...` : displayName;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          'flex items-center justify-between w-full p-3 text-left rounded-lg transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          isHighlighted
            ? 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800'
            : 'hover:bg-muted/50',
          hasDetails && 'cursor-pointer'
        )}
        disabled={!hasDetails}
        aria-expanded={hasDetails ? isOpen : undefined}
        aria-label={`Template ${displayName}, status: ${config.label}${
          isHighlighted ? ', currently running' : ''
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Expand icon or number */}
          {hasDetails ? (
            isOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )
          ) : (
            <span className="w-4 text-center text-xs text-muted-foreground shrink-0">
              {index + 1}
            </span>
          )}

          {/* Status icon */}
          <StatusIcon
            className={cn(
              'h-4 w-4 shrink-0',
              config.className,
              template.status === 'running' && 'animate-spin'
            )}
            aria-hidden="true"
          />

          {/* Template name */}
          <span
            className={cn(
              'font-mono text-sm truncate',
              isHighlighted && 'font-medium'
            )}
            title={displayName}
          >
            {truncatedName}
          </span>

          {/* Status badge */}
          <Badge variant={config.badgeVariant} className="text-xs shrink-0">
            {template.status === 'complete' && template.success === false
              ? 'Jailbroken'
              : config.label}
          </Badge>
        </div>

        {/* Duration */}
        {template.durationMs !== undefined && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{formatDuration(template.durationMs)}</span>
          </div>
        )}
      </CollapsibleTrigger>

      {hasDetails && (
        <CollapsibleContent>
          <div className="p-3 pt-1 pl-11 space-y-3">
            {template.prompt && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-1">
                  Prompt
                </h5>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-24 whitespace-pre-wrap">
                  {template.prompt.length > 300
                    ? `${template.prompt.substring(0, 300)}...`
                    : template.prompt}
                </pre>
              </div>
            )}
            {template.response && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-1">
                  Response
                </h5>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-24 whitespace-pre-wrap">
                  {template.response.length > 300
                    ? `${template.response.substring(0, 300)}...`
                    : template.response}
                </pre>
              </div>
            )}
            {template.error && (
              <div className="flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{template.error}</span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
});

interface OverallStatsProps {
  templates: TemplateProgress[];
  elapsedSeconds: number;
  isRunning: boolean;
}

const OverallStats = memo(function OverallStats({
  templates,
  elapsedSeconds,
  isRunning,
}: OverallStatsProps) {
  const stats = useMemo(() => {
    // Single pass through templates for efficiency
    const counts = templates.reduce(
      (acc, t) => {
        acc[t.status]++;
        if (t.status === 'complete') {
          if (t.success === true) {
            acc.successful++;
          } else {
            acc.jailbroken++;
          }
        }
        return acc;
      },
      { pending: 0, running: 0, complete: 0, failed: 0, successful: 0, jailbroken: 0 }
    );

    const totalCompleted = counts.complete + counts.failed;
    const total = templates.length;
    const progressPercent = total > 0 ? Math.round((totalCompleted / total) * 100) : 0;

    // Success rate: successful defenses out of completed attacks
    const successRate =
      totalCompleted > 0 ? Math.round((counts.successful / totalCompleted) * 100) : 0;

    return {
      ...counts,
      totalCompleted,
      total,
      progressPercent,
      successRate,
    };
  }, [templates]);

  const estimatedRemaining = useMemo(() => {
    if (!isRunning || stats.totalCompleted === 0) {
      return null;
    }
    return estimateRemainingTime(stats.totalCompleted, stats.total, elapsedSeconds);
  }, [isRunning, stats.totalCompleted, stats.total, elapsedSeconds]);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {stats.totalCompleted} of {stats.total} templates processed
          </span>
          <span className="font-medium">{stats.progressPercent}%</span>
        </div>
        <Progress
          value={stats.progressPercent}
          className="h-2"
          aria-label={`Progress: ${stats.progressPercent}%`}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-600" aria-hidden="true" />
            Defended
          </span>
          <span className="text-lg font-semibold text-green-600">
            {stats.successful}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-orange-600" aria-hidden="true" />
            Jailbroken
          </span>
          <span className="text-lg font-semibold text-orange-600">
            {stats.jailbroken}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-600" aria-hidden="true" />
            Errors
          </span>
          <span className="text-lg font-semibold text-red-600">
            {stats.failed}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" aria-hidden="true" />
            Defense Rate
          </span>
          <span
            className={cn(
              'text-lg font-semibold',
              stats.successRate >= 50 ? 'text-green-600' : 'text-red-600'
            )}
          >
            {stats.successRate}%
          </span>
        </div>
      </div>

      {/* Time info */}
      <div className="flex justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Elapsed: {formatTime(elapsedSeconds)}
        </span>
        {estimatedRemaining && (
          <span className="flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
            Remaining: {estimatedRemaining}
          </span>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================
function CampaignProgressComponent({
  templates,
  currentIndex,
  elapsedSeconds,
  isRunning,
  className,
}: CampaignProgressProps) {
  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
          Campaign Progress
          {isRunning && (
            <Badge variant="default" className="text-xs">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" />
              Running
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall stats */}
        <OverallStats
          templates={templates}
          elapsedSeconds={elapsedSeconds}
          isRunning={isRunning}
        />

        {/* Template list */}
        <div>
          <h4 className="text-sm font-medium mb-3">Template Status</h4>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1">
              {templates.map((template, index) => (
                <TemplateItem
                  key={template.templateId}
                  template={template}
                  isHighlighted={index === currentIndex && isRunning}
                  index={index}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

export const CampaignProgress = memo(CampaignProgressComponent);
