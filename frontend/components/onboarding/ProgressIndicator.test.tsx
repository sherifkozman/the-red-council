import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProgressIndicator } from './ProgressIndicator'
import { useOnboardingStore } from '@/stores/onboarding'
import { useTestingModeStore } from '@/stores/testingMode'

// Mock dependencies
vi.mock('@/stores/onboarding', () => ({
  useOnboardingStore: vi.fn()
}))

vi.mock('@/stores/testingMode', () => ({
  useTestingModeStore: vi.fn()
}))

// Mock ResizeObserver for Collapsible
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('ProgressIndicator', () => {
  const mockDismiss = vi.fn()
  
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock setup
    ;(useOnboardingStore as any).mockReturnValue({
      completedSteps: {
        'llm-testing': { 'llm-select-target': true }
      },
      isDismissed: false,
      dismissProgress: mockDismiss,
      _hasHydrated: true
    })
    
    ;(useTestingModeStore as any).mockImplementation((selector: any) => 
      selector({ mode: 'llm-testing' })
    )
  })

  it('renders correctly', () => {
    render(<ProgressIndicator />)
    expect(screen.getByText('Setup Progress')).toBeInTheDocument()
    // 1 step completed out of 4 for llm-testing
    expect(screen.getByText('25% Complete')).toBeInTheDocument() 
    expect(screen.getByText('1/4 Steps')).toBeInTheDocument()
  })

  it('renders collapsed view', () => {
    render(<ProgressIndicator isSidebarCollapsed={true} />)
    expect(screen.queryByText('Setup Progress')).not.toBeInTheDocument()
    // Check for aria-label
    expect(screen.getByRole('complementary', { name: /Onboarding Progress \(Collapsed\)/i })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /Onboarding progress: 25% complete/i })).toBeInTheDocument()
  })

  it('does not render if dismissed', () => {
    ;(useOnboardingStore as any).mockReturnValue({
      completedSteps: {},
      isDismissed: true,
      dismissProgress: mockDismiss,
      _hasHydrated: true
    })
    
    const { container } = render(<ProgressIndicator />)
    expect(container).toBeEmptyDOMElement()
  })
  
  it('calls dismiss when button clicked', () => {
    render(<ProgressIndicator />)
    const dismissBtn = screen.getByLabelText('Dismiss onboarding progress')
    fireEvent.click(dismissBtn)
    expect(mockDismiss).toHaveBeenCalled()
  })

  it('expands and collapses steps', () => {
    render(<ProgressIndicator />)
    // It's open by default
    expect(screen.getByText('Select Target Model')).toBeVisible()
    
    // Click to collapse
    fireEvent.click(screen.getByText('Hide Steps'))
    expect(screen.getByText('Show Steps')).toBeInTheDocument()
  })

  it('renders links for steps', () => {
    render(<ProgressIndicator />)
    const link = screen.getByRole('link', { name: /Select Target Model/i })
    expect(link).toHaveAttribute('href', '/arena')
  })
})
