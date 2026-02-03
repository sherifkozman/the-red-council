'use client'

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X, Trophy } from 'lucide-react'

import { useOnboardingStore } from '@/stores/onboarding'
import { useTestingModeStore } from '@/stores/testingMode'
import { GUIDE_STEPS } from '@/data/guide-steps'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

interface ProgressIndicatorProps {
  isSidebarCollapsed?: boolean
  className?: string
}

export function ProgressIndicator({ isSidebarCollapsed, className }: ProgressIndicatorProps) {
  const mode = useTestingModeStore((state) => state.mode)
  const { 
    completedSteps, 
    isDismissed, 
    dismissProgress, 
    _hasHydrated 
  } = useOnboardingStore()
  
  const [isOpen, setIsOpen] = React.useState(true)

  // Don't render until hydrated to prevent mismatch
  if (!_hasHydrated) return null
  if (isDismissed) return null

  const steps = React.useMemo(() => GUIDE_STEPS[mode] || [], [mode])
  const modeCompletedSteps = completedSteps[mode] || {}
  
  const { completedCount, totalCount, progress, isComplete } = React.useMemo(() => {
    const completed = steps.filter(step => modeCompletedSteps[step.id]).length
    const total = steps.length
    const prog = total === 0 ? 0 : (completed / total) * 100
    
    return {
        completedCount: completed,
        totalCount: total,
        progress: prog,
        isComplete: total > 0 && completed === total
    }
  }, [steps, modeCompletedSteps])
  
  if (totalCount === 0) return null

  // Collapsed sidebar view - minimal indicator
  if (isSidebarCollapsed) {
     return (
        <div 
          className={cn("px-2 py-4 border-t mt-auto", className)}
          role="complementary"
          aria-label="Onboarding Progress (Collapsed)"
        >
            <div 
              className="h-1 w-full bg-secondary rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Onboarding progress: ${Math.round(progress)}% complete`}
            >
                <div 
                    className="h-full bg-primary transition-all duration-500" 
                    style={{ width: `${progress}%` }} 
                />
            </div>
        </div>
     )
  }

  // Expanded sidebar view - full detail
  return (
    <div 
      className={cn("border-t p-4 space-y-3 bg-card/50 mt-auto", className)}
      role="complementary"
      aria-label="Onboarding Progress"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">
            {isComplete ? "Onboarding Complete!" : "Setup Progress"}
        </h3>
        <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-muted-foreground hover:text-foreground" 
            onClick={dismissProgress}
            aria-label="Dismiss onboarding progress"
        >
            <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
            <span id="progress-label">{Math.round(progress)}% Complete</span>
            <span>{completedCount}/{totalCount} Steps</span>
        </div>
        <Progress 
            value={progress} 
            className="h-2" 
            aria-label={`Onboarding progress: ${Math.round(progress)}% complete, ${completedCount} of ${totalCount} steps`} 
        />
      </div>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-between p-0 h-auto hover:bg-transparent text-xs text-muted-foreground mt-2"
              aria-expanded={isOpen}
            >
                <span>{isOpen ? "Hide Steps" : "Show Steps"}</span>
                {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 mt-2">
            {steps.map((step) => {
                const isStepComplete = !!modeCompletedSteps[step.id]
                const content = (
                    <>
                        {isStepComplete ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" aria-hidden="true" />
                        ) : (
                            <Circle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        )}
                        <span className={cn(isStepComplete && "line-through")}>
                            {step.title}
                        </span>
                    </>
                )
                
                const commonClasses = cn(
                    "flex items-start gap-2 text-xs p-1.5 rounded-md transition-colors w-full text-left",
                    isStepComplete ? "text-muted-foreground" : "text-foreground"
                )

                if (step.href) {
                    return (
                        <Link
                            key={step.id}
                            href={step.href}
                            className={cn(commonClasses, "hover:bg-accent/50 focus:outline-none focus:bg-accent")}
                        >
                            {content}
                        </Link>
                    )
                }

                return (
                    <div
                        key={step.id} 
                        className={cn(commonClasses, "cursor-default opacity-80")}
                    >
                        {content}
                    </div>
                )
            })}
        </CollapsibleContent>
      </Collapsible>
      
      {isComplete && (
          <div 
            className="flex items-center gap-2 p-2 bg-green-500/10 text-green-600 rounded-md text-xs animate-in fade-in slide-in-from-bottom-2"
            role="status"
          >
              <Trophy className="h-4 w-4" aria-hidden="true" />
              <span>You're all set!</span>
          </div>
      )}
    </div>
  )
}
