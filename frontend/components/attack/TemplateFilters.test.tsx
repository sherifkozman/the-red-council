import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  TemplateFilters,
  TemplateFiltersState,
  createDefaultFilters,
} from './TemplateFilters';
import { OWASP_CATEGORIES, TEMPLATE_SOURCES, TemplateSource } from '@/data/owasp-categories';

// ============================================================================
// Mock scrollIntoView for Radix Select (not available in JSDOM)
// ============================================================================
Element.prototype.scrollIntoView = vi.fn();

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
// Test Helpers
// ============================================================================
const createMockCounts = () => ({
  byOwasp: Object.fromEntries(OWASP_CATEGORIES.map((c, i) => [c.code, i + 1])),
  bySource: Object.fromEntries(TEMPLATE_SOURCES.map((s, i) => [s, (i + 1) * 10])) as Record<
    TemplateSource,
    number
  >,
  total: 100,
  filtered: 50,
});

// ============================================================================
// Default Filters Tests
// ============================================================================
describe('createDefaultFilters', () => {
  it('creates filters with empty search query', () => {
    const filters = createDefaultFilters();
    expect(filters.searchQuery).toBe('');
  });

  it('creates filters with all OWASP categories selected', () => {
    const filters = createDefaultFilters();
    expect(filters.owaspCategories.size).toBe(10);
    OWASP_CATEGORIES.forEach((cat) => {
      expect(filters.owaspCategories.has(cat.code)).toBe(true);
    });
  });

  it('creates filters with all sources selected', () => {
    const filters = createDefaultFilters();
    expect(filters.sources.size).toBe(TEMPLATE_SOURCES.length);
    TEMPLATE_SOURCES.forEach((source) => {
      expect(filters.sources.has(source)).toBe(true);
    });
  });

  it('creates filters with null capability filters', () => {
    const filters = createDefaultFilters();
    expect(filters.requiresToolAccess).toBeNull();
    expect(filters.requiresMemoryAccess).toBeNull();
  });
});

// ============================================================================
// Search Tests
// ============================================================================
describe('TemplateFilters - Search', () => {
  it('renders search input', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('shows search placeholder text', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByPlaceholderText(/search templates/i)).toBeInTheDocument();
  });

  it('calls onFiltersChange when search query changes', () => {
    const onFiltersChange = vi.fn();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    const searchInput = screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'test query' } });

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: 'test query',
      })
    );
  });

  it('limits search query length to 200 characters', () => {
    const onFiltersChange = vi.fn();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    const longQuery = 'a'.repeat(250);
    const searchInput = screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: longQuery } });

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: 'a'.repeat(200),
      })
    );
  });

  it('shows clear button when search has value', () => {
    const filters = { ...createDefaultFilters(), searchQuery: 'test' };
    render(
      <TemplateFilters
        filters={filters}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument();
  });

  it('clears search when clear button is clicked', () => {
    const onFiltersChange = vi.fn();
    const filters = { ...createDefaultFilters(), searchQuery: 'test' };
    render(
      <TemplateFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        searchQuery: '',
      })
    );
  });
});

// ============================================================================
// OWASP Category Tests
// ============================================================================
describe('TemplateFilters - OWASP Categories', () => {
  it('renders all OWASP category toggles', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    // Toggle labels use the full category name, not the code
    OWASP_CATEGORIES.forEach((cat) => {
      expect(screen.getByRole('button', { name: new RegExp(cat.name, 'i') })).toBeInTheDocument();
    });
  });

  it('shows counts for each OWASP category', () => {
    const counts = createMockCounts();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={counts}
      />
    );

    // Check that counts are displayed (first category has count 1)
    expect(screen.getByText(/ASI01 \(1\)/)).toBeInTheDocument();
  });

  it('toggles OWASP category when clicked', () => {
    const onFiltersChange = vi.fn();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    // Find and click Excessive Agency toggle (ASI01)
    const asi01Toggle = screen.getByRole('button', { name: /excessive agency/i });
    fireEvent.click(asi01Toggle);

    expect(onFiltersChange).toHaveBeenCalled();
    const newFilters = onFiltersChange.mock.calls[0][0] as TemplateFiltersState;
    expect(newFilters.owaspCategories.has('ASI01')).toBe(false);
  });

  it('selects all OWASP categories when All button is clicked', () => {
    const onFiltersChange = vi.fn();
    const filters = {
      ...createDefaultFilters(),
      owaspCategories: new Set<string>(), // Start with none selected
    };
    render(
      <TemplateFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    const allButton = screen.getAllByRole('button', { name: /^all$/i })[0];
    fireEvent.click(allButton);

    expect(onFiltersChange).toHaveBeenCalled();
    const newFilters = onFiltersChange.mock.calls[0][0] as TemplateFiltersState;
    expect(newFilters.owaspCategories.size).toBe(10);
  });

  it('clears all OWASP categories when None button is clicked', () => {
    const onFiltersChange = vi.fn();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    const noneButton = screen.getAllByRole('button', { name: /^none$/i })[0];
    fireEvent.click(noneButton);

    expect(onFiltersChange).toHaveBeenCalled();
    const newFilters = onFiltersChange.mock.calls[0][0] as TemplateFiltersState;
    expect(newFilters.owaspCategories.size).toBe(0);
  });
});

// ============================================================================
// Source Tests
// ============================================================================
describe('TemplateFilters - Sources', () => {
  it('renders all source toggles', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    TEMPLATE_SOURCES.forEach((source) => {
      expect(screen.getByRole('button', { name: new RegExp(source, 'i') })).toBeInTheDocument();
    });
  });

  it('toggles source when clicked', () => {
    const onFiltersChange = vi.fn();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    const harmbenchToggle = screen.getByRole('button', { name: /harmbench/i });
    fireEvent.click(harmbenchToggle);

    expect(onFiltersChange).toHaveBeenCalled();
    const newFilters = onFiltersChange.mock.calls[0][0] as TemplateFiltersState;
    expect(newFilters.sources.has('HarmBench')).toBe(false);
  });

  it('selects all sources when All button is clicked', () => {
    const onFiltersChange = vi.fn();
    const filters = {
      ...createDefaultFilters(),
      sources: new Set<TemplateSource>(),
    };
    render(
      <TemplateFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    // Get the second "All" button (for sources)
    const allButtons = screen.getAllByRole('button', { name: /^all$/i });
    fireEvent.click(allButtons[1]);

    expect(onFiltersChange).toHaveBeenCalled();
    const newFilters = onFiltersChange.mock.calls[0][0] as TemplateFiltersState;
    expect(newFilters.sources.size).toBe(TEMPLATE_SOURCES.length);
  });
});

// ============================================================================
// Capability Filter Tests
// ============================================================================
describe('TemplateFilters - Capability Filters', () => {
  it('renders tool access select', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByLabelText(/tool access/i)).toBeInTheDocument();
  });

  it('renders memory access select', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByLabelText(/memory access/i)).toBeInTheDocument();
  });

  it('changes tool access filter when selected', () => {
    const onFiltersChange = vi.fn();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    // Open the select
    const toolAccessSelect = screen.getByLabelText(/tool access/i);
    fireEvent.click(toolAccessSelect);

    // Select "Required"
    const requiredOption = screen.getByRole('option', { name: 'Required' });
    fireEvent.click(requiredOption);

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresToolAccess: true,
      })
    );
  });

  it('changes memory access filter when selected', () => {
    const onFiltersChange = vi.fn();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    // Open the select
    const memoryAccessSelect = screen.getByLabelText(/memory access/i);
    fireEvent.click(memoryAccessSelect);

    // Select "Not Required"
    const notRequiredOption = screen.getByRole('option', { name: 'Not Required' });
    fireEvent.click(notRequiredOption);

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresMemoryAccess: false,
      })
    );
  });
});

// ============================================================================
// Clear All Filters Tests
// ============================================================================
describe('TemplateFilters - Clear All', () => {
  it('shows clear all button when filters are active', () => {
    const filters = {
      ...createDefaultFilters(),
      searchQuery: 'test',
    };
    render(
      <TemplateFilters
        filters={filters}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByRole('button', { name: /clear all filters/i })).toBeInTheDocument();
  });

  it('does not show clear all button when no filters are active', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.queryByRole('button', { name: /clear all filters/i })).not.toBeInTheDocument();
  });

  it('resets all filters when clear all is clicked', () => {
    const onFiltersChange = vi.fn();
    const filters: TemplateFiltersState = {
      searchQuery: 'test',
      owaspCategories: new Set(['ASI01']),
      sources: new Set(['HarmBench'] as TemplateSource[]),
      requiresToolAccess: true,
      requiresMemoryAccess: false,
    };
    render(
      <TemplateFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        templateCounts={createMockCounts()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /clear all filters/i }));

    expect(onFiltersChange).toHaveBeenCalled();
    const newFilters = onFiltersChange.mock.calls[0][0] as TemplateFiltersState;
    expect(newFilters.searchQuery).toBe('');
    expect(newFilters.owaspCategories.size).toBe(10);
    expect(newFilters.sources.size).toBe(TEMPLATE_SOURCES.length);
    expect(newFilters.requiresToolAccess).toBeNull();
    expect(newFilters.requiresMemoryAccess).toBeNull();
  });

  it('shows active filter count', () => {
    const filters: TemplateFiltersState = {
      searchQuery: 'test',
      owaspCategories: new Set(['ASI01']), // Less than all = 1 filter
      sources: new Set(TEMPLATE_SOURCES),
      requiresToolAccess: true, // 1 filter
      requiresMemoryAccess: null,
    };
    render(
      <TemplateFilters
        filters={filters}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    // Should show count of active filters (3: search, owasp, tool access) in clear all button
    expect(screen.getByRole('button', { name: /clear all filters \(3\)/i })).toBeInTheDocument();
  });
});

// ============================================================================
// Results Count Tests
// ============================================================================
describe('TemplateFilters - Results Count', () => {
  it('shows filtered and total template counts', () => {
    const counts = createMockCounts();
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={counts}
      />
    );

    expect(screen.getByText(/showing 50 of 100 templates/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================
describe('TemplateFilters - Accessibility', () => {
  it('has search role on container', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('has labeled groups for OWASP and source filters', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByRole('group', { name: /owasp categories/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /sources/i })).toBeInTheDocument();
  });

  it('has search hint text', () => {
    render(
      <TemplateFilters
        filters={createDefaultFilters()}
        onFiltersChange={vi.fn()}
        templateCounts={createMockCounts()}
      />
    );

    expect(screen.getByText(/search by template id or prompt content/i)).toBeInTheDocument();
  });
});
