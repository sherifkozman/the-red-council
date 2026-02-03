import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { RecentActivityList } from './RecentActivity'
import { RecentActivity } from '@/lib/api/dashboard'

const mockActivities: RecentActivity[] = [
  {
    id: '1',
    type: 'session',
    title: 'Test Session',
    description: 'Description',
    timestamp: new Date().toISOString(),
    user: 'User'
  },
  {
    id: '2',
    type: 'campaign',
    title: 'Campaign',
    description: 'Desc',
    timestamp: new Date().toISOString(),
    user: 'User'
  },
  {
    id: '3',
    type: 'report',
    title: 'Report',
    description: 'Desc',
    timestamp: new Date().toISOString(),
    user: 'User'
  },
  {
    id: '4',
    type: 'vulnerability',
    title: 'Vuln',
    description: 'Desc',
    timestamp: new Date().toISOString(),
    user: 'User'
  },
  {
    id: '5',
    type: 'unknown' as any, // Test default case
    title: 'Unknown',
    description: 'Desc',
    timestamp: new Date().toISOString(),
    user: 'User'
  }
]

describe('RecentActivityList', () => {
  it('renders loading state', () => {
    render(<RecentActivityList isLoading={true} activities={undefined} />)
    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    // Skeleton checks are tricky, but we can verify list items aren't there
    expect(screen.queryByText('Test Session')).not.toBeInTheDocument()
  })

  it('renders activities', () => {
    render(<RecentActivityList isLoading={false} activities={mockActivities} />)
    expect(screen.getByText('Test Session')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('renders empty state', () => {
    render(<RecentActivityList isLoading={false} activities={[]} />)
    expect(screen.getByText('No recent activity')).toBeInTheDocument()
  })
})
