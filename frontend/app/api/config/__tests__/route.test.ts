/**
 * Tests for Config API Route - Validation Logic
 *
 * Note: These tests focus on the validation and request handling logic.
 * The actual file I/O operations are tested via integration tests.
 *
 * For full E2E testing of the API route, use integration tests with
 * a real filesystem or container-based testing.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import {
  validateAppConfig,
  validateUIPreferences,
  validateSessionPreferences,
  validateRemoteAgent,
  DEFAULT_UI_PREFERENCES,
  DEFAULT_SESSION_PREFERENCES,
} from '@/lib/persistence/config';

// Helper to create valid config
function createValidConfig() {
  return {
    schemaVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    remoteAgents: [],
    ui: { ...DEFAULT_UI_PREFERENCES },
    session: { ...DEFAULT_SESSION_PREFERENCES },
  };
}

function createValidRemoteAgent() {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    endpoint: 'https://api.example.com/v1',
    timeoutMs: 30000,
    maxRetries: 3,
    enabled: true,
  };
}

describe('Config API Validation Logic', () => {
  describe('validateAppConfig', () => {
    it('accepts valid config', () => {
      expect(validateAppConfig(createValidConfig())).toBe(true);
    });

    it('rejects null/undefined', () => {
      expect(validateAppConfig(null)).toBe(false);
      expect(validateAppConfig(undefined)).toBe(false);
    });

    it('rejects missing required fields', () => {
      expect(validateAppConfig({})).toBe(false);
      expect(validateAppConfig({ schemaVersion: '1.0.0' })).toBe(false);
    });

    it('accepts config with valid remote agents', () => {
      const config = createValidConfig();
      (config.remoteAgents as ReturnType<typeof createValidRemoteAgent>[]).push(createValidRemoteAgent());
      expect(validateAppConfig(config)).toBe(true);
    });

    it('rejects config with invalid remote agents', () => {
      const config = createValidConfig();
      config.remoteAgents = [{ id: '', name: '' }] as any;
      expect(validateAppConfig(config)).toBe(false);
    });
  });

  describe('validateUIPreferences', () => {
    it('accepts valid preferences', () => {
      expect(validateUIPreferences(DEFAULT_UI_PREFERENCES)).toBe(true);
    });

    it('accepts all valid themes', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, theme: 'light' })).toBe(true);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, theme: 'dark' })).toBe(true);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, theme: 'system' })).toBe(true);
    });

    it('rejects invalid theme', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, theme: 'invalid' })).toBe(false);
    });

    it('accepts all valid report views', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, defaultReportView: 'grid' })).toBe(true);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, defaultReportView: 'list' })).toBe(true);
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, defaultReportView: 'timeline' })).toBe(true);
    });

    it('rejects invalid report view', () => {
      expect(validateUIPreferences({ ...DEFAULT_UI_PREFERENCES, defaultReportView: 'invalid' })).toBe(false);
    });
  });

  describe('validateSessionPreferences', () => {
    it('accepts valid preferences', () => {
      expect(validateSessionPreferences(DEFAULT_SESSION_PREFERENCES)).toBe(true);
    });

    it('rejects negative intervals', () => {
      expect(validateSessionPreferences({ ...DEFAULT_SESSION_PREFERENCES, autoSaveIntervalSeconds: -1 })).toBe(false);
    });

    it('rejects zero or negative maxSessionsRetained', () => {
      expect(validateSessionPreferences({ ...DEFAULT_SESSION_PREFERENCES, maxSessionsRetained: 0 })).toBe(false);
      expect(validateSessionPreferences({ ...DEFAULT_SESSION_PREFERENCES, maxSessionsRetained: -1 })).toBe(false);
    });
  });

  describe('validateRemoteAgent', () => {
    it('accepts valid agent', () => {
      expect(validateRemoteAgent(createValidRemoteAgent())).toBe(true);
    });

    it('rejects empty id', () => {
      const agent = createValidRemoteAgent();
      agent.id = '';
      expect(validateRemoteAgent(agent)).toBe(false);
    });

    it('rejects empty name', () => {
      const agent = createValidRemoteAgent();
      agent.name = '';
      expect(validateRemoteAgent(agent)).toBe(false);
    });

    it('rejects empty endpoint', () => {
      const agent = createValidRemoteAgent();
      agent.endpoint = '';
      expect(validateRemoteAgent(agent)).toBe(false);
    });

    it('rejects zero timeout', () => {
      const agent = createValidRemoteAgent();
      agent.timeoutMs = 0;
      expect(validateRemoteAgent(agent)).toBe(false);
    });

    it('rejects negative retries', () => {
      const agent = createValidRemoteAgent();
      agent.maxRetries = -1;
      expect(validateRemoteAgent(agent)).toBe(false);
    });

    it('accepts zero retries', () => {
      const agent = createValidRemoteAgent();
      agent.maxRetries = 0;
      expect(validateRemoteAgent(agent)).toBe(true);
    });

    it('accepts optional apiKey', () => {
      const agent = createValidRemoteAgent();
      (agent as any).apiKey = 'secret-key';
      expect(validateRemoteAgent(agent)).toBe(true);
    });

    it('accepts optional headers', () => {
      const agent = createValidRemoteAgent();
      (agent as any).headers = { 'X-Custom': 'value' };
      expect(validateRemoteAgent(agent)).toBe(true);
    });
  });

  describe('Request Body Parsing', () => {
    it('NextRequest can parse JSON body', async () => {
      const config = createValidConfig();
      const request = new NextRequest('http://localhost:3000/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const body = await request.json();
      expect(validateAppConfig(body)).toBe(true);
    });

    it('validates partial update structure', () => {
      // Partial updates should pass through if they have valid partial data
      const partialUI = { theme: 'dark' };
      const merged = {
        ...DEFAULT_UI_PREFERENCES,
        ...partialUI,
      };
      expect(validateUIPreferences(merged)).toBe(true);
    });

    it('rejects invalid partial update', () => {
      const partialUI = { theme: 'invalid' };
      const merged = {
        ...DEFAULT_UI_PREFERENCES,
        ...partialUI,
      };
      expect(validateUIPreferences(merged)).toBe(false);
    });
  });
});
