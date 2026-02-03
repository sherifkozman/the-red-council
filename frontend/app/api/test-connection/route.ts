import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Security constants
const MAX_TIMEOUT_MS = 120000
const MIN_TIMEOUT_MS = 5000
const MAX_RESPONSE_SIZE = 1024 * 1024 // 1MB max response to prevent DoS
const SAMPLE_PROMPT = "Hello, this is a connection test. Please respond with a greeting."

// URL validation - allow localhost, private IPs for dev, and public URLs
const isValidUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString)
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false
    }
    // Block file:// and data:// protocols
    return true
  } catch {
    return false
  }
}

// Block dangerous URLs that could cause SSRF
const isBlockedHost = (urlString: string): boolean => {
  try {
    const url = new URL(urlString)
    const hostname = url.hostname.toLowerCase()

    // Block cloud metadata endpoints (SSRF prevention)
    const blockedPatterns = [
      '169.254.169.254', // AWS metadata
      'metadata.google.internal', // GCP metadata
      'metadata.azure.internal', // Azure metadata
    ]

    return blockedPatterns.some(pattern => hostname.includes(pattern))
  } catch {
    return true
  }
}

// Request validation schema
const testConnectionSchema = z.object({
  endpointUrl: z.string().min(1, "Endpoint URL is required"),
  timeout: z.number().min(5).max(120).default(30),
  authType: z.enum(['none', 'bearer', 'api-key']).default('none'),
  authHeader: z.string().optional(),
  authToken: z.string().optional(),
  requestFormat: z.enum(['openai', 'custom']).default('openai'),
  customTemplate: z.string().optional(),
  responseJsonPath: z.string().optional(),
})

export type TestConnectionRequest = z.infer<typeof testConnectionSchema>

export interface TestConnectionResponse {
  success: boolean
  latencyMs: number
  statusCode?: number
  message: string
  responsePreview?: string
  troubleshooting?: string[]
}

// Build the request body based on format
function buildRequestBody(config: TestConnectionRequest): string {
  if (config.requestFormat === 'custom' && config.customTemplate) {
    // Replace {{prompt}} placeholder
    return config.customTemplate.replace(/\{\{prompt\}\}/g, SAMPLE_PROMPT)
  }

  // OpenAI compatible format
  return JSON.stringify({
    messages: [
      { role: 'user', content: SAMPLE_PROMPT }
    ],
    max_tokens: 50,
  })
}

// Build headers based on auth config
function buildHeaders(config: TestConnectionRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  if (config.authType === 'bearer' && config.authToken) {
    headers['Authorization'] = `Bearer ${config.authToken}`
  } else if (config.authType === 'api-key' && config.authHeader && config.authToken) {
    // Sanitize header name to prevent header injection
    const safeHeaderName = config.authHeader.replace(/[^a-zA-Z0-9-_]/g, '')
    if (safeHeaderName.length > 0) {
      headers[safeHeaderName] = config.authToken
    }
  }

  return headers
}

// Extract relevant portion from response
function extractResponsePreview(data: unknown, jsonPath?: string): string {
  if (!data) return 'Empty response'

  let result: unknown = data

  // If a JSON path is provided, try to extract
  if (jsonPath) {
    const parts = jsonPath.split('.')
    for (const part of parts) {
      if (result && typeof result === 'object' && result !== null && part in (result as object)) {
        result = (result as Record<string, unknown>)[part]
      } else {
        break
      }
    }
  }

  const preview = typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2)

  // Truncate long responses
  return preview.slice(0, 500) + (preview.length > 500 ? '...' : '')
}

// Generate troubleshooting hints based on error
function getTroubleshootingHints(error: unknown, config: TestConnectionRequest): string[] {
  const hints: string[] = []

  if (error instanceof TypeError && String(error).includes('fetch')) {
    hints.push("Check if the endpoint URL is reachable from the server")
    hints.push("Verify the server allows requests from this origin")
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    if (message.includes('timeout') || message.includes('timed out')) {
      hints.push(`Request timed out after ${config.timeout}s - consider increasing the timeout`)
      hints.push("Check if the endpoint is responding slowly or is overloaded")
    }

    if (message.includes('certificate') || message.includes('ssl') || message.includes('tls')) {
      hints.push("SSL/TLS certificate issue - ensure the endpoint has a valid certificate")
      hints.push("For development endpoints, you may need to use HTTP instead of HTTPS")
    }

    if (message.includes('refused') || message.includes('econnrefused')) {
      hints.push("Connection refused - check if the service is running")
      hints.push("Verify the port number is correct")
    }

    if (message.includes('not found') || message.includes('404')) {
      hints.push("Endpoint not found - verify the URL path is correct")
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      hints.push("Authentication failed - check your token or API key")
      hints.push("Ensure the auth type matches what the endpoint expects")
    }

    if (message.includes('forbidden') || message.includes('403')) {
      hints.push("Access forbidden - check API permissions")
      hints.push("Verify you have access to this endpoint")
    }
  }

  // Add format-specific hints
  if (config.requestFormat === 'openai') {
    hints.push("Ensure the endpoint accepts OpenAI-compatible format")
  } else if (config.requestFormat === 'custom') {
    hints.push("Verify your custom JSON template is correct")
    if (config.responseJsonPath) {
      hints.push(`Check that the response contains data at path: ${config.responseJsonPath}`)
    }
  }

  return hints.length > 0 ? hints : ["Check the endpoint URL and try again"]
}

export async function POST(request: NextRequest): Promise<NextResponse<TestConnectionResponse>> {
  const startTime = performance.now()

  try {
    // Parse and validate request body
    const body = await request.json()
    const parseResult = testConnectionSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json({
        success: false,
        latencyMs: Math.round(performance.now() - startTime),
        message: 'Invalid request parameters',
        troubleshooting: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      }, { status: 400 })
    }

    const config = parseResult.data

    // Validate URL
    if (!isValidUrl(config.endpointUrl)) {
      return NextResponse.json({
        success: false,
        latencyMs: Math.round(performance.now() - startTime),
        message: 'Invalid URL format - must be http:// or https://',
        troubleshooting: ['Ensure the URL starts with http:// or https://'],
      }, { status: 400 })
    }

    // Block dangerous SSRF targets
    if (isBlockedHost(config.endpointUrl)) {
      return NextResponse.json({
        success: false,
        latencyMs: Math.round(performance.now() - startTime),
        message: 'This endpoint is not allowed for security reasons',
        troubleshooting: ['Cloud metadata endpoints are blocked to prevent SSRF attacks'],
      }, { status: 403 })
    }

    // Build request
    const headers = buildHeaders(config)
    const requestBody = buildRequestBody(config)
    const timeoutMs = Math.min(Math.max(config.timeout * 1000, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)

    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(config.endpointUrl, {
        method: 'POST',
        headers,
        body: requestBody,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const latencyMs = Math.round(performance.now() - startTime)

      // Check response size before reading
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        return NextResponse.json({
          success: false,
          latencyMs,
          statusCode: response.status,
          message: 'Response too large',
          troubleshooting: ['The endpoint returned a response larger than 1MB'],
        })
      }

      // Read response - only parse JSON for JSON content types
      let responseData: unknown
      const contentType = response.headers.get('content-type') || ''

      // Strict content-type validation - only parse as JSON if explicitly JSON
      if (contentType.includes('application/json') || contentType.includes('+json')) {
        try {
          responseData = await response.json()
        } catch {
          responseData = '[Invalid JSON in response]'
        }
      } else {
        // For non-JSON content, only show plain text preview (no parsing)
        const text = await response.text()
        responseData = text.slice(0, 500)
      }

      // Determine success based on status code
      const success = response.ok

      return NextResponse.json({
        success,
        latencyMs,
        statusCode: response.status,
        message: success
          ? 'Connection successful'
          : `Request failed with status ${response.status}`,
        responsePreview: extractResponsePreview(responseData, config.responseJsonPath),
        troubleshooting: success ? undefined : getTroubleshootingHints(
          new Error(`HTTP ${response.status}`),
          config
        ),
      })

    } catch (fetchError) {
      clearTimeout(timeoutId)

      const latencyMs = Math.round(performance.now() - startTime)
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError'

      return NextResponse.json({
        success: false,
        latencyMs,
        message: isTimeout
          ? `Request timed out after ${config.timeout} seconds`
          : `Connection failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
        troubleshooting: getTroubleshootingHints(fetchError, config),
      })
    }

  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime)

    return NextResponse.json({
      success: false,
      latencyMs,
      message: 'Failed to process request',
      troubleshooting: ['Check that the request body is valid JSON'],
    }, { status: 400 })
  }
}
