import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import { AppearanceSettings } from './AppearanceSettings'
import { useSettingsStore } from '@/stores/settings'

// Mock ThemeProvider hook
const mockSetTheme = vi.fn()
vi.mock('@/components/providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: mockSetTheme,
    resolvedTheme: 'light',
    systemTheme: 'light',
  }),
}))

describe('AppearanceSettings', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
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
  // Rendering
  // ============================================================================
  describe('rendering', () => {
    it('renders theme section with all options', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        expect(screen.getByText('Theme')).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /light theme/i })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /dark theme/i })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /system theme/i })).toBeInTheDocument()
      })
    })

    it('renders font size section with all options', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        expect(screen.getByText('Font Size')).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /small font size/i })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /medium font size/i })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /large font size/i })).toBeInTheDocument()
      })
    })

    it('renders compact mode toggle', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        expect(screen.getByLabelText(/compact mode/i)).toBeInTheDocument()
      })
    })

    it('displays resolved theme', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        // Check the full text contains both "Current resolved theme" and "Light"
        const resolvedThemeText = screen.getByText(/current resolved theme/i)
        expect(resolvedThemeText).toBeInTheDocument()
        // The resolved theme value is in a span with font-medium class
        expect(resolvedThemeText.textContent).toMatch(/light/i)
      })
    })

    it('has correct role and accessibility attributes', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        const group = screen.getByRole('group', { name: /appearance settings options/i })
        expect(group).toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // Theme Selection
  // ============================================================================
  describe('theme selection', () => {
    it('calls setTheme when light theme clicked', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        expect(screen.getByRole('radio', { name: /light theme/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('radio', { name: /light theme/i }))

      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })

    it('calls setTheme when dark theme clicked', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        expect(screen.getByRole('radio', { name: /dark theme/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('radio', { name: /dark theme/i }))

      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })

    it('shows check icon on selected theme', async () => {
      // Set theme to dark in store
      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ theme: 'dark' })
      })

      render(<AppearanceSettings />)

      await waitFor(() => {
        const darkThemeButton = screen.getByRole('radio', { name: /dark theme/i })
        expect(darkThemeButton).toHaveAttribute('aria-checked', 'true')
      })
    })
  })

  // ============================================================================
  // Font Size Selection
  // ============================================================================
  describe('font size selection', () => {
    it('updates font size when option clicked', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        expect(screen.getByRole('radio', { name: /large font size/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('radio', { name: /large font size/i }))

      expect(useSettingsStore.getState().appearance.fontSize).toBe('large')
    })

    it('shows correct font size as selected', async () => {
      act(() => {
        useSettingsStore.getState().updateAppearanceSettings({ fontSize: 'small' })
      })

      render(<AppearanceSettings />)

      await waitFor(() => {
        const smallButton = screen.getByRole('radio', { name: /small font size/i })
        expect(smallButton).toHaveAttribute('aria-checked', 'true')
      })
    })
  })

  // ============================================================================
  // Compact Mode
  // ============================================================================
  describe('compact mode', () => {
    it('toggles compact mode when switch clicked', async () => {
      render(<AppearanceSettings />)

      await waitFor(() => {
        expect(screen.getByLabelText(/compact mode/i)).toBeInTheDocument()
      })

      const compactModeSwitch = screen.getByLabelText(/compact mode/i)
      expect(compactModeSwitch).not.toBeChecked()

      fireEvent.click(compactModeSwitch)

      expect(useSettingsStore.getState().appearance.compactMode).toBe(true)
    })
  })
})
