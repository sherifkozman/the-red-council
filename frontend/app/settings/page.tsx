'use client'

import * as React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSettingsStore, SETTINGS_TABS, type SettingsTab } from '@/stores/settings'
import { GeneralSettings } from '@/components/settings/GeneralSettings'
import { AgentConfigSettings } from '@/components/settings/AgentConfigSettings'
import { APIKeysSettings } from '@/components/settings/APIKeysSettings'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { MemoryPolicy } from '@/components/settings/MemoryPolicy'
import { Separator } from '@/components/ui/separator'
import { Settings, Bot, Key, Palette } from 'lucide-react'

const TAB_CONFIG: Record<SettingsTab, { icon: React.ElementType; title: string; description: string }> = {
  general: {
    icon: Settings,
    title: 'General',
    description: 'Manage your general application preferences',
  },
  agent: {
    icon: Bot,
    title: 'Agent Config',
    description: 'Configure default agent instrumentation settings',
  },
  'api-keys': {
    icon: Key,
    title: 'API Keys',
    description: 'Manage your API keys and authentication',
  },
  appearance: {
    icon: Palette,
    title: 'Appearance',
    description: 'Customize the look and feel of the application',
  },
}

export default function SettingsPage() {
  const activeTab = useSettingsStore((state) => state.activeTab)
  const setActiveTab = useSettingsStore((state) => state.setActiveTab)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="container max-w-4xl py-6" aria-busy="true" role="status">
        <div className="space-y-6">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-12 w-full bg-muted animate-pulse rounded" />
          <div className="h-64 w-full bg-muted animate-pulse rounded" />
        </div>
        <span className="sr-only">Loading settings...</span>
      </div>
    )
  }

  return (
    <div className="container max-w-4xl py-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your application preferences and configuration
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-4" role="tablist" aria-label="Settings sections">
            {SETTINGS_TABS.map((tab) => {
              const config = TAB_CONFIG[tab]
              const Icon = config.icon
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  id={`settings-${tab}-trigger`}
                  className="flex items-center gap-2"
                  aria-controls={`settings-${tab}-panel`}
                  aria-label={config.title}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{config.title}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {SETTINGS_TABS.map((tab) => {
            const config = TAB_CONFIG[tab]
            return (
              <TabsContent
                key={tab}
                value={tab}
                id={`settings-${tab}-panel`}
                role="tabpanel"
                aria-labelledby={`settings-${tab}-trigger`}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>{config.title}</CardTitle>
                    <CardDescription>{config.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {tab === 'general' && <GeneralSettings />}
                    {tab === 'agent' && (
                      <div className="space-y-8">
                        <AgentConfigSettings />
                        <Separator />
                        <MemoryPolicy />
                      </div>
                    )}
                    {tab === 'api-keys' && <APIKeysSettings />}
                    {tab === 'appearance' && <AppearanceSettings />}
                  </CardContent>
                </Card>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </div>
  )
}
