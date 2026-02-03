/**
 * Session persistence layer for the Red Council Unified Interface.
 * Provides typed session storage with auto-expiry and multi-session support.
 *
 * Features:
 * - Session state survives page refresh
 * - Auto-expire sessions after 24 hours
 * - Multiple session support with list/switch
 * - Safe storage with validation and size limits
 * - SSR-safe (no window access during SSR)
 */

import { safeLocalStorage } from '../persistence/safeLocalStorage';

// ============================================================================
// CONSTANTS
// ============================================================================

/** LocalStorage key prefix for sessions */
export const SESSION_STORAGE_PREFIX = 'red-council:session:';

/** LocalStorage key for session index */
export const SESSION_INDEX_KEY = 'red-council:sessions';

/** LocalStorage key for active session ID */
export const ACTIVE_SESSION_KEY = 'red-council:active-session';

/** Default session expiry in milliseconds (24 hours) */
export const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Maximum number of sessions to retain */
export const MAX_SESSIONS = 50;

/** Maximum session name length */
export const MAX_SESSION_NAME_LENGTH = 100;

/** Maximum session data size in bytes (10KB to match safeLocalStorage DoS limit) */
export const MAX_SESSION_SIZE_BYTES = 10000;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Session metadata stored in the index.
 */
export interface SessionMetadata {
  /** Unique session identifier */
  id: string;
  /** Display name for the session */
  name: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last updated timestamp (ISO 8601) */
  updatedAt: string;
  /** Expiry timestamp (ISO 8601) */
  expiresAt: string;
  /** Whether this session has unsaved changes */
  hasUnsavedChanges: boolean;
  /** Number of events in the session */
  eventCount: number;
  /** Session mode (llm-testing, agent-testing, demo-mode) */
  mode?: string;
}

/**
 * Complete session data including state.
 */
export interface SessionData<T = unknown> {
  /** Session metadata */
  metadata: SessionMetadata;
  /** Session state data */
  state: T;
}

/**
 * Session index containing all session metadata.
 */
export interface SessionIndex {
  /** List of session metadata */
  sessions: SessionMetadata[];
  /** Version for future migrations */
  version: string;
}

/**
 * Result of a session operation.
 */
export interface SessionResult<T = void> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data (if applicable) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate session ID format (alphanumeric with dashes).
 */
export function isValidSessionId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 100) return false;
  return /^[a-zA-Z0-9-]+$/.test(id);
}

/**
 * Validate session name.
 */
export function isValidSessionName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SESSION_NAME_LENGTH;
}

/**
 * Validate ISO 8601 date string.
 */
export function isValidISODate(date: unknown): date is string {
  if (typeof date !== 'string') return false;
  const parsed = Date.parse(date);
  return !isNaN(parsed);
}

/**
 * Type guard for SessionMetadata.
 */
export function isSessionMetadata(value: unknown): value is SessionMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    isValidSessionId(obj.id) &&
    isValidSessionName(obj.name) &&
    isValidISODate(obj.createdAt) &&
    isValidISODate(obj.updatedAt) &&
    isValidISODate(obj.expiresAt) &&
    typeof obj.hasUnsavedChanges === 'boolean' &&
    typeof obj.eventCount === 'number' &&
    obj.eventCount >= 0
  );
}

/**
 * Type guard for SessionIndex.
 */
export function isSessionIndex(value: unknown): value is SessionIndex {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.sessions)) return false;
  if (typeof obj.version !== 'string') return false;
  return obj.sessions.every(isSessionMetadata);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 11);
  return `session-${timestamp}-${random}`;
}

/**
 * Get the storage key for a session.
 */
export function getSessionStorageKey(sessionId: string): string {
  return `${SESSION_STORAGE_PREFIX}${sessionId}`;
}

/**
 * Calculate expiry date from now.
 */
export function calculateExpiryDate(expiryMs: number = SESSION_EXPIRY_MS): string {
  return new Date(Date.now() + expiryMs).toISOString();
}

/**
 * Check if a session has expired.
 */
export function isSessionExpired(metadata: SessionMetadata): boolean {
  const expiresAt = new Date(metadata.expiresAt).getTime();
  return Date.now() > expiresAt;
}

/**
 * Sanitize session name.
 */
export function sanitizeSessionName(name: string): string {
  return name.trim().slice(0, MAX_SESSION_NAME_LENGTH) || 'Untitled Session';
}

// ============================================================================
// SESSION INDEX OPERATIONS
// ============================================================================

/**
 * Load the session index from storage.
 */
export function loadSessionIndex(): SessionIndex {
  const stored = safeLocalStorage.getItem<SessionIndex>(SESSION_INDEX_KEY);
  if (stored && isSessionIndex(stored)) {
    return stored;
  }
  return { sessions: [], version: '1.0.0' };
}

/**
 * Save the session index to storage.
 */
export function saveSessionIndex(index: SessionIndex): SessionResult {
  try {
    safeLocalStorage.setItem(SESSION_INDEX_KEY, index);
    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('[SessionPersistence] Failed to save index:', e);
    }
    return { success: false, error };
  }
}

/**
 * Get the active session ID.
 */
export function getActiveSessionId(): string | null {
  const id = safeLocalStorage.getItem<string>(ACTIVE_SESSION_KEY);
  return isValidSessionId(id) ? id : null;
}

/**
 * Set the active session ID.
 */
export function setActiveSessionId(sessionId: string | null): SessionResult {
  try {
    if (sessionId === null) {
      safeLocalStorage.removeItem(ACTIVE_SESSION_KEY);
    } else if (isValidSessionId(sessionId)) {
      safeLocalStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    } else {
      return { success: false, error: 'Invalid session ID' };
    }
    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error };
  }
}

// ============================================================================
// SESSION CRUD OPERATIONS
// ============================================================================

/**
 * Create a new session.
 */
export function createSession<T>(
  name: string,
  initialState: T,
  options?: { mode?: string; eventCount?: number }
): SessionResult<SessionData<T>> {
  try {
    const index = loadSessionIndex();

    // Check session limit
    if (index.sessions.length >= MAX_SESSIONS) {
      // Remove oldest expired session or oldest session
      const expired = index.sessions.find(isSessionExpired);
      if (expired) {
        deleteSession(expired.id);
      } else {
        const oldest = index.sessions.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )[0];
        if (oldest) {
          deleteSession(oldest.id);
        }
      }
    }

    const now = new Date().toISOString();
    const metadata: SessionMetadata = {
      id: generateSessionId(),
      name: sanitizeSessionName(name),
      createdAt: now,
      updatedAt: now,
      expiresAt: calculateExpiryDate(),
      hasUnsavedChanges: false,
      eventCount: options?.eventCount ?? 0,
      mode: options?.mode,
    };

    const sessionData: SessionData<T> = {
      metadata,
      state: initialState,
    };

    // Save session data
    const storageKey = getSessionStorageKey(metadata.id);
    const serialized = JSON.stringify(sessionData);
    if (serialized.length > MAX_SESSION_SIZE_BYTES) {
      return { success: false, error: 'Session data exceeds size limit' };
    }
    safeLocalStorage.setItem(storageKey, sessionData);

    // Update index
    index.sessions.push(metadata);
    saveSessionIndex(index);

    return { success: true, data: sessionData };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('[SessionPersistence] Failed to create session:', e);
    }
    return { success: false, error };
  }
}

/**
 * Load a session by ID.
 */
export function loadSession<T>(sessionId: string): SessionResult<SessionData<T>> {
  if (!isValidSessionId(sessionId)) {
    return { success: false, error: 'Invalid session ID' };
  }

  try {
    const storageKey = getSessionStorageKey(sessionId);
    const data = safeLocalStorage.getItem<SessionData<T>>(storageKey);

    if (!data) {
      return { success: false, error: 'Session not found' };
    }

    // Validate metadata
    if (!isSessionMetadata(data.metadata)) {
      return { success: false, error: 'Invalid session metadata' };
    }

    // Check expiry
    if (isSessionExpired(data.metadata)) {
      deleteSession(sessionId);
      return { success: false, error: 'Session has expired' };
    }

    return { success: true, data };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('[SessionPersistence] Failed to load session:', e);
    }
    return { success: false, error };
  }
}

/**
 * Update an existing session.
 */
export function updateSession<T>(
  sessionId: string,
  state: T,
  options?: { name?: string; eventCount?: number; hasUnsavedChanges?: boolean }
): SessionResult<SessionMetadata> {
  if (!isValidSessionId(sessionId)) {
    return { success: false, error: 'Invalid session ID' };
  }

  try {
    const storageKey = getSessionStorageKey(sessionId);
    const existing = safeLocalStorage.getItem<SessionData<T>>(storageKey);

    if (!existing || !isSessionMetadata(existing.metadata)) {
      return { success: false, error: 'Session not found' };
    }

    // Check expiry
    if (isSessionExpired(existing.metadata)) {
      deleteSession(sessionId);
      return { success: false, error: 'Session has expired' };
    }

    // Update metadata
    const updatedMetadata: SessionMetadata = {
      ...existing.metadata,
      updatedAt: new Date().toISOString(),
      expiresAt: calculateExpiryDate(), // Reset expiry on update
      name: options?.name ? sanitizeSessionName(options.name) : existing.metadata.name,
      eventCount: options?.eventCount ?? existing.metadata.eventCount,
      hasUnsavedChanges: options?.hasUnsavedChanges ?? existing.metadata.hasUnsavedChanges,
    };

    const sessionData: SessionData<T> = {
      metadata: updatedMetadata,
      state,
    };

    // Check size
    const serialized = JSON.stringify(sessionData);
    if (serialized.length > MAX_SESSION_SIZE_BYTES) {
      return { success: false, error: 'Session data exceeds size limit' };
    }

    // Save session data
    safeLocalStorage.setItem(storageKey, sessionData);

    // Update index
    const index = loadSessionIndex();
    const sessionIdx = index.sessions.findIndex((s) => s.id === sessionId);
    if (sessionIdx !== -1) {
      index.sessions[sessionIdx] = updatedMetadata;
      saveSessionIndex(index);
    }

    return { success: true, data: updatedMetadata };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('[SessionPersistence] Failed to update session:', e);
    }
    return { success: false, error };
  }
}

/**
 * Delete a session by ID.
 */
export function deleteSession(sessionId: string): SessionResult {
  if (!isValidSessionId(sessionId)) {
    return { success: false, error: 'Invalid session ID' };
  }

  try {
    // Remove session data
    const storageKey = getSessionStorageKey(sessionId);
    safeLocalStorage.removeItem(storageKey);

    // Remove from index
    const index = loadSessionIndex();
    index.sessions = index.sessions.filter((s) => s.id !== sessionId);
    saveSessionIndex(index);

    // Clear active session if it was the deleted one
    const activeId = getActiveSessionId();
    if (activeId === sessionId) {
      setActiveSessionId(null);
    }

    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('[SessionPersistence] Failed to delete session:', e);
    }
    return { success: false, error };
  }
}

/**
 * List all sessions (non-expired).
 */
export function listSessions(): SessionMetadata[] {
  const index = loadSessionIndex();
  const validSessions: SessionMetadata[] = [];
  const expiredIds: string[] = [];

  for (const session of index.sessions) {
    if (isSessionExpired(session)) {
      expiredIds.push(session.id);
    } else {
      validSessions.push(session);
    }
  }

  // Clean up expired sessions
  if (expiredIds.length > 0) {
    for (const id of expiredIds) {
      deleteSession(id);
    }
  }

  // Sort by updatedAt descending (most recent first)
  return validSessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Clear all sessions.
 */
export function clearAllSessions(): SessionResult {
  try {
    const index = loadSessionIndex();

    // Remove all session data
    for (const session of index.sessions) {
      const storageKey = getSessionStorageKey(session.id);
      safeLocalStorage.removeItem(storageKey);
    }

    // Clear index
    saveSessionIndex({ sessions: [], version: '1.0.0' });

    // Clear active session
    setActiveSessionId(null);

    return { success: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    if (process.env.NODE_ENV === 'development') {
      console.error('[SessionPersistence] Failed to clear sessions:', e);
    }
    return { success: false, error };
  }
}

// ============================================================================
// SESSION RECOVERY
// ============================================================================

/**
 * Check if there's a recoverable session.
 * Returns the active session if it exists and is not expired.
 */
export function getRecoverableSession<T>(): SessionData<T> | null {
  const activeId = getActiveSessionId();
  if (!activeId) return null;

  const result = loadSession<T>(activeId);
  if (result.success && result.data) {
    return result.data;
  }

  // Clear invalid active session
  setActiveSessionId(null);
  return null;
}

/**
 * Dismiss session recovery (clear active session without deleting).
 */
export function dismissSessionRecovery(): SessionResult {
  return setActiveSessionId(null);
}
