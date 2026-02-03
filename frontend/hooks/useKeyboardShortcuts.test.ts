import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import * as SettingsStore from '@/stores/settings'
import * as ActionStore from '@/stores/actions'

// Mock react-hotkeys-hook
const mockUseHotkeys = vi.fn()
vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: (keys: string, callback: Function, options: any, deps: any[]) => mockUseHotkeys(keys, callback, options, deps)
}))

// Mock settings store
vi.mock('@/stores/settings', () => ({
  useSettingsStore: vi.fn()
}))

// Mock action store
const mockTrigger = vi.fn()
vi.mock('@/stores/actions', () => ({
  useActionStore: vi.fn()
}))

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

describe('useKeyboardShortcuts', () => {
  const mockShortcuts = {
    runEvaluation: 'alt+e',
    generateReport: 'alt+r',
    loadDemo: 'alt+d',
    commandPalette: 'alt+k',
    help: 'shift+/',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(SettingsStore.useSettingsStore).mockReturnValue({
      shortcuts: mockShortcuts
    } as any)
    vi.mocked(ActionStore.useActionStore).mockReturnValue({
      trigger: mockTrigger,
      handlers: {},
      registerHandler: vi.fn()
    } as any)
  })

  it('registers all shortcuts', () => {
    renderHook(() => useKeyboardShortcuts())
    
    // Check if useHotkeys was called for each shortcut
    expect(mockUseHotkeys).toHaveBeenCalledWith('shift+/', expect.any(Function), expect.objectContaining({ preventDefault: true }), expect.any(Array))
    expect(mockUseHotkeys).toHaveBeenCalledWith('alt+e', expect.any(Function), expect.objectContaining({ preventDefault: true }), expect.any(Array))
    expect(mockUseHotkeys).toHaveBeenCalledWith('alt+r', expect.any(Function), expect.objectContaining({ preventDefault: true }), expect.any(Array))
    expect(mockUseHotkeys).toHaveBeenCalledWith('alt+d', expect.any(Function), expect.objectContaining({ preventDefault: true }), expect.any(Array))
    expect(mockUseHotkeys).toHaveBeenCalledWith('alt+k', expect.any(Function), expect.objectContaining({ preventDefault: true }), expect.any(Array))
  })

  it('toggles help state when help shortcut is triggered', () => {
    // Capture the callback
    let helpCallback: Function | undefined
    mockUseHotkeys.mockImplementation((key, cb) => {
      if (key === 'shift+/') helpCallback = cb
    })

    const { result } = renderHook(() => useKeyboardShortcuts())
    
    expect(result.current.isHelpOpen).toBe(false)

    act(() => {
      helpCallback?.({ preventDefault: vi.fn() })
    })

    expect(result.current.isHelpOpen).toBe(true)
  })

  it('triggers action for run evaluation', () => {
    let evalCallback: Function | undefined
    mockUseHotkeys.mockImplementation((key, cb) => {
      if (key === 'alt+e') evalCallback = cb
    })

    renderHook(() => useKeyboardShortcuts())

    act(() => {
      evalCallback?.({ preventDefault: vi.fn() })
    })

    expect(mockTrigger).toHaveBeenCalledWith('runEvaluation')
  })

  it('triggers actions for other shortcuts', () => {
    let reportCb: Function | undefined
    let demoCb: Function | undefined
    let paletteCb: Function | undefined

    mockUseHotkeys.mockImplementation((key, cb) => {
      if (key === 'alt+r') reportCb = cb
      if (key === 'alt+d') demoCb = cb
      if (key === 'alt+k') paletteCb = cb
    })

    renderHook(() => useKeyboardShortcuts())

    act(() => {
      reportCb?.({ preventDefault: vi.fn() })
    })
    expect(mockTrigger).toHaveBeenCalledWith('generateReport')

    act(() => {
      demoCb?.({ preventDefault: vi.fn() })
    })
    expect(mockTrigger).toHaveBeenCalledWith('loadDemo')

    act(() => {
      paletteCb?.({ preventDefault: vi.fn() })
    })
    expect(mockTrigger).toHaveBeenCalledWith('commandPalette')
  })
})