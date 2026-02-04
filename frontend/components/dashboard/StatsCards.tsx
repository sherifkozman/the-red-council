import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity, Shield, FileText, Zap, Server, AlertCircle, Target, TrendingUp } from "lucide-react"
import { DashboardStats } from "@/lib/api/dashboard"

interface StatsCardsProps {
  stats?: DashboardStats
  isLoading: boolean
  isError?: boolean
}

export function StatsCards({ stats, isLoading, isError }: StatsCardsProps) {
  const items = useMemo(() => {
    if (!stats) return []
    return [
      {
        title: "Attack Attempts",
        value: stats.totalAttempts,
        icon: Target,
        description: "Total adversarial prompts tested",
      },
      {
        title: "Breaches Detected",
        value: stats.totalBreaches,
        icon: Shield,
        description: "Jailbreaks and policy violations",
        alert: stats.totalBreaches > 0
      },
      {
        title: "Success Rate",
        value: `${stats.successRate}%`,
        icon: TrendingUp,
        description: "Defense effectiveness",
      },
      {
        title: "Campaigns Run",
        value: stats.campaignsRun,
        icon: Zap,
        description: "Total battles executed",
      },
    ]
  }, [stats])

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading statistics">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <Skeleton className="h-4 w-[100px]" />
              </CardTitle>
              <Skeleton className="h-4 w-4 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-[60px] mb-1" />
              <Skeleton className="h-3 w-[120px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isError) {
      return (
        <div className="p-4 border border-red-200 bg-red-50 rounded-md flex items-center text-red-700" role="alert">
            <AlertCircle className="h-5 w-5 mr-2" aria-hidden="true" />
            <span>Failed to load statistics.</span>
        </div>
      )
  }

  if (!stats) {
    return (
        <div className="p-4 text-center text-muted-foreground border rounded-md">
            No statistics available.
        </div>
    )
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 m-0 p-0 list-none">
        {items.map((item) => (
          <li key={item.title}>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    {item.title}
                </CardTitle>
                <item.icon 
                    className={`h-4 w-4 text-muted-foreground ${item.alert ? 'text-red-600' : ''}`} 
                    aria-hidden="true"
                />
                </CardHeader>
                <CardContent>
                <div className="text-2xl font-bold" aria-live="polite" aria-atomic="true">{item.value}</div>
                <p className="text-xs text-muted-foreground">
                    {item.description}
                </p>
                </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      
      {/* System Status Indicator */}
      <div className="flex items-center space-x-2 text-sm text-muted-foreground px-1">
        <Server className="h-4 w-4" aria-hidden="true" />
        <span>System Status: </span>
        <span className={`font-medium ${
          stats.apiStatus === 'healthy' ? 'text-green-700' : 
          stats.apiStatus === 'degraded' ? 'text-yellow-700' : 'text-red-700'
        }`}>
          {stats.apiStatus.toUpperCase()}
        </span>
        <span className="text-xs ml-auto">
            Last updated: <time dateTime={stats.lastUpdated}>{new Intl.DateTimeFormat('default', { hour: 'numeric', minute: 'numeric', second: 'numeric' }).format(new Date(stats.lastUpdated))}</time>
        </span>
      </div>
    </div>
  )
}
