'use client'

import * as React from 'react'
import { Plus, Trash2, AlertTriangle, Check, X, FlaskConical, Shield } from 'lucide-react'
import { useSettingsStore, MemoryPolicy as IMemoryPolicy, AccessLevel, PolicyAction } from '@/stores/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

export function MemoryPolicy() {
  const memoryPolicies = useSettingsStore((state) => state.agent.memoryPolicies || [])
  const updateAgentSettings = useSettingsStore((state) => state.updateAgentSettings)

  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  const [newPolicy, setNewPolicy] = React.useState<Partial<IMemoryPolicy>>({
    name: '',
    pattern: '',
    accessLevels: ['read'],
    action: 'alert',
    enabled: true
  })
  const [testPattern, setTestPattern] = React.useState('')
  const [testResult, setTestResult] = React.useState<{ match: boolean; policy?: IMemoryPolicy } | null>(null)

  // Heuristic for simple ReDoS protection
  const isSafeRegex = (pattern: string) => {
    if (pattern.length > 100) return false // Length limit
    // Detect nested quantifiers like (a+)+
    const evilRegex = /\([^)]*(\+|\*|\{[^}]+\})[^)]*\)[\+\*\{]/
    return !evilRegex.test(pattern)
  }

  const isValidRegex = (pattern: string) => {
    try {
      if (!isSafeRegex(pattern)) return false
      new RegExp(pattern)
      return true
    } catch {
      return false
    }
  }

  const handleAddPolicy = () => {
    if (!newPolicy.name || !newPolicy.pattern || !isValidRegex(newPolicy.pattern)) return

    const policy: IMemoryPolicy = {
      id: crypto.randomUUID(),
      name: newPolicy.name,
      pattern: newPolicy.pattern,
      accessLevels: newPolicy.accessLevels as AccessLevel[],
      action: newPolicy.action as PolicyAction,
      enabled: true
    }

    // Use getState() to avoid stale closure issues
    const currentPolicies = useSettingsStore.getState().agent.memoryPolicies || []
    updateAgentSettings({
      memoryPolicies: [...currentPolicies, policy]
    })
    setIsAddDialogOpen(false)
    setNewPolicy({
      name: '',
      pattern: '',
      accessLevels: ['read'],
      action: 'alert',
      enabled: true
    })
  }

  const handleDeletePolicy = (id: string) => {
    const currentPolicies = useSettingsStore.getState().agent.memoryPolicies || []
    updateAgentSettings({
      memoryPolicies: currentPolicies.filter(p => p.id !== id)
    })
  }

  const handleTestPattern = () => {
    if (!testPattern) {
      setTestResult(null)
      return
    }

    const matchedPolicy = memoryPolicies.find(p => {
        if (!p.enabled) return false
        try {
            // Re-validate safety before execution
            if (!isSafeRegex(p.pattern)) return false
            return new RegExp(p.pattern).test(testPattern)
        } catch {
            return false
        }
    })

    setTestResult({
      match: !!matchedPolicy,
      policy: matchedPolicy
    })
  }

  const toggleAccessLevel = (level: AccessLevel) => {
    const current = newPolicy.accessLevels || []
    const updated = current.includes(level)
      ? current.filter(l => l !== level)
      : [...current, level]
    setNewPolicy({ ...newPolicy, accessLevels: updated })
  }

  return (
    <div className="space-y-6" role="region" aria-labelledby="memory-policy-heading">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 id="memory-policy-heading" className="text-lg font-medium">Memory Access Policies</h3>
          <p className="text-sm text-muted-foreground">
            Configure rules to detect, alert, or block sensitive memory access patterns
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Policy
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Memory Policy</DialogTitle>
              <DialogDescription>
                Define a regex pattern to monitor in agent memory.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="policy-name">Policy Name</Label>
                <Input
                  id="policy-name"
                  value={newPolicy.name}
                  onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
                  placeholder="e.g. Block PII"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-pattern">Regex Pattern (Max 100 chars)</Label>
                <Input
                  id="policy-pattern"
                  value={newPolicy.pattern}
                  onChange={(e) => setNewPolicy({ ...newPolicy, pattern: e.target.value })}
                  placeholder="e.g. \b\d{3}-\d{2}-\d{4}\b"
                  className={cn(
                    newPolicy.pattern && !isValidRegex(newPolicy.pattern) && "border-red-500 focus-visible:ring-red-500"
                  )}
                />
                {newPolicy.pattern && !isValidRegex(newPolicy.pattern) && (
                  <p className="text-xs text-red-500">Invalid or unsafe regular expression</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Access Levels</Label>
                <div className="flex gap-4">
                  {['read', 'write', 'delete'].map((level) => (
                    <div key={level} className="flex items-center space-x-2">
                      <Checkbox
                        id={`access-${level}`}
                        checked={newPolicy.accessLevels?.includes(level as AccessLevel)}
                        onCheckedChange={() => toggleAccessLevel(level as AccessLevel)}
                      />
                      <Label htmlFor={`access-${level}`} className="capitalize">{level}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="policy-action">Action</Label>
                <Select
                  value={newPolicy.action}
                  onValueChange={(val) => setNewPolicy({ ...newPolicy, action: val as PolicyAction })}
                >
                  <SelectTrigger id="policy-action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Allow (Log Only)</SelectItem>
                    <SelectItem value="alert">Alert (Warning)</SelectItem>
                    <SelectItem value="deny">Deny (Block)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleAddPolicy} 
                disabled={!newPolicy.name || !newPolicy.pattern || !isValidRegex(newPolicy.pattern) || newPolicy.accessLevels?.length === 0}
              >
                Add Policy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Test Pattern
          </CardTitle>
          <CardDescription>
            Verify your policies against sample text
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter sample text to test (e.g. user@example.com)"
              value={testPattern}
              onChange={(e) => setTestPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTestPattern()}
            />
            <Button variant="secondary" onClick={handleTestPattern}>Test</Button>
          </div>
          {testResult && (
            <Alert 
              variant={testResult.match ? (testResult.policy?.action === 'deny' ? 'destructive' : 'default') : 'default'} 
              className={cn(!testResult.match && "bg-muted")}
              role="alert"
              aria-live={testResult.match ? (testResult.policy?.action === 'deny' ? 'assertive' : 'polite') : 'polite'}
            >
              {testResult.match ? (
                  testResult.policy?.action === 'deny' ? <AlertTriangle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                  <Check className="h-4 w-4 text-green-500" />
              )}
              <AlertTitle>{testResult.match ? 'Policy Match Detected' : 'No Policy Violation'}</AlertTitle>
              <AlertDescription>
                {testResult.match 
                  ? `Matched "${testResult.policy?.name}" - Action: ${testResult.policy?.action.toUpperCase()}`
                  : "Input text does not trigger any active policies."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {memoryPolicies.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
            No memory policies configured
          </div>
        ) : (
          <div className="grid gap-4">
            {memoryPolicies.map((policy) => (
              <div
                key={policy.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium leading-none">{policy.name}</h4>
                    <Badge variant={policy.action === 'deny' ? 'destructive' : policy.action === 'alert' ? 'default' : 'secondary'} className="capitalize">
                      {policy.action}
                    </Badge>
                    {!policy.enabled && <Badge variant="outline">Disabled</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded inline-block">
                    {policy.pattern}
                  </p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    {policy.accessLevels.map(level => (
                        <span key={level} className="capitalize flex items-center gap-1">
                            <Shield className="h-3 w-3" /> {level}
                        </span>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeletePolicy(policy.id)}
                  aria-label={`Delete policy ${policy.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
