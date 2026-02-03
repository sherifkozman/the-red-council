/**
 * API client for the Vulnerable Test Agent HTTP server.
 *
 * This client provides methods to interact with the containerized
 * VulnerableTestAgent for security testing purposes.
 */

export interface VulnerableAgentConfig {
  baseUrl: string
  timeout?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AgentEvent {
  event_type: string
  session_id: string
  timestamp: string
  [key: string]: unknown
}

export interface ChatChoice {
  index: number
  message: ChatMessage
  finish_reason: string
}

export interface ChatResponse {
  id: string
  object: string
  model: string
  choices: ChatChoice[]
  session_id: string
  events: AgentEvent[]
}

export interface SessionInfo {
  session_id: string
  event_count: number
  tool_call_count: number
  emails_sent: number
  commands_executed: number
}

export interface HealthResponse {
  status: string
  agent_type: string
  owasp_categories: string[]
  description: string
}

const DEFAULT_CONFIG: VulnerableAgentConfig = {
  baseUrl: process.env.NEXT_PUBLIC_VULNERABLE_AGENT_URL || 'http://localhost:8080',
  timeout: 30000,
}

/**
 * Send a chat message to the vulnerable agent.
 */
export async function chatWithAgent(
  messages: ChatMessage[],
  sessionId?: string,
  config: Partial<VulnerableAgentConfig> = {}
): Promise<ChatResponse> {
  const { baseUrl, timeout } = { ...DEFAULT_CONFIG, ...config }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        session_id: sessionId,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Get all events for a session.
 */
export async function getSessionEvents(
  sessionId: string,
  options: { limit?: number; offset?: number } = {},
  config: Partial<VulnerableAgentConfig> = {}
): Promise<{ events: AgentEvent[]; total_count: number }> {
  const { baseUrl, timeout } = { ...DEFAULT_CONFIG, ...config }
  const { limit = 100, offset = 0 } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })

    const response = await fetch(
      `${baseUrl}/v1/sessions/${sessionId}/events?${params}`,
      { signal: controller.signal }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Subscribe to real-time events via Server-Sent Events.
 * Returns a cleanup function to close the connection.
 */
export function subscribeToEvents(
  sessionId: string,
  onEvent: (event: AgentEvent) => void,
  onError?: (error: Error) => void,
  onClose?: () => void,
  config: Partial<VulnerableAgentConfig> = {}
): () => void {
  const { baseUrl } = { ...DEFAULT_CONFIG, ...config }

  const eventSource = new EventSource(
    `${baseUrl}/v1/sessions/${sessionId}/events/stream`
  )

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as AgentEvent
      onEvent(event)
    } catch (err) {
      console.error('Failed to parse event:', err)
    }
  }

  eventSource.onerror = () => {
    onError?.(new Error('EventSource connection failed'))
    eventSource.close()
  }

  eventSource.addEventListener('close', () => {
    onClose?.()
    eventSource.close()
  })

  // Return cleanup function
  return () => {
    eventSource.close()
    onClose?.()
  }
}

/**
 * List all active sessions.
 */
export async function listSessions(
  config: Partial<VulnerableAgentConfig> = {}
): Promise<SessionInfo[]> {
  const { baseUrl, timeout } = { ...DEFAULT_CONFIG, ...config }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${baseUrl}/v1/sessions`, {
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    return data.sessions
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Delete a session.
 */
export async function deleteSession(
  sessionId: string,
  config: Partial<VulnerableAgentConfig> = {}
): Promise<void> {
  const { baseUrl, timeout } = { ...DEFAULT_CONFIG, ...config }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Reset a session (clear events and memory).
 */
export async function resetSession(
  sessionId: string,
  config: Partial<VulnerableAgentConfig> = {}
): Promise<void> {
  const { baseUrl, timeout } = { ...DEFAULT_CONFIG, ...config }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${baseUrl}/v1/sessions/${sessionId}/reset`, {
      method: 'POST',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Check if the vulnerable agent server is healthy.
 */
export async function checkHealth(
  config: Partial<VulnerableAgentConfig> = {}
): Promise<HealthResponse | null> {
  const { baseUrl, timeout } = { ...DEFAULT_CONFIG, ...config }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout ?? 5000)

  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Test connection to the vulnerable agent server.
 * Returns detailed connection status.
 */
export async function testConnection(
  config: Partial<VulnerableAgentConfig> = {}
): Promise<{
  success: boolean
  latencyMs: number
  message: string
  health?: HealthResponse
}> {
  const start = performance.now()

  try {
    const health = await checkHealth(config)
    const latencyMs = Math.round(performance.now() - start)

    if (health) {
      return {
        success: true,
        latencyMs,
        message: `Connected to ${health.agent_type}`,
        health,
      }
    }

    return {
      success: false,
      latencyMs,
      message: 'Health check failed - server may be down',
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start)
    return {
      success: false,
      latencyMs,
      message: error instanceof Error ? error.message : 'Connection failed',
    }
  }
}
