import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EmptyState } from './EmptyState'
import { Inbox } from 'lucide-react'

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="No items found"
        description="Try adjusting your filters"
        icon={Inbox}
      />
    )
    expect(screen.getByText('No items found')).toBeInTheDocument()
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument()
  })

  it('renders with correct heading level', () => {
    const { container } = render(
      <EmptyState
        title="Heading Test"
        description="Desc"
        headingLevel={2}
      />
    )
    expect(container.querySelector('h2')).toHaveTextContent('Heading Test')
  })

  it('handles async action clicks and loading state', async () => {
    const onClick = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <EmptyState
        title="Async Action"
        description="Click me"
        action={{ label: 'Click', onClick }}
      />
    )
    
    const button = screen.getByRole('button', { name: 'Click' })
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()

    // Test loading state
    rerender(
      <EmptyState
        title="Async Action"
        description="Click me"
        action={{ label: 'Click', onClick }}
        isActionLoading={true}
      />
    )
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('handles action errors', async () => {
    const error = new Error('Failed')
    const onClick = vi.fn().mockRejectedValue(error)
    const onActionError = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <EmptyState
        title="Error Action"
        description="Click me"
        action={{ label: 'Click', onClick }}
        onActionError={onActionError}
      />
    )
    
    fireEvent.click(screen.getByRole('button'))
    
    await waitFor(() => {
      expect(onActionError).toHaveBeenCalledWith(error)
    })
    
    consoleSpy.mockRestore()
  })

  it('validates safe hrefs', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    render(
      <EmptyState
        title="Unsafe Link"
        description="Don't click"
        action={{ label: 'Unsafe', href: 'javascript:alert(1)' }}
      />
    )
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Potentially unsafe href detected'), 
      'javascript:alert(1)'
    )
    consoleSpy.mockRestore()
  })

  it('supports accessible icon labels', () => {
    render(
      <EmptyState
        title="Accessible Icon"
        description="Desc"
        icon={Inbox}
        iconLabel="Inbox Icon"
      />
    )
    const iconWrapper = screen.getByRole('img', { name: 'Inbox Icon' })
    expect(iconWrapper).toBeInTheDocument()
  })
})
