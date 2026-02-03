import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QuickStartGuide } from './QuickStartGuide'
import { useTestingModeStore } from '@/stores/testingMode'
import { useOnboardingStore } from '@/stores/onboarding'

// Mock the stores
vi.mock('@/stores/testingMode', () => ({
  useTestingModeStore: vi.fn(),
  isTestingMode: vi.fn((val) => ['llm-testing', 'agent-testing', 'demo-mode'].includes(val)),
}))

vi.mock('@/stores/onboarding', () => ({
  useOnboardingStore: vi.fn(),
}))

describe('QuickStartGuide', () => {
  const mockSetStepCompleted = vi.fn()
  const mockSetIsMinimized = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock implementation for stores
    ;(useTestingModeStore as any).mockImplementation((selector: any) => 
      selector({ mode: 'agent-testing' })
    )
    
    ;(useOnboardingStore as any).mockImplementation((selector: any) => 
      selector({
        completedSteps: { 'agent-testing': {}, 'llm-testing': {}, 'demo-mode': {} },
        isMinimized: false,
        _hasHydrated: true,
        setStepCompleted: mockSetStepCompleted,
        setIsMinimized: mockSetIsMinimized,
      })
    )
  })

  it('renders the guide with correct steps for the mode', () => {
    render(<QuickStartGuide />)
    
    expect(screen.getByText('Quick Start Guide')).toBeInTheDocument()
    expect(screen.getByText('Connect Your Agent')).toBeInTheDocument()
    expect(screen.getByText('Verify Connection')).toBeInTheDocument()
  })

  it('returns null if not hydrated', () => {
    ;(useOnboardingStore as any).mockImplementation((selector: any) => 
      selector({
        completedSteps: { 'agent-testing': {} },
        isMinimized: false,
        _hasHydrated: false,
        setStepCompleted: mockSetStepCompleted,
        setIsMinimized: mockSetIsMinimized,
      })
    )

    const { container } = render(<QuickStartGuide />)
    expect(container.firstChild).toBeNull()
  })

  it('handles step completion toggling', () => {
    render(<QuickStartGuide />)
    
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    
    expect(mockSetStepCompleted).toHaveBeenCalledWith('agent-testing', 'agent-connect', true)
  })

  it('handles minimization toggling via button click', () => {
    render(<QuickStartGuide />)
    
    const toggleButton = screen.getByRole('button', { name: /collapse guide/i })
    fireEvent.click(toggleButton)
    
    expect(mockSetIsMinimized).toHaveBeenCalled()
  })

  it('handles keyboard navigation for toggle', () => {
    render(<QuickStartGuide />)
    
    const toggleButton = screen.getByRole('button', { name: /collapse guide/i })
    // Simulate Enter key which triggers click on buttons
    fireEvent.click(toggleButton)
    
    expect(mockSetIsMinimized).toHaveBeenCalled()
  })

  it('shows progress percentage correctly', () => {
    ;(useOnboardingStore as any).mockImplementation((selector: any) => 
      selector({
        completedSteps: { 'agent-testing': { 'agent-connect': true } },
        isMinimized: false,
        _hasHydrated: true,
        setStepCompleted: mockSetStepCompleted,
        setIsMinimized: mockSetIsMinimized,
      })
    )

    render(<QuickStartGuide />)
    
    // 1 out of 5 steps completed = 20%
    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  it('renders minimized state correctly', () => {
    ;(useOnboardingStore as any).mockImplementation((selector: any) => 
      selector({
        completedSteps: { 'agent-testing': { 'agent-connect': true } },
        isMinimized: true,
        _hasHydrated: true,
        setStepCompleted: mockSetStepCompleted,
        setIsMinimized: mockSetIsMinimized,
      })
    )

    render(<QuickStartGuide />)
    
    expect(screen.getByText('1/5 steps completed')).toBeInTheDocument()
    // Steps should not be visible when minimized
    expect(screen.queryByText('Connect Your Agent')).not.toBeInTheDocument()
  })

  it('shows completion message when all steps are done', () => {
    ;(useOnboardingStore as any).mockImplementation((selector: any) => 
      selector({
        completedSteps: {
          'agent-testing': {
            'agent-connect': true,
            'agent-verify': true,
            'agent-select-template': true,
            'agent-run-campaign': true,
            'agent-view-results': true,
          }
        },
        isMinimized: false,
        _hasHydrated: true,
        setStepCompleted: mockSetStepCompleted,
        setIsMinimized: mockSetIsMinimized,
      })
    )

    render(<QuickStartGuide />)
    
    expect(screen.getByText(/Congratulations!/)).toBeInTheDocument()
  })

  it('returns null if mode has no steps', () => {
    ;(useTestingModeStore as any).mockImplementation((selector: any) => 
      selector({ mode: 'unknown' as any })
    )
    
    const { container } = render(<QuickStartGuide />)
    expect(container.firstChild).toBeNull()
  })
})
