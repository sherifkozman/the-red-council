'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LayoutDashboard, Swords, Bot, FileText, Settings, Plug, Activity, ShieldAlert, BarChart3 } from 'lucide-react'

export function MobileNav() {
    const pathname = usePathname()
    const [open, setOpen] = React.useState(false)
    const triggerRef = React.useRef<HTMLButtonElement>(null)

    // Close sheet on navigation and manage focus
    React.useEffect(() => {
        if (open) {
            setOpen(false)
            // Return focus to trigger after navigation closes the sheet
            triggerRef.current?.focus()
        }
    }, [pathname])

    const navItems = [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { name: 'LLM Testing', href: '/arena', icon: Swords },
        { name: 'Agent Connect', href: '/agent/connect', icon: Plug },
        { name: 'Agent Monitor', href: '/agent/monitor', icon: Activity },
        { name: 'Agent Attack', href: '/agent/attack', icon: ShieldAlert },
        { name: 'Agent Results', href: '/agent/results', icon: BarChart3 },
        { name: 'Reports', href: '/reports', icon: FileText },
        { name: 'Settings', href: '/settings', icon: Settings },
    ]

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button ref={triggerRef} variant="ghost" size="icon" className="md:hidden" aria-label="Toggle navigation menu">
                    <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="pr-0" id="mobile-navigation">
                <SheetTitle className="px-7 text-left">
                     <span className="font-bold">The Red Council</span>
                </SheetTitle>
                <SheetDescription className="sr-only">
                    Mobile navigation menu for accessing dashboard, testing tools, and settings
                </SheetDescription>
                <ScrollArea className="my-4 h-[calc(100vh-8rem)] pb-10 pl-6">
                    <nav className="flex flex-col space-y-2" aria-label="Mobile primary navigation">
                        {navItems.map((item) => (
                             <Button
                                key={item.href}
                                asChild
                                variant={pathname === item.href ? "secondary" : "ghost"}
                                className="w-full justify-start"
                             >
                                <Link href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
                                    <item.icon className="mr-2 h-4 w-4" />
                                    {item.name}
                                </Link>
                             </Button>
                        ))}
                    </nav>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    )
}
