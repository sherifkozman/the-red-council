'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard,
  Swords,
  Bot,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plug,
  Activity,
  ShieldAlert,
  BarChart3,
  LucideIcon
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { safeLocalStorage } from '@/lib/persistence/safeLocalStorage'
import { ProgressIndicator } from '@/components/onboarding/ProgressIndicator'
import { ModeSelector } from '@/components/ModeSelector'

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string
}

type NavItem = {
    name: string
    href: string
    icon: LucideIcon
    isCollapsible?: boolean
    children?: { name: string; href: string; icon: LucideIcon }[]
}

const NAV_ITEMS: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    {
      name: 'LLM Testing',
      href: '/llm',
      icon: Swords,
      isCollapsible: true,
      children: [
        { name: 'Demo Simulation', href: '/llm/demo', icon: Activity },
        { name: 'Battle Arena', href: '/llm/arena', icon: Swords },
      ]
    },
    {
      name: 'Agent Testing',
      href: '/agent',
      icon: Bot,
      isCollapsible: true,
      children: [
        { name: 'Demo Simulation', href: '/agent/demo', icon: Activity },
        { name: 'Connect', href: '/agent/connect', icon: Plug },
        { name: 'Monitor', href: '/agent/monitor', icon: Activity },
        { name: 'Attack', href: '/agent/attack', icon: ShieldAlert },
        { name: 'Results', href: '/agent/results', icon: BarChart3 },
      ]
    },
    { name: 'Reports', href: '/reports', icon: FileText },
    { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar({ className, ...props }: SidebarProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = React.useState(false)
  const [isAgentOpen, setIsAgentOpen] = React.useState(true)
  const [isLLMOpen, setIsLLMOpen] = React.useState(true)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
    const savedCollapsed = safeLocalStorage.getItem<boolean>('sidebar-collapsed')
    if (typeof savedCollapsed === 'boolean') setIsCollapsed(savedCollapsed)

    const savedAgentOpen = safeLocalStorage.getItem<boolean>('sidebar-agent-open')
    if (typeof savedAgentOpen === 'boolean') setIsAgentOpen(savedAgentOpen)

    const savedLLMOpen = safeLocalStorage.getItem<boolean>('sidebar-llm-open')
    if (typeof savedLLMOpen === 'boolean') setIsLLMOpen(savedLLMOpen)
  }, [])

  const toggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    safeLocalStorage.setItem('sidebar-collapsed', newState)
  }

  const toggleAgent = (open: boolean) => {
      setIsAgentOpen(open)
      safeLocalStorage.setItem('sidebar-agent-open', open)
  }

  const toggleLLM = (open: boolean) => {
      setIsLLMOpen(open)
      safeLocalStorage.setItem('sidebar-llm-open', open)
  }

  // Prevent hydration mismatch by rendering default structure
  if (!mounted) {
      return <div className={cn("relative flex flex-col border-r bg-background w-64", className)} />
  }
  
  return (
    <div {...props} className={cn("relative flex flex-col border-r bg-background transition-all duration-300", isCollapsed ? "w-16" : "w-64", className)}>
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!isCollapsed && <h1 className="font-bold truncate text-sm">The Red Council</h1>}
        <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-8 w-8 ml-auto" aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      
      <ScrollArea className="flex-1 py-4">
        <nav className="grid gap-1 px-2" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const isChildActive = item.children?.some(child => pathname === child.href) || false
            const isItemActive = pathname === item.href
            
            if (item.isCollapsible && !isCollapsed) {
               const isOpen = item.name === 'LLM Testing' ? isLLMOpen : isAgentOpen
               const toggleFn = item.name === 'LLM Testing' ? toggleLLM : toggleAgent
               return (
                   <Collapsible key={item.href} open={isOpen} onOpenChange={toggleFn} className="group/collapsible">
                       <CollapsibleTrigger asChild>
                           <Button
                                variant="ghost"
                                className="w-full justify-between"
                                aria-expanded={isOpen}
                                aria-controls={`${item.name.toLowerCase().replace(' ', '-')}-submenu`}
                           >
                               <div className="flex items-center">
                                   <item.icon className="mr-2 h-4 w-4" />
                                   {item.name}
                               </div>
                               <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen ? "rotate-0" : "-rotate-90")} />
                           </Button>
                       </CollapsibleTrigger>
                       <CollapsibleContent
                            id={`${item.name.toLowerCase().replace(' ', '-')}-submenu`}
                            role="group"
                            aria-label={`${item.name} submenu`}
                            className="pl-6 space-y-1 mt-1"
                       >
                           {item.children?.map((child) => (
                               <Button
                                   key={child.href}
                                   asChild
                                   variant={pathname === child.href ? "secondary" : "ghost"}
                                   size="sm"
                                   className="w-full justify-start"
                               >
                                   <Link href={child.href} aria-current={pathname === child.href ? 'page' : undefined}>
                                       <child.icon className="mr-2 h-4 w-4" />
                                       {child.name}
                                   </Link>
                               </Button>
                           ))}
                       </CollapsibleContent>
                   </Collapsible>
               )
            }

            return (
              <Button 
                  key={item.href}
                  asChild
                  variant={isItemActive ? "secondary" : "ghost"} 
                  size={isCollapsed ? "icon" : "default"}
                  className={isCollapsed ? "w-full" : "w-full justify-start"}
                  title={item.name}
              >
                  <Link href={item.href} aria-current={isItemActive ? 'page' : undefined}>
                     {isCollapsed ? (
                        <>
                            <item.icon className="h-4 w-4" />
                            <span className="sr-only">{item.name}</span>
                        </>
                     ) : (
                        <>
                            <item.icon className="mr-2 h-4 w-4" />
                            {item.name}
                        </>
                     )}
                  </Link>
              </Button>
            )
          })}
        </nav>
      </ScrollArea>

      {!isCollapsed && (
        <div className="px-3 py-2 border-t">
          <p className="text-xs text-muted-foreground mb-2">Mode</p>
          <ModeSelector />
        </div>
      )}
      <ProgressIndicator isSidebarCollapsed={isCollapsed} />
    </div>
  )
}
