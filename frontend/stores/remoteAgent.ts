import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

export const AUTH_TYPES = ['none', 'bearer', 'api-key'] as const
export type AuthType = typeof AUTH_TYPES[number]

export const REQUEST_FORMATS = ['openai', 'custom'] as const
export type RequestFormat = typeof REQUEST_FORMATS[number]

export interface RemoteAgentConfig {
  endpointUrl: string
  timeout: number
  authType: AuthType
  authHeader: string // Key name for api-key auth
  authToken: string // Token value
  requestFormat: RequestFormat
  customTemplate: string
  responseJsonPath: string
}

export type ConnectionStatus = 'untested' | 'connected' | 'failed'

export interface ConnectionStatusInfo {
  status: ConnectionStatus
  lastTestedAt: string | null
  latencyMs: number | null
  statusCode: number | null
  errorMessage: string | null
}

interface RemoteAgentState {
  config: RemoteAgentConfig
  connectionStatus: ConnectionStatusInfo
  setConfig: (config: Partial<RemoteAgentConfig>) => void
  resetConfig: () => void
  setConnectionStatus: (status: ConnectionStatusInfo) => void
  clearConnectionStatus: () => void
}

const DEFAULT_CONFIG: RemoteAgentConfig = {
  endpointUrl: '',
  timeout: 30,
  authType: 'none',
  authHeader: 'X-API-Key',
  authToken: '',
  requestFormat: 'openai',
  customTemplate: `{
  "prompt": "{{prompt}}"
}`,
  responseJsonPath: 'response',
}

const DEFAULT_CONNECTION_STATUS: ConnectionStatusInfo = {
  status: 'untested',
  lastTestedAt: null,
  latencyMs: null,
  statusCode: null,
  errorMessage: null,
}

// Type guard for connection status validation
const isConnectionStatus = (val: unknown): val is ConnectionStatus =>
  val === 'untested' || val === 'connected' || val === 'failed'

// Type guard for validation during hydration
const isAuthType = (val: unknown): val is AuthType => AUTH_TYPES.includes(val as AuthType)
const isRequestFormat = (val: unknown): val is RequestFormat => REQUEST_FORMATS.includes(val as RequestFormat)

export const useRemoteAgentStore = create<RemoteAgentState>()(
  persist(
    immer((set) => ({
      config: DEFAULT_CONFIG,
      connectionStatus: DEFAULT_CONNECTION_STATUS,
      setConfig: (updates) => set((state) => {
        // Deep merge logic if needed, but shallow merge of config properties is usually enough
        state.config = { ...state.config, ...updates }
        // Reset connection status when config changes (endpoint changed = re-test needed)
        if (updates.endpointUrl !== undefined) {
          state.connectionStatus = DEFAULT_CONNECTION_STATUS
        }
      }),
      resetConfig: () => set((state) => {
        state.config = DEFAULT_CONFIG
        state.connectionStatus = DEFAULT_CONNECTION_STATUS
      }),
      setConnectionStatus: (status) => set((state) => {
        state.connectionStatus = status
      }),
      clearConnectionStatus: () => set((state) => {
        state.connectionStatus = DEFAULT_CONNECTION_STATUS
      }),
    })),
    {
      name: 'remote-agent-config',
      version: 2,
      partialize: (state) => ({
        config: {
          ...state.config,
          authToken: '', // Do not persist auth token
        },
        connectionStatus: state.connectionStatus,
      }),
      migrate: (persistedState: unknown, version) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return { config: DEFAULT_CONFIG, connectionStatus: DEFAULT_CONNECTION_STATUS }
        }

        const state = persistedState as Record<string, unknown>

        // Handle version 1 -> 2 migration (no connectionStatus field)
        if (version < 2 || !state.connectionStatus) {
          const config = state.config as Record<string, unknown> | undefined
          if (!config) {
            return { config: DEFAULT_CONFIG, connectionStatus: DEFAULT_CONNECTION_STATUS }
          }

          // Validate enum fields
          const safeConfig = {
            ...DEFAULT_CONFIG,
            ...config,
            authType: isAuthType(config.authType) ? config.authType : DEFAULT_CONFIG.authType,
            requestFormat: isRequestFormat(config.requestFormat) ? config.requestFormat : DEFAULT_CONFIG.requestFormat,
          }

          return { config: safeConfig, connectionStatus: DEFAULT_CONNECTION_STATUS }
        }

        const config = state.config as Record<string, unknown>
        const connStatus = state.connectionStatus as Record<string, unknown>

        // Validate config enum fields
        const safeConfig = {
          ...DEFAULT_CONFIG,
          ...config,
          authType: isAuthType(config?.authType) ? config.authType : DEFAULT_CONFIG.authType,
          requestFormat: isRequestFormat(config?.requestFormat) ? config.requestFormat : DEFAULT_CONFIG.requestFormat,
        }

        // Validate connection status fields
        const safeConnectionStatus: ConnectionStatusInfo = {
          status: isConnectionStatus(connStatus?.status) ? connStatus.status : DEFAULT_CONNECTION_STATUS.status,
          lastTestedAt: typeof connStatus?.lastTestedAt === 'string' ? connStatus.lastTestedAt : null,
          latencyMs: typeof connStatus?.latencyMs === 'number' ? connStatus.latencyMs : null,
          statusCode: typeof connStatus?.statusCode === 'number' ? connStatus.statusCode : null,
          errorMessage: typeof connStatus?.errorMessage === 'string' ? connStatus.errorMessage : null,
        }

        return { config: safeConfig, connectionStatus: safeConnectionStatus }
      },
    }
  )
)