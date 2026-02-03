'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';

// ============================================================================
// Types
// ============================================================================
export type CampaignStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface AttackResult {
  templateId: string;
  prompt: string;
  response: string | null;
  success: boolean;
  durationMs: number;
  error: string | null;
  timestamp: string;
}

export interface CampaignProgress {
  status: CampaignStatus;
  totalAttacks: number;
  completedAttacks: number;
  successfulAttacks: number;
  failedAttacks: number;
  currentAttackId: string | null;
  currentAttackIndex: number;
  elapsedSeconds: number;
  errors: string[];
}

export interface CampaignState {
  progress: CampaignProgress;
  results: AttackResult[];
  startedAt: string | null;
  pausedAt: string | null;
}

export interface UseCampaignOptions {
  /**
   * Selected template IDs to run
   */
  templateIds: string[];

  /**
   * Callback to fetch a template by ID
   */
  getTemplate: (id: string) => Promise<{ id: string; prompt: string } | null>;

  /**
   * Callback to execute an attack against the remote agent
   */
  executeAttack: (prompt: string) => Promise<{ response: string; success: boolean }>;

  /**
   * Delay between attacks in milliseconds
   */
  delayBetweenAttacks?: number;

  /**
   * Session ID for persistence
   */
  sessionId?: string;

  /**
   * Callback when campaign completes
   */
  onComplete?: (results: AttackResult[]) => void;

  /**
   * Callback when progress updates
   */
  onProgressUpdate?: (progress: CampaignProgress) => void;
}

// ============================================================================
// Constants
// ============================================================================
const STORAGE_KEY_PREFIX = 'campaign_state_';
const DEFAULT_DELAY_MS = 500;

// ============================================================================
// Helpers
// ============================================================================
function createInitialProgress(totalAttacks: number): CampaignProgress {
  return {
    status: 'idle',
    totalAttacks,
    completedAttacks: 0,
    successfulAttacks: 0,
    failedAttacks: 0,
    currentAttackId: null,
    currentAttackIndex: -1,
    elapsedSeconds: 0,
    errors: [],
  };
}

function createInitialState(totalAttacks: number): CampaignState {
  return {
    progress: createInitialProgress(totalAttacks),
    results: [],
    startedAt: null,
    pausedAt: null,
  };
}

// ============================================================================
// Hook
// ============================================================================
export function useCampaign(options: UseCampaignOptions) {
  const {
    templateIds,
    getTemplate,
    executeAttack,
    delayBetweenAttacks = DEFAULT_DELAY_MS,
    sessionId,
    onComplete,
    onProgressUpdate,
  } = options;

  // State
  const [state, setState] = useState<CampaignState>(() =>
    createInitialState(templateIds.length)
  );

  // Refs for async control
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedTimeRef = useRef<number>(0);

  // Storage key for persistence
  const storageKey = sessionId ? `${STORAGE_KEY_PREFIX}${sessionId}` : null;

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------
  const saveState = useCallback(
    (newState: CampaignState) => {
      if (storageKey) {
        try {
          safeLocalStorage.setItem(storageKey, newState);
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[useCampaign] Failed to save state:', error);
          }
        }
      }
    },
    [storageKey]
  );

  const loadState = useCallback((): CampaignState | null => {
    if (!storageKey) return null;
    try {
      const saved = safeLocalStorage.getItem<CampaignState>(storageKey);
      if (saved && typeof saved === 'object' && 'progress' in saved) {
        return saved;
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[useCampaign] Failed to load state:', error);
      }
    }
    return null;
  }, [storageKey]);

  const clearState = useCallback(() => {
    if (storageKey) {
      try {
        safeLocalStorage.removeItem(storageKey);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[useCampaign] Failed to clear state:', error);
        }
      }
    }
  }, [storageKey]);

  // -------------------------------------------------------------------------
  // Timer Management
  // -------------------------------------------------------------------------
  const startTimer = useCallback(() => {
    if (timerRef.current) return;

    timerRef.current = setInterval(() => {
      if (startTimeRef.current === null) return;

      const now = Date.now();
      const elapsed = Math.floor((now - startTimeRef.current - pausedTimeRef.current) / 1000);

      setState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          elapsedSeconds: elapsed,
        },
      }));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Campaign Actions
  // -------------------------------------------------------------------------
  const start = useCallback(async () => {
    if (templateIds.length === 0) {
      setState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          status: 'failed',
          errors: [...prev.progress.errors, 'No templates selected'],
        },
      }));
      return;
    }

    // Reset state
    isPausedRef.current = false;
    isCancelledRef.current = false;
    pausedTimeRef.current = 0;
    startTimeRef.current = Date.now();

    const newState: CampaignState = {
      progress: {
        ...createInitialProgress(templateIds.length),
        status: 'running',
      },
      results: [],
      startedAt: new Date().toISOString(),
      pausedAt: null,
    };

    setState(newState);
    saveState(newState);
    startTimer();

    // Run attacks sequentially
    const results: AttackResult[] = [];
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < templateIds.length; i++) {
      // Check for cancellation
      if (isCancelledRef.current) {
        const cancelledProgress: CampaignProgress = {
          status: 'cancelled',
          totalAttacks: templateIds.length,
          completedAttacks: i,
          successfulAttacks: successCount,
          failedAttacks: failCount,
          currentAttackId: null,
          currentAttackIndex: -1,
          elapsedSeconds: startTimeRef.current
            ? Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000)
            : 0,
          errors,
        };

        const cancelledState: CampaignState = {
          progress: cancelledProgress,
          results,
          startedAt: newState.startedAt,
          pausedAt: null,
        };

        setState(cancelledState);
        saveState(cancelledState);
        stopTimer();
        return;
      }

      // Check for pause
      while (isPausedRef.current && !isCancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const templateId = templateIds[i];

      // Update progress to show current attack
      setState((prev) => {
        const updatedProgress: CampaignProgress = {
          ...prev.progress,
          currentAttackId: templateId,
          currentAttackIndex: i,
        };
        onProgressUpdate?.(updatedProgress);
        return {
          ...prev,
          progress: updatedProgress,
        };
      });

      const attackStartTime = Date.now();

      try {
        // Fetch template
        const template = await getTemplate(templateId);
        if (!template) {
          errors.push(`Template not found: ${templateId}`);
          failCount++;
          results.push({
            templateId,
            prompt: '',
            response: null,
            success: false,
            durationMs: Date.now() - attackStartTime,
            error: 'Template not found',
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Execute attack
        const { response, success } = await executeAttack(template.prompt);
        const durationMs = Date.now() - attackStartTime;

        if (success) {
          successCount++;
        } else {
          failCount++;
        }

        results.push({
          templateId,
          prompt: template.prompt,
          response,
          success,
          durationMs,
          error: null,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Attack failed for ${templateId}: ${errorMessage}`);
        failCount++;

        results.push({
          templateId,
          prompt: '',
          response: null,
          success: false,
          durationMs: Date.now() - attackStartTime,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }

      // Update progress after each attack
      const currentProgress: CampaignProgress = {
        status: 'running',
        totalAttacks: templateIds.length,
        completedAttacks: i + 1,
        successfulAttacks: successCount,
        failedAttacks: failCount,
        currentAttackId: templateId,
        currentAttackIndex: i,
        elapsedSeconds: startTimeRef.current
          ? Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000)
          : 0,
        errors,
      };

      const updatedState: CampaignState = {
        progress: currentProgress,
        results: [...results],
        startedAt: newState.startedAt,
        pausedAt: null,
      };

      setState(updatedState);
      saveState(updatedState);
      onProgressUpdate?.(currentProgress);

      // Delay between attacks (unless this is the last one)
      if (i < templateIds.length - 1 && delayBetweenAttacks > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenAttacks));
      }
    }

    // Campaign completed
    const finalProgress: CampaignProgress = {
      status: 'completed',
      totalAttacks: templateIds.length,
      completedAttacks: templateIds.length,
      successfulAttacks: successCount,
      failedAttacks: failCount,
      currentAttackId: null,
      currentAttackIndex: -1,
      elapsedSeconds: startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000)
        : 0,
      errors,
    };

    const finalState: CampaignState = {
      progress: finalProgress,
      results,
      startedAt: newState.startedAt,
      pausedAt: null,
    };

    setState(finalState);
    saveState(finalState);
    stopTimer();
    onComplete?.(results);
  }, [
    templateIds,
    getTemplate,
    executeAttack,
    delayBetweenAttacks,
    saveState,
    startTimer,
    stopTimer,
    onComplete,
    onProgressUpdate,
  ]);

  const pause = useCallback(() => {
    if (state.progress.status !== 'running') return;

    isPausedRef.current = true;
    const pauseTime = Date.now();
    stopTimer();

    setState((prev) => {
      const pausedProgress: CampaignProgress = {
        ...prev.progress,
        status: 'paused',
      };

      const pausedState: CampaignState = {
        ...prev,
        progress: pausedProgress,
        pausedAt: new Date(pauseTime).toISOString(),
      };

      saveState(pausedState);
      return pausedState;
    });
  }, [state.progress.status, stopTimer, saveState]);

  const resume = useCallback(() => {
    if (state.progress.status !== 'paused') return;

    // Calculate time spent paused
    if (state.pausedAt) {
      const pausedDuration = Date.now() - new Date(state.pausedAt).getTime();
      pausedTimeRef.current += pausedDuration;
    }

    isPausedRef.current = false;
    startTimer();

    setState((prev) => {
      const resumedProgress: CampaignProgress = {
        ...prev.progress,
        status: 'running',
      };

      const resumedState: CampaignState = {
        ...prev,
        progress: resumedProgress,
        pausedAt: null,
      };

      saveState(resumedState);
      return resumedState;
    });
  }, [state.progress.status, state.pausedAt, startTimer, saveState]);

  const cancel = useCallback(() => {
    if (state.progress.status !== 'running' && state.progress.status !== 'paused') {
      return;
    }

    isCancelledRef.current = true;
    isPausedRef.current = false; // Unpause to allow cancellation to proceed
    stopTimer();
  }, [state.progress.status, stopTimer]);

  const reset = useCallback(() => {
    isPausedRef.current = false;
    isCancelledRef.current = false;
    pausedTimeRef.current = 0;
    startTimeRef.current = null;
    stopTimer();
    clearState();

    setState(createInitialState(templateIds.length));
  }, [templateIds.length, stopTimer, clearState]);

  // -------------------------------------------------------------------------
  // Restore State on Mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const savedState = loadState();
    if (savedState) {
      // Only restore if campaign was paused (not running)
      if (savedState.progress.status === 'paused') {
        setState(savedState);
      } else if (
        savedState.progress.status === 'completed' ||
        savedState.progress.status === 'cancelled' ||
        savedState.progress.status === 'failed'
      ) {
        // Show previous results
        setState(savedState);
      }
    }
  }, [loadState]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      stopTimer();
    };
  }, [stopTimer]);

  // Update template count when templateIds change
  useEffect(() => {
    if (state.progress.status === 'idle') {
      setState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          totalAttacks: templateIds.length,
        },
      }));
    }
  }, [templateIds.length, state.progress.status]);

  // -------------------------------------------------------------------------
  // Computed Values
  // -------------------------------------------------------------------------
  const isRunning = state.progress.status === 'running';
  const isPaused = state.progress.status === 'paused';
  const isActive = isRunning || isPaused;
  const isComplete =
    state.progress.status === 'completed' ||
    state.progress.status === 'cancelled' ||
    state.progress.status === 'failed';

  const progressPercent =
    state.progress.totalAttacks > 0
      ? Math.round((state.progress.completedAttacks / state.progress.totalAttacks) * 100)
      : 0;

  return {
    // State
    progress: state.progress,
    results: state.results,
    startedAt: state.startedAt,

    // Computed
    isRunning,
    isPaused,
    isActive,
    isComplete,
    progressPercent,

    // Actions
    start,
    pause,
    resume,
    cancel,
    reset,
  };
}
