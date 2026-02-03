import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats, DashboardData } from '@/lib/api/dashboard'
import { TestingMode } from '@/stores/testingMode'

export function useDashboardStats(mode: TestingMode) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard-stats', mode],
    queryFn: () => fetchDashboardStats(mode),
  })
}
