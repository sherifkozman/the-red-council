'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  Settings2,
  ChevronDown,
  RefreshCw,
  Shield,
  Brain,
  Activity,
  AlertTriangle,
  Save,
  Info,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { ToolRegistration } from './ToolRegistration';

// Constants matching Python implementation
export const MIN_DIVERGENCE_THRESHOLD = 0.0;
export const MAX_DIVERGENCE_THRESHOLD = 1.0;
export const DEFAULT_DIVERGENCE_THRESHOLD = 0.5;
export const MIN_SAMPLING_RATE = 0.0;
export const MAX_SAMPLING_RATE = 1.0;
export const DEFAULT_SAMPLING_RATE = 1.0;

// Types for session config
export interface SessionConfig {
  enableToolInterception: boolean;
  enableMemoryMonitoring: boolean;
  divergenceThreshold: number;
  samplingRate: number;
}

interface ConfigPanelProps {
  /** Current session configuration (if connected to a session) */
  sessionConfig?: SessionConfig;
  /** Callback when session config changes */
  onSessionConfigChange?: (config: SessionConfig) => void;
  /** Whether the component is in read-only mode */
  readOnly?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Configuration panel for agent instrumentation settings.
 * Provides toggles for tool interception, memory monitoring,
 * and sliders for divergence threshold and sampling rate.
 */
export function ConfigPanel({
  sessionConfig,
  onSessionConfigChange,
  readOnly = false,
  className,
}: ConfigPanelProps) {
  // Global settings from store (used as defaults)
  const { agent: agentSettings, updateAgentSettings } = useSettingsStore();

  // Local state for session-specific config
  const [localConfig, setLocalConfig] = useState<SessionConfig>(() => ({
    enableToolInterception: sessionConfig?.enableToolInterception ?? agentSettings.defaultToolInterception,
    enableMemoryMonitoring: sessionConfig?.enableMemoryMonitoring ?? agentSettings.defaultMemoryMonitoring,
    divergenceThreshold: sessionConfig?.divergenceThreshold ?? agentSettings.defaultDivergenceThreshold,
    samplingRate: sessionConfig?.samplingRate ?? DEFAULT_SAMPLING_RATE,
  }));

  // Track if local changes have been made
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Sections open state
  const [openSections, setOpenSections] = useState({
    instrumentation: true,
    thresholds: true,
    tools: false,
    memory: false,
  });

  const toggleSection = useCallback((section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  // Update local config
  const updateLocalConfig = useCallback(
    (updates: Partial<SessionConfig>) => {
      if (readOnly) return;

      setLocalConfig((prev) => {
        const newConfig = { ...prev, ...updates };
        setHasUnsavedChanges(true);
        return newConfig;
      });
    },
    [readOnly]
  );

  // Apply changes to session
  const applyChanges = useCallback(() => {
    if (!onSessionConfigChange) {
      // No session to apply to - don't clear unsaved flag
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ConfigPanel] applyChanges called but no session callback is configured');
      }
      return;
    }
    onSessionConfigChange(localConfig);
    setHasUnsavedChanges(false);
  }, [localConfig, onSessionConfigChange]);

  // Save as defaults
  const saveAsDefaults = useCallback(() => {
    updateAgentSettings({
      defaultToolInterception: localConfig.enableToolInterception,
      defaultMemoryMonitoring: localConfig.enableMemoryMonitoring,
      defaultDivergenceThreshold: localConfig.divergenceThreshold,
    });
  }, [localConfig, updateAgentSettings]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    if (readOnly) return;

    setLocalConfig({
      enableToolInterception: agentSettings.defaultToolInterception,
      enableMemoryMonitoring: agentSettings.defaultMemoryMonitoring,
      divergenceThreshold: agentSettings.defaultDivergenceThreshold,
      samplingRate: DEFAULT_SAMPLING_RATE,
    });
    setHasUnsavedChanges(true);
  }, [agentSettings, readOnly]);

  return (
    <div
      className={cn('space-y-4', className)}
      role="region"
      aria-label="Agent configuration panel"
    >
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Agent Configuration</h2>
        </div>
        {hasUnsavedChanges && (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            Unsaved Changes
          </Badge>
        )}
      </div>

      {readOnly && (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Read-only Mode</AlertTitle>
          <AlertDescription>
            Configuration cannot be changed while a session is in progress.
          </AlertDescription>
        </Alert>
      )}

      {/* Instrumentation Section */}
      <Collapsible
        open={openSections.instrumentation}
        onOpenChange={() => toggleSection('instrumentation')}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" aria-hidden="true" />
                  <CardTitle className="text-base">Instrumentation</CardTitle>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    openSections.instrumentation && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
              <CardDescription>
                Control what agent behaviors are monitored
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Tool Interception Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="tool-interception" className="text-sm font-medium">
                    Enable Tool Interception
                  </Label>
                  <p id="tool-interception-desc" className="text-xs text-muted-foreground">
                    Capture and analyze all tool calls made by the agent
                  </p>
                </div>
                <Switch
                  id="tool-interception"
                  checked={localConfig.enableToolInterception}
                  onCheckedChange={(checked) =>
                    updateLocalConfig({ enableToolInterception: checked })
                  }
                  disabled={readOnly}
                  aria-describedby="tool-interception-desc"
                />
              </div>

              {/* Memory Monitoring Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="memory-monitoring" className="text-sm font-medium">
                    Enable Memory Monitoring
                  </Label>
                  <p id="memory-monitoring-desc" className="text-xs text-muted-foreground">
                    Track read/write operations to agent memory
                  </p>
                </div>
                <Switch
                  id="memory-monitoring"
                  checked={localConfig.enableMemoryMonitoring}
                  onCheckedChange={(checked) =>
                    updateLocalConfig({ enableMemoryMonitoring: checked })
                  }
                  disabled={readOnly}
                  aria-describedby="memory-monitoring-desc"
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Thresholds Section */}
      <Collapsible
        open={openSections.thresholds}
        onOpenChange={() => toggleSection('thresholds')}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-green-500" aria-hidden="true" />
                  <CardTitle className="text-base">Thresholds</CardTitle>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    openSections.thresholds && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
              <CardDescription>
                Configure detection sensitivity and sampling
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Divergence Threshold Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="divergence-threshold" className="text-sm font-medium">
                    Divergence Threshold
                  </Label>
                  <span className="text-sm text-muted-foreground font-mono">
                    {localConfig.divergenceThreshold.toFixed(2)}
                  </span>
                </div>
                <Slider
                  id="divergence-threshold"
                  min={MIN_DIVERGENCE_THRESHOLD}
                  max={MAX_DIVERGENCE_THRESHOLD}
                  step={0.05}
                  value={[localConfig.divergenceThreshold]}
                  onValueChange={([value]) =>
                    updateLocalConfig({ divergenceThreshold: value })
                  }
                  disabled={readOnly}
                  aria-label="Divergence threshold"
                  aria-valuemin={MIN_DIVERGENCE_THRESHOLD}
                  aria-valuemax={MAX_DIVERGENCE_THRESHOLD}
                  aria-valuenow={localConfig.divergenceThreshold}
                />
                <p className="text-xs text-muted-foreground">
                  Lower values detect more divergences (speech vs. action mismatches).
                  Range: 0.0 (very sensitive) to 1.0 (less sensitive).
                </p>
              </div>

              {/* Sampling Rate Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sampling-rate" className="text-sm font-medium">
                    Event Sampling Rate
                  </Label>
                  <span className="text-sm text-muted-foreground font-mono">
                    {(localConfig.samplingRate * 100).toFixed(0)}%
                  </span>
                </div>
                <Slider
                  id="sampling-rate"
                  min={MIN_SAMPLING_RATE}
                  max={MAX_SAMPLING_RATE}
                  step={0.1}
                  value={[localConfig.samplingRate]}
                  onValueChange={([value]) =>
                    updateLocalConfig({ samplingRate: value })
                  }
                  disabled={readOnly}
                  aria-label="Event sampling rate"
                  aria-valuemin={MIN_SAMPLING_RATE}
                  aria-valuemax={MAX_SAMPLING_RATE}
                  aria-valuenow={localConfig.samplingRate}
                />
                <p className="text-xs text-muted-foreground">
                  Percentage of events to capture. 100% captures all events.
                </p>
                {localConfig.samplingRate < 1.0 && (
                  <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/5">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden="true" />
                    <AlertDescription className="text-xs">
                      Sampling below 100% may miss important events. Use with caution.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Tool Registration Section */}
      <Collapsible
        open={openSections.tools}
        onOpenChange={() => toggleSection('tools')}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-500" aria-hidden="true" />
                  <CardTitle className="text-base">Tool Registration</CardTitle>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    openSections.tools && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
              <CardDescription>
                Register tools for interception and configure dangerous flags
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <ToolRegistration disabled={readOnly} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Memory Policy Section */}
      <Collapsible
        open={openSections.memory}
        onOpenChange={() => toggleSection('memory')}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-orange-500" aria-hidden="true" />
                  <CardTitle className="text-base">Memory Policy</CardTitle>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    openSections.memory && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
              <CardDescription>
                Configure sensitive key patterns and access policies
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="text-sm text-muted-foreground py-4 text-center">
                <p>Memory policy configuration coming soon.</p>
                <p className="text-xs mt-1">
                  Default sensitive patterns: password, secret, api_key, token, credential
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          onClick={applyChanges}
          disabled={readOnly || !hasUnsavedChanges}
          className="gap-2"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Apply to Session
        </Button>
        <Button
          variant="outline"
          onClick={saveAsDefaults}
          disabled={readOnly}
          className="gap-2"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save as Defaults
        </Button>
        <Button
          variant="ghost"
          onClick={resetToDefaults}
          disabled={readOnly}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reset to Defaults
        </Button>
      </div>

      {/* Current Config Summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Tool Interception:</span>{' '}
              <Badge variant={localConfig.enableToolInterception ? 'default' : 'secondary'}>
                {localConfig.enableToolInterception ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Memory Monitoring:</span>{' '}
              <Badge variant={localConfig.enableMemoryMonitoring ? 'default' : 'secondary'}>
                {localConfig.enableMemoryMonitoring ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Divergence Threshold:</span>{' '}
              <span className="font-mono">{localConfig.divergenceThreshold.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Sampling Rate:</span>{' '}
              <span className="font-mono">{(localConfig.samplingRate * 100).toFixed(0)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
