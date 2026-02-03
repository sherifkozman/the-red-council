import { TestingMode } from "@/stores/testingMode"

export interface DashboardStats {
  activeSessions: number
  campaignsRun: number
  reportsGenerated: number
  vulnerabilitiesFound: number
  apiStatus: 'healthy' | 'degraded' | 'down'
  lastUpdated: string
}

export interface RecentActivity {
  id: string
  type: 'session' | 'campaign' | 'report' | 'vulnerability'
  title: string
  description: string
  timestamp: string
  user: string
}

export interface DashboardData {
  stats: DashboardStats
  activities: RecentActivity[]
}

// Mock data generator
const getMockData = (mode: TestingMode): DashboardData => {
  const isDemo = mode === 'demo-mode'
  
  return {
    stats: {
      activeSessions: isDemo ? 5 : 0,
      campaignsRun: isDemo ? 12 : 0,
      reportsGenerated: isDemo ? 8 : 0,
      vulnerabilitiesFound: isDemo ? 24 : 0,
      apiStatus: 'healthy',
      lastUpdated: new Date().toISOString()
    },
    activities: isDemo ? [
      {
        id: '1',
        type: 'session',
        title: 'Demo Session',
        description: 'Agent testing session initialized',
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
        user: 'Demo User'
      },
      {
        id: '2',
        type: 'vulnerability',
        title: 'Critical Vulnerability Detected',
        description: 'ASI01: Tool Usage Policy Violation',
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
        user: 'Automated'
      },
      {
        id: '3',
        type: 'campaign',
        title: 'Campaign Completed',
        description: 'OWASP Top 10 Baseline Campaign',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
        user: 'Demo User'
      }
    ] : []
  }
}

export async function fetchDashboardStats(mode: TestingMode = 'llm-testing'): Promise<DashboardData> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800))
  return getMockData(mode)
}
