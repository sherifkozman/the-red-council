import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConnectionTester, ConnectionStatus, ConnectionStatusIndicator } from './ConnectionTester'
import * as testConnectionModule from '@/lib/api/testConnection'
import * as remoteAgentStoreModule from '@/stores/remoteAgent'

// Mock the store
vi.mock('@/stores/remoteAgent', () => ({
  useRemoteAgentStore: vi.fn(),
}))

// Mock the testConnection function
vi.mock('@/lib/api/testConnection', () => ({
  testRemoteConnection: vi.fn(),
}))

const mockConfig: remoteAgentStoreModule.RemoteAgentConfig = {
  endpointUrl: 'http://localhost:8000/v1/chat',
  timeout: 30,
  authType: 'none',
  authHeader: '',
  authToken: '',
  requestFormat: 'openai',
  customTemplate: '',
  responseJsonPath: '',
}

const mockEmptyConfig: remoteAgentStoreModule.RemoteAgentConfig = {
  ...mockConfig,
  endpointUrl: '',
}

const mockDefaultConnectionStatus: remoteAgentStoreModule.ConnectionStatusInfo = {
  status: 'untested',
  lastTestedAt: null,
  latencyMs: null,
  statusCode: null,
  errorMessage: null,
}

const mockConnectedStatus: remoteAgentStoreModule.ConnectionStatusInfo = {
  status: 'connected',
  lastTestedAt: new Date().toISOString(),
  latencyMs: 45,
  statusCode: 200,
  errorMessage: null,
}

const mockFailedStatus: remoteAgentStoreModule.ConnectionStatusInfo = {
  status: 'failed',
  lastTestedAt: new Date().toISOString(),
  latencyMs: null,
  statusCode: null,
  errorMessage: 'Connection refused',
}

describe('ConnectionTester', () => {
  const mockTestRemoteConnection = vi.mocked(testConnectionModule.testRemoteConnection)
  const mockUseRemoteAgentStore = vi.mocked(remoteAgentStoreModule.useRemoteAgentStore)
  const mockSetConnectionStatus = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRemoteAgentStore.mockReturnValue({
      config: mockConfig,
      connectionStatus: mockDefaultConnectionStatus,
      setConfig: vi.fn(),
      resetConfig: vi.fn(),
      setConnectionStatus: mockSetConnectionStatus,
      clearConnectionStatus: vi.fn(),
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Initial state', () => {
    it('renders with idle status when endpoint is configured', () => {
      render(<ConnectionTester />)

      expect(screen.getByText('Connection Status')).toBeInTheDocument()
      expect(screen.getByText('Not tested')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /test connection/i })).toBeEnabled()
    })

    it('disables test button when no endpoint is configured', () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockEmptyConfig,
        connectionStatus: mockDefaultConnectionStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester />)

      expect(screen.getByRole('button', { name: /test connection/i })).toBeDisabled()
      expect(screen.getByText(/configure an endpoint url/i)).toBeInTheDocument()
    })

    it('displays endpoint URL when configured', () => {
      render(<ConnectionTester />)

      expect(screen.getByText('http://localhost:8000/v1/chat')).toBeInTheDocument()
    })

    it('shows placeholder when no endpoint is configured', () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockEmptyConfig,
        connectionStatus: mockDefaultConnectionStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester />)

      expect(screen.getByText('No endpoint configured')).toBeInTheDocument()
    })
  })

  describe('Testing flow', () => {
    it('shows loading state when testing', async () => {
      mockTestRemoteConnection.mockImplementation(
        () => new Promise((resolve) => setTimeout(
          () => resolve({ success: true, latencyMs: 50, message: 'Connected' }),
          100
        ))
      )

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      expect(screen.getByText('Testing...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('displays success result after successful test', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: true,
        latencyMs: 45,
        statusCode: 200,
        message: 'Connection successful',
        responsePreview: '{"status": "ok"}',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      // Wait for the success alert to appear
      await waitFor(() => {
        expect(screen.getByText('Connection Successful')).toBeInTheDocument()
      })

      expect(screen.getByText('Connection successful')).toBeInTheDocument()
      expect(screen.getByText('(45ms)')).toBeInTheDocument()
      // Verify store was updated
      expect(mockSetConnectionStatus).toHaveBeenCalledWith(expect.objectContaining({
        status: 'connected',
      }))
    })

    it('displays failure result with troubleshooting hints', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: false,
        latencyMs: 0,
        message: 'Connection refused',
        troubleshooting: ['Check if the service is running', 'Verify the port number'],
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      // Wait for the failure alert to appear
      await waitFor(() => {
        expect(screen.getByText('Connection Failed')).toBeInTheDocument()
      })

      expect(screen.getByText('Check if the service is running')).toBeInTheDocument()
      expect(screen.getByText('Verify the port number')).toBeInTheDocument()
      // Verify store was updated
      expect(mockSetConnectionStatus).toHaveBeenCalledWith(expect.objectContaining({
        status: 'failed',
      }))
    })

    it('auto-expands details on failure', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: false,
        latencyMs: 0,
        message: 'Connection failed',
        troubleshooting: ['Try again'],
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(screen.getByText('Troubleshooting:')).toBeInTheDocument()
      })
    })

    it('calls setConnectionStatus with lastTestedAt after test', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: true,
        latencyMs: 50,
        message: 'Connected',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(mockSetConnectionStatus).toHaveBeenCalledWith(expect.objectContaining({
          lastTestedAt: expect.any(String),
        }))
      })
    })
  })

  describe('Cancel test', () => {
    it('cancels ongoing test when cancel button is clicked', async () => {
      let resolvePromise: () => void
      mockTestRemoteConnection.mockImplementation(
        () => new Promise((resolve) => {
          resolvePromise = () => resolve({ success: true, latencyMs: 50, message: 'ok' })
        })
      )

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.getByText('Not tested')).toBeInTheDocument()
    })
  })

  describe('Retest', () => {
    it('shows retest button when status is connected from store', () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockConfig,
        connectionStatus: mockConnectedStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester />)

      expect(screen.getByRole('button', { name: /retest connection/i })).toBeInTheDocument()
    })

    it('shows retest button when status is failed from store', () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockConfig,
        connectionStatus: mockFailedStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester />)

      expect(screen.getByRole('button', { name: /retest connection/i })).toBeInTheDocument()
    })

    it('can retest connection', async () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockConfig,
        connectionStatus: mockFailedStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      mockTestRemoteConnection.mockResolvedValue({
        success: true,
        latencyMs: 50,
        message: 'Connected',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /retest connection/i }))

      await waitFor(() => {
        expect(mockSetConnectionStatus).toHaveBeenCalledWith(expect.objectContaining({
          status: 'connected',
        }))
      })
    })
  })

  describe('Dismiss result', () => {
    it('dismisses result alert when dismiss button is clicked', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: true,
        latencyMs: 50,
        message: 'Connected',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(screen.getByText('Connection Successful')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /dismiss result/i }))

      expect(screen.queryByText('Connection Successful')).not.toBeInTheDocument()
    })
  })

  describe('Details toggle', () => {
    it('toggles details visibility', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: true,
        latencyMs: 50,
        statusCode: 200,
        message: 'Connected',
        responsePreview: '{"test": true}',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(screen.getByText('Connection Successful')).toBeInTheDocument()
      })

      // Show details
      fireEvent.click(screen.getByRole('button', { name: /show details/i }))

      expect(screen.getByText('Response Preview:')).toBeInTheDocument()
      expect(screen.getByText('HTTP Status:')).toBeInTheDocument()

      // Hide details
      fireEvent.click(screen.getByRole('button', { name: /hide details/i }))

      await waitFor(() => {
        expect(screen.queryByText('Response Preview:')).not.toBeInTheDocument()
      })
    })
  })

  describe('Compact mode', () => {
    it('renders compact view', () => {
      render(<ConnectionTester compact />)

      expect(screen.queryByText('Connection Status')).not.toBeInTheDocument()
      expect(screen.getByText('Not tested')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /test/i })).toBeInTheDocument()
    })

    it('shows retest button in compact mode when connected', () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockConfig,
        connectionStatus: mockConnectedStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester compact />)

      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retest connection/i })).toBeInTheDocument()
    })

    it('hides test button when no endpoint configured in compact mode', () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockEmptyConfig,
        connectionStatus: mockDefaultConnectionStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester compact />)

      expect(screen.queryByRole('button', { name: /test/i })).not.toBeInTheDocument()
    })
  })

  describe('Status change callback', () => {
    it('calls onStatusChange with idle on initial render', () => {
      const onStatusChange = vi.fn()

      render(<ConnectionTester onStatusChange={onStatusChange} />)

      expect(onStatusChange).toHaveBeenCalledWith('idle')
    })

    it('calls onStatusChange with testing when test starts', async () => {
      const onStatusChange = vi.fn()

      mockTestRemoteConnection.mockImplementation(
        () => new Promise((resolve) => setTimeout(
          () => resolve({ success: true, latencyMs: 50, message: 'ok' }),
          100
        ))
      )

      render(<ConnectionTester onStatusChange={onStatusChange} />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith('testing')
      })
    })

    it('calls onStatusChange with connected when status is connected from store', () => {
      const onStatusChange = vi.fn()

      mockUseRemoteAgentStore.mockReturnValue({
        config: mockConfig,
        connectionStatus: mockConnectedStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester onStatusChange={onStatusChange} />)

      expect(onStatusChange).toHaveBeenCalledWith('connected')
    })
  })

  describe('Accessibility', () => {
    it('has accessible status region', () => {
      render(<ConnectionTester compact />)

      const statusRegion = screen.getByRole('status')
      expect(statusRegion).toHaveAttribute('aria-label', expect.stringContaining('Connection status'))
    })

    it('announces success results politely', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: true,
        latencyMs: 50,
        message: 'Connected',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        const alert = screen.getByRole('alert')
        expect(alert).toHaveAttribute('aria-live', 'polite')
      })
    })

    it('announces failure results assertively', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: false,
        latencyMs: 0,
        message: 'Failed',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        const alert = screen.getByRole('alert')
        expect(alert).toHaveAttribute('aria-live', 'assertive')
      })
    })

    it('shows cancel button with aria-busy on parent during testing', () => {
      // Use a never-resolving promise to keep the test in loading state
      mockTestRemoteConnection.mockImplementation(
        () => new Promise(() => {})
      )

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      // The Cancel button should appear immediately
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      expect(cancelButton).toBeInTheDocument()
      // The button should have aria-busy on itself
      expect(cancelButton).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe('Long URL truncation', () => {
    it('truncates long endpoint URLs', () => {
      const longUrl = 'http://my-very-long-domain-name-that-exceeds-sixty-characters.example.com/api/v1/chat/completions'
      mockUseRemoteAgentStore.mockReturnValue({
        config: { ...mockConfig, endpointUrl: longUrl },
        connectionStatus: mockDefaultConnectionStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester />)

      const urlElement = screen.getByText(/my-very-long-domain/i)
      expect(urlElement.textContent).toContain('...')
      expect(urlElement.textContent?.length).toBeLessThan(longUrl.length)
    })
  })

  describe('Error handling', () => {
    it('handles unexpected errors gracefully', async () => {
      mockTestRemoteConnection.mockRejectedValue(new Error('Network error'))

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
      })
    })

    it('updates store connection status on error', async () => {
      mockTestRemoteConnection.mockRejectedValue(new Error('Network error'))

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(mockSetConnectionStatus).toHaveBeenCalledWith(expect.objectContaining({
          status: 'failed',
          errorMessage: 'An unexpected error occurred',
        }))
      })
    })
  })

  describe('Persistent connection status', () => {
    it('updates store connection status on successful test', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: true,
        latencyMs: 45,
        statusCode: 200,
        message: 'Connection successful',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(mockSetConnectionStatus).toHaveBeenCalledWith(expect.objectContaining({
          status: 'connected',
          latencyMs: 45,
          statusCode: 200,
          errorMessage: null,
        }))
      })
    })

    it('updates store connection status on failed test', async () => {
      mockTestRemoteConnection.mockResolvedValue({
        success: false,
        latencyMs: 100,
        statusCode: 503,
        message: 'Service unavailable',
      })

      render(<ConnectionTester />)

      fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

      await waitFor(() => {
        expect(mockSetConnectionStatus).toHaveBeenCalledWith(expect.objectContaining({
          status: 'failed',
          latencyMs: 100,
          statusCode: 503,
          errorMessage: 'Service unavailable',
        }))
      })
    })

    it('displays last tested time from store', () => {
      const pastTime = new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 mins ago
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockConfig,
        connectionStatus: {
          status: 'connected',
          lastTestedAt: pastTime,
          latencyMs: 45,
          statusCode: 200,
          errorMessage: null,
        },
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester />)

      expect(screen.getByText(/last tested:/i)).toBeInTheDocument()
      expect(screen.getByText(/5m ago/i)).toBeInTheDocument()
    })

    it('shows connected status from store on initial render', () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockConfig,
        connectionStatus: mockConnectedStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester />)

      expect(screen.getByText('Connected')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retest connection/i })).toBeInTheDocument()
    })

    it('shows failed status from store on initial render', () => {
      mockUseRemoteAgentStore.mockReturnValue({
        config: mockConfig,
        connectionStatus: mockFailedStatus,
        setConfig: vi.fn(),
        resetConfig: vi.fn(),
        setConnectionStatus: mockSetConnectionStatus,
        clearConnectionStatus: vi.fn(),
      })

      render(<ConnectionTester />)

      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retest connection/i })).toBeInTheDocument()
    })
  })
})

describe('ConnectionStatusIndicator', () => {
  const mockUseRemoteAgentStore = vi.mocked(remoteAgentStoreModule.useRemoteAgentStore)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders untested status', () => {
    mockUseRemoteAgentStore.mockReturnValue({
      config: mockConfig,
      connectionStatus: mockDefaultConnectionStatus,
      setConfig: vi.fn(),
      resetConfig: vi.fn(),
      setConnectionStatus: vi.fn(),
      clearConnectionStatus: vi.fn(),
    })

    
    render(<ConnectionStatusIndicator />)

    expect(screen.getByText('Not tested')).toBeInTheDocument()
  })

  it('renders connected status', () => {
    mockUseRemoteAgentStore.mockReturnValue({
      config: mockConfig,
      connectionStatus: mockConnectedStatus,
      setConfig: vi.fn(),
      resetConfig: vi.fn(),
      setConnectionStatus: vi.fn(),
      clearConnectionStatus: vi.fn(),
    })

    
    render(<ConnectionStatusIndicator />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('renders failed status', () => {
    mockUseRemoteAgentStore.mockReturnValue({
      config: mockConfig,
      connectionStatus: mockFailedStatus,
      setConfig: vi.fn(),
      resetConfig: vi.fn(),
      setConnectionStatus: vi.fn(),
      clearConnectionStatus: vi.fn(),
    })

    
    render(<ConnectionStatusIndicator />)

    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('hides label when showLabel is false', () => {
    mockUseRemoteAgentStore.mockReturnValue({
      config: mockConfig,
      connectionStatus: mockConnectedStatus,
      setConfig: vi.fn(),
      resetConfig: vi.fn(),
      setConnectionStatus: vi.fn(),
      clearConnectionStatus: vi.fn(),
    })

    
    render(<ConnectionStatusIndicator showLabel={false} />)

    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    // Should still have the icon
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has accessible status role and label', () => {
    mockUseRemoteAgentStore.mockReturnValue({
      config: mockConfig,
      connectionStatus: mockConnectedStatus,
      setConfig: vi.fn(),
      resetConfig: vi.fn(),
      setConnectionStatus: vi.fn(),
      clearConnectionStatus: vi.fn(),
    })

    
    render(<ConnectionStatusIndicator />)

    const statusElement = screen.getByRole('status')
    expect(statusElement).toHaveAttribute('aria-label', expect.stringContaining('Connected'))
  })

  it('shows tooltip with connection details', () => {
    const statusWithDetails: remoteAgentStoreModule.ConnectionStatusInfo = {
      status: 'connected',
      lastTestedAt: new Date().toISOString(),
      latencyMs: 45,
      statusCode: 200,
      errorMessage: null,
    }

    mockUseRemoteAgentStore.mockReturnValue({
      config: mockConfig,
      connectionStatus: statusWithDetails,
      setConfig: vi.fn(),
      resetConfig: vi.fn(),
      setConnectionStatus: vi.fn(),
      clearConnectionStatus: vi.fn(),
    })

    
    render(<ConnectionStatusIndicator />)

    const statusElement = screen.getByRole('status')
    // Tooltip content is in the title attribute
    expect(statusElement).toHaveAttribute('title', expect.stringContaining('Latency: 45ms'))
    expect(statusElement).toHaveAttribute('title', expect.stringContaining('HTTP Status: 200'))
  })
})
