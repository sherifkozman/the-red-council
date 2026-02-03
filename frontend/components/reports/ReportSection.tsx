'use client';

import React, { useCallback, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, LucideIcon } from 'lucide-react';

/**
 * Report section ID type for navigation
 */
export type ReportSectionId =
  | 'executive-summary'
  | 'risk-score'
  | 'owasp-findings'
  | 'recommendations'
  | 'event-analysis';

/**
 * Props for ReportSection component
 */
export interface ReportSectionProps {
  /** Section identifier for navigation */
  id: ReportSectionId;
  /** Section title */
  title: string;
  /** Optional section icon */
  icon?: LucideIcon;
  /** Whether the section starts expanded */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Callback when section expansion changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Whether the section is collapsible (default: true) */
  collapsible?: boolean;
  /** Section content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
  /** Whether this section is highlighted (e.g., from navigation) */
  highlighted?: boolean;
  /** Print-friendly mode removes interactive elements */
  printMode?: boolean;
}

/**
 * Collapsible report section component
 */
export const ReportSection = React.memo(function ReportSection({
  id,
  title,
  icon: Icon,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onExpandedChange,
  collapsible = true,
  children,
  className,
  highlighted = false,
  printMode = false,
}: ReportSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  // Use controlled or uncontrolled state
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (controlledExpanded === undefined) {
        setInternalExpanded(open);
      }
      onExpandedChange?.(open);
    },
    [controlledExpanded, onExpandedChange]
  );

  // Generate unique IDs for accessibility
  const headingId = useId();
  const contentId = useId();

  // In print mode, always show content without collapsible wrapper
  if (printMode) {
    return (
      <section
        id={id}
        aria-labelledby={headingId}
        className={cn('scroll-mt-4', className)}
      >
        <Card className="print:shadow-none print:border-gray-300">
          <CardHeader className="pb-2">
            <CardTitle
              id={headingId}
              className="flex items-center gap-2 text-lg font-semibold"
            >
              {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </section>
    );
  }

  // Non-collapsible section
  if (!collapsible) {
    return (
      <section
        id={id}
        aria-labelledby={headingId}
        className={cn(
          'scroll-mt-4 transition-all duration-200',
          highlighted && 'ring-2 ring-primary ring-offset-2',
          className
        )}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle
              id={headingId}
              className="flex items-center gap-2 text-lg font-semibold"
            >
              {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-4 transition-all duration-200',
        highlighted && 'ring-2 ring-primary ring-offset-2',
        className
      )}
    >
      <Collapsible open={isExpanded} onOpenChange={handleOpenChange}>
        <Card>
          <CardHeader className="pb-2">
            <CollapsibleTrigger asChild>
              <button
                className="flex w-full items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
                aria-expanded={isExpanded}
                aria-controls={contentId}
              >
                <CardTitle
                  id={headingId}
                  className="flex items-center gap-2 text-lg font-semibold"
                >
                  {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
                  {title}
                </CardTitle>
                <span
                  className="p-1 rounded-md hover:bg-muted/50 transition-colors"
                  aria-hidden="true"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </span>
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent id={contentId}>
            <CardContent>{children}</CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </section>
  );
});

/**
 * Props for section navigation item
 */
export interface SectionNavItemProps {
  /** Section ID to navigate to */
  sectionId: ReportSectionId;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: LucideIcon;
  /** Whether this is the active section */
  isActive?: boolean;
  /** Click handler */
  onClick?: (sectionId: ReportSectionId) => void;
}

/**
 * Navigation item for section sidebar
 */
export const SectionNavItem = React.memo(function SectionNavItem({
  sectionId,
  label,
  icon: Icon,
  isActive = false,
  onClick,
}: SectionNavItemProps) {
  const handleClick = useCallback(() => {
    onClick?.(sectionId);
  }, [onClick, sectionId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(sectionId);
      }
    },
    [onClick, sectionId]
  );

  return (
    <li>
      <a
        href={`#${sectionId}`}
        onClick={(e) => {
          e.preventDefault();
          handleClick();
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
          'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isActive
            ? 'bg-muted font-medium text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        )}
        aria-current={isActive ? 'location' : undefined}
      >
        {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
        <span>{label}</span>
      </a>
    </li>
  );
});

/**
 * Section configuration type
 */
export interface SectionConfig {
  id: ReportSectionId;
  label: string;
  icon?: LucideIcon;
}
