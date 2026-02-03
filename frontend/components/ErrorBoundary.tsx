'use client'

import React from 'react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex h-full flex-col items-center justify-center p-4 text-center">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="mb-4 text-sm text-muted-foreground">The application encountered an error.</p>
          <Button onClick={() => this.setState({ hasError: false })} variant="outline">
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
