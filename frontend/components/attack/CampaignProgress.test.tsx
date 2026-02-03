import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CampaignProgress,
  CampaignProgressProps,
  TemplateProgress,
} from './CampaignProgress';

// ============================================================================
// Test Data
// ============================================================================
const createMockTemplates = (
  overrides: Partial<TemplateProgress>[] = []
): TemplateProgress[] => {
  const defaults: TemplateProgress[] = [
    { templateId: 'template-1', status: 'complete', success: true, durationMs: 150 },
    { templateId: 'template-2', status: 'complete', success: false, durationMs: 200 },
    { templateId: 'template-3', status: 'running' },
    { templateId: 'template-4', status: 'pending' },
    { templateId: 'template-5', status: 'failed', error: 'Connection timeout', durationMs: 5000 },
  ];

  return overrides.length > 0
    ? overrides.map((o, i) => ({ ...defaults[i], ...o }))
    : defaults;
};

const defaultProps: CampaignProgressProps = {
  templates: createMockTemplates(),
  currentIndex: 2,
  elapsedSeconds: 30,
  isRunning: true,
};

const renderComponent = (props: Partial<CampaignProgressProps> = {}) => {
  return render(<CampaignProgress {...defaultProps} {...props} />);
};

// ============================================================================
// Tests
// ============================================================================
describe('CampaignProgress', () => {
  describe('Rendering', () => {
    it('renders the component with title', () => {
      renderComponent();
      expect(screen.getByText('Campaign Progress')).toBeInTheDocument();
    });

    it('renders running badge when isRunning is true', () => {
      renderComponent({ isRunning: true });
      // Multiple "Running" badges may appear (header + template status)
      expect(screen.getAllByText('Running').length).toBeGreaterThanOrEqual(1);
    });

    it('does not render running badge in header when isRunning is false', () => {
      // Use templates that don't have running status
      const templates: TemplateProgress[] = [
        { templateId: 'complete-template', status: 'complete', success: true },
      ];
      renderComponent({ templates, isRunning: false });
      // Header should not have "Running" badge
      const header = screen.getByText('Campaign Progress').closest('div');
      expect(within(header!).queryByText('Running')).not.toBeInTheDocument();
    });

    it('renders all templates in the list', () => {
      renderComponent();
      expect(screen.getByText('template-1')).toBeInTheDocument();
      expect(screen.getByText('template-2')).toBeInTheDocument();
      expect(screen.getByText('template-3')).toBeInTheDocument();
      expect(screen.getByText('template-4')).toBeInTheDocument();
      expect(screen.getByText('template-5')).toBeInTheDocument();
    });

    it('renders Template Status heading', () => {
      renderComponent();
      expect(screen.getByText('Template Status')).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('calculates correct progress percentage', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
        { templateId: 't2', status: 'complete', success: true },
        { templateId: 't3', status: 'failed', error: 'Error' },
        { templateId: 't4', status: 'pending' },
      ];
      renderComponent({ templates });
      // 3 of 4 completed = 75%
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('3 of 4 templates processed')).toBeInTheDocument();
    });

    it('shows 0% when no templates are completed', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'pending' },
        { templateId: 't2', status: 'pending' },
      ];
      renderComponent({ templates, isRunning: false });
      // 0% appears for both progress and defense rate when no templates completed
      expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('0 of 2 templates processed')).toBeInTheDocument();
    });

    it('shows 100% when all templates are completed', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
        { templateId: 't2', status: 'complete', success: false },
      ];
      renderComponent({ templates, isRunning: false });
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('Stats Display', () => {
    it('displays defended count for successful attacks', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
        { templateId: 't2', status: 'complete', success: true },
        { templateId: 't3', status: 'complete', success: false },
      ];
      renderComponent({ templates });

      // Check for Defended label and value
      expect(screen.getByText('Defended')).toBeInTheDocument();
      // The value 2 appears as the count
      const defendedSection = screen.getByText('Defended').closest('div');
      expect(within(defendedSection!.parentElement!).getByText('2')).toBeInTheDocument();
    });

    it('displays jailbroken count for unsuccessful attacks', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
        { templateId: 't2', status: 'complete', success: false },
        { templateId: 't3', status: 'complete', success: false },
      ];
      renderComponent({ templates, isRunning: false });

      // "Jailbroken" appears in stats section and as badge for each unsuccessful template
      const jailbrokenLabels = screen.getAllByText('Jailbroken');
      // At least 3: 1 in stats, 2 as badges for t2 and t3
      expect(jailbrokenLabels.length).toBeGreaterThanOrEqual(3);
    });

    it('displays error count for failed templates', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'failed', error: 'Error 1' },
        { templateId: 't2', status: 'failed', error: 'Error 2' },
        { templateId: 't3', status: 'complete', success: true },
      ];
      renderComponent({ templates });

      expect(screen.getByText('Errors')).toBeInTheDocument();
      const errorsSection = screen.getByText('Errors').closest('div');
      expect(within(errorsSection!.parentElement!).getByText('2')).toBeInTheDocument();
    });

    it('calculates defense rate correctly', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
        { templateId: 't2', status: 'complete', success: true },
        { templateId: 't3', status: 'complete', success: false },
        { templateId: 't4', status: 'complete', success: false },
      ];
      renderComponent({ templates });

      // 2 successful out of 4 = 50%
      expect(screen.getByText('Defense Rate')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  describe('Elapsed Time', () => {
    it('displays elapsed time in seconds', () => {
      renderComponent({ elapsedSeconds: 45 });
      expect(screen.getByText('Elapsed: 45s')).toBeInTheDocument();
    });

    it('displays elapsed time in minutes and seconds', () => {
      renderComponent({ elapsedSeconds: 125 });
      expect(screen.getByText('Elapsed: 2m 5s')).toBeInTheDocument();
    });
  });

  describe('Estimated Remaining Time', () => {
    it('shows estimated remaining time when running', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
        { templateId: 't2', status: 'complete', success: true },
        { templateId: 't3', status: 'running' },
        { templateId: 't4', status: 'pending' },
      ];
      renderComponent({ templates, elapsedSeconds: 20, isRunning: true });

      // 2 completed in 20s = 10s each, 2 remaining = ~20s
      expect(screen.getByText(/Remaining:/)).toBeInTheDocument();
    });

    it('does not show remaining time when not running', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
        { templateId: 't2', status: 'complete', success: true },
      ];
      renderComponent({ templates, elapsedSeconds: 20, isRunning: false });

      expect(screen.queryByText(/Remaining:/)).not.toBeInTheDocument();
    });

    it('does not show remaining time when no templates completed', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'running' },
        { templateId: 't2', status: 'pending' },
      ];
      renderComponent({ templates, elapsedSeconds: 5, isRunning: true });

      expect(screen.queryByText(/Remaining:/)).not.toBeInTheDocument();
    });
  });

  describe('Template Status Badges', () => {
    it('shows Pending badge for pending templates', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'pending-template', status: 'pending' },
      ];
      renderComponent({ templates });
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('shows Running badge for running templates', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'running-template', status: 'running' },
      ];
      renderComponent({ templates, currentIndex: 0 });
      // Two Running badges: one in header (isRunning), one for template
      expect(screen.getAllByText('Running').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Complete badge for successful templates', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'complete-template', status: 'complete', success: true },
      ];
      renderComponent({ templates, isRunning: false });
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('shows Jailbroken badge for unsuccessful complete templates', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'jailbroken-template', status: 'complete', success: false },
      ];
      renderComponent({ templates, isRunning: false });
      // "Jailbroken" appears in both stats and as badge
      expect(screen.getAllByText('Jailbroken').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Failed badge for failed templates', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'failed-template', status: 'failed', error: 'Error' },
      ];
      renderComponent({ templates, isRunning: false });
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  describe('Current Template Highlighting', () => {
    it('highlights the current template when running', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'template-1', status: 'complete', success: true },
        { templateId: 'template-2', status: 'running' },
        { templateId: 'template-3', status: 'pending' },
      ];
      renderComponent({ templates, currentIndex: 1, isRunning: true });

      // The highlighted template should have aria-label indicating it's running
      const currentButton = screen.getByRole('button', {
        name: /template-2.*currently running/i,
      });
      expect(currentButton).toBeInTheDocument();
    });

    it('does not highlight when not running', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'template-1', status: 'complete', success: true },
        { templateId: 'template-2', status: 'complete', success: true },
      ];
      renderComponent({ templates, currentIndex: 1, isRunning: false });

      // No template should have "currently running" in aria-label
      expect(
        screen.queryByRole('button', { name: /currently running/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Expandable Details', () => {
    it('expands to show prompt when clicked', () => {
      const templates: TemplateProgress[] = [
        {
          templateId: 'template-with-prompt',
          status: 'complete',
          success: true,
          prompt: 'This is the attack prompt',
          durationMs: 100,
        },
      ];
      renderComponent({ templates, isRunning: false });

      // Click to expand
      const trigger = screen.getByRole('button', {
        name: /template-with-prompt/i,
      });
      fireEvent.click(trigger);

      expect(screen.getByText('Prompt')).toBeInTheDocument();
      expect(screen.getByText('This is the attack prompt')).toBeInTheDocument();
    });

    it('expands to show response when clicked', () => {
      const templates: TemplateProgress[] = [
        {
          templateId: 'template-with-response',
          status: 'complete',
          success: true,
          response: 'This is the agent response',
          durationMs: 100,
        },
      ];
      renderComponent({ templates, isRunning: false });

      const trigger = screen.getByRole('button', {
        name: /template-with-response/i,
      });
      fireEvent.click(trigger);

      expect(screen.getByText('Response')).toBeInTheDocument();
      expect(screen.getByText('This is the agent response')).toBeInTheDocument();
    });

    it('shows error message for failed templates', () => {
      const templates: TemplateProgress[] = [
        {
          templateId: 'failed-template',
          status: 'failed',
          error: 'Connection refused',
          durationMs: 5000,
        },
      ];
      renderComponent({ templates, isRunning: false });

      const trigger = screen.getByRole('button', { name: /failed-template/i });
      fireEvent.click(trigger);

      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });

    it('truncates long prompts', () => {
      const longPrompt = 'A'.repeat(400);
      const templates: TemplateProgress[] = [
        {
          templateId: 'long-prompt-template',
          status: 'complete',
          success: true,
          prompt: longPrompt,
          durationMs: 100,
        },
      ];
      renderComponent({ templates, isRunning: false });

      const trigger = screen.getByRole('button', {
        name: /long-prompt-template/i,
      });
      fireEvent.click(trigger);

      // Should truncate to 300 characters + "..."
      const promptContent = screen.getByText(/^A+\.\.\.$/);
      expect(promptContent.textContent?.length).toBeLessThan(400);
    });

    it('truncates long responses', () => {
      const longResponse = 'B'.repeat(400);
      const templates: TemplateProgress[] = [
        {
          templateId: 'long-response-template',
          status: 'complete',
          success: true,
          response: longResponse,
          durationMs: 100,
        },
      ];
      renderComponent({ templates, isRunning: false });

      const trigger = screen.getByRole('button', {
        name: /long-response-template/i,
      });
      fireEvent.click(trigger);

      // Should truncate to 300 characters + "..."
      const responseContent = screen.getByText(/^B+\.\.\.$/);
      expect(responseContent.textContent?.length).toBeLessThan(400);
    });

    it('does not expand templates without details', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'no-details-template', status: 'pending' },
      ];
      renderComponent({ templates, isRunning: false });

      const trigger = screen.getByRole('button', {
        name: /no-details-template/i,
      });

      // Button should be disabled for templates without details
      expect(trigger).toBeDisabled();
    });
  });

  describe('Duration Display', () => {
    it('shows duration in milliseconds for short durations', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'fast-template', status: 'complete', success: true, durationMs: 500 },
      ];
      renderComponent({ templates, isRunning: false });
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });

    it('shows duration in seconds for longer durations', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'slow-template', status: 'complete', success: true, durationMs: 2500 },
      ];
      renderComponent({ templates, isRunning: false });
      expect(screen.getByText('3s')).toBeInTheDocument();
    });

    it('shows duration in minutes for very long durations', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'very-slow-template', status: 'failed', error: 'Timeout', durationMs: 65000 },
      ];
      renderComponent({ templates, isRunning: false });
      expect(screen.getByText('1m 5s')).toBeInTheDocument();
    });
  });

  describe('Template Name Truncation', () => {
    it('truncates long template IDs', () => {
      const longId = 'very-long-template-id-that-exceeds-thirty-characters';
      const templates: TemplateProgress[] = [
        { templateId: longId, status: 'pending' },
      ];
      renderComponent({ templates, isRunning: false });

      // Should truncate to 27 chars + "..."
      expect(screen.getByText('very-long-template-id-that-...')).toBeInTheDocument();
    });

    it('uses name property when provided', () => {
      const templates: TemplateProgress[] = [
        {
          templateId: 'template-123',
          name: 'Human Readable Name',
          status: 'pending',
        },
      ];
      renderComponent({ templates, isRunning: false });

      expect(screen.getByText('Human Readable Name')).toBeInTheDocument();
      expect(screen.queryByText('template-123')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible progress bar', () => {
      renderComponent();
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-label', expect.stringContaining('Progress'));
    });

    it('has accessible template buttons with status', () => {
      const templates: TemplateProgress[] = [
        { templateId: 'accessible-template', status: 'complete', success: true, durationMs: 100 },
      ];
      renderComponent({ templates, isRunning: false });

      const button = screen.getByRole('button', {
        name: /accessible-template.*Complete/i,
      });
      expect(button).toBeInTheDocument();
    });

    it('decorative icons have aria-hidden', () => {
      renderComponent();

      // Check that TrendingUp icon in header has aria-hidden
      const container = document.querySelector('[aria-hidden="true"]');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty templates array', () => {
      renderComponent({ templates: [], isRunning: false });
      expect(screen.getByText('Campaign Progress')).toBeInTheDocument();
      // 0% appears multiple times (progress and defense rate)
      expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('0 of 0 templates processed')).toBeInTheDocument();
    });

    it('handles all templates pending', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'pending' },
        { templateId: 't2', status: 'pending' },
        { templateId: 't3', status: 'pending' },
      ];
      renderComponent({ templates, currentIndex: -1, isRunning: false });

      // 0% appears multiple times
      expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
      // 3 pending badges for templates
      expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(3);
    });

    it('handles all templates complete', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
        { templateId: 't2', status: 'complete', success: true },
        { templateId: 't3', status: 'complete', success: false },
      ];
      renderComponent({ templates, currentIndex: -1, isRunning: false });

      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('handles negative currentIndex', () => {
      renderComponent({ currentIndex: -1 });
      // Should not crash and no template should be highlighted
      expect(
        screen.queryByRole('button', { name: /currently running/i })
      ).not.toBeInTheDocument();
    });

    it('handles currentIndex beyond array bounds', () => {
      const templates: TemplateProgress[] = [
        { templateId: 't1', status: 'complete', success: true },
      ];
      renderComponent({ templates, currentIndex: 10, isRunning: true });
      // Should not crash
      expect(screen.getByText('Campaign Progress')).toBeInTheDocument();
    });

    it('handles zero elapsed seconds', () => {
      renderComponent({ elapsedSeconds: 0 });
      expect(screen.getByText('Elapsed: 0s')).toBeInTheDocument();
    });
  });
});
