import { RemoteAgentConfig } from '@/stores/remoteAgent'

export interface ConnectionTestResult {
  success: boolean
  latencyMs: number
  statusCode?: number
  message?: string
  responsePreview?: string
  troubleshooting?: string[]
}

/**
 * Tests the connection to a remote agent endpoint.
 * The request is proxied through our API route to avoid CORS issues.
 *
 * @param config - The remote agent configuration
 * @param signal - Optional AbortSignal for cancellation
 * @returns Connection test result with status, latency, and troubleshooting hints
 */
export async function testRemoteConnection(
  config: RemoteAgentConfig,
  signal?: AbortSignal
): Promise<ConnectionTestResult> {
  // Basic client-side validation before calling API
  if (!config.endpointUrl) {
    return {
      success: false,
      latencyMs: 0,
      message: 'Endpoint URL is required',
      troubleshooting: ['Enter a valid endpoint URL'],
    }
  }

  try {
    // Validate URL format client-side
    new URL(config.endpointUrl)
  } catch {
    return {
      success: false,
      latencyMs: 0,
      message: 'Invalid URL format',
      troubleshooting: ['Enter a valid URL starting with http:// or https://'],
    }
  }

  try {
    const response = await fetch('/api/test-connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpointUrl: config.endpointUrl,
        timeout: config.timeout,
        authType: config.authType,
        authHeader: config.authHeader,
        authToken: config.authToken,
        requestFormat: config.requestFormat,
        customTemplate: config.customTemplate,
        responseJsonPath: config.responseJsonPath,
      }),
      signal,
    })

    const result: ConnectionTestResult = await response.json()
    return result
  } catch (error) {
    // Handle fetch errors (network issues, abort, etc.)
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        latencyMs: 0,
        message: 'Connection test was cancelled',
      }
    }

    return {
      success: false,
      latencyMs: 0,
      message: error instanceof Error ? error.message : 'Failed to test connection',
      troubleshooting: [
        'Check your network connection',
        'The API server may be unavailable',
      ],
    }
  }
}
