'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Bot, FileText, MoreHorizontal, Settings } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Swords, Activity, ShieldAlert, BarChart3 } from 'lucide-react'

// Main navigation items shown in the bottom bar (max 5 for touch targets)
const MAIN_NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Arena', href: '/arena', icon: Swords },
  { name: 'Agent', href: '/agent/connect', icon: Bot },
  { name: 'Reports', href: '/reports', icon: FileText },
] as const

// Extended navigation items shown in "More" menu
// Note: Agent Connect is accessible via main "Agent" tab, Reports via main bar
const MORE_NAV_ITEMS = [
  { name: 'Agent Monitor', href: '/agent/monitor', icon: Activity },
  { name: 'Agent Attack', href: '/agent/attack', icon: ShieldAlert },
  { name: 'Agent Results', href: '/agent/results', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
] as const

interface NavItemProps {
  href: string
  icon: React.ElementType
  name: string
  isActive: boolean
}

function NavItem({ href, icon: Icon, name, isActive }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] px-2 py-1',
        'text-muted-foreground hover:text-foreground transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md',
        isActive && 'text-primary'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="text-xs font-medium truncate max-w-[64px]">{name}</span>
    </Link>
  )
}

export function BottomNav() {
  const rawPathname = usePathname()
  const pathname = rawPathname ?? '/'
  const [moreOpen, setMoreOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  // Check if current path matches a nav item or starts with its path
  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/'
    }
    if (href === '/agent/connect') {
      // Agent tab is active for any /agent/* route
      return pathname.startsWith('/agent')
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Close sheet on navigation
  React.useEffect(() => {
    if (moreOpen) {
      setMoreOpen(false)
      triggerRef.current?.focus()
    }
  }, [pathname])

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 safe-area-inset-bottom"
      aria-label="Bottom navigation"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {MAIN_NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            name={item.name}
            isActive={isActive(item.href)}
          />
        ))}

        {/* More button with sheet for additional navigation */}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              ref={triggerRef}
              className={cn(
                'flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[44px] px-2 py-1',
                'text-muted-foreground hover:text-foreground transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md'
              )}
              aria-label="More navigation options"
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              <span className="text-xs font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[60vh]">
            <SheetHeader>
              <SheetTitle className="text-left">More Options</SheetTitle>
              <SheetDescription className="sr-only">
                Additional navigation options including agent tools and settings
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-full">
              <div className="grid grid-cols-3 gap-4 pb-8">
                {MORE_NAV_ITEMS.map((item) => (
                  <Button
                    key={item.href}
                    asChild
                    variant={isActive(item.href) ? 'secondary' : 'ghost'}
                    className="h-auto flex-col gap-2 py-4"
                  >
                    <Link href={item.href}>
                      <item.icon className="h-6 w-6" aria-hidden="true" />
                      <span className="text-xs">{item.name}</span>
                    </Link>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  )
}
