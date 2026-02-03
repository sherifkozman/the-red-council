import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
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
        // Since MobileNav is also rendered but hidden (or trigger visible), 
        // Sidebar's Dashboard link is always in DOM.
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
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
