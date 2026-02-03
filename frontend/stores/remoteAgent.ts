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

interface RemoteAgentState {
  config: RemoteAgentConfig
  setConfig: (config: Partial<RemoteAgentConfig>) => void
  resetConfig: () => void
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

// Type guard for validation during hydration
const isAuthType = (val: unknown): val is AuthType => AUTH_TYPES.includes(val as AuthType)
const isRequestFormat = (val: unknown): val is RequestFormat => REQUEST_FORMATS.includes(val as RequestFormat)

export const useRemoteAgentStore = create<RemoteAgentState>()(
  persist(
    immer((set) => ({
      config: DEFAULT_CONFIG,
      setConfig: (updates) => set((state) => {
        // Deep merge logic if needed, but shallow merge of config properties is usually enough
        state.config = { ...state.config, ...updates }
      }),
      resetConfig: () => set((state) => {
        state.config = DEFAULT_CONFIG
      }),
    })),
    {
      name: 'remote-agent-config',
      version: 1,
      partialize: (state) => ({
        config: {
          ...state.config,
          authToken: '', // Do not persist auth token
        }
      }),
      migrate: (persistedState: any, version) => {
        if (!persistedState || typeof persistedState !== 'object' || !persistedState.config) {
          return { config: DEFAULT_CONFIG }
        }
        
        const config = persistedState.config
        
        // Validate enum fields
        const safeConfig = {
          ...DEFAULT_CONFIG,
          ...config,
          authType: isAuthType(config.authType) ? config.authType : DEFAULT_CONFIG.authType,
          requestFormat: isRequestFormat(config.requestFormat) ? config.requestFormat : DEFAULT_CONFIG.requestFormat,
        }

        return { config: safeConfig }
      },
    }
  )
)