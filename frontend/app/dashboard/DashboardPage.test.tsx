import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DashboardPage from './page'

// Mock dependencies
const mockPush = vi.fn()
const mockSetMode = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush
  })
}))

vi.mock('@/stores/testingMode', () => ({
  useTestingModeStore: () => ({
    setMode: mockSetMode,
    mode: 'llm-testing'
  })
}))

// Mock custom hooks
vi.mock('@/hooks/useDashboardStats', () => ({
  useDashboardStats: () => ({
    data: {
      stats: {
        activeSessions: 1,
        campaignsRun: 2,
        reportsGenerated: 3,
        vulnerabilitiesFound: 0,
        apiStatus: 'healthy',
        lastUpdated: new Date().toISOString()
      },
      activities: []
    },
    isLoading: false,
    error: null
  })
}))

describe('DashboardPage', () => {
  it('renders dashboard content', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Active Sessions')).toBeInTheDocument()
    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
  })

  it('handles LLM Testing quick action', async () => {
    render(<DashboardPage />)
    const button = screen.getByText('LLM Testing')
    fireEvent.click(button)
    
    expect(mockSetMode).toHaveBeenCalledWith('llm-testing')
    await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/arena')
    })
  })

  it('handles Agent Testing quick action', async () => {
    render(<DashboardPage />)
    const button = screen.getByText('Agent Testing')
    fireEvent.click(button)
    
    expect(mockSetMode).toHaveBeenCalledWith('agent-testing')
    await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/agent/connect')
    })
  })

  it('handles Demo Mode quick action', async () => {
    render(<DashboardPage />)
    const button = screen.getByText('Try Demo Mode')
    fireEvent.click(button)
    
    expect(mockSetMode).toHaveBeenCalledWith('demo-mode')
    await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })
})
