'use client';

import {
  AlertCircle,
  Check,
  Copy,
  Database,
  FileCode,
  Info,
  Plus,
  Shield,
  Tag,
  Wrench,
  X,
} from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
export interface TemplatePreviewProps {
  /**
   * Template to preview. Null means the preview is closed.
   */
  template: AttackTemplate | null;

  /**
   * Whether the template is already selected
   */
  isSelected?: boolean;

  /**
   * Callback when preview should close
   */
  onClose: () => void;

  /**
   * Callback when user wants to add/remove template from selection
   */
  onToggleSelection?: (id: string, selected: boolean) => void;

  /**
   * Additional class names for the sheet content
   */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================
const MAX_PROMPT_DISPLAY_LENGTH = 5000;

// ============================================================================
// Sub-components
// ============================================================================
interface CopyButtonProps {
  text: string;
  label: string;
}

const CopyButton = memo(function CopyButton({ text, label }: CopyButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  }, [text]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className={cn(
              'h-8 w-8 p-0',
              status === 'error' && 'text-red-500'
            )}
            aria-label={
              status === 'copied'
                ? 'Copied to clipboard'
                : status === 'error'
                ? 'Failed to copy'
                : label
            }
          >
            {status === 'copied' ? (
              <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
            ) : status === 'error' ? (
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {status === 'copied' ? 'Copied!' : status === 'error' ? 'Failed to copy' : label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const Section = memo(function Section({ title, icon, children, className }: SectionProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================
function TemplatePreviewComponent({
  template,
  isSelected = false,
  onClose,
  onToggleSelection,
  className,
}: TemplatePreviewProps) {
  const handleAddToSelection = useCallback(() => {
    if (template && onToggleSelection) {
      onToggleSelection(template.id, !isSelected);
    }
  }, [template, isSelected, onToggleSelection]);

  if (!template) {
    return null;
  }

  const sourceConfig = SOURCE_CONFIG[template.source as TemplateSource] || SOURCE_CONFIG.Custom;

  // Truncate extremely long prompts for display
  const displayPrompt =
    template.prompt.length > MAX_PROMPT_DISPLAY_LENGTH
      ? `${template.prompt.slice(0, MAX_PROMPT_DISPLAY_LENGTH)}...`
      : template.prompt;

  // Escape HTML in prompt for safe display
  const escapedPrompt = escapeHtml(displayPrompt);

  return (
    <Sheet open={template !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className={cn('w-full sm:max-w-lg flex flex-col', className)}
        aria-describedby="template-preview-description"
      >
        <SheetHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <SheetTitle className="text-lg font-semibold truncate" title={template.id}>
                {template.id}
              </SheetTitle>
              <SheetDescription id="template-preview-description">
                Attack template details and prompt content
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close preview">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Severity and Source */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant={getSeverityBadgeVariant(template.severity)}
                  className="text-sm"
                >
                  <Shield className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  <span className={getSeverityColor(template.severity)}>
                    Severity: {template.severity}/10
                  </span>
                </Badge>
              </div>
              <Badge className={cn('text-xs', sourceConfig.color)}>
                {sourceConfig.label}
              </Badge>
            </div>

            <Separator />

            {/* OWASP Categories */}
            <Section
              title="OWASP Categories"
              icon={<Tag className="h-4 w-4" aria-hidden="true" />}
            >
              <div className="flex flex-wrap gap-2">
                {template.owasp_categories.length > 0 ? (
                  template.owasp_categories.map((code) => {
                    const category = OWASP_CATEGORY_MAP[code];
                    return (
                      <TooltipProvider key={code}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="cursor-help">
                              {code}
                              {category && ` - ${category.name}`}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            {category ? (
                              <>
                                <p className="font-medium">{category.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {category.shortDescription}
                                </p>
                              </>
                            ) : (
                              <p>Unknown category</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })
                ) : (
                  <span className="text-sm text-muted-foreground">No categories assigned</span>
                )}
              </div>
            </Section>

            <Separator />

            {/* Requirements */}
            {(template.requires_tool_access || template.requires_memory_access) && (
              <>
                <Section
                  title="Requirements"
                  icon={<Info className="h-4 w-4" aria-hidden="true" />}
                >
                  <div className="flex flex-wrap gap-2">
                    {template.requires_tool_access && (
                      <Badge variant="secondary">
                        <Wrench className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        Tool Access Required
                      </Badge>
                    )}
                    {template.requires_memory_access && (
                      <Badge variant="secondary">
                        <Database className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        Memory Access Required
                      </Badge>
                    )}
                  </div>
                </Section>
                <Separator />
              </>
            )}

            {/* Expected Behavior */}
            {template.expected_behavior && (
              <>
                <Section
                  title="Expected Behavior"
                  icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
                >
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {escapeHtml(template.expected_behavior)}
                  </p>
                </Section>
                <Separator />
              </>
            )}

            {/* Prompt Content */}
            <Section
              title="Prompt Content"
              icon={<FileCode className="h-4 w-4" aria-hidden="true" />}
            >
              <div className="relative">
                <div className="absolute right-2 top-2 z-10">
                  <CopyButton text={template.prompt} label="Copy prompt" />
                </div>
                <pre
                  className="text-xs bg-muted p-4 pr-12 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-64"
                  aria-label="Prompt content"
                >
                  {escapedPrompt}
                </pre>
                {template.prompt.length > MAX_PROMPT_DISPLAY_LENGTH && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing first {MAX_PROMPT_DISPLAY_LENGTH} characters of{' '}
                    {template.prompt.length} total
                  </p>
                )}
              </div>
            </Section>
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row gap-2 sm:flex-row">
          {onToggleSelection && (
            <Button
              onClick={handleAddToSelection}
              variant={isSelected ? 'outline' : 'default'}
              className="flex-1"
            >
              {isSelected ? (
                <>
                  <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                  Selected
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  Add to Selection
                </>
              )}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export const TemplatePreview = memo(TemplatePreviewComponent);
