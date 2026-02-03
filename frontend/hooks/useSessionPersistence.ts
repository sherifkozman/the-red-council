'use client';

/**
 * React hook for session persistence management.
 * Provides easy access to session CRUD operations and recovery flow.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  createSession,
  loadSession,
  updateSession,
  deleteSession,
  listSessions,
  clearAllSessions,
  getActiveSessionId,
  setActiveSessionId,
  getRecoverableSession,
  dismissSessionRecovery,
  type SessionMetadata,
  type SessionData,
  type SessionResult,
} from '@/lib/session/persistence';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Session recovery state for prompting users.
 */
export interface SessionRecoveryState {
  /** Whether there's a recoverable session */
  hasRecoverableSession: boolean;
  /** The recoverable session data (if any) */
  session: SessionData | null;
  /** Whether the recovery prompt is showing */
  showPrompt: boolean;
}

/**
 * Hook return type for session persistence.
 */
export interface UseSessionPersistenceReturn<T = unknown> {
  // State
  /** Currently loaded session */
  currentSession: SessionData<T> | null;
  /** List of all available sessions */
  sessions: SessionMetadata[];
  /** Whether a session is loading */
  isLoading: boolean;
  /** Error message (if any) */
  error: string | null;
  /** Session recovery state */
  recovery: SessionRecoveryState;

  // Actions
  /** Create a new session */
  create: (name: string, initialState: T, options?: { mode?: string }) => SessionResult<SessionData<T>>;
  /** Load a session by ID */
  load: (sessionId: string) => SessionResult<SessionData<T>>;
  /** Save/update the current session */
  save: (state: T, options?: { name?: string; eventCount?: number }) => SessionResult<SessionMetadata>;
  /** Delete a session by ID */
  remove: (sessionId: string) => SessionResult;
  /** Switch to a different session */
  switchTo: (sessionId: string) => SessionResult<SessionData<T>>;
  /** Clear all sessions */
  clearAll: () => SessionResult;
  /** Refresh the session list */
  refresh: () => void;

  // Recovery actions
  /** Recover the session (accept recovery prompt) */
  recoverSession: () => void;
  /** Dismiss the recovery prompt (don't recover) */
  dismissRecovery: () => void;

  // Utility
  /** Mark current session as having unsaved changes */
  markUnsaved: () => void;
  /** Mark current session as saved */
  markSaved: () => void;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for managing session persistence.
 *
 * @param options - Hook options
 * @param options.autoLoad - Whether to auto-load the active session on mount (default: true)
 * @param options.showRecoveryPrompt - Whether to show recovery prompt on mount (default: true)
 * @returns Session persistence interface
 */
export function useSessionPersistence<T = unknown>(options?: {
  autoLoad?: boolean;
  showRecoveryPrompt?: boolean;
}): UseSessionPersistenceReturn<T> {
  const { autoLoad = true, showRecoveryPrompt = true } = options ?? {};

  // State
  const [currentSession, setCurrentSession] = useState<SessionData<T> | null>(null);
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryState, setRecoveryState] = useState<SessionRecoveryState>({
    hasRecoverableSession: false,
    session: null,
    showPrompt: false,
  });
  const [mounted, setMounted] = useState(false);

  // Refresh sessions list
  const refresh = useCallback(() => {
    const sessionList = listSessions();
    setSessions(sessionList);
  }, []);

  // Check for recoverable session on mount
  useEffect(() => {
    if (!mounted) {
      setMounted(true);

      // Check for recoverable session
      if (showRecoveryPrompt) {
        const recoverable = getRecoverableSession<T>();
        if (recoverable) {
          setRecoveryState({
            hasRecoverableSession: true,
            session: recoverable,
            showPrompt: true,
          });
        }
      }

      // Auto-load active session
      if (autoLoad && !showRecoveryPrompt) {
        const activeId = getActiveSessionId();
        if (activeId) {
          const result = loadSession<T>(activeId);
          if (result.success && result.data) {
            setCurrentSession(result.data);
          }
        }
      }

      // Load sessions list
      refresh();
    }
  }, [mounted, autoLoad, showRecoveryPrompt, refresh]);

  // Create a new session
  const create = useCallback(
    (name: string, initialState: T, options?: { mode?: string }): SessionResult<SessionData<T>> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = createSession(name, initialState, options);
        if (result.success && result.data) {
          setCurrentSession(result.data);
          setActiveSessionId(result.data.metadata.id);
          refresh();
        } else {
          setError(result.error ?? 'Failed to create session');
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [refresh]
  );

  // Load a session by ID
  const load = useCallback((sessionId: string): SessionResult<SessionData<T>> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = loadSession<T>(sessionId);
      if (result.success && result.data) {
        setCurrentSession(result.data);
        setActiveSessionId(sessionId);
      } else {
        setError(result.error ?? 'Failed to load session');
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save/update the current session
  const save = useCallback(
    (state: T, options?: { name?: string; eventCount?: number }): SessionResult<SessionMetadata> => {
      if (!currentSession) {
        return { success: false, error: 'No current session' };
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = updateSession(currentSession.metadata.id, state, {
          ...options,
          hasUnsavedChanges: false,
        });

        if (result.success && result.data) {
          setCurrentSession((prev) =>
            prev
              ? {
                  ...prev,
                  metadata: result.data!,
                  state,
                }
              : null
          );
          refresh();
        } else {
          setError(result.error ?? 'Failed to save session');
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [currentSession, refresh]
  );

  // Delete a session
  const remove = useCallback(
    (sessionId: string): SessionResult => {
      setIsLoading(true);
      setError(null);

      try {
        const result = deleteSession(sessionId);
        if (result.success) {
          // Clear current session if it was deleted
          if (currentSession?.metadata.id === sessionId) {
            setCurrentSession(null);
          }
          refresh();
        } else {
          setError(result.error ?? 'Failed to delete session');
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [currentSession, refresh]
  );

  // Switch to a different session
  const switchTo = useCallback(
    (sessionId: string): SessionResult<SessionData<T>> => {
      return load(sessionId);
    },
    [load]
  );

  // Clear all sessions
  const clearAll = useCallback((): SessionResult => {
    setIsLoading(true);
    setError(null);

    try {
      const result = clearAllSessions();
      if (result.success) {
        setCurrentSession(null);
        refresh();
      } else {
        setError(result.error ?? 'Failed to clear sessions');
      }
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  // Recover session (accept recovery prompt)
  const recoverSession = useCallback(() => {
    if (recoveryState.session) {
      setCurrentSession(recoveryState.session as SessionData<T>);
      setRecoveryState({
        hasRecoverableSession: false,
        session: null,
        showPrompt: false,
      });
    }
  }, [recoveryState.session]);

  // Dismiss recovery prompt
  const dismissRecovery = useCallback(() => {
    dismissSessionRecovery();
    setRecoveryState({
      hasRecoverableSession: false,
      session: null,
      showPrompt: false,
    });
  }, []);

  // Mark current session as having unsaved changes
  // Using functional update pattern without guard - the update itself handles null safely
  const markUnsaved = useCallback(() => {
    setCurrentSession((prev) =>
      prev
        ? {
            ...prev,
            metadata: { ...prev.metadata, hasUnsavedChanges: true },
          }
        : null
    );
  }, []);

  // Mark current session as saved
  // Using functional update pattern without guard - the update itself handles null safely
  const markSaved = useCallback(() => {
    setCurrentSession((prev) =>
      prev
        ? {
            ...prev,
            metadata: { ...prev.metadata, hasUnsavedChanges: false },
          }
        : null
    );
  }, []);

  // Memoized return value
  const returnValue = useMemo(
    (): UseSessionPersistenceReturn<T> => ({
      currentSession,
      sessions,
      isLoading,
      error,
      recovery: recoveryState,
      create,
      load,
      save,
      remove,
      switchTo,
      clearAll,
      refresh,
      recoverSession,
      dismissRecovery,
      markUnsaved,
      markSaved,
    }),
    [
      currentSession,
      sessions,
      isLoading,
      error,
      recoveryState,
      create,
      load,
      save,
      remove,
      switchTo,
      clearAll,
      refresh,
      recoverSession,
      dismissRecovery,
      markUnsaved,
      markSaved,
    ]
  );

  return returnValue;
}
