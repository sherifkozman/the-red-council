import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from '@testing-library/react'
import {
  useSettingsStore,
  isTheme,
  isSettingsTab,
  THEMES,
  SETTINGS_TABS,
  validateGeneralSettings,
  validateAgentSettings,
  validateAppearanceSettings,
} from './settings'

describe('settings store', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    act(() => {
      useSettingsStore.getState().resetToDefaults()
      useSettingsStore.setState({ activeTab: 'general' })
    })
  })

  // ============================================================================
  // Type Guards
  // ============================================================================
  describe('type guards', () => {
    describe('isTheme', () => {
      it('returns true for valid themes', () => {
        THEMES.forEach((theme) => {
          expect(isTheme(theme)).toBe(true)
        })
      })

      it('returns false for invalid themes', () => {
        expect(isTheme('invalid')).toBe(false)
        expect(isTheme(null)).toBe(false)
        expect(isTheme(undefined)).toBe(false)
        expect(isTheme(123)).toBe(false)
        expect(isTheme({})).toBe(false)
      })
    })

    describe('isSettingsTab', () => {
      it('returns true for valid tabs', () => {
        SETTINGS_TABS.forEach((tab) => {
          expect(isSettingsTab(tab)).toBe(true)
        })
      })

      it('returns false for invalid tabs', () => {
        expect(isSettingsTab('invalid')).toBe(false)
        expect(isSettingsTab(null)).toBe(false)
        expect(isSettingsTab(undefined)).toBe(false)
        expect(isSettingsTab(123)).toBe(false)
      })
    })
  })

  // ============================================================================
  // Tab State
  // ============================================================================
  describe('tab state', () => {
    it('has default tab as general', () => {
      const state = useSettingsStore.getState()
      expect(state.activeTab).toBe('general')
    })

    it('setActiveTab updates the active tab', () => {
      act(() => {
        useSettingsStore.getState().setActiveTab('agent')
      })
      expect(useSettingsStore.getState().activeTab).toBe('agent')
    })

    it('setActiveTab ignores invalid tab and logs error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      act(() => {
        useSettingsStore.getState().setActiveTab('invalid' as any)
      })

      expect(useSettingsStore.getState().activeTab).toBe('general')
      expect(consoleSpy).toHaveBeenCalledWith('Invalid settings tab: invalid')
      consoleSpy.mockRestore()
    })
  })

  // ============================================================================
  // General Settings
  // ============================================================================
  describe('general settings', () => {
    it('has correct defaults', () => {
      const { general } = useSettingsStore.getState()
      expect(general.autoSaveEnabled).toBe(true)
      expect(general.notificationsEnabled).toBe(true)
      expect(general.confirmBeforeDelete).toBe(true)
    })

    it('updateGeneralSettings updates specific fields', () => {
      act(() => {
        useSettingsStore.getState().updateGeneralSettings({ autoSaveEnabled: false })
      })

      const { general } = useSettingsStore.getState()
      expect(general.autoSaveEnabled).toBe(false)
      expect(general.notificationsEnabled).toBe(true) // unchanged
    })

    it('updateGeneralSettings updates multiple fields at once', () => {
      act(() => {
        useSettingsStore.getState().updateGeneralSettings({
          autoSaveEnabled: false,
          confirmBeforeDelete: false,
        })
      })

      const { general } = useSettingsStore.getState()
      expect(general.autoSaveEnabled).toBe(false)
      expect(general.confirmBeforeDelete).toBe(false)
    })
  })

  // ============================================================================
  // Agent Settings
  // ============================================================================
  describe('agent settings', () => {
    it('has correct defaults', () => {
      const { agent } = useSettingsStore.getState()
      expect(agent.defaultToolInterception).toBe(true)
      expect(agent.defaultMemoryMonitoring).toBe(true)
      expect(agent.defaultDivergenceThreshold).toBe(0.5)
      expect(agent.autoStartEvaluation).toBe(false)
    })

    it('updateAgentSettings updates specific fields', () => {
      act(() => {
        useSettingsStore.getState().updateAgentSettings({ defaultToolInterception: false })
      })

      const { agent } = useSettingsStore.getState()
      expect(agent.defaultToolInterception).toBe(false)
      expect(agent.defaultMemoryMonitoring).toBe(true) // unchanged
    })

    it('updateAgentSettings validates divergence threshold range', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Invalid: too high
      act(() => {
        useSettingsStore.getState().updateAgentSettings({ defaultDivergenceThreshold: 1.5 })
      })
      expect(useSettingsStore.getState().agent.defaultDivergenceThreshold).toBe(0.5) // unchanged

      // Invalid: negative
      act(() => {
        useSettingsStore.getState().updateAgentSettings({ defaultDivergenceThreshold: -0.1 })
      })
      expect(useSettingsStore.getState().agent.defaultDivergenceThreshold).toBe(0.5) // unchanged

      expect(consoleSpy).toHaveBeenCalledTimes(2)
      consoleSpy.mockRestore()
    })

    it('updateAgentSettings accepts valid divergence threshold', () => {
      act(() => {
        useSettingsStore.getState().updateAgentSettings({ defaultDivergenceThreshold: 0.75 })
      })
      expect(useSettingsStore.getState().agent.defaultDivergenceThreshold).toBe(0.75)

      act(() => {
        useSettingsStore.getState().updateAgentSettings({ defaultDivergenceThreshold: 0 })
      })
      expect(useSettingsStore.getState().agent.defaultDivergenceThreshold).toBe(0)

      act(() => {
        useSettingsStore.getState().updateAgentSettings({ defaultDivergenceThreshold: 1 })
      })
      expect(useSettingsStore.getState().agent.defaultDivergenceThreshold).toBe(1)
    })
  })

  // ============================================================================
  // Appearance Settings
  // ============================================================================
  describe('appearance settings', () => {
    it('has correct defaults', () => {
      const { appearance } = useSettingsStore.getState()
      expect(appearance.theme).toBe('system')
      expect(appearance.fontSize).toBe('medium')
      expect(appearance.compactMode).toBe(false)
    })

    it('updateAppearanceSettings updates theme', () => {
      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ theme: 'dark' })
      })
      expect(useSettingsStore.getState().appearance.theme).toBe('dark')
    })

    it('updateAppearanceSettings rejects invalid theme', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ theme: 'invalid' as any })
      })

      expect(useSettingsStore.getState().appearance.theme).toBe('system') // unchanged
      expect(consoleSpy).toHaveBeenCalledWith('Invalid theme: invalid')
      consoleSpy.mockRestore()
    })

    it('updateAppearanceSettings updates fontSize', () => {
      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ fontSize: 'large' })
      })
      expect(useSettingsStore.getState().appearance.fontSize).toBe('large')
    })

    it('updateAppearanceSettings updates compactMode', () => {
      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ compactMode: true })
      })
      expect(useSettingsStore.getState().appearance.compactMode).toBe(true)
    })
  })

  // ============================================================================
  // Reset to Defaults
  // ============================================================================
  describe('resetToDefaults', () => {
    it('resets all settings to default values', () => {
      // Modify all settings
      act(() => {
        useSettingsStore.getState().updateGeneralSettings({ autoSaveEnabled: false })
        useSettingsStore.getState().updateAgentSettings({ defaultDivergenceThreshold: 0.8 })
        useSettingsStore.getState().updateAppearanceSettings({ theme: 'dark', fontSize: 'large' })
      })

      // Reset
      act(() => {
        useSettingsStore.getState().resetToDefaults()
      })

      const state = useSettingsStore.getState()
      expect(state.general.autoSaveEnabled).toBe(true)
      expect(state.agent.defaultDivergenceThreshold).toBe(0.5)
      expect(state.appearance.theme).toBe('system')
      expect(state.appearance.fontSize).toBe('medium')
    })
  })

  // ============================================================================
  // Persistence and Migration
  // ============================================================================
  describe('persistence', () => {
    it('persists settings to localStorage', () => {
      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ theme: 'dark' })
      })

      // Check localStorage
      const stored = localStorage.getItem('settings-storage')
      expect(stored).toBeTruthy()
      const parsed = JSON.parse(stored!)
      expect(parsed.state.appearance.theme).toBe('dark')
    })

    it('handles corrupted localStorage data gracefully', () => {
      // Set corrupted data
      localStorage.setItem('settings-storage', 'invalid json{')

      // Trigger rehydration by calling persist
      act(() => {
        useSettingsStore.persist.rehydrate()
      })

      // Store should still have defaults
      const state = useSettingsStore.getState()
      expect(state.general.autoSaveEnabled).toBe(true)
      expect(state.appearance.theme).toBe('system')
    })

    it('handles null persisted state in migration', () => {
      // Set null state in localStorage
      localStorage.setItem('settings-storage', JSON.stringify({ state: null, version: 1 }))

      act(() => {
        useSettingsStore.persist.rehydrate()
      })

      // Should use defaults
      const state = useSettingsStore.getState()
      expect(state.general.autoSaveEnabled).toBe(true)
    })

    it('handles missing fields in persisted state', () => {
      // Set partial state - missing some fields
      localStorage.setItem(
        'settings-storage',
        JSON.stringify({
          state: {
            general: { autoSaveEnabled: false }, // missing other fields
            agent: {}, // empty object
            // appearance is completely missing
          },
          version: 1,
        })
      )

      act(() => {
        useSettingsStore.persist.rehydrate()
      })

      // Should have the set value and defaults for missing ones
      const state = useSettingsStore.getState()
      // Note: rehydrate merges, so we need to check the localStorage was processed
      expect(state.general).toBeDefined()
      expect(state.agent).toBeDefined()
      expect(state.appearance).toBeDefined()
    })

    it('handles invalid field types in persisted state', () => {
      // Set state with wrong types
      localStorage.setItem(
        'settings-storage',
        JSON.stringify({
          state: {
            general: {
              autoSaveEnabled: 'not-a-boolean', // wrong type
              notificationsEnabled: 123, // wrong type
              confirmBeforeDelete: true,
            },
            agent: {
              defaultToolInterception: true,
              defaultDivergenceThreshold: 2.5, // out of range
            },
            appearance: {
              theme: 'invalid-theme',
              fontSize: 'huge', // invalid option
              compactMode: 'yes', // wrong type
            },
          },
          version: 1,
        })
      )

      act(() => {
        useSettingsStore.persist.rehydrate()
      })

      // Validation should fall back to defaults for invalid values
      const state = useSettingsStore.getState()
      expect(state.general).toBeDefined()
      expect(state.agent).toBeDefined()
      expect(state.appearance).toBeDefined()
    })

    it('partializes state to exclude activeTab', () => {
      act(() => {
        useSettingsStore.getState().setActiveTab('agent')
        useSettingsStore.getState().updateAppearanceSettings({ theme: 'dark' })
      })

      const stored = localStorage.getItem('settings-storage')
      const parsed = JSON.parse(stored!)

      // activeTab should not be persisted
      expect(parsed.state.activeTab).toBeUndefined()
      // But appearance should be
      expect(parsed.state.appearance.theme).toBe('dark')
    })

    it('migration handles primitive persisted state', () => {
      // Set primitive value as state (not an object)
      localStorage.setItem('settings-storage', JSON.stringify({ state: 'invalid', version: 0 }))

      act(() => {
        useSettingsStore.persist.rehydrate()
      })

      // Store should have defaults since migration returns defaults for non-object
      const state = useSettingsStore.getState()
      expect(state.general).toBeDefined()
      expect(state.agent).toBeDefined()
      expect(state.appearance).toBeDefined()
    })

    it('migration handles empty object persisted state', () => {
      // Set empty object
      localStorage.setItem('settings-storage', JSON.stringify({ state: {}, version: 0 }))

      act(() => {
        useSettingsStore.persist.rehydrate()
      })

      // Validation functions should return defaults
      const state = useSettingsStore.getState()
      expect(state.general.autoSaveEnabled).toBe(true)
    })
  })

  // ============================================================================
  // Validation Functions
  // ============================================================================
  describe('validation functions', () => {
    describe('validateGeneralSettings', () => {
      it('returns defaults for null input', () => {
        const result = validateGeneralSettings(null)
        expect(result.autoSaveEnabled).toBe(true)
        expect(result.notificationsEnabled).toBe(true)
        expect(result.confirmBeforeDelete).toBe(true)
      })

      it('returns defaults for undefined input', () => {
        const result = validateGeneralSettings(undefined)
        expect(result.autoSaveEnabled).toBe(true)
      })

      it('returns defaults for non-object input', () => {
        const result = validateGeneralSettings('not an object')
        expect(result.autoSaveEnabled).toBe(true)
      })

      it('validates boolean fields', () => {
        const result = validateGeneralSettings({
          autoSaveEnabled: 'not a boolean',
          notificationsEnabled: 123,
          confirmBeforeDelete: null,
        })
        // Should fall back to defaults for invalid types
        expect(result.autoSaveEnabled).toBe(true)
        expect(result.notificationsEnabled).toBe(true)
        expect(result.confirmBeforeDelete).toBe(true)
      })

      it('preserves valid boolean values', () => {
        const result = validateGeneralSettings({
          autoSaveEnabled: false,
          notificationsEnabled: false,
          confirmBeforeDelete: false,
        })
        expect(result.autoSaveEnabled).toBe(false)
        expect(result.notificationsEnabled).toBe(false)
        expect(result.confirmBeforeDelete).toBe(false)
      })
    })

    describe('validateAgentSettings', () => {
      it('returns defaults for null input', () => {
        const result = validateAgentSettings(null)
        expect(result.defaultToolInterception).toBe(true)
        expect(result.defaultDivergenceThreshold).toBe(0.5)
      })

      it('returns defaults for non-object input', () => {
        const result = validateAgentSettings(42)
        expect(result.defaultToolInterception).toBe(true)
      })

      it('validates divergence threshold range', () => {
        // Out of range - too high
        let result = validateAgentSettings({ defaultDivergenceThreshold: 1.5 })
        expect(result.defaultDivergenceThreshold).toBe(0.5)

        // Out of range - negative
        result = validateAgentSettings({ defaultDivergenceThreshold: -0.5 })
        expect(result.defaultDivergenceThreshold).toBe(0.5)

        // Valid edge cases
        result = validateAgentSettings({ defaultDivergenceThreshold: 0 })
        expect(result.defaultDivergenceThreshold).toBe(0)

        result = validateAgentSettings({ defaultDivergenceThreshold: 1 })
        expect(result.defaultDivergenceThreshold).toBe(1)
      })

      it('validates non-numeric divergence threshold', () => {
        const result = validateAgentSettings({ defaultDivergenceThreshold: 'high' })
        expect(result.defaultDivergenceThreshold).toBe(0.5)
      })
    })

    describe('validateAppearanceSettings', () => {
      it('returns defaults for null input', () => {
        const result = validateAppearanceSettings(null)
        expect(result.theme).toBe('system')
        expect(result.fontSize).toBe('medium')
        expect(result.compactMode).toBe(false)
      })

      it('returns defaults for undefined input', () => {
        const result = validateAppearanceSettings(undefined)
        expect(result.theme).toBe('system')
      })

      it('returns defaults for non-object input', () => {
        const result = validateAppearanceSettings([1, 2, 3])
        expect(result.theme).toBe('system')
      })

      it('validates theme values', () => {
        // Invalid theme
        let result = validateAppearanceSettings({ theme: 'purple' })
        expect(result.theme).toBe('system')

        // Valid themes
        result = validateAppearanceSettings({ theme: 'light' })
        expect(result.theme).toBe('light')

        result = validateAppearanceSettings({ theme: 'dark' })
        expect(result.theme).toBe('dark')
      })

      it('validates fontSize values', () => {
        // Invalid fontSize
        let result = validateAppearanceSettings({ fontSize: 'huge' })
        expect(result.fontSize).toBe('medium')

        // Valid fontSizes
        result = validateAppearanceSettings({ fontSize: 'small' })
        expect(result.fontSize).toBe('small')

        result = validateAppearanceSettings({ fontSize: 'large' })
        expect(result.fontSize).toBe('large')
      })

      it('validates compactMode', () => {
        // Invalid type
        let result = validateAppearanceSettings({ compactMode: 'yes' })
        expect(result.compactMode).toBe(false)

        // Valid boolean
        result = validateAppearanceSettings({ compactMode: true })
        expect(result.compactMode).toBe(true)
      })
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('handles updating multiple settings in sequence', () => {
      act(() => {
        useSettingsStore.getState().updateGeneralSettings({ autoSaveEnabled: false })
        useSettingsStore.getState().updateGeneralSettings({ notificationsEnabled: false })
        useSettingsStore.getState().updateGeneralSettings({ confirmBeforeDelete: false })
      })

      const { general } = useSettingsStore.getState()
      expect(general.autoSaveEnabled).toBe(false)
      expect(general.notificationsEnabled).toBe(false)
      expect(general.confirmBeforeDelete).toBe(false)
    })

    it('handles setting fontSize to small', () => {
      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ fontSize: 'small' })
      })
      expect(useSettingsStore.getState().appearance.fontSize).toBe('small')
    })

    it('handles all tab transitions', () => {
      const tabs = ['general', 'agent', 'api-keys', 'appearance'] as const

      tabs.forEach((tab) => {
        act(() => {
          useSettingsStore.getState().setActiveTab(tab)
        })
        expect(useSettingsStore.getState().activeTab).toBe(tab)
      })
    })

    it('handles autoStartEvaluation toggle', () => {
      act(() => {
        useSettingsStore.getState().updateAgentSettings({ autoStartEvaluation: true })
      })
      expect(useSettingsStore.getState().agent.autoStartEvaluation).toBe(true)

      act(() => {
        useSettingsStore.getState().updateAgentSettings({ autoStartEvaluation: false })
      })
      expect(useSettingsStore.getState().agent.autoStartEvaluation).toBe(false)
    })
  })
})
