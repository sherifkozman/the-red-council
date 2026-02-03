import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCampaign, UseCampaignOptions, CampaignStatus } from './useCampaign';
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage';

// Mock safeLocalStorage
vi.mock('@/lib/persistence/safeLocalStorage', () => ({
  safeLocalStorage: {
    setItem: vi.fn(),
    getItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const mockedStorage = vi.mocked(safeLocalStorage);

// ============================================================================
// Test Helpers
// ============================================================================
function createMockOptions(
  overrides: Partial<UseCampaignOptions> = {}
): UseCampaignOptions {
  return {
    templateIds: ['template-1', 'template-2'],
    getTemplate: vi.fn().mockResolvedValue({ id: 'template-1', prompt: 'Test prompt' }),
    executeAttack: vi.fn().mockResolvedValue({ response: 'Test response', success: true }),
    delayBetweenAttacks: 0,
    sessionId: 'test-session',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================
describe('useCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('initializes with idle status', () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      expect(result.current.progress.status).toBe('idle');
      expect(result.current.progress.totalAttacks).toBe(2);
      expect(result.current.progress.completedAttacks).toBe(0);
      expect(result.current.isRunning).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isActive).toBe(false);
    });

    it('calculates progressPercent correctly', () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      expect(result.current.progressPercent).toBe(0);
    });

    it('restores paused state from storage', () => {
      const savedState = {
        progress: {
          status: 'paused' as CampaignStatus,
          totalAttacks: 2,
          completedAttacks: 1,
          successfulAttacks: 1,
          failedAttacks: 0,
          currentAttackId: null,
          currentAttackIndex: -1,
          elapsedSeconds: 10,
          errors: [],
        },
        results: [
          {
            templateId: 'template-1',
            prompt: 'Test',
            response: 'Response',
            success: true,
            durationMs: 100,
            error: null,
            timestamp: new Date().toISOString(),
          },
        ],
        startedAt: new Date().toISOString(),
        pausedAt: new Date().toISOString(),
      };
      mockedStorage.getItem.mockReturnValue(savedState);

      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      expect(result.current.progress.status).toBe('paused');
      expect(result.current.progress.completedAttacks).toBe(1);
      expect(result.current.results.length).toBe(1);
    });

    it('restores completed state from storage', () => {
      const savedState = {
        progress: {
          status: 'completed' as CampaignStatus,
          totalAttacks: 2,
          completedAttacks: 2,
          successfulAttacks: 2,
          failedAttacks: 0,
          currentAttackId: null,
          currentAttackIndex: -1,
          elapsedSeconds: 20,
          errors: [],
        },
        results: [],
        startedAt: new Date().toISOString(),
        pausedAt: null,
      };
      mockedStorage.getItem.mockReturnValue(savedState);

      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      expect(result.current.progress.status).toBe('completed');
    });
  });

  describe('start', () => {
    it('starts campaign and runs attacks', async () => {
      const getTemplate = vi.fn()
        .mockResolvedValueOnce({ id: 'template-1', prompt: 'Prompt 1' })
        .mockResolvedValueOnce({ id: 'template-2', prompt: 'Prompt 2' });
      const executeAttack = vi.fn()
        .mockResolvedValueOnce({ response: 'Response 1', success: true })
        .mockResolvedValueOnce({ response: 'Response 2', success: true });

      const options = createMockOptions({ getTemplate, executeAttack });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.progress.status).toBe('completed');
      expect(result.current.progress.completedAttacks).toBe(2);
      expect(result.current.progress.successfulAttacks).toBe(2);
      expect(result.current.results.length).toBe(2);
      expect(getTemplate).toHaveBeenCalledTimes(2);
      expect(executeAttack).toHaveBeenCalledTimes(2);
    });

    it('handles failed attacks', async () => {
      const getTemplate = vi.fn().mockResolvedValue({ id: 'template-1', prompt: 'Prompt 1' });
      const executeAttack = vi.fn().mockResolvedValue({ response: 'Failed', success: false });

      const options = createMockOptions({
        templateIds: ['template-1'],
        getTemplate,
        executeAttack,
      });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.progress.status).toBe('completed');
      expect(result.current.progress.failedAttacks).toBe(1);
      expect(result.current.results[0].success).toBe(false);
    });

    it('handles template not found', async () => {
      const getTemplate = vi.fn().mockResolvedValue(null);

      const options = createMockOptions({
        templateIds: ['missing-template'],
        getTemplate,
      });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.progress.status).toBe('completed');
      expect(result.current.progress.failedAttacks).toBe(1);
      expect(result.current.progress.errors.length).toBe(1);
      expect(result.current.progress.errors[0]).toContain('Template not found');
    });

    it('handles executeAttack throwing error', async () => {
      const getTemplate = vi.fn().mockResolvedValue({ id: 'template-1', prompt: 'Prompt' });
      const executeAttack = vi.fn().mockRejectedValue(new Error('Network error'));

      const options = createMockOptions({
        templateIds: ['template-1'],
        getTemplate,
        executeAttack,
      });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.progress.status).toBe('completed');
      expect(result.current.progress.failedAttacks).toBe(1);
      expect(result.current.results[0].error).toBe('Network error');
    });

    it('fails immediately with no templates', async () => {
      const options = createMockOptions({ templateIds: [] });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.progress.status).toBe('failed');
      expect(result.current.progress.errors).toContain('No templates selected');
    });

    it('calls onComplete callback', async () => {
      const onComplete = vi.fn();
      const options = createMockOptions({
        templateIds: ['template-1'],
        onComplete,
      });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ templateId: 'template-1' }),
      ]));
    });

    it('calls onProgressUpdate callback', async () => {
      const onProgressUpdate = vi.fn();
      const options = createMockOptions({
        templateIds: ['template-1'],
        onProgressUpdate,
      });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      // Called at least once during attack execution
      expect(onProgressUpdate).toHaveBeenCalled();
    });

    it('saves state to storage during campaign', async () => {
      const options = createMockOptions({ templateIds: ['template-1'] });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(mockedStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    it('pauses running campaign', async () => {
      // Create a slow attack to allow pause
      const executeAttack = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ response: 'OK', success: true }), 1000))
      );

      const options = createMockOptions({
        templateIds: ['t1', 't2', 't3'],
        executeAttack,
      });
      const { result } = renderHook(() => useCampaign(options));

      // Start campaign
      act(() => {
        result.current.start();
      });

      // Wait for running state
      await waitFor(() => {
        expect(result.current.progress.status).toBe('running');
      });

      // Pause
      act(() => {
        result.current.pause();
      });

      expect(result.current.progress.status).toBe('paused');
      expect(result.current.isPaused).toBe(true);
    });

    it('does nothing when pausing non-running campaign', () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      act(() => {
        result.current.pause();
      });

      expect(result.current.progress.status).toBe('idle');
    });

    it('resumes paused campaign', async () => {
      const savedState = {
        progress: {
          status: 'paused' as CampaignStatus,
          totalAttacks: 2,
          completedAttacks: 1,
          successfulAttacks: 1,
          failedAttacks: 0,
          currentAttackId: null,
          currentAttackIndex: 0,
          elapsedSeconds: 5,
          errors: [],
        },
        results: [],
        startedAt: new Date().toISOString(),
        pausedAt: new Date().toISOString(),
      };
      mockedStorage.getItem.mockReturnValue(savedState);

      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      expect(result.current.progress.status).toBe('paused');

      act(() => {
        result.current.resume();
      });

      expect(result.current.progress.status).toBe('running');
    });

    it('does nothing when resuming non-paused campaign', () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      act(() => {
        result.current.resume();
      });

      expect(result.current.progress.status).toBe('idle');
    });
  });

  describe('cancel', () => {
    it('cancels running campaign', async () => {
      const executeAttack = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ response: 'OK', success: true }), 500))
      );

      const options = createMockOptions({
        templateIds: ['t1', 't2', 't3'],
        executeAttack,
      });
      const { result } = renderHook(() => useCampaign(options));

      // Start campaign
      act(() => {
        result.current.start();
      });

      // Wait for running state
      await waitFor(() => {
        expect(result.current.progress.status).toBe('running');
      });

      // Cancel
      act(() => {
        result.current.cancel();
      });

      // Allow cancellation to process
      await waitFor(() => {
        expect(result.current.progress.status).toBe('cancelled');
      });
    });

    it('does nothing when cancelling idle campaign', () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      act(() => {
        result.current.cancel();
      });

      expect(result.current.progress.status).toBe('idle');
    });
  });

  describe('reset', () => {
    it('resets campaign to initial state', async () => {
      const options = createMockOptions({ templateIds: ['template-1'] });
      const { result } = renderHook(() => useCampaign(options));

      // Run campaign first
      await act(async () => {
        await result.current.start();
      });

      expect(result.current.progress.status).toBe('completed');

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.progress.status).toBe('idle');
      expect(result.current.results.length).toBe(0);
      expect(result.current.progress.completedAttacks).toBe(0);
    });

    it('clears storage on reset', () => {
      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      act(() => {
        result.current.reset();
      });

      expect(mockedStorage.removeItem).toHaveBeenCalled();
    });
  });

  describe('computed values', () => {
    it('isActive is true when running', async () => {
      const executeAttack = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ response: 'OK', success: true }), 100))
      );

      const options = createMockOptions({
        templateIds: ['t1'],
        executeAttack,
      });
      const { result } = renderHook(() => useCampaign(options));

      act(() => {
        result.current.start();
      });

      await waitFor(() => {
        expect(result.current.isActive).toBe(true);
      });
    });

    it('isComplete is true when completed', async () => {
      const options = createMockOptions({ templateIds: ['template-1'] });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.isComplete).toBe(true);
    });

    it('updates progressPercent during campaign', async () => {
      const options = createMockOptions({ templateIds: ['t1', 't2'] });
      const { result } = renderHook(() => useCampaign(options));

      await act(async () => {
        await result.current.start();
      });

      expect(result.current.progressPercent).toBe(100);
    });
  });

  describe('timer', () => {
    it('updates elapsed seconds while running', async () => {
      const executeAttack = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ response: 'OK', success: true }), 2000))
      );

      const options = createMockOptions({
        templateIds: ['t1'],
        executeAttack,
      });
      const { result } = renderHook(() => useCampaign(options));

      act(() => {
        result.current.start();
      });

      // Advance timer
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      // Timer should have updated
      expect(result.current.progress.elapsedSeconds).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles template count change in idle state', () => {
      const options = createMockOptions({ templateIds: ['t1'] });
      const { result, rerender } = renderHook(
        (props) => useCampaign(props),
        { initialProps: options }
      );

      expect(result.current.progress.totalAttacks).toBe(1);

      rerender({ ...options, templateIds: ['t1', 't2', 't3'] });

      expect(result.current.progress.totalAttacks).toBe(3);
    });

    it('handles storage load failure gracefully', () => {
      mockedStorage.getItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const options = createMockOptions();
      const { result } = renderHook(() => useCampaign(options));

      // Should fall back to initial state
      expect(result.current.progress.status).toBe('idle');
    });

    it('handles storage save failure gracefully', async () => {
      mockedStorage.setItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const options = createMockOptions({ templateIds: ['t1'] });
      const { result } = renderHook(() => useCampaign(options));

      // Should still complete despite storage error
      await act(async () => {
        await result.current.start();
      });

      expect(result.current.progress.status).toBe('completed');
    });
  });
});
