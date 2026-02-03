'use client';

import { Database, Search, Wrench, X } from 'lucide-react';
import { useCallback, useMemo, memo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  OWASP_CATEGORIES,
  TEMPLATE_SOURCES,
  SOURCE_CONFIG,
  OWASPCategory,
  TemplateSource,
} from '@/data/owasp-categories';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface TemplateFiltersState {
  searchQuery: string;
  owaspCategories: Set<string>;
  sources: Set<TemplateSource>;
  requiresToolAccess: boolean | null;
  requiresMemoryAccess: boolean | null;
}

export interface TemplateFiltersProps {
  filters: TemplateFiltersState;
  onFiltersChange: (filters: TemplateFiltersState) => void;
  templateCounts: {
    byOwasp: Record<string, number>;
    bySource: Record<TemplateSource, number>;
    total: number;
    filtered: number;
  };
  className?: string;
}

// ============================================================================
// Default Filters
// ============================================================================
export function createDefaultFilters(): TemplateFiltersState {
  return {
    searchQuery: '',
    owaspCategories: new Set(OWASP_CATEGORIES.map((c) => c.code)),
    sources: new Set(TEMPLATE_SOURCES),
    requiresToolAccess: null,
    requiresMemoryAccess: null,
  };
}

// ============================================================================
// Component
// ============================================================================
function TemplateFiltersComponent({
  filters,
  onFiltersChange,
  templateCounts,
  className,
}: TemplateFiltersProps) {
  // -------------------------------------------------------------------------
  // Search Handlers
  // -------------------------------------------------------------------------
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Limit search query length for security
      const value = e.target.value.slice(0, 200);
      onFiltersChange({ ...filters, searchQuery: value });
    },
    [filters, onFiltersChange]
  );

  const handleClearSearch = useCallback(() => {
    onFiltersChange({ ...filters, searchQuery: '' });
  }, [filters, onFiltersChange]);

  // -------------------------------------------------------------------------
  // OWASP Category Handlers
  // -------------------------------------------------------------------------
  const handleOwaspToggle = useCallback(
    (code: string) => {
      const newCategories = new Set(filters.owaspCategories);
      if (newCategories.has(code)) {
        newCategories.delete(code);
      } else {
        newCategories.add(code);
      }
      onFiltersChange({ ...filters, owaspCategories: newCategories });
    },
    [filters, onFiltersChange]
  );

  const handleSelectAllOwasp = useCallback(() => {
    onFiltersChange({
      ...filters,
      owaspCategories: new Set(OWASP_CATEGORIES.map((c) => c.code)),
    });
  }, [filters, onFiltersChange]);

  const handleClearAllOwasp = useCallback(() => {
    onFiltersChange({ ...filters, owaspCategories: new Set() });
  }, [filters, onFiltersChange]);

  // -------------------------------------------------------------------------
  // Source Handlers
  // -------------------------------------------------------------------------
  const handleSourceToggle = useCallback(
    (source: TemplateSource) => {
      const newSources = new Set(filters.sources);
      if (newSources.has(source)) {
        newSources.delete(source);
      } else {
        newSources.add(source);
      }
      onFiltersChange({ ...filters, sources: newSources });
    },
    [filters, onFiltersChange]
  );

  const handleSelectAllSources = useCallback(() => {
    onFiltersChange({ ...filters, sources: new Set(TEMPLATE_SOURCES) });
  }, [filters, onFiltersChange]);

  const handleClearAllSources = useCallback(() => {
    onFiltersChange({ ...filters, sources: new Set() });
  }, [filters, onFiltersChange]);

  // -------------------------------------------------------------------------
  // Capability Handlers
  // -------------------------------------------------------------------------
  const handleToolAccessChange = useCallback(
    (value: string) => {
      const toolAccess = value === 'any' ? null : value === 'required';
      onFiltersChange({ ...filters, requiresToolAccess: toolAccess });
    },
    [filters, onFiltersChange]
  );

  const handleMemoryAccessChange = useCallback(
    (value: string) => {
      const memoryAccess = value === 'any' ? null : value === 'required';
      onFiltersChange({ ...filters, requiresMemoryAccess: memoryAccess });
    },
    [filters, onFiltersChange]
  );

  // -------------------------------------------------------------------------
  // Clear All Filters
  // -------------------------------------------------------------------------
  const handleClearAllFilters = useCallback(() => {
    onFiltersChange(createDefaultFilters());
  }, [onFiltersChange]);

  // -------------------------------------------------------------------------
  // Active Filter Count
  // -------------------------------------------------------------------------
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchQuery) count++;
    if (filters.owaspCategories.size < OWASP_CATEGORIES.length) count++;
    if (filters.sources.size < TEMPLATE_SOURCES.length) count++;
    if (filters.requiresToolAccess !== null) count++;
    if (filters.requiresMemoryAccess !== null) count++;
    return count;
  }, [filters]);

  return (
    <div className={cn('space-y-6', className)} role="search" aria-label="Template filters">
      {/* Search */}
      <div className="space-y-2">
        <Label htmlFor="template-search">Search</Label>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="template-search"
            type="search"
            placeholder="Search templates..."
            value={filters.searchQuery}
            onChange={handleSearchChange}
            className="pl-10 pr-10"
            aria-describedby="search-hint"
          />
          {filters.searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={handleClearSearch}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        <p id="search-hint" className="text-xs text-muted-foreground">
          Search by template ID or prompt content
        </p>
      </div>

      {/* OWASP Categories */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label id="owasp-filter-label">OWASP Categories</Label>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleSelectAllOwasp} className="h-6 text-xs">
              All
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearAllOwasp} className="h-6 text-xs">
              None
            </Button>
          </div>
        </div>
        <div
          className="grid grid-cols-2 gap-1"
          role="group"
          aria-labelledby="owasp-filter-label"
        >
          {OWASP_CATEGORIES.map((category) => (
            <OWASPFilterBadge
              key={category.code}
              category={category}
              isSelected={filters.owaspCategories.has(category.code)}
              count={templateCounts.byOwasp[category.code] || 0}
              onToggle={handleOwaspToggle}
            />
          ))}
        </div>
      </div>

      {/* Sources */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label id="source-filter-label">Sources</Label>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleSelectAllSources} className="h-6 text-xs">
              All
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearAllSources} className="h-6 text-xs">
              None
            </Button>
          </div>
        </div>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-labelledby="source-filter-label"
        >
          {TEMPLATE_SOURCES.map((source) => {
            const config = SOURCE_CONFIG[source];
            const count = templateCounts.bySource[source] || 0;
            const isSelected = filters.sources.has(source);
            return (
              <Toggle
                key={source}
                pressed={isSelected}
                onPressedChange={() => handleSourceToggle(source)}
                className={cn('h-7 px-2 text-xs', isSelected && config.color)}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${source} templates (${count})`}
              >
                {config.label} ({count})
              </Toggle>
            );
          })}
        </div>
      </div>

      {/* Capability Filters */}
      <div className="space-y-3">
        <Label>Capabilities</Label>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Label htmlFor="tool-access-filter" className="text-sm font-normal">
              Tool Access
            </Label>
          </div>
          <Select
            value={
              filters.requiresToolAccess === null
                ? 'any'
                : filters.requiresToolAccess
                  ? 'required'
                  : 'not-required'
            }
            onValueChange={handleToolAccessChange}
          >
            <SelectTrigger id="tool-access-filter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="not-required">Not Required</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Label htmlFor="memory-access-filter" className="text-sm font-normal">
              Memory Access
            </Label>
          </div>
          <Select
            value={
              filters.requiresMemoryAccess === null
                ? 'any'
                : filters.requiresMemoryAccess
                  ? 'required'
                  : 'not-required'
            }
            onValueChange={handleMemoryAccessChange}
          >
            <SelectTrigger id="memory-access-filter" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="not-required">Not Required</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Clear All */}
      {activeFilterCount > 0 && (
        <div className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAllFilters}
            className="w-full"
          >
            Clear All Filters ({activeFilterCount})
          </Button>
        </div>
      )}

      {/* Results Count */}
      <div className="pt-2 border-t text-sm text-muted-foreground text-center">
        Showing {templateCounts.filtered} of {templateCounts.total} templates
      </div>
    </div>
  );
}

// ============================================================================
// OWASP Filter Badge Sub-component
// ============================================================================
interface OWASPFilterBadgeProps {
  category: OWASPCategory;
  isSelected: boolean;
  count: number;
  onToggle: (code: string) => void;
}

const OWASPFilterBadge = memo(function OWASPFilterBadge({
  category,
  isSelected,
  count,
  onToggle,
}: OWASPFilterBadgeProps) {
  const handleClick = useCallback(() => {
    onToggle(category.code);
  }, [category.code, onToggle]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            pressed={isSelected}
            onPressedChange={handleClick}
            className={cn(
              'h-7 px-2 text-xs justify-start',
              isSelected && 'bg-primary/10 text-primary'
            )}
            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${category.name} (${count})`}
          >
            <span className="truncate">
              {category.code} ({count})
            </span>
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="font-medium">{category.name}</p>
          <p className="text-xs text-muted-foreground">{category.shortDescription}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export const TemplateFilters = memo(TemplateFiltersComponent);
