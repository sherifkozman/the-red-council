import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { TestingMode } from './testingMode'

interface OnboardingState {
  hasSeenWelcome: boolean
  completedSteps: Record<TestingMode, Record<string, boolean>>
  isMinimized: boolean
  isDismissed: boolean
  _hasHydrated: boolean
  setHasSeenWelcome: (seen: boolean) => void
  setStepCompleted: (mode: TestingMode, stepId: string, completed: boolean) => void
  setIsMinimized: (minimized: boolean) => void
  dismissProgress: () => void
  setHasHydrated: (hydrated: boolean) => void
  reset: () => void
}

const STORAGE_KEY = 'red-council:onboarding:v1'

function isValidState(state: unknown): state is Partial<OnboardingState> {
    if (typeof state !== 'object' || state === null) return false
    
    const s = state as any
    if ('hasSeenWelcome' in s && typeof s.hasSeenWelcome !== 'boolean') return false
    if ('isMinimized' in s && typeof s.isMinimized !== 'boolean') return false
    if ('isDismissed' in s && typeof s.isDismissed !== 'boolean') return false
    
    if ('completedSteps' in s) {
        if (typeof s.completedSteps !== 'object' || s.completedSteps === null) return false
        for (const key in s.completedSteps) {
            if (typeof s.completedSteps[key] !== 'object' || s.completedSteps[key] === null) return false
            // Validate all values in nested object are booleans
            const steps = s.completedSteps[key]
            for (const stepId in steps) {
                if (typeof steps[stepId] !== 'boolean') return false
            }
        }
    }
    
    return true
}

const initialState = {
  hasSeenWelcome: false,
  completedSteps: {
    'llm-testing': {},
    'agent-testing': {},
    'demo-mode': {},
  },
  isMinimized: false,
  isDismissed: false,
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    immer<OnboardingState>((set) => ({
      ...initialState,
      _hasHydrated: false,
      setHasSeenWelcome: (seen) => set((state) => {
        state.hasSeenWelcome = seen
      }),
      setStepCompleted: (mode, stepId, completed) => set((state) => {
        if (!state.completedSteps[mode]) {
          state.completedSteps[mode] = {}
        }
        state.completedSteps[mode][stepId] = completed
      }),
      setIsMinimized: (minimized) => set((state) => {
        state.isMinimized = minimized
      }),
      dismissProgress: () => set((state) => {
        state.isDismissed = true
      }),
      setHasHydrated: (hydrated) => set((state) => {
        state._hasHydrated = hydrated
      }),
      reset: () => set((state) => {
        Object.assign(state, initialState)
      }),
    })),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState: unknown, version) => {
        try {
          if (version === 1 && isValidState(persistedState)) {
               const ps = persistedState as any
               
               // Security: explicitly whitelist keys to prevent prototype pollution 
               // and unexpected state injection from localStorage
               const mergedSteps = { ...initialState.completedSteps }
               if (ps.completedSteps) {
                 for (const mode in ps.completedSteps) {
                   if (Object.prototype.hasOwnProperty.call(initialState.completedSteps, mode)) {
                     mergedSteps[mode as TestingMode] = {
                       ...mergedSteps[mode as TestingMode],
                       ...ps.completedSteps[mode]
                     }
                   }
                 }
               }

               return { 
                  ...initialState,
                  hasSeenWelcome: typeof ps.hasSeenWelcome === 'boolean' ? ps.hasSeenWelcome : initialState.hasSeenWelcome,
                  isMinimized: typeof ps.isMinimized === 'boolean' ? ps.isMinimized : initialState.isMinimized,
                  isDismissed: typeof ps.isDismissed === 'boolean' ? ps.isDismissed : initialState.isDismissed,
                  completedSteps: mergedSteps 
               }
          }
        } catch (e) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[onboarding] Migration failed', e)
          }
        }
        return initialState
      },
      merge: (persistedState: unknown, currentState) => {
        if (isValidState(persistedState)) {
            const ps = persistedState as Partial<OnboardingState>
            
            // Explicitly merge strictly to prevent pollution
            const safeCompletedSteps = { ...currentState.completedSteps }
            if (ps.completedSteps) {
                 // Only merge keys that exist in initial/current state (TestingMode)
                 // This filters out unknown modes from localStorage
                 const modes = Object.keys(currentState.completedSteps) as TestingMode[]
                 for (const mode of modes) {
                     if (ps.completedSteps[mode]) {
                         safeCompletedSteps[mode] = {
                             ...safeCompletedSteps[mode],
                             ...ps.completedSteps[mode]
                         }
                     }
                 }
            }

            return { 
                ...currentState,
                hasSeenWelcome: ps.hasSeenWelcome ?? currentState.hasSeenWelcome,
                isMinimized: ps.isMinimized ?? currentState.isMinimized,
                isDismissed: ps.isDismissed ?? currentState.isDismissed,
                completedSteps: safeCompletedSteps
            }
        }
        return currentState
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true)
        }
      },
    }
  )
)