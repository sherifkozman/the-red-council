import { RemoteAgentConfig } from '@/stores/remoteAgent'

export interface ConnectionTestResult {
  success: boolean
  latencyMs: number
  statusCode?: number
  message?: string
  responsePreview?: string
}

export async function testRemoteConnection(config: RemoteAgentConfig): Promise<ConnectionTestResult> {
  // TODO: Replace with actual API call in Story UI-013
  // Simulating network delay
  await new Promise((resolve) => setTimeout(resolve, 1000))

  if (!config.endpointUrl) {
    return {
      success: false,
      latencyMs: 0,
      message: 'Endpoint URL is required',
    }
  }

  try {
    // Basic URL validation
    new URL(config.endpointUrl)
  } catch {
    return {
      success: false,
      latencyMs: 0,
      message: 'Invalid URL format',
    }
  }

  // Mock success for localhost, fail for others to demonstrate error handling
  if (config.endpointUrl.includes('localhost') || config.endpointUrl.includes('127.0.0.1')) {
    return {
      success: true,
      latencyMs: 45,
      statusCode: 200,
      message: 'Connection successful',
      responsePreview: `{
  "status": "ok",
  "agent_version": "1.0.0"
}`,
    }
  }

  // Fallback mock success for demo purposes if not strictly validated yet
  return {
    success: true,
    latencyMs: 120,
    statusCode: 200,
    message: '[MOCK] Simulated connection success. Real network test requires Backend implementation (Story UI-013).',
    responsePreview: `{
  "mock": true,
  "note": "This response was generated locally"
}`,
  }
}