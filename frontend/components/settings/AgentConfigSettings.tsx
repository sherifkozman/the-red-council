'use client'

import * as React from 'react'
import { useSettingsStore } from '@/stores/settings'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'

export function AgentConfigSettings() {
  const agent = useSettingsStore((state) => state.agent)
  const updateAgentSettings = useSettingsStore((state) => state.updateAgentSettings)

  return (
    <div className="space-y-6" role="group" aria-labelledby="agent-settings-heading">
      <h3 id="agent-settings-heading" className="sr-only">
        Agent configuration options
      </h3>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="tool-interception" className="text-base">
            Default Tool Interception
          </Label>
          <p id="tool-interception-description" className="text-sm text-muted-foreground">
            Intercept and log tool calls by default for new sessions
          </p>
        </div>
        <Switch
          id="tool-interception"
          checked={agent.defaultToolInterception}
          onCheckedChange={(checked) => updateAgentSettings({ defaultToolInterception: checked })}
          aria-describedby="tool-interception-description"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="memory-monitoring" className="text-base">
            Default Memory Monitoring
          </Label>
          <p id="memory-monitoring-description" className="text-sm text-muted-foreground">
            Monitor memory access patterns by default for new sessions
          </p>
        </div>
        <Switch
          id="memory-monitoring"
          checked={agent.defaultMemoryMonitoring}
          onCheckedChange={(checked) => updateAgentSettings({ defaultMemoryMonitoring: checked })}
          aria-describedby="memory-monitoring-description"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="divergence-threshold" className="text-base">
              Default Divergence Threshold
            </Label>
            <p id="divergence-threshold-description" className="text-sm text-muted-foreground">
              Sensitivity for detecting speech/action divergence (0.0 - 1.0)
            </p>
          </div>
          <span className="text-sm font-medium tabular-nums" aria-live="polite">
            {agent.defaultDivergenceThreshold.toFixed(2)}
          </span>
        </div>
        <Slider
          id="divergence-threshold"
          min={0}
          max={1}
          step={0.05}
          value={[agent.defaultDivergenceThreshold]}
          onValueChange={([value]) => updateAgentSettings({ defaultDivergenceThreshold: value })}
          aria-describedby="divergence-threshold-description"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={agent.defaultDivergenceThreshold}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="auto-evaluate" className="text-base">
            Auto-start Evaluation
          </Label>
          <p id="auto-evaluate-description" className="text-sm text-muted-foreground">
            Automatically start evaluation after events are captured
          </p>
        </div>
        <Switch
          id="auto-evaluate"
          checked={agent.autoStartEvaluation}
          onCheckedChange={(checked) => updateAgentSettings({ autoStartEvaluation: checked })}
          aria-describedby="auto-evaluate-description"
        />
      </div>
    </div>
  )
}
