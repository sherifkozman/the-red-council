'use client'

import * as React from 'react'
import { useSettingsStore } from '@/stores/settings'
import { useTheme } from '@/components/providers/ThemeProvider'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Sun, Moon, Monitor, Check } from 'lucide-react'

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor },
]

const FONT_SIZE_OPTIONS = [
  { value: 'small' as const, label: 'Small', className: 'text-sm' },
  { value: 'medium' as const, label: 'Medium', className: 'text-base' },
  { value: 'large' as const, label: 'Large', className: 'text-lg' },
]

export function AppearanceSettings() {
  const appearance = useSettingsStore((state) => state.appearance)
  const updateAppearanceSettings = useSettingsStore((state) => state.updateAppearanceSettings)
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    setTheme(theme)
  }

  // Skeleton for theme buttons during SSR
  if (!mounted) {
    return (
      <div className="space-y-6" aria-busy="true" role="status">
        <div className="h-24 bg-muted animate-pulse rounded" />
        <div className="h-16 bg-muted animate-pulse rounded" />
        <div className="h-12 bg-muted animate-pulse rounded" />
        <span className="sr-only">Loading appearance settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6" role="group" aria-labelledby="appearance-settings-heading">
      <h3 id="appearance-settings-heading" className="sr-only">
        Appearance settings options
      </h3>

      <div className="space-y-3">
        <Label className="text-base">Theme</Label>
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="Select theme"
        >
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            const isSelected = appearance.theme === option.value
            return (
              <Button
                key={option.value}
                variant="outline"
                className={cn(
                  'relative h-auto flex-col gap-2 p-4',
                  isSelected && 'border-primary bg-primary/5'
                )}
                onClick={() => handleThemeChange(option.value)}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${option.label} theme`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{option.label}</span>
                {isSelected && (
                  <Check
                    className="absolute right-2 top-2 h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                )}
              </Button>
            )
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          Current resolved theme:{' '}
          <span className="font-medium capitalize">{resolvedTheme}</span>
        </p>
      </div>

      <div className="space-y-3">
        <Label className="text-base">Font Size</Label>
        <div
          className="flex gap-2"
          role="radiogroup"
          aria-label="Select font size"
        >
          {FONT_SIZE_OPTIONS.map((option) => {
            const isSelected = appearance.fontSize === option.value
            return (
              <Button
                key={option.value}
                variant="outline"
                className={cn(
                  'flex-1',
                  option.className,
                  isSelected && 'border-primary bg-primary/5'
                )}
                onClick={() => updateAppearanceSettings({ fontSize: option.value })}
                role="radio"
                aria-checked={isSelected}
                aria-label={`${option.label} font size`}
              >
                {option.label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="compact-mode" className="text-base">
            Compact Mode
          </Label>
          <p id="compact-mode-description" className="text-sm text-muted-foreground">
            Reduce padding and spacing for a denser interface
          </p>
        </div>
        <Switch
          id="compact-mode"
          checked={appearance.compactMode}
          onCheckedChange={(checked) => updateAppearanceSettings({ compactMode: checked })}
          aria-describedby="compact-mode-description"
        />
      </div>
    </div>
  )
}
