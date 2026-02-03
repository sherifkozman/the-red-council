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

// Shortcut settings
export interface ShortcutSettings {
  runEvaluation: string
  generateReport: string
  loadDemo: string
  commandPalette: string
  help: string
}

// Store state
interface SettingsState {
  // Tab state
  activeTab: SettingsTab

  // Settings sections
  general: GeneralSettings
  agent: AgentSettings
  appearance: AppearanceSettings
  shortcuts: ShortcutSettings

  // Actions
  setActiveTab: (tab: SettingsTab) => void
  updateGeneralSettings: (settings: Partial<GeneralSettings>) => void
  updateAgentSettings: (settings: Partial<AgentSettings>) => void
  updateAppearanceSettings: (settings: Partial<AppearanceSettings>) => void
  updateShortcutSettings: (settings: Partial<ShortcutSettings>) => void
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

const DEFAULT_SHORTCUTS: ShortcutSettings = {
  runEvaluation: 'alt+e',
  generateReport: 'alt+r',
  loadDemo: 'alt+d',
  commandPalette: 'alt+k',
  help: 'shift+/', // shifted ? key
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

export const validateShortcutSettings = (settings: unknown): ShortcutSettings => {
  if (!settings || typeof settings !== 'object') {
    return DEFAULT_SHORTCUTS
  }
  const s = settings as Record<string, unknown>
  
  // Validate shortcut format: optional modifiers + key
  // Supports:
  // - Modifiers: ctrl, alt, shift, meta
  // - Keys: a-z, 0-9, F1-F12
  // - Symbols: ? (as \?), /
  // - Named keys: enter, esc, escape, tab, space, delete, backspace, up, down, left, right, home, end, pageup, pagedown
  const SHORTCUT_REGEX = /^(?:(?:ctrl|alt|shift|meta)\+)*(?:[a-z0-9]|f\d{1,2}|\?|\/|enter|esc|escape|tab|space|delete|backspace|up|down|left|right|home|end|pageup|pagedown)$/i

  const isValid = (val: unknown): val is string => 
    typeof val === 'string' && val.length > 0 && SHORTCUT_REGEX.test(val)
  
  return {
    runEvaluation: isValid(s.runEvaluation) ? s.runEvaluation : DEFAULT_SHORTCUTS.runEvaluation,
    generateReport: isValid(s.generateReport) ? s.generateReport : DEFAULT_SHORTCUTS.generateReport,
    loadDemo: isValid(s.loadDemo) ? s.loadDemo : DEFAULT_SHORTCUTS.loadDemo,
    commandPalette: isValid(s.commandPalette) ? s.commandPalette : DEFAULT_SHORTCUTS.commandPalette,
    help: isValid(s.help) ? s.help : DEFAULT_SHORTCUTS.help,
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set) => ({
      activeTab: 'general',
      general: DEFAULT_GENERAL,
      agent: DEFAULT_AGENT,
      appearance: DEFAULT_APPEARANCE,
      shortcuts: DEFAULT_SHORTCUTS,

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

      updateShortcutSettings: (settings) =>
        set((state) => {
          const merged = { ...state.shortcuts, ...settings }
          state.shortcuts = validateShortcutSettings(merged)
        }),

      resetToDefaults: () =>
        set((state) => {
          state.general = DEFAULT_GENERAL
          state.agent = DEFAULT_AGENT
          state.appearance = DEFAULT_APPEARANCE
          state.shortcuts = DEFAULT_SHORTCUTS
        }),
    })),
    {
      name: 'settings-storage',
      version: 2, // Bump version for new field
      partialize: (state) => ({
        general: state.general,
        agent: state.agent,
        appearance: state.appearance,
        shortcuts: state.shortcuts,
      }),
      migrate: (persistedState: unknown, version) => {
        const state = persistedState as Record<string, unknown>
        
        // Initial migration or corrupted state
        if (!state || typeof state !== 'object') {
           return {
             activeTab: 'general' as SettingsTab,
             general: DEFAULT_GENERAL,
             agent: DEFAULT_AGENT,
             appearance: DEFAULT_APPEARANCE,
             shortcuts: DEFAULT_SHORTCUTS,
           }
        }

        // Preserve activeTab if valid
        const preservedTab = isSettingsTab(state.activeTab) ? state.activeTab : 'general'

        // Migration from version 1 to 2
        if (version === 1) {
          return {
            activeTab: preservedTab,
            general: validateGeneralSettings(state.general),
            agent: validateAgentSettings(state.agent),
            appearance: validateAppearanceSettings(state.appearance),
            shortcuts: DEFAULT_SHORTCUTS, // New field default
          }
        }

        // Standard validation for current version
        return {
          activeTab: preservedTab,
          general: validateGeneralSettings(state.general),
          agent: validateAgentSettings(state.agent),
          appearance: validateAppearanceSettings(state.appearance),
          shortcuts: validateShortcutSettings(state.shortcuts),
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
