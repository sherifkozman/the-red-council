'use client'

import * as React from 'react'
import { useSettingsStore } from '@/stores/settings'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

export function GeneralSettings() {
  const general = useSettingsStore((state) => state.general)
  const updateGeneralSettings = useSettingsStore((state) => state.updateGeneralSettings)

  return (
    <div className="space-y-6" role="group" aria-labelledby="general-settings-heading">
      <h3 id="general-settings-heading" className="sr-only">
        General settings options
      </h3>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="auto-save" className="text-base">
            Auto-save
          </Label>
          <p id="auto-save-description" className="text-sm text-muted-foreground">
            Automatically save your work as you make changes
          </p>
        </div>
        <Switch
          id="auto-save"
          checked={general.autoSaveEnabled}
          onCheckedChange={(checked) => updateGeneralSettings({ autoSaveEnabled: checked })}
          aria-describedby="auto-save-description"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="notifications" className="text-base">
            Notifications
          </Label>
          <p id="notifications-description" className="text-sm text-muted-foreground">
            Receive notifications about important events
          </p>
        </div>
        <Switch
          id="notifications"
          checked={general.notificationsEnabled}
          onCheckedChange={(checked) => updateGeneralSettings({ notificationsEnabled: checked })}
          aria-describedby="notifications-description"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="confirm-delete" className="text-base">
            Confirm before delete
          </Label>
          <p id="confirm-delete-description" className="text-sm text-muted-foreground">
            Show a confirmation dialog before deleting items
          </p>
        </div>
        <Switch
          id="confirm-delete"
          checked={general.confirmBeforeDelete}
          onCheckedChange={(checked) => updateGeneralSettings({ confirmBeforeDelete: checked })}
          aria-describedby="confirm-delete-description"
        />
      </div>
    </div>
  )
}
