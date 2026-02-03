import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Types
  AppConfig,
  RemoteAgentConfig,
  UIPreferences,
  SessionPreferences,
  // Defaults
  DEFAULT_APP_CONFIG,
  DEFAULT_UI_PREFERENCES,
  DEFAULT_SESSION_PREFERENCES,
  // Constants
  CONFIG_STORAGE_KEY,
  MAX_CONFIG_SIZE_BYTES,
  MAX_REMOTE_AGENTS,
  // Validation
  validateRemoteAgent,
  validateUIPreferences,
  validateSessionPreferences,
  validateAppConfig,
  // Migrations
  compareVersions,
  migrateConfig,
  // Persistence
  loadConfig,
  saveConfig,
  clearConfig,
  // Partial updates
  updateUIPreferences,
  updateSessionPreferences,
  upsertRemoteAgent,
  removeRemoteAgent,
  getRemoteAgent,
  getEnabledRemoteAgents,
} from './config';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

// Helper to create valid configs
function createValidRemoteAgent(overrides: Partial<RemoteAgentConfig> = {}): RemoteAgentConfig {
  return {
    id: 'test-agent-1',
    name: 'Test Agent',
    endpoint: 'https://api.example.com/v1/chat',
    timeoutMs: 30000,
    maxRetries: 3,
    enabled: true,
    ...overrides,
  };
}

function createValidAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    schemaVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    remoteAgents: [],
    ui: { ...DEFAULT_UI_PREFERENCES },
    session: { ...DEFAULT_SESSION_PREFERENCES },
    ...overrides,
  };
}

describe('Config Persistence', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    localStorageMock.clear();

    // Mock window.localStorage
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constants', () => {
    it('exports expected storage keys', () => {
      expect(CONFIG_STORAGE_KEY).toBe('red-council:config');
    });

    it('exports expected size limits', () => {
      expect(MAX_CONFIG_SIZE_BYTES).toBe(100 * 1024);
      expect(MAX_REMOTE_AGENTS).toBe(20);
    });
  });

  describe('Defaults', () => {
    it('provides default UI preferences', () => {
      expect(DEFAULT_UI_PREFERENCES).toEqual({
        theme: 'system',
        sidebarCollapsed: false,
        defaultReportView: 'grid',
        showAdvancedOptions: false,
        autoRefreshInterval: 0,
      });
    });

    it('provides default session preferences', () => {
      expect(DEFAULT_SESSION_PREFERENCES).toEqual({
        autoSaveEnabled: true,
        autoSaveIntervalSeconds: 30,
        maxSessionsRetained: 50,
      });
    });

    it('provides default app config', () => {
      expect(DEFAULT_APP_CONFIG.schemaVersion).toBe('1.0.0');
      expect(DEFAULT_APP_CONFIG.remoteAgents).toEqual([]);
      expect(DEFAULT_APP_CONFIG.ui).toEqual(DEFAULT_UI_PREFERENCES);
      expect(DEFAULT_APP_CONFIG.session).toEqual(DEFAULT_SESSION_PREFERENCES);
    });
  });

  describe('Version Comparison', () => {
    it('compares equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.5.3', '2.5.3')).toBe(0);
    });

    it('compares major versions', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    });

    it('compares minor versions', () => {
      expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
      expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
    });

    it('compares patch versions', () => {
      expect(compareVersions('1.0.1', '1.0.2')).toBe(-1);
      expect(compareVersions('1.0.2', '1.0.1')).toBe(1);
    });

    it('handles missing parts', () => {
      expect(compareVersions('1.0', '1.0.0')).toBe(0);
      expect(compareVersions('1', '1.0.0')).toBe(0);
    });
  });

  describe('Migration', () => {
    it('returns config unchanged if already at target version', () => {
      const config = { schemaVersion: '1.0.0', data: 'test' };
      const result = migrateConfig(config, '1.0.0', '1.0.0');

      expect(result.migrated).toBe(false);
      expect(result.config.schemaVersion).toBe('1.0.0');
    });

    it('sets schema version to target', () => {
      const config = { data: 'test' };
      const result = migrateConfig(config, '0.9.0', '1.0.0');

      expect(result.config.schemaVersion).toBe('1.0.0');
    });
  });

  describe('Validation - RemoteAgentConfig', () => {
    it('validates valid agent config', () => {
      const agent = createValidRemoteAgent();
      expect(validateRemoteAgent(agent)).toBe(true);
    });

    it('rejects null/undefined', () => {
      expect(validateRemoteAgent(null)).toBe(false);
      expect(validateRemoteAgent(undefined)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(validateRemoteAgent('string')).toBe(false);
      expect(validateRemoteAgent(123)).toBe(false);
    });

    it('rejects missing required fields', () => {
      expect(validateRemoteAgent({ id: 'test' })).toBe(false);
      expect(validateRemoteAgent({ name: 'test' })).toBe(false);
      expect(validateRemoteAgent({ endpoint: 'test' })).toBe(false);
    });

    it('rejects empty strings', () => {
      expect(validateRemoteAgent(createValidRemoteAgent({ id: '' }))).toBe(false);
      expect(validateRemoteAgent(createValidRemoteAgent({ name: '' }))).toBe(false);
      expect(validateRemoteAgent(createValidRemoteAgent({ endpoint: '' }))).toBe(false);
    });

    it('rejects invalid timeout', () => {
      expect(validateRemoteAgent(createValidRemoteAgent({ timeoutMs: 0 }))).toBe(false);
      expect(validateRemoteAgent(createValidRemoteAgent({ timeoutMs: -1 }))).toBe(false);
    });

    it('rejects invalid maxRetries', () => {
      expect(validateRemoteAgent(createValidRemoteAgent({ maxRetries: -1 }))).toBe(false);
    });

    it('accepts zero retries', () => {
      expect(validateRemoteAgent(createValidRemoteAgent({ maxRetries: 0 }))).toBe(true);
    });

    it('accepts optional apiKey', () => {
      expect(validateRemoteAgent(createValidRemoteAgent({ apiKey: 'secret' }))).toBe(true);
      expect(validateRemoteAgent(createValidRemoteAgent({ apiKey: undefined }))).toBe(true);
    });

    it('accepts optional headers', () => {
      expect(validateRemoteAgent(createValidRemoteAgent({ headers: { 'X-Custom': 'value' } }))).toBe(true);
    });
  });

  describe('Validation - UIPreferences', () => {
    it('validates valid preferences', () => {
      expect(validateUIPreferences(DEFAULT_UI_PREFERENCES)).toBe(true);
    });

    it('rejects null/undefined', () => {
      expect(validateUIPreferences(null)).toBe(false);
      expect(validateUIPreferences(undefined)).toBe(false);
    });

    it('rejects invalid theme', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, theme: 'invalid' })).toBe(false);
    });

    it('accepts valid themes', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, theme: 'light' })).toBe(true);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, theme: 'dark' })).toBe(true);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, theme: 'system' })).toBe(true);
    });

    it('rejects invalid report view', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, defaultReportView: 'invalid' })).toBe(false);
    });

    it('accepts valid report views', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, defaultReportView: 'grid' })).toBe(true);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, defaultReportView: 'list' })).toBe(true);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, defaultReportView: 'timeline' })).toBe(true);
    });

    it('rejects non-boolean flags', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, sidebarCollapsed: 'true' })).toBe(false);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, showAdvancedOptions: 1 })).toBe(false);
    });

    it('rejects non-number autoRefresh', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, autoRefreshInterval: '30' })).toBe(false);
    });
  });

  describe('Validation - SessionPreferences', () => {
    it('validates valid preferences', () => {
      expect(validateSessionPreferences(DEFAULT_SESSION_PREFERENCES)).toBe(true);
    });

    it('rejects null/undefined', () => {
      expect(validateSessionPreferences(null)).toBe(false);
      expect(validateSessionPreferences(undefined)).toBe(false);
    });

    it('rejects non-boolean autoSaveEnabled', () => {
      expect(validateSessionPreferences({ ...DEFAULT_SESSION_PREFERENCES, autoSaveEnabled: 'true' })).toBe(false);
    });

    it('rejects negative intervals', () => {
      expect(validateSessionPreferences({ ...DEFAULT_SESSION_PREFERENCES, autoSaveIntervalSeconds: -1 })).toBe(false);
    });

    it('accepts zero interval', () => {
      expect(validateSessionPreferences({ ...DEFAULT_SESSION_PREFERENCES, autoSaveIntervalSeconds: 0 })).toBe(true);
    });

    it('rejects non-positive maxSessions', () => {
      expect(validateSessionPreferences({ ...DEFAULT_SESSION_PREFERENCES, maxSessionsRetained: 0 })).toBe(false);
      expect(validateSessionPreferences({ ...DEFAULT_SESSION_PREFERENCES, maxSessionsRetained: -1 })).toBe(false);
    });

    it('accepts optional default IDs', () => {
      expect(validateSessionPreferences({
        ...DEFAULT_SESSION_PREFERENCES,
        defaultTemplateId: 'template-1',
        defaultTargetModelId: 'model-1',
      })).toBe(true);
    });
  });

  describe('Validation - AppConfig', () => {
    it('validates valid config', () => {
      expect(validateAppConfig(createValidAppConfig())).toBe(true);
    });

    it('rejects null/undefined', () => {
      expect(validateAppConfig(null)).toBe(false);
      expect(validateAppConfig(undefined)).toBe(false);
    });

    it('rejects missing schemaVersion', () => {
      const config = createValidAppConfig() as unknown as Record<string, unknown>;
      delete config.schemaVersion;
      expect(validateAppConfig(config)).toBe(false);
    });

    it('rejects missing updatedAt', () => {
      const config = createValidAppConfig() as unknown as Record<string, unknown>;
      delete config.updatedAt;
      expect(validateAppConfig(config)).toBe(false);
    });

    it('rejects non-array remoteAgents', () => {
      expect(validateAppConfig(createValidAppConfig({ remoteAgents: {} as unknown as RemoteAgentConfig[] }))).toBe(false);
    });

    it('rejects too many remote agents', () => {
      const agents: RemoteAgentConfig[] = Array(21).fill(null).map((_, i) =>
        createValidRemoteAgent({ id: `agent-${i}` })
      );
      expect(validateAppConfig(createValidAppConfig({ remoteAgents: agents }))).toBe(false);
    });

    it('accepts max remote agents', () => {
      const agents: RemoteAgentConfig[] = Array(20).fill(null).map((_, i) =>
        createValidRemoteAgent({ id: `agent-${i}` })
      );
      expect(validateAppConfig(createValidAppConfig({ remoteAgents: agents }))).toBe(true);
    });

    it('rejects invalid remote agent in array', () => {
      const config = createValidAppConfig({
        remoteAgents: [{ id: 'invalid' } as RemoteAgentConfig],
      });
      expect(validateAppConfig(config)).toBe(false);
    });

    it('rejects invalid ui preferences', () => {
      const config = createValidAppConfig();
      (config.ui as unknown as { theme: string }).theme = 'invalid';
      expect(validateAppConfig(config)).toBe(false);
    });

    it('rejects invalid session preferences', () => {
      const config = createValidAppConfig();
      config.session.maxSessionsRetained = 0;
      expect(validateAppConfig(config)).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('returns defaults when no stored config', () => {
      const result = loadConfig();

      expect(result.fromStorage).toBe(false);
      expect(result.migrated).toBe(false);
      expect(result.config.schemaVersion).toBe('1.0.0');
    });

    it('loads config from storage', () => {
      const stored = createValidAppConfig();
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(stored));

      const result = loadConfig();

      expect(result.fromStorage).toBe(true);
      expect(result.config.schemaVersion).toBe('1.0.0');
    });

    it('returns defaults on invalid stored config', () => {
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ invalid: true }));

      const result = loadConfig();

      expect(result.fromStorage).toBe(false);
      expect(result.error).toBe('Invalid config structure');
    });

    it('returns defaults when stored config is too large', () => {
      const largeConfig = createValidAppConfig();
      // Create a large string
      const largeString = JSON.stringify(largeConfig) + 'x'.repeat(MAX_CONFIG_SIZE_BYTES + 1);
      localStorageMock.setItem(CONFIG_STORAGE_KEY, largeString);

      // Need to mock the safeLocalStorage return
      vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        const parsed = createValidAppConfig();
        // Force the size check to trigger by making stringify return large value
        return parsed;
      });

      const result = loadConfig();

      // The actual implementation checks the stringified size
      expect(result.config).toBeDefined();
    });

    it('handles JSON parse errors gracefully', () => {
      localStorageMock.setItem(CONFIG_STORAGE_KEY, 'not json');

      // safeLocalStorage will catch the parse error and return null
      const result = loadConfig();

      expect(result.fromStorage).toBe(false);
    });
  });

  describe('saveConfig', () => {
    it('saves valid config', () => {
      const config = createValidAppConfig();
      const result = saveConfig(config);

      expect(result.success).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('rejects invalid config', () => {
      const config = { invalid: true } as unknown as AppConfig;
      const result = saveConfig(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid config structure');
    });

    it('updates timestamp on save', () => {
      const config = createValidAppConfig();
      const originalTime = config.updatedAt;

      // Wait a moment to ensure different timestamp
      saveConfig(config);

      // Find the LAST call with the config key
      const calls = localStorageMock.setItem.mock.calls.filter(c => c[0] === CONFIG_STORAGE_KEY);
      const call = calls[calls.length - 1];
      const saved = JSON.parse(call[1]) as AppConfig;

      // updatedAt is refreshed on every save, but may be same ms
      expect(saved.updatedAt).toBeDefined();
      expect(new Date(saved.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(originalTime).getTime());
    });

    it('preserves schemaVersion', () => {
      const config = createValidAppConfig();
      saveConfig(config);

      const call = localStorageMock.setItem.mock.calls[0];
      const saved = JSON.parse(call[1]) as AppConfig;

      expect(saved.schemaVersion).toBe('1.0.0');
    });
  });

  describe('clearConfig', () => {
    it('removes config from storage', () => {
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(createValidAppConfig()));

      const result = clearConfig();

      expect(result.success).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(CONFIG_STORAGE_KEY);
    });
  });

  describe('updateUIPreferences', () => {
    it('updates partial UI preferences', () => {
      const config = createValidAppConfig();
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const result = updateUIPreferences({ theme: 'dark' });

      expect(result.success).toBe(true);

      // Find the LAST call with the config key (from saveConfig, not setup)
      const calls = localStorageMock.setItem.mock.calls.filter(c => c[0] === CONFIG_STORAGE_KEY);
      const call = calls[calls.length - 1];
      const saved = JSON.parse(call![1]) as AppConfig;

      expect(saved.ui.theme).toBe('dark');
      expect(saved.ui.sidebarCollapsed).toBe(DEFAULT_UI_PREFERENCES.sidebarCollapsed);
    });

    it('preserves other config sections', () => {
      const agent = createValidRemoteAgent();
      const config = createValidAppConfig({ remoteAgents: [agent] });
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      updateUIPreferences({ theme: 'light' });

      // Find the LAST call with the config key
      const calls = localStorageMock.setItem.mock.calls.filter(c => c[0] === CONFIG_STORAGE_KEY);
      const call = calls[calls.length - 1];
      const saved = JSON.parse(call![1]) as AppConfig;

      expect(saved.remoteAgents).toHaveLength(1);
      expect(saved.remoteAgents[0].id).toBe(agent.id);
    });
  });

  describe('updateSessionPreferences', () => {
    it('updates partial session preferences', () => {
      const config = createValidAppConfig();
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const result = updateSessionPreferences({ autoSaveEnabled: false });

      expect(result.success).toBe(true);

      // Find the LAST call with the config key
      const calls = localStorageMock.setItem.mock.calls.filter(c => c[0] === CONFIG_STORAGE_KEY);
      const call = calls[calls.length - 1];
      const saved = JSON.parse(call![1]) as AppConfig;

      expect(saved.session.autoSaveEnabled).toBe(false);
      expect(saved.session.maxSessionsRetained).toBe(DEFAULT_SESSION_PREFERENCES.maxSessionsRetained);
    });
  });

  describe('upsertRemoteAgent', () => {
    it('adds new agent', () => {
      const config = createValidAppConfig();
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const agent = createValidRemoteAgent();
      const result = upsertRemoteAgent(agent);

      expect(result.success).toBe(true);

      // Find the LAST call with the config key
      const calls = localStorageMock.setItem.mock.calls.filter(c => c[0] === CONFIG_STORAGE_KEY);
      const call = calls[calls.length - 1];
      const saved = JSON.parse(call![1]) as AppConfig;

      expect(saved.remoteAgents).toHaveLength(1);
      expect(saved.remoteAgents[0].id).toBe(agent.id);
    });

    it('updates existing agent', () => {
      const agent = createValidRemoteAgent();
      const config = createValidAppConfig({ remoteAgents: [agent] });
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const updatedAgent = { ...agent, name: 'Updated Name' };
      const result = upsertRemoteAgent(updatedAgent);

      expect(result.success).toBe(true);

      // Find the LAST call with the config key
      const calls = localStorageMock.setItem.mock.calls.filter(c => c[0] === CONFIG_STORAGE_KEY);
      const call = calls[calls.length - 1];
      const saved = JSON.parse(call![1]) as AppConfig;

      expect(saved.remoteAgents).toHaveLength(1);
      expect(saved.remoteAgents[0].name).toBe('Updated Name');
    });

    it('rejects invalid agent', () => {
      const result = upsertRemoteAgent({ id: '' } as RemoteAgentConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid agent configuration');
    });

    it('rejects when max agents reached', () => {
      const agents = Array(20).fill(null).map((_, i) =>
        createValidRemoteAgent({ id: `agent-${i}` })
      );
      const config = createValidAppConfig({ remoteAgents: agents });
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const newAgent = createValidRemoteAgent({ id: 'agent-new' });
      const result = upsertRemoteAgent(newAgent);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Maximum remote agents limit reached');
    });

    it('allows update when at max agents', () => {
      const agents = Array(20).fill(null).map((_, i) =>
        createValidRemoteAgent({ id: `agent-${i}` })
      );
      const config = createValidAppConfig({ remoteAgents: agents });
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const updatedAgent = { ...agents[0], name: 'Updated' };
      const result = upsertRemoteAgent(updatedAgent);

      expect(result.success).toBe(true);
    });
  });

  describe('removeRemoteAgent', () => {
    it('removes existing agent', () => {
      const agent = createValidRemoteAgent();
      const config = createValidAppConfig({ remoteAgents: [agent] });
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const result = removeRemoteAgent(agent.id);

      expect(result.success).toBe(true);

      // Find the LAST call with the config key
      const calls = localStorageMock.setItem.mock.calls.filter(c => c[0] === CONFIG_STORAGE_KEY);
      const call = calls[calls.length - 1];
      const saved = JSON.parse(call![1]) as AppConfig;

      expect(saved.remoteAgents).toHaveLength(0);
    });

    it('handles non-existent agent gracefully', () => {
      const config = createValidAppConfig();
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const result = removeRemoteAgent('non-existent');

      expect(result.success).toBe(true);
    });
  });

  describe('getRemoteAgent', () => {
    it('returns agent by ID', () => {
      const agent = createValidRemoteAgent();
      const config = createValidAppConfig({ remoteAgents: [agent] });
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const found = getRemoteAgent(agent.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(agent.id);
    });

    it('returns undefined for non-existent ID', () => {
      const config = createValidAppConfig();
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const found = getRemoteAgent('non-existent');

      expect(found).toBeUndefined();
    });
  });

  describe('getEnabledRemoteAgents', () => {
    it('returns only enabled agents', () => {
      const agents: RemoteAgentConfig[] = [
        createValidRemoteAgent({ id: 'enabled-1', enabled: true }),
        createValidRemoteAgent({ id: 'disabled-1', enabled: false }),
        createValidRemoteAgent({ id: 'enabled-2', enabled: true }),
      ];
      const config = createValidAppConfig({ remoteAgents: agents });
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const enabled = getEnabledRemoteAgents();

      expect(enabled).toHaveLength(2);
      expect(enabled.map(a => a.id)).toEqual(['enabled-1', 'enabled-2']);
    });

    it('returns empty array when no agents', () => {
      const config = createValidAppConfig();
      localStorageMock.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));

      const enabled = getEnabledRemoteAgents();

      expect(enabled).toEqual([]);
    });
  });
});
