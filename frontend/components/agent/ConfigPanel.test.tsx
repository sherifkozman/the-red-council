import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ConfigPanel, SessionConfig, DEFAULT_DIVERGENCE_THRESHOLD, DEFAULT_SAMPLING_RATE } from './ConfigPanel';
import { useSettingsStore } from '@/stores/settings';

// Mock the settings store
vi.mock('@/stores/settings', () => ({
  useSettingsStore: vi.fn(() => ({
    agent: {
      defaultToolInterception: true,
      defaultMemoryMonitoring: true,
      defaultDivergenceThreshold: 0.5,
      autoStartEvaluation: false,
    },
    updateAgentSettings: vi.fn(),
  })),
}));

// Mock ToolRegistration component to avoid complex nested tests
vi.mock('./ToolRegistration', () => ({
  ToolRegistration: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="tool-registration" data-disabled={disabled}>
      Tool Registration Mock
    </div>
  ),
}));

describe('ConfigPanel', () => {
  const mockOnSessionConfigChange = vi.fn();
  const mockUpdateAgentSettings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      agent: {
        defaultToolInterception: true,
        defaultMemoryMonitoring: true,
        defaultDivergenceThreshold: 0.5,
        autoStartEvaluation: false,
      },
      updateAgentSettings: mockUpdateAgentSettings,
    });
  });

  describe('Rendering', () => {
    it('renders the configuration panel with header', () => {
      render(<ConfigPanel />);
      expect(screen.getByText('Agent Configuration')).toBeInTheDocument();
    });

    it('renders instrumentation section', () => {
      render(<ConfigPanel />);
      expect(screen.getByText('Instrumentation')).toBeInTheDocument();
      expect(screen.getByText('Enable Tool Interception')).toBeInTheDocument();
      expect(screen.getByText('Enable Memory Monitoring')).toBeInTheDocument();
    });

    it('renders thresholds section', () => {
      render(<ConfigPanel />);
      expect(screen.getByText('Thresholds')).toBeInTheDocument();
      expect(screen.getByText('Divergence Threshold')).toBeInTheDocument();
      expect(screen.getByText('Event Sampling Rate')).toBeInTheDocument();
    });

    it('renders tool registration section', () => {
      render(<ConfigPanel />);
      expect(screen.getByText('Tool Registration')).toBeInTheDocument();
    });

    it('renders memory policy section', () => {
      render(<ConfigPanel />);
      expect(screen.getByText('Memory Policy')).toBeInTheDocument();
    });

    it('renders action buttons', () => {
      render(<ConfigPanel />);
      expect(screen.getByRole('button', { name: /Apply to Session/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save as Defaults/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reset to Defaults/i })).toBeInTheDocument();
    });

    it('renders current config summary', () => {
      render(<ConfigPanel />);
      expect(screen.getByText('Tool Interception:')).toBeInTheDocument();
      expect(screen.getByText('Memory Monitoring:')).toBeInTheDocument();
      expect(screen.getByText('Divergence Threshold:')).toBeInTheDocument();
      expect(screen.getByText('Sampling Rate:')).toBeInTheDocument();
    });

    it('has accessible region', () => {
      render(<ConfigPanel />);
      expect(screen.getByRole('region', { name: /Agent configuration panel/i })).toBeInTheDocument();
    });
  });

  describe('Read-only Mode', () => {
    it('shows read-only alert when readOnly is true', () => {
      render(<ConfigPanel readOnly />);
      expect(screen.getByText('Read-only Mode')).toBeInTheDocument();
    });

    it('disables all controls in read-only mode', () => {
      render(<ConfigPanel readOnly />);

      // Check switches are disabled
      const toolInterceptionSwitch = screen.getByRole('switch', { name: /Enable Tool Interception/i });
      expect(toolInterceptionSwitch).toBeDisabled();

      const memoryMonitoringSwitch = screen.getByRole('switch', { name: /Enable Memory Monitoring/i });
      expect(memoryMonitoringSwitch).toBeDisabled();
    });

    it('disables action buttons in read-only mode', () => {
      render(<ConfigPanel readOnly />);
      expect(screen.getByRole('button', { name: /Save as Defaults/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Reset to Defaults/i })).toBeDisabled();
    });

    it('passes disabled to ToolRegistration', () => {
      render(<ConfigPanel readOnly />);
      // Expand the tools section first
      fireEvent.click(screen.getByText('Tool Registration'));
      const toolReg = screen.getByTestId('tool-registration');
      expect(toolReg).toHaveAttribute('data-disabled', 'true');
    });
  });

  describe('Instrumentation Toggles', () => {
    it('toggles tool interception', () => {
      render(<ConfigPanel onSessionConfigChange={mockOnSessionConfigChange} />);

      const toolInterceptionSwitch = screen.getByRole('switch', { name: /Enable Tool Interception/i });
      expect(toolInterceptionSwitch).toBeChecked();

      fireEvent.click(toolInterceptionSwitch);
      expect(toolInterceptionSwitch).not.toBeChecked();
    });

    it('toggles memory monitoring', () => {
      render(<ConfigPanel onSessionConfigChange={mockOnSessionConfigChange} />);

      const memoryMonitoringSwitch = screen.getByRole('switch', { name: /Enable Memory Monitoring/i });
      expect(memoryMonitoringSwitch).toBeChecked();

      fireEvent.click(memoryMonitoringSwitch);
      expect(memoryMonitoringSwitch).not.toBeChecked();
    });

    it('shows unsaved changes badge after toggle', () => {
      render(<ConfigPanel onSessionConfigChange={mockOnSessionConfigChange} />);

      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('switch', { name: /Enable Tool Interception/i }));

      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    });
  });

  describe('Threshold Sliders', () => {
    it('shows current divergence threshold value', () => {
      render(<ConfigPanel />);
      // May appear multiple times (slider and summary)
      expect(screen.getAllByText('0.50').length).toBeGreaterThanOrEqual(1);
    });

    it('shows current sampling rate value', () => {
      render(<ConfigPanel />);
      // May appear multiple times (slider and summary)
      expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
    });

    it('shows warning when sampling rate is below 100%', () => {
      render(<ConfigPanel sessionConfig={{ enableToolInterception: true, enableMemoryMonitoring: true, divergenceThreshold: 0.5, samplingRate: 0.5 }} />);
      expect(screen.getByText(/Sampling below 100% may miss important events/i)).toBeInTheDocument();
    });
  });

  describe('Collapsible Sections', () => {
    it('toggles instrumentation section', () => {
      render(<ConfigPanel />);
      const triggerButton = screen.getByText('Instrumentation').closest('div')?.parentElement;

      // Initially open
      expect(screen.getByText('Enable Tool Interception')).toBeVisible();

      // Click to collapse
      if (triggerButton) {
        fireEvent.click(triggerButton);
      }
    });

    it('toggles tool registration section', () => {
      render(<ConfigPanel />);

      // Click to expand
      fireEvent.click(screen.getByText('Tool Registration'));

      // ToolRegistration should be visible
      expect(screen.getByTestId('tool-registration')).toBeInTheDocument();
    });

    it('toggles memory policy section', () => {
      render(<ConfigPanel />);

      // Click to expand
      fireEvent.click(screen.getByText('Memory Policy'));

      // Content should be visible
      expect(screen.getByText(/Memory policy configuration coming soon/i)).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('calls onSessionConfigChange when Apply to Session is clicked', () => {
      render(<ConfigPanel onSessionConfigChange={mockOnSessionConfigChange} />);

      // Make a change first
      fireEvent.click(screen.getByRole('switch', { name: /Enable Tool Interception/i }));

      // Click Apply
      fireEvent.click(screen.getByRole('button', { name: /Apply to Session/i }));

      expect(mockOnSessionConfigChange).toHaveBeenCalledWith(expect.objectContaining({
        enableToolInterception: false,
        enableMemoryMonitoring: true,
      }));
    });

    it('clears unsaved changes badge after apply', () => {
      render(<ConfigPanel onSessionConfigChange={mockOnSessionConfigChange} />);

      // Make a change
      fireEvent.click(screen.getByRole('switch', { name: /Enable Tool Interception/i }));
      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();

      // Apply
      fireEvent.click(screen.getByRole('button', { name: /Apply to Session/i }));
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument();
    });

    it('saves settings as defaults when Save as Defaults is clicked', () => {
      render(<ConfigPanel />);

      fireEvent.click(screen.getByRole('button', { name: /Save as Defaults/i }));

      expect(mockUpdateAgentSettings).toHaveBeenCalledWith(expect.objectContaining({
        defaultToolInterception: true,
        defaultMemoryMonitoring: true,
        defaultDivergenceThreshold: 0.5,
      }));
    });

    it('resets to defaults when Reset to Defaults is clicked', () => {
      render(<ConfigPanel onSessionConfigChange={mockOnSessionConfigChange} />);

      // Change something
      fireEvent.click(screen.getByRole('switch', { name: /Enable Tool Interception/i }));

      // Reset
      fireEvent.click(screen.getByRole('button', { name: /Reset to Defaults/i }));

      // Should show unsaved changes (reset creates changes)
      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    });

    it('disables Apply button when no changes', () => {
      render(<ConfigPanel onSessionConfigChange={mockOnSessionConfigChange} />);
      expect(screen.getByRole('button', { name: /Apply to Session/i })).toBeDisabled();
    });
  });

  describe('Session Config', () => {
    it('uses sessionConfig values when provided', () => {
      const sessionConfig: SessionConfig = {
        enableToolInterception: false,
        enableMemoryMonitoring: false,
        divergenceThreshold: 0.3,
        samplingRate: 0.7,
      };

      render(<ConfigPanel sessionConfig={sessionConfig} />);

      // Check switches reflect session config
      const toolInterceptionSwitch = screen.getByRole('switch', { name: /Enable Tool Interception/i });
      expect(toolInterceptionSwitch).not.toBeChecked();

      const memoryMonitoringSwitch = screen.getByRole('switch', { name: /Enable Memory Monitoring/i });
      expect(memoryMonitoringSwitch).not.toBeChecked();

      // Check threshold value - may appear multiple times (slider and summary)
      expect(screen.getAllByText('0.30').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('70%').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('CSS Classes', () => {
    it('applies custom className', () => {
      const { container } = render(<ConfigPanel className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Constants', () => {
    it('exports correct default values', () => {
      expect(DEFAULT_DIVERGENCE_THRESHOLD).toBe(0.5);
      expect(DEFAULT_SAMPLING_RATE).toBe(1.0);
    });
  });
});
