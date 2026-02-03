import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryPolicy } from './MemoryPolicy'
import { useSettingsStore } from '@/stores/settings'

// Mock icons
vi.mock('lucide-react', () => ({
  Plus: () => <span data-testid="icon-plus">Plus</span>,
  Trash2: () => <span data-testid="icon-trash">Trash</span>,
  AlertTriangle: () => <span data-testid="icon-alert">Alert</span>,
  Check: () => <span data-testid="icon-check">Check</span>,
  CheckIcon: () => <span data-testid="icon-check">Check</span>, // For Checkbox component
  X: () => <span data-testid="icon-x">X</span>,
  FlaskConical: () => <span data-testid="icon-flask">Flask</span>,
  Shield: () => <span data-testid="icon-shield">Shield</span>
}))

// Mock UI components
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogTrigger: ({ children, asChild }: any) => <div onClick={(children?.props?.onClick)}>{children}</div>, // Pass onClick if present (usually handled by Radix)
  // Actually simplest way to trigger open in tests if we control state is just rendering content always
  // but if we want to simulate the click opening it, we rely on the component state.
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-root">
      <select 
        value={value} 
        onChange={e => onValueChange(e.target.value)}
        data-testid="select-native"
      >
        <option value="allow">Allow</option>
        <option value="alert">Alert</option>
        <option value="deny">Deny</option>
      </select>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}))

describe('MemoryPolicy', () => {
  const mockUpdateSettings = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    useSettingsStore.setState({
      agent: {
        defaultToolInterception: true,
        defaultMemoryMonitoring: true,
        defaultDivergenceThreshold: 0.5,
        autoStartEvaluation: false,
        memoryPolicies: [
          {
            id: '1',
            name: 'Existing Policy',
            pattern: 'test',
            accessLevels: ['read'],
            action: 'alert',
            enabled: true
          }
        ]
      },
      updateAgentSettings: mockUpdateSettings
    })
  })

  it('renders existing policies', () => {
    render(<MemoryPolicy />)
    expect(screen.getByText('Existing Policy')).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()
  })

  it('opens add dialog on button click', async () => {
    render(<MemoryPolicy />)
    const buttons = screen.getAllByRole('button', { name: /add policy/i })
    const addButton = buttons[0]
    fireEvent.click(addButton)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('validates and adds new policy', async () => {
    render(<MemoryPolicy />)
    
    // Open dialog
    const buttons = screen.getAllByRole('button', { name: /add policy/i })
    fireEvent.click(buttons[0])
    
    // Fill form
    fireEvent.change(screen.getByLabelText(/policy name/i), { target: { value: 'New Policy' } })
    fireEvent.change(screen.getByLabelText(/regex pattern/i), { target: { value: '^secret.*' } })
    
    // Select action (using our mocked select)
    fireEvent.change(screen.getByTestId('select-native'), { target: { value: 'deny' } })
    
    // Submit - find the button inside dialog
    const submitButton = buttons[buttons.length - 1]
    fireEvent.click(submitButton)
    
    expect(mockUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      memoryPolicies: expect.arrayContaining([
        expect.objectContaining({
          name: 'New Policy',
          pattern: '^secret.*',
          action: 'deny'
        })
      ])
    }))
  })

  it('prevents invalid regex', async () => {
    render(<MemoryPolicy />)
    const buttons = screen.getAllByRole('button', { name: /add policy/i })
    fireEvent.click(buttons[0])
    
    const input = screen.getByLabelText(/regex pattern/i)
    fireEvent.change(input, { target: { value: '[' } }) // Invalid regex
    
    expect(screen.getByText('Invalid or unsafe regular expression')).toBeInTheDocument()
    
    const submitButton = buttons[buttons.length - 1]
    expect(submitButton).toBeDisabled()
  })

  it('deletes policy on trash click', () => {
    render(<MemoryPolicy />)
    const trashButton = screen.getByLabelText('Delete policy Existing Policy')
    fireEvent.click(trashButton)
    
    expect(mockUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      memoryPolicies: []
    }))
  })

  it('tests pattern match correctly', () => {
    render(<MemoryPolicy />)
    
    const input = screen.getByPlaceholderText(/enter sample text/i)
    const testButton = screen.getByText('Test')
    
    // Test match
    fireEvent.change(input, { target: { value: 'test string' } })
    fireEvent.click(testButton)
    
    expect(screen.getByText('Policy Match Detected')).toBeInTheDocument()
    expect(screen.getByText(/Matched "Existing Policy"/)).toBeInTheDocument()
    
    // Test no match
    fireEvent.change(input, { target: { value: 'nomatch' } })
    fireEvent.click(testButton)
    
    expect(screen.getByText('No Policy Violation')).toBeInTheDocument()
  })

  it('handles empty test pattern', () => {
    render(<MemoryPolicy />)
    const testButton = screen.getByText('Test')
    fireEvent.click(testButton)
    expect(screen.queryByText('Policy Match Detected')).not.toBeInTheDocument()
    expect(screen.queryByText('No Policy Violation')).not.toBeInTheDocument()
  })

  it('toggles access levels', () => {
    render(<MemoryPolicy />)
    const buttons = screen.getAllByRole('button', { name: /add policy/i })
    fireEvent.click(buttons[0])

    const readCheckbox = screen.getByRole('checkbox', { name: /read/i })
    const writeCheckbox = screen.getByRole('checkbox', { name: /write/i })

    // Read is checked by default
    expect(readCheckbox).toHaveAttribute('aria-checked', 'true')

    // Toggle read off
    fireEvent.click(readCheckbox)
    expect(readCheckbox).toHaveAttribute('aria-checked', 'false')

    // Toggle write on
    fireEvent.click(writeCheckbox)
    expect(writeCheckbox).toHaveAttribute('aria-checked', 'true')
  })

  it('handles invalid regex in existing policy gracefully', () => {
    useSettingsStore.setState({
      agent: {
        ...useSettingsStore.getState().agent,
        memoryPolicies: [
          {
            id: 'broken',
            name: 'Broken Regex',
            pattern: '[', // Invalid
            accessLevels: ['read'],
            action: 'alert',
            enabled: true
          }
        ]
      }
    })

    render(<MemoryPolicy />)
    const input = screen.getByPlaceholderText(/enter sample text/i)
    const testButton = screen.getByText('Test')

    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.click(testButton)

    // Should not crash, and should not match
    expect(screen.getByText('No Policy Violation')).toBeInTheDocument()
  })

  it('ignores disabled policies during test', () => {
    useSettingsStore.setState({
      agent: {
        ...useSettingsStore.getState().agent,
        memoryPolicies: [
          {
            id: 'disabled-policy',
            name: 'Disabled Policy',
            pattern: 'test',
            accessLevels: ['read'],
            action: 'alert',
            enabled: false
          }
        ]
      }
    })

    render(<MemoryPolicy />)
    const input = screen.getByPlaceholderText(/enter sample text/i)
    const testButton = screen.getByText('Test')

    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.click(testButton)

    expect(screen.getByText('No Policy Violation')).toBeInTheDocument()
  })

  it('renders empty state when no policies', () => {
    useSettingsStore.setState({
      agent: {
        ...useSettingsStore.getState().agent,
        memoryPolicies: []
      }
    })

    render(<MemoryPolicy />)
    expect(screen.getByText('No memory policies configured')).toBeInTheDocument()
  })
})
