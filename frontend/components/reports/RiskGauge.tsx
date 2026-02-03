'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, CheckCircle, Shield, ShieldAlert } from 'lucide-react';

/**
 * Risk level classification
 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

/**
 * Get risk level from score (0-10 scale)
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score >= 1) return 'low';
  return 'none';
}

/**
 * Get risk level label
 */
export function getRiskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    case 'none':
      return 'None';
  }
}

/**
 * Get risk level color classes
 */
export function getRiskLevelColors(level: RiskLevel): {
  bg: string;
  text: string;
  border: string;
  fill: string;
} {
  switch (level) {
    case 'critical':
      return {
        bg: 'bg-red-100 dark:bg-red-900/30',
        text: 'text-red-700 dark:text-red-300',
        border: 'border-red-500',
        fill: '#dc2626',
      };
    case 'high':
      return {
        bg: 'bg-orange-100 dark:bg-orange-900/30',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-500',
        fill: '#ea580c',
      };
    case 'medium':
      return {
        bg: 'bg-yellow-100 dark:bg-yellow-900/30',
        text: 'text-yellow-700 dark:text-yellow-300',
        border: 'border-yellow-500',
        fill: '#ca8a04',
      };
    case 'low':
      return {
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-700 dark:text-blue-300',
        border: 'border-blue-500',
        fill: '#2563eb',
      };
    case 'none':
      return {
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-700 dark:text-green-300',
        border: 'border-green-500',
        fill: '#16a34a',
      };
  }
}

/**
 * Get risk level icon
 */
export function getRiskLevelIcon(level: RiskLevel): React.ReactNode {
  const iconClass = 'h-5 w-5';
  switch (level) {
    case 'critical':
      return <ShieldAlert className={cn(iconClass, 'text-red-600 dark:text-red-400')} aria-hidden="true" />;
    case 'high':
      return <AlertCircle className={cn(iconClass, 'text-orange-600 dark:text-orange-400')} aria-hidden="true" />;
    case 'medium':
      return <AlertTriangle className={cn(iconClass, 'text-yellow-600 dark:text-yellow-400')} aria-hidden="true" />;
    case 'low':
      return <Shield className={cn(iconClass, 'text-blue-600 dark:text-blue-400')} aria-hidden="true" />;
    case 'none':
      return <CheckCircle className={cn(iconClass, 'text-green-600 dark:text-green-400')} aria-hidden="true" />;
  }
}

/**
 * Props for RiskGauge component
 */
export interface RiskGaugeProps {
  /** Risk score (0-10) */
  score: number;
  /** Maximum score (default: 10) */
  maxScore?: number;
  /** Show numeric score (default: true) */
  showScore?: boolean;
  /** Show label (default: true) */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

/**
 * Risk score visualization using a semi-circular gauge
 */
export const RiskGauge = React.memo(function RiskGauge({
  score,
  maxScore = 10,
  showScore = true,
  showLabel = true,
  size = 'md',
  className,
}: RiskGaugeProps) {
  // Clamp score to valid range
  const clampedScore = Math.max(0, Math.min(score, maxScore));
  const percentage = (clampedScore / maxScore) * 100;
  const riskLevel = getRiskLevel(clampedScore);
  const colors = getRiskLevelColors(riskLevel);

  // SVG dimensions based on size
  const dimensions = useMemo(() => {
    switch (size) {
      case 'sm':
        return { width: 80, height: 50, strokeWidth: 6, fontSize: 14 };
      case 'lg':
        return { width: 160, height: 100, strokeWidth: 12, fontSize: 24 };
      case 'md':
      default:
        return { width: 120, height: 75, strokeWidth: 8, fontSize: 18 };
    }
  }, [size]);

  // Calculate arc path for the gauge
  const radius = (dimensions.width - dimensions.strokeWidth) / 2;
  const centerX = dimensions.width / 2;
  const centerY = dimensions.height - 5;

  // Arc parameters (semi-circle)
  const startAngle = Math.PI;
  const endAngle = 0;
  const arcLength = Math.PI;

  // Create the background arc path
  const createArcPath = (startPercent: number, endPercent: number): string => {
    const start = startAngle - startPercent * arcLength;
    const end = startAngle - endPercent * arcLength;

    const startX = centerX + radius * Math.cos(start);
    const startY = centerY - radius * Math.sin(start);
    const endX = centerX + radius * Math.cos(end);
    const endY = centerY - radius * Math.sin(end);

    const largeArc = endPercent - startPercent > 0.5 ? 1 : 0;

    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`;
  };

  return (
    <div
      className={cn('flex flex-col items-center', className)}
      role="img"
      aria-label={`Risk score: ${clampedScore} out of ${maxScore}, ${getRiskLevelLabel(riskLevel)} risk`}
    >
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="overflow-visible"
        aria-hidden="true"
      >
        {/* Background arc */}
        <path
          d={createArcPath(0, 1)}
          fill="none"
          stroke="currentColor"
          strokeWidth={dimensions.strokeWidth}
          strokeLinecap="round"
          className="text-muted/30"
        />

        {/* Filled arc showing score */}
        {percentage > 0 && (
          <path
            d={createArcPath(0, percentage / 100)}
            fill="none"
            stroke={colors.fill}
            strokeWidth={dimensions.strokeWidth}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        )}

        {/* Score text in center */}
        {showScore && (
          <text
            x={centerX}
            y={centerY - 8}
            textAnchor="middle"
            className={cn('font-bold', colors.text)}
            style={{ fontSize: dimensions.fontSize }}
            fill="currentColor"
          >
            {clampedScore.toFixed(1)}
          </text>
        )}
      </svg>

      {/* Label below gauge */}
      {showLabel && (
        <div className="flex items-center gap-1.5 mt-1">
          {getRiskLevelIcon(riskLevel)}
          <span className={cn('text-sm font-medium', colors.text)}>
            {getRiskLevelLabel(riskLevel)} Risk
          </span>
        </div>
      )}
    </div>
  );
});

/**
 * Props for RiskBadge component
 */
export interface RiskBadgeProps {
  /** Risk score (0-10) */
  score: number;
  /** Show numeric score (default: true) */
  showScore?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class names */
  className?: string;
}

/**
 * Compact risk badge showing level and optional score
 */
export const RiskBadge = React.memo(function RiskBadge({
  score,
  showScore = true,
  size = 'md',
  className,
}: RiskBadgeProps) {
  const clampedScore = Math.max(0, Math.min(score, 10));
  const riskLevel = getRiskLevel(clampedScore);
  const colors = getRiskLevelColors(riskLevel);

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium border-2',
        colors.bg,
        colors.text,
        colors.border,
        sizeClasses[size],
        className
      )}
    >
      <span className="flex items-center gap-1.5">
        {getRiskLevelIcon(riskLevel)}
        <span>{getRiskLevelLabel(riskLevel)}</span>
        {showScore && (
          <span className="opacity-75">({clampedScore.toFixed(1)})</span>
        )}
      </span>
    </Badge>
  );
});

/**
 * Props for RiskScoreCard component
 */
export interface RiskScoreCardProps {
  /** Maximum severity score */
  maxSeverity: number;
  /** Average severity score */
  avgSeverity: number;
  /** Total number of violations */
  totalViolations: number;
  /** Number of categories tested */
  categoriesTested: number;
  /** Additional class names */
  className?: string;
}

/**
 * Comprehensive risk score card with gauge and stats
 */
export const RiskScoreCard = React.memo(function RiskScoreCard({
  maxSeverity,
  avgSeverity,
  totalViolations,
  categoriesTested,
  className,
}: RiskScoreCardProps) {
  const riskLevel = getRiskLevel(maxSeverity);
  const colors = getRiskLevelColors(riskLevel);

  return (
    <div
      className={cn(
        'rounded-lg border-2 p-4',
        colors.bg,
        colors.border,
        className
      )}
      role="region"
      aria-label="Risk score summary"
    >
      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Gauge */}
        <RiskGauge score={maxSeverity} size="lg" showLabel={false} />

        {/* Stats */}
        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="text-center sm:text-left">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Max Severity
            </p>
            <p className={cn('text-2xl font-bold', colors.text)}>
              {maxSeverity.toFixed(1)}/10
            </p>
          </div>
          <div className="text-center sm:text-left">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Avg Severity
            </p>
            <p className="text-2xl font-bold text-foreground">
              {avgSeverity.toFixed(1)}/10
            </p>
          </div>
          <div className="text-center sm:text-left">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Violations
            </p>
            <p className="text-2xl font-bold text-foreground">{totalViolations}</p>
          </div>
          <div className="text-center sm:text-left">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Categories Tested
            </p>
            <p className="text-2xl font-bold text-foreground">
              {categoriesTested}/10
            </p>
          </div>
        </div>
      </div>

      {/* Risk level indicator */}
      <div className="mt-4 pt-3 border-t border-current/10 flex items-center justify-center gap-2">
        {getRiskLevelIcon(riskLevel)}
        <span className={cn('font-semibold', colors.text)}>
          Overall Risk: {getRiskLevelLabel(riskLevel)}
        </span>
      </div>
    </div>
  );
});
