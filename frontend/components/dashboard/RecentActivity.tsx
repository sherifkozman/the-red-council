import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Activity, Shield, FileText, Zap } from "lucide-react"
import { RecentActivity } from "@/lib/api/dashboard"
import { cn } from "@/lib/utils"

interface RecentActivityListProps {
  activities?: RecentActivity[]
  isLoading: boolean
  isError?: boolean
}

export function RecentActivityList({ activities, isLoading, isError }: RecentActivityListProps) {
  if (isLoading) {
    return (
      <Card className="col-span-3">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-8" aria-busy="true" aria-label="Loading recent activity">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="ml-4 space-y-1">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-3 w-[150px]" />
                </div>
                <div className="ml-auto">
                  <Skeleton className="h-3 w-[80px]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
      return (
        <Card className="col-span-3">
            <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="text-center text-red-600 py-8" role="alert">
                Failed to load recent activity.
            </div>
            </CardContent>
        </Card>
      )
  }

  const getIcon = (type: RecentActivity['type']) => {
    switch (type) {
      case 'session': return Activity
      case 'campaign': return Zap
      case 'report': return FileText
      case 'vulnerability': return Shield
      default: return Activity
    }
  }

  const getIconColor = (type: RecentActivity['type']) => {
    switch (type) {
      case 'session': return 'text-blue-600'
      case 'campaign': return 'text-orange-600'
      case 'report': return 'text-green-600'
      case 'vulnerability': return 'text-red-600'
      default: return 'text-gray-500'
    }
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
        return 'Unknown'
    }
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
        return new Intl.DateTimeFormat('default', { hour: 'numeric', minute: 'numeric' }).format(date)
    } else if (days < 7) {
        return `${days}d ago`
    } else {
        return new Intl.DateTimeFormat('default', { month: 'short', day: 'numeric' }).format(date)
    }
  }

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <ul className="space-y-8 list-none m-0 p-0">
            {activities?.map((activity) => {
              const Icon = getIcon(activity.type)
              return (
                <li key={activity.id} className="flex items-center">
                  <div className={cn("flex h-9 w-9 items-center justify-center rounded-full border bg-background", getIconColor(activity.type))}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{activity.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.description}
                    </p>
                  </div>
                  <div className="ml-auto font-medium text-xs text-muted-foreground">
                    <time dateTime={activity.timestamp} title={new Date(activity.timestamp).toLocaleString()}>
                        {formatDate(activity.timestamp)}
                    </time>
                  </div>
                </li>
              )
            })}
            {(!activities || activities.length === 0) && (
              <li className="text-center text-muted-foreground py-8">
                No recent activity
              </li>
            )}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
