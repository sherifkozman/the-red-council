import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { TemplatePreview, TemplatePreviewProps } from './TemplatePreview';
import { AttackTemplate } from '@/data/owasp-categories';

// ============================================================================
// Test Data
// ============================================================================
const createMockTemplate = (overrides: Partial<AttackTemplate> = {}): AttackTemplate => ({
  id: 'test-template-001',
  prompt: 'This is a test prompt for the attack template.',
  expected_behavior: 'The agent should not reveal any sensitive information.',
  severity: 7,
  owasp_categories: ['ASI01', 'ASI04'],
  requires_tool_access: true,
  requires_memory_access: false,
  source: 'HarmBench',
  ...overrides,
});

const defaultProps: TemplatePreviewProps = {
  template: createMockTemplate(),
  isSelected: false,
  onClose: vi.fn(),
  onToggleSelection: vi.fn(),
};

const renderComponent = (props: Partial<TemplatePreviewProps> = {}) => {
  return render(<TemplatePreview {...defaultProps} {...props} />);
};

// ============================================================================
// Mock clipboard
// ============================================================================
const mockClipboard = {
  writeText: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, {
    clipboard: mockClipboard,
  });
  mockClipboard.writeText.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Tests
// ============================================================================
describe('TemplatePreview', () => {
  describe('Rendering', () => {
    it('renders nothing when template is null', () => {
      const { container } = renderComponent({ template: null });
      // Sheet should not render content when template is null
      expect(container.textContent).toBe('');
    });

    it('renders template ID as title', () => {
      renderComponent();
      expect(screen.getByText('test-template-001')).toBeInTheDocument();
    });

    it('renders severity badge with correct value', () => {
      renderComponent();
      expect(screen.getByText(/Severity: 7\/10/)).toBeInTheDocument();
    });

    it('renders source badge', () => {
      renderComponent();
      expect(screen.getByText('HarmBench')).toBeInTheDocument();
    });

    it('renders OWASP category badges', () => {
      renderComponent();
      expect(screen.getByText(/ASI01/)).toBeInTheDocument();
      expect(screen.getByText(/ASI04/)).toBeInTheDocument();
    });

    it('renders expected behavior when provided', () => {
      renderComponent();
      expect(
        screen.getByText('The agent should not reveal any sensitive information.')
      ).toBeInTheDocument();
    });

    it('renders prompt content', () => {
      renderComponent();
      expect(
        screen.getByText('This is a test prompt for the attack template.')
      ).toBeInTheDocument();
    });

    it('renders tool access requirement when true', () => {
      renderComponent({
        template: createMockTemplate({ requires_tool_access: true }),
      });
      expect(screen.getByText('Tool Access Required')).toBeInTheDocument();
    });

    it('renders memory access requirement when true', () => {
      renderComponent({
        template: createMockTemplate({ requires_memory_access: true }),
      });
      expect(screen.getByText('Memory Access Required')).toBeInTheDocument();
    });

    it('does not render requirements section when no requirements', () => {
      renderComponent({
        template: createMockTemplate({
          requires_tool_access: false,
          requires_memory_access: false,
        }),
      });
      expect(screen.queryByText('Tool Access Required')).not.toBeInTheDocument();
      expect(screen.queryByText('Memory Access Required')).not.toBeInTheDocument();
    });

    it('does not render expected behavior section when empty', () => {
      renderComponent({
        template: createMockTemplate({ expected_behavior: '' }),
      });
      expect(screen.queryByText('Expected Behavior')).not.toBeInTheDocument();
    });
  });

  describe('OWASP Categories', () => {
    it('shows category name for known categories', () => {
      renderComponent({
        template: createMockTemplate({ owasp_categories: ['ASI01'] }),
      });
      expect(screen.getByText(/ASI01 - Excessive Agency/)).toBeInTheDocument();
    });

    it('shows "No categories assigned" when empty', () => {
      renderComponent({
        template: createMockTemplate({ owasp_categories: [] }),
      });
      expect(screen.getByText('No categories assigned')).toBeInTheDocument();
    });

    it('handles unknown category codes gracefully', () => {
      renderComponent({
        template: createMockTemplate({ owasp_categories: ['UNKNOWN'] }),
      });
      expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    });
  });

  describe('Source Display', () => {
    it('renders different source types correctly', () => {
      const sources = ['HarmBench', 'PyRIT', 'garak', 'AgentDojo', 'InjecAgent', 'Custom'] as const;

      sources.forEach((source) => {
        const { unmount } = renderComponent({
          template: createMockTemplate({ source }),
        });
        expect(screen.getByText(source)).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Selection Actions', () => {
    it('shows "Add to Selection" button when not selected', () => {
      renderComponent({ isSelected: false });
      expect(screen.getByText('Add to Selection')).toBeInTheDocument();
    });

    it('shows "Selected" button when selected', () => {
      renderComponent({ isSelected: true });
      expect(screen.getByText('Selected')).toBeInTheDocument();
    });

    it('calls onToggleSelection when clicking add button', () => {
      const onToggleSelection = vi.fn();
      renderComponent({ isSelected: false, onToggleSelection });

      fireEvent.click(screen.getByText('Add to Selection'));
      expect(onToggleSelection).toHaveBeenCalledWith('test-template-001', true);
    });

    it('calls onToggleSelection with false when clicking selected button', () => {
      const onToggleSelection = vi.fn();
      renderComponent({ isSelected: true, onToggleSelection });

      fireEvent.click(screen.getByText('Selected'));
      expect(onToggleSelection).toHaveBeenCalledWith('test-template-001', false);
    });

    it('does not show selection button when onToggleSelection is not provided', () => {
      renderComponent({ onToggleSelection: undefined });
      expect(screen.queryByText('Add to Selection')).not.toBeInTheDocument();
      expect(screen.queryByText('Selected')).not.toBeInTheDocument();
    });
  });

  describe('Close Actions', () => {
    it('calls onClose when clicking Close button', () => {
      const onClose = vi.fn();
      renderComponent({ onClose });

      // Get the Close button in the footer (not the sr-only one)
      const closeButtons = screen.getAllByText('Close');
      const footerCloseButton = closeButtons.find(
        (el) => el.tagName.toLowerCase() === 'button' || el.closest('button')
      );
      fireEvent.click(footerCloseButton!);
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when clicking X button', () => {
      const onClose = vi.fn();
      renderComponent({ onClose });

      fireEvent.click(screen.getByLabelText('Close preview'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Copy Functionality', () => {
    it('copies prompt to clipboard when clicking copy button', async () => {
      renderComponent();

      const copyButton = screen.getByLabelText('Copy prompt');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith(
          'This is a test prompt for the attack template.'
        );
      });
    });

    it('shows success state after copying', async () => {
      renderComponent();

      const copyButton = screen.getByLabelText('Copy prompt');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByLabelText('Copied to clipboard')).toBeInTheDocument();
      });
    });

    it('shows error state when copy fails', async () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Copy failed'));
      renderComponent();

      const copyButton = screen.getByLabelText('Copy prompt');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByLabelText('Failed to copy')).toBeInTheDocument();
      });
    });
  });

  describe('Long Content Handling', () => {
    it('truncates very long prompts', () => {
      const longPrompt = 'A'.repeat(6000);
      renderComponent({
        template: createMockTemplate({ prompt: longPrompt }),
      });

      // Should show truncation message
      expect(screen.getByText(/Showing first 5000 characters/)).toBeInTheDocument();
    });

    it('does not show truncation message for short prompts', () => {
      renderComponent({
        template: createMockTemplate({ prompt: 'Short prompt' }),
      });

      expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument();
    });
  });

  describe('Severity Display', () => {
    it('applies correct styling for high severity (7+)', () => {
      renderComponent({
        template: createMockTemplate({ severity: 8 }),
      });
      expect(screen.getByText(/Severity: 8\/10/)).toBeInTheDocument();
    });

    it('applies correct styling for medium severity (4-6)', () => {
      renderComponent({
        template: createMockTemplate({ severity: 5 }),
      });
      expect(screen.getByText(/Severity: 5\/10/)).toBeInTheDocument();
    });

    it('applies correct styling for low severity (1-3)', () => {
      renderComponent({
        template: createMockTemplate({ severity: 2 }),
      });
      expect(screen.getByText(/Severity: 2\/10/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible description', () => {
      renderComponent();
      expect(
        screen.getByText('Attack template details and prompt content')
      ).toBeInTheDocument();
    });

    it('prompt content has aria-label', () => {
      renderComponent();
      expect(screen.getByLabelText('Prompt content')).toBeInTheDocument();
    });

    it('close button has aria-label', () => {
      renderComponent();
      expect(screen.getByLabelText('Close preview')).toBeInTheDocument();
    });

    it('copy button has aria-label', () => {
      renderComponent();
      expect(screen.getByLabelText('Copy prompt')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles template with all fields empty/minimal', () => {
      renderComponent({
        template: createMockTemplate({
          id: 'minimal',
          prompt: 'test',
          expected_behavior: '',
          owasp_categories: [],
          requires_tool_access: false,
          requires_memory_access: false,
          severity: 1,
        }),
      });

      expect(screen.getByText('minimal')).toBeInTheDocument();
      expect(screen.getByText('test')).toBeInTheDocument();
      expect(screen.getByText('No categories assigned')).toBeInTheDocument();
    });

    it('handles unknown source gracefully', () => {
      renderComponent({
        template: createMockTemplate({ source: 'UnknownSource' as any }),
      });
      // Should fall back to Custom styling
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    it('escapes HTML in prompt content', () => {
      const { container } = renderComponent({
        template: createMockTemplate({
          prompt: '<script>alert("xss")</script>',
        }),
      });
      // Verify no script tags are created in the DOM (XSS prevention)
      expect(container.querySelector('script')).toBeNull();
      // The text content should contain the escaped text displayed as text
      const promptContent = screen.getByLabelText('Prompt content');
      expect(promptContent.textContent).toBeTruthy();
    });

    it('escapes HTML in expected behavior', () => {
      const { container } = renderComponent({
        template: createMockTemplate({
          expected_behavior: '<img src=x onerror=alert(1)>',
        }),
      });
      // Verify no img tags with onerror are created (XSS prevention)
      const imgs = container.querySelectorAll('img[onerror]');
      expect(imgs.length).toBe(0);
      // The expected behavior section should exist
      expect(screen.getByText('Expected Behavior')).toBeInTheDocument();
    });
  });
});
