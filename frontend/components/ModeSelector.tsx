'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTestingModeStore, TestingMode, isTestingMode } from '@/stores/testingMode'
import { cn } from '@/lib/utils'

interface ModeSelectorProps {
  className?: string
}

const MODE_ROUTES: Record<TestingMode, string> = {
  'llm-testing': '/arena',
  'agent-testing': '/agent',
  'demo-mode': '/dashboard',
}

const MODE_LABELS: Record<TestingMode, string> = {
  'llm-testing': 'LLM Testing',
  'agent-testing': 'Agent Testing',
  'demo-mode': 'Demo Mode',
}

function ModeSelectorContent({ className }: ModeSelectorProps) {
  const router = useRouter()
  const { mode, setMode, hasUnsavedChanges } = useTestingModeStore()
  const [pendingMode, setPendingMode] = React.useState<TestingMode | null>(null)
  const [isAlertOpen, setIsAlertOpen] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()

  // Hydration fix
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleModeChange = (value: string) => {
    if (!isTestingMode(value)) return
    
    const newMode = value as TestingMode
    
    if (newMode === mode) return

    if (hasUnsavedChanges) {
      setPendingMode(newMode)
      setIsAlertOpen(true)
    } else {
      changeMode(newMode)
    }
  }

  const changeMode = (newMode: TestingMode) => {
    setMode(newMode)
    const route = MODE_ROUTES[newMode]
    if (route) {
      startTransition(() => {
        router.push(route)
      })
    }
  }

  const confirmChange = () => {
    if (pendingMode) {
      changeMode(pendingMode)
    }
    setIsAlertOpen(false)
    setPendingMode(null)
  }
  
  const handleOpenChange = (open: boolean) => {
    setIsAlertOpen(open)
    if (!open) {
      setPendingMode(null)
    }
  }

  if (!mounted) {
    return (
      <div className={cn('flex items-center', className)}>
         <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <>
      <div 
        className={cn('flex items-center', className)}
        role="navigation" 
        aria-label="Testing Mode Selection"
      >
        <div aria-live="polite" className="sr-only">
          {mounted ? `Current mode: ${MODE_LABELS[mode]}` : ''}
        </div>
        <Tabs value={mode} onValueChange={handleModeChange}>
          <TabsList className="grid w-full grid-cols-3" aria-busy={isPending}>
            <TabsTrigger 
              value="llm-testing" 
              data-testid="mode-llm"
              disabled={isPending}
            >
              LLM Testing
            </TabsTrigger>
            <TabsTrigger 
              value="agent-testing" 
              data-testid="mode-agent"
              disabled={isPending}
            >
              Agent Testing
            </TabsTrigger>
            <TabsTrigger 
              value="demo-mode" 
              data-testid="mode-demo"
              disabled={isPending}
            >
              Demo Mode
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <AlertDialog open={isAlertOpen} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in your current <strong>{MODE_LABELS[mode]}</strong> session. Switching modes may result in losing this data. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmChange}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function ModeSelector(props: ModeSelectorProps) {
  return (
    <ErrorBoundary>
      <ModeSelectorContent {...props} />
    </ErrorBoundary>
  )
}
