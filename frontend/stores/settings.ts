'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// Theme types
export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const isTheme = (value: unknown): value is Theme => {
  return typeof value === 'string' && THEMES.includes(value as Theme)
}

// Settings tab types
export const SETTINGS_TABS = ['general', 'agent', 'api-keys', 'appearance'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export const isSettingsTab = (value: unknown): value is SettingsTab => {
  return typeof value === 'string' && SETTINGS_TABS.includes(value as SettingsTab)
}

// General settings
interface GeneralSettings {
  autoSaveEnabled: boolean
  notificationsEnabled: boolean
  confirmBeforeDelete: boolean
}

// Agent config settings
interface AgentSettings {
  defaultToolInterception: boolean
  defaultMemoryMonitoring: boolean
  defaultDivergenceThreshold: number
  autoStartEvaluation: boolean
}

// Appearance settings
interface AppearanceSettings {
  theme: Theme
  fontSize: 'small' | 'medium' | 'large'
  compactMode: boolean
}

// Store state
interface SettingsState {
  // Tab state
  activeTab: SettingsTab

  // Settings sections
  general: GeneralSettings
  agent: AgentSettings
  appearance: AppearanceSettings

  // Actions
  setActiveTab: (tab: SettingsTab) => void
  updateGeneralSettings: (settings: Partial<GeneralSettings>) => void
  updateAgentSettings: (settings: Partial<AgentSettings>) => void
  updateAppearanceSettings: (settings: Partial<AppearanceSettings>) => void
  resetToDefaults: () => void
}

// Default values
const DEFAULT_GENERAL: GeneralSettings = {
  autoSaveEnabled: true,
  notificationsEnabled: true,
  confirmBeforeDelete: true,
}

const DEFAULT_AGENT: AgentSettings = {
  defaultToolInterception: true,
  defaultMemoryMonitoring: true,
  defaultDivergenceThreshold: 0.5,
  autoStartEvaluation: false,
}

const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'system',
  fontSize: 'medium',
  compactMode: false,
}

// Validation helpers (exported for testing)
export const validateGeneralSettings = (settings: unknown): GeneralSettings => {
  if (!settings || typeof settings !== 'object') {
    return DEFAULT_GENERAL
  }
  const s = settings as Record<string, unknown>
  return {
    autoSaveEnabled: typeof s.autoSaveEnabled === 'boolean' ? s.autoSaveEnabled : DEFAULT_GENERAL.autoSaveEnabled,
    notificationsEnabled: typeof s.notificationsEnabled === 'boolean' ? s.notificationsEnabled : DEFAULT_GENERAL.notificationsEnabled,
    confirmBeforeDelete: typeof s.confirmBeforeDelete === 'boolean' ? s.confirmBeforeDelete : DEFAULT_GENERAL.confirmBeforeDelete,
  }
}

export const validateAgentSettings = (settings: unknown): AgentSettings => {
  if (!settings || typeof settings !== 'object') {
    return DEFAULT_AGENT
  }
  const s = settings as Record<string, unknown>
  return {
    defaultToolInterception: typeof s.defaultToolInterception === 'boolean' ? s.defaultToolInterception : DEFAULT_AGENT.defaultToolInterception,
    defaultMemoryMonitoring: typeof s.defaultMemoryMonitoring === 'boolean' ? s.defaultMemoryMonitoring : DEFAULT_AGENT.defaultMemoryMonitoring,
    defaultDivergenceThreshold: typeof s.defaultDivergenceThreshold === 'number' && s.defaultDivergenceThreshold >= 0 && s.defaultDivergenceThreshold <= 1
      ? s.defaultDivergenceThreshold
      : DEFAULT_AGENT.defaultDivergenceThreshold,
    autoStartEvaluation: typeof s.autoStartEvaluation === 'boolean' ? s.autoStartEvaluation : DEFAULT_AGENT.autoStartEvaluation,
  }
}

export const validateAppearanceSettings = (settings: unknown): AppearanceSettings => {
  if (!settings || typeof settings !== 'object') {
    return DEFAULT_APPEARANCE
  }
  const s = settings as Record<string, unknown>
  const fontSizes = ['small', 'medium', 'large'] as const
  return {
    theme: isTheme(s.theme) ? s.theme : DEFAULT_APPEARANCE.theme,
    fontSize: fontSizes.includes(s.fontSize as typeof fontSizes[number]) ? (s.fontSize as AppearanceSettings['fontSize']) : DEFAULT_APPEARANCE.fontSize,
    compactMode: typeof s.compactMode === 'boolean' ? s.compactMode : DEFAULT_APPEARANCE.compactMode,
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set) => ({
      activeTab: 'general',
      general: DEFAULT_GENERAL,
      agent: DEFAULT_AGENT,
      appearance: DEFAULT_APPEARANCE,

      setActiveTab: (tab) =>
        set((state) => {
          if (isSettingsTab(tab)) {
            state.activeTab = tab
          } else {
            console.error(`Invalid settings tab: ${tab}`)
          }
        }),

      updateGeneralSettings: (settings) =>
        set((state) => {
          state.general = { ...state.general, ...settings }
        }),

      updateAgentSettings: (settings) =>
        set((state) => {
          // Validate divergence threshold if provided
          if (settings.defaultDivergenceThreshold !== undefined) {
            const threshold = settings.defaultDivergenceThreshold
            if (threshold < 0 || threshold > 1) {
              console.error(`Invalid divergence threshold: ${threshold}. Must be between 0 and 1.`)
              return
            }
          }
          state.agent = { ...state.agent, ...settings }
        }),

      updateAppearanceSettings: (settings) =>
        set((state) => {
          if (settings.theme !== undefined && !isTheme(settings.theme)) {
            console.error(`Invalid theme: ${settings.theme}`)
            return
          }
          state.appearance = { ...state.appearance, ...settings }
        }),

      resetToDefaults: () =>
        set((state) => {
          state.general = DEFAULT_GENERAL
          state.agent = DEFAULT_AGENT
          state.appearance = DEFAULT_APPEARANCE
        }),
    })),
    {
      name: 'settings-storage',
      version: 1,
      partialize: (state) => ({
        general: state.general,
        agent: state.agent,
        appearance: state.appearance,
      }),
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return {
            activeTab: 'general' as SettingsTab,
            general: DEFAULT_GENERAL,
            agent: DEFAULT_AGENT,
            appearance: DEFAULT_APPEARANCE,
          }
        }

        const state = persistedState as Record<string, unknown>
        return {
          activeTab: 'general' as SettingsTab,
          general: validateGeneralSettings(state.general),
          agent: validateAgentSettings(state.agent),
          appearance: validateAppearanceSettings(state.appearance),
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          console.warn('Failed to rehydrate settings store')
        }
      },
    }
  )
)
