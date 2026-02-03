import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatsCards } from './StatsCards'
import { DashboardStats } from '@/lib/api/dashboard'

const mockStats: DashboardStats = {
  activeSessions: 5,
  campaignsRun: 10,
  reportsGenerated: 3,
  vulnerabilitiesFound: 1,
  apiStatus: 'healthy',
  lastUpdated: new Date().toISOString()
}

describe('StatsCards', () => {
  it('renders loading skeletons', () => {
    render(<StatsCards isLoading={true} stats={undefined} />)
    // Skeletons don't have text, but we can check for structure or class
    // Or just ensure no real content is shown
    expect(screen.queryByText('Active Sessions')).not.toBeInTheDocument()
  })

  it('renders stats correctly', () => {
    render(<StatsCards isLoading={false} stats={mockStats} />)
    
    expect(screen.getByText('Active Sessions')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    
    expect(screen.getByText('Campaigns Run')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    
    expect(screen.getByText('Vulnerabilities')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()

    expect(screen.getByText('System Status:')).toBeInTheDocument()
    expect(screen.getByText('HEALTHY')).toBeInTheDocument()
  })

  it('renders no statistics message if not loading and no stats', () => {
    render(<StatsCards isLoading={false} stats={undefined} />)
    expect(screen.getByText('No statistics available.')).toBeInTheDocument()
  })
})
