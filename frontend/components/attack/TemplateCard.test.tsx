import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { TemplateCard, TemplateCardProps } from './TemplateCard';
import { AttackTemplate, TemplateSource } from '@/data/owasp-categories';

// ============================================================================
// Test Data
// ============================================================================
const createMockTemplate = (overrides: Partial<AttackTemplate> = {}): AttackTemplate => ({
  id: 'test-template-001',
  prompt: 'This is a test prompt for security testing purposes.',
  expected_behavior: 'Agent should reject the request',
  severity: 7,
  owasp_categories: ['ASI01', 'ASI04'],
  requires_tool_access: true,
  requires_memory_access: false,
  source: 'HarmBench' as TemplateSource,
  ...overrides,
});

// ============================================================================
// Test Setup
// ============================================================================
beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

// ============================================================================
// Grid View Tests
// ============================================================================
describe('TemplateCard - Grid View', () => {
  const defaultProps: TemplateCardProps = {
    template: createMockTemplate(),
    isSelected: false,
    onSelect: vi.fn(),
    onPreview: vi.fn(),
    viewMode: 'grid',
  };

  it('renders template ID correctly', () => {
    render(<TemplateCard {...defaultProps} />);
    expect(screen.getByText('test-template-001')).toBeInTheDocument();
  });

  it('renders severity badge', () => {
    render(<TemplateCard {...defaultProps} />);
    expect(screen.getByText('7/10')).toBeInTheDocument();
  });

  it('renders OWASP category badges', () => {
    render(<TemplateCard {...defaultProps} />);
    expect(screen.getByText('ASI01')).toBeInTheDocument();
    expect(screen.getByText('ASI04')).toBeInTheDocument();
  });

  it('renders source badge', () => {
    render(<TemplateCard {...defaultProps} />);
    expect(screen.getByText('HarmBench')).toBeInTheDocument();
  });

  it('shows tool access indicator when required', () => {
    render(<TemplateCard {...defaultProps} />);
    expect(screen.getByText('Requires tool access')).toBeInTheDocument();
  });

  it('does not show memory access indicator when not required', () => {
    render(<TemplateCard {...defaultProps} />);
    expect(screen.queryByText('Requires memory access')).not.toBeInTheDocument();
  });

  it('shows memory access indicator when required', () => {
    const template = createMockTemplate({ requires_memory_access: true });
    render(<TemplateCard {...defaultProps} template={template} />);
    expect(screen.getByText('Requires memory access')).toBeInTheDocument();
  });

  it('shows checkbox as unchecked when not selected', () => {
    render(<TemplateCard {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('shows checkbox as checked when selected', () => {
    render(<TemplateCard {...defaultProps} isSelected={true} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('calls onSelect when checkbox is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateCard {...defaultProps} onSelect={onSelect} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onSelect).toHaveBeenCalledWith('test-template-001', true);
  });

  it('calls onSelect with false when deselecting', () => {
    const onSelect = vi.fn();
    render(<TemplateCard {...defaultProps} onSelect={onSelect} isSelected={true} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onSelect).toHaveBeenCalledWith('test-template-001', false);
  });

  it('calls onPreview when preview button is clicked', () => {
    const onPreview = vi.fn();
    render(<TemplateCard {...defaultProps} onPreview={onPreview} />);

    const previewButton = screen.getByRole('button', { name: /preview template/i });
    fireEvent.click(previewButton);

    expect(onPreview).toHaveBeenCalledWith(defaultProps.template);
  });

  it('toggles selection when card is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateCard {...defaultProps} onSelect={onSelect} />);

    const card = screen.getByRole('listitem');
    fireEvent.click(card);

    expect(onSelect).toHaveBeenCalledWith('test-template-001', true);
  });

  it('supports keyboard navigation with Enter key', () => {
    const onSelect = vi.fn();
    render(<TemplateCard {...defaultProps} onSelect={onSelect} />);

    const card = screen.getByRole('listitem');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('test-template-001', true);
  });

  it('supports keyboard navigation with Space key', () => {
    const onSelect = vi.fn();
    render(<TemplateCard {...defaultProps} onSelect={onSelect} />);

    const card = screen.getByRole('listitem');
    fireEvent.keyDown(card, { key: ' ' });

    expect(onSelect).toHaveBeenCalledWith('test-template-001', true);
  });

  it('truncates long prompts', () => {
    const longPrompt = 'A'.repeat(200);
    const template = createMockTemplate({ prompt: longPrompt });
    render(<TemplateCard {...defaultProps} template={template} />);

    // Should show truncated text with ellipsis
    expect(screen.getByText(/\.\.\.$/)).toBeInTheDocument();
  });

  it('shows +N badge for many OWASP categories', () => {
    const template = createMockTemplate({
      owasp_categories: ['ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05'],
    });
    render(<TemplateCard {...defaultProps} template={template} />);

    // Grid view shows 3 categories max, then +N
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('applies selected styling when selected', () => {
    render(<TemplateCard {...defaultProps} isSelected={true} />);

    const card = screen.getByRole('listitem');
    expect(card).toHaveClass('bg-accent');
    expect(card).toHaveClass('border-primary');
  });

  it('renders different severity badges based on level', () => {
    // Low severity
    const lowTemplate = createMockTemplate({ severity: 2 });
    const { rerender } = render(<TemplateCard {...defaultProps} template={lowTemplate} />);
    expect(screen.getByText('2/10')).toBeInTheDocument();

    // High severity
    const highTemplate = createMockTemplate({ severity: 9 });
    rerender(<TemplateCard {...defaultProps} template={highTemplate} />);
    expect(screen.getByText('9/10')).toBeInTheDocument();
  });
});

// ============================================================================
// List View Tests
// ============================================================================
describe('TemplateCard - List View', () => {
  const defaultProps: TemplateCardProps = {
    template: createMockTemplate(),
    isSelected: false,
    onSelect: vi.fn(),
    onPreview: vi.fn(),
    viewMode: 'list',
  };

  it('renders template ID in list view', () => {
    render(<TemplateCard {...defaultProps} />);
    expect(screen.getByText('test-template-001')).toBeInTheDocument();
  });

  it('renders severity badge in list view', () => {
    render(<TemplateCard {...defaultProps} />);
    expect(screen.getByText('7/10')).toBeInTheDocument();
  });

  it('shows only 2 OWASP categories in list view with +N for more', () => {
    const template = createMockTemplate({
      owasp_categories: ['ASI01', 'ASI02', 'ASI03', 'ASI04'],
    });
    render(<TemplateCard {...defaultProps} template={template} />);

    expect(screen.getByText('ASI01')).toBeInTheDocument();
    expect(screen.getByText('ASI02')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('calls onSelect when checkbox is clicked in list view', () => {
    const onSelect = vi.fn();
    render(<TemplateCard {...defaultProps} onSelect={onSelect} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onSelect).toHaveBeenCalledWith('test-template-001', true);
  });

  it('calls onPreview when preview button is clicked in list view', () => {
    const onPreview = vi.fn();
    render(<TemplateCard {...defaultProps} onPreview={onPreview} />);

    const previewButton = screen.getByRole('button', { name: /preview template/i });
    fireEvent.click(previewButton);

    expect(onPreview).toHaveBeenCalledWith(defaultProps.template);
  });

  it('toggles selection when list item is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateCard {...defaultProps} onSelect={onSelect} />);

    const listItem = screen.getByRole('listitem');
    fireEvent.click(listItem);

    expect(onSelect).toHaveBeenCalledWith('test-template-001', true);
  });

  it('does not toggle when clicking preview button', () => {
    const onSelect = vi.fn();
    const onPreview = vi.fn();
    render(<TemplateCard {...defaultProps} onSelect={onSelect} onPreview={onPreview} />);

    const previewButton = screen.getByRole('button', { name: /preview template/i });
    fireEvent.click(previewButton);

    // onSelect should not be called when clicking button
    expect(onSelect).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalled();
  });
});

// ============================================================================
// Source Variations Tests
// ============================================================================
describe('TemplateCard - Source Variations', () => {
  it.each([
    ['HarmBench', 'HarmBench'],
    ['PyRIT', 'PyRIT'],
    ['garak', 'garak'],
    ['AgentDojo', 'AgentDojo'],
    ['InjecAgent', 'InjecAgent'],
    ['Custom', 'Custom'],
  ])('renders %s source badge', (source, expectedLabel) => {
    const template = createMockTemplate({ source: source as TemplateSource });
    render(
      <TemplateCard
        template={template}
        isSelected={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        viewMode="grid"
      />
    );

    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});

// ============================================================================
// HTML Escaping Tests
// ============================================================================
describe('TemplateCard - Security', () => {
  it('escapes HTML in prompt text', () => {
    const template = createMockTemplate({
      prompt: '<script>alert("xss")</script>',
    });
    render(
      <TemplateCard
        template={template}
        isSelected={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        viewMode="grid"
      />
    );

    // The script tag should be escaped, not rendered as HTML
    expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
    // Should show the escaped text
    const promptText = screen.getByText(/&lt;script&gt;/);
    expect(promptText).toBeInTheDocument();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================
describe('TemplateCard - Accessibility', () => {
  it('has correct aria-selected attribute', () => {
    const { rerender } = render(
      <TemplateCard
        template={createMockTemplate()}
        isSelected={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        viewMode="grid"
      />
    );

    expect(screen.getByRole('listitem')).toHaveAttribute('aria-selected', 'false');

    rerender(
      <TemplateCard
        template={createMockTemplate()}
        isSelected={true}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        viewMode="grid"
      />
    );

    expect(screen.getByRole('listitem')).toHaveAttribute('aria-selected', 'true');
  });

  it('checkbox has accessible label', () => {
    render(
      <TemplateCard
        template={createMockTemplate()}
        isSelected={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        viewMode="grid"
      />
    );

    expect(screen.getByRole('checkbox', { name: /select template/i })).toBeInTheDocument();
  });

  it('preview button has accessible label', () => {
    render(
      <TemplateCard
        template={createMockTemplate()}
        isSelected={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        viewMode="grid"
      />
    );

    expect(screen.getByRole('button', { name: /preview template/i })).toBeInTheDocument();
  });

  it('card is focusable', () => {
    render(
      <TemplateCard
        template={createMockTemplate()}
        isSelected={false}
        onSelect={vi.fn()}
        onPreview={vi.fn()}
        viewMode="grid"
      />
    );

    const card = screen.getByRole('listitem');
    expect(card).toHaveAttribute('tabIndex', '0');
  });
});
