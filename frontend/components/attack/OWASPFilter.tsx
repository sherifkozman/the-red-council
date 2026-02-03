'use client';

import { Check, X } from 'lucide-react';
import { useCallback, useMemo, useState, memo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OWASP_CATEGORIES, OWASPCategory } from '@/data/owasp-categories';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface OWASPFilterProps {
  /**
   * Set of selected OWASP category codes (e.g., 'ASI01', 'ASI02')
   */
  selectedCategories: Set<string>;

  /**
   * Callback when selection changes
   */
  onSelectionChange: (categories: Set<string>) => void;

  /**
   * Template counts per OWASP category
   */
  categoryCounts?: Record<string, number>;

  /**
   * Layout variant
   * - 'grid': 5x2 grid layout (default)
   * - 'row': Horizontal row with wrapping
   * - 'list': Vertical list with full descriptions
   */
  layout?: 'grid' | 'row' | 'list';

  /**
   * Show the Clear All / Select All buttons
   */
  showActions?: boolean;

  /**
   * Disable the filter
   */
  disabled?: boolean;

  /**
   * Additional class names
   */
  className?: string;

  /**
   * Accessible label for the filter group
   */
  ariaLabel?: string;
}

// ============================================================================
// Constants
// ============================================================================
const CATEGORY_CODES = OWASP_CATEGORIES.map((c) => c.code);

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get background color based on category type
 */
function getCategoryColor(code: string, isSelected: boolean): string {
  if (!isSelected) {
    return 'bg-muted/50 hover:bg-muted';
  }

  // Color coding by category type for visual distinction
  const colorMap: Record<string, string> = {
    ASI01: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', // Excessive Agency
    ASI02: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', // Inadequate Oversight
    ASI03: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300', // Vulnerable Integrations
    ASI04: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300', // Prompt Injection
    ASI05: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', // Improper Authorization
    ASI06: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300', // Data Disclosure
    ASI07: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', // Insecure Memory
    ASI08: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300', // Goal Misalignment
    ASI09: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300', // Weak Guardrails
    ASI10: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300', // Over-Trust
  };

  return colorMap[code] || 'bg-primary/10 text-primary';
}

// ============================================================================
// OWASPCategoryBadge Sub-component
// ============================================================================
interface OWASPCategoryBadgeProps {
  category: OWASPCategory;
  isSelected: boolean;
  count?: number;
  disabled?: boolean;
  showFullName?: boolean;
  onToggle: (code: string) => void;
}

const OWASPCategoryBadge = memo(function OWASPCategoryBadge({
  category,
  isSelected,
  count,
  disabled,
  showFullName,
  onToggle,
}: OWASPCategoryBadgeProps) {
  const handleToggle = useCallback(() => {
    if (!disabled) {
      onToggle(category.code);
    }
  }, [category.code, disabled, onToggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
        e.preventDefault();
        onToggle(category.code);
      }
    },
    [category.code, disabled, onToggle]
  );

  const label = showFullName
    ? `${category.code} - ${category.name}`
    : category.code;

  const countDisplay = count !== undefined ? ` (${count})` : '';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            pressed={isSelected}
            onPressedChange={handleToggle}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              'relative h-auto px-3 py-2 text-sm font-medium transition-colors',
              'border border-transparent',
              getCategoryColor(category.code, isSelected),
              disabled && 'opacity-50 cursor-not-allowed',
              isSelected && 'border-current/20'
            )}
            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${category.name}${count !== undefined ? ` (${count} templates)` : ''}`}
            aria-pressed={isSelected}
          >
            <span className="flex items-center gap-1.5">
              {isSelected && (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                {label}
                {countDisplay}
              </span>
            </span>
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{category.name}</p>
            <p className="text-xs text-muted-foreground">{category.description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// ============================================================================
// OWASPCategoryListItem Sub-component (for list layout)
// ============================================================================
interface OWASPCategoryListItemProps {
  category: OWASPCategory;
  isSelected: boolean;
  count?: number;
  disabled?: boolean;
  onToggle: (code: string) => void;
}

const OWASPCategoryListItem = memo(function OWASPCategoryListItem({
  category,
  isSelected,
  count,
  disabled,
  onToggle,
}: OWASPCategoryListItemProps) {
  const handleToggle = useCallback(() => {
    if (!disabled) {
      onToggle(category.code);
    }
  }, [category.code, disabled, onToggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
        e.preventDefault();
        onToggle(category.code);
      }
    },
    [category.code, disabled, onToggle]
  );

  return (
    <button
      type="button"
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg w-full text-left transition-colors',
        'border',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:bg-muted/50',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      aria-pressed={isSelected}
      aria-label={`${isSelected ? 'Deselect' : 'Select'} ${category.name}`}
    >
      <div
        className={cn(
          'shrink-0 w-5 h-5 rounded border flex items-center justify-center mt-0.5',
          isSelected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/30'
        )}
        aria-hidden="true"
      >
        {isSelected && <Check className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={getCategoryColor(category.code, true)}>
            {category.code}
          </Badge>
          <span className="font-medium">{category.name}</span>
          {count !== undefined && (
            <span className="ml-auto text-sm text-muted-foreground">
              {count} template{count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{category.shortDescription}</p>
      </div>
    </button>
  );
});

// ============================================================================
// Main OWASPFilter Component
// ============================================================================
function OWASPFilterComponent({
  selectedCategories,
  onSelectionChange,
  categoryCounts = {},
  layout = 'grid',
  showActions = true,
  disabled = false,
  className,
  ariaLabel = 'OWASP Agentic Top 10 filter',
}: OWASPFilterProps) {
  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleToggle = useCallback(
    (code: string) => {
      if (disabled) return;

      const newSelection = new Set(selectedCategories);
      if (newSelection.has(code)) {
        newSelection.delete(code);
      } else {
        newSelection.add(code);
      }
      onSelectionChange(newSelection);
    },
    [selectedCategories, onSelectionChange, disabled]
  );

  const handleSelectAll = useCallback(() => {
    if (disabled) return;
    onSelectionChange(new Set(CATEGORY_CODES));
  }, [onSelectionChange, disabled]);

  const handleClearAll = useCallback(() => {
    if (disabled) return;
    onSelectionChange(new Set());
  }, [onSelectionChange, disabled]);

  // -------------------------------------------------------------------------
  // Computed Values
  // -------------------------------------------------------------------------
  const selectionStats = useMemo(() => {
    const selectedCount = selectedCategories.size;
    const totalCount = OWASP_CATEGORIES.length;
    const allSelected = selectedCount === totalCount;
    const noneSelected = selectedCount === 0;

    // Sum template counts for selected categories
    const totalTemplates = Object.entries(categoryCounts)
      .filter(([code]) => selectedCategories.has(code))
      .reduce((sum, [, count]) => sum + count, 0);

    return {
      selectedCount,
      totalCount,
      allSelected,
      noneSelected,
      totalTemplates,
    };
  }, [selectedCategories, categoryCounts]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const renderCategories = () => {
    if (layout === 'list') {
      return (
        <div className="space-y-2">
          {OWASP_CATEGORIES.map((category) => (
            <OWASPCategoryListItem
              key={category.code}
              category={category}
              isSelected={selectedCategories.has(category.code)}
              count={categoryCounts[category.code]}
              disabled={disabled}
              onToggle={handleToggle}
            />
          ))}
        </div>
      );
    }

    const gridClass =
      layout === 'grid'
        ? 'grid grid-cols-5 gap-1.5'
        : 'flex flex-wrap gap-1.5';

    return (
      <div className={gridClass} role="group" aria-label={ariaLabel}>
        {OWASP_CATEGORIES.map((category) => (
          <OWASPCategoryBadge
            key={category.code}
            category={category}
            isSelected={selectedCategories.has(category.code)}
            count={categoryCounts[category.code]}
            disabled={disabled}
            showFullName={layout === 'row'}
            onToggle={handleToggle}
          />
        ))}
      </div>
    );
  };

  return (
    <div className={cn('space-y-3', className)} role="region" aria-label={ariaLabel}>
      {/* Actions Bar */}
      {showActions && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selectionStats.selectedCount} of {selectionStats.totalCount} selected
            {selectionStats.totalTemplates > 0 && (
              <> ({selectionStats.totalTemplates} templates)</>
            )}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              disabled={disabled || selectionStats.allSelected}
              className="h-7 px-2 text-xs"
              aria-label="Select all OWASP categories"
            >
              <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Select All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={disabled || selectionStats.noneSelected}
              className="h-7 px-2 text-xs"
              aria-label="Clear all OWASP category selections"
            >
              <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Clear All
            </Button>
          </div>
        </div>
      )}

      {/* Category Badges/List */}
      {renderCategories()}
    </div>
  );
}

export const OWASPFilter = memo(OWASPFilterComponent);

// ============================================================================
// Convenience Hook
// ============================================================================
export function useOWASPFilter(initialSelection?: Set<string>) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => initialSelection ?? new Set(CATEGORY_CODES)
  );

  const selectAll = useCallback(() => {
    setSelectedCategories(new Set(CATEGORY_CODES));
  }, []);

  const clearAll = useCallback(() => {
    setSelectedCategories(new Set());
  }, []);

  const toggle = useCallback((code: string) => {
    setSelectedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(code)) {
        newSet.delete(code);
      } else {
        newSet.add(code);
      }
      return newSet;
    });
  }, []);

  const isSelected = useCallback(
    (code: string) => selectedCategories.has(code),
    [selectedCategories]
  );

  return {
    selectedCategories,
    setSelectedCategories,
    selectAll,
    clearAll,
    toggle,
    isSelected,
    count: selectedCategories.size,
  };
}
