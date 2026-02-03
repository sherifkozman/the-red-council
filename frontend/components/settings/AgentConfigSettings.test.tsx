import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { act } from '@testing-library/react'
import { AgentConfigSettings } from './AgentConfigSettings'
import { useSettingsStore } from '@/stores/settings'

describe('AgentConfigSettings', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    act(() => {
      useSettingsStore.getState().resetToDefaults()
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // ============================================================================
  // Rendering
  // ============================================================================
  describe('rendering', () => {
    it('renders all setting labels', () => {
      render(<AgentConfigSettings />)

      expect(screen.getByLabelText(/default tool interception/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/default memory monitoring/i)).toBeInTheDocument()
      // Slider label is not directly associated, check text instead
      expect(screen.getByText(/default divergence threshold/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/auto-start evaluation/i)).toBeInTheDocument()
    })

    it('displays current divergence threshold value', () => {
      render(<AgentConfigSettings />)

      expect(screen.getByText('0.50')).toBeInTheDocument()
    })

    it('has correct role and accessibility attributes', () => {
      render(<AgentConfigSettings />)

      const group = screen.getByRole('group', { name: /agent configuration options/i })
      expect(group).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Interactions
  // ============================================================================
  describe('interactions', () => {
    it('toggles tool interception setting', () => {
      render(<AgentConfigSettings />)

      const toolInterceptionSwitch = screen.getByLabelText(/default tool interception/i)
      expect(toolInterceptionSwitch).toBeChecked()

      fireEvent.click(toolInterceptionSwitch)

      expect(useSettingsStore.getState().agent.defaultToolInterception).toBe(false)
    })

    it('toggles memory monitoring setting', () => {
      render(<AgentConfigSettings />)

      const memoryMonitoringSwitch = screen.getByLabelText(/default memory monitoring/i)
      expect(memoryMonitoringSwitch).toBeChecked()

      fireEvent.click(memoryMonitoringSwitch)

      expect(useSettingsStore.getState().agent.defaultMemoryMonitoring).toBe(false)
    })

    it('toggles auto-start evaluation setting', () => {
      render(<AgentConfigSettings />)

      const autoEvalSwitch = screen.getByLabelText(/auto-start evaluation/i)
      expect(autoEvalSwitch).not.toBeChecked()

      fireEvent.click(autoEvalSwitch)

      expect(useSettingsStore.getState().agent.autoStartEvaluation).toBe(true)
    })
  })

  // ============================================================================
  // State Sync
  // ============================================================================
  describe('state sync', () => {
    it('reflects store state for divergence threshold', () => {
      act(() => {
        useSettingsStore.getState().updateAgentSettings({ defaultDivergenceThreshold: 0.75 })
      })

      render(<AgentConfigSettings />)

      expect(screen.getByText('0.75')).toBeInTheDocument()
    })

    it('reflects store state for boolean settings', () => {
      act(() => {
        useSettingsStore.getState().updateAgentSettings({
          defaultToolInterception: false,
          defaultMemoryMonitoring: false,
        })
      })

      render(<AgentConfigSettings />)

      expect(screen.getByLabelText(/default tool interception/i)).not.toBeChecked()
      expect(screen.getByLabelText(/default memory monitoring/i)).not.toBeChecked()
    })
  })
})
