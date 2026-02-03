import { describe, it, expect, beforeEach } from 'vitest'
import { useOnboardingStore } from './onboarding'

describe('useOnboardingStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useOnboardingStore.getState().reset()
  })

  it('initializes with default state', () => {
    const state = useOnboardingStore.getState()
    expect(state.hasSeenWelcome).toBe(false)
    expect(state.isDismissed).toBe(false)
  })

  it('updates hasSeenWelcome', () => {
    useOnboardingStore.getState().setHasSeenWelcome(true)
    expect(useOnboardingStore.getState().hasSeenWelcome).toBe(true)
  })
  
  it('updates isDismissed', () => {
    useOnboardingStore.getState().dismissProgress()
    expect(useOnboardingStore.getState().isDismissed).toBe(true)
  })

  it('resets state', () => {
    useOnboardingStore.getState().setHasSeenWelcome(true)
    useOnboardingStore.getState().dismissProgress()
    useOnboardingStore.getState().reset()
    expect(useOnboardingStore.getState().hasSeenWelcome).toBe(false)
    expect(useOnboardingStore.getState().isDismissed).toBe(false)
  })

  it('persists state to localStorage', () => {
    useOnboardingStore.getState().setHasSeenWelcome(true)
    
    // Zustand persist might be async or require a tick
    const storageData = window.localStorage.getItem('red-council:onboarding:v1')
    expect(storageData).toBeTruthy()
    
    if (storageData) {
        const parsed = JSON.parse(storageData)
        expect(parsed.state.hasSeenWelcome).toBe(true)
    }
  })

  it('migrates from invalid state', () => {
    // Manually set invalid state
    window.localStorage.setItem('red-council:onboarding:v1', JSON.stringify({
        state: { hasSeenWelcome: 'invalid-boolean' },
        version: 1
    }))

    // Force rehydration
    useOnboardingStore.persist.rehydrate()

    const state = useOnboardingStore.getState()
    // Should fallback to false due to validation failure
    expect(state.hasSeenWelcome).toBe(false)
  })

  it('handles corrupted JSON', () => {
    window.localStorage.setItem('red-council:onboarding:v1', '{ invalid json')
    useOnboardingStore.persist.rehydrate()
    const state = useOnboardingStore.getState()
    expect(state.hasSeenWelcome).toBe(false)
  })
})