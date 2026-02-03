'use client';

import { Check, Database, Eye, Wrench } from 'lucide-react';
import { useCallback, memo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AttackTemplate,
  OWASP_CATEGORY_MAP,
  SOURCE_CONFIG,
  getSeverityBadgeVariant,
  getSeverityColor,
  TemplateSource,
} from '@/data/owasp-categories';
import { cn, escapeHtml } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================
export interface TemplateCardProps {
  template: AttackTemplate;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onPreview: (template: AttackTemplate) => void;
  viewMode: 'grid' | 'list';
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================
const PROMPT_PREVIEW_LENGTH = 150;

// ============================================================================
// Helpers
// ============================================================================
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

// ============================================================================
// Component
// ============================================================================
function TemplateCardComponent({
  template,
  isSelected,
  onSelect,
  onPreview,
  viewMode,
  className,
}: TemplateCardProps) {
  const handleSelectChange = useCallback(
    (checked: boolean | 'indeterminate') => {
      onSelect(template.id, checked === true);
    },
    [template.id, onSelect]
  );

  const handlePreviewClick = useCallback(() => {
    onPreview(template);
  }, [template, onPreview]);

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't toggle if clicking on buttons or checkbox
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('[role="checkbox"]') ||
        target.closest('label')
      ) {
        return;
      }
      onSelect(template.id, !isSelected);
    },
    [template.id, isSelected, onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(template.id, !isSelected);
      }
    },
    [template.id, isSelected, onSelect]
  );

  const promptPreview = truncateText(escapeHtml(template.prompt), PROMPT_PREVIEW_LENGTH);
  const sourceConfig = SOURCE_CONFIG[template.source as TemplateSource] || SOURCE_CONFIG.Custom;

  if (viewMode === 'list') {
    return (
      <div
        role="listitem"
        aria-selected={isSelected}
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex items-center gap-4 p-4 border rounded-lg transition-colors cursor-pointer',
          'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isSelected && 'bg-accent border-primary',
          className
        )}
      >
        <Checkbox
          id={`template-${template.id}`}
          checked={isSelected}
          onCheckedChange={handleSelectChange}
          aria-label={`Select template ${template.id}`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{template.id}</span>
            <Badge variant={getSeverityBadgeVariant(template.severity)} className="shrink-0">
              {template.severity}/10
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground truncate mt-1">{promptPreview}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {template.owasp_categories.slice(0, 2).map((code) => (
            <TooltipProvider key={code}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs">
                    {code}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{OWASP_CATEGORY_MAP[code]?.name || code}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
          {template.owasp_categories.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{template.owasp_categories.length - 2}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {template.requires_tool_access && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="p-1 rounded text-muted-foreground">
                    <Wrench className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Requires tool access</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Requires Tool Access</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {template.requires_memory_access && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="p-1 rounded text-muted-foreground">
                    <Database className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Requires memory access</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Requires Memory Access</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handlePreviewClick}
          aria-label={`Preview template ${template.id}`}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  // Grid view
  return (
    <Card
      role="listitem"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative transition-colors cursor-pointer',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected && 'bg-accent border-primary',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Checkbox
              id={`template-grid-${template.id}`}
              checked={isSelected}
              onCheckedChange={handleSelectChange}
              aria-label={`Select template ${template.id}`}
            />
            <CardTitle className="text-sm font-medium truncate">{template.id}</CardTitle>
          </div>
          <Badge variant={getSeverityBadgeVariant(template.severity)} className="shrink-0">
            <span className={cn('font-semibold', getSeverityColor(template.severity))}>
              {template.severity}/10
            </span>
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground line-clamp-2">{promptPreview}</p>

        <div className="flex flex-wrap gap-1">
          {template.owasp_categories.slice(0, 3).map((code) => (
            <TooltipProvider key={code}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs">
                    {code}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{OWASP_CATEGORY_MAP[code]?.name || code}</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    {OWASP_CATEGORY_MAP[code]?.shortDescription}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
          {template.owasp_categories.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{template.owasp_categories.length - 3}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={cn('text-xs', sourceConfig.color)}>{sourceConfig.label}</Badge>
            {template.requires_tool_access && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="p-1 rounded text-muted-foreground">
                      <Wrench className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">Requires tool access</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Requires Tool Access</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {template.requires_memory_access && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="p-1 rounded text-muted-foreground">
                      <Database className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">Requires memory access</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Requires Memory Access</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreviewClick}
            aria-label={`Preview template ${template.id}`}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {isSelected && (
          <div className="absolute top-2 right-2">
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const TemplateCard = memo(TemplateCardComponent);
