import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, TestConnectionResponse } from '../route'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock performance.now() for consistent latency testing
vi.spyOn(performance, 'now').mockReturnValue(0)

describe('POST /api/test-connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const createRequest = (body: Record<string, unknown>): NextRequest => {
    return new NextRequest('http://localhost:3000/api/test-connection', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  describe('Input validation', () => {
    it('returns 400 for missing endpointUrl', async () => {
      const request = createRequest({ timeout: 30 })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.message).toBe('Invalid request parameters')
    })

    it('returns 400 for invalid URL format', async () => {
      const request = createRequest({
        endpointUrl: 'not-a-url',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.message).toContain('Invalid URL')
    })

    it('returns 400 for non-http/https URLs', async () => {
      const request = createRequest({
        endpointUrl: 'file:///etc/passwd',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })

    it('returns 400 for invalid timeout values', async () => {
      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 200, // exceeds max of 120
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
    })
  })

  describe('SSRF protection', () => {
    it('blocks AWS metadata endpoint', async () => {
      const request = createRequest({
        endpointUrl: 'http://169.254.169.254/latest/meta-data/',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
      expect(data.message).toContain('not allowed')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('blocks GCP metadata endpoint', async () => {
      const request = createRequest({
        endpointUrl: 'http://metadata.google.internal/computeMetadata/v1/',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Successful connection', () => {
    it('returns success for valid endpoint', async () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(50)

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'content-length': '100',
        }),
        json: () => Promise.resolve({ status: 'ok', version: '1.0.0' }),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api/chat',
        timeout: 30,
        authType: 'none',
        requestFormat: 'openai',
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Connection successful')
      expect(data.statusCode).toBe(200)
      expect(data.latencyMs).toBe(50)
    })

    it('includes response preview', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ agent: 'ready', model: 'gpt-4' }),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.responsePreview).toContain('agent')
      expect(data.responsePreview).toContain('ready')
    })

    it('extracts response using JSON path', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          data: {
            output: {
              text: 'Hello from the agent',
            },
          },
        }),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
        responseJsonPath: 'data.output.text',
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.responsePreview).toContain('Hello from the agent')
    })
  })

  describe('Authentication headers', () => {
    it('adds Bearer token header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
        authType: 'bearer',
        authToken: 'my-secret-token',
      })

      await POST(request)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-secret-token',
          }),
        })
      )
    })

    it('adds custom API key header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
        authType: 'api-key',
        authHeader: 'X-Custom-Key',
        authToken: 'api-key-value',
      })

      await POST(request)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Key': 'api-key-value',
          }),
        })
      )
    })

    it('sanitizes header name to prevent injection', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
        authType: 'api-key',
        authHeader: 'X-API-Key\r\nEvil: header',
        authToken: 'value',
      })

      await POST(request)

      // The header name should be sanitized (removes \r, \n, :, and space)
      const callArgs = mockFetch.mock.calls[0][1]
      expect(callArgs.headers).not.toHaveProperty('X-API-Key\r\nEvil: header')
      // After sanitization: X-API-Key + Evil + header = X-API-KeyEvilheader
      expect(callArgs.headers).toHaveProperty('X-API-KeyEvilheader')
    })
  })

  describe('Request formats', () => {
    it('sends OpenAI-compatible format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
        requestFormat: 'openai',
      })

      await POST(request)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body).toHaveProperty('messages')
      expect(body.messages[0]).toHaveProperty('role', 'user')
      expect(body).toHaveProperty('max_tokens', 50)
    })

    it('sends custom template with placeholder replaced', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
        requestFormat: 'custom',
        customTemplate: '{"query": "{{prompt}}", "mode": "test"}',
      })

      await POST(request)

      const body = mockFetch.mock.calls[0][1].body
      expect(body).toContain('"query":')
      expect(body).toContain('connection test')
      expect(body).toContain('"mode": "test"')
      expect(body).not.toContain('{{prompt}}')
    })
  })

  describe('Error handling', () => {
    it('returns failure for non-2xx status codes', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.success).toBe(false)
      expect(data.statusCode).toBe(401)
      expect(data.troubleshooting).toBeDefined()
    })

    it('handles timeout errors', async () => {
      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'
      mockFetch.mockRejectedValue(abortError)

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 5,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.success).toBe(false)
      expect(data.message).toContain('timed out')
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.success).toBe(false)
      expect(data.message).toContain('ECONNREFUSED')
      expect(data.troubleshooting).toBeDefined()
      expect(data.troubleshooting?.length).toBeGreaterThan(0)
    })

    it('handles non-JSON content types as plain text', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: () => Promise.resolve('Plain text response'),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.success).toBe(true)
      // Non-JSON content should be shown as plain text without JSON parsing
      expect(data.responsePreview).toContain('Plain text response')
    })
  })

  describe('Response size limits', () => {
    it('rejects responses larger than 1MB', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'content-length': '2000000', // 2MB
        }),
        json: () => Promise.resolve({}),
      })

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.success).toBe(false)
      expect(data.message).toContain('too large')
    })
  })

  describe('Troubleshooting hints', () => {
    it('provides hints for certificate errors', async () => {
      mockFetch.mockRejectedValue(new Error('SSL certificate problem'))

      const request = createRequest({
        endpointUrl: 'https://localhost:8000/api',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.troubleshooting).toBeDefined()
      expect(data.troubleshooting?.some(h => h.toLowerCase().includes('certificate'))).toBe(true)
    })

    it('provides hints for connection refused errors', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.troubleshooting).toBeDefined()
      expect(data.troubleshooting?.some(h => h.toLowerCase().includes('service') || h.toLowerCase().includes('running'))).toBe(true)
    })

    it('provides hints for custom format issues', async () => {
      mockFetch.mockRejectedValue(new Error('Parse error'))

      const request = createRequest({
        endpointUrl: 'http://localhost:8000/api',
        timeout: 30,
        requestFormat: 'custom',
        customTemplate: '{"test": "{{prompt}}"}',
        responseJsonPath: 'output.text',
      })

      const response = await POST(request)
      const data: TestConnectionResponse = await response.json()

      expect(data.troubleshooting).toBeDefined()
      expect(data.troubleshooting?.some(h => h.includes('custom') || h.includes('template'))).toBe(true)
    })
  })
})
