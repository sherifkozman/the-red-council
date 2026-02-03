'use client';

import { Grid3X3, List, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useMemo, useState, memo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Toggle } from '@/components/ui/toggle';
import { TemplateCard } from '@/components/attack/TemplateCard';
import {
  TemplateFilters,
  TemplateFiltersState,
  createDefaultFilters,
} from '@/components/attack/TemplateFilters';
import {
  AttackTemplate,
  OWASP_CATEGORY_MAP,
  SOURCE_CONFIG,
  TemplateSource,
  getSeverityBadgeVariant,
} from '@/data/owasp-categories';
import { cn, escapeHtml } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface TemplateSelectorProps {
  templates: AttackTemplate[];
  selectedTemplateIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRefresh?: () => void;
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================
const MAX_SELECTION_DISPLAY = 100;

// ============================================================================
// Helpers
// ============================================================================
function filterTemplates(
  templates: AttackTemplate[],
  filters: TemplateFiltersState
): AttackTemplate[] {
  return templates.filter((template) => {
    // Search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const matchesId = template.id.toLowerCase().includes(query);
      const matchesPrompt = template.prompt.toLowerCase().includes(query);
      if (!matchesId && !matchesPrompt) return false;
    }

    // OWASP category filter
    if (filters.owaspCategories.size > 0) {
      const hasMatchingCategory = template.owasp_categories.some((code) =>
        filters.owaspCategories.has(code)
      );
      if (!hasMatchingCategory) return false;
    } else {
      return false; // No categories selected = no results
    }

    // Source filter
    if (filters.sources.size > 0) {
      if (!filters.sources.has(template.source as TemplateSource)) return false;
    } else {
      return false; // No sources selected = no results
    }

    // Tool access filter
    if (filters.requiresToolAccess !== null) {
      if (template.requires_tool_access !== filters.requiresToolAccess) return false;
    }

    // Memory access filter
    if (filters.requiresMemoryAccess !== null) {
      if (template.requires_memory_access !== filters.requiresMemoryAccess) return false;
    }

    return true;
  });
}

function countByOwasp(templates: AttackTemplate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const template of templates) {
    for (const code of template.owasp_categories) {
      counts[code] = (counts[code] || 0) + 1;
    }
  }
  return counts;
}

function countBySource(templates: AttackTemplate[]): Record<TemplateSource, number> {
  const counts: Record<string, number> = {};
  for (const template of templates) {
    counts[template.source] = (counts[template.source] || 0) + 1;
  }
  return counts as Record<TemplateSource, number>;
}

// ============================================================================
// Component
// ============================================================================
function TemplateSelectorComponent({
  templates,
  selectedTemplateIds,
  onSelectionChange,
  isLoading = false,
  isError = false,
  onRefresh,
  className,
}: TemplateSelectorProps) {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState<TemplateFiltersState>(createDefaultFilters);
  const [previewTemplate, setPreviewTemplate] = useState<AttackTemplate | null>(null);

  // -------------------------------------------------------------------------
  // Filtered Templates
  // -------------------------------------------------------------------------
  const filteredTemplates = useMemo(
    () => filterTemplates(templates, filters),
    [templates, filters]
  );

  // -------------------------------------------------------------------------
  // Template Counts
  // -------------------------------------------------------------------------
  const templateCounts = useMemo(
    () => ({
      byOwasp: countByOwasp(templates),
      bySource: countBySource(templates),
      total: templates.length,
      filtered: filteredTemplates.length,
    }),
    [templates, filteredTemplates]
  );

  // -------------------------------------------------------------------------
  // Selection Summary
  // -------------------------------------------------------------------------
  const selectionSummary = useMemo(() => {
    const selectedTemplates = templates.filter((t) => selectedTemplateIds.has(t.id));
    const owaspCoverage = new Set<string>();
    let totalSeverity = 0;

    for (const template of selectedTemplates) {
      totalSeverity += template.severity;
      for (const code of template.owasp_categories) {
        owaspCoverage.add(code);
      }
    }

    return {
      count: selectedTemplates.length,
      owaspCoverage: owaspCoverage.size,
      avgSeverity: selectedTemplates.length > 0 ? totalSeverity / selectedTemplates.length : 0,
    };
  }, [templates, selectedTemplateIds]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleSelectTemplate = useCallback(
    (id: string, selected: boolean) => {
      const newIds = new Set(selectedTemplateIds);
      if (selected) {
        if (newIds.size < MAX_SELECTION_DISPLAY) {
          newIds.add(id);
        }
      } else {
        newIds.delete(id);
      }
      onSelectionChange(newIds);
    },
    [selectedTemplateIds, onSelectionChange]
  );

  const handlePreviewTemplate = useCallback((template: AttackTemplate) => {
    setPreviewTemplate(template);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewTemplate(null);
  }, []);

  const handleSelectAll = useCallback(() => {
    const newIds = new Set(selectedTemplateIds);
    for (const template of filteredTemplates.slice(0, MAX_SELECTION_DISPLAY)) {
      newIds.add(template.id);
    }
    onSelectionChange(newIds);
  }, [filteredTemplates, selectedTemplateIds, onSelectionChange]);

  const handleDeselectAll = useCallback(() => {
    const filteredIds = new Set(filteredTemplates.map((t) => t.id));
    const newIds = new Set(
      Array.from(selectedTemplateIds).filter((id) => !filteredIds.has(id))
    );
    onSelectionChange(newIds);
  }, [filteredTemplates, selectedTemplateIds, onSelectionChange]);

  const handleClearSelection = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  // -------------------------------------------------------------------------
  // Loading State
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div
        className={cn('flex items-center justify-center py-12', className)}
        role="status"
        aria-busy="true"
        aria-label="Loading templates"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading attack templates...</span>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error State
  // -------------------------------------------------------------------------
  if (isError) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTitle>Failed to load templates</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>Unable to load attack templates. Please try again.</span>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
              Retry
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  // -------------------------------------------------------------------------
  // Empty State
  // -------------------------------------------------------------------------
  if (templates.length === 0) {
    return (
      <div className={cn('text-center py-12 space-y-4', className)}>
        <p className="text-muted-foreground">No attack templates available.</p>
        <p className="text-sm text-muted-foreground">
          Ensure the attack knowledge base is seeded with templates.
        </p>
        {onRefresh && (
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Refresh Templates
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex gap-6', className)}>
      {/* Filters Sidebar */}
      <aside className="w-64 shrink-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateFilters
              filters={filters}
              onFiltersChange={setFilters}
              templateCounts={templateCounts}
            />
          </CardContent>
        </Card>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Header with View Toggle and Selection Actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              Templates ({filteredTemplates.length})
            </h2>
            <div className="flex items-center border rounded-md">
              <Toggle
                pressed={viewMode === 'grid'}
                onPressedChange={() => setViewMode('grid')}
                className="h-8 w-8 p-0 rounded-r-none"
                aria-label="Grid view"
              >
                <Grid3X3 className="h-4 w-4" aria-hidden="true" />
              </Toggle>
              <Toggle
                pressed={viewMode === 'list'}
                onPressedChange={() => setViewMode('list')}
                className="h-8 w-8 p-0 rounded-l-none"
                aria-label="List view"
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </Toggle>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll}>
              Deselect All
            </Button>
          </div>
        </div>

        {/* Selection Summary */}
        {selectionSummary.count > 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium">
                    {selectionSummary.count} template{selectionSummary.count !== 1 ? 's' : ''}{' '}
                    selected
                  </span>
                  <Badge variant="secondary">
                    {selectionSummary.owaspCoverage}/10 OWASP categories
                  </Badge>
                  <Badge variant="secondary">
                    Avg severity: {selectionSummary.avgSeverity.toFixed(1)}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                  <X className="h-4 w-4 mr-1" aria-hidden="true" />
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Template Grid/List */}
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No templates match the current filters.
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-300px)]">
            <div
              role="list"
              aria-label="Attack templates"
              className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                  : 'space-y-2'
              )}
            >
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplateIds.has(template.id)}
                  onSelect={handleSelectTemplate}
                  onPreview={handlePreviewTemplate}
                  viewMode={viewMode}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Preview Sheet */}
      <Sheet open={previewTemplate !== null} onOpenChange={() => handleClosePreview()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {previewTemplate && (
            <>
              <SheetHeader>
                <SheetTitle>{previewTemplate.id}</SheetTitle>
                <SheetDescription>
                  Attack template details and configuration
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Metadata */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant={getSeverityBadgeVariant(previewTemplate.severity)}>
                    Severity: {previewTemplate.severity}/10
                  </Badge>
                  <Badge className={SOURCE_CONFIG[previewTemplate.source as TemplateSource]?.color}>
                    {previewTemplate.source}
                  </Badge>
                  {previewTemplate.requires_tool_access && (
                    <Badge variant="outline">Requires Tools</Badge>
                  )}
                  {previewTemplate.requires_memory_access && (
                    <Badge variant="outline">Requires Memory</Badge>
                  )}
                </div>

                {/* OWASP Categories */}
                <div>
                  <h4 className="text-sm font-medium mb-2">OWASP Categories</h4>
                  <div className="space-y-2">
                    {previewTemplate.owasp_categories.map((code) => {
                      const category = OWASP_CATEGORY_MAP[code];
                      return (
                        <div key={code} className="text-sm">
                          <span className="font-medium">{code}</span>
                          {category && (
                            <>
                              {' - '}
                              {category.name}
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {category.shortDescription}
                              </p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Prompt */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Prompt</h4>
                  <pre className="p-3 bg-muted rounded-md text-xs whitespace-pre-wrap font-mono overflow-x-auto">
                    {escapeHtml(previewTemplate.prompt)}
                  </pre>
                </div>

                {/* Expected Behavior */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Expected Agent Behavior</h4>
                  <p className="text-sm text-muted-foreground">
                    {escapeHtml(previewTemplate.expected_behavior) || 'Not specified'}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant={selectedTemplateIds.has(previewTemplate.id) ? 'secondary' : 'default'}
                    className="flex-1"
                    onClick={() => {
                      handleSelectTemplate(
                        previewTemplate.id,
                        !selectedTemplateIds.has(previewTemplate.id)
                      );
                    }}
                  >
                    {selectedTemplateIds.has(previewTemplate.id)
                      ? 'Remove from Selection'
                      : 'Add to Selection'}
                  </Button>
                  <Button variant="outline" onClick={handleClosePreview}>
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export const TemplateSelector = memo(TemplateSelectorComponent);
