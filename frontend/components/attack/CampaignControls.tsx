'use client';

import { Pause, Play, Square, RefreshCw, AlertCircle } from 'lucide-react';
import { memo } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CampaignStatus } from '@/hooks/useCampaign';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface CampaignControlsProps {
  /**
   * Current campaign status
   */
  status: CampaignStatus;

  /**
   * Number of selected templates
   */
  selectedCount: number;

  /**
   * Whether remote agent is configured
   */
  isAgentConfigured: boolean;

  /**
   * Whether the start action is loading
   */
  isStarting?: boolean;

  /**
   * Start campaign handler
   */
  onStart: () => void;

  /**
   * Pause campaign handler
   */
  onPause: () => void;

  /**
   * Resume campaign handler
   */
  onResume: () => void;

  /**
   * Cancel campaign handler
   */
  onCancel: () => void;

  /**
   * Reset/clear campaign handler
   */
  onReset: () => void;

  /**
   * Additional class names
   */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================
const STATUS_LABELS: Record<CampaignStatus, string> = {
  idle: 'Ready',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  paused: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// ============================================================================
// Component
// ============================================================================
function CampaignControlsComponent({
  status,
  selectedCount,
  isAgentConfigured,
  isStarting = false,
  onStart,
  onPause,
  onResume,
  onCancel,
  onReset,
  className,
}: CampaignControlsProps) {
  // -------------------------------------------------------------------------
  // Derived State
  // -------------------------------------------------------------------------
  const canStart =
    isAgentConfigured &&
    selectedCount > 0 &&
    (status === 'idle' || status === 'completed' || status === 'cancelled' || status === 'failed');

  const canPause = status === 'running';
  const canResume = status === 'paused';
  const canCancel = status === 'running' || status === 'paused';
  const canReset =
    status === 'completed' || status === 'cancelled' || status === 'failed' || status === 'paused';

  // Prerequisites check
  const missingPrerequisites: string[] = [];
  if (!isAgentConfigured) {
    missingPrerequisites.push('Configure remote agent endpoint');
  }
  if (selectedCount === 0) {
    missingPrerequisites.push('Select at least one attack template');
  }

  const showPrerequisiteWarning =
    missingPrerequisites.length > 0 && status === 'idle';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className={cn('space-y-4', className)}>
      {/* Prerequisites Warning */}
      {showPrerequisiteWarning && (
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            <span className="font-medium">Prerequisites not met:</span>
            <ul className="mt-1 list-disc list-inside text-sm">
              {missingPrerequisites.map((prereq) => (
                <li key={prereq}>{prereq}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
              STATUS_COLORS[status]
            )}
            role="status"
            aria-live="polite"
          >
            {STATUS_LABELS[status]}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {selectedCount} template{selectedCount !== 1 ? 's' : ''} selected
        </span>
      </div>

      {/* Control Buttons */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Campaign controls"
      >
        {/* Start Button */}
        <Button
          onClick={onStart}
          disabled={!canStart || isStarting}
          variant="default"
          size="sm"
          aria-label={`Start campaign with ${selectedCount} templates`}
        >
          <Play className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {isStarting ? 'Starting...' : 'Start Campaign'}
        </Button>

        {/* Pause Button */}
        <Button
          onClick={onPause}
          disabled={!canPause}
          variant="outline"
          size="sm"
          aria-label="Pause campaign"
        >
          <Pause className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Pause
        </Button>

        {/* Resume Button */}
        <Button
          onClick={onResume}
          disabled={!canResume}
          variant="outline"
          size="sm"
          aria-label="Resume campaign"
        >
          <Play className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Resume
        </Button>

        {/* Cancel Button */}
        <Button
          onClick={onCancel}
          disabled={!canCancel}
          variant="destructive"
          size="sm"
          aria-label="Cancel campaign"
        >
          <Square className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Cancel
        </Button>

        {/* Reset Button */}
        <Button
          onClick={onReset}
          disabled={!canReset}
          variant="ghost"
          size="sm"
          aria-label="Reset campaign and clear results"
        >
          <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Reset
        </Button>
      </div>
    </div>
  );
}

export const CampaignControls = memo(CampaignControlsComponent);
