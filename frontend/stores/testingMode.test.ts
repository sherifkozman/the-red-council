import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTestingModeStore, isTestingMode } from './testingMode'

describe('testingMode store', () => {
  beforeEach(() => {
    useTestingModeStore.setState({
      mode: 'llm-testing',
      hasUnsavedChanges: false
    })
    vi.restoreAllMocks()
  })

  it('defaults to llm-testing', () => {
    expect(useTestingModeStore.getState().mode).toBe('llm-testing')
  })

  it('updates mode with valid value', () => {
    useTestingModeStore.getState().setMode('agent-testing')
    expect(useTestingModeStore.getState().mode).toBe('agent-testing')
  })

  it('ignores invalid mode update and logs error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // @ts-expect-error Testing invalid input
    useTestingModeStore.getState().setMode('invalid-mode')
    
    expect(useTestingModeStore.getState().mode).toBe('llm-testing') // Should not change
    expect(consoleSpy).toHaveBeenCalledWith('Invalid mode: invalid-mode')
  })

  it('updates hasUnsavedChanges', () => {
    useTestingModeStore.getState().setHasUnsavedChanges(true)
    expect(useTestingModeStore.getState().hasUnsavedChanges).toBe(true)
  })

  it('validates mode correctly', () => {
    expect(isTestingMode('llm-testing')).toBe(true)
    expect(isTestingMode('invalid')).toBe(false)
    expect(isTestingMode(123)).toBe(false)
  })

  it('migrates invalid state to default', () => {
      const persistOptions = useTestingModeStore.persist.getOptions()
      const migrate = persistOptions.migrate
      
      if (migrate) {
          // Valid state
          expect(migrate({ mode: 'agent-testing' } as any, 0)).toEqual({ mode: 'agent-testing' })
          
          // Invalid state
          expect(migrate({ mode: 'bad-mode' } as any, 0)).toEqual({ mode: 'llm-testing' })
          
          // Empty state
          expect(migrate(null, 0)).toEqual({ mode: 'llm-testing' })
          expect(migrate({}, 0)).toEqual({ mode: 'llm-testing' })
      }
  })
})