'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

interface GuideStepProps {
  id: string
  title: string
  description: string
  isCompleted: boolean
  onToggle: (completed: boolean) => void
  className?: string
}

export function GuideStep({
  id,
  title,
  description,
  isCompleted,
  onToggle,
  className,
}: GuideStepProps) {
  const checkboxId = `guide-step-${id}`
  const labelId = `${checkboxId}-label`
  const descriptionId = `${checkboxId}-description`

  return (
    <div
      className={cn(
        'flex items-start space-x-3 p-3 rounded-lg transition-colors',
        isCompleted ? 'bg-muted/50' : 'hover:bg-muted/30',
        className
      )}
    >
      <div className="pt-0.5">
        <Checkbox
          id={checkboxId}
          checked={isCompleted}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
        />
      </div>
      <div className="flex-1 space-y-1">
        <label
          id={labelId}
          htmlFor={checkboxId}
          className={cn(
            'text-sm font-medium leading-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
            isCompleted && 'text-muted-foreground line-through'
          )}
        >
          {title}
        </label>
        <p id={descriptionId} className="text-sm text-foreground/70">
          {description}
        </p>
      </div>
    </div>
  )
}
