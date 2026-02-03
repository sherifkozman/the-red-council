import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SDKPanel } from './SDKPanel'

// Mock ResizeObserver for Tabs
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

describe('SDKPanel', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: () => '123-456'
      },
      writable: true
    })
  })

  it('renders all tabs', () => {
    render(<SDKPanel />)
    expect(screen.getByRole('tab', { name: 'LangChain' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'LangGraph' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'MCP' })).toBeInTheDocument()
  })

  it('displays LangChain by default', () => {
    render(<SDKPanel />)
    // CardTitle renders a div, so we look for text
    expect(screen.getByText(/LangChain Integration/i)).toBeInTheDocument()
    expect(screen.getByRole('tabpanel', { name: 'LangChain' })).toBeInTheDocument()
  })

  it('switches tabs', async () => {
    const user = userEvent.setup()
    render(<SDKPanel />)
    const mcpTab = screen.getByRole('tab', { name: 'MCP' })
    
    await user.click(mcpTab)
    
    // Wait for the text to appear
    expect(await screen.findByText(/MCP Integration/i)).toBeInTheDocument()
  })
  
  it('injects session ID', () => {
    const { container } = render(<SDKPanel />)
    expect(container.textContent).toContain('123-456')
  })
})
