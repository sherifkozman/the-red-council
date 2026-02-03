'use client'

import * as React from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { WelcomeModal } from '@/components/onboarding/WelcomeModal'
import { QuickStartGuide } from '@/components/onboarding/QuickStartGuide'

interface AppShellProps {
    children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
    return (
        <div className="flex min-h-screen flex-col md:flex-row">
            {/* Desktop Sidebar - Hidden on mobile */}
            <Sidebar className="hidden md:flex h-screen sticky top-0" />

            {/* Mobile Header - Hidden on desktop */}
            <div className="flex h-14 items-center border-b px-4 md:hidden">
                <MobileNav />
                <span className="ml-4 font-bold">The Red Council</span>
            </div>

            {/* Main Content */}
            <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6 bg-background relative">
                <ErrorBoundary>
                    <WelcomeModal />
                    <QuickStartGuide />
                    {children}
                </ErrorBoundary>
            </main>
        </div>
    )
}
