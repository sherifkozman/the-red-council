import { TestingMode } from "@/stores/testingMode"
import { useBattleHistoryStore } from "@/stores/battleHistory"

export interface DashboardStats {
  activeSessions: number
  campaignsRun: number
  reportsGenerated: number
  vulnerabilitiesFound: number
  totalAttempts: number
  totalBreaches: number
  successRate: number
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

// Get real data from battle history store + mock demo data
const getData = (mode: TestingMode): DashboardData => {
  const isDemo = mode === 'demo-mode'

  // Get real stats from battle history (client-side store)
  // Note: This will be called from a hook context where store is available
  const battleHistory = useBattleHistoryStore.getState()
  const realStats = battleHistory.stats
  const battles = battleHistory.battles

  // Build activities from real battle history
  const realActivities: RecentActivity[] = battles.slice(0, 5).map((battle, idx) => ({
    id: battle.id,
    type: battle.result === 'vulnerable' ? 'vulnerability' : 'campaign',
    title: battle.title,
    description: battle.result === 'vulnerable'
      ? `Breach detected - ${battle.breachCount} vulnerabilities found`
      : `${battle.totalRounds} rounds completed - ${battle.successRate}% success`,
    timestamp: battle.completedAt || battle.createdAt,
    user: 'Local User'
  }))

  // Demo mode shows enhanced mock data
  const demoActivities: RecentActivity[] = [
    {
      id: '1',
      type: 'session',
      title: 'Demo Session',
      description: 'Agent testing session initialized',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      user: 'Demo User'
    },
    {
      id: '2',
      type: 'vulnerability',
      title: 'Critical Vulnerability Detected',
      description: 'ASI01: Tool Usage Policy Violation',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      user: 'Automated'
    },
    {
      id: '3',
      type: 'campaign',
      title: 'Campaign Completed',
      description: 'OWASP Top 10 Baseline Campaign',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      user: 'Demo User'
    }
  ]

  return {
    stats: {
      activeSessions: isDemo ? 5 : battles.filter(b => b.status === 'in_progress').length,
      campaignsRun: isDemo ? 12 : battles.length,
      reportsGenerated: isDemo ? 8 : battles.filter(b => b.status === 'completed').length,
      vulnerabilitiesFound: isDemo ? 24 : realStats.totalBreaches,
      totalAttempts: isDemo ? 48 : realStats.totalAttempts,
      totalBreaches: isDemo ? 24 : realStats.totalBreaches,
      successRate: isDemo ? 50 : realStats.successRate,
      apiStatus: 'healthy',
      lastUpdated: realStats.lastUpdated || new Date().toISOString()
    },
    activities: isDemo ? demoActivities : realActivities
  }
}

export async function fetchDashboardStats(mode: TestingMode = 'llm-testing'): Promise<DashboardData> {
  // Small delay for UI feedback
  await new Promise(resolve => setTimeout(resolve, 100))
  return getData(mode)
}
