'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react'

import { useRemoteAgentStore, RemoteAgentConfig, AUTH_TYPES, REQUEST_FORMATS } from '@/stores/remoteAgent'
import { testRemoteConnection, ConnectionTestResult } from '@/lib/api/testConnection'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const formSchema = z.object({
  endpointUrl: z.string().url({ message: "Please enter a valid URL (e.g., http://localhost:8000/v1/chat)" }),
  timeout: z.number().min(5).max(120),
  authType: z.enum(AUTH_TYPES),
  authHeader: z.string().optional(),
  authToken: z.string().optional(),
  requestFormat: z.enum(REQUEST_FORMATS),
  customTemplate: z.string().optional(),
  responseJsonPath: z.string().optional(),
}).refine((data) => {
  if (data.requestFormat === 'custom' && data.customTemplate) {
    try {
      JSON.parse(data.customTemplate)
    } catch {
      return false
    }
  }
  return true
}, {
  message: "Custom template must be valid JSON",
  path: ["customTemplate"],
}).refine((data) => {
  if (data.authType === 'bearer' && !data.authToken) return false;
  return true;
}, {
  message: "Token is required for Bearer auth",
  path: ["authToken"],
}).refine((data) => {
  if (data.authType === 'api-key' && !data.authToken) return false;
  return true;
}, {
  message: "Key value is required for API Key auth",
  path: ["authToken"],
}).refine((data) => {
  if (data.authType === 'api-key' && !data.authHeader) return false;
  return true;
}, {
  message: "Header name is required for API Key auth",
  path: ["authHeader"],
})

export function RemoteAgentForm() {
  const { config, setConfig } = useRemoteAgentStore()
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: config,
    mode: 'onChange',
  })

  // Sync store updates to form if needed (e.g. reset)
  // Dependent only on config to avoid unnecessary resets
  useEffect(() => {
    // Only reset if the config actually changed from outside or initialized
    form.reset(config)
  }, [config])

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSaving(true)
    setSaveError(null)
    try {
      setConfig(values as RemoteAgentConfig)
    } catch (error) {
      console.error('Failed to save config:', error)
      setSaveError('Failed to save configuration. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleTestConnection() {
    const valid = await form.trigger()
    if (!valid) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: 'Please fix the validation errors before testing.',
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)
    
    const currentValues = form.getValues() as RemoteAgentConfig
    try {
      const result = await testRemoteConnection(currentValues)
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        latencyMs: 0,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const authType = form.watch('authType')
  const requestFormat = form.watch('requestFormat')

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Remote Agent Configuration</CardTitle>
        <CardDescription>
          Configure the connection details for your external agent API.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* Endpoint URL */}
            <FormField
              control={form.control}
              name="endpointUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endpoint URL</FormLabel>
                  <FormControl>
                    <Input placeholder="http://localhost:8000/v1/chat/completions" {...field} />
                  </FormControl>
                  <FormDescription>
                    The full HTTP URL where your agent accepts requests. Subject to server-side validation.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Timeout Slider */}
            <FormField
              control={form.control}
              name="timeout"
              render={({ field: { value, onChange } }) => (
                <FormItem>
                  <FormLabel>Request Timeout: {value}s</FormLabel>
                  <FormControl>
                    <Slider
                      min={5}
                      max={120}
                      step={1}
                      defaultValue={[value]}
                      onValueChange={(vals) => onChange(vals[0])}
                      aria-label="Request timeout in seconds"
                      aria-valuetext={`${value} seconds`}
                      aria-valuemin={5}
                      aria-valuemax={120}
                      aria-valuenow={value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Auth Type */}
              <FormField
                control={form.control}
                name="authType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authentication</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select auth type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="bearer">Bearer Token</SelectItem>
                        <SelectItem value="api-key">API Key Header</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Request Format */}
              <FormField
                control={form.control}
                name="requestFormat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Request Format</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI Compatible</SelectItem>
                        <SelectItem value="custom">Custom JSON</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Conditional Auth Fields */}
            {authType === 'bearer' && (
              <FormField
                control={form.control}
                name="authToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bearer Token</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" placeholder="sk-..." {...field} />
                    </FormControl>
                    <FormDescription>
                      Tokens are used in-memory only and are not stored after you close or reload this page.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {authType === 'api-key' && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="authHeader"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Header Name</FormLabel>
                      <FormControl>
                        <Input placeholder="X-API-Key" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="authToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key Value</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="off" placeholder="secret-key" {...field} />
                      </FormControl>
                      <FormDescription>
                        Not persisted.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Custom Template Fields */}
            {requestFormat === 'custom' && (
              <div className="space-y-4 border-l-2 border-muted pl-4">
                <FormField
                  control={form.control}
                  name="customTemplate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Request Template (JSON)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder='{"query": "{{prompt}}"}' 
                          className="font-mono text-xs h-24"
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>Use {"{{prompt}}"} as placeholder.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responseJsonPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Response JSON Path</FormLabel>
                      <FormControl>
                        <Input placeholder="response.output" className="font-mono" {...field} />
                      </FormControl>
                      <FormDescription>Dot notation to extract text (e.g. data.result)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Save Error Display */}
            {saveError && (
              <Alert variant="destructive" aria-live="assertive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Save Failed</AlertTitle>
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            )}

            {/* Test Results Display */}
            {testResult && (
              <Alert 
                variant={testResult.success ? "default" : "destructive"} 
                aria-live={testResult.success ? "polite" : "assertive"}
              >
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                )}
                <AlertTitle>{testResult.success ? "Connection Successful" : "Connection Failed"}</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col gap-1 mt-1">
                    <span>{testResult.message}</span>
                    {testResult.latencyMs > 0 && (
                      <span className="text-xs text-muted-foreground">Latency: {testResult.latencyMs}ms</span>
                    )}
                    {testResult.responsePreview && (
                      <pre className="mt-2 p-2 bg-muted rounded text-xs font-mono overflow-auto max-h-24">
                        {testResult.responsePreview}
                      </pre>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-between items-center pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleTestConnection}
                disabled={isTesting}
                aria-busy={isTesting}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>

              <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
