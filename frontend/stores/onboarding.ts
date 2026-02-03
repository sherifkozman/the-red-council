import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface OnboardingState {
  hasSeenWelcome: boolean
  setHasSeenWelcome: (seen: boolean) => void
  reset: () => void
}

const STORAGE_KEY = 'red-council:onboarding:v1'

function isValidState(state: unknown): state is Partial<OnboardingState> {
    return (
        typeof state === 'object' &&
        state !== null &&
        'hasSeenWelcome' in state &&
        typeof (state as any).hasSeenWelcome === 'boolean'
    )
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    immer((set) => ({
      hasSeenWelcome: false,
      setHasSeenWelcome: (seen) => set((state) => {
        state.hasSeenWelcome = seen
      }),
      reset: () => set((state) => {
        state.hasSeenWelcome = false
      }),
    })),
    {
      name: STORAGE_KEY,
      version: 1,
      migrate: (persistedState: unknown, version) => {
        if (version === 1 && isValidState(persistedState)) {
             return persistedState as OnboardingState
        }
        if (version !== 1) {
            // Future-proofing: log if we encounter unexpected version
            if (process.env.NODE_ENV === 'development') {
                console.warn(`[onboarding] Unknown version ${version}, resetting state.`)
            }
        } else {
             if (process.env.NODE_ENV === 'development') {
                console.warn('[onboarding] Invalid persisted state, resetting.')
             }
        }
        return { hasSeenWelcome: false }
      },
      merge: (persistedState: unknown, currentState) => {
        if (isValidState(persistedState)) {
            return { ...currentState, ...persistedState }
        }
        if (persistedState) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('[onboarding] Invalid persisted state during merge, using current state.')
            }
        }
        return currentState
      },
    }
  )
)
