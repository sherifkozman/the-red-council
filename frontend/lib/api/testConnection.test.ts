import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { testRemoteConnection, ConnectionTestResult } from './testConnection'
import { RemoteAgentConfig } from '@/stores/remoteAgent'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('testRemoteConnection', () => {
  const baseConfig: RemoteAgentConfig = {
    endpointUrl: 'http://localhost:8000/v1/chat',
    timeout: 30,
    authType: 'none',
    authHeader: '',
    authToken: '',
    requestFormat: 'openai',
    customTemplate: '',
    responseJsonPath: '',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Input validation', () => {
    it('returns error when endpoint URL is empty', async () => {
      const config = { ...baseConfig, endpointUrl: '' }

      const result = await testRemoteConnection(config)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Endpoint URL is required')
      expect(result.troubleshooting).toContain('Enter a valid endpoint URL')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('returns error for invalid URL format', async () => {
      const config = { ...baseConfig, endpointUrl: 'not-a-valid-url' }

      const result = await testRemoteConnection(config)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid URL format')
      expect(result.troubleshooting).toContain('Enter a valid URL starting with http:// or https://')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('accepts valid HTTP URL', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, latencyMs: 50, message: 'ok' }),
      })

      const config = { ...baseConfig, endpointUrl: 'http://example.com/api' }

      await testRemoteConnection(config)

      expect(mockFetch).toHaveBeenCalled()
    })

    it('accepts valid HTTPS URL', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, latencyMs: 50, message: 'ok' }),
      })

      const config = { ...baseConfig, endpointUrl: 'https://example.com/api' }

      await testRemoteConnection(config)

      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe('API call', () => {
    it('sends correct request to API route', async () => {
      const mockResult: ConnectionTestResult = {
        success: true,
        latencyMs: 45,
        statusCode: 200,
        message: 'Connection successful',
        responsePreview: '{"status": "ok"}',
      }

      mockFetch.mockResolvedValue({
        json: () => Promise.resolve(mockResult),
      })

      const result = await testRemoteConnection(baseConfig)

      expect(mockFetch).toHaveBeenCalledWith('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpointUrl: baseConfig.endpointUrl,
          timeout: baseConfig.timeout,
          authType: baseConfig.authType,
          authHeader: baseConfig.authHeader,
          authToken: baseConfig.authToken,
          requestFormat: baseConfig.requestFormat,
          customTemplate: baseConfig.customTemplate,
          responseJsonPath: baseConfig.responseJsonPath,
        }),
        signal: undefined,
      })

      expect(result).toEqual(mockResult)
    })

    it('passes abort signal to fetch', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, latencyMs: 50, message: 'ok' }),
      })

      const controller = new AbortController()

      await testRemoteConnection(baseConfig, controller.signal)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test-connection',
        expect.objectContaining({
          signal: controller.signal,
        })
      )
    })

    it('returns API response on success', async () => {
      const mockResult: ConnectionTestResult = {
        success: true,
        latencyMs: 100,
        statusCode: 200,
        message: 'Connection successful',
        responsePreview: '{"agent": "ready"}',
      }

      mockFetch.mockResolvedValue({
        json: () => Promise.resolve(mockResult),
      })

      const result = await testRemoteConnection(baseConfig)

      expect(result.success).toBe(true)
      expect(result.latencyMs).toBe(100)
      expect(result.statusCode).toBe(200)
      expect(result.responsePreview).toBe('{"agent": "ready"}')
    })

    it('returns API error response', async () => {
      const mockResult: ConnectionTestResult = {
        success: false,
        latencyMs: 50,
        message: 'Connection refused',
        troubleshooting: ['Check if service is running'],
      }

      mockFetch.mockResolvedValue({
        json: () => Promise.resolve(mockResult),
      })

      const result = await testRemoteConnection(baseConfig)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Connection refused')
      expect(result.troubleshooting).toContain('Check if service is running')
    })
  })

  describe('Error handling', () => {
    it('handles abort error gracefully', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      mockFetch.mockRejectedValue(abortError)

      const result = await testRemoteConnection(baseConfig)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Connection test was cancelled')
      expect(result.latencyMs).toBe(0)
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network request failed'))

      const result = await testRemoteConnection(baseConfig)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Network request failed')
      expect(result.troubleshooting).toContain('Check your network connection')
    })

    it('handles unexpected errors', async () => {
      mockFetch.mockRejectedValue('Unknown error type')

      const result = await testRemoteConnection(baseConfig)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Failed to test connection')
    })
  })

  describe('Configuration forwarding', () => {
    it('forwards auth configuration', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, latencyMs: 50, message: 'ok' }),
      })

      const config = {
        ...baseConfig,
        authType: 'bearer' as const,
        authToken: 'secret-token-123',
      }

      await testRemoteConnection(config)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test-connection',
        expect.objectContaining({
          body: expect.stringContaining('"authType":"bearer"'),
        })
      )

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test-connection',
        expect.objectContaining({
          body: expect.stringContaining('"authToken":"secret-token-123"'),
        })
      )
    })

    it('forwards custom format configuration', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, latencyMs: 50, message: 'ok' }),
      })

      const config = {
        ...baseConfig,
        requestFormat: 'custom' as const,
        customTemplate: '{"query": "{{prompt}}"}',
        responseJsonPath: 'data.output',
      }

      await testRemoteConnection(config)

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test-connection',
        expect.objectContaining({
          body: expect.stringContaining('"requestFormat":"custom"'),
        })
      )

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/test-connection',
        expect.objectContaining({
          body: expect.stringContaining('"customTemplate":"{\\"query\\": \\"{{prompt}}\\"}"'),
        })
      )
    })
  })
})
