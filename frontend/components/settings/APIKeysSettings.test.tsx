import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { APIKeysSettings } from './APIKeysSettings'

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
}
Object.assign(navigator, { clipboard: mockClipboard })

describe('APIKeysSettings', () => {
  beforeEach(() => {
    mockClipboard.writeText.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  // ============================================================================
  // Rendering
  // ============================================================================
  describe('rendering', () => {
    it('renders API key label', () => {
      render(<APIKeysSettings />)

      expect(screen.getByText('API Key')).toBeInTheDocument()
    })

    it('renders demo badge', () => {
      render(<APIKeysSettings />)

      expect(screen.getByText('Demo')).toBeInTheDocument()
    })

    it('renders masked API key input', () => {
      render(<APIKeysSettings />)

      const input = screen.getByLabelText('API key')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('renders show/hide button', () => {
      render(<APIKeysSettings />)

      expect(screen.getByLabelText(/show api key/i)).toBeInTheDocument()
    })

    it('renders copy button', () => {
      render(<APIKeysSettings />)

      expect(screen.getByLabelText(/copy api key/i)).toBeInTheDocument()
    })

    it('renders generate button (disabled)', () => {
      render(<APIKeysSettings />)

      const generateButton = screen.getByRole('button', { name: /generate/i })
      expect(generateButton).toBeDisabled()
    })

    it('renders usage statistics', () => {
      render(<APIKeysSettings />)

      expect(screen.getByText('Usage Statistics')).toBeInTheDocument()
      expect(screen.getByText('Requests Today')).toBeInTheDocument()
      expect(screen.getByText('Last Used')).toBeInTheDocument()
    })

    it('has correct role and accessibility attributes', () => {
      render(<APIKeysSettings />)

      const group = screen.getByRole('group', { name: /api keys management/i })
      expect(group).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Show/Hide Key
  // ============================================================================
  describe('show/hide key', () => {
    it('toggles key visibility when show button clicked', () => {
      render(<APIKeysSettings />)

      const input = screen.getByLabelText('API key')
      const toggleButton = screen.getByLabelText(/show api key/i)

      expect(input).toHaveAttribute('type', 'password')

      fireEvent.click(toggleButton)

      expect(input).toHaveAttribute('type', 'text')
      expect(screen.getByLabelText(/hide api key/i)).toBeInTheDocument()
    })

    it('hides key when hide button clicked', () => {
      render(<APIKeysSettings />)

      const toggleButton = screen.getByLabelText(/show api key/i)

      // Show
      fireEvent.click(toggleButton)
      // Hide
      fireEvent.click(screen.getByLabelText(/hide api key/i))

      const input = screen.getByLabelText('API key')
      expect(input).toHaveAttribute('type', 'password')
    })
  })

  // ============================================================================
  // Copy to Clipboard
  // ============================================================================
  describe('copy to clipboard', () => {
    it('copies key to clipboard when copy button clicked', async () => {
      render(<APIKeysSettings />)

      const copyButton = screen.getByLabelText(/copy api key/i)
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith('sk-rc-demo-key-not-functional')
      })
    })

    it('shows copied confirmation message', async () => {
      render(<APIKeysSettings />)

      const copyButton = screen.getByLabelText(/copy api key/i)
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(screen.getByText(/copied to clipboard/i)).toBeInTheDocument()
      })
    })

    it('handles clipboard failure gracefully and shows error message', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard failed'))

      render(<APIKeysSettings />)

      const copyButton = screen.getByLabelText(/copy api key/i)
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('[APIKeys] Failed to copy to clipboard')
      })

      // Should show error message to user
      await waitFor(() => {
        expect(screen.getByText(/failed to copy/i)).toBeInTheDocument()
      })

      consoleSpy.mockRestore()
    })
  })
})
