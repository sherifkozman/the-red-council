import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}))

import { usePathname } from 'next/navigation'

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('AppShell', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        ;(usePathname as any).mockReturnValue('/dashboard')
    })
    it('renders sidebar content', () => {
        render(
            <AppShell>
                <div>Content</div>
            </AppShell>
        )
        // Check for Sidebar content (Dashboard link)
        // Now both Sidebar and BottomNav render "Dashboard", so use getAllByText
        const dashboardElements = screen.getAllByText('Dashboard')
        expect(dashboardElements.length).toBeGreaterThanOrEqual(1)
    })

    it('renders children content', () => {
        render(
            <AppShell>
                <div>Unique Content</div>
            </AppShell>
        )
        expect(screen.getByText('Unique Content')).toBeInTheDocument()
    })
})
