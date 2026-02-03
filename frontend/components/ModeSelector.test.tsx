import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModeSelector } from './ModeSelector'
import { useTestingModeStore } from '@/stores/testingMode'

// Mock useRouter
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/',
}))

// Mock ResizeObserver for Tabs
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock PointerEvent if needed (JSDOM usually handles it but explicit mock helps Radix)
if (!global.PointerEvent) {
  class PointerEvent extends MouseEvent {
    public height?: number;
    public isPrimary?: boolean;
    public pointerId?: number;
    public pointerType?: string;
    public pressure?: number;
    public tangentialPressure?: number;
    public tiltX?: number;
    public tiltY?: number;
    public twist?: number;
    public width?: number;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId;
      this.width = params.width;
      this.height = params.height;
      this.pressure = params.pressure;
      this.tangentialPressure = params.tangentialPressure;
      this.tiltX = params.tiltX;
      this.tiltY = params.tiltY;
      this.pointerType = params.pointerType;
      this.isPrimary = params.isPrimary;
      this.twist = params.twist;
    }
  }
  global.PointerEvent = PointerEvent as any;
}

describe('ModeSelector', () => {
  beforeEach(() => {
    mockPush.mockClear()
    useTestingModeStore.setState({
      mode: 'llm-testing',
      hasUnsavedChanges: false
    })
  })

  it('renders correctly', async () => {
    render(<ModeSelector />)
    await waitFor(() => {
      expect(screen.getByText('LLM Testing')).toBeInTheDocument()
      expect(screen.getByText('Agent Testing')).toBeInTheDocument()
      expect(screen.getByText('Demo Mode')).toBeInTheDocument()
    })
  })

  it('navigates to agent testing when clicked', async () => {
    const user = userEvent.setup()
    render(<ModeSelector />)
    
    const trigger = screen.getByTestId('mode-agent')
    await user.click(trigger)
    
    await waitFor(() => {
      expect(useTestingModeStore.getState().mode).toBe('agent-testing')
      expect(mockPush).toHaveBeenCalledWith('/agent')
    })
  })

  it('shows confirmation dialog when unsaved changes exist', async () => {
    const user = userEvent.setup()
    useTestingModeStore.setState({ hasUnsavedChanges: true })
    render(<ModeSelector />)
    
    const trigger = screen.getByTestId('mode-agent')
    await user.click(trigger)
    
    // Dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
    })
    
    // Confirm
    const continueButton = screen.getByText('Continue')
    await user.click(continueButton)
    
    await waitFor(() => {
      expect(useTestingModeStore.getState().mode).toBe('agent-testing')
      expect(mockPush).toHaveBeenCalledWith('/agent')
    })
  })

  it('cancels navigation when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    useTestingModeStore.setState({ hasUnsavedChanges: true })
    render(<ModeSelector />)
    
    const trigger = screen.getByTestId('mode-agent')
    await user.click(trigger)
    
    await waitFor(() => {
      expect(screen.getByText('Unsaved Changes')).toBeInTheDocument()
    })
    
    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)
    
    await waitFor(() => {
      expect(useTestingModeStore.getState().mode).toBe('llm-testing') // No change
      expect(mockPush).not.toHaveBeenCalled()
      expect(screen.queryByText('Unsaved Changes')).not.toBeInTheDocument()
    })
  })

  it('navigates to demo mode when clicked', async () => {
    const user = userEvent.setup()
    render(<ModeSelector />)
    
    const trigger = screen.getByTestId('mode-demo')
    await user.click(trigger)
    
    await waitFor(() => {
      expect(useTestingModeStore.getState().mode).toBe('demo-mode')
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('navigates back to llm testing', async () => {
    const user = userEvent.setup()
    useTestingModeStore.setState({ mode: 'agent-testing' })
    render(<ModeSelector />)
    
    const trigger = screen.getByTestId('mode-llm')
    await user.click(trigger)
    
    await waitFor(() => {
      expect(useTestingModeStore.getState().mode).toBe('llm-testing')
      expect(mockPush).toHaveBeenCalledWith('/arena')
    })
  })
})
