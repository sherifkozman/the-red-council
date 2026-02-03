import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ShortcutsModal } from './ShortcutsModal'
import * as SettingsStore from '@/stores/settings'

// Mock settings store
vi.mock('@/stores/settings', () => ({
  useSettingsStore: vi.fn()
}))

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('ShortcutsModal', () => {
  const mockShortcuts = {
    runEvaluation: 'alt+e',
    generateReport: 'alt+r',
    loadDemo: 'alt+d',
    commandPalette: 'alt+k',
    help: 'shift+/',
  }

  beforeEach(() => {
    vi.mocked(SettingsStore.useSettingsStore).mockReturnValue({
      shortcuts: mockShortcuts
    } as any)
  })

  it('renders nothing when closed', () => {
    render(<ShortcutsModal open={false} onOpenChange={vi.fn()} />)
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()
  })

  it('renders shortcuts when open', () => {
    render(<ShortcutsModal open={true} onOpenChange={vi.fn()} />)
    
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
    expect(screen.getByText('Run Evaluation')).toBeInTheDocument()
    expect(screen.getByText('Generate Report')).toBeInTheDocument()
    expect(screen.getByText('Load Demo')).toBeInTheDocument()
    
    // Check for keys (split by +)
    expect(screen.getAllByText('alt')[0]).toBeInTheDocument()
    expect(screen.getByText('e')).toBeInTheDocument()
    expect(screen.getAllByText('shift')[0]).toBeInTheDocument()
    expect(screen.getByText('/')).toBeInTheDocument()
  })

  it('displays correct description for each action', () => {
    render(<ShortcutsModal open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText('Start a new evaluation run')).toBeInTheDocument()
    expect(screen.getByText('Open global command palette')).toBeInTheDocument()
  })
})
