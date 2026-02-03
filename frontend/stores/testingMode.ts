import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

export const TESTING_MODES = ['llm-testing', 'agent-testing', 'demo-mode'] as const
export type TestingMode = typeof TESTING_MODES[number]

export const isTestingMode = (value: unknown): value is TestingMode => {
  return typeof value === 'string' && TESTING_MODES.includes(value as TestingMode)
}

interface TestingModeState {
  mode: TestingMode
  hasUnsavedChanges: boolean
  setMode: (mode: TestingMode) => void
  setHasUnsavedChanges: (hasChanges: boolean) => void
}

export const useTestingModeStore = create<TestingModeState>()(
  persist(
    immer((set) => ({
      mode: 'llm-testing',
      hasUnsavedChanges: false,
      setMode: (mode) => set((state) => {
        if (isTestingMode(mode)) {
          state.mode = mode
        } else {
          console.error(`Invalid mode: ${mode}`)
        }
      }),
      setHasUnsavedChanges: (hasChanges) => set((state) => {
        state.hasUnsavedChanges = hasChanges
      }),
    })),
    {
      name: 'testing-mode-storage',
      partialize: (state) => ({ mode: state.mode }),
      version: 1,
      migrate: (persistedState: any, version) => {
        const defaultState = { mode: 'llm-testing' as TestingMode }
        
        if (!persistedState || typeof persistedState !== 'object') {
          return defaultState
        }

        if (!isTestingMode(persistedState.mode)) {
          return defaultState
        }

        return persistedState as TestingModeState
      },
      onRehydrateStorage: () => (state) => {
        if (!state) {
          console.warn('Failed to rehydrate testing mode store')
        }
      },
    }
  )
)
