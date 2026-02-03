'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/stores/onboarding'
import { useTestingModeStore } from '@/stores/testingMode'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Rocket, Bot, Shield, ChevronRight, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WelcomeOptionCardProps {

    icon: LucideIcon

    title: string

    description: string

    ctaText: string

    colorClass: string

    onClick: () => void

    disabled?: boolean

    idPrefix: string

}



function WelcomeOptionCard({ icon: Icon, title, description, ctaText, colorClass, onClick, disabled, idPrefix }: WelcomeOptionCardProps) {

    const titleId = `${idPrefix}-title`

    const descId = `${idPrefix}-desc`



    return (

        <button

            onClick={onClick}

            className={cn(

                "text-left transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl",

                "h-full w-full",

                disabled && "opacity-50 cursor-not-allowed"

            )}

            type="button"

            disabled={disabled}

            aria-labelledby={titleId}

            aria-describedby={descId}

        >

            <Card className="h-full hover:border-primary/50 transition-colors bg-card hover:bg-muted/30">

                <CardHeader>

                    <Icon className={cn("w-8 h-8 mb-2", colorClass)} aria-hidden="true" />

                    <CardTitle id={titleId}>{title}</CardTitle>

                    <CardDescription id={descId}>{description}</CardDescription>

                </CardHeader>

                <CardContent>

                    <div className={cn("flex items-center text-sm font-medium", colorClass)}>

                        {ctaText} <ChevronRight className="w-4 h-4 ml-1" aria-hidden="true" />

                    </div>

                </CardContent>

            </Card>

        </button>

    )

}



export function WelcomeModal() {

  const router = useRouter()

  const { hasSeenWelcome, setHasSeenWelcome } = useOnboardingStore()

  const { setMode } = useTestingModeStore()

  const [mounted, setMounted] = useState(false)

  const [isLoading, setIsLoading] = useState(false)

  

  // Hydration fix: only render after mount

  useEffect(() => {

    setMounted(true)

  }, [])



  const handleClose = () => {

    if (isLoading) return

    setHasSeenWelcome(true)

  }



  const handleSelection = (path: 'demo' | 'agent' | 'llm') => {

    if (isLoading) return

    setIsLoading(true)

    

    try {

        setHasSeenWelcome(true)

        

        switch (path) {

            case 'demo':

                setMode('demo-mode')

                router.push('/dashboard')

                break

            case 'agent':

                setMode('agent-testing')

                router.push('/agent/connect')

                break

            case 'llm':

                setMode('llm-testing')

                router.push('/arena')

                break

        }

    } catch (error) {

        if (process.env.NODE_ENV === 'development') {

            console.error('Failed to handle welcome selection:', error)

        }

        setIsLoading(false)

    }

  }



  if (!mounted) return null

  if (hasSeenWelcome) return null



  return (

    <Dialog open={true} onOpenChange={(val) => {

        if (!val) handleClose()

    }}>

      <DialogContent 

        className="sm:max-w-[800px]"

        aria-describedby="welcome-desc"

        aria-labelledby="welcome-title"

      >

        <DialogHeader>

          <DialogTitle id="welcome-title" className="text-2xl font-bold">Welcome to The Red Council</DialogTitle>

          <DialogDescription id="welcome-desc" className="text-lg">

            Your unified platform for LLM Adversarial Security & Agent Testing.

            Choose how you would like to get started:

          </DialogDescription>

        </DialogHeader>



        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">

            <WelcomeOptionCard

                idPrefix="opt-demo"

                icon={Rocket}

                title="Try Demo"

                description="Explore the platform with pre-loaded data. No setup required."

                ctaText="Start Tour"

                colorClass="text-blue-600"

                onClick={() => handleSelection('demo')}

                disabled={isLoading}

            />



            <WelcomeOptionCard

                idPrefix="opt-agent"

                icon={Bot}

                title="Connect Agent"

                description="Test your own AI agent via SDK or HTTP endpoint."

                ctaText="Connect Now"

                colorClass="text-green-600"

                onClick={() => handleSelection('agent')}

                disabled={isLoading}

            />



            <WelcomeOptionCard

                idPrefix="opt-llm"

                icon={Shield}

                title="Test an LLM"

                description="Run adversarial attacks against a raw LLM model."

                ctaText="Enter Arena"

                colorClass="text-red-600"

                onClick={() => handleSelection('llm')}

                disabled={isLoading}

            />

        </div>



        <div className="flex justify-end mt-4">

          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>

            Skip for now

          </Button>

        </div>

        

        {/* Loading state announcement for screen readers */}

        {isLoading && (

            <div className="sr-only" role="status" aria-live="polite">

                Loading your selection...

            </div>

        )}

      </DialogContent>

    </Dialog>

  )

}
