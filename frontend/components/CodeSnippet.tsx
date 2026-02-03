'use client'

import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CodeSnippetProps {
  language: string
  code: string
  className?: string
}

export function CodeSnippet({ language, code, className }: CodeSnippetProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <div className={cn('relative rounded-md overflow-hidden bg-zinc-950', className)}>
      <div className="absolute right-2 top-2 z-10">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 backdrop-blur-sm transition-colors",
            status === 'error' 
              ? "bg-red-900/50 hover:bg-red-800/50 text-red-200" 
              : "text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50"
          )}
          onClick={handleCopy}
          aria-label={
            status === 'copied' ? "Copied to clipboard" : 
            status === 'error' ? "Failed to copy" : 
            "Copy code"
          }
        >
          {status === 'copied' ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : status === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          borderRadius: '0.375rem',
          padding: '1.5rem',
          fontSize: '0.875rem',
          lineHeight: '1.5',
          background: 'transparent',
        }}
        showLineNumbers={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}