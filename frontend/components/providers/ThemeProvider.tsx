'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes'
import { useSettingsStore } from '@/stores/settings'

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeSyncWrapper>{children}</ThemeSyncWrapper>
    </NextThemesProvider>
  )
}

/**
 * Syncs the settings store theme with next-themes
 * This ensures the theme can be controlled from the settings page
 */
function ThemeSyncWrapper({ children }: { children: React.ReactNode }) {
  const { setTheme: setNextTheme } = useNextTheme()
  const appearanceTheme = useSettingsStore((state) => state.appearance.theme)

  // Sync settings store theme to next-themes
  React.useEffect(() => {
    setNextTheme(appearanceTheme)
  }, [appearanceTheme, setNextTheme])

  return <>{children}</>
}

/**
 * Hook to use theme with both next-themes and settings store sync
 */
export function useTheme() {
  const { theme, setTheme: setNextTheme, resolvedTheme, systemTheme } = useNextTheme()
  const updateAppearanceSettings = useSettingsStore((state) => state.updateAppearanceSettings)

  const setTheme = React.useCallback(
    (newTheme: 'light' | 'dark' | 'system') => {
      setNextTheme(newTheme)
      updateAppearanceSettings({ theme: newTheme })
    },
    [setNextTheme, updateAppearanceSettings]
  )

  return {
    theme,
    setTheme,
    resolvedTheme,
    systemTheme,
  }
}
