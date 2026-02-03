'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Key, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'

// Placeholder for future API key management
// This component shows the skeleton UI without actual API integration

export function APIKeysSettings() {
  const [showKey, setShowKey] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [copyError, setCopyError] = React.useState(false)
  const placeholderKey = 'sk-rc-••••••••••••••••••••••••'
  const revealedKey = 'sk-rc-demo-key-not-functional'

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(revealedKey)
      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in some contexts (e.g., insecure context, permissions)
      console.warn('[APIKeys] Failed to copy to clipboard')
      setCopyError(true)
      setTimeout(() => setCopyError(false), 3000)
    }
  }, [])

  return (
    <div className="space-y-6" role="group" aria-labelledby="api-keys-heading">
      <h3 id="api-keys-heading" className="sr-only">
        API keys management
      </h3>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <Label className="text-base">API Key</Label>
          <Badge variant="secondary" className="text-xs">
            Demo
          </Badge>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              value={showKey ? revealedKey : placeholderKey}
              readOnly
              className="pr-10 font-mono text-sm"
              aria-label="API key"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopy}
            aria-label={copied ? 'Copied!' : 'Copy API key'}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {copied && (
          <p className="text-sm text-green-600 dark:text-green-400" role="status" aria-live="polite">
            Copied to clipboard!
          </p>
        )}

        {copyError && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert" aria-live="assertive">
            Failed to copy. Please select and copy manually.
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          Use this API key to authenticate requests to The Red Council API.
        </p>
      </div>

      <div className="border-t pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Generate New Key</Label>
            <p className="text-sm text-muted-foreground">
              Create a new API key. Your current key will be revoked.
            </p>
          </div>
          <Button variant="outline" disabled aria-disabled="true">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Generate
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          API key generation is not available in demo mode.
        </p>
      </div>

      <div className="border-t pt-6">
        <div className="space-y-2">
          <Label className="text-base">Usage Statistics</Label>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground">Requests Today</p>
              <p className="text-2xl font-bold tabular-nums">0</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-muted-foreground">Last Used</p>
              <p className="text-lg font-medium">Never</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
