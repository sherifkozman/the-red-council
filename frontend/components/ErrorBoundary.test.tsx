import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

const ThrowError = () => {
    throw new Error('Test Error')
}

describe('ErrorBoundary', () => {
    it('renders children when no error', () => {
        render(
            <ErrorBoundary>
                <div>Safe Content</div>
            </ErrorBoundary>
        )
        expect(screen.getByText('Safe Content')).toBeInTheDocument()
    })

    it('renders fallback when error occurs', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        
        render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        )
        
        expect(screen.getByText('Something went wrong')).toBeInTheDocument()
        consoleSpy.mockRestore()
    })

    it('renders custom fallback', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(
            <ErrorBoundary fallback={<div>Custom Error</div>}>
                <ThrowError />
            </ErrorBoundary>
        )
        expect(screen.getByText('Custom Error')).toBeInTheDocument()
        consoleSpy.mockRestore()
    })

    it('resets error state on try again', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { rerender } = render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        )
        
        const tryAgain = screen.getByText('Try again')
        
        // Replace ThrowError with safe content
        rerender(
            <ErrorBoundary>
                <div>Recovered</div>
            </ErrorBoundary>
        )
        // State is still hasError=true until clicked
        
        fireEvent.click(tryAgain)
        expect(screen.getByText('Recovered')).toBeInTheDocument()
        consoleSpy.mockRestore()
    })
})
