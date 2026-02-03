'use client'

import * as React from 'react'

/**
 * Custom hook to detect media query matches
 *
 * @param query - CSS media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  // Default to false for SSR - will update on client
  const [matches, setMatches] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)

    // Check if matchMedia is available (browser environment)
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }

    const mediaQueryList = window.matchMedia(query)

    // Set initial value
    setMatches(mediaQueryList.matches)

    // Create listener function
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // Modern browsers
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', listener)
    } else {
      // Fallback for older browsers
      mediaQueryList.addListener(listener)
    }

    // Cleanup
    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', listener)
      } else {
        // Fallback for older browsers
        mediaQueryList.removeListener(listener)
      }
    }
  }, [query])

  // Return false during SSR to avoid hydration mismatch
  if (!mounted) {
    return false
  }

  return matches
}

/**
 * Predefined media query hooks for common breakpoints
 * Matches Tailwind CSS breakpoints
 */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 768px)')
}

export function useIsTablet(): boolean {
  const isAboveMobile = useMediaQuery('(min-width: 768px)')
  const isBelowDesktop = !useMediaQuery('(min-width: 1024px)')
  return isAboveMobile && isBelowDesktop
}

export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

/**
 * Hook for detecting touch-capable devices
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)

    if (typeof window === 'undefined') {
      return
    }

    // Check for touch support
    const hasTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0

    setIsTouch(hasTouch)
  }, [])

  if (!mounted) {
    return false
  }

  return isTouch
}
