/**
 * Configuration persistence layer for the Red Council Unified Interface.
 * Provides typed, versioned config storage with migration support.
 *
 * Features:
 * - Schema versioning for forward/backward compatibility
 * - Automatic migrations when schema version changes
 * - Graceful error handling with fallback to defaults
 * - SSR-safe (no window access during SSR)
 * - DoS protection via size limits
 */

import { CONFIG_SCHEMA_VERSION } from '../security/constants';
import { safeLocalStorage } from './safeLocalStorage';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Base configuration with schema version for migrations.
 */
export interface VersionedConfig {
  /** Schema version for migration support */
  schemaVersion: string;
  /** Last updated timestamp (ISO 8601) */
  updatedAt: string;
}

/**
 * Remote agent configuration for connecting to external LLM endpoints.
 */
export interface RemoteAgentConfig {
  /** Unique identifier for the agent */
  id: string;
  /** Display name */
  name: string;
  /** API endpoint URL */
  endpoint: string;
  /** API key (stored encrypted in production) */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Maximum retries on failure */
  maxRetries: number;
  /** Whether this agent is enabled */
  enabled: boolean;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * UI preferences and display settings.
 */
export interface UIPreferences {
  /** Theme preference */
  theme: 'light' | 'dark' | 'system';
  /** Sidebar collapsed state */
  sidebarCollapsed: boolean;
  /** Default view mode for reports */
  defaultReportView: 'grid' | 'list' | 'timeline';
  /** Show advanced options */
  showAdvancedOptions: boolean;
  /** Auto-refresh interval in seconds (0 = disabled) */
  autoRefreshInterval: number;
}

/**
 * Session preferences for attack campaigns.
 */
export interface SessionPreferences {
  /** Default attack template ID */
  defaultTemplateId?: string;
  /** Default target model ID */
  defaultTargetModelId?: string;
  /** Auto-save session state */
  autoSaveEnabled: boolean;
  /** Auto-save interval in seconds */
  autoSaveIntervalSeconds: number;
  /** Maximum sessions to retain */
  maxSessionsRetained: number;
}

/**
 * Complete application configuration.
 */
export interface AppConfig extends VersionedConfig {
  /** Remote agent configurations */
  remoteAgents: RemoteAgentConfig[];
  /** UI display preferences */
  ui: UIPreferences;
  /** Session management preferences */
  session: SessionPreferences;
}

/**
 * Configuration load result with status.
 */
export interface ConfigLoadResult<T> {
  /** The loaded configuration (or defaults if load failed) */
  config: T;
  /** Whether config was loaded from storage */
  fromStorage: boolean;
  /** Whether migration was performed */
  migrated: boolean;
  /** Error message if load failed */
  error?: string;
}

/**
 * Configuration save result with status.
 */
export interface ConfigSaveResult {
  /** Whether save succeeded */
  success: boolean;
  /** Error message if save failed */
  error?: string;
}

// ============================================================================
// DEFAULTS
// ============================================================================

/**
 * Default UI preferences.
 */
export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  theme: 'system',
  sidebarCollapsed: false,
  defaultReportView: 'grid',
  showAdvancedOptions: false,
  autoRefreshInterval: 0,
};

/**
 * Default session preferences.
 */
export const DEFAULT_SESSION_PREFERENCES: SessionPreferences = {
  autoSaveEnabled: true,
  autoSaveIntervalSeconds: 30,
  maxSessionsRetained: 50,
};

/**
 * Default complete configuration.
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  updatedAt: new Date().toISOString(),
  remoteAgents: [],
  ui: DEFAULT_UI_PREFERENCES,
  session: DEFAULT_SESSION_PREFERENCES,
};

// ============================================================================
// STORAGE KEYS
// ============================================================================

/** LocalStorage key for app configuration */
export const CONFIG_STORAGE_KEY = 'red-council:config';

/** LocalStorage key for UI preferences only */
export const UI_PREFS_STORAGE_KEY = 'red-council:ui-prefs';

/** LocalStorage key for session preferences only */
export const SESSION_PREFS_STORAGE_KEY = 'red-council:session-prefs';

// ============================================================================
// SIZE LIMITS
// ============================================================================

/** Maximum config size in bytes (100KB) */
export const MAX_CONFIG_SIZE_BYTES = 100 * 1024;

/** Maximum number of remote agents */
export const MAX_REMOTE_AGENTS = 20;

// ============================================================================
// MIGRATIONS
// ============================================================================

/**
 * Migration function type.
 */
type MigrationFn = (config: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration registry keyed by target version.
 * Migrations are applied in order from current version to target version.
 */
const MIGRATIONS: Record<string, MigrationFn> = {
  // Example migration for future version:
  // '1.1.0': (config) => {
  //   return {
  //     ...config,
  //     newField: 'default',
  //     schemaVersion: '1.1.0',
  //   };
  // },
};

/**
 * Compare semver versions.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA < partB) return -1;
    if (partA > partB) return 1;
  }

  return 0;
}

/**
 * Apply migrations to bring config to current schema version.
 */
export function migrateConfig(
  config: Record<string, unknown>,
  fromVersion: string,
  toVersion: string = CONFIG_SCHEMA_VERSION
): { config: Record<string, unknown>; migrated: boolean } {
  let current = { ...config };
  let migrated = false;

  // Get migration versions in order
  const migrationVersions = Object.keys(MIGRATIONS).sort(compareVersions);

  for (const version of migrationVersions) {
    // Skip if version is <= fromVersion or > toVersion
    if (
      compareVersions(version, fromVersion) <= 0 ||
      compareVersions(version, toVersion) > 0
    ) {
      continue;
    }

    // Apply migration
    const migrationFn = MIGRATIONS[version];
    if (migrationFn) {
      current = migrationFn(current);
      migrated = true;
    }
  }

  // Ensure schema version is set
  current.schemaVersion = toVersion;

  return { config: current, migrated };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate remote agent configuration.
 */
export function validateRemoteAgent(agent: unknown): agent is RemoteAgentConfig {
  if (!agent || typeof agent !== 'object') return false;

  const a = agent as Record<string, unknown>;

  return (
    typeof a.id === 'string' &&
    a.id.length > 0 &&
    typeof a.name === 'string' &&
    a.name.length > 0 &&
    typeof a.endpoint === 'string' &&
    a.endpoint.length > 0 &&
    typeof a.timeoutMs === 'number' &&
    a.timeoutMs > 0 &&
    typeof a.maxRetries === 'number' &&
    a.maxRetries >= 0 &&
    typeof a.enabled === 'boolean'
  );
}

/**
 * Validate UI preferences.
 */
export function validateUIPreferences(prefs: unknown): prefs is UIPreferences {
  if (!prefs || typeof prefs !== 'object') return false;

  const p = prefs as Record<string, unknown>;

  return (
    ['light', 'dark', 'system'].includes(p.theme as string) &&
    typeof p.sidebarCollapsed === 'boolean' &&
    ['grid', 'list', 'timeline'].includes(p.defaultReportView as string) &&
    typeof p.showAdvancedOptions === 'boolean' &&
    typeof p.autoRefreshInterval === 'number'
  );
}

/**
 * Validate session preferences.
 */
export function validateSessionPreferences(
  prefs: unknown
): prefs is SessionPreferences {
  if (!prefs || typeof prefs !== 'object') return false;

  const p = prefs as Record<string, unknown>;

  return (
    typeof p.autoSaveEnabled === 'boolean' &&
    typeof p.autoSaveIntervalSeconds === 'number' &&
    p.autoSaveIntervalSeconds >= 0 &&
    typeof p.maxSessionsRetained === 'number' &&
    p.maxSessionsRetained > 0
  );
}

/**
 * Validate complete app configuration.
 */
export function validateAppConfig(config: unknown): config is AppConfig {
  if (!config || typeof config !== 'object') return false;

  const c = config as Record<string, unknown>;

  // Check versioned fields
  if (typeof c.schemaVersion !== 'string') return false;
  if (typeof c.updatedAt !== 'string') return false;

  // Check remote agents array
  if (!Array.isArray(c.remoteAgents)) return false;
  if (c.remoteAgents.length > MAX_REMOTE_AGENTS) return false;
  if (!c.remoteAgents.every(validateRemoteAgent)) return false;

  // Check preferences
  if (!validateUIPreferences(c.ui)) return false;
  if (!validateSessionPreferences(c.session)) return false;

  return true;
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Load configuration from localStorage with migration support.
 */
export function loadConfig(): ConfigLoadResult<AppConfig> {
  try {
    // SSR guard
    if (typeof window === 'undefined') {
      return {
        config: { ...DEFAULT_APP_CONFIG, updatedAt: new Date().toISOString() },
        fromStorage: false,
        migrated: false,
      };
    }

    // Load from storage
    const stored = safeLocalStorage.getItem<Record<string, unknown>>(CONFIG_STORAGE_KEY);

    if (!stored) {
      return {
        config: { ...DEFAULT_APP_CONFIG, updatedAt: new Date().toISOString() },
        fromStorage: false,
        migrated: false,
      };
    }

    // Check size
    const storedSize = JSON.stringify(stored).length;
    if (storedSize > MAX_CONFIG_SIZE_BYTES) {
      console.warn(`Config size ${storedSize} exceeds limit ${MAX_CONFIG_SIZE_BYTES}`);
      return {
        config: { ...DEFAULT_APP_CONFIG, updatedAt: new Date().toISOString() },
        fromStorage: false,
        migrated: false,
        error: 'Config size exceeds limit',
      };
    }

    // Check if migration needed
    const storedVersion = (stored.schemaVersion as string) || '0.0.0';
    let config = stored;
    let migrated = false;

    if (compareVersions(storedVersion, CONFIG_SCHEMA_VERSION) < 0) {
      const result = migrateConfig(stored, storedVersion);
      config = result.config;
      migrated = result.migrated;
    }

    // Validate
    if (!validateAppConfig(config)) {
      console.warn('Invalid config structure, using defaults');
      return {
        config: { ...DEFAULT_APP_CONFIG, updatedAt: new Date().toISOString() },
        fromStorage: false,
        migrated: false,
        error: 'Invalid config structure',
      };
    }

    // Save migrated config back to storage
    if (migrated) {
      safeLocalStorage.setItem(CONFIG_STORAGE_KEY, config);
    }

    return {
      config: config as AppConfig,
      fromStorage: true,
      migrated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to load config:', message);
    return {
      config: { ...DEFAULT_APP_CONFIG, updatedAt: new Date().toISOString() },
      fromStorage: false,
      migrated: false,
      error: message,
    };
  }
}

/**
 * Save configuration to localStorage.
 */
export function saveConfig(config: AppConfig): ConfigSaveResult {
  try {
    // SSR guard
    if (typeof window === 'undefined') {
      return { success: false, error: 'Cannot save in SSR context' };
    }

    // Validate before saving
    if (!validateAppConfig(config)) {
      return { success: false, error: 'Invalid config structure' };
    }

    // Check size
    const serialized = JSON.stringify(config);
    if (serialized.length > MAX_CONFIG_SIZE_BYTES) {
      return { success: false, error: 'Config size exceeds limit' };
    }

    // Update timestamp
    const configToSave: AppConfig = {
      ...config,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };

    safeLocalStorage.setItem(CONFIG_STORAGE_KEY, configToSave);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to save config:', message);
    return { success: false, error: message };
  }
}

/**
 * Clear configuration from localStorage.
 */
export function clearConfig(): ConfigSaveResult {
  try {
    if (typeof window === 'undefined') {
      return { success: false, error: 'Cannot clear in SSR context' };
    }

    safeLocalStorage.removeItem(CONFIG_STORAGE_KEY);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ============================================================================
// PARTIAL UPDATE HELPERS
// ============================================================================

/**
 * Update UI preferences only.
 */
export function updateUIPreferences(
  prefs: Partial<UIPreferences>
): ConfigSaveResult {
  const { config } = loadConfig();
  return saveConfig({
    ...config,
    ui: { ...config.ui, ...prefs },
  });
}

/**
 * Update session preferences only.
 */
export function updateSessionPreferences(
  prefs: Partial<SessionPreferences>
): ConfigSaveResult {
  const { config } = loadConfig();
  return saveConfig({
    ...config,
    session: { ...config.session, ...prefs },
  });
}

/**
 * Add or update a remote agent.
 */
export function upsertRemoteAgent(agent: RemoteAgentConfig): ConfigSaveResult {
  if (!validateRemoteAgent(agent)) {
    return { success: false, error: 'Invalid agent configuration' };
  }

  const { config } = loadConfig();
  const existingIndex = config.remoteAgents.findIndex((a) => a.id === agent.id);

  let remoteAgents: RemoteAgentConfig[];
  if (existingIndex >= 0) {
    // Update existing
    remoteAgents = [...config.remoteAgents];
    remoteAgents[existingIndex] = agent;
  } else {
    // Add new
    if (config.remoteAgents.length >= MAX_REMOTE_AGENTS) {
      return { success: false, error: 'Maximum remote agents limit reached' };
    }
    remoteAgents = [...config.remoteAgents, agent];
  }

  return saveConfig({ ...config, remoteAgents });
}

/**
 * Remove a remote agent by ID.
 */
export function removeRemoteAgent(agentId: string): ConfigSaveResult {
  const { config } = loadConfig();
  const remoteAgents = config.remoteAgents.filter((a) => a.id !== agentId);
  return saveConfig({ ...config, remoteAgents });
}

/**
 * Get a specific remote agent by ID.
 */
export function getRemoteAgent(agentId: string): RemoteAgentConfig | undefined {
  const { config } = loadConfig();
  return config.remoteAgents.find((a) => a.id === agentId);
}

/**
 * Get all enabled remote agents.
 */
export function getEnabledRemoteAgents(): RemoteAgentConfig[] {
  const { config } = loadConfig();
  return config.remoteAgents.filter((a) => a.enabled);
}
