import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RemoteAgentForm } from './RemoteAgentForm'
import { useRemoteAgentStore } from '@/stores/remoteAgent'
import { testRemoteConnection } from '@/lib/api/testConnection'
import userEvent from '@testing-library/user-event'

// Mock the API function
vi.mock('@/lib/api/testConnection', () => ({
  testRemoteConnection: vi.fn(),
}))

// Mock ResizeObserver for Radix UI
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock PointerEvent for Radix UI Slider
window.PointerEvent = class PointerEvent extends Event {
  constructor(type: string, props: any) {
    super(type, props)
  }
} as any
window.HTMLElement.prototype.scrollIntoView = vi.fn()
window.HTMLElement.prototype.hasPointerCapture = vi.fn()
window.HTMLElement.prototype.releasePointerCapture = vi.fn()

describe('RemoteAgentForm', () => {
  beforeEach(() => {
    useRemoteAgentStore.getState().resetConfig()
    vi.clearAllMocks()
  })

  it('renders with default values', () => {
    render(<RemoteAgentForm />)
    expect(screen.getByLabelText(/Endpoint URL/i)).toHaveValue('')
    expect(screen.getByText('Request Timeout: 30s')).toBeInTheDocument()
  })

  it('validates required fields', async () => {
    const { container } = render(<RemoteAgentForm />)
    const user = userEvent.setup()

    const urlInput = screen.getByLabelText(/Endpoint URL/i)
    await user.type(urlInput, 'not-a-url')

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Please enter a valid URL/i)).toBeInTheDocument()
    })
  })

  it('validates auth token presence for Bearer type', async () => {
    act(() => {
      useRemoteAgentStore.getState().setConfig({ authType: 'bearer' })
    })
    
    const { container } = render(<RemoteAgentForm />)
    expect(screen.getByLabelText(/Bearer Token/i)).toBeInTheDocument()
    
    const form = container.querySelector('form')!
    fireEvent.submit(form)
    
    await waitFor(() => {
      expect(screen.getByText(/Token is required for Bearer auth/i)).toBeInTheDocument()
    })
  })

  it('calls test connection with form values', async () => {
    render(<RemoteAgentForm />)
    const user = userEvent.setup()

    const urlInput = screen.getByLabelText(/Endpoint URL/i)
    await user.type(urlInput, 'http://localhost:8000')

    const mockResult = {
      success: true,
      latencyMs: 50,
      message: 'Connection Successful',
      responsePreview: '{}'
    }
    vi.mocked(testRemoteConnection).mockResolvedValue(mockResult)

    const testButton = screen.getByRole('button', { name: /Test Connection/i })
    await user.click(testButton)

    await waitFor(() => {
      expect(testRemoteConnection).toHaveBeenCalledWith(expect.objectContaining({
        endpointUrl: 'http://localhost:8000',
        timeout: 30
      }))
      expect(screen.getAllByText(/Connection Successful/i)[0]).toBeInTheDocument()
    })
  })

  it('saves configuration to store', async () => {
    const { container } = render(<RemoteAgentForm />)
    const user = userEvent.setup()

    const urlInput = screen.getByLabelText(/Endpoint URL/i)
    await user.type(urlInput, 'http://example.com')

    const form = container.querySelector('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      const { config } = useRemoteAgentStore.getState()
      expect(config.endpointUrl).toBe('http://example.com')
    }, { timeout: 3000 })
  })

  it('shows error on failed connection test', async () => {
    render(<RemoteAgentForm />)
    const user = userEvent.setup()
    
    const urlInput = screen.getByLabelText(/Endpoint URL/i)
    await user.type(urlInput, 'http://fail.com')

    vi.mocked(testRemoteConnection).mockResolvedValue({
      success: false,
      latencyMs: 0,
      message: 'Network Error'
    })

    const testButton = screen.getByRole('button', { name: /Test Connection/i })
    await user.click(testButton)

    await waitFor(() => {
      expect(screen.getAllByText(/Connection Failed/i)[0]).toBeInTheDocument()
      expect(screen.getAllByText(/Network Error/i)[0]).toBeInTheDocument()
    })
  })
})