import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { BottomNav } from './BottomNav'

// Mock next/navigation
const mockPathname = vi.fn(() => '/dashboard')
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

describe('BottomNav', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/dashboard')
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // ============================================================================
  // Rendering
  // ============================================================================
  describe('rendering', () => {
    it('renders the navigation container', () => {
      render(<BottomNav />)
      const nav = screen.getByRole('navigation', { name: /bottom navigation/i })
      expect(nav).toBeInTheDocument()
    })

    it('renders main navigation items', () => {
      render(<BottomNav />)

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Arena')).toBeInTheDocument()
      expect(screen.getByText('Agent')).toBeInTheDocument()
      expect(screen.getByText('Reports')).toBeInTheDocument()
    })

    it('renders More button', () => {
      render(<BottomNav />)
      expect(screen.getByLabelText(/more navigation options/i)).toBeInTheDocument()
      expect(screen.getByText('More')).toBeInTheDocument()
    })

    it('has correct links for main nav items', () => {
      render(<BottomNav />)

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
      const arenaLink = screen.getByRole('link', { name: /arena/i })
      const agentLink = screen.getByRole('link', { name: /agent/i })
      const reportsLink = screen.getByRole('link', { name: /reports/i })

      expect(dashboardLink).toHaveAttribute('href', '/dashboard')
      expect(arenaLink).toHaveAttribute('href', '/arena')
      expect(agentLink).toHaveAttribute('href', '/agent/connect')
      expect(reportsLink).toHaveAttribute('href', '/reports')
    })
  })

  // ============================================================================
  // Active State
  // ============================================================================
  describe('active state', () => {
    it('highlights Dashboard when on dashboard route', () => {
      mockPathname.mockReturnValue('/dashboard')
      render(<BottomNav />)

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
      expect(dashboardLink).toHaveAttribute('aria-current', 'page')
    })

    it('highlights Dashboard when on root route', () => {
      mockPathname.mockReturnValue('/')
      render(<BottomNav />)

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
      expect(dashboardLink).toHaveAttribute('aria-current', 'page')
    })

    it('highlights Arena when on arena route', () => {
      mockPathname.mockReturnValue('/arena')
      render(<BottomNav />)

      const arenaLink = screen.getByRole('link', { name: /arena/i })
      expect(arenaLink).toHaveAttribute('aria-current', 'page')
    })

    it('highlights Agent when on any agent route', () => {
      mockPathname.mockReturnValue('/agent/connect')
      render(<BottomNav />)

      const agentLink = screen.getByRole('link', { name: /agent/i })
      expect(agentLink).toHaveAttribute('aria-current', 'page')
    })

    it('highlights Agent when on agent/monitor route', () => {
      mockPathname.mockReturnValue('/agent/monitor')
      render(<BottomNav />)

      const agentLink = screen.getByRole('link', { name: /agent/i })
      expect(agentLink).toHaveAttribute('aria-current', 'page')
    })

    it('highlights Agent when on agent/attack route', () => {
      mockPathname.mockReturnValue('/agent/attack')
      render(<BottomNav />)

      const agentLink = screen.getByRole('link', { name: /agent/i })
      expect(agentLink).toHaveAttribute('aria-current', 'page')
    })

    it('highlights Reports when on reports route', () => {
      mockPathname.mockReturnValue('/reports')
      render(<BottomNav />)

      const reportsLink = screen.getByRole('link', { name: /reports/i })
      expect(reportsLink).toHaveAttribute('aria-current', 'page')
    })

    it('does not highlight items when no match', () => {
      mockPathname.mockReturnValue('/settings')
      render(<BottomNav />)

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i })
      const arenaLink = screen.getByRole('link', { name: /arena/i })

      expect(dashboardLink).not.toHaveAttribute('aria-current')
      expect(arenaLink).not.toHaveAttribute('aria-current')
    })
  })

  // ============================================================================
  // More Menu
  // ============================================================================
  describe('more menu', () => {
    it('opens more menu when More button is clicked', async () => {
      render(<BottomNav />)

      const moreButton = screen.getByLabelText(/more navigation options/i)
      fireEvent.click(moreButton)

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      expect(screen.getByText('More Options')).toBeInTheDocument()
    })

    it('shows additional navigation items in more menu', async () => {
      render(<BottomNav />)

      const moreButton = screen.getByLabelText(/more navigation options/i)
      fireEvent.click(moreButton)

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Note: Agent Connect is NOT in more menu (accessible via main Agent tab)
      expect(screen.getByRole('link', { name: /agent monitor/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /agent attack/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /agent results/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
    })

    it('has correct aria-expanded state on More button', async () => {
      render(<BottomNav />)

      const moreButton = screen.getByLabelText(/more navigation options/i)
      expect(moreButton).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(moreButton)

      await waitFor(() => {
        expect(moreButton).toHaveAttribute('aria-expanded', 'true')
      })
    })

    it('has correct aria-haspopup attribute', () => {
      render(<BottomNav />)

      const moreButton = screen.getByLabelText(/more navigation options/i)
      expect(moreButton).toHaveAttribute('aria-haspopup', 'dialog')
    })

    it('can close more menu by clicking trigger again', async () => {
      render(<BottomNav />)

      const moreButton = screen.getByLabelText(/more navigation options/i)

      // Open
      fireEvent.click(moreButton)
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Close by clicking the close button (Sheet provides this)
      const closeButton = screen.getByRole('button', { name: /close/i })
      fireEvent.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // Accessibility
  // ============================================================================
  describe('accessibility', () => {
    it('has proper navigation role and label', () => {
      render(<BottomNav />)

      const nav = screen.getByRole('navigation')
      expect(nav).toHaveAttribute('aria-label', 'Bottom navigation')
    })

    it('all nav items are focusable', () => {
      render(<BottomNav />)

      const navItems = screen.getAllByRole('link')
      navItems.forEach((item) => {
        expect(item.tabIndex).not.toBe(-1)
      })
    })

    it('icons are hidden from screen readers', () => {
      render(<BottomNav />)

      // The icons should have aria-hidden="true"
      const icons = document.querySelectorAll('[aria-hidden="true"]')
      expect(icons.length).toBeGreaterThan(0)
    })

    it('more menu has accessible description', async () => {
      render(<BottomNav />)

      const moreButton = screen.getByLabelText(/more navigation options/i)
      fireEvent.click(moreButton)

      await waitFor(() => {
        const description = screen.getByText(/additional navigation options/i)
        expect(description).toBeInTheDocument()
      })
    })

    it('nav items have minimum touch target size (min-h-[44px])', () => {
      render(<BottomNav />)

      const navLinks = screen.getAllByRole('link')
      navLinks.forEach((link) => {
        expect(link.className).toContain('min-h-[44px]')
      })
    })

    it('nav items have minimum width for touch targets (min-w-[64px])', () => {
      render(<BottomNav />)

      const navLinks = screen.getAllByRole('link')
      navLinks.forEach((link) => {
        expect(link.className).toContain('min-w-[64px]')
      })
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('handles nested routes correctly', () => {
      mockPathname.mockReturnValue('/arena/run-123')
      render(<BottomNav />)

      const arenaLink = screen.getByRole('link', { name: /arena/i })
      expect(arenaLink).toHaveAttribute('aria-current', 'page')
    })

    it('handles reports sub-routes', () => {
      mockPathname.mockReturnValue('/reports/report-123')
      render(<BottomNav />)

      const reportsLink = screen.getByRole('link', { name: /reports/i })
      expect(reportsLink).toHaveAttribute('aria-current', 'page')
    })
  })
})
