'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useSettingsStore } from '@/stores/settings'
import { Keyboard, Command, Play, FileText, HelpCircle } from 'lucide-react'

interface ShortcutsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
  const { shortcuts } = useSettingsStore()

  const shortcutList = [
    { label: 'Run Evaluation', keys: shortcuts.runEvaluation, icon: Play, description: 'Start a new evaluation run' },
    { label: 'Generate Report', keys: shortcuts.generateReport, icon: FileText, description: 'Generate report from current results' },
    { label: 'Load Demo', keys: shortcuts.loadDemo, icon: Command, description: 'Load sample data for demonstration' },
    { label: 'Command Palette', keys: shortcuts.commandPalette, icon: Keyboard, description: 'Open global command palette' },
    { label: 'Show Help', keys: shortcuts.help, icon: HelpCircle, description: 'Show this keyboard shortcuts dialog' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        aria-labelledby="shortcuts-dialog-title"
        aria-describedby="shortcuts-dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="shortcuts-dialog-title" className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" aria-hidden="true" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription id="shortcuts-dialog-description">
            Global shortcuts available throughout the application.
          </DialogDescription>
        </DialogHeader>
        <ul role="list" className="grid gap-4 py-4">
          {shortcutList.map((item) => (
            <li key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <item.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.description}</span>
                </div>
              </div>
              <div className="flex items-center gap-1" aria-label={`Shortcut: ${item.keys.replace(/\+/g, ' plus ')}`}>
                {item.keys.split('+').map((key, index, arr) => (
                  <div key={key + index} className="flex items-center gap-1">
                    <kbd
                      className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 uppercase"
                    >
                      {key}
                    </kbd>
                    {index < arr.length - 1 && (
                      <span aria-hidden="true" className="text-muted-foreground/40 text-xs">+</span>
                    )}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
