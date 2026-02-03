import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRemoteAgentStore, RemoteAgentConfig } from './remoteAgent'

describe('useRemoteAgentStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useRemoteAgentStore.getState().resetConfig()
    // Clear persist storage
    useRemoteAgentStore.persist.clearStorage()
  })

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
    // Since our setConfig uses { ...state.config, ...updates }, it's a shallow merge of the config object properties
    useRemoteAgentStore.getState().setConfig({ 
      authHeader: 'X-Custom'
    })
    
    const { config } = useRemoteAgentStore.getState()
    expect(config.authHeader).toBe('X-Custom')
    expect(config.timeout).toBe(30) // Preserved
  })
})
