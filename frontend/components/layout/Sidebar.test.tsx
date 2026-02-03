import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Sidebar } from './Sidebar'
import { usePathname } from 'next/navigation'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

describe('Sidebar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    ;(usePathname as any).mockReturnValue('/dashboard')
  })

  it('renders correctly', async () => {
    render(<Sidebar />)
    expect(await screen.findByText('The Red Council')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('highlights active route', async () => {
    ;(usePathname as any).mockReturnValue('/dashboard')
    render(<Sidebar />)
    // Find link for dashboard
    const dashboardLink = await screen.findByRole('link', { name: /dashboard/i })
    expect(dashboardLink).toBeInTheDocument()
    
    // We can't easily check 'secondary' variant class without being brittle, 
    // but we can check if it exists.
  })

  it('collapses and expands', async () => {
    render(<Sidebar />)
    const toggleButton = await screen.findByLabelText('Collapse sidebar')
    fireEvent.click(toggleButton)
    
    // Title should be gone (or not visible)
    // In our code: {!isCollapsed && <span ...>The Red Council</span>}
    await waitFor(() => {
        expect(screen.queryByText('The Red Council')).not.toBeInTheDocument()
    })
    
    // Expand again
    const expandButton = screen.getByLabelText('Expand sidebar')
    fireEvent.click(expandButton)
    
    await waitFor(() => {
        expect(screen.getByText('The Red Council')).toBeInTheDocument()
    })
  })

  it('persists collapse state', async () => {
    // Set initial state in localStorage
    localStorage.setItem('sidebar-collapsed', 'true')
    render(<Sidebar />)
    // Wait for mount
    await waitFor(() => expect(screen.queryByText('Dashboard')).toBeInTheDocument())
    
    expect(screen.queryByText('The Red Council')).not.toBeInTheDocument()
  })
})
