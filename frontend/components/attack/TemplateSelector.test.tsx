import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { TemplateSelector, TemplateSelectorProps } from './TemplateSelector';
import { AttackTemplate, TemplateSource } from '@/data/owasp-categories';

// ============================================================================
// Test Data
// ============================================================================
const createMockTemplate = (overrides: Partial<AttackTemplate> = {}): AttackTemplate => ({
  id: `template-${Math.random().toString(36).slice(2, 11)}`,
  prompt: 'Test prompt for security testing',
  expected_behavior: 'Agent should reject the request',
  severity: 5,
  owasp_categories: ['ASI01'],
  requires_tool_access: false,
  requires_memory_access: false,
  source: 'HarmBench' as TemplateSource,
  ...overrides,
});

const mockTemplates: AttackTemplate[] = [
  createMockTemplate({
    id: 'template-001',
    owasp_categories: ['ASI01', 'ASI04'],
    source: 'HarmBench',
    severity: 8,
  }),
  createMockTemplate({
    id: 'template-002',
    owasp_categories: ['ASI02'],
    source: 'PyRIT',
    severity: 5,
  }),
  createMockTemplate({
    id: 'template-003',
    owasp_categories: ['ASI07'],
    source: 'garak',
    severity: 3,
    requires_memory_access: true,
  }),
  createMockTemplate({
    id: 'template-004',
    owasp_categories: ['ASI01', 'ASI03'],
    source: 'AgentDojo',
    severity: 9,
    requires_tool_access: true,
  }),
];

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
// Rendering Tests
// ============================================================================
describe('TemplateSelector - Rendering', () => {
  const defaultProps: TemplateSelectorProps = {
    templates: mockTemplates,
    selectedTemplateIds: new Set(),
    onSelectionChange: vi.fn(),
  };

  it('renders template cards', () => {
    render(<TemplateSelector {...defaultProps} />);

    expect(screen.getByText('template-001')).toBeInTheDocument();
    expect(screen.getByText('template-002')).toBeInTheDocument();
  });

  it('renders filter sidebar', () => {
    render(<TemplateSelector {...defaultProps} />);

    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
  });

  it('renders view mode toggle', () => {
    render(<TemplateSelector {...defaultProps} />);

    expect(screen.getByRole('button', { name: /grid view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list view/i })).toBeInTheDocument();
  });

  it('renders template count in header', () => {
    render(<TemplateSelector {...defaultProps} />);

    expect(screen.getByText(/templates \(4\)/i)).toBeInTheDocument();
  });

  it('renders select all and deselect all buttons', () => {
    render(<TemplateSelector {...defaultProps} />);

    // There are multiple "All" buttons (for OWASP, sources, etc.) so use exact match
    expect(screen.getByRole('button', { name: 'Select All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deselect All' })).toBeInTheDocument();
  });
});

// ============================================================================
// Loading State Tests
// ============================================================================
describe('TemplateSelector - Loading State', () => {
  it('shows loading indicator when loading', () => {
    render(
      <TemplateSelector
        templates={[]}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
        isLoading={true}
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading attack templates/i)).toBeInTheDocument();
  });

  it('does not show templates when loading', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
        isLoading={true}
      />
    );

    expect(screen.queryByText('template-001')).not.toBeInTheDocument();
  });
});

// ============================================================================
// Error State Tests
// ============================================================================
describe('TemplateSelector - Error State', () => {
  it('shows error alert when error occurs', () => {
    render(
      <TemplateSelector
        templates={[]}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
        isError={true}
      />
    );

    expect(screen.getByText(/failed to load templates/i)).toBeInTheDocument();
  });

  it('shows retry button when error occurs', () => {
    const onRefresh = vi.fn();
    render(
      <TemplateSelector
        templates={[]}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
        isError={true}
        onRefresh={onRefresh}
      />
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(onRefresh).toHaveBeenCalled();
  });
});

// ============================================================================
// Empty State Tests
// ============================================================================
describe('TemplateSelector - Empty State', () => {
  it('shows empty message when no templates', () => {
    render(
      <TemplateSelector
        templates={[]}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByText(/no attack templates available/i)).toBeInTheDocument();
  });

  it('shows refresh button when no templates and onRefresh provided', () => {
    const onRefresh = vi.fn();
    render(
      <TemplateSelector
        templates={[]}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
        onRefresh={onRefresh}
      />
    );

    const refreshButton = screen.getByRole('button', { name: /refresh templates/i });
    expect(refreshButton).toBeInTheDocument();
  });

  it('shows no results message when filters exclude all templates', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    // Clear all OWASP categories
    const noneButton = screen.getAllByRole('button', { name: /^none$/i })[0];
    fireEvent.click(noneButton);

    expect(screen.getByText(/no templates match the current filters/i)).toBeInTheDocument();
  });
});

// ============================================================================
// View Mode Tests
// ============================================================================
describe('TemplateSelector - View Mode', () => {
  it('defaults to grid view', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    const gridToggle = screen.getByRole('button', { name: /grid view/i });
    expect(gridToggle).toHaveAttribute('data-state', 'on');
  });

  it('switches to list view when list toggle is clicked', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    const listToggle = screen.getByRole('button', { name: /list view/i });
    fireEvent.click(listToggle);

    expect(listToggle).toHaveAttribute('data-state', 'on');
  });
});

// ============================================================================
// Selection Tests
// ============================================================================
describe('TemplateSelector - Selection', () => {
  it('calls onSelectionChange when template is selected', () => {
    const onSelectionChange = vi.fn();
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    // Click on the first template checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(onSelectionChange).toHaveBeenCalled();
    const newSelection = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(newSelection.has('template-001')).toBe(true);
  });

  it('shows selection summary when templates are selected', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set(['template-001', 'template-002'])}
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByText(/2 templates selected/i)).toBeInTheDocument();
  });

  it('shows OWASP coverage in selection summary', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set(['template-001', 'template-002'])}
        onSelectionChange={vi.fn()}
      />
    );

    // template-001 has ASI01, ASI04; template-002 has ASI02 = 3 categories
    expect(screen.getByText(/3\/10 owasp categories/i)).toBeInTheDocument();
  });

  it('shows average severity in selection summary', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set(['template-001', 'template-002'])}
        onSelectionChange={vi.fn()}
      />
    );

    // template-001 severity 8, template-002 severity 5 = avg 6.5
    expect(screen.getByText(/avg severity: 6.5/i)).toBeInTheDocument();
  });

  it('clears selection when clear button is clicked', () => {
    const onSelectionChange = vi.fn();
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set(['template-001'])}
        onSelectionChange={onSelectionChange}
      />
    );

    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    expect(onSelectionChange).toHaveBeenCalledWith(new Set());
  });

  it('selects all filtered templates when select all is clicked', () => {
    const onSelectionChange = vi.fn();
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    // Use exact match to avoid matching filter "All" buttons
    const selectAllButton = screen.getByRole('button', { name: 'Select All' });
    fireEvent.click(selectAllButton);

    expect(onSelectionChange).toHaveBeenCalled();
    const newSelection = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(newSelection.size).toBe(4);
  });

  it('deselects all filtered templates when deselect all is clicked', () => {
    const onSelectionChange = vi.fn();
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set(['template-001', 'template-002'])}
        onSelectionChange={onSelectionChange}
      />
    );

    const deselectAllButton = screen.getByRole('button', { name: /deselect all/i });
    fireEvent.click(deselectAllButton);

    expect(onSelectionChange).toHaveBeenCalled();
    const newSelection = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(newSelection.size).toBe(0);
  });
});

// ============================================================================
// Filtering Tests
// ============================================================================
describe('TemplateSelector - Filtering', () => {
  it('filters templates by search query', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    const searchInput = screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'template-001' } });

    // Only template-001 should be visible
    expect(screen.getByText('template-001')).toBeInTheDocument();
    expect(screen.queryByText('template-002')).not.toBeInTheDocument();
  });

  it('filters templates by OWASP category', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    // Click "None" to clear all, then select only ASI07 (Insecure Memory)
    const noneButton = screen.getAllByRole('button', { name: /^none$/i })[0];
    fireEvent.click(noneButton);

    // Select ASI07 - Insecure Memory
    const asi07Toggle = screen.getByRole('button', { name: /insecure memory/i });
    fireEvent.click(asi07Toggle);

    // Only template-003 has ASI07
    expect(screen.getByText('template-003')).toBeInTheDocument();
    expect(screen.queryByText('template-001')).not.toBeInTheDocument();
  });

  it('updates template count when filtered', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    const searchInput = screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'template-001' } });

    expect(screen.getByText(/templates \(1\)/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Preview Tests
// ============================================================================
describe('TemplateSelector - Preview', () => {
  it('opens preview sheet when preview button is clicked', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    const previewButtons = screen.getAllByRole('button', { name: /preview template/i });
    fireEvent.click(previewButtons[0]);

    // Sheet should open with template details
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/attack template details/i)).toBeInTheDocument();
  });

  it('shows template details in preview', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    const previewButtons = screen.getAllByRole('button', { name: /preview template/i });
    fireEvent.click(previewButtons[0]);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('template-001')).toBeInTheDocument();
    expect(within(dialog).getByText(/8\/10/)).toBeInTheDocument();
  });

  it('allows adding template from preview', () => {
    const onSelectionChange = vi.fn();
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    const previewButtons = screen.getAllByRole('button', { name: /preview template/i });
    fireEvent.click(previewButtons[0]);

    const addButton = screen.getByRole('button', { name: /add to selection/i });
    fireEvent.click(addButton);

    expect(onSelectionChange).toHaveBeenCalled();
  });

  it('closes preview when close button is clicked', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    const previewButtons = screen.getAllByRole('button', { name: /preview template/i });
    fireEvent.click(previewButtons[0]);

    const dialog = screen.getByRole('dialog');
    // There are two close buttons: X icon with sr-only "Close" and outline "Close" button
    // Get all buttons and find the visible one with text content "Close"
    const closeButtons = within(dialog).getAllByRole('button', { name: /close/i });
    // The outline close button is the one with variant="outline" (has visible text)
    const outlineCloseButton = closeButtons.find(
      (btn) => btn.textContent === 'Close' && btn.getAttribute('data-variant') === 'outline'
    );
    fireEvent.click(outlineCloseButton!);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================
describe('TemplateSelector - Accessibility', () => {
  it('has template list with correct role', () => {
    render(
      <TemplateSelector
        templates={mockTemplates}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByRole('list', { name: /attack templates/i })).toBeInTheDocument();
  });

  it('loading state has correct aria attributes', () => {
    render(
      <TemplateSelector
        templates={[]}
        selectedTemplateIds={new Set()}
        onSelectionChange={vi.fn()}
        isLoading={true}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });
});
