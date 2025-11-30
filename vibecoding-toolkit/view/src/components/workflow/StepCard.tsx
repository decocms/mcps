/**
 * StepCard Component
 *
 * Displays a workflow step with action type, name, and actions.
 * Pure presentational component using composition.
 *
 * @see docs/COMPOSITION_PATTERN_GUIDE.md
 */

import { memo } from "react";
import { Icon } from "@decocms/ui/components/icon.tsx";
import { Button } from "@decocms/ui/components/button.tsx";
import { Badge } from "@decocms/ui/components/badge.tsx";
import { cn } from "@/lib/utils";
import type { Step, StepAction } from "@/lib/workflow-types";
import {
  getStepActionType,
  getStepActionLabel,
  isCodeAction,
  isToolCallAction,
} from "@/lib/workflow-types";

// ============================================================================
// Types
// ============================================================================

interface StepCardProps {
  step: Step;
  phaseIndex: number;
  stepIndex: number;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getActionIcon(action: StepAction): string {
  const type = getStepActionType(action);
  switch (type) {
    case "tool":
      return "extension";
    case "code":
      return "code";
    case "sleep":
      return "schedule";
    case "signal":
      return "notifications";
  }
}

function getActionColor(action: StepAction): string {
  const type = getStepActionType(action);
  switch (type) {
    case "tool":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "code":
      return "bg-purple-500/10 text-purple-600 border-purple-500/20";
    case "sleep":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    case "signal":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  }
}

// ============================================================================
// Sub-components
// ============================================================================

interface StepActionBadgeProps {
  action: StepAction;
}

const StepActionBadge = memo(function StepActionBadge({
  action,
}: StepActionBadgeProps) {
  const type = getStepActionType(action);
  const icon = getActionIcon(action);
  const colorClass = getActionColor(action);

  return (
    <Badge variant="outline" className={cn("gap-1 capitalize", colorClass)}>
      <Icon name={icon} size={12} />
      {type}
    </Badge>
  );
});

interface StepPreviewProps {
  action: StepAction;
}

const StepPreview = memo(function StepPreview({ action }: StepPreviewProps) {
  if (isCodeAction(action)) {
    const preview = action.code.slice(0, 60).replace(/\n/g, " ");
    return (
      <p className="text-xs text-muted-foreground font-mono truncate">
        {preview}
        {action.code.length > 60 && "..."}
      </p>
    );
  }

  if (isToolCallAction(action)) {
    return (
      <p className="text-xs text-muted-foreground">
        Tool: <span className="font-medium">{action.toolName}</span>
      </p>
    );
  }

  return null;
});

interface StepActionsProps {
  onEdit: () => void;
  onDelete: () => void;
}

const StepActions = memo(function StepActions({
  onEdit,
  onDelete,
}: StepActionsProps) {
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="h-7 w-7"
      >
        <Icon name="edit" size={14} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
      >
        <Icon name="delete" size={14} />
      </Button>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const StepCard = memo(function StepCard({
  step,
  phaseIndex,
  stepIndex,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  className,
}: StepCardProps) {
  const label = getStepActionLabel(step.action);

  return (
    <div
      className={cn(
        "group relative p-3 rounded-lg border cursor-pointer transition-all",
        "hover:border-primary/50 hover:shadow-sm",
        isSelected && "border-primary bg-primary/5 ring-1 ring-primary/20",
        className,
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{step.name}</span>
            <StepActionBadge action={step.action} />
          </div>
          <StepPreview action={step.action} />
          {step.input && Object.keys(step.input).length > 0 && (
            <p className="text-xs text-muted-foreground">
              {Object.keys(step.input).length} input{" "}
              {Object.keys(step.input).length === 1 ? "param" : "params"}
            </p>
          )}
        </div>
        <StepActions onEdit={onEdit} onDelete={onDelete} />
      </div>

      {/* Retry indicator */}
      {step.retry && (
        <div className="absolute top-1 right-1">
          <Badge variant="outline" className="h-5 text-[10px] gap-0.5">
            <Icon name="refresh" size={10} />
            {step.retry.maxAttempts}
          </Badge>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Compact Variant
// ============================================================================

interface StepCardCompactProps {
  step: Step;
  isSelected: boolean;
  onSelect: () => void;
}

export const StepCardCompact = memo(function StepCardCompact({
  step,
  isSelected,
  onSelect,
}: StepCardCompactProps) {
  const icon = getActionIcon(step.action);
  const colorClass = getActionColor(step.action);

  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 p-2 rounded-md border text-left w-full transition-all",
        "hover:border-primary/50",
        isSelected && "border-primary bg-primary/5",
        colorClass,
      )}
      onClick={onSelect}
    >
      <Icon name={icon} size={16} />
      <span className="text-sm truncate">{step.name}</span>
    </button>
  );
});

// ============================================================================
// Skeleton Component
// ============================================================================

export function StepCardSkeleton() {
  return (
    <div className="p-3 rounded-lg border animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 bg-muted rounded w-32" />
            <div className="h-5 bg-muted rounded w-16" />
          </div>
          <div className="h-4 bg-muted rounded w-48" />
        </div>
      </div>
    </div>
  );
}
