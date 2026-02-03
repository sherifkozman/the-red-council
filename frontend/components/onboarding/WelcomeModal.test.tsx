import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WelcomeModal } from './WelcomeModal'
import { useOnboardingStore } from '@/stores/onboarding'
import { useTestingModeStore } from '@/stores/testingMode'

// Mock useRouter
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock ResizeObserver for Radix UI
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('WelcomeModal', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset()
    useTestingModeStore.getState().setMode('llm-testing') // default
    mockPush.mockClear()
  })

  it('does not render when hasSeenWelcome is true', () => {
    useOnboardingStore.getState().setHasSeenWelcome(true)
    render(<WelcomeModal />)
    expect(screen.queryByText('Welcome to The Red Council')).not.toBeInTheDocument()
  })

  it('renders when hasSeenWelcome is false', () => {
    useOnboardingStore.getState().setHasSeenWelcome(false)
    render(<WelcomeModal />)
    expect(screen.getByText('Welcome to The Red Council')).toBeInTheDocument()
    expect(screen.getByText('Try Demo')).toBeInTheDocument()
  })

  it('navigates to Demo mode when clicking Try Demo', async () => {
    useOnboardingStore.getState().setHasSeenWelcome(false)
    render(<WelcomeModal />)
    
    // Using closest button to target the card button
    const demoButton = screen.getByText('Try Demo').closest('button')
    expect(demoButton).toBeInTheDocument()
    
    fireEvent.click(demoButton!)

    await waitFor(() => {
        expect(useTestingModeStore.getState().mode).toBe('demo-mode')
        expect(useOnboardingStore.getState().hasSeenWelcome).toBe(true)
        expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('navigates to Agent mode when clicking Connect Agent', async () => {
    useOnboardingStore.getState().setHasSeenWelcome(false)
    render(<WelcomeModal />)
    
    const agentButton = screen.getByText('Connect Agent').closest('button')
    expect(agentButton).toBeInTheDocument()
    
    fireEvent.click(agentButton!)

    await waitFor(() => {
        expect(useTestingModeStore.getState().mode).toBe('agent-testing')
        expect(useOnboardingStore.getState().hasSeenWelcome).toBe(true)
        expect(mockPush).toHaveBeenCalledWith('/agent/connect')
    })
  })

  it('navigates to LLM mode when clicking Test an LLM', async () => {
    useOnboardingStore.getState().setHasSeenWelcome(false)
    render(<WelcomeModal />)
    
    const llmButton = screen.getByText('Test an LLM').closest('button')
    expect(llmButton).toBeInTheDocument()
    
    fireEvent.click(llmButton!)

    await waitFor(() => {
        expect(useTestingModeStore.getState().mode).toBe('llm-testing')
        expect(useOnboardingStore.getState().hasSeenWelcome).toBe(true)
        expect(mockPush).toHaveBeenCalledWith('/arena')
    })
  })

  it('closes modal when clicking Skip', async () => {
    useOnboardingStore.getState().setHasSeenWelcome(false)
    render(<WelcomeModal />)
    
    const skipButton = screen.getByText('Skip for now')
    fireEvent.click(skipButton)

    await waitFor(() => {
        expect(useOnboardingStore.getState().hasSeenWelcome).toBe(true)
        expect(screen.queryByText('Welcome to The Red Council')).not.toBeInTheDocument()
    })
  })
})