import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Constants
  SESSION_STORAGE_PREFIX,
  SESSION_INDEX_KEY,
  ACTIVE_SESSION_KEY,
  SESSION_EXPIRY_MS,
  MAX_SESSIONS,
  MAX_SESSION_NAME_LENGTH,
  MAX_SESSION_SIZE_BYTES,
  // Types
  type SessionMetadata,
  type SessionData,
  type SessionIndex,
  // Validation
  isValidSessionId,
  isValidSessionName,
  isValidISODate,
  isSessionMetadata,
  isSessionIndex,
  // Helpers
  generateSessionId,
  getSessionStorageKey,
  calculateExpiryDate,
  isSessionExpired,
  sanitizeSessionName,
  // Index operations
  loadSessionIndex,
  saveSessionIndex,
  getActiveSessionId,
  setActiveSessionId,
  // CRUD
  createSession,
  loadSession,
  updateSession,
  deleteSession,
  listSessions,
  clearAllSessions,
  // Recovery
  getRecoverableSession,
  dismissSessionRecovery,
} from './persistence';

// Mock localStorage
const mockStorage: Record<string, string> = {};

beforeEach(() => {
  // Clear mock storage
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

  // Mock localStorage
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => mockStorage[key] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
    mockStorage[key] = value;
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
    delete mockStorage[key];
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// CONSTANTS
// ============================================================================
describe('constants', () => {
  it('has correct storage prefix', () => {
    expect(SESSION_STORAGE_PREFIX).toBe('red-council:session:');
  });

  it('has correct index key', () => {
    expect(SESSION_INDEX_KEY).toBe('red-council:sessions');
  });

  it('has correct active session key', () => {
    expect(ACTIVE_SESSION_KEY).toBe('red-council:active-session');
  });

  it('has 24 hour expiry by default', () => {
    expect(SESSION_EXPIRY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('has max 50 sessions', () => {
    expect(MAX_SESSIONS).toBe(50);
  });

  it('has max 100 character session name', () => {
    expect(MAX_SESSION_NAME_LENGTH).toBe(100);
  });

  it('has 10KB max session size (matches safeLocalStorage DoS limit)', () => {
    expect(MAX_SESSION_SIZE_BYTES).toBe(10000);
  });
});

// ============================================================================
// VALIDATION
// ============================================================================
describe('isValidSessionId', () => {
  it('accepts valid session IDs', () => {
    expect(isValidSessionId('session-abc123')).toBe(true);
    expect(isValidSessionId('test-session')).toBe(true);
    expect(isValidSessionId('abc')).toBe(true);
    expect(isValidSessionId('ABC123')).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isValidSessionId(123)).toBe(false);
    expect(isValidSessionId(null)).toBe(false);
    expect(isValidSessionId(undefined)).toBe(false);
    expect(isValidSessionId({})).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isValidSessionId('')).toBe(false);
  });

  it('rejects strings with invalid characters', () => {
    expect(isValidSessionId('session with spaces')).toBe(false);
    expect(isValidSessionId('session_underscore')).toBe(false);
    expect(isValidSessionId('session.dot')).toBe(false);
    expect(isValidSessionId('session/slash')).toBe(false);
  });

  it('rejects strings over 100 characters', () => {
    expect(isValidSessionId('a'.repeat(101))).toBe(false);
  });
});

describe('isValidSessionName', () => {
  it('accepts valid session names', () => {
    expect(isValidSessionName('My Session')).toBe(true);
    expect(isValidSessionName('Test')).toBe(true);
    expect(isValidSessionName('Session with special chars!@#')).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isValidSessionName(123)).toBe(false);
    expect(isValidSessionName(null)).toBe(false);
    expect(isValidSessionName(undefined)).toBe(false);
  });

  it('rejects empty or whitespace-only strings', () => {
    expect(isValidSessionName('')).toBe(false);
    expect(isValidSessionName('   ')).toBe(false);
  });

  it('rejects strings over MAX_SESSION_NAME_LENGTH', () => {
    expect(isValidSessionName('a'.repeat(MAX_SESSION_NAME_LENGTH + 1))).toBe(false);
  });
});

describe('isValidISODate', () => {
  it('accepts valid ISO dates', () => {
    expect(isValidISODate('2024-01-15T10:30:00.000Z')).toBe(true);
    expect(isValidISODate('2024-01-15')).toBe(true);
    expect(isValidISODate(new Date().toISOString())).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(isValidISODate(123)).toBe(false);
    expect(isValidISODate(null)).toBe(false);
    expect(isValidISODate(new Date())).toBe(false);
  });

  it('rejects invalid date strings', () => {
    expect(isValidISODate('not-a-date')).toBe(false);
    expect(isValidISODate('invalid')).toBe(false);
  });
});

describe('isSessionMetadata', () => {
  const validMetadata: SessionMetadata = {
    id: 'session-123',
    name: 'Test Session',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
    hasUnsavedChanges: false,
    eventCount: 0,
  };

  it('accepts valid metadata', () => {
    expect(isSessionMetadata(validMetadata)).toBe(true);
  });

  it('accepts metadata with optional mode', () => {
    expect(isSessionMetadata({ ...validMetadata, mode: 'demo-mode' })).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isSessionMetadata(null)).toBe(false);
    expect(isSessionMetadata('string')).toBe(false);
    expect(isSessionMetadata(123)).toBe(false);
  });

  it('rejects missing required fields', () => {
    const { id, ...withoutId } = validMetadata;
    expect(isSessionMetadata(withoutId)).toBe(false);

    const { name, ...withoutName } = validMetadata;
    expect(isSessionMetadata(withoutName)).toBe(false);
  });

  it('rejects invalid field types', () => {
    expect(isSessionMetadata({ ...validMetadata, eventCount: 'not-a-number' })).toBe(false);
    expect(isSessionMetadata({ ...validMetadata, hasUnsavedChanges: 'true' })).toBe(false);
    expect(isSessionMetadata({ ...validMetadata, eventCount: -1 })).toBe(false);
  });
});

describe('isSessionIndex', () => {
  const validMetadata: SessionMetadata = {
    id: 'session-123',
    name: 'Test Session',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
    hasUnsavedChanges: false,
    eventCount: 0,
  };

  it('accepts valid index', () => {
    const index: SessionIndex = {
      sessions: [validMetadata],
      version: '1.0.0',
    };
    expect(isSessionIndex(index)).toBe(true);
  });

  it('accepts empty sessions array', () => {
    expect(isSessionIndex({ sessions: [], version: '1.0.0' })).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isSessionIndex(null)).toBe(false);
    expect(isSessionIndex('string')).toBe(false);
  });

  it('rejects missing sessions array', () => {
    expect(isSessionIndex({ version: '1.0.0' })).toBe(false);
  });

  it('rejects missing version', () => {
    expect(isSessionIndex({ sessions: [] })).toBe(false);
  });

  it('rejects invalid sessions', () => {
    expect(isSessionIndex({ sessions: [{ invalid: true }], version: '1.0.0' })).toBe(false);
  });
});

// ============================================================================
// HELPERS
// ============================================================================
describe('generateSessionId', () => {
  it('generates unique IDs', () => {
    const id1 = generateSessionId();
    const id2 = generateSessionId();
    expect(id1).not.toBe(id2);
  });

  it('generates valid session IDs', () => {
    const id = generateSessionId();
    expect(isValidSessionId(id)).toBe(true);
  });

  it('starts with "session-"', () => {
    const id = generateSessionId();
    expect(id.startsWith('session-')).toBe(true);
  });
});

describe('getSessionStorageKey', () => {
  it('prepends storage prefix', () => {
    expect(getSessionStorageKey('my-session')).toBe('red-council:session:my-session');
  });
});

describe('calculateExpiryDate', () => {
  it('returns ISO date string', () => {
    const expiry = calculateExpiryDate();
    expect(isValidISODate(expiry)).toBe(true);
  });

  it('is in the future', () => {
    const expiry = calculateExpiryDate();
    const expiryTime = new Date(expiry).getTime();
    expect(expiryTime).toBeGreaterThan(Date.now());
  });

  it('respects custom expiry time', () => {
    const oneHour = 60 * 60 * 1000;
    const expiry = calculateExpiryDate(oneHour);
    const expiryTime = new Date(expiry).getTime();
    expect(expiryTime).toBeLessThan(Date.now() + oneHour + 1000);
    expect(expiryTime).toBeGreaterThan(Date.now() + oneHour - 1000);
  });
});

describe('isSessionExpired', () => {
  it('returns false for non-expired session', () => {
    const metadata: SessionMetadata = {
      id: 'session-123',
      name: 'Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
      hasUnsavedChanges: false,
      eventCount: 0,
    };
    expect(isSessionExpired(metadata)).toBe(false);
  });

  it('returns true for expired session', () => {
    const metadata: SessionMetadata = {
      id: 'session-123',
      name: 'Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      hasUnsavedChanges: false,
      eventCount: 0,
    };
    expect(isSessionExpired(metadata)).toBe(true);
  });
});

describe('sanitizeSessionName', () => {
  it('trims whitespace', () => {
    expect(sanitizeSessionName('  Test Session  ')).toBe('Test Session');
  });

  it('truncates long names', () => {
    const longName = 'a'.repeat(150);
    expect(sanitizeSessionName(longName).length).toBe(MAX_SESSION_NAME_LENGTH);
  });

  it('returns default for empty name', () => {
    expect(sanitizeSessionName('')).toBe('Untitled Session');
    expect(sanitizeSessionName('   ')).toBe('Untitled Session');
  });
});

// ============================================================================
// INDEX OPERATIONS
// ============================================================================
describe('loadSessionIndex', () => {
  it('returns empty index if none exists', () => {
    const index = loadSessionIndex();
    expect(index.sessions).toEqual([]);
    expect(index.version).toBe('1.0.0');
  });

  it('loads existing index', () => {
    const existingIndex: SessionIndex = {
      sessions: [],
      version: '1.0.0',
    };
    mockStorage[SESSION_INDEX_KEY] = JSON.stringify(existingIndex);
    const index = loadSessionIndex();
    expect(index).toEqual(existingIndex);
  });

  it('returns default for invalid data', () => {
    mockStorage[SESSION_INDEX_KEY] = 'invalid json';
    const index = loadSessionIndex();
    expect(index.sessions).toEqual([]);
  });
});

describe('saveSessionIndex', () => {
  it('saves index to storage', () => {
    const index: SessionIndex = {
      sessions: [],
      version: '1.0.0',
    };
    const result = saveSessionIndex(index);
    expect(result.success).toBe(true);
    expect(mockStorage[SESSION_INDEX_KEY]).toBeDefined();
  });
});

describe('getActiveSessionId', () => {
  it('returns null if no active session', () => {
    expect(getActiveSessionId()).toBe(null);
  });

  it('returns active session ID', () => {
    mockStorage[ACTIVE_SESSION_KEY] = JSON.stringify('session-123');
    expect(getActiveSessionId()).toBe('session-123');
  });

  it('returns null for invalid ID', () => {
    mockStorage[ACTIVE_SESSION_KEY] = JSON.stringify('invalid id with spaces');
    expect(getActiveSessionId()).toBe(null);
  });
});

describe('setActiveSessionId', () => {
  it('sets active session ID', () => {
    const result = setActiveSessionId('session-123');
    expect(result.success).toBe(true);
    expect(mockStorage[ACTIVE_SESSION_KEY]).toBeDefined();
  });

  it('clears active session when null', () => {
    mockStorage[ACTIVE_SESSION_KEY] = JSON.stringify('session-123');
    const result = setActiveSessionId(null);
    expect(result.success).toBe(true);
    expect(mockStorage[ACTIVE_SESSION_KEY]).toBeUndefined();
  });

  it('fails for invalid ID', () => {
    const result = setActiveSessionId('invalid id');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// CRUD OPERATIONS
// ============================================================================
describe('createSession', () => {
  it('creates a new session', () => {
    const result = createSession('Test Session', { data: 'test' });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.metadata.name).toBe('Test Session');
    expect(result.data?.state).toEqual({ data: 'test' });
  });

  it('adds session to index', () => {
    createSession('Test Session', { data: 'test' });
    const index = loadSessionIndex();
    expect(index.sessions.length).toBe(1);
  });

  it('respects mode option', () => {
    const result = createSession('Test', {}, { mode: 'agent-testing' });
    expect(result.data?.metadata.mode).toBe('agent-testing');
  });

  it('respects eventCount option', () => {
    const result = createSession('Test', {}, { eventCount: 5 });
    expect(result.data?.metadata.eventCount).toBe(5);
  });

  it('removes expired session when at limit', () => {
    // Create sessions up to limit - we'll simulate by manipulating the index
    const expiredMetadata: SessionMetadata = {
      id: 'expired-session',
      name: 'Expired',
      createdAt: new Date(Date.now() - 100000).toISOString(),
      updatedAt: new Date(Date.now() - 100000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired
      hasUnsavedChanges: false,
      eventCount: 0,
    };

    // Create enough sessions to fill the limit
    const sessions: SessionMetadata[] = [expiredMetadata];
    for (let i = 0; i < MAX_SESSIONS - 1; i++) {
      sessions.push({
        id: `session-${i}`,
        name: `Session ${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
        hasUnsavedChanges: false,
        eventCount: 0,
      });
    }

    // Save the index
    saveSessionIndex({ sessions, version: '1.0.0' });

    // Create new session - should remove expired one
    const result = createSession('New Session', { data: 'new' });
    expect(result.success).toBe(true);

    // Expired session should be gone
    const index = loadSessionIndex();
    expect(index.sessions.find((s) => s.id === 'expired-session')).toBeUndefined();
  });

  it('removes oldest session when at limit with no expired', () => {
    // Create sessions up to limit
    const sessions: SessionMetadata[] = [];
    for (let i = 0; i < MAX_SESSIONS; i++) {
      const createdAt = new Date(Date.now() + i * 1000).toISOString(); // Stagger creation times
      sessions.push({
        id: `session-${i}`,
        name: `Session ${i}`,
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
        hasUnsavedChanges: false,
        eventCount: 0,
      });
    }

    // Save the index
    saveSessionIndex({ sessions, version: '1.0.0' });

    // Create new session - should remove oldest (session-0)
    const result = createSession('New Session', { data: 'new' });
    expect(result.success).toBe(true);

    // Oldest session should be gone
    const index = loadSessionIndex();
    expect(index.sessions.find((s) => s.id === 'session-0')).toBeUndefined();
  });

  it('fails for oversized session data', () => {
    // Create a state that exceeds MAX_SESSION_SIZE_BYTES (1MB)
    const largeData = 'x'.repeat(MAX_SESSION_SIZE_BYTES + 1000);
    const result = createSession('Large Session', { data: largeData });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Session data exceeds size limit');
  });
});

describe('loadSession', () => {
  it('loads existing session', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    const loadResult = loadSession(sessionId);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data?.state).toEqual({ data: 'test' });
  });

  it('fails for non-existent session', () => {
    const result = loadSession('non-existent');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Session not found');
  });

  it('fails for invalid session ID', () => {
    const result = loadSession('invalid id');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid session ID');
  });

  it('deletes and fails for expired session', () => {
    // Create session
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    // Manually expire the session
    const storageKey = getSessionStorageKey(sessionId);
    const sessionData = JSON.parse(mockStorage[storageKey]);
    sessionData.metadata.expiresAt = new Date(Date.now() - 1000).toISOString();
    mockStorage[storageKey] = JSON.stringify(sessionData);

    // Try to load
    const loadResult = loadSession(sessionId);
    expect(loadResult.success).toBe(false);
    expect(loadResult.error).toBe('Session has expired');
  });
});

describe('updateSession', () => {
  it('updates existing session', () => {
    const createResult = createSession('Test', { data: 'original' });
    const sessionId = createResult.data?.metadata.id!;

    const updateResult = updateSession(sessionId, { data: 'updated' });
    expect(updateResult.success).toBe(true);

    const loadResult = loadSession(sessionId);
    expect(loadResult.data?.state).toEqual({ data: 'updated' });
  });

  it('updates session name', () => {
    const createResult = createSession('Original', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    const updateResult = updateSession(sessionId, { data: 'test' }, { name: 'Updated Name' });
    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.name).toBe('Updated Name');
  });

  it('updates event count', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    const updateResult = updateSession(sessionId, { data: 'test' }, { eventCount: 10 });
    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.eventCount).toBe(10);
  });

  it('updates hasUnsavedChanges flag', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    const updateResult = updateSession(sessionId, { data: 'test' }, { hasUnsavedChanges: true });
    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.hasUnsavedChanges).toBe(true);
  });

  it('resets expiry on update', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;
    const originalExpiry = createResult.data?.metadata.expiresAt!;

    // Wait a tiny bit to ensure different timestamp
    const updateResult = updateSession(sessionId, { data: 'updated' });
    expect(updateResult.success).toBe(true);
    // The new expiry should be >= the original (it resets the 24h timer)
    expect(new Date(updateResult.data!.expiresAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalExpiry).getTime()
    );
  });

  it('fails for non-existent session', () => {
    const result = updateSession('non-existent', { data: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Session not found');
  });

  it('fails for invalid session ID', () => {
    const result = updateSession('invalid id', { data: 'test' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid session ID');
  });

  it('fails for expired session', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    // Manually expire the session
    const storageKey = getSessionStorageKey(sessionId);
    const sessionData = JSON.parse(mockStorage[storageKey]);
    sessionData.metadata.expiresAt = new Date(Date.now() - 1000).toISOString();
    mockStorage[storageKey] = JSON.stringify(sessionData);

    const result = updateSession(sessionId, { data: 'updated' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Session has expired');
  });

  it('fails for oversized update data', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    // Create oversized data
    const largeData = 'x'.repeat(MAX_SESSION_SIZE_BYTES + 1000);
    const result = updateSession(sessionId, { data: largeData });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Session data exceeds size limit');
  });

  it('updates session in index', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    updateSession(sessionId, { data: 'updated' }, { name: 'New Name' });

    const index = loadSessionIndex();
    const sessionInIndex = index.sessions.find((s) => s.id === sessionId);
    expect(sessionInIndex?.name).toBe('New Name');
  });
});

describe('deleteSession', () => {
  it('deletes existing session', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    const deleteResult = deleteSession(sessionId);
    expect(deleteResult.success).toBe(true);

    const loadResult = loadSession(sessionId);
    expect(loadResult.success).toBe(false);
  });

  it('removes session from index', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    deleteSession(sessionId);
    const index = loadSessionIndex();
    expect(index.sessions.find((s) => s.id === sessionId)).toBeUndefined();
  });

  it('clears active session if deleted', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;
    setActiveSessionId(sessionId);

    deleteSession(sessionId);
    expect(getActiveSessionId()).toBe(null);
  });

  it('fails for invalid session ID', () => {
    const result = deleteSession('invalid id');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid session ID');
  });
});

describe('listSessions', () => {
  it('returns empty array when no sessions', () => {
    const sessions = listSessions();
    expect(sessions).toEqual([]);
  });

  it('returns all valid sessions', () => {
    createSession('Session 1', { data: 1 });
    createSession('Session 2', { data: 2 });

    const sessions = listSessions();
    expect(sessions.length).toBe(2);
  });

  it('excludes expired sessions', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;

    // Manually expire the session
    const storageKey = getSessionStorageKey(sessionId);
    const sessionData = JSON.parse(mockStorage[storageKey]);
    sessionData.metadata.expiresAt = new Date(Date.now() - 1000).toISOString();
    mockStorage[storageKey] = JSON.stringify(sessionData);

    // Also update index
    const index = loadSessionIndex();
    index.sessions[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    saveSessionIndex(index);

    const sessions = listSessions();
    expect(sessions.length).toBe(0);
  });

  it('sorts by updatedAt descending', () => {
    // Create first session
    const oldResult = createSession('Old', { data: 1 });
    const oldId = oldResult.data?.metadata.id!;

    // Create second session
    createSession('New', { data: 2 });

    // Manually backdate the 'Old' session to ensure consistent ordering
    const oldStorageKey = getSessionStorageKey(oldId);
    const oldData = JSON.parse(mockStorage[oldStorageKey]);
    oldData.metadata.updatedAt = new Date(Date.now() - 10000).toISOString();
    mockStorage[oldStorageKey] = JSON.stringify(oldData);

    // Also update in index
    const index = loadSessionIndex();
    const oldIdx = index.sessions.findIndex((s) => s.id === oldId);
    if (oldIdx !== -1) {
      index.sessions[oldIdx].updatedAt = oldData.metadata.updatedAt;
      saveSessionIndex(index);
    }

    const sessions = listSessions();
    expect(sessions[0].name).toBe('New');
    expect(sessions[1].name).toBe('Old');
  });
});

describe('clearAllSessions', () => {
  it('removes all sessions', () => {
    createSession('Session 1', { data: 1 });
    createSession('Session 2', { data: 2 });

    const result = clearAllSessions();
    expect(result.success).toBe(true);

    const sessions = listSessions();
    expect(sessions).toEqual([]);
  });

  it('clears active session', () => {
    const createResult = createSession('Test', { data: 'test' });
    setActiveSessionId(createResult.data?.metadata.id!);

    clearAllSessions();
    expect(getActiveSessionId()).toBe(null);
  });
});

// ============================================================================
// RECOVERY
// ============================================================================
describe('getRecoverableSession', () => {
  it('returns null if no active session', () => {
    expect(getRecoverableSession()).toBe(null);
  });

  it('returns session if active session exists', () => {
    const createResult = createSession('Test', { data: 'test' });
    setActiveSessionId(createResult.data?.metadata.id!);

    const recoverable = getRecoverableSession();
    expect(recoverable).not.toBe(null);
    expect(recoverable?.metadata.name).toBe('Test');
  });

  it('returns null and clears if session expired', () => {
    const createResult = createSession('Test', { data: 'test' });
    const sessionId = createResult.data?.metadata.id!;
    setActiveSessionId(sessionId);

    // Manually expire
    const storageKey = getSessionStorageKey(sessionId);
    const sessionData = JSON.parse(mockStorage[storageKey]);
    sessionData.metadata.expiresAt = new Date(Date.now() - 1000).toISOString();
    mockStorage[storageKey] = JSON.stringify(sessionData);

    expect(getRecoverableSession()).toBe(null);
    expect(getActiveSessionId()).toBe(null);
  });
});

describe('dismissSessionRecovery', () => {
  it('clears active session', () => {
    const createResult = createSession('Test', { data: 'test' });
    setActiveSessionId(createResult.data?.metadata.id!);

    const result = dismissSessionRecovery();
    expect(result.success).toBe(true);
    expect(getActiveSessionId()).toBe(null);
  });
});
