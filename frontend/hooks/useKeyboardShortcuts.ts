'use client'

import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useSettingsStore } from '@/stores/settings'
import { useActionStore } from '@/stores/actions'

export function useKeyboardShortcuts() {
  const { shortcuts } = useSettingsStore()
  const { trigger } = useActionStore()
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  // Show Help
  useHotkeys(shortcuts.help, (e) => {
    e.preventDefault()
    setIsHelpOpen(prev => !prev)
  }, { preventDefault: true }, [shortcuts.help])

  // Run Evaluation
  useHotkeys(shortcuts.runEvaluation, () => {
    trigger('runEvaluation')
  }, { preventDefault: true }, [shortcuts.runEvaluation, trigger])

  // Generate Report
  useHotkeys(shortcuts.generateReport, () => {
    trigger('generateReport')
  }, { preventDefault: true }, [shortcuts.generateReport, trigger])

  // Load Demo
  useHotkeys(shortcuts.loadDemo, () => {
    trigger('loadDemo')
  }, { preventDefault: true }, [shortcuts.loadDemo, trigger])

  // Command Palette
  useHotkeys(shortcuts.commandPalette, () => {
    trigger('commandPalette')
  }, { preventDefault: true }, [shortcuts.commandPalette, trigger])

  return {
    isHelpOpen,
    setIsHelpOpen
  }
}