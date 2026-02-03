import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSessionPersistence } from './useSessionPersistence';
import * as persistence from '@/lib/session/persistence';

// Mock the persistence module
vi.mock('@/lib/session/persistence', () => ({
  createSession: vi.fn(),
  loadSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  listSessions: vi.fn(),
  clearAllSessions: vi.fn(),
  getActiveSessionId: vi.fn(),
  setActiveSessionId: vi.fn(),
  getRecoverableSession: vi.fn(),
  dismissSessionRecovery: vi.fn(),
}));

const mockPersistence = vi.mocked(persistence);

// Test state type
interface TestState {
  data: string;
}

const mockMetadata: persistence.SessionMetadata = {
  id: 'session-123',
  name: 'Test Session',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  hasUnsavedChanges: false,
  eventCount: 0,
};

const mockSessionData: persistence.SessionData<TestState> = {
  metadata: mockMetadata,
  state: { data: 'test' },
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations
  mockPersistence.listSessions.mockReturnValue([]);
  mockPersistence.getActiveSessionId.mockReturnValue(null);
  mockPersistence.getRecoverableSession.mockReturnValue(null);
  mockPersistence.setActiveSessionId.mockReturnValue({ success: true });
  mockPersistence.dismissSessionRecovery.mockReturnValue({ success: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// INITIAL STATE
// ============================================================================
describe('initial state', () => {
  it('has null current session initially', () => {
    const { result } = renderHook(() => useSessionPersistence<TestState>());
    expect(result.current.currentSession).toBe(null);
  });

  it('has empty sessions list initially', () => {
    const { result } = renderHook(() => useSessionPersistence<TestState>());
    expect(result.current.sessions).toEqual([]);
  });

  it('is not loading initially', () => {
    const { result } = renderHook(() => useSessionPersistence<TestState>());
    expect(result.current.isLoading).toBe(false);
  });

  it('has no error initially', () => {
    const { result } = renderHook(() => useSessionPersistence<TestState>());
    expect(result.current.error).toBe(null);
  });

  it('has no recovery state initially', () => {
    const { result } = renderHook(() => useSessionPersistence<TestState>());
    expect(result.current.recovery.hasRecoverableSession).toBe(false);
    expect(result.current.recovery.session).toBe(null);
    expect(result.current.recovery.showPrompt).toBe(false);
  });
});

// ============================================================================
// MOUNT BEHAVIOR
// ============================================================================
describe('mount behavior', () => {
  it('loads sessions list on mount', async () => {
    mockPersistence.listSessions.mockReturnValue([mockMetadata]);

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    await waitFor(() => {
      expect(result.current.sessions.length).toBe(1);
    });
  });

  it('checks for recoverable session on mount', async () => {
    mockPersistence.getRecoverableSession.mockReturnValue(mockSessionData);

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    await waitFor(() => {
      expect(result.current.recovery.hasRecoverableSession).toBe(true);
      expect(result.current.recovery.showPrompt).toBe(true);
    });
  });

  it('skips recovery check when showRecoveryPrompt is false', async () => {
    mockPersistence.getRecoverableSession.mockReturnValue(mockSessionData);

    const { result } = renderHook(() =>
      useSessionPersistence<TestState>({ showRecoveryPrompt: false })
    );

    await waitFor(() => {
      expect(result.current.recovery.showPrompt).toBe(false);
    });
  });

  it('auto-loads active session when autoLoad is true and no recovery prompt', async () => {
    mockPersistence.getActiveSessionId.mockReturnValue('session-123');
    mockPersistence.loadSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });

    const { result } = renderHook(() =>
      useSessionPersistence<TestState>({
        autoLoad: true,
        showRecoveryPrompt: false,
      })
    );

    await waitFor(() => {
      expect(mockPersistence.loadSession).toHaveBeenCalledWith('session-123');
    });
  });
});

// ============================================================================
// CREATE SESSION
// ============================================================================
describe('create', () => {
  it('creates a new session', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.create('Test Session', { data: 'test' });
    });

    await waitFor(() => {
      expect(result.current.currentSession).toEqual(mockSessionData);
    });
  });

  it('sets active session after create', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.create('Test Session', { data: 'test' });
    });

    expect(mockPersistence.setActiveSessionId).toHaveBeenCalledWith('session-123');
  });

  it('refreshes sessions list after create', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.create('Test Session', { data: 'test' });
    });

    // listSessions called on mount + after create
    expect(mockPersistence.listSessions).toHaveBeenCalledTimes(2);
  });

  it('sets error on create failure', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: false,
      error: 'Create failed',
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.create('Test Session', { data: 'test' });
    });

    expect(result.current.error).toBe('Create failed');
  });

  it('passes mode option to createSession', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.create('Test', { data: 'test' }, { mode: 'agent-testing' });
    });

    expect(mockPersistence.createSession).toHaveBeenCalledWith(
      'Test',
      { data: 'test' },
      { mode: 'agent-testing' }
    );
  });
});

// ============================================================================
// LOAD SESSION
// ============================================================================
describe('load', () => {
  it('loads a session by ID', async () => {
    mockPersistence.loadSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.load('session-123');
    });

    await waitFor(() => {
      expect(result.current.currentSession).toEqual(mockSessionData);
    });
  });

  it('sets active session after load', async () => {
    mockPersistence.loadSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.load('session-123');
    });

    expect(mockPersistence.setActiveSessionId).toHaveBeenCalledWith('session-123');
  });

  it('sets error on load failure', async () => {
    mockPersistence.loadSession.mockReturnValue({
      success: false,
      error: 'Session not found',
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.load('non-existent');
    });

    expect(result.current.error).toBe('Session not found');
  });
});

// ============================================================================
// SAVE SESSION
// ============================================================================
describe('save', () => {
  it('fails if no current session', async () => {
    const { result } = renderHook(() => useSessionPersistence<TestState>());

    let saveResult: persistence.SessionResult<persistence.SessionMetadata>;
    act(() => {
      saveResult = result.current.save({ data: 'updated' });
    });

    expect(saveResult!.success).toBe(false);
    expect(saveResult!.error).toBe('No current session');
  });

  it('saves current session', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });
    mockPersistence.updateSession.mockReturnValue({
      success: true,
      data: { ...mockMetadata, updatedAt: new Date().toISOString() },
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    // First create a session
    act(() => {
      result.current.create('Test', { data: 'test' });
    });

    // Then save
    act(() => {
      result.current.save({ data: 'updated' });
    });

    expect(mockPersistence.updateSession).toHaveBeenCalledWith(
      'session-123',
      { data: 'updated' },
      { hasUnsavedChanges: false }
    );
  });

  it('updates session name when provided', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });
    mockPersistence.updateSession.mockReturnValue({
      success: true,
      data: { ...mockMetadata, name: 'New Name' },
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.create('Test', { data: 'test' });
    });

    act(() => {
      result.current.save({ data: 'test' }, { name: 'New Name' });
    });

    expect(mockPersistence.updateSession).toHaveBeenCalledWith(
      'session-123',
      { data: 'test' },
      { name: 'New Name', hasUnsavedChanges: false }
    );
  });
});

// ============================================================================
// REMOVE SESSION
// ============================================================================
describe('remove', () => {
  it('deletes a session', async () => {
    mockPersistence.deleteSession.mockReturnValue({ success: true });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.remove('session-123');
    });

    expect(mockPersistence.deleteSession).toHaveBeenCalledWith('session-123');
  });

  it('refreshes sessions list after delete', async () => {
    mockPersistence.deleteSession.mockReturnValue({ success: true });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.remove('session-123');
    });

    // listSessions called on mount + after delete
    expect(mockPersistence.listSessions).toHaveBeenCalledTimes(2);
  });

  it('clears current session if deleted', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });
    mockPersistence.deleteSession.mockReturnValue({ success: true });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    // Create session
    act(() => {
      result.current.create('Test', { data: 'test' });
    });

    // Delete it
    act(() => {
      result.current.remove('session-123');
    });

    expect(result.current.currentSession).toBe(null);
  });

  it('sets error on delete failure', async () => {
    mockPersistence.deleteSession.mockReturnValue({
      success: false,
      error: 'Delete failed',
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.remove('session-123');
    });

    expect(result.current.error).toBe('Delete failed');
  });
});

// ============================================================================
// SWITCH SESSION
// ============================================================================
describe('switchTo', () => {
  it('loads and switches to another session', async () => {
    const otherSession: persistence.SessionData<TestState> = {
      metadata: { ...mockMetadata, id: 'session-456', name: 'Other Session' },
      state: { data: 'other' },
    };
    mockPersistence.loadSession.mockReturnValue({
      success: true,
      data: otherSession,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.switchTo('session-456');
    });

    await waitFor(() => {
      expect(result.current.currentSession?.metadata.name).toBe('Other Session');
    });
  });
});

// ============================================================================
// CLEAR ALL
// ============================================================================
describe('clearAll', () => {
  it('clears all sessions', async () => {
    mockPersistence.clearAllSessions.mockReturnValue({ success: true });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.clearAll();
    });

    expect(mockPersistence.clearAllSessions).toHaveBeenCalled();
  });

  it('clears current session after clear all', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });
    mockPersistence.clearAllSessions.mockReturnValue({ success: true });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    // Create session
    act(() => {
      result.current.create('Test', { data: 'test' });
    });

    // Clear all
    act(() => {
      result.current.clearAll();
    });

    expect(result.current.currentSession).toBe(null);
  });
});

// ============================================================================
// REFRESH
// ============================================================================
describe('refresh', () => {
  it('refreshes the sessions list', async () => {
    mockPersistence.listSessions.mockReturnValue([mockMetadata]);

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.refresh();
    });

    // Called on mount + refresh
    expect(mockPersistence.listSessions).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// RECOVERY
// ============================================================================
describe('recoverSession', () => {
  it('recovers the session and clears prompt', async () => {
    mockPersistence.getRecoverableSession.mockReturnValue(mockSessionData);

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    // Wait for mount to detect recoverable session
    await waitFor(() => {
      expect(result.current.recovery.showPrompt).toBe(true);
    });

    // Recover
    act(() => {
      result.current.recoverSession();
    });

    expect(result.current.currentSession).toEqual(mockSessionData);
    expect(result.current.recovery.showPrompt).toBe(false);
  });
});

describe('dismissRecovery', () => {
  it('dismisses recovery prompt', async () => {
    mockPersistence.getRecoverableSession.mockReturnValue(mockSessionData);

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    // Wait for mount
    await waitFor(() => {
      expect(result.current.recovery.showPrompt).toBe(true);
    });

    // Dismiss
    act(() => {
      result.current.dismissRecovery();
    });

    expect(result.current.recovery.showPrompt).toBe(false);
    expect(mockPersistence.dismissSessionRecovery).toHaveBeenCalled();
  });
});

// ============================================================================
// MARK UNSAVED/SAVED
// ============================================================================
describe('markUnsaved', () => {
  it('marks current session as having unsaved changes', async () => {
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: mockSessionData,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.create('Test', { data: 'test' });
    });

    act(() => {
      result.current.markUnsaved();
    });

    expect(result.current.currentSession?.metadata.hasUnsavedChanges).toBe(true);
  });

  it('does nothing if no current session', () => {
    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.markUnsaved();
    });

    expect(result.current.currentSession).toBe(null);
  });
});

describe('markSaved', () => {
  it('marks current session as saved', async () => {
    const unsavedMetadata = { ...mockMetadata, hasUnsavedChanges: true };
    const unsavedSession = { ...mockSessionData, metadata: unsavedMetadata };
    mockPersistence.createSession.mockReturnValue({
      success: true,
      data: unsavedSession,
    });

    const { result } = renderHook(() => useSessionPersistence<TestState>());

    act(() => {
      result.current.create('Test', { data: 'test' });
    });

    act(() => {
      result.current.markSaved();
    });

    expect(result.current.currentSession?.metadata.hasUnsavedChanges).toBe(false);
  });
});
