import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignRunner, CampaignRunnerProps } from './CampaignRunner';
import * as useCampaignModule from '@/hooks/useCampaign';

// Mock useCampaign hook
vi.mock('@/hooks/useCampaign', () => ({
  useCampaign: vi.fn(),
}));

const mockedUseCampaign = vi.mocked(useCampaignModule.useCampaign);

// ============================================================================
// Test Helpers
// ============================================================================
function createDefaultProps(
  overrides: Partial<CampaignRunnerProps> = {}
): CampaignRunnerProps {
  return {
    selectedTemplateIds: ['template-1', 'template-2'],
    isAgentConfigured: true,
    getTemplate: vi.fn().mockResolvedValue({ id: 'template-1', prompt: 'Test prompt' }),
    executeAttack: vi.fn().mockResolvedValue({ response: 'Test response', success: true }),
    sessionId: 'test-session',
    ...overrides,
  };
}

function createMockHookReturn(
  overrides: Partial<ReturnType<typeof useCampaignModule.useCampaign>> = {}
) {
  return {
    progress: {
      status: 'idle' as useCampaignModule.CampaignStatus,
      totalAttacks: 2,
      completedAttacks: 0,
      successfulAttacks: 0,
      failedAttacks: 0,
      currentAttackId: null,
      currentAttackIndex: -1,
      elapsedSeconds: 0,
      errors: [],
    },
    results: [],
    startedAt: null,
    isRunning: false,
    isPaused: false,
    isActive: false,
    isComplete: false,
    progressPercent: 0,
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================
describe('CampaignRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseCampaign.mockReturnValue(createMockHookReturn());
  });

  describe('rendering', () => {
    it('renders campaign controls', () => {
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).toBeInTheDocument();
    });

    it('does not show progress card when idle', () => {
      mockedUseCampaign.mockReturnValue(createMockHookReturn({ isActive: false, isComplete: false }));
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.queryByText('Campaign Progress')).not.toBeInTheDocument();
    });

    it('shows progress card when active', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isActive: true,
          progress: {
            status: 'running',
            totalAttacks: 5,
            completedAttacks: 2,
            successfulAttacks: 1,
            failedAttacks: 1,
            currentAttackId: 'template-2',
            currentAttackIndex: 2,
            elapsedSeconds: 30,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('Campaign Progress')).toBeInTheDocument();
    });

    it('shows progress bar with correct percentage', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isActive: true,
          progressPercent: 50,
          progress: {
            status: 'running',
            totalAttacks: 4,
            completedAttacks: 2,
            successfulAttacks: 2,
            failedAttacks: 0,
            currentAttackId: null,
            currentAttackIndex: 2,
            elapsedSeconds: 10,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByText('2 of 4 attacks')).toBeInTheDocument();
    });
  });

  describe('current attack indicator', () => {
    it('shows current attack when running', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isRunning: true,
          isActive: true,
          progress: {
            status: 'running',
            totalAttacks: 3,
            completedAttacks: 1,
            successfulAttacks: 1,
            failedAttacks: 0,
            currentAttackId: 'attack-123',
            currentAttackIndex: 1,
            elapsedSeconds: 5,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText(/Executing attack 2 of 3/i)).toBeInTheDocument();
      expect(screen.getByText('attack-123')).toBeInTheDocument();
    });

    it('truncates long attack IDs', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isRunning: true,
          isActive: true,
          progress: {
            status: 'running',
            totalAttacks: 2,
            completedAttacks: 0,
            successfulAttacks: 0,
            failedAttacks: 0,
            currentAttackId: 'very-long-attack-id-that-should-be-truncated',
            currentAttackIndex: 0,
            elapsedSeconds: 0,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('very-long-attack-id-...')).toBeInTheDocument();
    });
  });

  describe('completion status', () => {
    it('shows completed alert', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isComplete: true,
          progress: {
            status: 'completed',
            totalAttacks: 5,
            completedAttacks: 5,
            successfulAttacks: 4,
            failedAttacks: 1,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 60,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('Campaign Completed')).toBeInTheDocument();
      expect(screen.getByText('4 of 5 attacks successful.')).toBeInTheDocument();
    });

    it('shows cancelled alert', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isComplete: true,
          progress: {
            status: 'cancelled',
            totalAttacks: 10,
            completedAttacks: 3,
            successfulAttacks: 2,
            failedAttacks: 1,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 15,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('Campaign Cancelled')).toBeInTheDocument();
      expect(screen.getByText('Completed 3 of 10 attacks before cancellation.')).toBeInTheDocument();
    });

    it('shows failed alert', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isComplete: true,
          progress: {
            status: 'failed',
            totalAttacks: 5,
            completedAttacks: 0,
            successfulAttacks: 0,
            failedAttacks: 0,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 0,
            errors: ['Critical error'],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('Campaign Failed')).toBeInTheDocument();
    });
  });

  describe('results summary', () => {
    it('shows results summary when complete', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isComplete: true,
          results: [
            {
              templateId: 'template-1',
              prompt: 'Test prompt 1',
              response: 'Response 1',
              success: true,
              durationMs: 100,
              error: null,
              timestamp: new Date().toISOString(),
            },
            {
              templateId: 'template-2',
              prompt: 'Test prompt 2',
              response: null,
              success: false,
              durationMs: 200,
              error: 'Connection failed',
              timestamp: new Date().toISOString(),
            },
          ],
          progress: {
            status: 'completed',
            totalAttacks: 2,
            completedAttacks: 2,
            successfulAttacks: 1,
            failedAttacks: 1,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 10,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('Total Attacks')).toBeInTheDocument();
      expect(screen.getByText('Successful')).toBeInTheDocument();
      // "Failed" appears in both summary metrics and result badges
      expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Avg Duration')).toBeInTheDocument();
      expect(screen.getByText('Attack Results')).toBeInTheDocument();
    });

    it('shows errors in results summary', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isComplete: true,
          results: [
            {
              templateId: 'template-1',
              prompt: 'Test',
              response: null,
              success: false,
              durationMs: 100,
              error: 'Attack failed',
              timestamp: new Date().toISOString(),
            },
          ],
          progress: {
            status: 'completed',
            totalAttacks: 2,
            completedAttacks: 2,
            successfulAttacks: 0,
            failedAttacks: 2,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 5,
            errors: ['Error loading template-1', 'Error loading template-2'],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('Campaign Errors')).toBeInTheDocument();
      expect(screen.getByText('Error loading template-1')).toBeInTheDocument();
      expect(screen.getByText('Error loading template-2')).toBeInTheDocument();
    });
  });

  describe('result items', () => {
    it('renders expandable result items', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isComplete: true,
          results: [
            {
              templateId: 'template-1',
              prompt: 'Test prompt',
              response: 'Test response',
              success: true,
              durationMs: 150,
              error: null,
              timestamp: new Date().toISOString(),
            },
          ],
          progress: {
            status: 'completed',
            totalAttacks: 1,
            completedAttacks: 1,
            successfulAttacks: 1,
            failedAttacks: 0,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 1,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      // Check result item is rendered
      expect(screen.getByText('template-1')).toBeInTheDocument();
      // Duration appears in result item and summary (avgDuration is same with 1 result)
      expect(screen.getAllByText('150ms').length).toBeGreaterThanOrEqual(1);
    });

    it('shows success badge for successful attacks', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isComplete: true,
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
          progress: {
            status: 'completed',
            totalAttacks: 1,
            completedAttacks: 1,
            successfulAttacks: 1,
            failedAttacks: 0,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 1,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('shows failed badge for failed attacks', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isComplete: true,
          results: [
            {
              templateId: 'template-1',
              prompt: 'Test',
              response: null,
              success: false,
              durationMs: 100,
              error: 'Error',
              timestamp: new Date().toISOString(),
            },
          ],
          progress: {
            status: 'completed',
            totalAttacks: 1,
            completedAttacks: 1,
            successfulAttacks: 0,
            failedAttacks: 1,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 1,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      // Use getAllByText since "Failed" appears in both the badge and metrics
      const failedElements = screen.getAllByText('Failed');
      expect(failedElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('progress stats', () => {
    it('shows correct stats during campaign', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isActive: true,
          progress: {
            status: 'running',
            totalAttacks: 10,
            completedAttacks: 5,
            successfulAttacks: 3,
            failedAttacks: 2,
            currentAttackId: 'current',
            currentAttackIndex: 5,
            elapsedSeconds: 45,
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('5/10')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument(); // 3/5 success rate
      expect(screen.getByText('45s')).toBeInTheDocument();
    });

    it('formats elapsed time correctly', () => {
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          isActive: true,
          progress: {
            status: 'running',
            totalAttacks: 2,
            completedAttacks: 1,
            successfulAttacks: 1,
            failedAttacks: 0,
            currentAttackId: null,
            currentAttackIndex: 1,
            elapsedSeconds: 125, // 2m 5s
            errors: [],
          },
        })
      );
      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      expect(screen.getByText('2m 5s')).toBeInTheDocument();
    });
  });

  describe('hook integration', () => {
    it('passes correct props to useCampaign', () => {
      const getTemplate = vi.fn();
      const executeAttack = vi.fn();
      const onComplete = vi.fn();

      const props = createDefaultProps({
        selectedTemplateIds: ['t1', 't2', 't3'],
        getTemplate,
        executeAttack,
        sessionId: 'my-session',
        onComplete,
      });

      render(<CampaignRunner {...props} />);

      expect(mockedUseCampaign).toHaveBeenCalledWith(
        expect.objectContaining({
          templateIds: ['t1', 't2', 't3'],
          getTemplate,
          executeAttack,
          sessionId: 'my-session',
          onComplete,
        })
      );
    });

    it('calls start when start button clicked', async () => {
      const start = vi.fn();
      mockedUseCampaign.mockReturnValue(createMockHookReturn({ start }));

      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /start campaign/i }));

      await waitFor(() => {
        expect(start).toHaveBeenCalled();
      });
    });

    it('calls pause when pause button clicked', () => {
      const pause = vi.fn();
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          pause,
          progress: {
            status: 'running',
            totalAttacks: 2,
            completedAttacks: 1,
            successfulAttacks: 1,
            failedAttacks: 0,
            currentAttackId: null,
            currentAttackIndex: 1,
            elapsedSeconds: 5,
            errors: [],
          },
        })
      );

      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /pause/i }));

      expect(pause).toHaveBeenCalled();
    });

    it('calls resume when resume button clicked', () => {
      const resume = vi.fn();
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          resume,
          progress: {
            status: 'paused',
            totalAttacks: 2,
            completedAttacks: 1,
            successfulAttacks: 1,
            failedAttacks: 0,
            currentAttackId: null,
            currentAttackIndex: 1,
            elapsedSeconds: 10,
            errors: [],
          },
        })
      );

      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /resume/i }));

      expect(resume).toHaveBeenCalled();
    });

    it('calls cancel when cancel button clicked', () => {
      const cancel = vi.fn();
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          cancel,
          progress: {
            status: 'running',
            totalAttacks: 2,
            completedAttacks: 0,
            successfulAttacks: 0,
            failedAttacks: 0,
            currentAttackId: 't1',
            currentAttackIndex: 0,
            elapsedSeconds: 2,
            errors: [],
          },
        })
      );

      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(cancel).toHaveBeenCalled();
    });

    it('calls reset when reset button clicked', () => {
      const reset = vi.fn();
      mockedUseCampaign.mockReturnValue(
        createMockHookReturn({
          reset,
          isComplete: true,
          progress: {
            status: 'completed',
            totalAttacks: 2,
            completedAttacks: 2,
            successfulAttacks: 2,
            failedAttacks: 0,
            currentAttackId: null,
            currentAttackIndex: -1,
            elapsedSeconds: 10,
            errors: [],
          },
        })
      );

      const props = createDefaultProps();
      render(<CampaignRunner {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /reset/i }));

      expect(reset).toHaveBeenCalled();
    });
  });
});
