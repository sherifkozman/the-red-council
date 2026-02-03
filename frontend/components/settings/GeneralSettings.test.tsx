import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { act } from '@testing-library/react'
import { GeneralSettings } from './GeneralSettings'
import { useSettingsStore } from '@/stores/settings'

describe('GeneralSettings', () => {
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
      render(<GeneralSettings />)

      expect(screen.getByLabelText(/auto-save/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm before delete/i)).toBeInTheDocument()
    })

    it('renders all descriptions', () => {
      render(<GeneralSettings />)

      expect(screen.getByText(/automatically save your work/i)).toBeInTheDocument()
      expect(screen.getByText(/receive notifications about important events/i)).toBeInTheDocument()
      expect(screen.getByText(/show a confirmation dialog/i)).toBeInTheDocument()
    })

    it('has correct role and accessibility attributes', () => {
      render(<GeneralSettings />)

      const group = screen.getByRole('group', { name: /general settings options/i })
      expect(group).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Interactions
  // ============================================================================
  describe('interactions', () => {
    it('toggles auto-save setting', () => {
      render(<GeneralSettings />)

      const autoSaveSwitch = screen.getByLabelText(/auto-save/i)
      expect(autoSaveSwitch).toBeChecked()

      fireEvent.click(autoSaveSwitch)

      expect(useSettingsStore.getState().general.autoSaveEnabled).toBe(false)
    })

    it('toggles notifications setting', () => {
      render(<GeneralSettings />)

      const notificationsSwitch = screen.getByLabelText(/notifications/i)
      expect(notificationsSwitch).toBeChecked()

      fireEvent.click(notificationsSwitch)

      expect(useSettingsStore.getState().general.notificationsEnabled).toBe(false)
    })

    it('toggles confirm before delete setting', () => {
      render(<GeneralSettings />)

      const confirmDeleteSwitch = screen.getByLabelText(/confirm before delete/i)
      expect(confirmDeleteSwitch).toBeChecked()

      fireEvent.click(confirmDeleteSwitch)

      expect(useSettingsStore.getState().general.confirmBeforeDelete).toBe(false)
    })
  })

  // ============================================================================
  // State Sync
  // ============================================================================
  describe('state sync', () => {
    it('reflects store state on initial render', () => {
      act(() => {
        useSettingsStore.getState().updateGeneralSettings({ autoSaveEnabled: false })
      })

      render(<GeneralSettings />)

      const autoSaveSwitch = screen.getByLabelText(/auto-save/i)
      expect(autoSaveSwitch).not.toBeChecked()
    })
  })
})
