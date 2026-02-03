'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CodeSnippet } from "@/components/CodeSnippet"
import { SDK_SNIPPETS } from "@/data/sdk-snippets"
import { Terminal, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function SDKPanel() {
  const [sessionId, setSessionId] = useState<string>("loading...")
  const [endpointUrl, setEndpointUrl] = useState("https://api.redcouncil.com")

  useEffect(() => {
    // TEMPORARY: Client-side ID generation until UI-034 (Session Persistence) is implemented.
    // In production, this should come from a secure server-side session.
    setSessionId(crypto.randomUUID())
    
    if (typeof window !== 'undefined') {
      setEndpointUrl(`${window.location.origin}/api/v1`)
    }
  }, []) // Empty dependency array is intentional: only run once on mount

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Connect Your Agent</h2>
        <p className="text-muted-foreground">
          Integrate your agent framework to start streaming events and tracking security metrics.
        </p>
      </div>

      <Alert variant="destructive" className="bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Security Warning</AlertTitle>
        <AlertDescription>
          Do not use <code>YOUR_API_KEY</code> in production. Set <code>RC_API_KEY</code> environment variable or use a secure secrets manager.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="langchain" className="w-full">
        <TabsList 
            className="w-full justify-start h-auto bg-muted/50 p-1 mb-4 flex-wrap"
            aria-label="Agent Framework Selection"
        >
          {SDK_SNIPPETS.map(snippet => (
            <TabsTrigger key={snippet.id} value={snippet.id} className="h-10 px-6">
              {snippet.name}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {SDK_SNIPPETS.map(snippet => (
          <TabsContent key={snippet.id} value={snippet.id} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5 text-primary" />
                  {snippet.name} Integration
                </CardTitle>
                <CardDescription>{snippet.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">1. Installation</h3>
                  <CodeSnippet 
                    language="bash" 
                    code={snippet.installation} 
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">2. Implementation</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Copy this code into your agent's entry point. The session ID and endpoint are pre-filled.
                  </p>
                  <CodeSnippet 
                    language={snippet.language} 
                    code={snippet.code(sessionId, endpointUrl)} 
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}