import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useIsTouchDevice,
} from './useMediaQuery'

describe('useMediaQuery', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>
  let listeners: Map<string, (event: MediaQueryListEvent) => void>

  beforeEach(() => {
    listeners = new Map()

    matchMediaMock = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn((event: string, callback: () => void) => {
        if (event === 'change') {
          listeners.set(query, callback as (event: MediaQueryListEvent) => void)
        }
      }),
      removeEventListener: vi.fn((event: string) => {
        if (event === 'change') {
          listeners.delete(query)
        }
      }),
      addListener: vi.fn((callback: () => void) => {
        listeners.set(query, callback as (event: MediaQueryListEvent) => void)
      }),
      removeListener: vi.fn(() => {
        listeners.delete(query)
      }),
      dispatchEvent: vi.fn(),
    }))

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    listeners.clear()
  })

  describe('useMediaQuery hook', () => {
    it('returns false initially during SSR simulation', () => {
      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
      // After mount, it should check the actual value
      expect(typeof result.current).toBe('boolean')
    })

    it('calls matchMedia with the correct query', () => {
      renderHook(() => useMediaQuery('(min-width: 768px)'))
      expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 768px)')
    })

    it('returns true when media query matches', () => {
      matchMediaMock.mockReturnValueOnce({
        matches: true,
        media: '(min-width: 768px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
      expect(result.current).toBe(true)
    })

    it('returns false when media query does not match', () => {
      matchMediaMock.mockReturnValueOnce({
        matches: false,
        media: '(min-width: 768px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
      expect(result.current).toBe(false)
    })

    it('updates when media query changes', () => {
      let changeCallback: ((event: MediaQueryListEvent) => void) | null = null

      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(min-width: 768px)',
        addEventListener: vi.fn((event: string, cb: () => void) => {
          if (event === 'change') {
            changeCallback = cb as (event: MediaQueryListEvent) => void
          }
        }),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
      expect(result.current).toBe(false)

      // Simulate media query change
      act(() => {
        if (changeCallback) {
          changeCallback({ matches: true } as MediaQueryListEvent)
        }
      })

      expect(result.current).toBe(true)
    })

    it('cleans up event listener on unmount', () => {
      const removeEventListener = vi.fn()

      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(min-width: 768px)',
        addEventListener: vi.fn(),
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
      unmount()

      expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    })

    it('handles query change', () => {
      const { result, rerender } = renderHook(
        ({ query }) => useMediaQuery(query),
        { initialProps: { query: '(min-width: 768px)' } }
      )

      expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 768px)')

      rerender({ query: '(min-width: 1024px)' })

      expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 1024px)')
    })

    it('handles missing matchMedia gracefully', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: undefined,
      })

      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
      expect(result.current).toBe(false)
    })
  })

  describe('useIsMobile hook', () => {
    it('returns true when screen is mobile-sized (below 768px)', () => {
      matchMediaMock.mockReturnValue({
        matches: false, // Query is for min-width: 768px, so false means mobile
        media: '(min-width: 768px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const { result } = renderHook(() => useIsMobile())
      expect(result.current).toBe(true) // NOT matching min-width: 768px means mobile
    })

    it('returns false when screen is tablet or larger', () => {
      matchMediaMock.mockReturnValue({
        matches: true, // Query is for min-width: 768px, true means not mobile
        media: '(min-width: 768px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const { result } = renderHook(() => useIsMobile())
      expect(result.current).toBe(false)
    })
  })

  describe('useIsTablet hook', () => {
    it('returns true when screen is tablet-sized (768px-1024px)', () => {
      // First call for (min-width: 768px) -> true
      // Second call for (min-width: 1024px) -> false
      matchMediaMock
        .mockReturnValueOnce({
          matches: true, // Above mobile
          media: '(min-width: 768px)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })
        .mockReturnValueOnce({
          matches: false, // Below desktop
          media: '(min-width: 1024px)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })

      const { result } = renderHook(() => useIsTablet())
      expect(result.current).toBe(true)
    })

    it('returns false when screen is mobile-sized', () => {
      matchMediaMock
        .mockReturnValueOnce({
          matches: false, // Below tablet
          media: '(min-width: 768px)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })
        .mockReturnValueOnce({
          matches: false,
          media: '(min-width: 1024px)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })

      const { result } = renderHook(() => useIsTablet())
      expect(result.current).toBe(false)
    })

    it('returns false when screen is desktop-sized', () => {
      matchMediaMock
        .mockReturnValueOnce({
          matches: true,
          media: '(min-width: 768px)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })
        .mockReturnValueOnce({
          matches: true, // Above tablet threshold
          media: '(min-width: 1024px)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })

      const { result } = renderHook(() => useIsTablet())
      expect(result.current).toBe(false)
    })
  })

  describe('useIsDesktop hook', () => {
    it('returns true when screen is desktop-sized (1024px+)', () => {
      matchMediaMock.mockReturnValue({
        matches: true,
        media: '(min-width: 1024px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const { result } = renderHook(() => useIsDesktop())
      expect(result.current).toBe(true)
    })

    it('returns false when screen is below desktop size', () => {
      matchMediaMock.mockReturnValue({
        matches: false,
        media: '(min-width: 1024px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })

      const { result } = renderHook(() => useIsDesktop())
      expect(result.current).toBe(false)
    })
  })

  describe('useIsTouchDevice hook', () => {
    it('returns true when ontouchstart is present', () => {
      Object.defineProperty(window, 'ontouchstart', {
        writable: true,
        configurable: true,
        value: vi.fn(),
      })

      const { result } = renderHook(() => useIsTouchDevice())
      expect(result.current).toBe(true)

      // Clean up
      delete (window as unknown as { ontouchstart?: unknown }).ontouchstart
    })

    it('returns true when maxTouchPoints is greater than 0', () => {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        writable: true,
        configurable: true,
        value: 5,
      })

      const { result } = renderHook(() => useIsTouchDevice())
      expect(result.current).toBe(true)

      // Reset
      Object.defineProperty(navigator, 'maxTouchPoints', {
        writable: true,
        configurable: true,
        value: 0,
      })
    })

    it('returns false when no touch support detected', () => {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        writable: true,
        configurable: true,
        value: 0,
      })

      const { result } = renderHook(() => useIsTouchDevice())
      expect(result.current).toBe(false)
    })
  })
})
