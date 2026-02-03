'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp, Rocket, CheckCircle2 } from 'lucide-react'
import { useTestingModeStore } from '@/stores/testingMode'
import { useOnboardingStore } from '@/stores/onboarding'
import { GUIDE_STEPS } from '@/data/guide-steps'
import { GuideStep } from './GuideStep'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { cn } from '@/lib/utils'
import { isTestingMode } from '@/stores/testingMode'

function GuideContent() {
  const mode = useTestingModeStore((state) => state.mode)
  const completedSteps = useOnboardingStore((state) => state.completedSteps)
  const isMinimized = useOnboardingStore((state) => state.isMinimized)
  const setStepCompleted = useOnboardingStore((state) => state.setStepCompleted)
  const setIsMinimized = useOnboardingStore((state) => state.setIsMinimized)
  const hasHydrated = useOnboardingStore((state) => state._hasHydrated)
  
  const steps = React.useMemo(() => {
    try {
      if (!isTestingMode(mode)) {
        return []
      }
      return GUIDE_STEPS[mode] || []
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to get guide steps for mode:', mode, e)
      }
      return []
    }
  }, [mode])
  
  const modeCompleted = completedSteps[mode] || {}
  
  const completedCount = React.useMemo(() => 
    steps.filter((step) => modeCompleted[step.id]).length,
    [steps, modeCompleted]
  )
  
  const progress = React.useMemo(() => 
    steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0,
    [steps.length, completedCount]
  )
  
  const isAllCompleted = steps.length > 0 && completedCount === steps.length

  const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    // Only handle if it's a click or a matching keydown
    if (e.type === 'keydown') {
      const keyEvent = e as React.KeyboardEvent
      if (!['Enter', ' '].includes(keyEvent.key)) {
        return
      }
    }
    
    e.preventDefault()
    setIsMinimized(!isMinimized)
  }

  // Prevent flash of initialState before hydration
  if (!hasHydrated || steps.length === 0) return null

  const displayMode = mode === 'demo-mode' ? 'Demo Mode' : mode.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')

  return (
    <Card 
      className={cn(
        "fixed bottom-4 right-4 w-80 shadow-lg transition-all duration-300 z-50 overflow-hidden",
        isMinimized ? "h-14" : "h-auto max-h-[80vh]"
      )}
      role="complementary"
      aria-labelledby="quick-start-guide-title"
    >
      <div 
        className="p-3 flex flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/50 transition-colors focus-within:ring-2 focus-within:ring-ring"
        onClick={handleToggle}
      >
        <div className="flex items-center space-x-2">
          {isAllCompleted ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden="true" />
          ) : (
            <Rocket className="h-5 w-5 text-primary" aria-hidden="true" />
          )}
          <div>
            <CardTitle id="quick-start-guide-title" className="text-sm font-bold">Quick Start Guide</CardTitle>
            {isMinimized && (
              <CardDescription className="text-[10px] leading-none">
                {completedCount}/{steps.length} steps completed
              </CardDescription>
            )}
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation()
            setIsMinimized(!isMinimized)
          }}
          aria-expanded={!isMinimized}
          aria-controls="quick-start-guide-content"
          aria-label={isMinimized ? "Expand guide" : "Collapse guide"}
        >
          {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
      
      {!isMinimized && (
        <>
          <CardContent 
            id="quick-start-guide-content"
            className="p-3 pt-0 overflow-y-auto max-h-[60vh]"
          >
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs mb-1">
                <span>Overall Progress</span>
                <span aria-live="polite" aria-atomic="true" aria-label={`${progress} percent complete`}>
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="h-1" aria-hidden="true" />
            </div>
            
            <div className="space-y-1">
              {steps.map((step) => (
                <GuideStep
                  key={step.id}
                  id={step.id}
                  title={step.title}
                  description={step.description}
                  isCompleted={!!modeCompleted[step.id]}
                  onToggle={(completed) => setStepCompleted(mode, step.id, completed)}
                />
              ))}
            </div>
          </CardContent>
          {isAllCompleted && (
            <div className="p-3 pt-0 text-center" aria-live="polite">
              <p className="text-sm font-medium text-green-600 bg-green-500/10 p-2 rounded border border-green-500/20">
                Congratulations! You've completed all steps for {displayMode}.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

export function QuickStartGuide() {
  return (
    <ErrorBoundary>
      <GuideContent />
    </ErrorBoundary>
  )
}
