import { create } from 'zustand'

export type ActionType = 'runEvaluation' | 'generateReport' | 'loadDemo' | 'commandPalette'

interface ActionStore {
  handlers: Record<ActionType, (() => void) | undefined>
  /**
   * Register a handler for a specific action.
   * WARNING: This store is intended for TRUSTED first-party React code only.
   * Do not expose this to untrusted scripts or plugins.
   * @returns Cleanup function to unregister the handler.
   */
  registerHandler: (action: ActionType, handler: () => void) => () => void
  /**
   * Trigger a registered action.
   * WARNING: This executes the handler immediately without further authorization checks.
   * Ensure the caller is authorized to perform this action.
   */
  trigger: (action: ActionType) => void
}

export const useActionStore = create<ActionStore>((set, get) => ({
  handlers: {
    runEvaluation: undefined,
    generateReport: undefined,
    loadDemo: undefined,
    commandPalette: undefined,
  },
  registerHandler: (action, handler) => {
    set((state) => ({
      handlers: { ...state.handlers, [action]: handler }
    }))
    // Return cleanup function
    return () => {
      set((state) => {
        // Only remove if it's the same handler (simple check)
        // In a complex app we might support multiple handlers, but for now 1:1 is fine.
        if (state.handlers[action] === handler) {
            return { handlers: { ...state.handlers, [action]: undefined } }
        }
        return state
      })
    }
  },
  trigger: (action) => {
    const handler = get().handlers[action]
    if (handler) {
      handler()
    } else {
      console.warn(`No handler registered for action: ${action}`)
    }
  }
}))