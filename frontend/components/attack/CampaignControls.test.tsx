import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CampaignControls, CampaignControlsProps } from './CampaignControls';
import { CampaignStatus } from '@/hooks/useCampaign';

// ============================================================================
// Test Helpers
// ============================================================================
function createDefaultProps(
  overrides: Partial<CampaignControlsProps> = {}
): CampaignControlsProps {
  return {
    status: 'idle',
    selectedCount: 5,
    isAgentConfigured: true,
    isStarting: false,
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onCancel: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================
describe('CampaignControls', () => {
  describe('rendering', () => {
    it('renders all control buttons', () => {
      const props = createDefaultProps();
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    });

    it('displays status badge', () => {
      const props = createDefaultProps({ status: 'running' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('status')).toHaveTextContent('Running');
    });

    it('displays selected template count', () => {
      const props = createDefaultProps({ selectedCount: 10 });
      render(<CampaignControls {...props} />);

      expect(screen.getByText('10 templates selected')).toBeInTheDocument();
    });

    it('uses singular for one template', () => {
      const props = createDefaultProps({ selectedCount: 1 });
      render(<CampaignControls {...props} />);

      expect(screen.getByText('1 template selected')).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    const statuses: CampaignStatus[] = ['idle', 'running', 'paused', 'completed', 'cancelled', 'failed'];

    statuses.forEach((status) => {
      it(`displays ${status} status correctly`, () => {
        const props = createDefaultProps({ status });
        render(<CampaignControls {...props} />);

        const statusElement = screen.getByRole('status');
        expect(statusElement).toBeInTheDocument();
      });
    });
  });

  describe('prerequisites warning', () => {
    it('shows warning when agent not configured', () => {
      const props = createDefaultProps({ isAgentConfigured: false });
      render(<CampaignControls {...props} />);

      expect(screen.getByText('Configure remote agent endpoint')).toBeInTheDocument();
    });

    it('shows warning when no templates selected', () => {
      const props = createDefaultProps({ selectedCount: 0 });
      render(<CampaignControls {...props} />);

      expect(screen.getByText('Select at least one attack template')).toBeInTheDocument();
    });

    it('shows multiple warnings', () => {
      const props = createDefaultProps({ isAgentConfigured: false, selectedCount: 0 });
      render(<CampaignControls {...props} />);

      expect(screen.getByText('Configure remote agent endpoint')).toBeInTheDocument();
      expect(screen.getByText('Select at least one attack template')).toBeInTheDocument();
    });

    it('hides warning when not in idle status', () => {
      const props = createDefaultProps({ isAgentConfigured: false, status: 'running' });
      render(<CampaignControls {...props} />);

      expect(screen.queryByText('Configure remote agent endpoint')).not.toBeInTheDocument();
    });
  });

  describe('button states - idle', () => {
    it('enables start when prerequisites met', () => {
      const props = createDefaultProps({ status: 'idle' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).not.toBeDisabled();
    });

    it('disables start when agent not configured', () => {
      const props = createDefaultProps({ status: 'idle', isAgentConfigured: false });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).toBeDisabled();
    });

    it('disables start when no templates selected', () => {
      const props = createDefaultProps({ status: 'idle', selectedCount: 0 });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).toBeDisabled();
    });

    it('disables pause, resume, cancel in idle', () => {
      const props = createDefaultProps({ status: 'idle' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /pause/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /resume/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('disables reset in idle', () => {
      const props = createDefaultProps({ status: 'idle' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
    });
  });

  describe('button states - running', () => {
    it('disables start when running', () => {
      const props = createDefaultProps({ status: 'running' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).toBeDisabled();
    });

    it('enables pause when running', () => {
      const props = createDefaultProps({ status: 'running' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /pause/i })).not.toBeDisabled();
    });

    it('disables resume when running', () => {
      const props = createDefaultProps({ status: 'running' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /resume/i })).toBeDisabled();
    });

    it('enables cancel when running', () => {
      const props = createDefaultProps({ status: 'running' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled();
    });
  });

  describe('button states - paused', () => {
    it('disables start when paused', () => {
      const props = createDefaultProps({ status: 'paused' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).toBeDisabled();
    });

    it('disables pause when paused', () => {
      const props = createDefaultProps({ status: 'paused' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /pause/i })).toBeDisabled();
    });

    it('enables resume when paused', () => {
      const props = createDefaultProps({ status: 'paused' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /resume/i })).not.toBeDisabled();
    });

    it('enables cancel when paused', () => {
      const props = createDefaultProps({ status: 'paused' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /cancel/i })).not.toBeDisabled();
    });

    it('enables reset when paused', () => {
      const props = createDefaultProps({ status: 'paused' });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
    });
  });

  describe('button states - completed/cancelled/failed', () => {
    const terminalStatuses: CampaignStatus[] = ['completed', 'cancelled', 'failed'];

    terminalStatuses.forEach((status) => {
      it(`enables start after ${status}`, () => {
        const props = createDefaultProps({ status });
        render(<CampaignControls {...props} />);

        expect(screen.getByRole('button', { name: /start campaign/i })).not.toBeDisabled();
      });

      it(`disables pause after ${status}`, () => {
        const props = createDefaultProps({ status });
        render(<CampaignControls {...props} />);

        expect(screen.getByRole('button', { name: /pause/i })).toBeDisabled();
      });

      it(`disables resume after ${status}`, () => {
        const props = createDefaultProps({ status });
        render(<CampaignControls {...props} />);

        expect(screen.getByRole('button', { name: /resume/i })).toBeDisabled();
      });

      it(`disables cancel after ${status}`, () => {
        const props = createDefaultProps({ status });
        render(<CampaignControls {...props} />);

        expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
      });

      it(`enables reset after ${status}`, () => {
        const props = createDefaultProps({ status });
        render(<CampaignControls {...props} />);

        expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled();
      });
    });
  });

  describe('button interactions', () => {
    it('calls onStart when start clicked', () => {
      const onStart = vi.fn();
      const props = createDefaultProps({ onStart });
      render(<CampaignControls {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /start campaign/i }));

      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('calls onPause when pause clicked', () => {
      const onPause = vi.fn();
      const props = createDefaultProps({ status: 'running', onPause });
      render(<CampaignControls {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /pause/i }));

      expect(onPause).toHaveBeenCalledTimes(1);
    });

    it('calls onResume when resume clicked', () => {
      const onResume = vi.fn();
      const props = createDefaultProps({ status: 'paused', onResume });
      render(<CampaignControls {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /resume/i }));

      expect(onResume).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel clicked', () => {
      const onCancel = vi.fn();
      const props = createDefaultProps({ status: 'running', onCancel });
      render(<CampaignControls {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onReset when reset clicked', () => {
      const onReset = vi.fn();
      const props = createDefaultProps({ status: 'completed', onReset });
      render(<CampaignControls {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /reset/i }));

      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('isStarting state', () => {
    it('shows "Starting..." text when isStarting', () => {
      const props = createDefaultProps({ isStarting: true });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).toHaveTextContent('Starting...');
    });

    it('disables start button when isStarting', () => {
      const props = createDefaultProps({ isStarting: true });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign/i })).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('has accessible button labels', () => {
      const props = createDefaultProps({ selectedCount: 3 });
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('button', { name: /start campaign with 3 templates/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pause campaign/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /resume campaign/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel campaign/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset campaign and clear results/i })).toBeInTheDocument();
    });

    it('has role="group" for control buttons', () => {
      const props = createDefaultProps();
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('group', { name: /campaign controls/i })).toBeInTheDocument();
    });

    it('status has aria-live for updates', () => {
      const props = createDefaultProps();
      render(<CampaignControls {...props} />);

      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });
  });
});
