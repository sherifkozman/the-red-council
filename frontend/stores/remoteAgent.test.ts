import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRemoteAgentStore, RemoteAgentConfig, ConnectionStatusInfo } from './remoteAgent'

describe('useRemoteAgentStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useRemoteAgentStore.getState().resetConfig()
    // Clear persist storage
    useRemoteAgentStore.persist.clearStorage()
  })

  describe('config management', () => {
    it('initializes with default config', () => {
      const { config } = useRemoteAgentStore.getState()
      expect(config.endpointUrl).toBe('')
      expect(config.timeout).toBe(30)
      expect(config.authType).toBe('none')
      expect(config.requestFormat).toBe('openai')
    })

    it('updates configuration partially', () => {
      useRemoteAgentStore.getState().setConfig({
        endpointUrl: 'http://test.com',
        timeout: 60
      })

      const { config } = useRemoteAgentStore.getState()
      expect(config.endpointUrl).toBe('http://test.com')
      expect(config.timeout).toBe(60)
      expect(config.authType).toBe('none') // Unchanged
    })

    it('resets configuration to defaults', () => {
      useRemoteAgentStore.getState().setConfig({
        endpointUrl: 'http://test.com',
        authType: 'bearer'
      })

      useRemoteAgentStore.getState().resetConfig()

      const { config } = useRemoteAgentStore.getState()
      expect(config.endpointUrl).toBe('')
      expect(config.authType).toBe('none')
    })

    it('handles deep updates correctly via shallow merge', () => {
      useRemoteAgentStore.getState().setConfig({
        authHeader: 'X-Custom'
      })

      const { config } = useRemoteAgentStore.getState()
      expect(config.authHeader).toBe('X-Custom')
      expect(config.timeout).toBe(30) // Preserved
    })

    it('resets connection status when endpoint URL changes', () => {
      // First set a connected status
      useRemoteAgentStore.getState().setConnectionStatus({
        status: 'connected',
        lastTestedAt: new Date().toISOString(),
        latencyMs: 45,
        statusCode: 200,
        errorMessage: null,
      })

      // Change endpoint URL
      useRemoteAgentStore.getState().setConfig({
        endpointUrl: 'http://new-endpoint.com'
      })

      // Connection status should be reset
      const { connectionStatus } = useRemoteAgentStore.getState()
      expect(connectionStatus.status).toBe('untested')
      expect(connectionStatus.lastTestedAt).toBeNull()
    })

    it('does not reset connection status when other config changes', () => {
      // First set a connected status
      useRemoteAgentStore.getState().setConnectionStatus({
        status: 'connected',
        lastTestedAt: new Date().toISOString(),
        latencyMs: 45,
        statusCode: 200,
        errorMessage: null,
      })

      // Change timeout (not endpoint)
      useRemoteAgentStore.getState().setConfig({
        timeout: 60
      })

      // Connection status should NOT be reset
      const { connectionStatus } = useRemoteAgentStore.getState()
      expect(connectionStatus.status).toBe('connected')
    })
  })

  describe('connection status management', () => {
    it('initializes with default connection status', () => {
      const { connectionStatus } = useRemoteAgentStore.getState()
      expect(connectionStatus.status).toBe('untested')
      expect(connectionStatus.lastTestedAt).toBeNull()
      expect(connectionStatus.latencyMs).toBeNull()
      expect(connectionStatus.statusCode).toBeNull()
      expect(connectionStatus.errorMessage).toBeNull()
    })

    it('updates connection status', () => {
      const newStatus: ConnectionStatusInfo = {
        status: 'connected',
        lastTestedAt: '2026-02-02T10:00:00.000Z',
        latencyMs: 45,
        statusCode: 200,
        errorMessage: null,
      }

      useRemoteAgentStore.getState().setConnectionStatus(newStatus)

      const { connectionStatus } = useRemoteAgentStore.getState()
      expect(connectionStatus.status).toBe('connected')
      expect(connectionStatus.lastTestedAt).toBe('2026-02-02T10:00:00.000Z')
      expect(connectionStatus.latencyMs).toBe(45)
      expect(connectionStatus.statusCode).toBe(200)
      expect(connectionStatus.errorMessage).toBeNull()
    })

    it('updates connection status to failed with error message', () => {
      const failedStatus: ConnectionStatusInfo = {
        status: 'failed',
        lastTestedAt: '2026-02-02T10:00:00.000Z',
        latencyMs: null,
        statusCode: 503,
        errorMessage: 'Service unavailable',
      }

      useRemoteAgentStore.getState().setConnectionStatus(failedStatus)

      const { connectionStatus } = useRemoteAgentStore.getState()
      expect(connectionStatus.status).toBe('failed')
      expect(connectionStatus.errorMessage).toBe('Service unavailable')
      expect(connectionStatus.statusCode).toBe(503)
    })

    it('clears connection status', () => {
      // First set a status
      useRemoteAgentStore.getState().setConnectionStatus({
        status: 'connected',
        lastTestedAt: '2026-02-02T10:00:00.000Z',
        latencyMs: 45,
        statusCode: 200,
        errorMessage: null,
      })

      // Clear it
      useRemoteAgentStore.getState().clearConnectionStatus()

      const { connectionStatus } = useRemoteAgentStore.getState()
      expect(connectionStatus.status).toBe('untested')
      expect(connectionStatus.lastTestedAt).toBeNull()
    })

    it('resets connection status when config is reset', () => {
      // First set a status
      useRemoteAgentStore.getState().setConnectionStatus({
        status: 'connected',
        lastTestedAt: '2026-02-02T10:00:00.000Z',
        latencyMs: 45,
        statusCode: 200,
        errorMessage: null,
      })

      // Reset config
      useRemoteAgentStore.getState().resetConfig()

      const { connectionStatus } = useRemoteAgentStore.getState()
      expect(connectionStatus.status).toBe('untested')
    })
  })
})
