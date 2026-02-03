'use client'

import { useDashboardStats } from "@/hooks/useDashboardStats"
import { StatsCards } from "@/components/dashboard/StatsCards"
import { RecentActivityList } from "@/components/dashboard/RecentActivity"
import { Button } from "@/components/ui/button"
import { useTestingModeStore, TestingMode } from "@/stores/testingMode"
import { useRouter } from "next/navigation"
import { Bot, Sword, PlayCircle, AlertCircle } from "lucide-react"
import { useState } from "react"

export default function DashboardPage() {
  const { mode, setMode } = useTestingModeStore()
  const { data, isLoading, error } = useDashboardStats(mode)
  const router = useRouter()
  const [isNavigating, setIsNavigating] = useState(false)

  const handleQuickAction = async (newMode: TestingMode, path: string) => {
    setIsNavigating(true)
    try {
        setMode(newMode)
        // Small delay to allow store update to propagate
        await new Promise(resolve => setTimeout(resolve, 50)) 
        router.push(path)
    } catch (e) {
        console.error('Navigation failed', e)
    } finally {
        setIsNavigating(false)
    }
  }

  const hasError = !!error

  return (
    <div className="space-y-8">
      <section className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to The Red Council. Select a mode to begin testing.
          </p>
        </div>
      </section>

      {hasError && (
         <div className="p-4 border border-red-200 bg-red-50 rounded-md flex items-center text-red-700" role="alert">
            <AlertCircle className="h-5 w-5 mr-2" aria-hidden="true" />
            <span>Failed to load dashboard statistics. Quick actions are still available.</span>
         </div>
      )}

      <StatsCards stats={data?.stats} isLoading={isLoading} isError={hasError} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <RecentActivityList activities={data?.activities} isLoading={isLoading && !hasError} isError={hasError} />
        
        <div className="col-span-3 lg:col-span-4 grid gap-4">
             <div className="grid gap-4 md:grid-cols-2">
                <Button 
                    variant="outline" 
                    className="h-32 flex flex-col items-center justify-center space-y-2 border-2 hover:border-primary/50 hover:bg-accent transition-all"
                    onClick={() => handleQuickAction('llm-testing', '/arena')}
                    disabled={isNavigating}
                    aria-describedby="llm-desc"
                >
                    <Sword className="h-8 w-8 mb-2" aria-hidden="true" />
                    <span className="font-semibold text-lg">LLM Testing</span>
                    <span id="llm-desc" className="text-xs text-muted-foreground text-center px-4">
                        Battle arena for adversarial LLM testing
                    </span>
                </Button>

                <Button 
                    variant="outline" 
                    className="h-32 flex flex-col items-center justify-center space-y-2 border-2 hover:border-primary/50 hover:bg-accent transition-all"
                    onClick={() => handleQuickAction('agent-testing', '/agent/connect')}
                    disabled={isNavigating}
                    aria-describedby="agent-desc"
                >
                    <Bot className="h-8 w-8 mb-2" aria-hidden="true" />
                    <span className="font-semibold text-lg">Agent Testing</span>
                    <span id="agent-desc" className="text-xs text-muted-foreground text-center px-4">
                        Test remote agents with OWASP framework
                    </span>
                </Button>

                <Button 
                    variant="outline" 
                    className="h-32 flex flex-col items-center justify-center space-y-2 border-2 hover:border-primary/50 hover:bg-accent transition-all md:col-span-2"
                    onClick={() => handleQuickAction('demo-mode', '/dashboard')}
                    disabled={isNavigating}
                    aria-describedby="demo-desc"
                >
                    <PlayCircle className="h-8 w-8 mb-2" aria-hidden="true" />
                    <span className="font-semibold text-lg">Try Demo Mode</span>
                    <span id="demo-desc" className="text-xs text-muted-foreground text-center px-4">
                        Explore with pre-loaded data (no setup required)
                    </span>
                </Button>
            </div>
        </div>
      </div>
    </div>
  )
}
