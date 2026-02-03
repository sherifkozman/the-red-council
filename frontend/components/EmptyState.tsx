'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import * as React from 'react'

type ButtonAction = {
  /**
   * Label for the action button. 
   * @warning Treat as untrusted input if sourced from user data.
   */
  label: string
  /**
   * Click handler. 
   * @warning Do not construct from untrusted strings (e.g. via new Function).
   */
  onClick: () => void | Promise<void>
  href?: never
}

type LinkAction = {
  /**
   * Label for the action link.
   * @warning Treat as untrusted input if sourced from user data.
   */
  label: string
  /**
   * Destination URL.
   * @warning Verify protocols if sourced from untrusted input to prevent open redirects or javascript: execution.
   */
  href: string
  onClick?: never
}

export type EmptyStateAction = ButtonAction | LinkAction

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Primary heading text.
   * @warning React escapes this by default, but avoid passing raw user HTML.
   */
  title: string
  /**
   * Secondary description text.
   * @warning React escapes this by default, but avoid passing raw user HTML.
   */
  description: string
  /**
   * Icon component to display.
   */
  icon?: React.ComponentType<{ className?: string }>
  /**
   * Primary action configuration.
   */
  action?: EmptyStateAction
  className?: string
  variant?: 'default' | 'demo'
  /**
   * Custom action node to render instead of the default action.
   * Must handle its own accessibility and loading states.
   */
  actionNode?: React.ReactNode
  /**
   * Level for the heading element (h1-h6). Defaults to 3.
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
  /**
   * Loading state for the action button.
   */
  isActionLoading?: boolean
  /**
   * Callback for async action errors.
   */
  onActionError?: (error: unknown) => void
  /**
   * Accessible label for the icon if it conveys meaning.
   * If omitted, icon is treated as decorative (aria-hidden).
   */
  iconLabel?: string
}

function isValidHref(href: string): boolean {
  if (href.startsWith('/')) return true
  try {
    const url = new URL(href)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)
  } catch {
    // If it's not absolute and doesn't start with /, it might be a relative path without leading slash
    // which is valid but we'll assume standard relative paths start with / for strictness, 
    // or allow simple relative paths.
    // Let's rely on it NOT being a dangerous protocol if it fails URL parsing (it's likely relative)
    // UNLESS it has a colon which might indicate a protocol.
    if (href.includes(':')) return false
    return true
  }
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
  variant = 'default',
  actionNode,
  headingLevel = 3,
  isActionLoading = false,
  onActionError,
  iconLabel,
  ...rest
}: EmptyStateProps) {
  const HeadingTag = `h${headingLevel}` as React.ElementType

  const handleActionClick = async () => {
    if (!action || !action.onClick) return
    try {
      await action.onClick()
    } catch (error) {
      onActionError?.(error)
      if (!onActionError) {
        console.error('EmptyState action failed:', error)
      }
    }
  }

  // Validate href if present
  if (action?.href && !isValidHref(action.href)) {
    console.warn('EmptyState: Potentially unsafe href detected:', action.href)
  }

  return (
    <Card 
      className={cn(
        'w-full border-dashed bg-muted/20 shadow-sm',
        variant === 'demo' && 'border-blue-200 bg-blue-50/20 dark:border-blue-800 dark:bg-blue-900/10',
        className
      )}
      role="region"
      aria-label={title}
      {...rest}
    >
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        {Icon && (
          <div 
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full bg-muted/50 mb-6",
              variant === 'demo' && 'bg-blue-100/50 dark:bg-blue-900/30'
            )}
            role={iconLabel ? "img" : "presentation"}
            aria-label={iconLabel}
            aria-hidden={!iconLabel}
          >
            <Icon 
              className={cn(
                "h-8 w-8",
                variant === 'demo' ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground/80"
              )} 
              aria-hidden="true" 
            />
          </div>
        )}
        
        <HeadingTag className="text-xl font-semibold tracking-tight mb-2">
          {title}
        </HeadingTag>
        
        <p className="text-sm text-muted-foreground max-w-[400px] mb-8 text-balance">
          {description}
        </p>

        {actionNode ?? (action && (
          action.href ? (
            <Button asChild variant={variant === 'demo' ? 'default' : 'secondary'} disabled={isActionLoading}>
              <Link href={action.href}>
                {isActionLoading ? 'Loading...' : action.label}
              </Link>
            </Button>
          ) : (
            <Button 
              onClick={handleActionClick}
              variant={variant === 'demo' ? 'default' : 'secondary'}
              disabled={isActionLoading}
            >
              {isActionLoading ? 'Loading...' : action.label}
            </Button>
          )
        ))}
      </CardContent>
    </Card>
  )
}
