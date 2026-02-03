'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { useRemoteAgentStore, ConnectionStatus as StoreConnectionStatus, ConnectionStatusInfo } from '@/stores/remoteAgent'
import { testRemoteConnection, ConnectionTestResult } from '@/lib/api/testConnection'

export type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'failed'

interface ConnectionTesterProps {
  className?: string
  onStatusChange?: (status: ConnectionStatus) => void
  compact?: boolean
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: 'Not tested',
  testing: 'Testing...',
  connected: 'Connected',
  failed: 'Failed',
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  testing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  connected: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

/**
 * Map store connection status to component status
 */
function mapStoreStatus(storeStatus: StoreConnectionStatus): ConnectionStatus {
  switch (storeStatus) {
    case 'connected':
      return 'connected'
    case 'failed':
      return 'failed'
    case 'untested':
    default:
      return 'idle'
  }
}

/**
 * Format relative time from ISO string
 */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never'
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString()
  } catch {
    return 'Unknown'
  }
}

/**
 * ConnectionTester component for testing remote agent endpoint connections.
 * Provides visual feedback, troubleshooting hints, and persistent status indicator.
 */
export function ConnectionTester({
  className,
  onStatusChange,
  compact = false,
}: ConnectionTesterProps) {
  const { config, connectionStatus: storeConnectionStatus, setConnectionStatus } = useRemoteAgentStore()

  // Local testing state (for in-progress indicator)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  // Derive display status from store + testing state
  const status: ConnectionStatus = isTesting ? 'testing' : mapStoreStatus(storeConnectionStatus.status)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Notify parent of status changes
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  const handleTestConnection = useCallback(async () => {
    // Cancel any in-progress test
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller for this test
    abortControllerRef.current = new AbortController()

    setIsTesting(true)
    setTestResult(null)
    setShowDetails(false)

    try {
      const result = await testRemoteConnection(config, abortControllerRef.current.signal)
      setTestResult(result)

      // Update persistent connection status in store
      const statusInfo: ConnectionStatusInfo = {
        status: result.success ? 'connected' : 'failed',
        lastTestedAt: new Date().toISOString(),
        latencyMs: result.latencyMs,
        statusCode: result.statusCode ?? null,
        errorMessage: result.success ? null : (result.message ?? 'Unknown error'),
      }
      setConnectionStatus(statusInfo)

      // Auto-show details on failure
      if (!result.success) {
        setShowDetails(true)
      }
    } catch (error) {
      // Handle unexpected errors
      if (error instanceof Error && error.name !== 'AbortError') {
        setTestResult({
          success: false,
          latencyMs: 0,
          message: 'An unexpected error occurred',
          troubleshooting: ['Please try again'],
        })

        // Update store with failure status
        setConnectionStatus({
          status: 'failed',
          lastTestedAt: new Date().toISOString(),
          latencyMs: null,
          statusCode: null,
          errorMessage: 'An unexpected error occurred',
        })

        setShowDetails(true)
      }
    } finally {
      setIsTesting(false)
    }
  }, [config, setConnectionStatus])

  const handleCancelTest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsTesting(false)
    setTestResult(null)
  }, [])

  const handleDismiss = useCallback(() => {
    setTestResult(null)
    setShowDetails(false)
  }, [])

  const isConfigValid = Boolean(config.endpointUrl)

  // Status indicator icon
  const StatusIcon = () => {
    switch (status) {
      case 'testing':
        return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      case 'connected':
        return <Wifi className="h-4 w-4" aria-hidden="true" />
      case 'failed':
        return <WifiOff className="h-4 w-4" aria-hidden="true" />
      default:
        return <Wifi className="h-4 w-4" aria-hidden="true" />
    }
  }

  // Compact view (for sidebar or header)
  if (compact) {
    return (
      <div
        className={cn('flex items-center gap-2', className)}
        role="status"
        aria-label={`Connection status: ${STATUS_LABELS[status]}`}
      >
        <Badge
          variant="secondary"
          className={cn('flex items-center gap-1.5', STATUS_COLORS[status])}
        >
          <StatusIcon />
          <span className="text-xs">{STATUS_LABELS[status]}</span>
        </Badge>

        {status === 'idle' && isConfigValid && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTestConnection}
            className="h-6 px-2 text-xs"
            aria-label="Test connection"
          >
            Test
          </Button>
        )}

        {status === 'testing' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelTest}
            className="h-6 px-2 text-xs"
            aria-label="Cancel test"
          >
            Cancel
          </Button>
        )}

        {(status === 'connected' || status === 'failed') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTestConnection}
            className="h-6 px-2 text-xs"
            aria-label="Retest connection"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </Button>
        )}
      </div>
    )
  }

  // Full view (for connection page)
  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <StatusIcon />
            Connection Status
          </CardTitle>
          <Badge
            variant="secondary"
            className={STATUS_COLORS[status]}
            aria-label={`Status: ${STATUS_LABELS[status]}`}
          >
            {STATUS_LABELS[status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Endpoint summary */}
        <div className="text-sm text-muted-foreground">
          {config.endpointUrl ? (
            <span className="font-mono text-xs break-all" title={config.endpointUrl}>
              {config.endpointUrl.length > 60
                ? `${config.endpointUrl.slice(0, 60)}...`
                : config.endpointUrl}
            </span>
          ) : (
            <span className="italic">No endpoint configured</span>
          )}
        </div>

        {/* Test controls */}
        <div className="flex items-center gap-2">
          {status === 'testing' ? (
            <Button
              variant="outline"
              onClick={handleCancelTest}
              className="flex-1"
              aria-busy="true"
            >
              <X className="mr-2 h-4 w-4" aria-hidden="true" />
              Cancel
            </Button>
          ) : (
            <Button
              onClick={handleTestConnection}
              disabled={!isConfigValid}
              className="flex-1"
              aria-describedby={!isConfigValid ? 'config-required-hint' : undefined}
            >
              {status === 'idle' ? (
                <>
                  <Wifi className="mr-2 h-4 w-4" aria-hidden="true" />
                  Test Connection
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Retest Connection
                </>
              )}
            </Button>
          )}
        </div>

        {!isConfigValid && (
          <p id="config-required-hint" className="text-xs text-muted-foreground">
            Configure an endpoint URL above before testing
          </p>
        )}

        {/* Last tested timestamp - from persistent store */}
        {storeConnectionStatus.lastTestedAt && status !== 'testing' && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden="true" />
            <span>
              Last tested: {formatRelativeTime(storeConnectionStatus.lastTestedAt)}
              {storeConnectionStatus.latencyMs !== null && (
                <span className="ml-1">({storeConnectionStatus.latencyMs}ms)</span>
              )}
            </span>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <Alert
              variant={testResult.success ? 'default' : 'destructive'}
              aria-live={testResult.success ? 'polite' : 'assertive'}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mt-0.5" aria-hidden="true" />
                  )}
                  <div className="flex-1">
                    <AlertTitle className="mb-1">
                      {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                    </AlertTitle>
                    <AlertDescription>
                      <span>{testResult.message}</span>
                      {testResult.latencyMs > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({testResult.latencyMs}ms)
                        </span>
                      )}
                    </AlertDescription>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      aria-label={showDetails ? 'Hide details' : 'Show details'}
                    >
                      {showDetails ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={handleDismiss}
                    aria-label="Dismiss result"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <CollapsibleContent className="mt-3 space-y-3">
                {/* Status code */}
                {testResult.statusCode !== undefined && (
                  <div className="text-xs">
                    <span className="font-medium">HTTP Status:</span>{' '}
                    <code className="bg-muted px-1 rounded">{testResult.statusCode}</code>
                  </div>
                )}

                {/* Response preview */}
                {testResult.responsePreview && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Response Preview:</span>
                    <pre className="p-2 bg-muted rounded text-xs font-mono overflow-auto max-h-32 whitespace-pre-wrap">
                      {testResult.responsePreview}
                    </pre>
                  </div>
                )}

                {/* Troubleshooting hints */}
                {testResult.troubleshooting && testResult.troubleshooting.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">Troubleshooting:</span>
                    <ul className="list-disc list-inside space-y-0.5">
                      {testResult.troubleshooting.map((hint, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          {hint}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CollapsibleContent>
            </Alert>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Standalone connection status indicator for use in headers/sidebars.
 * Reads from the persistent store to show connection status without testing capabilities.
 */
interface ConnectionStatusIndicatorProps {
  className?: string
  showLabel?: boolean
}

export function ConnectionStatusIndicator({
  className,
  showLabel = true,
}: ConnectionStatusIndicatorProps) {
  const { connectionStatus } = useRemoteAgentStore()

  const status = mapStoreStatus(connectionStatus.status)

  const StatusIcon = () => {
    switch (status) {
      case 'connected':
        return <Wifi className="h-3 w-3" aria-hidden="true" />
      case 'failed':
        return <WifiOff className="h-3 w-3" aria-hidden="true" />
      default:
        return <Wifi className="h-3 w-3" aria-hidden="true" />
    }
  }

  const tooltipContent = [
    `Status: ${STATUS_LABELS[status]}`,
    connectionStatus.lastTestedAt && `Last tested: ${formatRelativeTime(connectionStatus.lastTestedAt)}`,
    connectionStatus.latencyMs !== null && `Latency: ${connectionStatus.latencyMs}ms`,
    connectionStatus.statusCode !== null && `HTTP Status: ${connectionStatus.statusCode}`,
    connectionStatus.errorMessage && `Error: ${connectionStatus.errorMessage}`,
  ].filter(Boolean).join('\n')

  return (
    <div
      className={cn('flex items-center', className)}
      role="status"
      aria-label={`Connection status: ${STATUS_LABELS[status]}`}
      title={tooltipContent}
    >
      <Badge
        variant="secondary"
        className={cn('flex items-center gap-1.5 cursor-default', STATUS_COLORS[status])}
      >
        <StatusIcon />
        {showLabel && <span className="text-xs">{STATUS_LABELS[status]}</span>}
      </Badge>
    </div>
  )
}
