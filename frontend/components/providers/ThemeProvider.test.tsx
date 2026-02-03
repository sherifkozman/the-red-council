import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { useSettingsStore } from '@/stores/settings'

// Mock next-themes
const mockSetTheme = vi.fn()
vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: mockSetTheme,
    resolvedTheme: 'light',
    systemTheme: 'light',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('ThemeProvider', () => {
  beforeEach(() => {
    act(() => {
      useSettingsStore.getState().resetToDefaults()
    })
    mockSetTheme.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // ============================================================================
  // Provider
  // ============================================================================
  describe('ThemeProvider component', () => {
    it('renders children', () => {
      render(
        <ThemeProvider>
          <div data-testid="child">Test Child</div>
        </ThemeProvider>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('syncs settings store theme to next-themes on mount', () => {
      // Set theme in store before rendering
      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ theme: 'dark' })
      })

      render(
        <ThemeProvider>
          <div>Test</div>
        </ThemeProvider>
      )

      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })
  })

  // ============================================================================
  // useTheme Hook
  // ============================================================================
  describe('useTheme hook', () => {
    // Create a wrapper that includes ThemeProvider
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    )

    it('returns theme values', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })

      expect(result.current.theme).toBe('system')
      expect(result.current.resolvedTheme).toBe('light')
      expect(result.current.systemTheme).toBe('light')
    })

    it('setTheme updates both next-themes and settings store', () => {
      const { result } = renderHook(() => useTheme(), { wrapper })

      act(() => {
        result.current.setTheme('dark')
      })

      expect(mockSetTheme).toHaveBeenCalledWith('dark')
      expect(useSettingsStore.getState().appearance.theme).toBe('dark')
    })
  })
})
