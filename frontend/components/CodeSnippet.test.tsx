import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { CodeSnippet } from './CodeSnippet'

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
})

describe('CodeSnippet', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders code correctly', () => {
    const { container } = render(<CodeSnippet language="python" code="print('hello')" />)
    // Check text content of the container to handle syntax highlighting splits
    expect(container.textContent).toContain("print('hello')")
  })

  it('copies to clipboard on click', async () => {
    navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined)
    render(<CodeSnippet language="python" code="print('hello')" />)
    const button = screen.getByRole('button', { name: /copy code/i })
    
    fireEvent.click(button)
    
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("print('hello')")
    expect(await screen.findByRole('button', { name: /copied to clipboard/i })).toBeInTheDocument()
  })

  it('handles copy error', async () => {
    navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('Copy failed'))
    render(<CodeSnippet language="python" code="print('hello')" />)
    const button = screen.getByRole('button', { name: /copy code/i })
    
    fireEvent.click(button)
    
    expect(await screen.findByRole('button', { name: /failed to copy/i })).toBeInTheDocument()
  })
})
