import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import SettingsPage from './page'
import { useSettingsStore } from '@/stores/settings'

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: vi.fn(),
    resolvedTheme: 'light',
    systemTheme: 'light',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock ThemeProvider
vi.mock('@/components/providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: vi.fn(),
    resolvedTheme: 'light',
    systemTheme: 'light',
  }),
}))

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
}
Object.assign(navigator, { clipboard: mockClipboard })

describe('SettingsPage', () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    act(() => {
      useSettingsStore.getState().resetToDefaults()
      useSettingsStore.setState({ activeTab: 'general' })
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // ============================================================================
  // Initial Render
  // ============================================================================
  describe('initial render', () => {
    it('renders the settings page title', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /settings/i, level: 1 })).toBeInTheDocument()
      })
    })

    it('renders all tab triggers', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /general/i })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /agent config/i })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /api keys/i })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /appearance/i })).toBeInTheDocument()
      })
    })

    it('shows general tab as active by default', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        const generalTab = screen.getByRole('tab', { name: /general/i })
        expect(generalTab).toHaveAttribute('data-state', 'active')
      })
    })

    it('renders general settings content by default', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        expect(screen.getByText(/manage your general application preferences/i)).toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // Tab Navigation
  // ============================================================================
  describe('tab navigation', () => {
    it('all tabs are clickable and accessible', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        const tabs = screen.getAllByRole('tab')
        expect(tabs).toHaveLength(4)
        tabs.forEach((tab) => {
          expect(tab).not.toBeDisabled()
        })
      })
    })

    it('renders tabs with correct accessibility attributes', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        const generalTab = screen.getByRole('tab', { name: /general/i })
        expect(generalTab).toHaveAttribute('aria-controls')
      })
    })

    it('setActiveTab in store changes active tab', async () => {
      // First render and wait for mount
      render(<SettingsPage />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /general/i })).toBeInTheDocument()
      })

      // Directly update the store
      act(() => {
        useSettingsStore.getState().setActiveTab('agent')
      })

      expect(useSettingsStore.getState().activeTab).toBe('agent')
    })
  })

  // ============================================================================
  // Accessibility
  // ============================================================================
  describe('accessibility', () => {
    it('has accessible tab list with proper role', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        expect(screen.getByRole('tablist', { name: /settings sections/i })).toBeInTheDocument()
      })
    })

    it('tab panels have proper aria attributes', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        const generalPanel = screen.getByRole('tabpanel')
        expect(generalPanel).toHaveAttribute('id', 'settings-general-panel')
      })
    })
  })
})
