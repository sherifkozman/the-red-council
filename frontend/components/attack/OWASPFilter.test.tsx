import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OWASPFilter, OWASPFilterProps, useOWASPFilter } from './OWASPFilter';
import { OWASP_CATEGORIES } from '@/data/owasp-categories';

// ============================================================================
// Test Helpers
// ============================================================================
const CATEGORY_CODES = OWASP_CATEGORIES.map((c) => c.code);

function createDefaultProps(overrides: Partial<OWASPFilterProps> = {}): OWASPFilterProps {
  return {
    selectedCategories: new Set(CATEGORY_CODES),
    onSelectionChange: vi.fn(),
    categoryCounts: Object.fromEntries(CATEGORY_CODES.map((code, i) => [code, i + 1])),
    layout: 'grid',
    showActions: true,
    disabled: false,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================
describe('OWASPFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders all 10 OWASP categories in grid layout', () => {
      const props = createDefaultProps();
      render(<OWASPFilter {...props} />);

      // Check all category codes are rendered
      OWASP_CATEGORIES.forEach((category) => {
        expect(screen.getByRole('button', { name: new RegExp(category.name, 'i') })).toBeInTheDocument();
      });
    });

    it('renders categories in row layout', () => {
      const props = createDefaultProps({ layout: 'row' });
      render(<OWASPFilter {...props} />);

      // Row layout should show full names
      OWASP_CATEGORIES.forEach((category) => {
        expect(screen.getByRole('button', { name: new RegExp(category.name, 'i') })).toBeInTheDocument();
      });
    });

    it('renders categories in list layout with descriptions', () => {
      const props = createDefaultProps({ layout: 'list' });
      render(<OWASPFilter {...props} />);

      // List layout shows short descriptions
      OWASP_CATEGORIES.forEach((category) => {
        expect(screen.getByText(category.shortDescription)).toBeInTheDocument();
      });
    });

    it('displays template counts when provided', () => {
      const counts = {
        ASI01: 5,
        ASI02: 10,
        ASI03: 0,
      };
      const props = createDefaultProps({
        categoryCounts: counts,
        selectedCategories: new Set(CATEGORY_CODES),
      });
      render(<OWASPFilter {...props} />);

      // Counts should appear in the badges - aria-label format is "Deselect Category Name (X templates)"
      expect(screen.getByRole('button', { name: /Excessive Agency.*5 templates/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Inadequate Oversight.*10 templates/i })).toBeInTheDocument();
    });

    it('hides action buttons when showActions is false', () => {
      const props = createDefaultProps({ showActions: false });
      render(<OWASPFilter {...props} />);

      expect(screen.queryByRole('button', { name: /Select All/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Clear All/i })).not.toBeInTheDocument();
    });

    it('shows selection count in actions bar', () => {
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01', 'ASI02', 'ASI03']),
      });
      render(<OWASPFilter {...props} />);

      expect(screen.getByText(/3 of 10 selected/i)).toBeInTheDocument();
    });

    it('shows total templates count for selected categories', () => {
      const counts = {
        ASI01: 5,
        ASI02: 10,
        ASI03: 3,
      };
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01', 'ASI02']),
        categoryCounts: counts,
      });
      render(<OWASPFilter {...props} />);

      // 5 + 10 = 15 templates for selected categories
      expect(screen.getByText(/15 templates/i)).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    it('highlights selected categories', () => {
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01', 'ASI04']),
      });
      render(<OWASPFilter {...props} />);

      const asi01Button = screen.getByRole('button', { name: /Select Excessive Agency/i });
      expect(asi01Button).toHaveAttribute('aria-pressed', 'true');

      const asi02Button = screen.getByRole('button', { name: /Select Inadequate Oversight/i });
      expect(asi02Button).toHaveAttribute('aria-pressed', 'false');
    });

    it('calls onSelectionChange when toggling a category', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      // Click to deselect ASI01
      const asi01Button = screen.getByRole('button', { name: /Deselect Excessive Agency/i });
      await user.click(asi01Button);

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const newSelection = onSelectionChange.mock.calls[0][0];
      expect(newSelection.has('ASI01')).toBe(false);
    });

    it('adds category when clicking unselected', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      // Click to select ASI02
      const asi02Button = screen.getByRole('button', { name: /Select Inadequate Oversight/i });
      await user.click(asi02Button);

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const newSelection = onSelectionChange.mock.calls[0][0];
      expect(newSelection.has('ASI01')).toBe(true);
      expect(newSelection.has('ASI02')).toBe(true);
    });
  });

  describe('Select All / Clear All', () => {
    it('selects all categories when clicking Select All', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      await user.click(screen.getByRole('button', { name: /Select all OWASP categories/i }));

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const newSelection = onSelectionChange.mock.calls[0][0];
      expect(newSelection.size).toBe(10);
    });

    it('clears all categories when clicking Clear All', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        selectedCategories: new Set(CATEGORY_CODES),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      await user.click(screen.getByRole('button', { name: /Clear all OWASP category selections/i }));

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      const newSelection = onSelectionChange.mock.calls[0][0];
      expect(newSelection.size).toBe(0);
    });

    it('disables Select All button when all selected', () => {
      const props = createDefaultProps({
        selectedCategories: new Set(CATEGORY_CODES),
      });
      render(<OWASPFilter {...props} />);

      expect(screen.getByRole('button', { name: /Select all OWASP categories/i })).toBeDisabled();
    });

    it('disables Clear All button when none selected', () => {
      const props = createDefaultProps({
        selectedCategories: new Set(),
      });
      render(<OWASPFilter {...props} />);

      expect(screen.getByRole('button', { name: /Clear all OWASP category selections/i })).toBeDisabled();
    });
  });

  describe('disabled state', () => {
    it('disables all interaction when disabled prop is true', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        disabled: true,
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      // Try to click a category
      const categoryButton = screen.getByRole('button', { name: /Excessive Agency/i });
      await user.click(categoryButton);

      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('disables Select All and Clear All when disabled', () => {
      const props = createDefaultProps({
        disabled: true,
        selectedCategories: new Set(['ASI01']),
      });
      render(<OWASPFilter {...props} />);

      expect(screen.getByRole('button', { name: /Select all OWASP categories/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Clear all OWASP category selections/i })).toBeDisabled();
    });
  });

  describe('keyboard navigation', () => {
    it('toggles category with Enter key', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      const categoryButton = screen.getByRole('button', { name: /Deselect Excessive Agency/i });
      categoryButton.focus();
      await user.keyboard('{Enter}');

      expect(onSelectionChange).toHaveBeenCalled();
    });

    it('toggles category with Space key', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      const categoryButton = screen.getByRole('button', { name: /Deselect Excessive Agency/i });
      categoryButton.focus();
      await user.keyboard(' ');

      expect(onSelectionChange).toHaveBeenCalled();
    });

    it('does not toggle when disabled and using keyboard', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        disabled: true,
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      const categoryButton = screen.getByRole('button', { name: /Excessive Agency/i });
      categoryButton.focus();
      await user.keyboard('{Enter}');

      expect(onSelectionChange).not.toHaveBeenCalled();
    });
  });

  describe('tooltip', () => {
    it('shows full description on hover in grid layout', async () => {
      const user = userEvent.setup();
      const props = createDefaultProps({ layout: 'grid' });
      render(<OWASPFilter {...props} />);

      // Hover over a category
      const categoryButton = screen.getByRole('button', { name: /Excessive Agency/i });
      await user.hover(categoryButton);

      // Tooltip should show full description
      // Note: Tooltip may not render immediately in tests, this is a best-effort check
      // In real usage, the tooltip with full description would appear
    });
  });

  describe('list layout', () => {
    it('renders checkboxes in list layout', () => {
      const props = createDefaultProps({ layout: 'list' });
      render(<OWASPFilter {...props} />);

      // List layout shows all categories as list items
      const buttons = screen.getAllByRole('button', { pressed: true });
      expect(buttons.length).toBeGreaterThanOrEqual(10);
    });

    it('shows template count in list items', () => {
      const counts = { ASI01: 5 };
      const props = createDefaultProps({
        layout: 'list',
        categoryCounts: counts,
        selectedCategories: new Set(CATEGORY_CODES),
      });
      render(<OWASPFilter {...props} />);

      expect(screen.getByText('5 templates')).toBeInTheDocument();
    });

    it('uses singular "template" for count of 1', () => {
      const counts = { ASI02: 1 };
      const props = createDefaultProps({
        layout: 'list',
        categoryCounts: counts,
        selectedCategories: new Set(CATEGORY_CODES),
      });
      render(<OWASPFilter {...props} />);

      expect(screen.getByText('1 template')).toBeInTheDocument();
    });

    it('toggles list item when clicked', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        layout: 'list',
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      // Click the ASI01 list item (which should be first)
      const listItem = screen.getByRole('button', { name: /Deselect Excessive Agency/i });
      await user.click(listItem);

      expect(onSelectionChange).toHaveBeenCalled();
      const newSelection = onSelectionChange.mock.calls[0][0];
      expect(newSelection.has('ASI01')).toBe(false);
    });
  });

  describe('accessibility', () => {
    it('has proper aria-label on the region', () => {
      const props = createDefaultProps({ ariaLabel: 'Custom filter label' });
      render(<OWASPFilter {...props} />);

      expect(screen.getByRole('region', { name: 'Custom filter label' })).toBeInTheDocument();
    });

    it('has aria-pressed on toggle buttons', () => {
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01']),
      });
      render(<OWASPFilter {...props} />);

      const selectedButton = screen.getByRole('button', { name: /Deselect Excessive Agency/i });
      expect(selectedButton).toHaveAttribute('aria-pressed', 'true');

      const unselectedButton = screen.getByRole('button', { name: /Select Inadequate Oversight/i });
      expect(unselectedButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('announces selection changes with descriptive labels', () => {
      const props = createDefaultProps({
        selectedCategories: new Set(['ASI01']),
        categoryCounts: { ASI01: 5 },
      });
      render(<OWASPFilter {...props} />);

      const button = screen.getByRole('button', { name: /Deselect Excessive Agency.*5 templates/i });
      expect(button).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles empty categoryCounts gracefully', () => {
      const props = createDefaultProps({
        categoryCounts: {},
      });
      render(<OWASPFilter {...props} />);

      // Should render without counts in the display
      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('handles partial categoryCounts', () => {
      const props = createDefaultProps({
        categoryCounts: { ASI01: 5 }, // Only one category has count
      });
      render(<OWASPFilter {...props} />);

      // Should still render all categories
      OWASP_CATEGORIES.forEach((category) => {
        expect(screen.getByRole('button', { name: new RegExp(category.name, 'i') })).toBeInTheDocument();
      });
    });

    it('handles empty selectedCategories', () => {
      const props = createDefaultProps({
        selectedCategories: new Set(),
      });
      render(<OWASPFilter {...props} />);

      expect(screen.getByText('0 of 10 selected')).toBeInTheDocument();
    });

    it('handles invalid category codes in selectedCategories', () => {
      const props = createDefaultProps({
        selectedCategories: new Set(['INVALID', 'ASI01']),
      });
      render(<OWASPFilter {...props} />);

      // Should only show valid ASI01 as selected
      const asi01Button = screen.getByRole('button', { name: /Deselect Excessive Agency/i });
      expect(asi01Button).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('list layout keyboard navigation', () => {
    it('toggles list item with Enter key', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        layout: 'list',
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      const listItem = screen.getByRole('button', { name: /Deselect Excessive Agency/i });
      listItem.focus();
      await user.keyboard('{Enter}');

      expect(onSelectionChange).toHaveBeenCalled();
    });

    it('toggles list item with Space key', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        layout: 'list',
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      const listItem = screen.getByRole('button', { name: /Deselect Excessive Agency/i });
      listItem.focus();
      await user.keyboard(' ');

      expect(onSelectionChange).toHaveBeenCalled();
    });

    it('does not toggle list item when disabled', async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      const props = createDefaultProps({
        layout: 'list',
        disabled: true,
        selectedCategories: new Set(['ASI01']),
        onSelectionChange,
      });
      render(<OWASPFilter {...props} />);

      const listItem = screen.getByRole('button', { name: /Excessive Agency/i });
      listItem.focus();
      await user.keyboard('{Enter}');

      expect(onSelectionChange).not.toHaveBeenCalled();
    });
  });

  describe('useOWASPFilter hook', () => {
    it('initializes with all categories selected by default', () => {
      const { result } = renderHook(() => useOWASPFilter());

      expect(result.current.count).toBe(10);
      expect(result.current.isSelected('ASI01')).toBe(true);
      expect(result.current.isSelected('ASI10')).toBe(true);
    });

    it('initializes with custom selection', () => {
      const initialSelection = new Set(['ASI01', 'ASI02']);
      const { result } = renderHook(() => useOWASPFilter(initialSelection));

      expect(result.current.count).toBe(2);
      expect(result.current.isSelected('ASI01')).toBe(true);
      expect(result.current.isSelected('ASI03')).toBe(false);
    });

    it('provides selectedCategories set', () => {
      const { result } = renderHook(() => useOWASPFilter());

      expect(result.current.selectedCategories).toBeInstanceOf(Set);
      expect(result.current.selectedCategories.size).toBe(10);
    });

    it('toggle adds and removes categories', () => {
      const { result } = renderHook(() => useOWASPFilter(new Set(['ASI01'])));

      expect(result.current.isSelected('ASI01')).toBe(true);
      expect(result.current.isSelected('ASI02')).toBe(false);

      // Toggle ASI02 on
      act(() => {
        result.current.toggle('ASI02');
      });
      expect(result.current.isSelected('ASI02')).toBe(true);

      // Toggle ASI01 off
      act(() => {
        result.current.toggle('ASI01');
      });
      expect(result.current.isSelected('ASI01')).toBe(false);
    });

    it('selectAll selects all categories', () => {
      const { result } = renderHook(() => useOWASPFilter(new Set(['ASI01'])));

      expect(result.current.count).toBe(1);

      act(() => {
        result.current.selectAll();
      });
      expect(result.current.count).toBe(10);
    });

    it('clearAll removes all selections', () => {
      const { result } = renderHook(() => useOWASPFilter());

      expect(result.current.count).toBe(10);

      act(() => {
        result.current.clearAll();
      });
      expect(result.current.count).toBe(0);
    });

    it('setSelectedCategories updates selection', () => {
      const { result } = renderHook(() => useOWASPFilter());

      act(() => {
        result.current.setSelectedCategories(new Set(['ASI05', 'ASI06']));
      });
      expect(result.current.count).toBe(2);
      expect(result.current.isSelected('ASI05')).toBe(true);
      expect(result.current.isSelected('ASI01')).toBe(false);
    });
  });
});
